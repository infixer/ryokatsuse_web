import {
  type CollectionName,
  collections,
  type EntryMeta,
} from '@infixer/core';
import { CliError, ExitCode } from './errors';
import type { DataSource } from './sources/types';

/** URL・`/blog/…`・拡張子付きなどの入力を id の形に寄せる */
export function normalizeQuery(query: string): string {
  let value = query.trim();
  if (/^https?:\/\//.test(value)) value = new URL(value).pathname;
  return value
    .replace(/^\/+/, '')
    .replace(/^(?:blog|poems)\//, '')
    .replace(/^src\/content\/(?:blog|poems)\//, '')
    .replace(/\.mdx?$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * 記事を曖昧指定で探す。
 * 完全一致 → 末尾のセグメント一致（`like-weapon`）→ 部分一致の順に、候補が 1 つに決まれば採用する。
 */
export function pickEntry<T extends Pick<EntryMeta, 'id'>>(
  entries: readonly T[],
  query: string,
  label = '記事',
): T {
  const q = normalizeQuery(query);
  const exact = entries.find((entry) => entry.id === q);
  if (exact) return exact;

  for (const match of [
    (id: string) => id.split('/').at(-1) === q,
    (id: string) => id.endsWith(`/${q}`),
    (id: string) => id.includes(q),
  ]) {
    const candidates = entries.filter((entry) => match(entry.id));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      throw new CliError(
        `"${query}" に一致する${label}が複数あります:\n${candidates
          .slice(0, 20)
          .map((entry) => `  ${entry.id}`)
          .join('\n')}`,
        ExitCode.Usage,
      );
    }
  }
  throw new CliError(
    `"${query}" に一致する${label}がありません`,
    ExitCode.NotFound,
  );
}

export async function resolveEntry(
  source: DataSource,
  collection: CollectionName,
  query: string,
): Promise<EntryMeta> {
  return pickEntry(
    await source.listEntries(collection),
    query,
    collections[collection].label,
  );
}
