import { env } from 'cloudflare:workers';
import { fetchOgp, type OgpData } from '../ogp';
import type { D1Database } from './bindings';

/** 添付画像。key は R2 のキー（/media/<key> で配信） */
export type DiaryImage = {
  key: string;
  width: number;
  height: number;
};

export type DiaryPost = {
  id: string;
  body: string;
  images: DiaryImage[];
  /** リンクカードにする URL（貼り付けた順） */
  links: string[];
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DiaryPostInput = {
  body: string;
  images: DiaryImage[];
  links: string[];
};

type PostRow = {
  id: string;
  body: string;
  images: string;
  links: string;
  published_at: string;
  created_at: string;
  updated_at: string;
};

type PreviewRow = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  site_name: string;
  favicon_url: string | null;
};

const db = (): D1Database => {
  if (!env.DIARY_DB) {
    throw new Error(
      'DIARY_DB が未設定です。wrangler.jsonc の d1_databases を確認してください。',
    );
  }
  return env.DIARY_DB;
};

const parseJsonArray = <T>(value: string): T[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toPost = (row: PostRow): DiaryPost => ({
  id: row.id,
  body: row.body,
  images: parseJsonArray<DiaryImage>(row.images),
  links: parseJsonArray<string>(row.links),
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** URL に使う短い ID（10 文字の英数字） */
export const createPostId = (): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

/**
 * 新しい順に投稿を返す。before（published_at）より前のものだけを返すとページングになる。
 * limit + 1 件読んで、次のページがあるかを判定する。
 */
export const listPosts = async ({
  before,
  limit = 20,
}: {
  before?: string | null;
  limit?: number;
} = {}): Promise<{ posts: DiaryPost[]; nextCursor: string | null }> => {
  const statement = before
    ? db()
        .prepare(
          'SELECT * FROM diary_posts WHERE published_at < ? ORDER BY published_at DESC LIMIT ?',
        )
        .bind(before, limit + 1)
    : db()
        .prepare('SELECT * FROM diary_posts ORDER BY published_at DESC LIMIT ?')
        .bind(limit + 1);

  const { results } = await statement.all<PostRow>();
  const posts = results.slice(0, limit).map(toPost);
  const nextCursor =
    results.length > limit ? (posts.at(-1)?.publishedAt ?? null) : null;
  return { posts, nextCursor };
};

export const getPost = async (id: string): Promise<DiaryPost | null> => {
  const row = await db()
    .prepare('SELECT * FROM diary_posts WHERE id = ?')
    .bind(id)
    .first<PostRow>();
  return row ? toPost(row) : null;
};

export const createPost = async (input: DiaryPostInput): Promise<DiaryPost> => {
  const now = new Date().toISOString();
  const id = createPostId();
  await db()
    .prepare(
      'INSERT INTO diary_posts (id, body, images, links, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      input.body,
      JSON.stringify(input.images),
      JSON.stringify(input.links),
      now,
      now,
      now,
    )
    .run();
  await ensureLinkPreviews(input.links);
  return {
    id,
    ...input,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
};

export const updatePost = async (
  id: string,
  input: DiaryPostInput,
): Promise<boolean> => {
  const result = await db()
    .prepare(
      'UPDATE diary_posts SET body = ?, images = ?, links = ?, updated_at = ? WHERE id = ?',
    )
    .bind(
      input.body,
      JSON.stringify(input.images),
      JSON.stringify(input.links),
      new Date().toISOString(),
      id,
    )
    .run();
  if (!result.meta.changes) return false;
  await ensureLinkPreviews(input.links);
  return true;
};

export const deletePost = async (id: string): Promise<DiaryPost | null> => {
  const post = await getPost(id);
  if (!post) return null;
  await db().prepare('DELETE FROM diary_posts WHERE id = ?').bind(id).run();
  return post;
};

// ---- リンクカード（OGP キャッシュ） ----

const toOgp = (row: PreviewRow): OgpData => ({
  title: row.title,
  description: row.description,
  image: row.image,
  siteName: row.site_name,
  faviconUrl: row.favicon_url,
});

export const getLinkPreviews = async (
  urls: string[],
): Promise<Map<string, OgpData>> => {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return new Map();

  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db()
    .prepare(`SELECT * FROM link_previews WHERE url IN (${placeholders})`)
    .bind(...unique)
    .all<PreviewRow>();
  return new Map(results.map((row) => [row.url, toOgp(row)]));
};

const savePreview = async (url: string, ogp: OgpData) => {
  await db()
    .prepare(
      `INSERT INTO link_previews (url, title, description, image, site_name, favicon_url, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title = excluded.title, description = excluded.description, image = excluded.image,
         site_name = excluded.site_name, favicon_url = excluded.favicon_url, fetched_at = excluded.fetched_at`,
    )
    .bind(
      url,
      ogp.title,
      ogp.description,
      ogp.image,
      ogp.siteName,
      ogp.faviconUrl,
      new Date().toISOString(),
    )
    .run();
};

/**
 * 取得に失敗して fetchOgp がドメイン名だけの値を返したか。
 * これを保存すると取り直せなくなるので、保存せず次の機会に再取得する。
 */
const isFallback = (url: string, ogp: OgpData) =>
  ogp.title === new URL(url).hostname && !ogp.description && !ogp.image;

/**
 * URL の OGP を返す。キャッシュがあればそれを、無ければ取得して保存する。
 * refresh: true のときはキャッシュを無視して取り直す。
 */
export const resolveLinkPreview = async (
  url: string,
  { refresh = false } = {},
): Promise<OgpData> => {
  if (!refresh) {
    const cached = (await getLinkPreviews([url])).get(url);
    if (cached) return cached;
  }
  const ogp = await fetchOgp(url);
  if (!isFallback(url, ogp)) await savePreview(url, ogp);
  return ogp;
};

/** 保存時に、まだ OGP を持っていない URL だけ取得しておく */
const ensureLinkPreviews = async (urls: string[]) => {
  const cached = await getLinkPreviews(urls);
  await Promise.all(
    urls
      .filter((url) => !cached.has(url))
      .map(async (url) => {
        const ogp = await fetchOgp(url);
        if (!isFallback(url, ogp)) await savePreview(url, ogp);
      }),
  );
};
