import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { API_VERSION, collections, isCollectionName } from '@infixer/core';
import { LocalSource } from '../src/sources/local';
import { createFixture, post, run } from './helpers';

const fixture = () =>
  createFixture({
    'src/content/blog/2026/like-weapon.mdx': post(
      '好きな武器',
      '2026-05-29',
      "import LinkCard from 'x';\n\nダガーが好き。\n",
    ),
    'src/content/blog/2025/0101.md': post('2025年の抱負', '2025-01-01'),
    'src/content/blog/2024/0101.md': post('2024年の抱負', '2024-01-01'),
    'src/content/poems/2026/keep-building-ui.md': post(
      'UIを作り続けること',
      '2026-07-28',
      'Figmaで渡されたキャンバス\n',
    ),
  });

test('posts list は新しい順に並び、--year・--limit・--json に対応する', async () => {
  const cwd = await fixture();
  const human = await run(['posts', 'list'], { cwd });
  assert.equal(human.code, 0);
  assert.deepEqual(
    human.stdout
      .trim()
      .split('\n')
      .map((line) => line.split(/\s+/)[1]),
    ['2026/like-weapon', '2025/0101', '2024/0101'],
  );

  const json = await run(['posts', 'list', '--year', '2025', '--json'], {
    cwd,
  });
  assert.deepEqual(JSON.parse(json.stdout), [
    {
      id: '2025/0101',
      collection: 'blog',
      title: '2025年の抱負',
      publishDate: '2025-01-01',
      url: 'https://infixer.net/blog/2025/0101',
      ogImage: 'https://infixer.net/og/2025-0101.png',
    },
  ]);

  const limited = await run(['posts', 'list', '--limit', '1', '--json'], {
    cwd,
  });
  assert.equal(JSON.parse(limited.stdout).length, 1);

  const invalid = await run(['posts', 'list', '--limit', '0'], { cwd });
  assert.equal(invalid.code, 2);
});

test('posts show は曖昧指定を受け付け、候補が複数・なしならエラー', async () => {
  const cwd = await fixture();
  const shown = await run(['posts', 'show', 'like-weapon'], { cwd });
  assert.equal(shown.code, 0);
  assert.match(
    shown.stdout,
    /^好きな武器\n2026-05-29 {2}https:\/\/infixer\.net\/blog\/2026\/like-weapon\n\nダガーが好き。$/m,
  );

  const raw = await run(
    ['posts', 'show', 'https://infixer.net/blog/2026/like-weapon/', '--raw'],
    { cwd },
  );
  assert.equal(raw.stdout, "import LinkCard from 'x';\n\nダガーが好き。\n");

  const ambiguous = await run(['posts', 'show', '0101'], { cwd });
  assert.equal(ambiguous.code, 2);
  assert.match(ambiguous.stderr, /複数/);

  const missing = await run(['posts', 'show', 'nope'], { cwd });
  assert.equal(missing.code, 3);
});

test('不明なコマンド・オプションは終了コード 2', async () => {
  const cwd = await fixture();
  assert.equal((await run(['nope'], { cwd })).code, 2);
  assert.equal((await run(['posts', 'list', '--unknown'], { cwd })).code, 2);
  assert.equal(
    (await run(['posts', 'list', '--local', '--remote'], { cwd })).code,
    2,
  );
  const help = await run(['posts', 'list', '--help'], { cwd });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--year <2026>/);
});

test('search は本文とタイトルを探し、--collection で絞れる', async () => {
  const cwd = await fixture();
  const result = await run(['search', 'ダガー', '--json'], { cwd });
  assert.deepEqual(
    JSON.parse(result.stdout).map((r: { id: string; excerpt?: string }) => [
      r.id,
      r.excerpt,
    ]),
    [['2026/like-weapon', 'ダガーが好き。']],
  );
  const poems = await run(
    ['search', 'figma', '--collection', 'poems', '--json'],
    { cwd },
  );
  assert.equal(JSON.parse(poems.stdout)[0].collection, 'poems');
  assert.equal((await run(['search', 'ない言葉'], { cwd })).code, 3);
});

