import { createClient } from '@libsql/client/web';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/libsql/web';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * いいねテーブル。
 *
 * 以前 astro:db が作成した既存テーブルをそのまま使うため、テーブル名・カラム名は変更しない。
 * CREATE TABLE "Likes" ("slug" text PRIMARY KEY, "count" integer NOT NULL DEFAULT 0)
 */
export const Likes = sqliteTable('Likes', {
  slug: text('slug').primaryKey(),
  count: integer('count').notNull().default(0),
});

const schema = { Likes };

export type Db = ReturnType<typeof createDb>;

let cached: Db | undefined;

/**
 * Drizzle クライアントを返す。
 *
 * `@libsql/client/web` は Workers でも astro dev(workerd) でも動く唯一のビルドなので、
 * dev / 本番どちらも Turso へ HTTP で接続する。接続先は環境変数で切り替える
 * （ローカルは .dev.vars、本番は Cloudflare の secret）。
 */
export function getDb(): Db {
  cached ??= createDb();
  return cached;
}

function createDb() {
  const url = env.ASTRO_DB_REMOTE_URL;
  if (!url) {
    throw new Error(
      'ASTRO_DB_REMOTE_URL が未設定です。ローカルは .dev.vars、本番は Cloudflare の secret を確認してください。',
    );
  }

  return drizzle(createClient({ url, authToken: env.ASTRO_DB_APP_TOKEN }), {
    schema,
  });
}
