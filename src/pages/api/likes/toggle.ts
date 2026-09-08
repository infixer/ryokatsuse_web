import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb, Likes } from '../../../lib/db';

export async function POST(context: APIContext) {
  const body = await context.request.json().catch(() => ({}));
  const slug = body?.slug;
  const action = body?.action; // 'like' or 'unlike'

  if (!slug) {
    return new Response(
      JSON.stringify({ error: 'Slug parameter is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const db = getDb();
  const existing = await db.select().from(Likes).where(eq(Likes.slug, slug));
  const currentCount = existing[0]?.count ?? 0;

  if (action === 'unlike') {
    // いいね解除
    const newCount = Math.max(0, currentCount - 1);
    if (existing.length > 0) {
      await db
        .update(Likes)
        .set({ count: newCount })
        .where(eq(Likes.slug, slug));
    }
    return new Response(JSON.stringify({ count: newCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    // いいね追加
    const newCount = currentCount + 1;
    if (existing.length > 0) {
      await db
        .update(Likes)
        .set({ count: newCount })
        .where(eq(Likes.slug, slug));
    } else {
      await db.insert(Likes).values({ slug, count: 1 });
    }
    return new Response(JSON.stringify({ count: newCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
