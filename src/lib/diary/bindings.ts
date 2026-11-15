/**
 * 日記で使う Cloudflare バインディング（D1・R2）の最小限の型。
 *
 * @cloudflare/workers-types をグローバルに読み込むと DOM の型（Response など）と衝突するため、
 * 使うメソッドだけをここで宣言している。
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  size: number;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Blob,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}
