import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import {
  type DiscoveryItem,
  excerpt,
  handleDiscovery,
} from '../../lib/discovery';
import { talks } from '../../lib/talks';

export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handleDiscovery(request, env, async () => {
    const posts = await getCollection('blog');
    const items: DiscoveryItem[] = [
      ...posts
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((post) => ({
          title: post.data.title,
          url: `/blog/${post.id.replace(/\.(md|mdx)$/i, '')}`,
          kind: '記事' as const,
          description: excerpt(post.data.description || post.body || ''),
        })),
      ...talks.map((talk) => ({
        title: talk.title,
        url: talk.url,
        kind: '登壇資料' as const,
        description: excerpt(`${talk.event} (${talk.date})`),
      })),
    ].map((item, index) => ({ ...item, id: `c${index}` }));
    return items;
  });
