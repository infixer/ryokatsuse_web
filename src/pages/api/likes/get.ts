import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb, Likes } from '../../../lib/db';

export async function GET(context: APIContext) {
  const slug = context.url.searchParams.get('slug');

  if (!slug) {
    return new Response(
      JSON.stringify({ error: 'Slug parameter is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // DBからいいね数を取得
  const db = getDb();
  const result = await db.select().from(Likes).where(eq(Likes.slug, slug));
  const count = result[0]?.count ?? 0;

  return new Response(JSON.stringify({ count }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
