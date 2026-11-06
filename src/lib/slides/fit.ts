/**
 * スライドの中身が枠からはみ出さないように、文字の大きさを調整する。
 *
 * - スライドの文字の大きさはすべて `--fit`（既定 1）を掛けて決めている（slides.css）
 * - はみ出すスライドだけ、収まる最大の `--fit` を二分探索で探す（MIN_FIT まで）
 * - MIN_FIT でも収まらなければ `data-overflow` を付けて console.warn する。
 *   記事側で `---` を入れてスライドを分けるなどの対応が要る
 *
 * 測るときはスライドを複製し、アニメーションを止めて全項目を出した状態で測る
 * （表示中のスライドのアニメーションを止めたり、やり直したりしないため）。
 */

export const MIN_FIT = 0.6;
const PRECISION = 0.02;
const TOLERANCE = 1;

/** 中身が .slide-inner（の padding の内側）・.body・.block に収まっていなければ true */
export function overflows(inner: HTMLElement): boolean {
  const containers = [
    inner,
    ...inner.querySelectorAll<HTMLElement>('.body, .block'),
  ];
  for (const container of containers) {
    const style = getComputedStyle(container);
    const box = container.getBoundingClientRect();
    const bottom =
      container === inner
        ? box.bottom -
          Number.parseFloat(style.paddingBottom) -
          Number.parseFloat(style.borderBottomWidth)
        : box.bottom;
    const right =
      container === inner
        ? box.right -
          Number.parseFloat(style.paddingRight) -
          Number.parseFloat(style.borderRightWidth)
        : box.right;
    for (const child of container.children) {
      if (child.matches('.profile, .notes')) continue;
      const rect = child.getBoundingClientRect();
      if (rect.bottom > bottom + TOLERANCE || rect.right > right + TOLERANCE) {
        return true;
      }
    }
  }
  // スクロール・切り取りが起きる要素（コード・X のポスト・生 HTML・表など）
  for (const el of inner.querySelectorAll<HTMLElement>('*')) {
    const style = getComputedStyle(el);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') {
      // 折り返せない長い文字列（URL など）で横にはみ出していないか
      if (
        style.display !== 'none' &&
        !style.display.startsWith('inline') &&
        el.scrollWidth - el.clientWidth > TOLERANCE
      ) {
        return true;
      }
      continue;
    }
    if (
      el.scrollHeight - el.clientHeight > TOLERANCE ||
      el.scrollWidth - el.clientWidth > TOLERANCE
    ) {
      return true;
    }
  }
  return false;
}

export interface FitResult {
  fit: number;
  overflow: boolean;
}

/** 1 枚のスライドに収まる --fit を探す（slide 自体は書き換えない） */
export function measureFit(slide: HTMLElement): FitResult {
  const clone = slide.cloneNode(true) as HTMLElement;
  clone.classList.add('is-active', 'is-static', 'is-measuring');
  clone.classList.remove('is-past');
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  clone.style.visibility = 'hidden';
  clone
    .querySelectorAll('iframe')
    .forEach((iframe) => iframe.removeAttribute('src'));
  clone
    .querySelectorAll('[data-step]')
    .forEach((item) => item.classList.add('is-shown'));
  slide.after(clone);

  const inner = clone.querySelector<HTMLElement>('.slide-inner')!;
  const fitsAt = (fit: number) => {
    clone.style.setProperty('--fit', String(fit));
    return !overflows(inner);
  };

  try {
    if (fitsAt(1)) return { fit: 1, overflow: false };
    if (!fitsAt(MIN_FIT)) return { fit: MIN_FIT, overflow: true };
    let low = MIN_FIT;
    let high = 1;
    while (high - low > PRECISION) {
      const mid = (low + high) / 2;
      if (fitsAt(mid)) low = mid;
      else high = mid;
    }
    return { fit: Math.floor(low * 100) / 100, overflow: false };
  } finally {
    clone.remove();
  }
}

/** すべてのスライドに --fit を設定する。収まらないスライドの番号（1 始まり）を返す */
export function fitSlides(slides: HTMLElement[]): number[] {
  const results = slides.map(measureFit);
  const overflowed: number[] = [];
  results.forEach(({ fit, overflow }, index) => {
    const slide = slides[index];
    if (fit === 1) slide.style.removeProperty('--fit');
    else slide.style.setProperty('--fit', String(fit));
    slide.toggleAttribute('data-overflow', overflow);
    if (overflow) overflowed.push(index + 1);
  });
  if (overflowed.length > 0) {
    console.warn(
      `スライド ${overflowed.join(', ')} は文字を ${MIN_FIT * 100}% まで縮めてもはみ出しています。記事に --- を入れてスライドを分けてください。`,
    );
  }
  return overflowed;
}
