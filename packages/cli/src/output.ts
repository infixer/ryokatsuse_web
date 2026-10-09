import { styleText } from 'node:util';

type Style = Parameters<typeof styleText>[0];

/** 全角文字を幅 2 として数える（表の桁揃え用） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd)
        ? 2
        : 1;
  }
  return width;
}

const padEnd = (text: string, width: number) =>
  text + ' '.repeat(Math.max(0, width - displayWidth(text)));

export type Output = ReturnType<typeof createOutput>;

export function createOutput({
  color,
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  color: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}) {
  const style = (format: Style, text: string) =>
    color ? styleText(format, text, { validateStream: false }) : text;

  return {
    style,
    print(line = '') {
      stdout.write(`${line}\n`);
    },
    json(value: unknown) {
      stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },
    /** 最終列以外を表示幅で揃える。styles[i] は i 列目に当てる装飾 */
    table(rows: string[][], styles: (Style | undefined)[] = []) {
      const widths: number[] = [];
      for (const row of rows) {
        row.forEach((cell, i) => {
          widths[i] = Math.max(widths[i] ?? 0, displayWidth(cell));
        });
      }
      for (const row of rows) {
        const line = row
          .map((cell, i) => {
            const padded =
              i === row.length - 1 ? cell : padEnd(cell, widths[i]);
            const format = styles[i];
            return format ? style(format, padded) : padded;
          })
          .join('  ');
        stdout.write(`${line.trimEnd()}\n`);
      }
    },
    warn(message: string) {
      stderr.write(`${style('yellow', 'warning')} ${message}\n`);
    },
    error(message: string) {
      stderr.write(`${style('red', 'error')} ${message}\n`);
    },
    info(message: string) {
      stderr.write(`${message}\n`);
    },
  };
}
