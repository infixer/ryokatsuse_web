import assert from 'node:assert/strict';
import { test } from 'node:test';
import { excerpt, renderDiaryBody } from '../src/lib/diary/text';

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
