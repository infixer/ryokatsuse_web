import {
  type CollectionName,
  collectionNames,
  excerpt,
  includesQuery,
  isCollectionName,
  sortByDateDesc,
} from '@infixer/core';
import { defineCommand, intOption, stringOption } from '../command';
import { CliError, ExitCode } from '../errors';

export type SearchResult = {
  id: string;
  collection: CollectionName;
  title: string;
  publishDate: string;
  url: string;
  excerpt?: string;
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchCommand = defineCommand({
  name: 'search',
  args: '<query>',
  summary: 'タイトルと本文を全文検索する',
  options: {
    'title-only': { type: 'boolean', description: 'タイトルだけを検索する' },
    collection: {
      type: 'string',
      description: 'blog / poems に絞る（既定: 両方）',
      placeholder: 'name',
    },
    limit: {
      type: 'string',
      description: '件数の上限（既定: 20）',
      placeholder: 'n',
    },
  },
  async run(ctx, args, values) {
    const query = args.join(' ').trim();
    if (!query)
      throw new CliError('<query> を指定してください', ExitCode.Usage);
    const collection = stringOption(values, 'collection');
    if (collection !== undefined && !isCollectionName(collection)) {
      throw new CliError('--collection は blog か poems です', ExitCode.Usage);
    }
    const targets = collection ? [collection] : collectionNames;
    const titleOnly = values['title-only'] === true;
    const limit = intOption(values, 'limit') ?? 20;

    const items = await ctx.source.searchIndex(targets);
    const matched = sortByDateDesc(
      items.filter(
        (item) =>
          includesQuery(item.title, query) ||
          (!titleOnly && includesQuery(item.text, query)),
      ),
      (item) => item.publishDate,
      (item) => `${item.collection}:${item.id}`,
    );
    const results: SearchResult[] = matched.slice(0, limit).map((item) => ({
      id: item.id,
      collection: item.collection,
      title: item.title,
      publishDate: item.publishDate,
      url: item.url,
      ...(!titleOnly && { excerpt: excerpt(item.text, query) }),
    }));

    if (ctx.json) {
      ctx.out.json(results);
      return 0;
    }
    if (results.length === 0) {
      ctx.out.info(`「${query}」に一致するものはありません`);
      return ExitCode.NotFound;
    }
    const highlight = (text: string) =>
      text.replace(new RegExp(escapeRegExp(query), 'gi'), (hit) =>
        ctx.out.style(['bold', 'yellow'], hit),
      );
    for (const result of results) {
      const id =
        result.collection === 'poems' ? `poems/${result.id}` : result.id;
      ctx.out.print(
        `${ctx.out.style('dim', result.publishDate)}  ${ctx.out.style('cyan', id)}  ${highlight(result.title)}`,
      );
      if (result.excerpt)
        ctx.out.print(
          `    ${ctx.out.style('dim', '…')}${highlight(result.excerpt.replace(/^…|…$/g, ''))}${ctx.out.style('dim', '…')}`,
        );
    }
    if (matched.length > results.length) {
      ctx.out.info(
        ctx.out.style(
          'dim',
          `ほかに ${matched.length - results.length} 件あります（--limit で増やせます）`,
        ),
      );
    }
    return 0;
  },
});
