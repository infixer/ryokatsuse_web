import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../src/markdown';
import { createOutput } from '../src/output';

const out = createOutput({ color: false });

test('renderMarkdown は MDX の import を落とし、コンポーネントをプレースホルダーにする', () => {
  const rendered = renderMarkdown(
    [
      "import LinkCard from '../LinkCard.astro';",
      '',
      '## 見出し',
      '',
      '<LinkCard url="https://example.com" />',
      '',
      '- [リンク](https://e.com) と `code`',
      '> 引用',
      '![画像](/images/a.png)',
      '<div>',
      '<iframe src="https://youtube.com/embed/x"></iframe>',
      '</div>',
      '```ts',
      'const a = <T,>(x: T) => x;',
      '```',
    ].join('\n'),
    out,
  );
  assert.equal(
    rendered,
    [
      '見出し',
      '',
      '[LinkCard] https://example.com',
      '',
      '• リンク (https://e.com) と code',
      '│ 引用',
      '[画像: 画像] /images/a.png',
      '',
      '[iframe] https://youtube.com/embed/x',
      '',
      '┌─ ts',
      '│ const a = <T,>(x: T) => x;',
      '└─',
    ].join('\n'),
  );
});
