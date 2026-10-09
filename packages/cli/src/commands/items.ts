import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isValidISODate,
  type TalkItem,
  talkSchema,
  talkScopes,
  type WorkItem,
  workSchema,
} from '@infixer/core';
import type { z } from 'zod';
import { defineCommand, intOption, stringOption } from '../command';
import { type Context, requireLocal } from '../context';
import { CliError, ExitCode } from '../errors';
import {
  idFromUrl,
  ITEM_FILES,
  type ItemKind,
  readItems,
  stringifyItems,
  uniqueId,
} from '../items';
import { ask } from '../prompt';

const scopeLabel = { external: '社外', internal: '社内' } as const;

/** 先頭のコメント行を残したまま書き戻す */
async function writeItems(
  root: string,
  kind: ItemKind,
  items: (TalkItem | WorkItem)[],
) {
  const filePath = path.join(root, ITEM_FILES[kind]);
  const original = await fs.readFile(filePath, 'utf-8').catch(() => '');
  const header = original.match(/^(?:#.*\n)*/)?.[0] ?? '';
  await fs.writeFile(filePath, header + stringifyItems(items));
}

function assertValid<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new CliError(message, ExitCode.Usage);
  }
  return result.data;
}

function printAdded(ctx: Context, kind: ItemKind, item: TalkItem | WorkItem) {
  if (ctx.json) return ctx.out.json(item);
  ctx.out.print(
    `${ctx.out.style('green', '追加')} ${ITEM_FILES[kind]} ${item.id} ${item.title}`,
  );
}

export const talkCommands = [
  defineCommand({
    name: 'talks list',
    summary: '登壇資料の一覧（新しい順）',
    options: {
      scope: {
        type: 'string',
        description: 'external（社外）/ internal（社内）',
        placeholder: 'scope',
      },
      year: {
        type: 'string',
        description: '年で絞り込む',
        placeholder: '2026',
      },
      limit: { type: 'string', description: '件数の上限', placeholder: 'n' },
    },
    async run(ctx, _args, values) {
      const scope = stringOption(values, 'scope');
      if (scope !== undefined && !talkScopes.includes(scope as never)) {
        throw new CliError(
          '--scope は external か internal です',
          ExitCode.Usage,
        );
      }
      const year = intOption(values, 'year');
      let talks = [...(await ctx.source.listTalks())].sort((a, b) =>
        b.date.localeCompare(a.date),
      );
      if (scope) talks = talks.filter((talk) => talk.scope === scope);
      if (year !== undefined)
        talks = talks.filter((talk) => talk.date.startsWith(`${year}-`));
      talks = talks.slice(0, intOption(values, 'limit'));

      if (ctx.json) {
        ctx.out.json(talks);
      } else if (talks.length === 0) {
        ctx.out.info('該当するものはありません');
      } else {
        ctx.out.table(
          talks.map((talk) => [
            talk.date,
            scopeLabel[talk.scope],
            talk.title,
            talk.event,
          ]),
          ['dim', 'magenta', undefined, 'dim'],
        );
      }
      return 0;
    },
  }),
  defineCommand({
    name: 'talks add',
    summary: '登壇資料を追加する（ローカル専用・足りない項目は対話で入力）',
    options: {
      title: { type: 'string', description: 'タイトル', placeholder: 'text' },
      url: { type: 'string', description: '資料の URL', placeholder: 'url' },
      date: {
        type: 'string',
        description: '登壇日',
        placeholder: 'YYYY-MM-DD',
      },
      event: { type: 'string', description: 'イベント名', placeholder: 'text' },
      scope: {
        type: 'string',
        description: 'external（既定）/ internal',
        placeholder: 'scope',
      },
      id: {
        type: 'string',
        description: 'id（既定: 登壇日）',
        placeholder: 'id',
      },
    },
    async run(ctx, _args, values) {
      const { root } = requireLocal(ctx, 'talks add');
      const talks = await readItems<TalkItem>(
        'talks',
        path.join(root, ITEM_FILES.talks),
      );

      const title = await ask(stringOption(values, 'title'), {
        label: 'タイトル',
        flag: 'title',
      });
      const url = await ask(stringOption(values, 'url'), {
        label: 'URL',
        flag: 'url',
      });
      const date = await ask(stringOption(values, 'date'), {
        label: '登壇日 (YYYY-MM-DD)',
        flag: 'date',
      });
      if (!isValidISODate(date)) {
        throw new CliError(
          `登壇日は YYYY-MM-DD の実在する日付にしてください: ${date}`,
          ExitCode.Usage,
        );
      }
      const event = await ask(stringOption(values, 'event'), {
        label: 'イベント名',
        flag: 'event',
      });
      const scope = await ask(stringOption(values, 'scope'), {
        label: 'external / internal',
        flag: 'scope',
        fallback: 'external',
      });
      const talk = assertValid(talkSchema, { title, url, date, event, scope });

      const id =
        stringOption(values, 'id') ??
        uniqueId(
          date,
          talks.map((t) => t.id),
        );
      if (talks.some((t) => t.id === id)) {
        throw new CliError(`id "${id}" は既に使われています`, ExitCode.Usage);
      }
      if (talks.some((t) => t.url === talk.url)) {
        ctx.out.warn(`同じ URL の登壇資料が既にあります: ${talk.url}`);
      }

      const item: TalkItem = { id, ...talk };
      // データは時系列順（同じ日付なら追加順）
      const next = [...talks, item].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      await writeItems(root, 'talks', next);
      printAdded(ctx, 'talks', item);
      return 0;
    },
  }),
];

