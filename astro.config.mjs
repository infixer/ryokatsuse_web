import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';
import { markdownComponents } from './src/integrations/markdown-components';

// https://astro.build/config
export default defineConfig({
  site: 'https://infixer.net',
  output: 'server',
  adapter: cloudflare({
    // Workers 実行時に sharp は動かないため、画像最適化はビルド時に済ませる
    imageService: 'compile',
  }),
  integrations: [
    sitemap(),
    react(),
    mdx({
      // MDXファイルでグローバルに使用できるコンポーネントを設定
      components: {
        LinkCard: './src/components/LinkCard.astro',
      },
    }),
    markdownComponents(),
  ],
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
  prefetch: {
    prefetchAll: true,
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@resvg/resvg-js'],
      include: [],
    },
    // SSRの問題に対処する設定を追加
    ssr: {
      // 外部化しない依存関係を指定
      noExternal: [],
      // 外部化する依存関係を明示的に指定
      external: ['node:*'],
    },
    // パターンマッチングの問題を解決
    build: {
      // rollupオプションを追加
      rollupOptions: {
        // 外部依存関係を明示的に設定
        external: [],
      },
    },
    // 解決方法を明示的に設定
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        // @libsql/hrana-client が cross-fetch(node-fetch) を掴むと Workers 上で落ちる
        'cross-fetch': new URL('./src/lib/cross-fetch-shim.ts', import.meta.url).pathname,
      },
    },
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Noto Sans JP',
      cssVariable: '--font-noto-sans-jp',
      weights: ['400', '500', '700'],
      fallbacks: ['Hiragino Sans', 'Yu Gothic', 'sans-serif'],
      // CJKフォントではsize-adjustが約200%に誤算出されFOUT時に巨大表示になるため無効化
      optimizedFallbacks: false,
    },
  ],
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});