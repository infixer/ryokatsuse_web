import type { BlogReference, SlidesOptions } from '@infixer/core/schema';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import { toHtml } from 'hast-util-to-html';
import type { Code, Image, Paragraph, Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { toHast } from 'mdast-util-to-hast';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';
import { mdxjs } from 'micromark-extension-mdxjs';
import {
  type BundledLanguage,
  type Highlighter,
  bundledLanguages,
  createHighlighter,
} from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * ブログ本文（= スピーカーノート）からスライドを組み立てる。
 *
 * 変換ルール
 * - `##` が章、`###` 以下が章の中のスライドになる。`---` は同じ見出しのままスライドを分ける
 * - 段落はスピーカーノート。それ以外（リスト・コード・画像・引用・表・リンクカード・
 *   YouTube などの iframe・X のポスト・生 HTML）は記事に載っているものとしてスライドにも出す
 * - コード・画像・表・埋め込みは 1 枚に 1 つまで。2 つ目が来たら次のスライドに送る
 * - リストとコード・画像・表・埋め込みも同じスライドに載せない（どちらも場所を取り、はみ出しやすい）
 * - スライドに出すものがない見出しは、段落中の **太字** をキーメッセージとして大きく出す
 * - `<Cite id="..." />` は記事と同じ番号の [n]（参照先へのリンク）にし、そのスライドの下に出典を出す。
 *   frontmatter の references があれば、最後のスライドの前に参照一覧のスライドを付ける
 */

export type SlideLayout =
  | 'title'
  | 'section'
  | 'statement'
  | 'bullets'
  | 'code'
  | 'image'
  | 'quote'
  | 'table'
  | 'embed'
  | 'content'
  | 'references'
  | 'end';

export interface Slide {
  layout: SlideLayout;
  /** スライドの見出し */
  heading?: string;
  /** 見出しの上に小さく出す章タイトル */
  kicker?: string;
  /** スライド本体の HTML */
  bodyHtml: string;
  /** スピーカーノートの HTML */
  notesHtml: string;
  /** スライドの下に小さく出す出典（本文・ノートの <Cite> が指す参照）の HTML */
  sourcesHtml?: string;
  /** 1 つずつ表示する項目の数（steps 有効時のみ 1 以上） */
  steps: number;
}

export interface Deck {
  title: string;
  subtitle?: string;
  event?: string;
  date?: string;
  theme: SlidesOptions['theme'];
  slides: Slide[];
}

export interface BuildDeckInput {
  /** frontmatter を除いた本文 */
  body: string;
  /** MDX として読むか */
  mdx: boolean;
  title: string;
  description?: string;
  publishDate?: string;
  options: SlidesOptions;
  /** 最後のスライドに出す記事の URL */
  postUrl?: string;
  /** frontmatter の references。<Cite> の番号と参照一覧のスライドに使う */
  references?: BlogReference[];
}

/** <Cite> を置き換えたノードに持たせる参照の情報 */
interface Citation {
  n: number;
  title: string;
  url: string;
}

/** スライドに出すブロック（段落以外） */
type VisibleKind =
  | 'list'
  | 'code'
  | 'image'
  | 'quote'
  | 'table'
  | 'card'
  | 'embed'
  | 'tweet'
  | 'html';
interface VisibleBlock {
  kind: VisibleKind;
  node: RootContent;
  /** embed / tweet / html は本文の HTML から組み立てたものを持つ */
  html?: string;
}

interface Draft {
  heading?: string;
  kicker?: string;
  /** 見出しの直後に下位見出しが続いたか（章扉になる） */
  isSectionHead: boolean;
  visible: VisibleBlock[];
  notes: RootContent[];
}

const HEAVY: ReadonlySet<VisibleKind> = new Set([
  'code',
  'image',
  'table',
  'embed',
  'tweet',
  'html',
]);

export async function buildDeck(input: BuildDeckInput): Promise<Deck> {
  const tree = parse(input.body, input.mdx);
  const references = input.references ?? [];
  replaceCites(tree, references);
  const drafts = splitIntoDrafts(tree.children, input.body);
  const { options } = input;

  const slides: Slide[] = [];
  const intro = drafts[0]?.heading === undefined ? drafts.shift() : undefined;

  slides.push({
    layout: 'title',
    heading: options.title ?? input.title,
    bodyHtml: '',
    // 最初の見出しより前の段落は表紙のノートにする。
    // ただし表示するもの（動画など）があれば、そのスライドのノートにする
    notesHtml:
      intro && intro.visible.length === 0
        ? await renderBlocks(intro.notes)
        : '',
    steps: 0,
  });
  if (intro && intro.visible.length > 0) {
    slides.push(await toSlide(intro, options));
  }
  for (const draft of drafts) {
    slides.push(await toSlide(draft, options));
  }
  if (references.length > 0) {
    slides.push(referencesSlide(references));
  }
  slides.push({
    layout: 'end',
    heading: 'ありがとうございました',
    bodyHtml: input.postUrl
      ? `<p class="end-link">スピーカーノート全文は<a href="${escapeAttr(input.postUrl)}">ブログ記事</a>で読めます</p>`
      : '',
    notesHtml: '',
    steps: 0,
  });

  return {
    title: options.title ?? input.title,
    subtitle: options.subtitle ?? input.description,
    event: options.event,
    date: options.date ?? input.publishDate,
    theme: options.theme,
    slides,
  };
}

function parse(body: string, mdx: boolean): Root {
  return fromMarkdown(body, {
    extensions: mdx ? [gfm(), mdxjs()] : [gfm()],
    mdastExtensions: mdx
      ? [gfmFromMarkdown(), mdxFromMarkdown()]
      : [gfmFromMarkdown()],
  });
}

/** 本文のブロックを見出しと区切り線で分け、表示するものとノートに振り分ける */
export function splitIntoDrafts(
  children: RootContent[],
  source: string,
): Draft[] {
  const drafts: Draft[] = [];
  let section: string | undefined;
  let current: Draft = newDraft();
  // まだどのスライドにも付けていないノート。次に表示するものと同じスライドに付ける
  let pendingNotes: RootContent[] = [];

  const flush = () => {
    current.notes.push(...pendingNotes);
    pendingNotes = [];
    if (
      current.heading !== undefined ||
      current.visible.length > 0 ||
      current.notes.length > 0
    ) {
      drafts.push(current);
    }
  };

  for (const node of children) {
    if (node.type === 'heading' && node.depth >= 2) {
      const text = toString(node).trim();
      const isEmpty =
        current.visible.length === 0 &&
        current.notes.length === 0 &&
        pendingNotes.length === 0;
      if (
        node.depth > 2 &&
        current.heading !== undefined &&
        current.heading === section &&
        isEmpty
      ) {
        current.isSectionHead = true;
      }
      flush();
      if (node.depth === 2) section = text;
      current = newDraft(text, node.depth === 2 ? undefined : section);
      continue;
    }
    if (node.type === 'thematicBreak') {
      flush();
      current = newDraft(current.heading, current.kicker);
      continue;
    }
    if (node.type === 'heading') continue; // h1 は記事タイトルと重複するので使わない

    const block = classify(node, source);
    if (block === 'notes') {
      pendingNotes.push(node);
      continue;
    }
    if (block === null) continue;

    if (conflicts(current.visible, block.kind)) {
      // 一緒に載せられないブロックは次のスライドへ。直前の段落もそちらの説明として持っていく
      drafts.push(current);
      current = newDraft(current.heading, current.kicker);
    }
    current.notes.push(...pendingNotes);
    pendingNotes = [];
    current.visible.push(block);
  }
  flush();
  return drafts;
}

/** すでにあるブロックと同じスライドに載せるとはみ出しやすい組み合わせか */
function conflicts(visible: VisibleBlock[], kind: VisibleKind): boolean {
  const hasHeavy = visible.some((v) => HEAVY.has(v.kind));
  const hasList = visible.some((v) => v.kind === 'list');
  if (HEAVY.has(kind)) return hasHeavy || hasList;
  if (kind === 'list') return hasHeavy;
  return false;
}

function newDraft(heading?: string, kicker?: string): Draft {
  return { heading, kicker, isSectionHead: false, visible: [], notes: [] };
}

function classify(
  node: RootContent,
  source: string,
): VisibleBlock | 'notes' | null {
  switch (node.type) {
    case 'paragraph': {
      if (isImageParagraph(node)) return { kind: 'image', node };
      // 1 行に書いた <div>…</div> や <LinkCard /> は段落として読まれるので、要素単体として扱う
      const only = meaningfulChildren(node);
      if (
        only.length === 1 &&
        only[0].type === 'mdxJsxTextElement' &&
        only[0].name === 'LinkCard'
      ) {
        return { kind: 'card', node: only[0] as unknown as RootContent };
      }
      // 段落が HTML 要素だけでできている（X の埋め込みの blockquote + script など）
      const onlyHtml =
        only.length > 0 &&
        only.every(
          (child) =>
            child.type === 'html' ||
            (child.type === 'mdxJsxTextElement' &&
              isHtmlElementName(child.name)),
        );
      if (onlyHtml) return rawHtmlBlock(node, sourceOf(node, source));
      return 'notes';
    }
    case 'html':
      return rawHtmlBlock(node, node.value);
    case 'list':
      return { kind: 'list', node };
    case 'code':
      return { kind: 'code', node };
    case 'blockquote':
      return { kind: 'quote', node };
    case 'table':
      return { kind: 'table', node };
    case 'mdxJsxFlowElement':
      if (node.name === 'LinkCard') return { kind: 'card', node };
      // 小文字の要素（div・iframe・blockquote など）は HTML としてそのまま出す。
      // 大文字のコンポーネントはスライドでは描画できないので落とす
      return isHtmlElementName(node.name)
        ? rawHtmlBlock(node, sourceOf(node, source))
        : null;
    default:
      // import 文・式はスライドでは扱わない
      return null;
  }
}

function isHtmlElementName(name: string | null | undefined): boolean {
  return Boolean(name && /^[a-z]/.test(name));
}

function sourceOf(node: RootContent, source: string): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined
    ? ''
    : source.slice(start, end);
}

