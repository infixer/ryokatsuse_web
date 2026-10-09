import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

// コンポーネントパス
const COMPONENTS_PATH = fileURLToPath(
  new URL('../components', import.meta.url),
);

/**
 * マークダウンでカスタムコンポーネントを使用するための統合
 */
export function markdownComponents(): AstroIntegration {
  return {
    name: 'markdown-components',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            resolve: {
              alias: {
                '@components': COMPONENTS_PATH,
              },
            },
          },
        });
      },
    },
  };
}
