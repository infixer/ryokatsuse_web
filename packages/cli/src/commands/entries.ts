import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type CollectionName,
  collections,
  type EntryMeta,
  entryPath,
  isValidISODate,
  stringifyFrontmatter,
  todayISODate,
} from '@infixer/core';
import { parseDocument, Scalar } from 'yaml';
import {
  type Command,
  defineCommand,
  intOption,
  requireArg,
  stringOption,
} from '../command';
import { collectionDir } from '../content';
import { type Context, requireLocal } from '../context';
import { CliError, ExitCode } from '../errors';
import { renderMarkdown } from '../markdown';
import { openUrl } from '../open';
import { ask } from '../prompt';
import { pickEntry, resolveEntry } from '../resolve';
import { printFindings, validateTargets } from './validate';

const NAME_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function printList(ctx: Context, entries: EntryMeta[]) {
  if (ctx.json) return ctx.out.json(entries);
  if (entries.length === 0) return ctx.out.info('該当するものはありません');
  ctx.out.table(
    entries.map((entry) => [entry.publishDate, entry.id, entry.title]),
    ['dim', 'cyan'],
  );
}

async function show(
  ctx: Context,
  collection: CollectionName,
  meta: EntryMeta,
  { raw, metaOnly }: { raw: boolean; metaOnly: boolean },
) {
  if (metaOnly) {
    if (ctx.json) return ctx.out.json(meta);
    ctx.out.table(
      Object.entries(meta).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
      ['dim'],
    );
    return;
  }

  const entry = await ctx.source.getEntry(collection, meta.id);
  if (!entry) {
    throw new CliError(`${meta.id} の本文を取得できません`, ExitCode.NotFound);
  }
  if (ctx.json) return ctx.out.json(entry);
  if (raw) return ctx.out.print(entry.body.replace(/\n+$/, ''));

  ctx.out.print(ctx.out.style(['bold', 'cyan'], entry.title));
  ctx.out.print(
    ctx.out.style(
      'dim',
      [
        entry.publishDate,
        entry.updatedDate && `更新 ${entry.updatedDate}`,
        entry.url,
      ]
        .filter(Boolean)
        .join('  '),
    ),
  );
  ctx.out.print();
  ctx.out.print(renderMarkdown(entry.body, ctx.out));
  if (entry.references?.length) {
    ctx.out.print();
    ctx.out.print(ctx.out.style('bold', '参考'));
    for (const ref of entry.references) {
      ctx.out.print(
        `• ${ref.title ? `${ref.title} ` : ''}${ctx.out.style('dim', ref.url)}`,
      );
    }
  }
}

/** 記事ファイルを探す（ローカル専用コマンド用） */
async function findFile(
  ctx: Context,
  collection: CollectionName,
  query: string,
) {
  const { source } = requireLocal(ctx, 'このコマンド');
  const files = await source.files(collection);
  return pickEntry(files, query, collections[collection].label);
}

