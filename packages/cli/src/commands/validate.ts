import { defineCommand } from '../command';
import { type Context, requireLocal } from '../context';
import { ExitCode } from '../errors';
import { pickEntry } from '../resolve';
import { type Finding, validateProject } from '../validate';

export async function validateTargets(
  root: string,
  targets?: ReadonlySet<string>,
): Promise<Finding[]> {
  return (await validateProject(root, targets)).findings;
}

export function printFindings(ctx: Context, findings: Finding[]) {
  if (ctx.json) return;
  for (const finding of findings) {
    const location = `${finding.file}${finding.line ? `:${finding.line}` : ''}`;
    const level =
      finding.level === 'error'
        ? ctx.out.style('red', 'error  ')
        : ctx.out.style('yellow', 'warning');
    ctx.out.print(
      `${level} ${ctx.out.style('cyan', location)} ${finding.message}`,
    );
  }
}

/** `2026/like-weapon` や `poems/2026/x` を `<collection>:<id>` に解決する */
async function resolveTargets(
  ctx: Context,
  queries: string[],
): Promise<Set<string>> {
  const { source } = requireLocal(ctx, 'validate');
  const targets = new Set<string>();
  for (const query of queries) {
    const collection = /^\/?poems\//.test(query) ? 'poems' : 'blog';
    const files = await source.files(collection);
    targets.add(`${collection}:${pickEntry(files, query).id}`);
  }
  return targets;
}

export const validateCommand = defineCommand({
  name: 'validate',
  args: '[<id>...]',
  summary:
    'frontmatter・リンク・画像・登壇資料データを検証する（ローカル専用）',
  options: {
    strict: {
      type: 'boolean',
      description: 'warning があっても終了コード 1 にする',
    },
  },
  async run(ctx, args, values) {
    const { root } = requireLocal(ctx, 'validate');
    const targets =
      args.length > 0 ? await resolveTargets(ctx, args) : undefined;
    const { findings, checkedEntries } = await validateProject(root, targets);
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;

    if (ctx.json) {
      ctx.out.json({ checkedEntries, errors, warnings, findings });
    } else {
      printFindings(ctx, findings);
      const summary = `${checkedEntries} 件の${targets ? '記事' : '記事と登壇資料・作ったもの'}を検証: error ${errors} / warning ${warnings}`;
      ctx.out.print(
        errors > 0
          ? ctx.out.style('red', summary)
          : ctx.out.style('green', summary),
      );
    }
    if (errors > 0 || (values.strict === true && warnings > 0)) {
      return ExitCode.Failure;
    }
    return 0;
  },
});
