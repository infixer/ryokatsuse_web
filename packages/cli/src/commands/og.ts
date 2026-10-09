import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { defineCommand } from '../command';
import { requireLocal } from '../context';
import { CliError } from '../errors';
import { pickEntry } from '../resolve';

export const ogCommand = defineCommand({
  name: 'og',
  args: '[<id>...]',
  summary:
    'OGP 画像を生成する（scripts/generate-og.mts のラッパー・ローカル専用）',
  options: {
    force: { type: 'boolean', description: 'キャッシュを無視して作り直す' },
  },
  async run(ctx, args, values) {
    const { root, source } = requireLocal(ctx, 'og');
    const targets: string[] = [];
    for (const query of args) {
      const collection = /^\/?poems\//.test(query) ? 'poems' : 'blog';
      const file = pickEntry(await source.files(collection), query);
      targets.push(`${collection}:${file.id}`);
    }
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        path.join(root, 'scripts', 'generate-og.mts'),
        ...(values.force === true ? ['--force'] : []),
        ...targets,
      ],
      {
        cwd: root,
        stdio: ctx.json ? ['ignore', 'ignore', 'inherit'] : 'inherit',
      },
    );
    if (result.error)
      throw new CliError(
        `OGP 画像の生成に失敗しました: ${result.error.message}`,
      );
    if (ctx.json) ctx.out.json({ ok: result.status === 0, targets });
    return result.status ?? 1;
  },
});
