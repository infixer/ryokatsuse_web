import {
  type CollectionName,
  entryFormat,
  entryPath,
  ogImagePath,
  SITE_URL,
} from './entry';
import type { Talk, Work } from './schema';
import { toPlainText } from './text';

/**
 * `/api/v1/*` のレスポンス型と、その組み立て関数。
 * サイトの API 実装と CLI のローカルモードが同じ関数を通すことで、出力の形を揃える。
 */

export const API_VERSION = 1;

export type EntryMeta = {
  id: string;
  collection: CollectionName;
  title: string;
  description?: string;
  publishDate: string;
  updatedDate?: string;
  url: string;
  ogImage: string;
  references?: { title?: string; url: string }[];
};

export type Entry = EntryMeta & {
  format: 'md' | 'mdx';
  body: string;
};

export type TalkItem = Talk & { id: string };
export type WorkItem = Work & { id: string };

export type SearchIndexItem = {
  id: string;
  collection: CollectionName;
  title: string;
  publishDate: string;
  url: string;
  text: string;
};

export type ApiIndex = {
  version: typeof API_VERSION;
  site: string;
  generatedAt: string;
  counts: { posts: number; poems: number; talks: number; works: number };
};

export type LikesItem = { id: string; count: number };

export type EntrySource = {
  collection: CollectionName;
  id: string;
  /** frontmatter（スキーマ検証済み） */
  data: {
    title: string;
    publishDate: string;
    description?: string;
    updatedDate?: string;
    ogImageURL?: string;
    references?: { title?: string; url: string }[];
  };
  body: string;
  /** 拡張子の判定に使う */
  filePath: string;
};

export function toEntryMeta(
  source: EntrySource,
  site: string = SITE_URL,
): EntryMeta {
  const { collection, id, data } = source;
  return {
    id,
    collection,
    title: data.title,
    ...(data.description !== undefined && { description: data.description }),
    publishDate: data.publishDate,
    ...(data.updatedDate !== undefined && { updatedDate: data.updatedDate }),
    url: new URL(entryPath(collection, id), site).toString(),
    ogImage: new URL(
      data.ogImageURL || ogImagePath(collection, id),
      site,
    ).toString(),
    ...(data.references !== undefined && { references: data.references }),
  };
}

export function toEntry(source: EntrySource, site: string = SITE_URL): Entry {
  return {
    ...toEntryMeta(source, site),
    format: entryFormat(source.filePath),
    // Astro の entry.body は前後の空行が落ちているので、ローカルでも揃える
    body: source.body.trim(),
  };
}

export function toSearchIndexItem(entry: Entry): SearchIndexItem {
  return {
    id: entry.id,
    collection: entry.collection,
    title: entry.title,
    publishDate: entry.publishDate,
    url: entry.url,
    text: toPlainText(entry.body),
  };
}
