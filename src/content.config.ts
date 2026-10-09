import {
  blogSchema,
  parseOrderedYaml,
  poemSchema,
  talkSchema,
  withOrder,
  workSchema,
} from '@infixer/core/schema';
import { file, glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';

// スキーマは CLI（infixer validate）と共有するため @infixer/core に置いている
const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: blogSchema,
});

const poemsCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/poems' }),
  schema: poemSchema,
});

// 登壇資料と作ったもの。出典: https://scrapbox.io/ryokatsu/%E6%88%90%E6%9E%9C%E7%89%A9
// file() は id 順に並べ替えるので、YAML の並び順を order として持たせる
const talksCollection = defineCollection({
  loader: file('src/content/talks.yaml', { parser: parseOrderedYaml }),
  schema: withOrder(talkSchema),
});

const worksCollection = defineCollection({
  loader: file('src/content/works.yaml', { parser: parseOrderedYaml }),
  schema: withOrder(workSchema),
});

export const collections = {
  blog: blogCollection,
  poems: poemsCollection,
  talks: talksCollection,
  works: worksCollection,
};
