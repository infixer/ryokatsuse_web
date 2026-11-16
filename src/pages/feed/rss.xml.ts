import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getLinkPreviews, listPosts } from '../../lib/diary/db';
import { formatPostedAt } from '../../lib/diary/format';
import { excerpt, renderDiaryBody } from '../../lib/diary/text';

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// フィード（日記）だけの RSS。ブログの RSS は /posts-feed.xml
export async function GET(context: APIContext) {
  const site = context.site ?? new URL(context.url.origin);
  const { posts } = await listPosts({ limit: 30 });
  const previews = await getLinkPreviews(posts.flatMap((post) => post.links));

  const response = await rss({
    title: 'infixer.net フィード',
    description: '日々のことを短く書いているフィードです。',
    site,
    items: posts.map((post) => {
      const link = new URL(`/feed/${post.id}`, site).toString();

      // 本文（改行は <br> に）＋画像＋リンクカードの URL を content:encoded に入れる
      const body = renderDiaryBody(post.body, post.links).replace(
        /\n/g,
        '<br>',
      );
      const images = post.images
        .map((image) => {
          const src = new URL(`/media/${image.key}`, site).toString();
          return `<p><img src="${escapeHtml(src)}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.alt ?? '')}"></p>`;
        })
        .join('');
      const links = post.links
        .map((url) => {
          const title = previews.get(url)?.title || url;
          return `<p><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></p>`;
        })
        .join('');

      return {
        // 投稿にタイトルは無いので、本文の抜粋（無ければ日時）をタイトルにする
        title:
          excerpt(post.body, 40) ||
          `${formatPostedAt(post.publishedAt)} の投稿`,
        link,
        pubDate: new Date(post.publishedAt),
        description: excerpt(post.body),
        content: `<p>${body}</p>${images}${links}`,
      };
    }),
    customData: '<language>ja</language>',
  });

  // 投稿してすぐ反映させたいので、キャッシュは短めに
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
}
