import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type BlogData,
  blogSchema,
  type CollectionName,
  collections,
  ENTRY_EXTENSION,
  type EntrySource,
  entryIdFromPath,
  type ParsedSource,
  type PoemData,
  parseFrontmatter,
  poemSchema,
} from '@infixer/core';

/** リポジトリ上の記事ファイル 1 つ分 */
export type EntryFile = {
  collection: CollectionName;
  id: string;
  /** 絶対パス */
  filePath: string;
  /** リポジトリルートからの相対パス（表示用） */
  displayPath: string;
  /** コレクションディレクトリからの相対パス（`/` 区切り） */
  relativePath: string;
  source: string;
  parsed?: ParsedSource;
  /** frontmatter が読めない・スキーマ違反のときの理由 */
  problems: string[];
  data?: BlogData | PoemData;
};

const schemas = { blog: blogSchema, poems: poemSchema } as const;

async function walk(dir: string): Promise<string[]> {
  const dirents = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  const nested = await Promise.all(
    dirents.map((dirent) => {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) return walk(full);
      return Promise.resolve(ENTRY_EXTENSION.test(dirent.name) ? [full] : []);
    }),
  );
  return nested.flat().sort();
}

export function collectionDir(
  root: string,
  collection: CollectionName,
): string {
  return path.join(root, collections[collection].dir);
}

export async function loadEntryFiles(
  root: string,
  collection: CollectionName,
): Promise<EntryFile[]> {
  const dir = collectionDir(root, collection);
  const files = await walk(dir);
  return Promise.all(
    files.map(async (filePath) => {
      const relativePath = path
        .relative(dir, filePath)
        .split(path.sep)
        .join('/');
      const source = await fs.readFile(filePath, 'utf-8');
      const file: EntryFile = {
        collection,
        id: entryIdFromPath(relativePath),
        filePath,
        displayPath: path.relative(root, filePath).split(path.sep).join('/'),
        relativePath,
        source,
        problems: [],
      };
      try {
        file.parsed = parseFrontmatter(source);
      } catch (error) {
        file.problems.push((error as Error).message);
        return file;
      }
      const result = schemas[collection].safeParse(file.parsed.data);
      if (result.success) {
        file.data = result.data;
      } else {
        for (const issue of result.error.issues) {
          file.problems.push(
            `${issue.path.join('.') || 'frontmatter'}: ${issue.message}`,
          );
        }
      }
      return file;
    }),
  );
}

export function toEntrySource(file: EntryFile): EntrySource | undefined {
  if (!file.data || !file.parsed) return undefined;
  return {
    collection: file.collection,
    id: file.id,
    data: file.data,
    body: file.parsed.body,
    filePath: file.filePath,
  };
}
