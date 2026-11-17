import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  excerpt,
  plainDiaryBody,
  renderDiaryBlocks,
  renderDiaryBody,
} from '../src/lib/diary/text';

test('改行を残し、HTML はエスケープする', () => {
  assert.equal(
    renderDiaryBody('1行目\n<b>2行目</b>', []),
    '1行目\n&lt;b&gt;2行目&lt;/b&gt;',
  );
});

test('本文中の URL はリンクにし、末尾の句読点は含めない', () => {
  assert.equal(
    renderDiaryBody('見た https://example.com/a。よかった', []),
    '見た <a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a>。よかった',
  );
});

test('リンクカードにした URL だけの行は本文から省く', () => {
  assert.equal(
    renderDiaryBody('読んだ\n\nhttps://example.com/\n', ['https://example.com/']),
    '読んだ',
  );
});

test('URL の属性値に引用符を入れられない', () => {
  const html = renderDiaryBody('https://example.com/?q="x"', []);
  assert.ok(!html.includes('"x"'));
});

test('抜粋は URL と改行を除いて切り詰める', () => {
  assert.equal(excerpt('今日は\nhttps://example.com/ 晴れ', 100), '今日は 晴れ');
  assert.equal(excerpt('あいうえお', 3), 'あいう…');
});

test('プレーンテキスト版はリンクにせず、カードの行だけ省く', () => {
  assert.equal(
    plainDiaryBody('見た https://example.com/a\nhttps://example.com/card', [
      'https://example.com/card',
    ]),
    '見た https://example.com/a',
  );
});

test('リンクカードは URL だけの行の位置に置き、前後の空行は落とす', () => {
  assert.deepEqual(
    renderDiaryBlocks('前の文\n\nhttps://example.com/\n\n後ろの文', [
      'https://example.com/',
    ]),
    {
      blocks: [
        { type: 'text', html: '前の文' },
        { type: 'card', url: 'https://example.com/' },
        { type: 'text', html: '後ろの文' },
      ],
      rest: [],
    },
  );
});

test('本文に行が無いカードは rest で返す', () => {
  assert.deepEqual(
    renderDiaryBlocks('本文だけ', ['https://example.com/']),
    {
      blocks: [{ type: 'text', html: '本文だけ' }],
      rest: ['https://example.com/'],
    },
  );
});

test('同じ URL の行が 2 回あってもカードは最初の位置に 1 枚だけ', () => {
  assert.deepEqual(
    renderDiaryBlocks('https://example.com/\nあいだ\nhttps://example.com/', [
      'https://example.com/',
    ]).blocks,
    [
      { type: 'card', url: 'https://example.com/' },
      { type: 'text', html: 'あいだ' },
    ],
  );
});
