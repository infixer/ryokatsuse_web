import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Command, OptionSpec, Values } from './command';
import { poemCommands, postCommands } from './commands/entries';
import { talkCommands, workCommands } from './commands/items';
import { likesCommands } from './commands/likes';
import { ogCommand } from './commands/og';
import { searchCommand } from './commands/search';
import { statsCommand } from './commands/stats';
import { validateCommand } from './commands/validate';
import { createContext } from './context';
import { CliError, ExitCode } from './errors';
import { createOutput, type Output } from './output';

export const commands: Command[] = [
  ...postCommands,
  ...poemCommands,
  ...talkCommands,
  ...workCommands,
  searchCommand,
  statsCommand,
  ...likesCommands,
  validateCommand,
  ogCommand,
];

const globalOptions: Record<string, OptionSpec> = {
  json: { type: 'boolean', description: '結果を JSON で出す' },
  local: { type: 'boolean', description: 'リポジトリのファイルを読む' },
  remote: { type: 'boolean', description: 'https://infixer.net の API を読む' },
  'base-url': {
    type: 'string',
    description: 'リモートの接続先（既定: https://infixer.net）',
    placeholder: 'url',
  },
  'no-color': { type: 'boolean', description: '色を付けない（NO_COLOR も可）' },
  help: { type: 'boolean', short: 'h', description: 'ヘルプを表示する' },
  version: { type: 'boolean', short: 'v', description: 'バージョンを表示する' },
};

const toParseOptions = (options: Record<string, OptionSpec>) =>
  Object.fromEntries(
    Object.entries(options).map(([name, spec]) => [
      name,
      spec.short ? { type: spec.type, short: spec.short } : { type: spec.type },
    ]),
  );

/** 位置引数の先頭 1〜2 語からコマンドを決める（`likes top` を `likes <id>` より先に見る） */
function findCommand(positionals: string[]): {
  command?: Command;
  rest: string[];
} {
  const two = positionals.slice(0, 2).join(' ');
  const byTwo = commands.find((c) => c.name === two);
  if (byTwo) return { command: byTwo, rest: positionals.slice(2) };
  const byOne = commands.find((c) => c.name === positionals[0]);
  if (byOne) return { command: byOne, rest: positionals.slice(1) };
  return { rest: positionals };
}

function formatOptions(options: Record<string, OptionSpec>): string[] {
  const rows = Object.entries(options).map(([name, spec]) => {
    const flag = `${spec.short ? `-${spec.short}, ` : '    '}--${name}${spec.type === 'string' ? ` <${spec.placeholder ?? 'value'}>` : ''}`;
    return [flag, spec.description] as const;
  });
  const width = Math.max(...rows.map(([flag]) => flag.length));
  return rows.map(
    ([flag, description]) => `  ${flag.padEnd(width)}  ${description}`,
  );
}

function commandHelp(command: Command): string {
  return [
    `使い方: infixer ${command.name}${command.args ? ` ${command.args}` : ''} [options]`,
    '',
    command.summary,
    ...(command.options
      ? ['', 'オプション:', ...formatOptions(command.options)]
      : []),
    '',
    '共通オプション:',
    ...formatOptions(globalOptions),
  ].join('\n');
}

function generalHelp(filter?: string): string {
  const list = commands.filter(
    (c) => !filter || c.name.split(' ')[0] === filter,
  );
  const rows = list.map(
    (c) => [`${c.name}${c.args ? ` ${c.args}` : ''}`, c.summary] as const,
  );
  const width = Math.max(...rows.map(([usage]) => usage.length));
  return [
    '使い方: infixer <command> [options]',
    '',
    'infixer.net の記事・ポエム・登壇資料・作ったものを扱う CLI。',
    'リポジトリ内ではファイルを、外では https://infixer.net を読みます。',
    '',
    'コマンド:',
    ...rows.map(([usage, summary]) => `  ${usage.padEnd(width)}  ${summary}`),
    '',
    '共通オプション:',
    ...formatOptions(globalOptions),
    '',
    '各コマンドの詳細は infixer <command> --help',
  ].join('\n');
}

function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
  );
  return pkg.version;
}

export type MainOptions = {
  cwd?: string;
  fetch?: typeof fetch;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  /** 色を強制する（テスト用）。未指定なら TTY かどうかで決める */
  color?: boolean;
};

export async function main(
  argv: string[],
  options: MainOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  let out: Output = createOutput({
    color: false,
    stdout,
    stderr: options.stderr,
  });

  try {
    // 1 回目: 全コマンドのオプションを許して位置引数だけ取り出す
    const allOptions = Object.assign(
      {},
      globalOptions,
      ...commands.map((c) => c.options ?? {}),
    );
    const loose = parseArgs({
      args: argv,
      options: toParseOptions(allOptions),
      strict: false,
      allowPositionals: true,
    });
    const { command, rest } = findCommand(loose.positionals);

    // 2 回目: 決まったコマンドのオプションだけで厳密に読む
    const { values, positionals } = parseArgs({
      args: argv,
      options: toParseOptions({ ...globalOptions, ...command?.options }),
      strict: true,
      allowPositionals: true,
    });
    const flags = values as Values;

    const color =
      options.color ??
      (flags['no-color'] !== true &&
        !process.env.NO_COLOR &&
        Boolean((stdout as NodeJS.WriteStream).isTTY));
    out = createOutput({ color, stdout, stderr: options.stderr });

    if (flags.version === true) {
      out.print(version());
      return ExitCode.Success;
    }
    if (!command) {
      const [first] = positionals;
      if (first === undefined || flags.help === true) {
        out.print(generalHelp(first));
        return first === undefined && flags.help !== true
          ? ExitCode.Usage
          : ExitCode.Success;
      }
      if (commands.some((c) => c.name.startsWith(`${first} `))) {
        out.print(generalHelp(first));
        return ExitCode.Usage;
      }
      throw new CliError(
        `不明なコマンドです: ${positionals.join(' ')}（infixer --help）`,
        ExitCode.Usage,
      );
    }
    if (flags.help === true) {
      out.print(commandHelp(command));
      return ExitCode.Success;
    }

    const ctx = createContext({
      out,
      json: flags.json === true,
      local: flags.local === true,
      remote: flags.remote === true,
      baseUrl:
        typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined,
      cwd: options.cwd ?? process.cwd(),
      fetch: options.fetch,
    });
    // 2 回目の positionals はコマンド名を含むので、1 回目で決めた残りを使う
    return (await command.run(ctx, rest, flags)) ?? ExitCode.Success;
  } catch (error) {
    if (error instanceof CliError) {
      out.error(error.message);
      return error.exitCode;
    }
    if (
      error instanceof TypeError &&
      'code' in error &&
      String(error.code).startsWith('ERR_PARSE_ARGS')
    ) {
      out.error(`${error.message}（infixer --help）`);
      return ExitCode.Usage;
    }
    out.error((error as Error).stack ?? String(error));
    return ExitCode.Failure;
  }
}