/**
 * 本文に書かれた生 HTML をスライド用に整える。
 * - iframe（YouTube・Speaker Deck など）は 16:9 の枠に入れ直す
 * - X のポスト（blockquote.twitter-tweet）は引用カードとして出す（widgets.js は読まない）
 * - それ以外はそのまま出す。<script> とコメントは落とす
 */
export function rawHtmlBlock(
  node: RootContent,
  raw: string,
): VisibleBlock | null {
  const html = raw
    .replace(/<script\b[\s\S]*?(?:<\/script>|\/>)/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // タグ内に全角スペースが紛れていてもブラウザと同じく区切りとして読む
    .replace(/<[^>]+>/g, (tag) => tag.replace(/\u3000/g, ' '))
    .trim();
  if (!html) return null;
  if (/<iframe\b/i.test(html)) {
    const embed = embedHtml(html);
    return embed ? { kind: 'embed', node, html: embed } : null;
  }
  if (/class=["'][^"']*\btwitter-tweet\b/.test(html)) {
    return { kind: 'tweet', node, html };
  }
  return { kind: 'html', node, html };
}

function embedHtml(html: string): string {
  return [...html.matchAll(/<iframe\b[^>]*>/gi)]
    .map(([tag]) => {
      const attr = (name: string) => {
        const match = tag.match(
          new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
        );
        return match ? (match[1] ?? match[2]) : undefined;
      };
      const src = attr('src');
      if (!src) return '';
      const width = Number(attr('width'));
      const height = Number(attr('height'));
      // Spotify などの縦長プレーヤーは比率を固定しない
      const fixed = /open\.spotify\.com/.test(src);
      const ratio = width > 0 && height > 0 ? `${width} / ${height}` : '16 / 9';
      const allow = attr('allow');
      // src は表示したときに runtime が入れる（裏で動画が再生され続けないように）
      return `<div class="embed${fixed ? ' embed-fixed' : ''}" style="--ratio:${ratio}"><iframe data-src="${escapeAttr(src)}" title="${escapeAttr(attr('title') ?? '埋め込みコンテンツ')}"${
        allow ? ` allow="${escapeAttr(allow)}"` : ''
      } allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    })
    .join('');
}

function meaningfulChildren(node: Paragraph) {
  return node.children.filter(
    (child) => !(child.type === 'text' && child.value.trim() === ''),
  );
}

function isImageParagraph(node: Paragraph): boolean {
  const meaningful = meaningfulChildren(node);
  return (
    meaningful.length > 0 && meaningful.every((child) => child.type === 'image')
  );
}

async function toSlide(draft: Draft, options: SlidesOptions): Promise<Slide> {
  const notesHtml = await renderBlocks(draft.notes);
  const sourcesHtml = renderSources([
    ...draft.visible.map((block) => block.node),
    ...draft.notes,
  ]);
  if (draft.visible.length === 0) {
    if (draft.isSectionHead) {
      return {
        layout: 'section',
        heading: draft.heading,
        bodyHtml: '',
        notesHtml,
        sourcesHtml,
        steps: 0,
      };
    }
    // 表示するものがなければ、太字をキーメッセージとして出す
    const keys = collectStrong(draft.notes);
    const bodyHtml = keys
      .map(
        (text, i) =>
          `<p class="key anim" style="--i:${i + 1}">${escapeHtml(text)}</p>`,
      )
      .join('');
    return {
      layout:
        draft.heading === undefined && keys.length === 0
          ? 'content'
          : 'statement',
      heading: draft.heading,
      kicker: draft.kicker,
      bodyHtml,
      notesHtml,
      sourcesHtml,
      steps: 0,
    };
  }

  const kinds = new Set(draft.visible.map((v) => v.kind));
  const layout: SlideLayout =
    kinds.size > 1
      ? 'content'
      : (
          {
            list: 'bullets',
            code: 'code',
            image: 'image',
            quote: 'quote',
            table: 'table',
            card: 'content',
            embed: 'embed',
            tweet: 'quote',
            html: 'content',
          } as const
        )[draft.visible[0].kind];

  let order = 1;
  let steps = 0;
  const parts: string[] = [];
  for (const block of draft.visible) {
    const html = await renderVisible(block, (li) => {
      li.properties.style = `--i:${order++}`;
      if (options.steps) {
        li.properties.dataStep = String(++steps);
      }
    });
    parts.push(
      `<div class="block block-${block.kind} anim" style="--i:${order++}">${html}</div>`,
    );
  }
  return {
    layout,
    heading: draft.heading,
    kicker: draft.kicker,
    bodyHtml: parts.join(''),
    notesHtml,
    sourcesHtml,
    steps,
  };
}

/**
 * <Cite id="..." /> を、記事と同じ番号の [n]（参照先へのリンク）に置き換える。
 * references にない id は記事のビルドで止まるので、ここでは落とすだけにする
 */
function replaceCites(tree: Root, references: BlogReference[]) {
  const walk = (parent: { children: RootContent[] }) => {
    parent.children = parent.children.map((node) => {
      if (
        (node.type === 'mdxJsxTextElement' ||
          node.type === 'mdxJsxFlowElement') &&
        node.name === 'Cite'
      ) {
        const id = node.attributes.find(
          (attr) => 'name' in attr && attr.name === 'id',
        )?.value;
        const index = references.findIndex((ref) => ref.id === id);
        if (index === -1) return node;
        const reference = references[index];
        const citation: Citation = {
          n: index + 1,
          title: reference.title ?? reference.url,
          url: reference.url,
        };
        return {
          type: 'emphasis',
          data: {
            hName: 'sup',
            hProperties: { className: ['cite'] },
            citation,
          },
          children: [
            {
              type: 'link',
              url: reference.url,
              title: citation.title,
              children: [{ type: 'text', value: `[${citation.n}]` }],
            },
          ],
        } as RootContent;
      }
      if ('children' in node) walk(node as { children: RootContent[] });
      return node;
    });
  };
  walk(tree);
}

/** ノードの中の <Cite> が指す参照を、番号順に出典として並べる */
function renderSources(nodes: RootContent[]): string | undefined {
  const found = new Map<number, Citation>();
  const walk = (node: RootContent) => {
    const citation = (node.data as { citation?: Citation } | undefined)
      ?.citation;
    if (citation) found.set(citation.n, citation);
    if ('children' in node)
      node.children.forEach((child) => walk(child as RootContent));
  };
  nodes.forEach(walk);
  if (found.size === 0) return undefined;
  return [...found.values()]
    .sort((a, b) => a.n - b.n)
    .map(
      (c) =>
        `<li><span class="sources-n">[${c.n}]</span> <a href="${escapeAttr(c.url)}">${escapeHtml(c.title)}</a></li>`,
    )
    .join('');
}

/** frontmatter の references を一覧にしたスライド */
function referencesSlide(references: BlogReference[]): Slide {
  const items = references
    .map((reference, index) => {
      const title = reference.title ?? reference.url;
      const url = reference.url.replace(/^https?:\/\//, '');
      return `<li style="--i:${index + 1}"><a href="${escapeAttr(reference.url)}">${escapeHtml(title)}</a>${
        reference.title
          ? `<span class="reference-url">${escapeHtml(url)}</span>`
          : ''
      }${
        reference.description
          ? `<span class="reference-description">${escapeHtml(reference.description)}</span>`
          : ''
      }</li>`;
    })
    .join('');
  return {
    layout: 'references',
    heading: '参照',
    bodyHtml: `<div class="block block-list anim" style="--i:1"><ol class="reference-list">${items}</ol></div>`,
    notesHtml: '',
    steps: 0,
  };
}

function collectStrong(nodes: RootContent[]): string[] {
  const found: string[] = [];
  const walk = (node: RootContent) => {
    if (node.type === 'strong') {
      const text = toString(node).trim();
      if (text && !found.includes(text)) found.push(text);
      return;
    }
    if ('children' in node)
      node.children.forEach((child) => walk(child as RootContent));
  };
  nodes.forEach(walk);
  return found.slice(0, 3);
}

async function renderVisible(
  block: VisibleBlock,
  onListItem: (li: Element) => void,
): Promise<string> {
  const { node } = block;
  if (block.html !== undefined) return block.html;
  switch (block.kind) {
    case 'code':
      return highlight(node as Code);
    case 'image': {
      const images = (node as Paragraph).children.filter(
        (c): c is Image => c.type === 'image',
      );
      return images
        .map(
          (img) =>
            `<figure><img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt ?? '')}" loading="lazy" decoding="async" />${
              img.alt ? `<figcaption>${escapeHtml(img.alt)}</figcaption>` : ''
            }</figure>`,
        )
        .join('');
    }
    case 'card': {
      const attr =
        node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'
          ? node.attributes.find((a) => 'name' in a && a.name === 'url')
          : undefined;
      const url = typeof attr?.value === 'string' ? attr.value : '';
      if (!url) return '';
      return `<a class="card" href="${escapeAttr(url)}">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a>`;
    }
    default: {
      const hast = toHastSafe([node]);
      if (block.kind === 'list') {
        for (const child of hast.children) visitListItems(child, onListItem);
      }
      return toHtml(hast);
    }
  }
}

function visitListItems(
  node: HastRoot['children'][number] | ElementContent,
  fn: (li: Element) => void,
  depth = 0,
) {
  if (node.type !== 'element') return;
  // 入れ子のリストはまとめて出す（1 段目だけ順番に表示する）
  if (node.tagName === 'li' && depth === 1) {
    fn(node);
    return;
  }
  const nextDepth =
    node.tagName === 'ul' || node.tagName === 'ol' ? depth + 1 : depth;
  for (const child of node.children) visitListItems(child, fn, nextDepth);
}

async function renderBlocks(nodes: RootContent[]): Promise<string> {
  return nodes.length === 0 ? '' : toHtml(toHastSafe(nodes));
}

function toHastSafe(nodes: RootContent[]): HastRoot {
  const root: Root = { type: 'root', children: stripMdx(nodes) };
  return toHast(root) as HastRoot;
}

/** MDX 固有のノード（<Cite /> や {式}）は落とし、中のテキストだけ残す */
function stripMdx<T extends RootContent>(nodes: T[]): T[] {
  return nodes.flatMap((node): T[] => {
    if (
      node.type === 'mdxJsxTextElement' ||
      node.type === 'mdxJsxFlowElement'
    ) {
      return stripMdx(node.children as T[]);
    }
    if (
      node.type === 'mdxTextExpression' ||
      node.type === 'mdxFlowExpression' ||
      node.type === 'mdxjsEsm' ||
      node.type === 'html'
    ) {
      return [];
    }
    if ('children' in node) {
      return [
        { ...node, children: stripMdx(node.children as RootContent[]) } as T,
      ];
    }
    return [node];
  });
}

const languages = new Set(Object.keys(bundledLanguages));
let highlighter: Promise<Highlighter> | undefined;
/**
 * コードはどのプリセットでも暗い背景で出す（ブログのコードブロックと同じ）。
 * github-dark はコメントのコントラスト比が 3:1 ほどしかないので、4.5:1 を満たす github-dark-default を使う
 */
const CODE_THEME = 'github-dark-default';

async function highlight(node: Code): Promise<string> {
  // プリレンダーは workerd 上で動き WASM が使えないため、JS の正規表現エンジンを使う
  highlighter ??= createHighlighter({
    themes: [CODE_THEME],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  const shiki = await highlighter;
  const lang = node.lang && languages.has(node.lang) ? node.lang : 'text';
  if (lang !== 'text' && !shiki.getLoadedLanguages().includes(lang)) {
    await shiki.loadLanguage(lang as BundledLanguage);
  }
  return shiki.codeToHtml(node.value.replace(/^\n+|\n+$/g, ''), {
    lang,
    theme: CODE_THEME,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
