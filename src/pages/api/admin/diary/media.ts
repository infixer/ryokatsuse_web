import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createPostId } from '../../../../lib/diary/db';
import { json } from '../../../../lib/diary/http';

const MAX_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

/**
 * 画像を R2 に保存する。
 * 縮小と EXIF（位置情報など）の除去はブラウザ側で済ませてから送られてくる。
 */
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const width = Number(form?.get('width'));
  const height = Number(form?.get('height'));

  if (!(file instanceof File)) return json({ error: 'file がありません' }, 400);
  const extension = EXTENSIONS[file.type];
  if (!extension) return json({ error: '対応していない画像形式です' }, 400);
  if (file.size > MAX_BYTES)
    return json({ error: '画像が大きすぎます（10MB まで）' }, 413);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return json({ error: '画像サイズが不正です' }, 400);
  }

  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `diary/${now.getUTCFullYear()}/${month}/${createPostId()}.${extension}`;

  await env.DIARY_MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return json({ key, width, height, url: `/media/${key}` }, 201);
};
