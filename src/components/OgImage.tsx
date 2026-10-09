import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { SITE_TITLE } from '../config';

// 日本語対応フォント - IBMよりもっと一般的なNoto Sansを使用
const fontFamily = 'Noto Sans JP';

// アバター画像のパス
const AVATAR_PATH = path.join(
  process.cwd(),
  'public',
  'images',
  'ryokatsu.jpg',
);
// フォントキャッシュディレクトリ
const FONT_CACHE_DIR = path.join(process.cwd(), '.font-cache');

// フォントキャッシュディレクトリを確保する関数
async function ensureFontCacheDir(): Promise<void> {
  try {
    await fs.mkdir(FONT_CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('フォントキャッシュディレクトリの作成エラー:', error);
  }
}

// 画像ファイルをBase64エンコードして読み込む関数
async function loadImageAsBase64(filePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(filePath);
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    return base64Image;
  } catch (error) {
    console.error(`画像ファイル読み込みエラー (${filePath}):`, error);
    // エラー時は代替URLを返す
    return 'https://ui-avatars.com/api/?name=R+K&size=200&background=363333&color=fff&bold=true';
  }
}

export async function getOgImage(text: string) {
  try {
    // フォントキャッシュディレクトリを確保
    await ensureFontCacheDir();

    // タイトルとテキスト全体に必要な文字をまとめる
    const allChars = [...new Set([...SITE_TITLE, ...text])].join('');

    // フォントを取得
    const fontNormal = await fetchFont(allChars, fontFamily, 400);
    const fontBold = await fetchFont(allChars, fontFamily, 700);

    // アバター画像をBase64形式で読み込み
    const avatarImageBase64 = await loadImageAsBase64(AVATAR_PATH);

    // SVG生成
    const svg = await satori(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          backgroundColor: '#363333', // 白いボーダーを削除するために背景色をボーダーと同じ色に設定
          color: '#fff',
          fontFamily: `"${fontFamily}", sans-serif`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '60px',
            width: '100%',
            height: '100%',
          }}
        >
          {/* メインのタイトル */}
          <div
            style={{
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              width: '100%',
              fontSize: '56px',
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            {text}
          </div>

          {/* フッター部分 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginTop: '30px',
            }}
          >
            {/* アバター画像（左側） - Base64エンコードされた画像を使用 */}
            <img
              src={avatarImageBase64}
              alt=""
              width={80}
              height={80}
              style={{
                borderRadius: '50%', // 丸い形に
                marginRight: '20px',
              }}
            />

            {/* サイトタイトル（右側） */}
            <div
              style={{
                fontSize: '32px',
                fontWeight: 400,
              }}
            >
              {SITE_TITLE}
            </div>
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: fontFamily,
            data: fontNormal,
            weight: 400,
            style: 'normal',
          },
          {
            name: fontFamily,
            data: fontBold,
            weight: 700,
            style: 'normal',
          },
        ],
      },
    );

    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: 1200,
      },
    });

    const pngBuffer = resvg.render().asPng();

    return pngBuffer;
  } catch (error) {
    console.error('OGP画像生成エラー:', error);
    throw error;
  }
}

// satoriに対応するArrayBufferの型
type SatoriArrayBuffer = ArrayBuffer;

// 指定されたURLからTTFフォントを直接取得する関数
async function fetchTtfFont(
  fontName: string,
  weight: number,
): Promise<ArrayBuffer> {
  // CDNから直接Noto Sans JPのTTFファイルを取得するURL
  // 注: 実際には適切なライセンスを持つフォントを使用してください
  const ttfUrls: Record<string, Record<number, string>> = {
    'Noto Sans JP': {
      400: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@4.5.0/files/noto-sans-jp-japanese-400-normal.woff',
      700: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@4.5.0/files/noto-sans-jp-japanese-700-normal.woff',
    },
    'IBM Plex Sans JP': {
      400: 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-jp@4.5.0/files/ibm-plex-sans-jp-japanese-400-normal.woff',
      700: 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-jp@4.5.0/files/ibm-plex-sans-jp-japanese-700-normal.woff',
    },
  };

  // フォント名と重みに基づいてURLを取得
  const url = ttfUrls[fontName]?.[weight];
  if (!url) {
    throw new Error(
      `指定されたフォント（${fontName} - ${weight}）のURLが見つかりません`,
    );
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `TTFフォント取得エラー: ${response.status} ${response.statusText}`,
    );
  }

  return await response.arrayBuffer();
}

async function fetchFont(
  _text: string,
  font: string,
  weight: number,
): Promise<SatoriArrayBuffer> {
  const MAX_RETRIES = 3;
  let retries = 0;

  // フォントキャッシュのファイル名
  const cacheFileName = `${font.replace(/\s+/g, '_')}-${weight}.ttf`;
  const cachePath = path.join(FONT_CACHE_DIR, cacheFileName);

  // キャッシュをチェック
  try {
    const cachedFont = await fs.readFile(cachePath);
    // ArrayBufferに変換して返す
    return cachedFont.buffer.slice(
      cachedFont.byteOffset,
      cachedFont.byteOffset + cachedFont.byteLength,
    ) as ArrayBuffer;
  } catch {
    console.log(`キャッシュにフォントがありません: ${cacheFileName}`);
  }

  while (retries < MAX_RETRIES) {
    try {
      // CDNから直接TTF/WOFF形式のフォントを取得（Google Fontsを回避）
      const fontBuffer = await fetchTtfFont(font, weight);
      // キャッシュに保存
      try {
        await fs.writeFile(cachePath, new Uint8Array(fontBuffer));
      } catch (cacheError) {
        console.error('フォントキャッシュの保存に失敗:', cacheError);
      }

      return fontBuffer as SatoriArrayBuffer;
    } catch (error) {
      retries++;

      if (retries < MAX_RETRIES) {
        // 再試行前に少し待機
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
      } else {
        const err = error as Error;
        throw new Error(
          `フォント取得に${MAX_RETRIES}回失敗しました: ${err.message}`,
        );
      }
    }
  }

  throw new Error('フォント取得に失敗しました');
}
