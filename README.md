# ryokatsu.dev

## 公開ページの生成

トップ、記事一覧、About、登壇資料、ポエム一覧・本文、記事本文はビルド時に静的生成します。登壇資料・作ったもののOGP取得もビルド時に行い、生成したHTMLに保存するため、閲覧時に外部サイトの応答を待ちません。外部OGPの更新を反映するには再ビルド・デプロイしてください。取得失敗時は登録済みタイトルなどのフォールバックで生成を続行します。

お気に入りページとAPIは引き続きリクエスト時に処理します。静的ページでも、いいね・お気に入り・検索はブラウザーからAPIを呼び出します。

## 記事画像

Markdown/MDXの `![説明](/images/photo.jpg)` 形式のローカルJPEG・PNG・WebPは、remarkプラグインでAstroの画像処理に渡します。ビルド時にWebPと最大1472pxまでの複数サイズを生成し、本文幅（最大736px）に合わせた `srcset` / `sizes` と幅・高さを出力します。最初の画像は初期表示を遅らせないよう即時読み込みし、後続画像は遅延読み込みします。小さい画像は拡大せず、EXIFの回転も考慮します。

`public/images` の元画像はそのまま配信するため、OGPや既存の直接リンクは維持されます。外部画像・GIF・SVG・アニメーション画像・クエリ付きURL・HTMLのimgタグは対象外です。変換処理のテストは `pnpm test:images` で実行できます。

## infixer CLI

記事・ポエム・登壇資料・作ったもの・いいね数をターミナルから閲覧・管理するための自分用 CLI です。設計は [docs/cli-design.md](docs/cli-design.md) を参照してください。

### 構成

pnpm workspace で次の 2 パッケージに分けています。

| パッケージ | 役割 |
| --- | --- |
| `packages/core`（`@infixer/core`） | スキーマ・記事 id の算出・frontmatter・検索・日付処理・`/api/v1` のレスポンス型。サイト・`scripts/generate-og.mts`・CLI で共有 |
| `packages/cli`（`@infixer/cli`） | `infixer` コマンド本体。TypeScript を tsx でそのまま実行する（ビルド不要） |

### 実行方法

```sh
pnpm install
pnpm infixer --help          # リポジトリ内ならどこからでも
pnpm infixer posts list --year 2026
```

リポジトリの外からも使いたい場合は、`packages/cli` で `pnpm link --global` すると `infixer` コマンドがグローバルに入ります（この場合はリポジトリの外ではリモートモードで動きます）。

### ローカルモードとリモートモード

| モード | 読むもの | 選ばれる条件 |
| --- | --- | --- |
| ローカル | リポジトリの `src/content/**`・`src/content/talks.yaml`・`src/content/works.yaml` | リポジトリ内で実行したとき、または `--local` |
| リモート | `https://infixer.net/api/v1/*`（ビルド時に静的生成した JSON） | リポジトリ外で実行したとき、または `--remote` |

どちらのモードでも `--json` の出力は同じ形になります（`@infixer/core` の同じ関数で組み立てているため）。執筆・管理系のコマンドはローカルモード専用です。いいね数（`likes`）は DB にあるため、モードに関係なく常にサイトの API を読みます。

### 共通オプション

| オプション | 説明 |
| --- | --- |
| `--json` | 結果を JSON で出す（`jq` などに渡す用） |
| `--local` / `--remote` | データの読み先を明示する |
| `--base-url <url>` | リモートの接続先（既定 `https://infixer.net`。プレビュー環境や `wrangler dev` の確認に使う） |
| `--no-color` | 色を付けない。`NO_COLOR` 環境変数、パイプ出力時も自動で無効 |
| `-h, --help` | ヘルプ。`infixer posts --help`・`infixer posts list --help` のようにコマンドごとにも出せる |
| `-v, --version` | バージョン |

### 記事・ポエムの指定方法（`<id>`）

`2026/like-weapon` のような id（`/blog/` 以降の URL）で指定します。次の形も受け付けます。

- 末尾だけ: `like-weapon`（一意に決まる場合）
- URL: `https://infixer.net/blog/2026/like-weapon/`
- ファイルパス: `src/content/blog/2026/like-weapon.mdx`

`0101` のように候補が複数ある場合は候補一覧を出してエラー（終了コード 2）になります。

### コマンド一覧

#### 閲覧（ローカル / リモート両対応）

| コマンド | 説明 | オプション |
| --- | --- | --- |
| `infixer posts list` | 記事一覧（新しい順） | `--year <YYYY>` `--since <YYYY-MM-DD>` `--limit <n>` |
| `infixer posts show <id>` | 本文をターミナル向けに整形して表示 | `--raw`（Markdown 原文）`--meta`（frontmatter だけ） |
| `infixer posts latest` | 最新記事を表示 | `--raw` `--meta` |
| `infixer posts open <id>` | ブラウザーで開く | |
| `infixer poems list` / `show <id>` / `latest` / `open <id>` | ポエム版（オプションは posts と同じ） | |
| `infixer talks list` | 登壇資料一覧（新しい順） | `--scope external\|internal` `--year <YYYY>` `--limit <n>` |
| `infixer works list` | 作ったもの一覧 | |
| `infixer search <query>` | タイトルと本文を全文検索（大文字小文字は区別しない） | `--title-only` `--collection blog\|poems` `--limit <n>`（既定 20） |
| `infixer stats` | 年別の記事数・平均文字数・最新/最終更新・登壇回数など | |
| `infixer likes <id>` | 記事のいいね数 | |
| `infixer likes top` | いいねの多い記事 | `--limit <n>`（既定 10、最大 100） |

