import { getCollection } from 'astro:content';
import {
  type CollectionName,
  type Entry,
  sortByDateDesc,
  type TalkItem,
  toEntry,
  type WorkItem,
} from '@infixer/core';

/**
 * CLI（infixer --remote）向け `/api/v1/*` の共通処理。
 * レスポンスの組み立ては @infixer/core に寄せ、CLI のローカルモードと同じ形にする。
 */

export async function loadEntries(
  collection: CollectionName,
  site: URL | string | undefined,
): Promise<Entry[]> {
  const entries = await getCollection(collection);
  return sortByDateDesc(
    entries.map((entry) =>
      toEntry(
        {
          collection,
          id: entry.id,
          data: entry.data,
          body: entry.body ?? '',
          filePath: entry.filePath ?? '',
        },
        site?.toString(),
      ),
    ),
    (entry) => entry.publishDate,
    (entry) => entry.id,
  );
}

/** 一覧用に本文を落とす */
export const toMeta = ({ format: _format, body: _body, ...meta }: Entry) =>
  meta;

/** YAML に書いた順に並べ、order を落とす */
const inYamlOrder = <T extends { order: number }>(
  entries: { id: string; data: T }[],
) =>
  [...entries]
    .sort((a, b) => a.data.order - b.data.order)
    .map(({ id, data: { order: _order, ...data } }) => ({ id, ...data }));

export const loadTalks = async (): Promise<TalkItem[]> =>
  inYamlOrder(await getCollection('talks'));

export const loadWorks = async (): Promise<WorkItem[]> =>
  inYamlOrder(await getCollection('works'));

export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  });
