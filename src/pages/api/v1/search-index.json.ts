import type { APIRoute } from 'astro';
import { toSearchIndexItem } from '@infixer/core';
import { json, loadEntries } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const [posts, poems] = await Promise.all([
    loadEntries('blog', site),
    loadEntries('poems', site),
  ]);
  return json([...posts, ...poems].map(toSearchIndexItem));
};
