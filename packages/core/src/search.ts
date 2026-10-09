export const includesQuery = (text: string, query: string): boolean =>
  text.toLowerCase().includes(query.trim().toLowerCase());

/**
 * 日付の新しい順に並べた新しい配列を返す。
 * ブラウザーの検索でも使うので、temporal-polyfill を読み込まないよう Date で比較する
 * （datetime.ts の epochMilliseconds も同じ値になる）。
 * 同じ日付の並びが読み込み順に左右されないよう、getKey があればその昇順で並べる。
 */
export function sortByDateDesc<T>(
  items: readonly T[],
  getDate: (item: T) => string,
  getKey?: (item: T) => string,
): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime() ||
      (getKey ? getKey(a).localeCompare(getKey(b)) : 0),
  );
}

/** クエリに一致した箇所の前後を抜き出す。一致しなければ undefined */
export function excerpt(
  text: string,
  query: string,
  radius = 40,
): string | undefined {
  const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index === -1) return undefined;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.trim().length + radius);
  const snippet = text.slice(start, end).replace(/\s+/g, ' ');
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`;
}
