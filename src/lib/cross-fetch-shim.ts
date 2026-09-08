/**
 * cross-fetch の置き換え。
 *
 * @libsql/hrana-client（@libsql/client の依存）は cross-fetch 経由で fetch を取得するが、
 * バンドル時に Node 向けの node-fetch 実装が選ばれてしまい、Cloudflare Workers 上では
 * node:http シムが不完全なため実行時に落ちる。
 * Workers も Node 22 もグローバル fetch を持っているので、それをそのまま使う。
 */
const globalFetch: typeof fetch = (...args) => fetch(...args);

export default globalFetch;
export { globalFetch as fetch };
export const { Headers, Request, Response } = globalThis;
