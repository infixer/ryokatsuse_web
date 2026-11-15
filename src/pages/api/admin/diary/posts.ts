import type { APIRoute } from 'astro';
import { createPost } from '../../../../lib/diary/db';
import { json } from '../../../../lib/diary/http';
import { parsePostInput } from '../../../../lib/diary/input';

// 日記を投稿する（/api/admin/* は middleware で Cloudflare Access の認証を通したものだけ届く）
export const POST: APIRoute = async ({ request }) => {
  const input = parsePostInput(await request.json().catch(() => null));
  if (!input.ok) return json({ error: input.error }, 400);

  const post = await createPost(input.value);
  return json({ post }, 201);
};
