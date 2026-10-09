import fs from 'node:fs/promises';
import {
  type Talk,
  type TalkItem,
  talkSchema,
  type Work,
  type WorkItem,
  workSchema,
} from '@infixer/core';
import { slug as githubSlug } from 'github-slugger';
import { Document, isMap, parse, Scalar } from 'yaml';
import { CliError, ExitCode } from './errors';

/** 登壇資料・作ったもののデータファイル（リポジトリルートからの相対パス） */
export const ITEM_FILES = {
  talks: 'src/content/talks.yaml',
  works: 'src/content/works.yaml',
} as const;

export type ItemKind = keyof typeof ITEM_FILES;

const ASCII_SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/**
 * URL から id の候補を作る（作ったもの用）。
 * パスの最後のセグメント（数字だけ・index.html は除く）が ASCII ならそれを使い、
 * なければホスト名の先頭ラベル（xxx.vercel.app の xxx）を使う。
 * 手前のセグメントはユーザー名であることが多いので見ない。
 */
export function idFromUrl(url: string): string | undefined {
  const { hostname, pathname } = new URL(url);
  const last = pathname
    .split('/')
    .filter((segment) => segment && !/^(?:\d+|index\.html?)$/.test(segment))
    .at(-1);
  if (last) {
    const slug = githubSlug(decodeURIComponent(last).replace(/\.html?$/, ''));
    return ASCII_SLUG.test(slug) ? slug : undefined;
  }

  const label = githubSlug(hostname.replace(/^www\./, '').split('.')[0] ?? '');
  // 共有サービスのトップは id として意味がない
  const sharedHosts = ['scrapbox', 'speakerdeck', 'github', 'figma', 'docs'];
  return ASCII_SLUG.test(label) && !sharedHosts.includes(label)
    ? label
    : undefined;
}

/** 既存の id と衝突しないように `-2`, `-3` … を付ける */
export function uniqueId(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export type ItemIssue = { index: number; id?: string; message: string };

/** YAML を読み、スキーマ違反は issues に積んで有効な行だけ返す */
export function parseItems<T extends Talk | Work>(
  kind: ItemKind,
  source: string,
): { items: (T & { id: string })[]; issues: ItemIssue[] } {
  const schema = kind === 'talks' ? talkSchema : workSchema;
  const raw: unknown = parse(source) ?? [];
  if (!Array.isArray(raw)) {
    return {
      items: [],
      issues: [{ index: -1, message: '配列ではありません' }],
    };
  }

  const items: (T & { id: string })[] = [];
  const issues: ItemIssue[] = [];
  const seen = new Set<string>();

  raw.forEach((row: unknown, index) => {
    const id =
      row &&
      typeof row === 'object' &&
      'id' in row &&
      typeof row.id === 'string'
        ? row.id
        : undefined;
    if (!id) {
      issues.push({ index, message: 'id がありません' });
      return;
    }
    if (seen.has(id)) {
      issues.push({ index, id, message: `id "${id}" が重複しています` });
    }
    seen.add(id);

    const result = schema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          index,
          id,
          message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        });
      }
      return;
    }
    items.push({ id, ...(result.data as T) });
  });

  return { items, issues };
}

export async function readItems<T extends Talk | Work>(
  kind: ItemKind,
  filePath: string,
): Promise<(T & { id: string })[]> {
  const { items, issues } = parseItems<T>(
    kind,
    await fs.readFile(filePath, 'utf-8'),
  );
  if (issues.length > 0) {
    throw new CliError(
      `${ITEM_FILES[kind]} に不正なデータがあります（infixer validate で確認できます）`,
      ExitCode.Failure,
    );
  }
  return items;
}

/** id を先頭にして YAML に書き出す。id・日付は js-yaml に Date と解釈されないようクォートする */
export function stringifyItems(
  items: readonly (TalkItem | WorkItem)[],
): string {
  const doc = new Document(items.map(({ id, ...rest }) => ({ id, ...rest })));
  if (doc.contents && 'items' in doc.contents) {
    for (const node of doc.contents.items) {
      if (!isMap(node)) continue;
      for (const key of ['id', 'date']) {
        const value = node.get(key, true);
        if (value instanceof Scalar) value.type = Scalar.QUOTE_DOUBLE;
      }
    }
  }
  return doc.toString({ lineWidth: 0 });
}
