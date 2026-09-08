/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Cloudflare の bindings / secrets。ローカルは .dev.vars、本番は Cloudflare の secret から入る
interface CloudflareEnv {
  ASTRO_DB_REMOTE_URL: string;
  ASTRO_DB_APP_TOKEN?: string;
}

declare module 'cloudflare:workers' {
  export const env: CloudflareEnv;
}

declare namespace App {
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
