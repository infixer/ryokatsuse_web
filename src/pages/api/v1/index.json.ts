import type { APIRoute } from 'astro';
import { API_VERSION, type ApiIndex } from '@infixer/core';
import { json, loadEntries, loadTalks, loadWorks } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const [posts, poems, talks, works] = await Promise.all([
    loadEntries('blog', site),
    loadEntries('poems', site),
    loadTalks(),
    loadWorks(),
  ]);
  const body: ApiIndex = {
    version: API_VERSION,
    site: site?.toString() ?? '',
    generatedAt: new Date().toISOString(),
    counts: {
      posts: posts.length,
      poems: poems.length,
      talks: talks.length,
      works: works.length,
    },
  };
  return json(body);
};
