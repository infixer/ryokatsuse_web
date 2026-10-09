import { slug as githubSlug } from 'github-slugger';

export const SITE_URL = 'https://infixer.net';

export const collections = {
  blog: {
    dir: 'src/content/blog',
    urlPrefix: '/blog/',
    ogPrefix: '',
    apiSegment: 'posts',
    label: '記事',
  },
  poems: {
    dir: 'src/content/poems',
    urlPrefix: '/poems/',
    ogPrefix: 'poems-',
    apiSegment: 'poems',
    label: 'ポエム',
  },
} as const;

export type CollectionName = keyof typeof collections;

export const collectionNames = Object.keys(collections) as CollectionName[];

export const isCollectionName = (value: string): value is CollectionName =>
  Object.hasOwn(collections, value);

export const ENTRY_EXTENSION = /\.mdx?$/;

/**
 * コレクションディレクトリからの相対パス（区切りは `/`）を Astro の glob ローダーと同じ id に変換する。
 * 例: `2026/frontend-phpcon-do-lt-web-idl..mdx` → `2026/frontend-phpcon-do-lt-web-idl`
 */
export function entryIdFromPath(relativePath: string): string {
  return relativePath
    .replace(ENTRY_EXTENSION, '')
    .split('/')
    .map((segment) => githubSlug(segment))
    .join('/')
    .replace(/\/index$/, '');
}

export function entryFormat(filePath: string): 'md' | 'mdx' {
  return filePath.endsWith('.mdx') ? 'mdx' : 'md';
}

export function entryPath(collection: CollectionName, id: string): string {
  return `${collections[collection].urlPrefix}${id}`;
}

/** public/og/ 配下に出力する OGP 画像のファイル名（拡張子なし） */
export function ogImageName(collection: CollectionName, id: string): string {
  return `${collections[collection].ogPrefix}${id.replace(/\//g, '-')}`;
}

export function ogImagePath(collection: CollectionName, id: string): string {
  return `/og/${ogImageName(collection, id)}.png`;
}
