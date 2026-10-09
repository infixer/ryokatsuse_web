import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { main } from '../src/index';

/** infixer.net リポジトリを模した最小構成を作る */
export async function createFixture(
  files: Record<string, string>,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'infixer-cli-'));
  const defaults: Record<string, string> = {
    'astro.config.mjs': 'export default {};\n',
    'src/content/talks.yaml':
      '# 登壇資料\n- id: "2026-01-09"\n  title: axe-core\n  url: https://example.com/axe\n  date: "2026-01-09"\n  event: BuriKaigi 2026\n  scope: external\n',
    'src/content/works.yaml':
      '- id: "emo-lan"\n  title: emo-lan\n  url: https://github.com/ryokatsuse/emo-lan\n  description: 絵文字のプログラミング言語\n',
  };
  for (const [name, content] of Object.entries({ ...defaults, ...files })) {
    const filePath = path.join(root, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  await mkdir(path.join(root, 'src/content/blog'), { recursive: true });
  await mkdir(path.join(root, 'src/content/poems'), { recursive: true });
  return root;
}

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, callback: () => void) {
    this.text += chunk.toString();
    callback();
  }
}

export async function run(
  args: string[],
  { cwd, fetch }: { cwd: string; fetch?: typeof globalThis.fetch },
) {
  const stdout = new Capture();
  const stderr = new Capture();
  const code = await main(args, { cwd, fetch, stdout, stderr, color: false });
  return { code, stdout: stdout.text, stderr: stderr.text };
}

export const post = (
  title: string,
  date: string,
  body = '本文です。\n',
  extra = '',
) => `---\ntitle: "${title}"\npublishDate: "${date}"\n${extra}---\n\n${body}`;
