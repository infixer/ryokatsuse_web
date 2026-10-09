import type { APIRoute } from 'astro';
import { json, loadEntries, toMeta } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = async ({ site }) =>
  json((await loadEntries('poems', site)).map(toMeta));
