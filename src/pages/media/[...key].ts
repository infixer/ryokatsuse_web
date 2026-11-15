import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// 日記の添付画像を R2 から配信する。キーには一意な ID が入るので、ずっとキャッシュしてよい
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^diary\/[\w/-]+\.(webp|jpe?g|png|gif)$/.test(key)) {
    return new Response('Not Found', { status: 404 });
  }

  const object = await env.DIARY_MEDIA.get(key);
  if (!object) return new Response('Not Found', { status: 404 });

  const headers = new Headers({
    'Content-Type':
      object.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: object.httpEtag,
  });

  if (request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
};
