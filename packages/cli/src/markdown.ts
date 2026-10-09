import type { Output } from './output';

const attr = (attrs: string, name: string) =>
  attrs.match(new RegExp(`${name}=["']([^"']+)["']`))?.[1];

/** 行内の記法を整形する */
function renderInline(line: string, out: Output): string {
  return (
    line
      // MDX コンポーネントはプレースホルダーにする（例: [LinkCard] https://…）
      .replace(/<([A-Z]\w*)([^>]*?)\/?>/g, (_, name: string, attrs: string) => {
        const target =
          attr(attrs, 'url') ?? attr(attrs, 'href') ?? attr(attrs, 'src');
        return out.style('magenta', `[${name}]${target ? ` ${target}` : ''}`);
      })
      .replace(/<\/[A-Z]\w*>/g, '')
      .replace(/<iframe([^>]*)>(?:<\/iframe>)?/gi, (_, attrs: string) =>
        out.style('magenta', `[iframe] ${attr(attrs, 'src') ?? ''}`.trimEnd()),
      )
      .replace(/<img([^>]*)\/?>/gi, (_, attrs: string) =>
        out.style(
          'magenta',
          `[画像: ${attr(attrs, 'alt') ?? ''}] ${attr(attrs, 'src') ?? ''}`.trimEnd(),
        ),
      )
      .replace(/<\/?[a-z][^>]*>/g, '')
      .replace(
        /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
        (_, alt: string, src: string) =>
          out.style('magenta', `[画像: ${alt}] ${src}`),
      )
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
        (_, text: string, url: string) =>
          `${out.style('underline', text)} ${out.style('dim', `(${url})`)}`,
      )
      .replace(/\*\*([^*]+)\*\*/g, (_, text: string) => out.style('bold', text))
      .replace(/`([^`]+)`/g, (_, code: string) => out.style('cyan', code))
  );
}

/**
 * Markdown / MDX をターミナル向けに整形する。
 * 見出し・リスト・引用・コードブロック・リンク・コンポーネント程度を扱う簡易版。
 */
export function renderMarkdown(body: string, out: Output): string {
  const lines: string[] = [];
  let fence: string | undefined;

  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)(.*)$/);
    if (fenceMatch) {
      if (fence === undefined) {
        fence = fenceMatch[1];
        const lang = fenceMatch[2].trim();
        lines.push(out.style('dim', `┌─${lang ? ` ${lang}` : ''}`));
      } else if (fenceMatch[1].startsWith(fence)) {
        fence = undefined;
        lines.push(out.style('dim', '└─'));
      } else {
        lines.push(`${out.style('dim', '│')} ${line}`);
      }
      continue;
    }
    if (fence !== undefined) {
      lines.push(`${out.style('dim', '│')} ${line}`);
      continue;
    }

    if (/^(?:import|export)\s/.test(line)) continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const text = renderInline(heading[2], out);
      lines.push(
        heading[1].length <= 2
          ? out.style(['bold', 'cyan'], text)
          : out.style('bold', text),
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      lines.push(out.style('dim', `│ ${renderInline(quote[1], out)}`));
      continue;
    }

    const item = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (item) {
      lines.push(`${item[1]}• ${renderInline(item[2], out)}`);
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      lines.push(out.style('dim', '─'.repeat(40)));
      continue;
    }

    const rendered = renderInline(line, out);
    // タグだけの行（<div> など）は消えるので空行にまとめる
    lines.push(rendered.trim() === '' ? '' : rendered);
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
