import { defineMiddleware } from 'astro:middleware';
import { getAccessToken, verifyAccessJwt } from './lib/diary/access';

const isAdminPath = (pathname: string) =>
  pathname === '/admin' ||
  pathname.startsWith('/admin/') ||
  pathname.startsWith('/api/admin/');

const deny = (pathname: string, message: string) =>
  pathname.startsWith('/api/')
    ? new Response(JSON.stringify({ error: message }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    : new Response(message, {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });

/**
 * 管理画面（日記の投稿）を Cloudflare Access の JWT で守る。
 * astro dev ではローカルで確認できるよう検証しない。
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!isAdminPath(pathname) || import.meta.env.DEV) return next();

  const { env } = await import('cloudflare:workers');
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;

  // 設定漏れのときは開けずに閉じる
  if (!teamDomain || !aud) {
    return deny(pathname, 'Cloudflare Access の設定がありません');
  }

  const token = getAccessToken(context.request);
  const payload = token
    ? await verifyAccessJwt(token, { teamDomain, aud })
    : null;
  if (!payload) return deny(pathname, '認証が必要です');

  // 管理画面はキャッシュさせない
  const response = await next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
