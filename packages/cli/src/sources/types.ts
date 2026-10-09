import type {
  CollectionName,
  Entry,
  EntryMeta,
  SearchIndexItem,
  TalkItem,
  WorkItem,
} from '@infixer/core';

/** ローカル（リポジトリのファイル）とリモート（infixer.net の /api/v1）で共通の読み取り口 */
export interface DataSource {
  readonly mode: 'local' | 'remote';
  /** 新しい順 */
  listEntries(collection: CollectionName): Promise<EntryMeta[]>;
  getEntry(collection: CollectionName, id: string): Promise<Entry | undefined>;
  listTalks(): Promise<TalkItem[]>;
  listWorks(): Promise<WorkItem[]>;
  searchIndex(
    collections: readonly CollectionName[],
  ): Promise<SearchIndexItem[]>;
}
