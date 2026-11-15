import { z } from 'astro/zod';
import type { DiaryPostInput } from './db';

/** 1 投稿に添付できる画像の上限（SNS と同じく 4 枚） */
export const MAX_IMAGES = 4;

const httpUrl = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'http(s) の URL ではありません');

const inputSchema = z
  .object({
    // 文字数制限は付けない
    body: z.string().default(''),
    images: z
      .array(
        z.object({
          key: z.string().regex(/^diary\/[\w/-]+\.(webp|jpe?g|png|gif)$/),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        }),
      )
      .max(MAX_IMAGES)
      .default([]),
    links: z.array(httpUrl).max(20).default([]),
  })
  .transform((value) => ({
    // 末尾の空行・空白だけ落とす（先頭のインデントは意図的なものとして残す）
    body: value.body.replace(/\s+$/, ''),
    images: value.images,
    links: [...new Set(value.links)],
  }))
  .refine(
    (value) =>
      value.body.trim().length > 0 ||
      value.images.length > 0 ||
      value.links.length > 0,
    '本文・画像・リンクのどれかが必要です',
  );

export const parsePostInput = (
  json: unknown,
): { ok: true; value: DiaryPostInput } | { ok: false; error: string } => {
  const result = inputSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues.map((issue) => issue.message).join(' / '),
  };
};