export const workCommands = [
  defineCommand({
    name: 'works list',
    summary: '作ったものの一覧',
    async run(ctx) {
      const works = await ctx.source.listWorks();
      if (ctx.json) {
        ctx.out.json(works);
      } else {
        ctx.out.table(
          works.map((work) => [work.id, work.title, work.description]),
          ['cyan', 'bold', 'dim'],
        );
      }
      return 0;
    },
  }),
  defineCommand({
    name: 'works add',
    summary: '作ったものを追加する（ローカル専用・足りない項目は対話で入力）',
    options: {
      title: { type: 'string', description: '名前', placeholder: 'text' },
      url: { type: 'string', description: 'URL', placeholder: 'url' },
      description: { type: 'string', description: '説明', placeholder: 'text' },
      id: {
        type: 'string',
        description: 'id（既定: URL から推測）',
        placeholder: 'id',
      },
    },
    async run(ctx, _args, values) {
      const { root } = requireLocal(ctx, 'works add');
      const works = await readItems<WorkItem>(
        'works',
        path.join(root, ITEM_FILES.works),
      );

      const title = await ask(stringOption(values, 'title'), {
        label: '名前',
        flag: 'title',
      });
      const url = await ask(stringOption(values, 'url'), {
        label: 'URL',
        flag: 'url',
      });
      const description = await ask(stringOption(values, 'description'), {
        label: '説明',
        flag: 'description',
      });
      const work = assertValid(workSchema, { title, url, description });

      const guessed = idFromUrl(work.url);
      const id = await ask(
        stringOption(values, 'id') ??
          (guessed &&
            uniqueId(
              guessed,
              works.map((w) => w.id),
            )),
        {
          label: 'id（英小文字・数字・-）',
          flag: 'id',
        },
      );
      if (works.some((w) => w.id === id)) {
        throw new CliError(`id "${id}" は既に使われています`, ExitCode.Usage);
      }

      const item: WorkItem = { id, ...work };
      // 作ったものは並び順がそのまま表示順なので末尾に足す
      await writeItems(root, 'works', [...works, item]);
      printAdded(ctx, 'works', item);
      return 0;
    },
  }),
];
