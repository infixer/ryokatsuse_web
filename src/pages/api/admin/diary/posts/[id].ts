import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deletePost, getPost, updatePost } from '../../../../../lib/diary/db';
import { json } from '../../../../../lib/diary/http';
import { parsePostInput } from '../../../../../lib/diary/input';

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  const before = await getPost(id);
  if (!before) return json({ error: '日記が見つかりません' }, 404);

  const input = parsePostInput(await request.json().catch(() => null));
  if (!input.ok) return json({ error: input.error }, 400);

  await updatePost(id, input.value);

  // 外した画像は R2 からも消す
  const kept = new Set(input.value.images.map((image) => image.key));
  const removed = before.images
    .map((image) => image.key)
    .filter((key) => !kept.has(key));
  if (removed.length > 0) await env.DIARY_MEDIA.delete(removed);

  return json({ post: await getPost(id) });
};

export const DELETE: APIRoute = async ({ params }) => {
  const post = await deletePost(params.id ?? '');
  if (!post) return json({ error: '日記が見つかりません' }, 404);

  if (post.images.length > 0) {
    await env.DIARY_MEDIA.delete(post.images.map((image) => image.key));
  }
  return json({ ok: true });
};