test('posts new / touch で記事ファイルを作り、更新日を書き込む', async () => {
  const cwd = await fixture();
  const created = await run(
    [
      'posts',
      'new',
      'hello',
      '--title',
      'こんにちは',
      '--date',
      '2026-10-09',
      '--mdx',
      '--json',
    ],
    { cwd },
  );
  assert.equal(created.code, 0);
  assert.deepEqual(JSON.parse(created.stdout), {
    id: '2026/hello',
    path: 'src/content/blog/2026/hello.mdx',
  });
  const file = path.join(cwd, 'src/content/blog/2026/hello.mdx');
  assert.equal(
    await readFile(file, 'utf-8'),
    '---\ntitle: "こんにちは"\npublishDate: "2026-10-09"\n---\n\n',
  );

  assert.equal(
    (
      await run(
        ['posts', 'new', 'hello', '--title', 'x', '--date', '2026-01-01'],
        { cwd },
      )
    ).code,
    2,
  );
  assert.equal(
    (await run(['posts', 'new', 'Hello', '--title', 'x'], { cwd })).code,
    2,
  );

  const touched = await run(
    ['posts', 'touch', 'hello', '--date', '2026-10-10'],
    { cwd },
  );
  assert.equal(touched.code, 0);
  assert.match(
    await readFile(file, 'utf-8'),
    /publishDate: "2026-10-09"\nupdatedDate: "2026-10-10"\n---/,
  );
  assert.equal(
    (await run(['posts', 'touch', 'hello', '--date', '2026-01-01'], { cwd }))
      .code,
    2,
  );
});

