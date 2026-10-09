import { parse, stringify } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export type ParsedSource = {
  data: Record<string, unknown>;
  /** frontmatter の YAML 原文（区切り線を除く） */
  frontmatter: string;
  body: string;
  /** frontmatter 部分の行数（本文の行番号を元ファイルの行番号に直すのに使う） */
  bodyLineOffset: number;
};

/** frontmatter と本文に分ける。frontmatter がなければ例外 */
export function parseFrontmatter(source: string): ParsedSource {
  const match = source.match(FRONTMATTER);
  if (!match) {
    throw new Error('frontmatter が見つかりません');
  }
  const data = parse(match[1]) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter がオブジェクトではありません');
  }
  return {
    data,
    frontmatter: match[1],
    body: source.slice(match[0].length),
    bodyLineOffset: match[0].split('\n').length - 1,
  };
}

export function stringifyFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  // 既存記事に合わせて日付などの文字列はダブルクォートで書く
  const yaml = stringify(data, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  return `---\n${yaml}---\n${body}`;
}
