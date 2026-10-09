import {
  API_VERSION,
  type ApiIndex,
  type CollectionName,
  collections,
  type Entry,
  type EntryMeta,
  type SearchIndexItem,
  type TalkItem,
  type WorkItem,
} from '@infixer/core';
import { CliError } from '../errors';
import type { DataSource } from './types';

/** infixer.net の /api/v1（ビルド時に静的生成した JSON）を読む */
export class RemoteSource implements DataSource {
  readonly mode = 'remote';
  private checked?: Promise<void>;
  private searchIndexCache?: Promise<SearchIndexItem[]>;

  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** 404 のときは undefined */
  async request<T>(pathname: string): Promise<T | undefined> {
    const url = new URL(pathname, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch (error) {
      throw new CliError(
        `${url} に接続できません: ${(error as Error).message}`,
      );
    }
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new CliError(`${url} が ${response.status} を返しました`);
    }
    return (await response.json()) as T;
  }

  private async get<T>(pathname: string): Promise<T> {
    await this.ensureCompatible();
    const body = await this.request<T>(pathname);
    if (body === undefined) {
      throw new CliError(`${new URL(pathname, this.baseUrl)} が見つかりません`);
    }
    return body;
  }

  private ensureCompatible(): Promise<void> {
    this.checked ??= this.request<ApiIndex>('/api/v1/index.json').then(
      (index) => {
        if (!index) {
          throw new CliError(
            `${this.baseUrl} に /api/v1 がありません（デプロイ前の可能性があります）`,
          );
        }
        if (index.version !== API_VERSION) {
          throw new CliError(
            `API のバージョンが合いません（サイト: ${index.version} / CLI: ${API_VERSION}）。リポジトリを最新にしてください`,
          );
        }
      },
    );
    return this.checked;
  }

  listEntries(collection: CollectionName): Promise<EntryMeta[]> {
    return this.get(`/api/v1/${collections[collection].apiSegment}.json`);
  }

  async getEntry(collection: CollectionName, id: string) {
    await this.ensureCompatible();
    return this.request<Entry>(
      `/api/v1/${collections[collection].apiSegment}/${id}.json`,
    );
  }

  listTalks(): Promise<TalkItem[]> {
    return this.get('/api/v1/talks.json');
  }

  listWorks(): Promise<WorkItem[]> {
    return this.get('/api/v1/works.json');
  }

  async searchIndex(
    targets: readonly CollectionName[],
  ): Promise<SearchIndexItem[]> {
    this.searchIndexCache ??= this.get('/api/v1/search-index.json');
    return (await this.searchIndexCache).filter((item) =>
      targets.includes(item.collection),
    );
  }
}
