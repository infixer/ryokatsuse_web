import { parse } from 'yaml';
import { z } from 'zod';

/**
 * コンテンツコレクションのスキーマ。
 * src/content.config.ts と CLI の validate で同じ定義を使う。
 */

export const blogSchema = z.object({
  title: z.string(),
  publishDate: z.string(),
  updatedDate: z.string().optional(),
  ogImageURL: z.string().optional(),
  twitterCard: z.string().optional(),
  description: z.string().optional(),
  references: z
    .array(
      z.object({
        // 本文の <Cite id="..." /> から参照するためのキー
        id: z.string().optional(),
        title: z.string().optional(),
        url: z.string().url(),
        // 参照一覧に添える簡単な説明
        description: z.string().optional(),
      }),
    )
    .optional()
    .refine(
      (refs) => {
        const ids = (refs ?? []).flatMap((ref) => (ref.id ? [ref.id] : []));
        return new Set(ids).size === ids.length;
      },
      { message: 'references の id が重複しています' },
    ),
});

export const poemSchema = z.object({
  title: z.string(),
  publishDate: z.string(),
});

// Astro の file() ローダーは js-yaml（YAML 1.1）で読むため、クォートしていない日付は Date になる
const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
);

export const talkScopes = ['external', 'internal'] as const;

/** 登壇資料（src/content/talks.yaml） */
export const talkSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  /** 登壇日 (YYYY-MM-DD) */
  date: isoDate,
  /** 登壇したイベント名 */
  event: z.string(),
  scope: z.enum(talkScopes),
});

/** 作ったもの（src/content/works.yaml） */
export const workSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
});

/**
 * Astro の file() ローダーは id 順に並べ替えてしまうため、YAML 上の並び順を order として持たせる。
 * src/content.config.ts で parser と組み合わせて使う。
 */
export const withOrder = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({ order: z.number().int() });

export function parseOrderedYaml(text: string): Record<string, unknown>[] {
  const items: unknown = parse(text) ?? [];
  if (!Array.isArray(items)) throw new Error('配列ではありません');
  return items.map((item, order) => ({ ...item, order }));
}

export type BlogData = z.infer<typeof blogSchema>;
export type BlogReference = NonNullable<BlogData['references']>[number];
export type PoemData = z.infer<typeof poemSchema>;
export type TalkScope = (typeof talkScopes)[number];
export type Talk = z.infer<typeof talkSchema>;
export type Work = z.infer<typeof workSchema>;
