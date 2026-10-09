import type { APIRoute } from 'astro';
import { json, loadWorks } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = async () => json(await loadWorks());
