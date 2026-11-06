/**
 * 生成したスライドが枠からはみ出していないかを、ビルド済みのページをブラウザで開いて確かめる。
 *
 *   pnpm astro build && pnpm test:slides:layout
 *
 * dist/client/slides 以下のすべてのデッキを、すべてのプリセット・2 つの画面サイズで開き、
 * 各スライドの中身がスライドの枠内に収まっているか（スクロールが出ていないか）を調べる。
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, relative, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { type Browser, type Page, chromium } from 'playwright';
import { slideThemes } from '@infixer/core/schema';

const root = resolve(import.meta.dirname, '../dist/client');
const slidesDir = join(root, 'slides');

const viewports = [
  { width: 1280, height: 720 },
  { width: 800, height: 600 },
];

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
};

function findDecks(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findDecks(path);
    return name === 'index.html'
      ? [`/${relative(root, dir).split('\\').join('/')}/`]
      : [];
  });
}

/** dist/client をそのまま配る */
function serve(): Promise<Server> {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    let file = join(root, pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory())
      file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

interface Overflow {
  slide: number;
  element: string;
  detail: string;
}

/**
 * 開いているページの全スライドを調べ、はみ出している要素を返す。
 * runtime のはみ出し判定とは独立に、次の 3 つで確かめる。
 * - ブロック要素（リスト項目・表・画像など）の矩形が、スライドの本文領域
 *   （.slide-inner の padding の内側）や、それを囲む .body・.block の外に出ていないか
 * - スクロールや切り取りが起きる要素（pre など）の中身がその要素に収まっているか
 * - 位置を指定した要素（表紙の自己紹介など）がスライドの枠の外に出ていないか
 * 文字の字形が行の高さを少し超える程度のものは、ブロックの矩形で見るので拾わない。
 */
function findOverflows(page: Page): Promise<Overflow[]> {
  return page.evaluate(() => {
    const tolerance = 1;
    const found: { slide: number; element: string; detail: string }[] = [];
    const describe = (el: Element) => {
      const cls = [...el.classList].slice(0, 2).join('.');
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}> "${text}"`;
    };
    const isBlockish = (el: Element, style: CSSStyleDeclaration) =>
      style.display !== 'none' &&
      (!style.display.startsWith('inline') ||
        el.matches('img, iframe, svg, video') ||
        style.display === 'inline-block' ||
        style.display === 'inline-flex');
    const contentBox = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const px = (v: string) => Number.parseFloat(v) || 0;
      return {
        top: rect.top + px(style.borderTopWidth) + px(style.paddingTop),
        left: rect.left + px(style.borderLeftWidth) + px(style.paddingLeft),
        bottom: rect.bottom - px(style.borderBottomWidth) - px(style.paddingBottom),
        right: rect.right - px(style.borderRightWidth) - px(style.paddingRight),
      };
    };
    const outside = (
      rect: DOMRect,
      box: { top: number; left: number; bottom: number; right: number },
    ) => {
      const parts = [
        box.top - rect.top,
        rect.right - box.right,
        rect.bottom - box.bottom,
        box.left - rect.left,
      ].map((d) => Math.round(d));
      return parts.some((d) => d > tolerance) ? parts : undefined;
    };

    const slides = [...document.querySelectorAll<HTMLElement>('.deck > .slide')];
    slides.forEach((slide, index) => {
      const report = (el: Element, detail: string) =>
        found.push({ slide: index + 1, element: describe(el), detail });
      const frame = slide.getBoundingClientRect();
      const inner = slide.querySelector<HTMLElement>('.slide-inner')!;
      const containers = [
        inner,
        ...inner.querySelectorAll<HTMLElement>('.body, .block'),
      ];
      const reported = new Set<Element>();

      for (const el of inner.querySelectorAll<HTMLElement>('*')) {
        if (el.closest('.notes') || el.closest('svg') !== null && el.tagName !== 'svg') continue;
        const style = getComputedStyle(el);
        if (!isBlockish(el, style)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        // 位置を指定した要素とその中身は、スライドの枠に収まっていればよい
        const positioned = el.closest<HTMLElement>('.profile');
        if (positioned) {
          const over = outside(rect, frame);
          if (over) report(el, `スライドの枠の外に出ている（上右下左 ${over.join(' ')}px）`);
          continue;
        }

        // スクロールや切り取りが起きる要素は中身が収まっているか
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          const dx = el.scrollWidth - el.clientWidth;
          const dy = el.scrollHeight - el.clientHeight;
          if (dx > tolerance || dy > tolerance) {
            report(el, `中身が横 ${dx}px・縦 ${dy}px 収まっていない（スクロール・切り取り）`);
            reported.add(el);
          }
        }

        // 囲んでいる本文領域・.body・.block の外に出ていないか（いちばん内側だけ報告する）
        if ([...reported].some((r) => r.contains(el))) continue;
        for (const container of containers.filter((c) => c !== el && c.contains(el)).reverse()) {
          const over = outside(rect, container === inner ? contentBox(inner) : container.getBoundingClientRect());
          if (over) {
            report(el, `${describe(container).split(' ')[0]} の外に出ている（上右下左 ${over.join(' ')}px）`);
            reported.add(el);
            break;
          }
        }
      }
    });
    return found;
  });
}

interface LowContrast {
  slide: number;
  element: string;
  ratio: number;
  required: number;
  colors: string;
}

/**
 * 全スライドの文字について、文字色とその下の背景色のコントラスト比を調べる（WCAG 2.x の式）。
 * 背景は祖先の background-color を重ね、グラデーションの背景は --bg-solid（いちばん明るい色）で代用する。
 * 大きな文字（24px 以上、または 18.66px 以上の太字）は 3:1、それ以外は 4.5:1 を求める。
 */
function findLowContrast(page: Page): Promise<LowContrast[]> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    type RGBA = [number, number, number, number];
    const toRGBA = (color: string): RGBA => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const a = top[3];
      return [
        top[0] * a + bottom[0] * (1 - a),
        top[1] * a + bottom[1] * (1 - a),
        top[2] * a + bottom[2] * (1 - a),
        1,
      ];
    };
    const luminance = ([r, g, b]: RGBA) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratioOf = (a: RGBA, b: RGBA) => {
      const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const hex = (c: RGBA) =>
      '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

    const found: LowContrast[] = [];
    const slides = [...document.querySelectorAll<HTMLElement>('.deck > .slide')];
    slides.forEach((slide, index) => {
      const base = toRGBA(
        getComputedStyle(slide).getPropertyValue('--bg-solid').trim() || '#fff',
      );
      const backgroundOf = (el: HTMLElement): RGBA => {
        const layers: RGBA[] = [];
        for (let node: HTMLElement | null = el; node && node !== slide.parentElement; node = node.parentElement) {
          const style = getComputedStyle(node);
          // スライド自体の背景（グラデーションのことがある）は --bg-solid で代用する
          if (node === slide) break;
          const color = toRGBA(style.backgroundColor);
          if (color[3] > 0) layers.push(color);
          if (color[3] === 1) break;
        }
        return layers.reduceRight<RGBA>((acc, layer) => over(layer, acc), base);
      };
      for (const el of slide.querySelectorAll<HTMLElement>('.slide-inner *')) {
        const hasText = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '',
        );
        if (!hasText) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none') continue;
        const bg = backgroundOf(el);
        const fg = over(toRGBA(style.color), bg);
        const size = Number.parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        const required = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
        const ratio = ratioOf(fg, bg);
        if (ratio + 0.005 < required) {
          const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
          found.push({
            slide: index + 1,
            element: `<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}> "${text}"`,
            ratio: Math.round(ratio * 100) / 100,
            required,
            colors: `${hex(fg)} / ${hex(bg)}`,
          });
        }
      }
    });
    return found;
  });
}

const decks = findDecks(slidesDir);

describe('スライドのはみ出し', { skip: decks.length === 0 && 'dist/client/slides がありません。先に pnpm astro build を実行してください' }, () => {
  let server: Server;
  let browser: Browser;
  let origin: string;

  before(async () => {
    server = await serve();
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    server?.close();
  });

  async function open(
    path: string,
    viewport = viewports[0],
    colorScheme: 'light' | 'dark' = 'light',
  ) {
    const context = await browser.newContext({
      viewport,
      colorScheme,
      // 登場アニメーション中の移動をはみ出しと見なさないように、動きを止めて測る
      reducedMotion: 'reduce',
    });
    // tsx（esbuild）が関数に付ける __name をブラウザ側でも使えるようにする
    await context.addInitScript('globalThis.__name = (fn) => fn');
    const page = await context.newPage();
    await page.goto(`${origin}${path}`);
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('is-ready'),
    );
    await page.evaluate(() => document.fonts.ready);
    // フォント読み込み後の再調整を待つ
    await page.waitForTimeout(100);
    return { page, close: () => context.close() };
  }

  for (const deck of decks) {
    for (const theme of slideThemes) {
      for (const viewport of viewports) {
        test(`${deck} ${theme} ${viewport.width}x${viewport.height}`, async () => {
          const { page, close } = await open(`${deck}?theme=${theme}`, viewport);
          try {
            const overflows = await findOverflows(page);
            assert.deepEqual(
              overflows,
              [],
              overflows
                .map((o) => `スライド ${o.slide}: ${o.element} ${o.detail}`)
                .join('\n'),
            );
          } finally {
            await close();
          }
        });
      }
    }
  }

  for (const deck of decks) {
    for (const theme of slideThemes) {
      for (const scheme of ['light', 'dark'] as const) {
        test(`コントラスト比 ${deck} ${theme} ${scheme}`, async () => {
          const { page, close } = await open(
            `${deck}?theme=${theme}`,
            viewports[0],
            scheme,
          );
          try {
            const low = await findLowContrast(page);
            assert.deepEqual(
              low,
              [],
              low
                .map(
                  (l) =>
                    `スライド ${l.slide}: ${l.element} ${l.ratio}:1（${l.required}:1 以上が必要） ${l.colors}`,
                )
                .join('\n'),
            );
          } finally {
            await close();
          }
        });
      }
    }
  }

  test('コントラスト比の低い文字を検出できる', async () => {
    const { page, close } = await open(`${decks[0]}?theme=simple`);
    try {
      await page.evaluate(() => {
        const inner = document.querySelectorAll('.deck > .slide')[1].querySelector('.slide-inner')!;
        inner.insertAdjacentHTML(
          'beforeend',
          '<p style="color:#999">薄い文字</p><p style="background:#333;color:#555">暗い背景の暗い文字</p><h2 class="heading" style="color:#888">大きな文字</h2>',
        );
      });
      const low = await findLowContrast(page);
      assert.deepEqual(
        low.map((l) => [l.element, l.required]),
        [
          ['<p> "薄い文字"', 4.5],
          ['<p> "暗い背景の暗い文字"', 4.5],
        ],
      );
    } finally {
      await close();
    }
  });

  test('操作バーでデザインを選ぶと切り替わり、URL に残る', async () => {
    const { page, close } = await open(decks[0]);
    try {
      const initial = await page.evaluate(() => document.documentElement.dataset.theme);
      const other = slideThemes.find((t) => t !== initial)!;
      await page.selectOption('[data-theme-select]', other);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), other);
      assert.equal(new URL(page.url()).searchParams.get('theme'), other);
      // 再読み込みしても選んだデザインのまま
      await page.reload();
      await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'));
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), other);
      assert.equal(await page.inputValue('[data-theme-select]'), other);
      // 記事の既定に戻すと ?theme= は外れる
      await page.selectOption('[data-theme-select]', initial!);
      assert.equal(new URL(page.url()).searchParams.has('theme'), false);
    } finally {
      await close();
    }
  });

  describe('はみ出したとき', () => {
    const longText = 'とても長い説明文がスライドに入っている。'.repeat(8);

    async function injectAndRefit(page: Page, html: string) {
      await page.evaluate((html) => {
        const slide = document.querySelectorAll<HTMLElement>('.deck > .slide')[1];
        slide.querySelector('.slide-inner')!.innerHTML =
          `<h2 class="heading">差し込んだスライド</h2><div class="body">${html}</div>`;
        // 画面サイズの変化と同じく再調整させる
        window.dispatchEvent(new Event('resize'));
      }, html);
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const slide = document.querySelectorAll<HTMLElement>('.deck > .slide')[1];
        return {
          fit: Number(slide.style.getPropertyValue('--fit') || 1),
          overflow: slide.hasAttribute('data-overflow'),
        };
      });
    }

    test('少しはみ出す量なら文字を縮めて収める', async () => {
      const { page, close } = await open(decks[0]);
      try {
        const items = Array.from({ length: 4 }, (_, i) => `<li>項目${i + 1}<ul><li>${longText}</li></ul></li>`).join('');
        const result = await injectAndRefit(page, `<div class="block block-list"><ul>${items}</ul></div>`);
        assert.ok(result.fit < 1, `縮めていない（--fit: ${result.fit}）`);
        assert.equal(result.overflow, false);
        const overflows = (await findOverflows(page)).filter((o) => o.slide === 2);
        assert.deepEqual(overflows, []);
      } finally {
        await close();
      }
    });

    test('縮めても収まらないときは data-overflow で印を付けて警告する', async () => {
      const { page, close } = await open(decks[0]);
      const warnings: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning') warnings.push(message.text());
      });
      try {
        const items = Array.from({ length: 30 }, (_, i) => `<li>項目${i + 1}<ul><li>${longText}</li></ul></li>`).join('');
        const result = await injectAndRefit(page, `<div class="block block-list"><ul>${items}</ul></div>`);
        assert.equal(result.overflow, true);
        assert.ok(
          warnings.some((w) => w.includes('はみ出')),
          `警告が出ていない: ${warnings.join(' / ')}`,
        );
      } finally {
        await close();
      }
    });

    test('収まる中身は縮めない', async () => {
      const { page, close } = await open(decks[0]);
      try {
        const result = await injectAndRefit(page, '<div class="block block-list"><ul><li>短い項目</li></ul></div>');
        assert.equal(result.fit, 1);
        assert.equal(result.overflow, false);
      } finally {
        await close();
      }
    });
  });
});
