import { dirname, relative, resolve, sep } from 'node:path';
import type { Root } from 'mdast';
import type {} from 'mdast-util-to-hast';
import sharp from 'sharp';
import { visit } from 'unist-util-visit';

/** Keep public URLs available, but let Astro optimize images used in Markdown/MDX. */
export function responsiveMarkdownImages({ publicDir }: { publicDir: string }) {
  const imageDir = resolve(publicDir, 'images');

  return async (tree: Root, file: { path?: string }) => {
    if (!file.path) return;
    const contentDir = dirname(file.path);
    const tasks: Promise<void>[] = [];
    let imageIndex = 0;

    visit(tree, 'image', (node) => {
      // The first content image may be the LCP element; defer only later images.
      const loading = imageIndex++ === 0 ? 'eager' : 'lazy';
      // Leave remote images, SVG/GIF animations and URLs with query strings alone.
      if (!/^\/images\/[^?#]+\.(?:jpe?g|png|webp)$/i.test(node.url)) return;
      const source = resolve(publicDir, `.${decodeURIComponent(node.url)}`);
      if (!source.startsWith(`${imageDir}${sep}`)) return;

      tasks.push(
        (async () => {
          const metadata = await sharp(source).metadata();
          if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
            return;
          const originalWidth =
            (metadata.orientation ?? 1) >= 5 ? metadata.height : metadata.width;
          // The article's max-w-3xl container has 16px padding on each side.
          const width = Math.min(736, originalWidth);
          const widths = [
            ...new Set([
              width,
              ...[368, 736, 1104, 1472].filter(
                (value) => value <= originalWidth,
              ),
            ]),
          ].sort((a, b) => a - b);

          const imagePath = relative(contentDir, source).split(sep).join('/');
          node.url = imagePath.startsWith('.') ? imagePath : `./${imagePath}`;
          node.data = {
            ...node.data,
            hProperties: {
              format: 'webp',
              quality: 80,
              width,
              widths,
              sizes: `(min-width: ${width + 32}px) ${width}px, calc(100vw - 32px)`,
              loading,
              decoding: 'async',
              ...node.data?.hProperties,
            },
          };
        })(),
      );
    });

    await Promise.all(tasks);
  };
}
