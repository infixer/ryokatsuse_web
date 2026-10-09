import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type CollectionName,
  collectionNames,
  isValidISODate,
} from '@infixer/core';
import { type EntryFile, loadEntryFiles } from './content';
import { ITEM_FILES, type ItemKind, parseItems } from './items';

export type Finding = {
  level: 'error' | 'warning';
  /** リポジトリルートからの相対パス */
  file: string;
  line?: number;
  message: string;
  /** 記事単位の検出なら `<collection>:<id>` */
  entry?: string;
};

const INTERNAL_ORIGIN = /^https?:\/\/(?:www\.)?(?:infixer\.net|ryokatsu\.dev)/;

/**
 * 本文中のサイト内リンク（/blog/…・/poems/…・旧ドメイン含む）とローカルファイル参照を拾う。
 * 相対パスはリンク先・属性値として書かれたもの（直前が ( " ' ）だけを対象にする。
 */
const LINK_PATTERN =
  /(?:(?<=[("'])|https?:\/\/(?:www\.)?(?:infixer\.net|ryokatsu\.dev))\/[^\s)"'<>]*/g;

const ASSET_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|svg|pdf|mp4|webm|mp3)$/i;

type BodyRef = { line: number; target: string };

/** コードブロック・インラインコードを除いた本文から参照を抜き出す */
export function findReferences(body: string, lineOffset = 0): BodyRef[] {
  const refs: BodyRef[] = [];
  let inFence = false;
  body.split(/\r?\n/).forEach((rawLine, index) => {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const line = rawLine.replace(/`[^`]*`/g, '');
    for (const match of line.matchAll(LINK_PATTERN)) {
      refs.push({ line: lineOffset + index + 1, target: match[0] });
    }
  });
  return refs;
}

function checkReference(
  ref: BodyRef,
  ids: Record<CollectionName, Set<string>>,
  root: string,
): string | undefined {
  const pathname = decodeURI(
    ref.target.replace(INTERNAL_ORIGIN, '').replace(/[?#].*$/, ''),
  );
  const page = pathname.match(/^\/(blog|poems)\/(.+?)\/?$/);
  if (page) {
    const collection = page[1] as CollectionName;
    return ids[collection].has(page[2])
      ? undefined
      : `リンク先の記事がありません: ${ref.target}`;
  }
  if (ASSET_EXTENSION.test(pathname)) {
    return existsSync(path.join(root, 'public', pathname))
      ? undefined
      : `public/ にファイルがありません: ${pathname}`;
  }
  return undefined;
}

function checkEntry(
  file: EntryFile,
  ids: Record<CollectionName, Set<string>>,
  root: string,
): Finding[] {
  const findings: Finding[] = [];
  const add = (level: Finding['level'], message: string, line?: number) =>
    findings.push({
      level,
      file: file.displayPath,
      line,
      message,
      entry: `${file.collection}:${file.id}`,
    });

  for (const problem of file.problems) add('error', problem, 1);

  const withoutExt = file.relativePath.replace(/\.mdx?$/, '');
  if (withoutExt !== file.id) {
    add(
      'error',
      `ファイル名がそのまま URL になりません（実際の id: ${file.id}）。英小文字・数字・- _ だけにしてください`,
    );
  }

  const data = file.data;
  if (data) {
    const dates = {
      publishDate: data.publishDate,
      updatedDate: 'updatedDate' in data ? data.updatedDate : undefined,
    };
    for (const [key, value] of Object.entries(dates)) {
      if (value !== undefined && !isValidISODate(value)) {
        add(
          'error',
          `${key} は YYYY-MM-DD 形式の実在する日付にしてください: ${value}`,
        );
      }
    }
    if (dates.updatedDate && dates.updatedDate < data.publishDate) {
      add(
        'error',
        `updatedDate (${dates.updatedDate}) が publishDate (${data.publishDate}) より前です`,
      );
    }
    const yearDir = file.relativePath.split('/')[0];
    if (/^\d{4}$/.test(yearDir) && !data.publishDate.startsWith(yearDir)) {
      add(
        'warning',
        `${yearDir}/ にありますが publishDate は ${data.publishDate} です`,
      );
    }
  }

  if (file.parsed) {
    for (const ref of findReferences(
      file.parsed.body,
      file.parsed.bodyLineOffset,
    )) {
      const message = checkReference(ref, ids, root);
      if (message) add('error', message, ref.line);
    }
  }
  return findings;
}

async function checkItems(root: string, kind: ItemKind): Promise<Finding[]> {
  const file = ITEM_FILES[kind];
  let source: string;
  try {
    source = await fs.readFile(path.join(root, file), 'utf-8');
  } catch {
    return [{ level: 'error', file, message: 'ファイルがありません' }];
  }
  const { items, issues } = parseItems(kind, source);
  const findings: Finding[] = issues.map((issue) => ({
    level: 'error',
    file,
    message: `${issue.id ?? `${issue.index + 1} 件目`}: ${issue.message}`,
  }));
  for (const item of items) {
    if ('date' in item && !isValidISODate(item.date)) {
      findings.push({
        level: 'error',
        file,
        message: `${item.id}: 実在しない日付です: ${item.date}`,
      });
    }
  }
  return findings;
}

export type ValidateResult = { findings: Finding[]; checkedEntries: number };

/**
 * コンテンツ全体を検証する。
 * targets（`<collection>:<id>`）を渡すとその記事の検出だけを返す（重複チェックなど全体の検査は省く）。
 */
export async function validateProject(
  root: string,
  targets?: ReadonlySet<string>,
): Promise<ValidateResult> {
  const files = Object.fromEntries(
    await Promise.all(
      collectionNames.map(
        async (c) => [c, await loadEntryFiles(root, c)] as const,
      ),
    ),
  ) as Record<CollectionName, EntryFile[]>;
  const ids = Object.fromEntries(
    collectionNames.map((c) => [c, new Set(files[c].map((f) => f.id))]),
  ) as Record<CollectionName, Set<string>>;

  const findings: Finding[] = [];
  let checkedEntries = 0;
  for (const collection of collectionNames) {
    for (const file of files[collection]) {
      if (targets && !targets.has(`${collection}:${file.id}`)) continue;
      checkedEntries++;
      findings.push(...checkEntry(file, ids, root));
    }
  }

  if (!targets) {
    for (const collection of collectionNames) {
      const byId = new Map<string, EntryFile[]>();
      const byTitle = new Map<string, EntryFile[]>();
      for (const file of files[collection]) {
        byId.set(file.id, [...(byId.get(file.id) ?? []), file]);
        if (file.data) {
          byTitle.set(file.data.title, [
            ...(byTitle.get(file.data.title) ?? []),
            file,
          ]);
        }
      }
      for (const [id, dupes] of byId) {
        if (dupes.length < 2) continue;
        for (const file of dupes.slice(1)) {
          findings.push({
            level: 'error',
            file: file.displayPath,
            message: `id "${id}" が ${dupes[0].displayPath} と重複しています`,
          });
        }
      }
      for (const [title, dupes] of byTitle) {
        if (dupes.length < 2) continue;
        for (const file of dupes.slice(1)) {
          findings.push({
            level: 'warning',
            file: file.displayPath,
            message: `タイトル「${title}」が ${dupes[0].displayPath} と重複しています`,
          });
        }
      }
    }
    findings.push(
      ...(await checkItems(root, 'talks')),
      ...(await checkItems(root, 'works')),
    );
  }

  return { findings, checkedEntries };
}
