/**
 * Markdown / MDX 本文を検索・統計用のプレーンテキストにする。
 * 完全なパーサーではなく、検索で邪魔になる記法を落とす程度の処理。
 */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^(?:import|export)\s.*$/gm, '')
    .replace(/^```.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
