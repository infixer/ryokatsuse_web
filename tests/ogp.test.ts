import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchOgp } from '../src/lib/ogp';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const html = (body: string) =>
  new Response(`<html><head>${body}</head></html>`, {
    headers: { 'Content-Type': 'text/html' },
  });

test('YouTube は oEmbed から動画のタイトルとサムネイルを取る', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (url.startsWith('https://www.youtube.com/oembed')) {
      return Response.json({
        title: '動画のタイトル',
        author_name: 'チャンネル名',
        thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      });
    }
    // サーバーからのアクセスで返ってくる、動画の情報が無いページ
    return html('<title> - YouTube</title>');
  }) as typeof fetch;

  const ogp = await fetchOgp('https://www.youtube.com/watch?v=abc');

  assert.equal(ogp.title, '動画のタイトル');
  assert.equal(ogp.description, 'チャンネル名');
  assert.equal(ogp.image, 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
  assert.equal(ogp.siteName, 'YouTube');
  assert.ok(requested[0].includes('url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc'));
});

test('youtu.be の短縮 URL も oEmbed で取る', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).startsWith('https://www.youtube.com/oembed')
      ? Response.json({ title: '短縮URLの動画' })
      : html('<title> - YouTube</title>')) as typeof fetch;

  assert.equal((await fetchOgp('https://youtu.be/xyz')).title, '短縮URLの動画');
});

test('oEmbed に失敗したらページの OGP にフォールバックする', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).startsWith('https://www.youtube.com/oembed')
      ? new Response('Not Found', { status: 404 })
      : html('<meta property="og:title" content="OGPのタイトル">')) as typeof fetch;

  assert.equal(
    (await fetchOgp('https://www.youtube.com/watch?v=fallback')).title,
    'OGPのタイトル',
  );
});

test('fresh: true のときはメモリのキャッシュを使わない', async () => {
  let title = '1回目';
  globalThis.fetch = (async () =>
    html(`<meta property="og:title" content="${title}">`)) as typeof fetch;

  const url = 'https://example.com/cache-test';
  assert.equal((await fetchOgp(url)).title, '1回目');
  title = '2回目';
  assert.equal((await fetchOgp(url)).title, '1回目');
  assert.equal((await fetchOgp(url, {}, { fresh: true })).title, '2回目');
});
