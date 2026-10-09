import { createInterface } from 'node:readline/promises';
import { CliError, ExitCode } from './errors';

export const isInteractive = () =>
  Boolean(process.stdin.isTTY && process.stdout.isTTY);

/**
 * 値がなければ対話で聞く。端末でなければ引数エラーにする。
 * `fallback` があれば Enter だけでその値になる。
 */
export async function ask(
  value: string | undefined,
  { label, flag, fallback }: { label: string; flag: string; fallback?: string },
): Promise<string> {
  if (value !== undefined && value !== '') return value;
  if (!isInteractive()) {
    if (fallback !== undefined) return fallback;
    throw new CliError(`--${flag} を指定してください`, ExitCode.Usage);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    while (true) {
      const answer = (
        await rl.question(fallback ? `${label} (${fallback}): ` : `${label}: `)
      ).trim();
      if (answer) return answer;
      if (fallback !== undefined) return fallback;
    }
  } finally {
    rl.close();
  }
}
