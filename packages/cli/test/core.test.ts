import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  entryIdFromPath,
  excerpt,
  ogImagePath,
  parseFrontmatter,
  parseOrderedYaml,
  sortByDateDesc,
  stringifyFrontmatter,
  toEntry,
  toPlainText,
} from '@infixer/core';
import { parse } from 'yaml';
import { idFromUrl, parseItems, stringifyItems, uniqueId } from '../src/items';

test('entryIdFromPath は Astro の glob ローダーと同じ id を作る', () => {
  assert.equal(entryIdFromPath('2026/like-weapon.mdx'), '2026/like-weapon');
  assert.equal(entryIdFromPath('2020/1228_03.md'), '2020/1228_03');
  assert.equal(entryIdFromPath('2026/web-idl..mdx'), '2026/web-idl');
  assert.equal(entryIdFromPath('2026/Hello World.md'), '2026/hello-world');
  assert.equal(entryIdFromPath('2026/index.md'), '2026');
  assert.equal(ogImagePath('poems', '2026/a'), '/og/poems-2026-a.png');
});

test('frontmatter を読み書きできる', () => {
  const source = stringifyFrontmatter(
    { title: 'タイトル: A', publishDate: '2026-10-09' },
    '\n本文\n',
  );
  assert.equal(
    source,
    '---\ntitle: "タイトル: A"\npublishDate: "2026-10-09"\n---\n\n本文\n',
  );
  const parsed = parseFrontmatter(source);
  assert.deepEqual(parsed.data, {
    title: 'タイトル: A',
    publishDate: '2026-10-09',
  });
  assert.equal(parsed.body, '\n本文\n');
  assert.equal(parsed.bodyLineOffset, 4);
  assert.throws(() => parseFrontmatter('本文だけ'), /frontmatter/);
});

test('toEntry は本文の前後の空行を落とし、URL を組み立てる', () => {
  const entry = toEntry({
    collection: 'blog',
    id: '2026/a',
    data: { title: 'A', publishDate: '2026-01-01' },
    body: '\n本文\n\n',
    filePath: '/x/2026/a.mdx',
  });
  assert.equal(entry.body, '本文');
  assert.equal(entry.format, 'mdx');
  assert.equal(entry.url, 'https://infixer.net/blog/2026/a');
  assert.equal(entry.ogImage, 'https://infixer.net/og/2026-a.png');
});

test('toPlainText と excerpt', () => {
  const text = toPlainText(
    'import X from \'x\';\n## 見出し\n[リンク](https://e.com) と **強調** と <LinkCard url="u" />\n',
  );
  assert.equal(text, '見出し\nリンク と 強調 と');
  assert.equal(excerpt('abcdefghij', 'e', 2), '…cdefg…');
  assert.equal(excerpt('abc', 'z'), undefined);
});

test('sortByDateDesc は同じ日付ならキー順にする', () => {
  const items = [
    { id: 'b', date: '2026-01-01' },
    { id: 'c', date: '2026-02-01' },
    { id: 'a', date: '2026-01-01' },
  ];
  assert.deepEqual(
    sortByDateDesc(
      items,
      (i) => i.date,
      (i) => i.id,
    ).map((i) => i.id),
    ['c', 'a', 'b'],
  );
});

test('idFromUrl と uniqueId', () => {
  assert.equal(
    idFromUrl('https://github.com/ryokatsuse/dev-launcher'),
    'dev-launcher',
  );
  assert.equal(
    idFromUrl('https://js-stack-viewer.vercel.app/'),
    'js-stack-viewer',
  );
  assert.equal(
    idFromUrl('https://axe-core-deep-dive.vercel.app/1'),
    'axe-core-deep-dive',
  );
  assert.equal(
    idFromUrl('https://scrapbox.io/ryokatsu/%E6%88%90%E6%9E%9C%E7%89%A9'),
    undefined,
  );
  assert.equal(
    uniqueId('2026-01-09', ['2026-01-09', '2026-01-09-2']),
    '2026-01-09-3',
  );
});

test('stringifyItems は id と日付をクォートし、Astro 用の parser で順番を保てる', () => {
  const yaml = stringifyItems([
    {
      id: '2026-01-09',
      title: 'B',
      url: 'https://e.com',
      date: '2026-01-09',
      event: 'E',
      scope: 'external',
    },
    {
      id: '2025-01-01',
      title: 'A',
      url: 'https://e.com/a',
      date: '2025-01-01',
      event: 'E',
      scope: 'internal',
    },
  ]);
  assert.match(yaml, /- id: "2026-01-09"\n {2}title: B/);
  assert.match(yaml, /date: "2026-01-09"/);
  assert.deepEqual(
    parseOrderedYaml(yaml).map((item) => [item.id, item.order]),
    [
      ['2026-01-09', 0],
      ['2025-01-01', 1],
    ],
  );
  assert.equal(parse(yaml).length, 2);
});

test('parseItems はスキーマ違反と id の重複を報告する', () => {
  const { items, issues } = parseItems(
    'works',
    '- id: a\n  title: A\n  url: not-a-url\n  description: d\n- id: b\n  title: B\n  url: https://e.com\n  description: d\n- id: b\n  title: C\n  url: https://e.com\n  description: d\n',
  );
  assert.equal(items.length, 2);
  assert.deepEqual(
    issues.map((issue) => issue.id),
    ['a', 'b'],
  );
});
