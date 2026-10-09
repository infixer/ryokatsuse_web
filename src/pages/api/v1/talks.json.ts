import type { APIRoute } from 'astro';
import { json, loadTalks } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = async () => json(await loadTalks());
