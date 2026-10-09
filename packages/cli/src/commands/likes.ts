import type { LikesItem } from '@infixer/core';
import { defineCommand, intOption, requireArg } from '../command';
import type { Context } from '../context';
import { CliError } from '../errors';
import { resolveEntry } from '../resolve';

/** いいね数は DB にあるので、モードに関係なく常にサイトの API を読む */
async function getJson<T>(ctx: Context, pathname: string): Promise<T> {
  const url = new URL(pathname, ctx.baseUrl);
  let response: Response;
  try {
    response = await ctx.fetch(url);
  } catch (error) {
    throw new CliError(`${url} に接続できません: ${(error as Error).message}`);
  }
  if (!response.ok)
    throw new CliError(`${url} が ${response.status} を返しました`);
  return (await response.json()) as T;
}

export const likesCommands = [
  defineCommand({
    name: 'likes top',
    summary: 'いいねの多い記事',
    options: {
      limit: {
        type: 'string',
        description: '件数（既定: 10、最大 100）',
        placeholder: 'n',
      },
    },
    async run(ctx, _args, values) {
      const limit = intOption(values, 'limit') ?? 10;
      const [ranking, posts] = await Promise.all([
        getJson<LikesItem[]>(ctx, `/api/v1/likes/top?limit=${limit}`),
        ctx.source.listEntries('blog'),
      ]);
      const titles = new Map(posts.map((post) => [post.id, post.title]));
      const rows = ranking.map((item) => ({
        ...item,
        title: titles.get(item.id),
      }));
      if (ctx.json) {
        ctx.out.json(rows);
      } else {
        ctx.out.table(
          rows.map((row) => [
            String(row.count).padStart(4),
            row.id,
            row.title ?? '',
          ]),
          ['bold', 'cyan'],
        );
      }
      return 0;
    },
  }),
  defineCommand({
    name: 'likes',
    args: '<id>',
    summary: '記事のいいね数',
    async run(ctx, args) {
      const post = await resolveEntry(
        ctx.source,
        'blog',
        requireArg(args, 0, 'id'),
      );
      const { count } = await getJson<{ count: number }>(
        ctx,
        `/api/likes/get?slug=${encodeURIComponent(post.id)}`,
      );
      if (ctx.json) ctx.out.json({ id: post.id, count });
      else
        ctx.out.print(
          `${ctx.out.style('bold', String(count))} ${post.id} ${post.title}`,
        );
      return 0;
    },
  }),
];
