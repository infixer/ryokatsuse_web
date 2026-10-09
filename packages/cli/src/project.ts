import { existsSync } from 'node:fs';
import path from 'node:path';

/** カレントディレクトリから上に辿って infixer.net のリポジトリを探す */
export function findProjectRoot(from: string): string | undefined {
  let dir = path.resolve(from);
  while (true) {
    if (
      existsSync(path.join(dir, 'astro.config.mjs')) &&
      existsSync(path.join(dir, 'src', 'content', 'blog'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
