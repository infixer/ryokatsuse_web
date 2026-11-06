import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slidesSchema } from '@infixer/core/schema';
import { buildDeck } from '../src/lib/slides/build';

const options = slidesSchema.parse({});

async function deckOf(body: string, mdx = false, extra = {}) {
  return buildDeck({
    body,
    mdx,
    title: '記事タイトル',
    description: '説明',
    publishDate: '2026-11-06',
    options: { ...options, ...extra },
    postUrl: '/blog/2026/example',
  });
}

const summary = (deck: Awaited<ReturnType<typeof deckOf>>) =>
  deck.slides.map((s) => [s.layout, s.kicker ?? '', s.heading ?? '']);

test('表紙と最後のスライドが付き、本文の段落はノートになる', async () => {
  const deck = await deckOf(`導入の話。

## 見出し

ここはノート。

- 項目1
- 項目2
`);
  assert.deepEqual(summary(deck), [
    ['title', '', '記事タイトル'],
    ['bullets', '', '見出し'],
    ['end', '', 'ありがとうございました'],
  ]);
  assert.match(deck.slides[0].notesHtml, /導入の話/);
  assert.match(deck.slides[1].notesHtml, /ここはノート/);
  assert.doesNotMatch(deck.slides[1].bodyHtml, /ここはノート/);
  assert.match(deck.slides[1].bodyHtml, /<li style="--i:1">項目1<\/li>/);
  assert.match(deck.slides.at(-1)!.bodyHtml, /href="\/blog\/2026\/example"/);
  assert.equal(deck.subtitle, '説明');
  assert.equal(deck.date, '2026-11-06');
});

test('h2 の直後に h3 が続くと章扉になり、h3 には章タイトルが付く', async () => {
  const deck = await deckOf(`## 章

### 節A

> 引用

### 節B

**大事なこと**を話す。
`);
  assert.deepEqual(summary(deck).slice(1, -1), [
    ['section', '', '章'],
    ['quote', '章', '節A'],
    ['statement', '章', '節B'],
  ]);
  assert.match(deck.slides[3].bodyHtml, /class="key anim"[^>]*>大事なこと</);
});

