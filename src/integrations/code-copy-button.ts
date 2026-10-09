import type { Element } from 'hast';
import type { ShikiTransformer } from 'shiki';

const svgIcon = (className: string, children: Element[]): Element => ({
  type: 'element',
  tagName: 'svg',
  properties: {
    xmlns: 'http://www.w3.org/2000/svg',
    class: className,
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  },
  children,
});

const svgChild = (
  tagName: string,
  properties: Element['properties'],
): Element => ({ type: 'element', tagName, properties, children: [] });

const copyIcon = svgIcon('code-copy-icon', [
  svgChild('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
  svgChild('path', {
    d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  }),
]);

const checkIcon = svgIcon('code-copied-icon', [
  svgChild('polyline', { points: '20 6 9 17 4 12' }),
]);

/**
 * コードブロックを `<div class="code-block">` で包み、コピーボタン（アイコン）を付ける。
 * ボタンはビルド時に HTML へ入れておき、クリック処理だけを src/components/CodeCopy.ts で行う。
 * pre の外に置くので、横スクロールしてもボタンは右上に留まる。
 */
export function codeCopyButton(): ShikiTransformer {
  return {
    name: 'code-copy-button',
    root(root) {
      root.children = [
        {
          type: 'element',
          tagName: 'div',
          properties: { class: 'code-block' },
          children: [
            ...root.children,
            {
              type: 'element',
              tagName: 'button',
              properties: {
                type: 'button',
                class: 'code-copy-button',
                'aria-label': 'コードをコピー',
                title: 'コードをコピー',
              },
              children: [copyIcon, checkIcon],
            },
          ],
        },
      ];
    },
  };
}
