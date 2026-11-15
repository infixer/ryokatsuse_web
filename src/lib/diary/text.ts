// 日記本文（プレーンテキスト）を表示用の HTML にする

// URL に使える ASCII 文字だけを拾う。日本語の文が URL の直後に続いてもリンクに含めない
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/g;
// URL の末尾に付きがちな句読点・閉じ括弧は URL に含めない
const TRAILING_PUNCTUATION = /[.,!?:;。、！？)\]]+$/;

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const linkify = (line: string): string => {
  let html = '';
  let lastIndex = 0;

  for (const match of line.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    html += escapeHtml(line.slice(lastIndex, index));
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    lastIndex = index + url.length;
  }

  return html + escapeHtml(line.slice(lastIndex));
};

/**
 * 本文を HTML にする。
 * - 改行はそのまま（表示側で white-space: pre-wrap）
 * - URL は自動でリンクにする
 * - リンクカードとして下に出す URL だけの行は、本文から省く（二重に見えないように）
 */
export const renderDiaryBody = (body: string, cardUrls: string[]): string => {
  const cards = new Set(cardUrls);
  const lines = body.split(/\r?\n/).filter((line) => !cards.has(line.trim()));

  // 省いた結果、先頭・末尾に残った空行を落とす
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop();

  return lines.map(linkify).join('\n');
};

/** OGP やメタ description 用の短い抜粋 */
export const excerpt = (body: string, length = 100): string => {
  const flat = body.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
};
