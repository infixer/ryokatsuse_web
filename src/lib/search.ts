/**
 * ブログ記事検索機能
 */
import { includesQuery, sortByDateDesc } from '@infixer/core/search';

// 検索に使用する記事データの型定義
export interface BlogPost {
  slug: string;
  body: string;
  data: {
    title: string;
    publishDate: string;
  };
}

/**
 * ブログ記事データを取得するAPI関数
 */
export const fetchBlogPosts = async (): Promise<BlogPost[]> => {
  try {
    const response = await fetch('/api/search-posts');
    if (!response.ok) {
      throw new Error('記事データの取得に失敗しました');
    }
    return await response.json();
  } catch (error) {
    console.error('検索エラー:', error);
    return [];
  }
};

/**
 * クエリに一致する記事を検索して最新順に並べ替え
 */
export const searchPosts = (posts: BlogPost[], query: string): BlogPost[] => {
  if (!query.trim()) {
    return [];
  }

  const filteredPosts = posts.filter(
    (post) =>
      includesQuery(post.data.title, query) || includesQuery(post.body, query),
  );

  // 日付で降順ソート（最新のポストを最初に表示）
  return sortByDateDesc(
    filteredPosts,
    (post) => post.data.publishDate,
    (post) => post.slug,
  );
};

/**
 * 検索結果のHTMLを生成
 */
export const generateSearchResultsHtml = (
  posts: BlogPost[],
  maxResults: number = 30,
): string => {
  if (posts.length === 0) {
    return '<div class="p-3 text-white">検索結果が見つかりませんでした</div>';
  }

  const resultHtml = posts
    .slice(0, maxResults)
    .map((post) => {
      // スラグから拡張子を確実に削除（大文字小文字を区別せず、末尾にある拡張子を削除）
      const cleanSlug = post.slug.replace(/\.(md|mdx|astro)$/i, '');

      return `
        <a href="/blog/${cleanSlug}" class="block p-3 hover:bg-neutral-600 text-white">
          <div class="font-medium">${post.data.title}</div>
          <div class="text-xs text-gray-300">${post.data.publishDate}</div>
        </a>
      `;
    })
    .join('');

  // maxResults以上の検索結果がある場合、残りの件数を表示
  const remainingCount = posts.length - maxResults;
  const remainingHtml =
    remainingCount > 0
      ? `<div class="p-3 text-sm text-gray-300 text-center">他にも${remainingCount}件の検索結果があります</div>`
      : '';

  return resultHtml + remainingHtml;
};