export function entryCommands(
  resource: string,
  collection: CollectionName,
): Command[] {
  const label = collections[collection].label;

  const commands: Command[] = [
    defineCommand({
      name: `${resource} list`,
      summary: `${label}の一覧（新しい順）`,
      options: {
        year: {
          type: 'string',
          description: '年で絞り込む',
          placeholder: '2026',
        },
        since: {
          type: 'string',
          description: 'この日付以降（YYYY-MM-DD）',
          placeholder: 'date',
        },
        limit: { type: 'string', description: '件数の上限', placeholder: 'n' },
      },
      async run(ctx, _args, values) {
        const year = intOption(values, 'year');
        const limit = intOption(values, 'limit');
        const since = stringOption(values, 'since');
        if (since !== undefined && !isValidISODate(since)) {
          throw new CliError(
            '--since は YYYY-MM-DD で指定してください',
            ExitCode.Usage,
          );
        }
        let entries = await ctx.source.listEntries(collection);
        if (year !== undefined) {
          entries = entries.filter((e) => e.publishDate.startsWith(`${year}-`));
        }
        if (since !== undefined) {
          entries = entries.filter((e) => e.publishDate >= since);
        }
        printList(ctx, entries.slice(0, limit));
        return 0;
      },
    }),
    defineCommand({
      name: `${resource} show`,
      args: '<id>',
      summary: `${label}の本文を表示する`,
      options: {
        raw: { type: 'boolean', description: 'Markdown の原文をそのまま出す' },
        meta: {
          type: 'boolean',
          description: 'frontmatter（メタデータ）だけ出す',
        },
      },
      async run(ctx, args, values) {
        const meta = await resolveEntry(
          ctx.source,
          collection,
          requireArg(args, 0, 'id'),
        );
        await show(ctx, collection, meta, {
          raw: values.raw === true,
          metaOnly: values.meta === true,
        });
        return 0;
      },
    }),
    defineCommand({
      name: `${resource} latest`,
      summary: `最新の${label}を表示する`,
      options: {
        raw: { type: 'boolean', description: 'Markdown の原文をそのまま出す' },
        meta: {
          type: 'boolean',
          description: 'frontmatter（メタデータ）だけ出す',
        },
      },
      async run(ctx, _args, values) {
        const [latest] = await ctx.source.listEntries(collection);
        if (!latest)
          throw new CliError(`${label}がありません`, ExitCode.NotFound);
        await show(ctx, collection, latest, {
          raw: values.raw === true,
          metaOnly: values.meta === true,
        });
        return 0;
      },
    }),
    defineCommand({
      name: `${resource} open`,
      args: '<id>',
      summary: `${label}をブラウザーで開く`,
      async run(ctx, args) {
        const meta = await resolveEntry(
          ctx.source,
          collection,
          requireArg(args, 0, 'id'),
        );
        const url = new URL(
          entryPath(collection, meta.id),
          ctx.baseUrl,
        ).toString();
        if (ctx.json) ctx.out.json({ id: meta.id, url });
        else ctx.out.print(url);
        openUrl(url);
        return 0;
      },
    }),
    defineCommand({
      name: `${resource} new`,
      args: '<name>',
      summary: `${label}の雛形を作る（ローカル専用）`,
      options: {
        title: {
          type: 'string',
          description: 'タイトル（省略時は対話で入力）',
          placeholder: 'text',
        },
        date: {
          type: 'string',
          description: '公開日（既定: 今日）',
          placeholder: 'YYYY-MM-DD',
        },
        mdx: { type: 'boolean', description: '.md ではなく .mdx で作る' },
      },
      async run(ctx, args, values) {
        const { root, source } = requireLocal(ctx, `${resource} new`);
        const name = requireArg(args, 0, 'name');
        if (!NAME_PATTERN.test(name)) {
          throw new CliError(
            `<name> は英小文字・数字・- _ で指定してください: ${name}`,
            ExitCode.Usage,
          );
        }
        const date = stringOption(values, 'date') ?? todayISODate();
        if (!isValidISODate(date)) {
          throw new CliError(
            '--date は YYYY-MM-DD で指定してください',
            ExitCode.Usage,
          );
        }
        const id = `${date.slice(0, 4)}/${name}`;
        const existing = (await source.files(collection)).find(
          (f) => f.id === id,
        );
        if (existing) {
          throw new CliError(
            `${existing.displayPath} が既にあります`,
            ExitCode.Usage,
          );
        }
        const title = await ask(stringOption(values, 'title'), {
          label: 'タイトル',
          flag: 'title',
        });

        const filePath = path.join(
          collectionDir(root, collection),
          `${id}.${values.mdx === true ? 'mdx' : 'md'}`,
        );
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(
          filePath,
          stringifyFrontmatter({ title, publishDate: date }, '\n'),
          { flag: 'wx' },
        );

        const displayPath = path.relative(root, filePath);
        if (ctx.json) ctx.out.json({ id, path: displayPath });
        else ctx.out.print(`${ctx.out.style('green', '作成')} ${displayPath}`);
        return 0;
      },
    }),
    defineCommand({
      name: `${resource} edit`,
      args: '<id>',
      summary: '$EDITOR で開き、閉じたあと validate する（ローカル専用）',
      async run(ctx, args) {
        const { root } = requireLocal(ctx, `${resource} edit`);
        const file = await findFile(ctx, collection, requireArg(args, 0, 'id'));
        const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
        const result = spawnSync(`${editor} "${file.filePath}"`, {
          stdio: 'inherit',
          shell: true,
        });
        if (result.status !== 0) {
          throw new CliError(
            `エディターが終了コード ${result.status} で終了しました`,
          );
        }
        const findings = await validateTargets(
          root,
          new Set([`${collection}:${file.id}`]),
        );
        printFindings(ctx, findings);
        return findings.some((f) => f.level === 'error') ? ExitCode.Failure : 0;
      },
    }),
  ];

  if (collection === 'blog') {
    commands.push(
      defineCommand({
        name: `${resource} touch`,
        args: '<id>',
        summary: 'updatedDate を今日（または --date）にする（ローカル専用）',
        options: {
          date: {
            type: 'string',
            description: '更新日（既定: 今日）',
            placeholder: 'YYYY-MM-DD',
          },
        },
        async run(ctx, args, values) {
          const { root } = requireLocal(ctx, `${resource} touch`);
          const file = await findFile(
            ctx,
            collection,
            requireArg(args, 0, 'id'),
          );
          if (!file.parsed || !file.data) {
            throw new CliError(
              `${file.displayPath} の frontmatter を読めません`,
            );
          }
          const date = stringOption(values, 'date') ?? todayISODate();
          if (!isValidISODate(date)) {
            throw new CliError(
              '--date は YYYY-MM-DD で指定してください',
              ExitCode.Usage,
            );
          }
          if (date < file.data.publishDate) {
            throw new CliError(
              `更新日 ${date} が公開日 ${file.data.publishDate} より前です`,
              ExitCode.Usage,
            );
          }

          // 既存の書式（クォートやキーの順番）を崩さないよう YAML の Document を書き換える
          const doc = parseDocument(file.parsed.frontmatter);
          const value = new Scalar(date);
          value.type = Scalar.QUOTE_DOUBLE;
          doc.set('updatedDate', value);
          await fs.writeFile(
            file.filePath,
            `---\n${doc.toString()}---\n${file.parsed.body}`,
          );

          if (ctx.json) {
            ctx.out.json({
              id: file.id,
              path: path.relative(root, file.filePath),
              updatedDate: date,
            });
          } else {
            ctx.out.print(
              `${ctx.out.style('green', '更新')} ${file.displayPath} updatedDate: ${date}`,
            );
          }
          return 0;
        },
      }),
    );
  }

  return commands;
}

export const postCommands = entryCommands('posts', 'blog');
export const poemCommands = entryCommands('poems', 'poems');