整形表示では MDX の `import` を省き、`<LinkCard url="…" />` などのコンポーネントは `[LinkCard] https://…` のように表示します。

#### 執筆・管理（ローカル専用）

| コマンド | 説明 | オプション |
| --- | --- | --- |
| `infixer posts new <name>` | `src/content/blog/<年>/<name>.md` を frontmatter 付きで作る。`<name>` は英小文字・数字・`-` `_` | `--title <text>`（省略時は対話入力）`--date <YYYY-MM-DD>`（既定: 今日）`--mdx` |
| `infixer poems new <name>` | ポエムの雛形 | 同上 |
| `infixer posts edit <id>` / `poems edit <id>` | `$VISUAL` / `$EDITOR`（なければ `vi`）で開き、閉じたらその記事を validate | |
| `infixer posts touch <id>` | `updatedDate` を今日にする（frontmatter の他の書式は保つ） | `--date <YYYY-MM-DD>` |
| `infixer talks add` | 登壇資料を `src/content/talks.yaml` に追加（日付順に挿入）。足りない項目は対話で聞く | `--title` `--url` `--date` `--event` `--scope`（既定 external）`--id`（既定: 登壇日） |
| `infixer works add` | 作ったものを `src/content/works.yaml` の末尾に追加 | `--title` `--url` `--description` `--id`（既定: URL から推測） |
| `infixer validate [<id>...]` | コンテンツを検証（下記）。id を渡すとその記事だけ | `--strict`（warning でも失敗にする） |
| `infixer og [<id>...]` | OGP 画像を生成（`pnpm og` と同じ。id 指定でその記事だけ） | `--force` |

#### `validate` の検査内容

| レベル | 内容 |
| --- | --- |
| error | frontmatter が読めない・スキーマ違反（`@infixer/core` のスキーマは `src/content.config.ts` と共通） |
| error | `publishDate` / `updatedDate` が `YYYY-MM-DD` の実在する日付でない、`updatedDate` が `publishDate` より前 |
| error | ファイル名がそのまま URL にならない（例: `..` を含む、大文字や記号を含む） |
| error | 本文中のサイト内リンク（`/blog/…`・`/poems/…`・`https://infixer.net/…`・旧ドメイン `ryokatsu.dev`）のリンク切れ |
| error | 本文中の画像などのローカルファイル（`/images/…` など）が `public/` にない |
| error | 同じ id の記事が複数ある、`talks.yaml` / `works.yaml` のスキーマ違反・id の重複・実在しない日付 |
| warning | 年ディレクトリと `publishDate` の年が違う、同じタイトルの記事がある |

コードブロック・インラインコードの中は検査しません。CI（`.github/workflows/ci.yml` の `CLI / Content Validate`）でも実行しています。

### 終了コード

| コード | 意味 |
| --- | --- |
| 0 | 成功 |
| 1 | 実行時エラー（通信失敗など）、`validate` で error を検出 |
| 2 | 引数の誤り、候補が複数ある、ローカル専用コマンドをリモートで実行 |
| 3 | 指定した記事が見つからない、`search` で 1 件も一致しない |

### 使用例

```sh
# 2026年の記事を JSON で取り出してタイトルだけ並べる
pnpm -s infixer posts list --year 2026 --json | jq -r '.[].title'

# 記事を書き始める → 編集 → 検証
pnpm infixer posts new web-haptics --title "Web Haptics API を語りたい" --mdx
pnpm infixer posts edit web-haptics

# 登壇資料を追加（足りない項目は対話で入力）
pnpm infixer talks add --url https://speakerdeck.com/ryokatsuse/xxx

# 本番サイトから最新記事を読む
infixer posts latest --remote
```

### 登壇資料・作ったもののデータ

`src/content/talks.yaml` / `src/content/works.yaml` に置き、Astro の `file()` ローダーでコレクションとして読み込んでいます（`/materials` ページと `/api/v1/talks.json`・`works.json`）。Scrapbox の「成果物」ページとは別管理です（Scrapbox には落選したプロポーザルなどのメモも含むため）。

- 登壇資料はファイル上では古い順に並べ、表示では新しい順にします。id は既定で登壇日（同じ日が複数あれば `-2` などを付ける）
- 作ったものはファイルの並び順がそのまま表示順です
- `id` と日付は YAML 1.1 で日付型に解釈されないようダブルクォートで書きます（`infixer talks add` は自動でそうします）

### CLI 向け API（`/api/v1`）

リモートモード用に、ビルド時に静的生成する JSON を配信しています（Workers を通らないため実行コストはかかりません）。

| パス | 内容 |
| --- | --- |
| `/api/v1/index.json` | API バージョン・件数・生成日時。CLI はバージョンが一致するか最初に確認する |
| `/api/v1/posts.json` / `/api/v1/poems.json` | 一覧（本文なし、新しい順） |
| `/api/v1/posts/<id>.json` / `/api/v1/poems/<id>.json` | 1 件（本文の Markdown 付き） |
| `/api/v1/talks.json` / `/api/v1/works.json` | 登壇資料・作ったもの |
| `/api/v1/search-index.json` | 検索用のプレーンテキスト |
| `/api/v1/likes/top?limit=n` | いいねの多い記事（これだけ動的・読み取り専用） |

### 開発

```sh
pnpm test:cli            # CLI と @infixer/core のテスト
pnpm typecheck:packages  # packages/* の型チェック
```