test('talks add は日付順に挿入し、先頭のコメントを残す', async () => {
  const cwd = await fixture();
  const added = await run(
    [
      'talks',
      'add',
      '--title',
      '昔の登壇',
      '--url',
      'https://example.com/old',
      '--date',
      '2025-05-14',
      '--event',
      'LT',
      '--scope',
      'internal',
    ],
    { cwd },
  );
  assert.equal(added.code, 0, added.stderr);
  const yaml = await readFile(
    path.join(cwd, 'src/content/talks.yaml'),
    'utf-8',
  );
  assert.match(yaml, /^# 登壇資料\n- id: "2025-05-14"\n/);

  const list = await run(['talks', 'list', '--scope', 'internal', '--json'], {
    cwd,
  });
  assert.deepEqual(
    JSON.parse(list.stdout).map((t: { id: string }) => t.id),
    ['2025-05-14'],
  );

  const bad = await run(
    [
      'talks',
      'add',
      '--title',
      'x',
      '--url',
      'not-url',
      '--date',
      '2025-02-30',
      '--event',
      'e',
    ],
    { cwd },
  );
  assert.equal(bad.code, 2);

  const work = await run(
    [
      'works',
      'add',
      '--title',
      'dev-launcher',
      '--url',
      'https://github.com/ryokatsuse/dev-launcher',
      '--description',
      'CLI',
      '--json',
    ],
    { cwd },
  );
  assert.equal(JSON.parse(work.stdout).id, 'dev-launcher');
});

test('validate はリンク切れ・画像・日付・ファイル名を検出する', async () => {
  const cwd = await createFixture({
    'src/content/blog/2026/ok.md': post(
      'OK',
      '2026-01-01',
      '[既存](/blog/2026/ok) [旧ドメイン](https://ryokatsu.dev/blog/2026/ok/) ![](/images/a.png)\n',
    ),
    'public/images/a.png': '',
    'src/content/blog/2026/broken..md': post(
      'Broken',
      '2025-02-30',
      '\n[切れ](/blog/2026/missing)\n\n![画像](/images/none.png)\n\n```\n[コード内](/blog/ignored)\n```\n',
      'updatedDate: "2024-01-01"\n',
    ),
    'src/content/blog/2026/no-title.md':
      '---\npublishDate: "2026-01-01"\n---\n',
  });
  const result = await run(['validate', '--json'], { cwd });
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  const messages = report.findings.map(
    (f: { file: string; line?: number; message: string }) =>
      `${f.file}:${f.line ?? ''} ${f.message}`,
  );
  assert.deepEqual(
    messages.sort(),
    [
      'src/content/blog/2026/broken..md: publishDate は YYYY-MM-DD 形式の実在する日付にしてください: 2025-02-30',
      'src/content/blog/2026/broken..md: updatedDate (2024-01-01) が publishDate (2025-02-30) より前です',
      'src/content/blog/2026/broken..md: ファイル名がそのまま URL になりません（実際の id: 2026/broken）。英小文字・数字・- _ だけにしてください',
      'src/content/blog/2026/broken..md: 2026/ にありますが publishDate は 2025-02-30 です',
      'src/content/blog/2026/broken..md:8 リンク先の記事がありません: /blog/2026/missing',
      'src/content/blog/2026/broken..md:10 public/ にファイルがありません: /images/none.png',
      'src/content/blog/2026/no-title.md:1 title: Invalid input: expected string, received undefined',
    ].sort(),
  );

  const single = await run(['validate', '2026/ok'], { cwd });
  assert.equal(single.code, 0, single.stdout);
});

test('リモートモードは /api/v1 を読み、ローカルと同じ JSON を返す', async () => {
  const cwd = await fixture();
  const local = new LocalSource(cwd);
  const requested: string[] = [];
  const fakeFetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    requested.push(url.pathname + url.search);
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.pathname === '/api/v1/index.json') {
      return respond({
        version: API_VERSION,
        site: 'https://infixer.net/',
        generatedAt: '',
        counts: {},
      });
    }
    if (url.pathname === '/api/v1/likes/top')
      return respond([{ id: '2026/like-weapon', count: 5 }]);
    if (url.pathname === '/api/v1/talks.json')
      return respond(await local.listTalks());
    if (url.pathname === '/api/v1/works.json')
      return respond(await local.listWorks());
    if (url.pathname === '/api/v1/search-index.json') {
      return respond(await local.searchIndex(['blog', 'poems']));
    }
    const list = url.pathname.match(/^\/api\/v1\/(posts|poems)\.json$/);
    const one = url.pathname.match(/^\/api\/v1\/(posts|poems)\/(.+)\.json$/);
    const toCollection = (segment: string) =>
      Object.keys(collections).find(
        (c) => isCollectionName(c) && collections[c].apiSegment === segment,
      ) as 'blog' | 'poems';
    if (list) return respond(await local.listEntries(toCollection(list[1])));
    if (one) {
      const entry = await local.getEntry(toCollection(one[1]), one[2]);
      return entry ? respond(entry) : respond({ error: 'Not found' }, 404);
    }
    return respond({ error: 'Not found' }, 404);
  }) as typeof fetch;

  for (const args of [
    ['posts', 'list'],
    ['posts', 'show', 'like-weapon'],
    ['poems', 'latest'],
    ['talks', 'list'],
    ['works', 'list'],
    ['search', '抱負'],
    ['stats'],
  ]) {
    const fromLocal = await run([...args, '--json'], { cwd });
    const fromRemote = await run([...args, '--json', '--remote'], {
      cwd,
      fetch: fakeFetch,
    });
    assert.equal(fromRemote.code, 0, fromRemote.stderr);
    assert.deepEqual(
      JSON.parse(fromRemote.stdout),
      JSON.parse(fromLocal.stdout),
      args.join(' '),
    );
  }

  const likes = await run(['likes', 'top', '--json'], {
    cwd,
    fetch: fakeFetch,
  });
  assert.deepEqual(JSON.parse(likes.stdout), [
    { id: '2026/like-weapon', count: 5, title: '好きな武器' },
  ]);
  assert.ok(requested.includes('/api/v1/likes/top?limit=10'));

  const localOnly = await run(['validate', '--remote'], {
    cwd,
    fetch: fakeFetch,
  });
  assert.equal(localOnly.code, 2);
});

test('リモートの API バージョンが違えばエラー', async () => {
  const cwd = await fixture();
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ version: API_VERSION + 1 }), {
      status: 200,
    })) as typeof fetch;
  const result = await run(['posts', 'list', '--remote'], {
    cwd,
    fetch: fakeFetch,
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /バージョン/);
});
