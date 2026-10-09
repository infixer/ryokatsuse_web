// メタデータ取得APIエンドポイント
import type { APIContext, APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }: APIContext) => {
  try {
    // URLパラメータから取得対象のURLを取得
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'URL parameter is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    // 相対URLを絶対URLに変換（必要に応じて）
    const absoluteUrl = targetUrl.startsWith('http')
      ? targetUrl
      : `https://${targetUrl}`;

    try {
      // フェッチのタイムアウト設定
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      // 指定されたURLからデータを取得
      const response = await fetch(absoluteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkCardBot/1.0)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch: ${response.status} ${response.statusText}`,
        );
      }

      const html = await response.text();

      // 必要なメタデータを正規表現で抽出
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descriptionMatch =
        html.match(
          /<meta[^>]*name=['"]description['"][^>]*content=['"]([^'"]+)['"]/i,
        ) ||
        html.match(
          /<meta[^>]*property=['"]og:description['"][^>]*content=['"]([^'"]+)['"]/i,
        );
      const ogImageMatch = html.match(
        /<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i,
      );
      const siteNameMatch = html.match(
        /<meta[^>]*property=['"]og:site_name['"][^>]*content=['"]([^'"]+)['"]/i,
      );
      const faviconMatch = html.match(
        /<link[^>]*rel=['"](?:shortcut )?icon['"][^>]*href=['"]([^'"]+)['"]/i,
      );

      const domain = new URL(absoluteUrl).hostname;

      // 抽出したメタデータを整形して返却
      const metadata = {
        title: titleMatch ? titleMatch[1].trim() : domain,
        description: descriptionMatch
          ? descriptionMatch[1].trim()
          : `${domain}のページ`,
        thumbnail: ogImageMatch
          ? resolveUrl(ogImageMatch[1], absoluteUrl)
          : null,
        siteName: siteNameMatch ? siteNameMatch[1].trim() : domain,
        faviconUrl: faviconMatch
          ? resolveUrl(faviconMatch[1], absoluteUrl)
          : null,
      };

      return new Response(JSON.stringify(metadata), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Error fetching metadata:', error);

      // ドメイン情報（フォールバック用）
      const domain = targetUrl.startsWith('http')
        ? new URL(targetUrl).hostname
        : targetUrl;

      // エラーの場合はフォールバック値を返す
      const fallbackData = {
        title: domain,
        description: `${domain}のページ`,
        thumbnail: null,
        siteName: domain,
        faviconUrl: null,
      };

      return new Response(JSON.stringify(fallbackData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (error) {
    console.error('API error:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch metadata',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
};

// 相対URLを絶対URLに解決する関数
function resolveUrl(relativeUrl: string, baseUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return relativeUrl;
  }
}
