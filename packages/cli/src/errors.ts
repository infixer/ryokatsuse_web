export const ExitCode = {
  Success: 0,
  /** 実行時エラー・validate でエラーを検出 */
  Failure: 1,
  /** 引数の誤り */
  Usage: 2,
  /** 指定したものが見つからない */
  NotFound: 3,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCodeValue = ExitCode.Failure,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
