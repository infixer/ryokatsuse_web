import type { Context } from './context';
import { CliError, ExitCode } from './errors';

export type OptionSpec = {
  type: 'string' | 'boolean';
  short?: string;
  /** ヘルプに出す説明 */
  description: string;
  /** string オプションの値の例（ヘルプ用） */
  placeholder?: string;
};

export type Values = Record<string, string | boolean | undefined>;

export type Command = {
  /** `posts list` のように空白区切り */
  name: string;
  /** 引数の書式（ヘルプ用） */
  args?: string;
  summary: string;
  options?: Record<string, OptionSpec>;
  run(
    ctx: Context,
    positionals: string[],
    values: Values,
  ): Promise<number | undefined>;
};

export const defineCommand = (command: Command) => command;

export function stringOption(values: Values, name: string): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

export function intOption(
  values: Values,
  name: string,
  { min = 1 }: { min?: number } = {},
): number | undefined {
  const value = stringOption(values, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new CliError(
      `--${name} は ${min} 以上の整数で指定してください`,
      ExitCode.Usage,
    );
  }
  return parsed;
}

export function requireArg(
  positionals: string[],
  index: number,
  name: string,
): string {
  const value = positionals[index];
  if (value === undefined) {
    throw new CliError(`<${name}> を指定してください`, ExitCode.Usage);
  }
  return value;
}
