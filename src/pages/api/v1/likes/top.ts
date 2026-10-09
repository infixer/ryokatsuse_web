import type { APIContext } from 'astro';
import type { LikesItem } from '@infixer/core';
import { desc, gt } from 'drizzle-orm';
import { json } from '../../../../lib/api-v1';
import { getDb, Likes } from '../../../../lib/db';

const MAX_LIMIT = 100;

/** いいね数の多い記事（読み取り専用） */
export async function GET(context: APIContext) {
  const limit = Number(context.url.searchParams.get('limit') ?? 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return json(
      { error: `limit は 1〜${MAX_LIMIT} の整数で指定してください` },
      { status: 400 },
    );
  }

  const rows = await getDb()
    .select()
    .from(Likes)
    .where(gt(Likes.count, 0))
    .orderBy(desc(Likes.count))
    .limit(limit);

  const body: LikesItem[] = rows.map((row) => ({
    id: row.slug,
    count: row.count,
  }));
  return json(body);
}
