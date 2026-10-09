import type { EntryMeta } from '@infixer/core';
import { defineCommand } from '../command';

type YearCount = { year: string; count: number };

const countByYear = (dates: string[]): YearCount[] => {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const year = date.slice(0, 4);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year));
};

const summarize = (entry: EntryMeta | undefined) =>
  entry && { id: entry.id, title: entry.title, publishDate: entry.publishDate };

export const statsCommand = defineCommand({
  name: 'stats',
  summary: '記事数・年別の推移・登壇回数などの統計',
  async run(ctx) {
    const { source } = ctx;
    const [posts, poems, talks, works, index] = await Promise.all([
      source.listEntries('blog'),
      source.listEntries('poems'),
      source.listTalks(),
      source.listWorks(),
      source.searchIndex(['blog']),
    ]);

    const lastUpdated = posts
      .filter((post) => post.updatedDate)
      .sort((a, b) =>
        (b.updatedDate ?? '').localeCompare(a.updatedDate ?? ''),
      )[0];

    const stats = {
      posts: {
        total: posts.length,
        byYear: countByYear(posts.map((post) => post.publishDate)),
        averageChars:
          index.length === 0
            ? 0
            : Math.round(
                index.reduce((sum, item) => sum + item.text.length, 0) /
                  index.length,
              ),
        latest: summarize(posts[0]),
        lastUpdated: lastUpdated && {
          ...summarize(lastUpdated),
          updatedDate: lastUpdated.updatedDate,
        },
      },
      poems: { total: poems.length, latest: summarize(poems[0]) },
      talks: {
        total: talks.length,
        external: talks.filter((talk) => talk.scope === 'external').length,
        internal: talks.filter((talk) => talk.scope === 'internal').length,
        byYear: countByYear(talks.map((talk) => talk.date)),
      },
      works: { total: works.length },
    };

    if (ctx.json) {
      ctx.out.json(stats);
      return 0;
    }

    const { out } = ctx;
    const bars = (rows: YearCount[]) => {
      const max = Math.max(...rows.map((row) => row.count), 1);
      out.table(
        rows.map((row) => [
          `  ${row.year}`,
          String(row.count).padStart(3),
          '█'.repeat(Math.max(1, Math.round((row.count / max) * 30))),
        ]),
        ['dim', undefined, 'cyan'],
      );
    };

    out.print(
      out.style('bold', `記事 ${stats.posts.total} 件`) +
        out.style(
          'dim',
          `（平均 ${stats.posts.averageChars.toLocaleString()} 文字）`,
        ),
    );
    bars(stats.posts.byYear);
    if (stats.posts.latest) {
      out.print(
        `  最新: ${stats.posts.latest.publishDate} ${stats.posts.latest.title}`,
      );
    }
    if (stats.posts.lastUpdated) {
      out.print(
        `  最終更新: ${stats.posts.lastUpdated.updatedDate} ${stats.posts.lastUpdated.title}`,
      );
    }
    out.print();
    out.print(out.style('bold', `ポエム ${stats.poems.total} 件`));
    if (stats.poems.latest) {
      out.print(
        `  最新: ${stats.poems.latest.publishDate} ${stats.poems.latest.title}`,
      );
    }
    out.print();
    out.print(
      out.style('bold', `登壇 ${stats.talks.total} 回`) +
        out.style(
          'dim',
          `（社外 ${stats.talks.external} / 社内 ${stats.talks.internal}）`,
        ),
    );
    bars(stats.talks.byYear);
    out.print();
    out.print(out.style('bold', `作ったもの ${stats.works.total} 件`));
    return 0;
  },
});
