/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Cloudflare の bindings / secrets。ローカルは .dev.vars、本番は Cloudflare の secret から入る
interface CloudflareEnv {
  ASTRO_DB_REMOTE_URL: string;
  ASTRO_DB_APP_TOKEN?: string;
  // 日記（wrangler.jsonc の d1_databases / r2_buckets）
  DIARY_DB: import('./lib/diary/bindings').D1Database;
  DIARY_MEDIA: import('./lib/diary/bindings').R2Bucket;
  // 管理画面を守る Cloudflare Access の設定（例: myteam.cloudflareaccess.com と Application Audience タグ）
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

declare module 'cloudflare:workers' {
  export const env: CloudflareEnv;
}

declare namespace App {
  interface Locals {
    // 記事ページが本文の描画前に入れておき、<Cite> が番号を引くのに使う
    references?: import('@infixer/core/schema').BlogReference[];
    citeCounts?: Record<string, number>;
  }

  interface SessionData {
    counter: number;
    lastVisit: Date;
    favorites: string[];
    article_favorites: string[];
    liked_articles: string[];
  }
}

// Astroのコンテンツコレクションエントリに拡張プロパティを定義
declare module 'astro:content' {
  interface CollectionEntry<T> {
    slug: string;
  }
}