test('コード・画像は 1 枚に 1 つまでで、直前の段落は次のスライドのノートになる', async () => {
  const deck = await deckOf(`## コード

前置き。

\`\`\`ts
const a = 1;
\`\`\`

次のコードの説明。

\`\`\`ts
const b = 2;
\`\`\`

![画像の説明](/images/a.png)
`);
  const body = deck.slides.slice(1, -1);
  assert.deepEqual(
    body.map((s) => s.layout),
    ['code', 'code', 'image'],
  );
  assert.match(body[0].notesHtml, /前置き/);
  assert.match(body[1].notesHtml, /次のコードの説明/);
  assert.doesNotMatch(body[0].notesHtml, /次のコードの説明/);
  assert.match(body[0].bodyHtml, /class="shiki/);
  assert.match(body[2].bodyHtml, /<figcaption>画像の説明<\/figcaption>/);
});

test('リストとコード・画像は同じスライドに載せない', async () => {
  const deck = await deckOf(`## 見出し

- 項目1
- 項目2

例を書くと以下のようになる。

\`\`\`html
<p>例</p>
\`\`\`

- コードのあとのリスト

> 引用はリストと同じスライドに載る
`);
  const body = deck.slides.slice(1, -1);
  assert.deepEqual(
    body.map((s) => [s.layout, s.heading]),
    [
      ['bullets', '見出し'],
      ['code', '見出し'],
      ['content', '見出し'],
    ],
  );
  assert.match(body[1].notesHtml, /例を書くと/);
  assert.doesNotMatch(body[0].notesHtml, /例を書くと/);
  assert.match(body[2].bodyHtml, /コードのあとのリスト/);
  assert.match(body[2].bodyHtml, /引用はリストと同じスライドに載る/);
});

test('区切り線で同じ見出しのままスライドを分ける', async () => {
  const deck = await deckOf(`## 見出し

- a

---

- b
`);
  assert.deepEqual(summary(deck).slice(1, -1), [
    ['bullets', '', '見出し'],
    ['bullets', '', '見出し'],
  ]);
});

test('MDX の import・<Cite>・大文字のコンポーネントは落とし、LinkCard はリンクとして出す', async () => {
  const deck = await deckOf(
    `import LinkCard from '../LinkCard.astro';

<Counter />

## 参考

本文<Cite id="x" />です。

<LinkCard url="https://example.com/post" />
`,
    true,
  );
  const slide = deck.slides[1];
  assert.equal(slide.layout, 'content');
  assert.match(slide.bodyHtml, /<a class="card" href="https:\/\/example.com\/post">example.com\/post<\/a>/);
  assert.match(slide.notesHtml, /<p>本文です。<\/p>/);
  assert.doesNotMatch(JSON.stringify(deck), /import LinkCard|Counter/);
});

const youtube = `<div style="position: relative; padding-bottom: 56.25%;">
<iframe　style="position: absolute;" src="https://www.youtube.com/embed/abc" title="YouTube video player" allow="encrypted-media" allowfullscreen></iframe>
</div>`;

for (const mdx of [false, true]) {
  test(`YouTube などの iframe は動画スライドになる（${mdx ? 'MDX' : 'Markdown'}）`, async () => {
    const deck = await deckOf(`## 動画

紹介する。

${youtube}

<iframe width="560" height="315" src="https://www.youtube.com/embed/def"></iframe>
`, mdx);
    const [first, second] = deck.slides.slice(1, -1);
    assert.equal(first.layout, 'embed');
    assert.match(first.notesHtml, /紹介する/);
    // 全角スペースの混じったタグも読め、src は表示時に入れる
    assert.match(first.bodyHtml, /<iframe data-src="https:\/\/www.youtube.com\/embed\/abc" title="YouTube video player" allow="encrypted-media"/);
    assert.match(first.bodyHtml, /--ratio:16 \/ 9/);
    assert.doesNotMatch(first.bodyHtml, /\ssrc=/);
    // 2 つ目の動画は次のスライド。width / height から比率を取る
    assert.equal(second.layout, 'embed');
    assert.match(second.bodyHtml, /--ratio:560 \/ 315/);
  });

  test(`X のポストは引用カードになり、script は落とす（${mdx ? 'MDX' : 'Markdown'}）`, async () => {
    const deck = await deckOf(`## ポスト

<blockquote class="twitter-tweet"><p lang="ja" dir="ltr">本文</p>&mdash; 名前 <a href="https://x.com/a/status/1">2026年1月1日</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

<div class="note">そのほかの HTML</div>
`, mdx);
    const [tweet, html] = deck.slides.slice(1, -1);
    assert.equal(tweet.layout, 'quote');
    assert.match(tweet.bodyHtml, /block-tweet.*<blockquote class="twitter-tweet"><p lang="ja" dir="ltr">本文<\/p>/);
    assert.doesNotMatch(tweet.bodyHtml, /script/);
    assert.equal(html.layout, 'content');
    assert.match(html.bodyHtml, /<div class="note">そのほかの HTML<\/div>/);
  });
}

test('見出しのない記事は、導入の表示物のスライドにノートを付ける', async () => {
  const deck = await deckOf(`前置き。

${youtube}

締め。
`);
  assert.deepEqual(deck.slides.map((s) => s.layout), ['title', 'embed', 'end']);
  assert.equal(deck.slides[0].notesHtml, '');
  assert.match(deck.slides[1].notesHtml, /前置き[\s\S]*締め/);
});

test('steps: true ならリスト項目に順番が付く', async () => {
  const deck = await deckOf(
    `## 手順

1. 一つ目
2. 二つ目
   - 入れ子
`,
    false,
    { steps: true },
  );
  const slide = deck.slides[1];
  assert.equal(slide.steps, 2);
  assert.match(slide.bodyHtml, /data-step="1"/);
  assert.match(slide.bodyHtml, /data-step="2"/);
  assert.doesNotMatch(slide.bodyHtml, /data-step="3"/);
});

test('frontmatter の slides: true は既定値で埋まる', () => {
  assert.deepEqual(slidesSchema.parse({}), { theme: 'keynote', steps: false });
});
