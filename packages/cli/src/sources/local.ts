import path from 'node:path';
import {
  type CollectionName,
  type Entry,
  type EntryMeta,
  type SearchIndexItem,
  sortByDateDesc,
  type TalkItem,
  toEntry,
  toSearchIndexItem,
  type WorkItem,
} from '@infixer/core';
import { type EntryFile, loadEntryFiles, toEntrySource } from '../content';
import { CliError } from '../errors';
import { ITEM_FILES, readItems } from '../items';
import type { DataSource } from './types';

export class LocalSource implements DataSource {
  readonly mode = 'local';
  private readonly cache = new Map<CollectionName, Promise<EntryFile[]>>();

  constructor(readonly root: string) {}

  files(collection: CollectionName): Promise<EntryFile[]> {
    let files = this.cache.get(collection);
    if (!files) {
      files = loadEntryFiles(this.root, collection);
      this.cache.set(collection, files);
    }
    return files;
  }

  private async entries(collection: CollectionName): Promise<Entry[]> {
    const entries = (await this.files(collection)).map((file) => {
      const source = toEntrySource(file);
      if (!source) {
        throw new CliError(
          `${file.displayPath} を読み込めません（${file.problems.join(' / ')}）。infixer validate で確認してください`,
        );
      }
      return toEntry(source);
    });
    return sortByDateDesc(
      entries,
      (entry) => entry.publishDate,
      (entry) => entry.id,
    );
  }

  async listEntries(collection: CollectionName): Promise<EntryMeta[]> {
    return (await this.entries(collection)).map(
      ({ format: _format, body: _body, ...meta }) => meta,
    );
  }

  async getEntry(collection: CollectionName, id: string) {
    return (await this.entries(collection)).find((entry) => entry.id === id);
  }

  listTalks(): Promise<TalkItem[]> {
    return readItems('talks', path.join(this.root, ITEM_FILES.talks));
  }

  listWorks(): Promise<WorkItem[]> {
    return readItems('works', path.join(this.root, ITEM_FILES.works));
  }

  async searchIndex(
    collections: readonly CollectionName[],
  ): Promise<SearchIndexItem[]> {
    const entries = await Promise.all(collections.map((c) => this.entries(c)));
    return entries.flat().map(toSearchIndexItem);
  }
}
