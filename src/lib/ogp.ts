// リンクカード用のOGPメタデータ取得

export type OgpData = {
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  faviconUrl: string | null;
};

// サーバー起動中は使い回してリクエストごとの再取得を避ける
const cache = new Map<string, OgpData>();

const TIMEOUT_MS = 4000;

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");

const resolveUrl = (value: string, base: string): string | null => {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
};

const extractMetadata = (html: string, url: string): OgpData => {
  const domain = new URL(url).hostname;

  const getMatch = (regex: RegExp): string | null => {
    const match = html.match(regex);
    return match ? decodeEntities(match[1].trim()) : null;
  };

  const ogTitle = getMatch(
    /<meta[^>]*property=['"]og:title['"][^>]*content=['"]([^'"]*)['"]/i,
  );
  const title = ogTitle || getMatch(/<title[^>]*>([^<]+)<\/title>/i);
  const description =
    getMatch(
      /<meta[^>]*property=['"]og:description['"][^>]*content=['"]([^'"]*)['"]/i,
    ) ||
    getMatch(
      /<meta[^>]*name=['"]description['"][^>]*content=['"]([^'"]*)['"]/i,
    );
  const image = getMatch(
    /<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]*)['"]/i,
  );
  const siteName = getMatch(
    /<meta[^>]*property=['"]og:site_name['"][^>]*content=['"]([^'"]*)['"]/i,
  );
  const favicon = getMatch(
    /<link[^>]*rel=['"](?:shortcut )?icon['"][^>]*href=['"]([^'"]+)['"]/i,
  );

  return {
    title: title || domain,
    description: description || '',
    image: image ? resolveUrl(image, url) : null,
    siteName: siteName || domain,
    faviconUrl: favicon ? resolveUrl(favicon, url) : null,
  };
};

// Cosenseの本文記法（リンク・画像・アイコン）を落として説明文にする
const cleanScrapboxDescription = (lines: string[]): string =>
  lines
    .map((line) =>
      line
        // [url タイトル] / [タイトル url] はタイトルだけ残す
        .replace(/\[(?:https?:\/\/\S+\s+)([^\]]+)\]/g, '$1')
        .replace(/\[([^\]]+?)\s+https?:\/\/\S+\]/g, '$1')
        // 画像やURLのみのリンク記法、裸のURLは落とす
        .replace(/\[https?:\/\/\S+\]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        // アイコン記法
        .replace(/\[[^\]]*\.icon\]/g, '')
        // 残った [] や見出し記法を外す
        .replace(/\[[/*\-_]*([^\]]*?)\]/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    // 日付だけ・記号だけの行は捨てる
    .filter(
      (line) =>
        line.length > 0 && !/^[\d\s/():：（）年月日曜時分.~〜-]+$/.test(line),
    )
    .join(' ')
    .slice(0, 120);

// Cosense(Scrapbox)はHTMLにOGPが載らないためAPIから取得する
const fetchScrapboxOgp = async (
  url: string,
  signal: AbortSignal,
): Promise<OgpData | null> => {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const [project, page] = segments;
  const response = await fetch(
    `https://scrapbox.io/api/pages/${project}/${page}`,
    { signal },
  );
  if (!response.ok) return null;

  const data = (await response.json()) as {
    title?: string;
    image?: string | null;
    descriptions?: string[];
  };

  return {
    title: data.title ?? decodeURIComponent(page),
    description: cleanScrapboxDescription(data.descriptions ?? []),
    image: data.image ?? null,
    siteName: 'Cosense',
    faviconUrl: 'https://scrapbox.io/favicon.ico',
  };
};

// サーバーからのアクセスに動画の情報を返さないサイトは、公式の oEmbed API から取得する。
// 例: YouTube は Cloudflare Workers などデータセンターからのアクセスに og:title / og:image の無いページを返す
type OembedProvider = {
  hosts: string[];
  endpoint: string;
  siteName: string;
  faviconUrl: string;
};

const OEMBED_PROVIDERS: OembedProvider[] = [
  {
    hosts: [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
    ],
    endpoint: 'https://www.youtube.com/oembed',
    siteName: 'YouTube',
    faviconUrl: 'https://www.youtube.com/favicon.ico',
  },
];

const fetchOembed = async (
  url: string,
  signal: AbortSignal,
): Promise<OgpData | null> => {
  const host = new URL(url).hostname;
  const provider = OEMBED_PROVIDERS.find((item) => item.hosts.includes(host));
  if (!provider) return null;

  const endpoint = new URL(provider.endpoint);
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('format', 'json');

  const response = await fetch(endpoint, { signal });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  if (!data.title) return null;

  return {
    title: data.title,
    // 動画の説明文は oEmbed に無いので、チャンネル名を出す
    description: data.author_name ?? '',
    image: data.thumbnail_url ?? null,
    siteName: provider.siteName,
    faviconUrl: provider.faviconUrl,
  };
};

/**
 * URLのOGP情報を取得する。取得できない場合はfallbackで補完する。
 */
export const fetchOgp = async (
  url: string,
  fallback: Partial<OgpData> = {},
  { fresh = false }: { fresh?: boolean } = {},
): Promise<OgpData> => {
  const domain = new URL(url).hostname;
  const defaults: OgpData = {
    title: fallback.title || domain,
    description: fallback.description || '',
    image: fallback.image ?? null,
    siteName: fallback.siteName || domain,
    faviconUrl: fallback.faviconUrl ?? null,
  };

  // fresh: true のときは、サーバーが覚えている結果を使わずに取り直す
  const cached = fresh ? undefined : cache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const fetched = domain.endsWith('scrapbox.io')
      ? await fetchScrapboxOgp(url, controller.signal)
      : ((await fetchOembed(url, controller.signal).catch(() => null)) ??
        (await (async () => {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LinkCardBot/1.0)',
            },
            signal: controller.signal,
          });
          if (!response.ok) return null;
          return extractMetadata(await response.text(), url);
        })()));

    if (!fetched) return defaults;

    // 取得できた値を優先しつつ、空のものはfallbackで埋める
    const result: OgpData = {
      title: fallback.title || fetched.title,
      description: fetched.description || defaults.description,
      image: fetched.image ?? defaults.image,
      siteName: fetched.siteName || defaults.siteName,
      faviconUrl: fetched.faviconUrl ?? defaults.faviconUrl,
    };
    cache.set(url, result);
    return result;
  } catch (error) {
    console.error('OGP取得エラー:', url, error);
    return defaults;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * 複数URLのOGPを並列で取得する
 */
export const fetchOgpAll = async <T extends { url: string; title: string }>(
  items: T[],
): Promise<(T & { ogp: OgpData })[]> =>
  Promise.all(
    items.map(async (item) => ({
      ...item,
      ogp: await fetchOgp(item.url, { title: item.title }),
    })),
  );
