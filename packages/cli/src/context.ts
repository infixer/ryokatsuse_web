import { SITE_URL } from '@infixer/core';
import { CliError, ExitCode } from './errors';
import type { Output } from './output';
import { findProjectRoot } from './project';
import { LocalSource } from './sources/local';
import { RemoteSource } from './sources/remote';
import type { DataSource } from './sources/types';

export type Context = {
  out: Output;
  json: boolean;
  baseUrl: string;
  source: DataSource;
  /** ローカルモードのときのリポジトリルート */
  root?: string;
  fetch: typeof fetch;
};

export type ContextOptions = {
  out: Output;
  json: boolean;
  local: boolean;
  remote: boolean;
  baseUrl?: string;
  cwd: string;
  fetch?: typeof fetch;
};

/**
 * データソースを決める。
 * --local / --remote が優先。どちらもなければリポジトリ内ならローカル、外ならリモート。
 */
export function createContext(options: ContextOptions): Context {
  if (options.local && options.remote) {
    throw new CliError(
      '--local と --remote は同時に指定できません',
      ExitCode.Usage,
    );
  }
  const baseUrl = options.baseUrl ?? SITE_URL;
  try {
    new URL(baseUrl);
  } catch {
    throw new CliError(
      `--base-url が URL ではありません: ${baseUrl}`,
      ExitCode.Usage,
    );
  }
  const fetchImpl = options.fetch ?? fetch;
  const root = options.remote ? undefined : findProjectRoot(options.cwd);
  if (options.local && !root) {
    throw new CliError(
      'infixer.net のリポジトリが見つかりません。リポジトリ内で実行するか --remote を使ってください',
      ExitCode.Usage,
    );
  }

  return {
    out: options.out,
    json: options.json,
    baseUrl,
    root,
    fetch: fetchImpl,
    source: root ? new LocalSource(root) : new RemoteSource(baseUrl, fetchImpl),
  };
}

/** ローカル専用コマンドで使う */
export function requireLocal(
  ctx: Context,
  command: string,
): {
  root: string;
  source: LocalSource;
} {
  if (!ctx.root || !(ctx.source instanceof LocalSource)) {
    throw new CliError(
      `${command} はリポジトリ内（ローカルモード）でのみ使えます`,
      ExitCode.Usage,
    );
  }
  return { root: ctx.root, source: ctx.source };
}
