# infixer CLI 設計

infixer.net の「ブログ全体の情報」（記事・ポエム・登壇資料・作ったもの・いいね）を、ターミナルから閲覧・管理できるようにする CLI の設計メモ。

## 1. ゴールと非ゴール

### ゴール

- **閲覧**: 記事・ポエム・登壇資料・作ったものの一覧、本文表示、全文検索、統計をターミナルで扱える
- **執筆・管理（オーナー向け）**: 記事の雛形作成、frontmatter 検証、登壇資料の追加、OGP 生成をコマンド化する
- **機械可読**: すべての読み取り系コマンドが `--json` を持ち、`jq` やスクリプト、AI エージェント（将来の MCP サーバー）からそのまま使える
- **サイトと同じロジック**: slug の算出・スキーマ・日付の扱いをサイト本体と共有し、CLI とサイトで結果がずれないようにする

### 非ゴール

- **お気に入り（favorites）**: Astro の session（ブラウザーごとの Cookie + KV）に紐づくため、CLI から操作する意味が薄い。対象外とする
- **記事の公開フロー（git push / deploy）の置き換え**: 公開は従来どおり git とデプロイで行う。CLI はローカルファイルを作る・検証するところまで
- **リッチな TUI**: まずは素直なサブコマンド型。インタラクティブ UI は必要になってから

## 2. 現状のデータソース整理

| データ | 置き場所 | 識別子 | CLI からの取得方法 |
| --- | --- | --- | --- |
| 記事 | `src/content/blog/<year>/<name>.{md,mdx}` | `2026/like-weapon`（glob ローダーの id） | ローカル: ファイル読み込み / リモート: 新設 JSON API |
| ポエム | `src/content/poems/<year>/<name>.md` | `2026/keep-building-ui` | 同上 |
| 登壇資料・作ったもの | `src/lib/talks.ts`（TS の配列リテラル） | なし（title / url） | 現状は TS import のみ → **YAML 化を提案（後述）** |
| いいね数 | Turso（`Likes` テーブル: slug, count） | 記事 slug | `/api/likes/get?slug=` / 管理系はローカルから Turso 直 |
| お気に入り | Astro session（KV） | — | 対象外 |
| 全文検索 | `/api/search-posts`（全記事の本文を返す） | — | ローカルはファイル直検索 / リモートは静的インデックス |

## 3. 全体アーキテクチャ

```
                ┌──────────────────────────── packages/core（新設・純粋TS） ───────────────────────────┐
                │ schema.ts   … zod スキーマ（content.config.ts と共有）                                 │
                │ entry.ts    … ファイルパス → id/slug/URL/OGパス の算出（generate-og.mts と共有）        │
                │ frontmatter.ts … parse / stringify（yaml パッケージ）                                  │
                │ search.ts   … 検索・ソート（src/lib/search.ts の純粋部分を移設）                        │
                │ datetime.ts … src/lib/datetime.ts をそのまま移設                                       │
                └───────────────▲───────────────────────────────▲────────────────────────▲────────────┘
                                │                               │                        │
                     Astro サイト（src/）            scripts/generate-og.mts        cli/（新設）
                                                                                   │
                                                              ┌────────────────────┴───────────────────┐
                                                              │ DataSource インターフェース               │
                                                              │  ├ LocalSource  … リポジトリのファイルを読む │
                                                              │  └ RemoteSource … https://infixer.net を読む │
                                                              └─────────────────────────────────────────┘
```

ポイントは 2 つ。

1. **ロジックの共通化**: 今は slug 算出が `generate-og.mts` に、frontmatter パースが `generate-og.mts` に、検索が `src/lib/search.ts`（HTML 生成と混在）にばらけている。これを `packages/core`（あるいは `src/core/`）に寄せて、サイト・OG スクリプト・CLI が同じ関数を使う。zod は `astro/zod` から import すれば Node 単体でも動くので、`content.config.ts` のスキーマもここから読む形にできる。
2. **DataSource の抽象化**: 同じコマンドが「リポジトリ内で動かす（ローカル）」と「どこからでも infixer.net を読む（リモート）」の両方で動く。

```ts
// cli/src/source.ts
export interface DataSource {
  listPosts(opts?: { year?: number }): Promise<PostMeta[]>;
  getPost(id: string): Promise<Post | undefined>;   // body 付き
  listPoems(): Promise<PoemMeta[]>;
  getPoem(id: string): Promise<Poem | undefined>;
  listTalks(): Promise<Talk[]>;
  listWorks(): Promise<Work[]>;
  getLikes(id: string): Promise<number>;
}
```

モード判定:

- `--remote` / `--local` フラグがあればそれに従う
- なければ「カレントディレクトリから上に `astro.config.mjs` と `src/content/blog` が見つかればローカル、なければリモート」

## 4. コマンド体系

バイナリ名は `infixer`（ドメインと揃える）。リポジトリ内では `pnpm cli <command>` でも動く。

```
infixer <resource> <action> [args] [flags]
```

### 4.1 閲覧系（ローカル / リモート両対応）

| コマンド | 内容 |
| --- | --- |
| `infixer posts list [--year 2026] [--limit 20] [--since 2025-01-01]` | 記事一覧（新しい順）。id・日付・タイトル |
| `infixer posts show <id> [--raw] [--meta]` | 本文表示。既定は Markdown をターミナル向けに整形、`--raw` は原文、`--meta` は frontmatter のみ |
| `infixer posts open <id>` | ブラウザーで `https://infixer.net/blog/<id>` を開く |
| `infixer posts latest` | 最新記事 1 件を `show` |
| `infixer poems list` / `poems show <id>` | ポエムの一覧・本文 |
| `infixer talks list [--scope external\|internal] [--year 2026]` | 登壇資料一覧 |
| `infixer works list` | 作ったもの一覧 |
| `infixer search <query> [--title-only] [--collection blog\|poems]` | 全文検索。一致箇所の前後を抜粋表示 |
| `infixer stats` | 年別記事数、総数、平均文字数、直近の更新、登壇回数など |
| `infixer likes <id>` / `infixer likes top [--limit 10]` | いいね数（`top` はリモート API 追加後） |

`<id>` は `2026/like-weapon` 形式。曖昧指定も受け付ける（`like-weapon` だけで一意に決まればそれを採用、複数候補なら一覧を出してエラー）。

### 4.2 執筆・管理系（ローカル専用）

| コマンド | 内容 |
| --- | --- |
| `infixer posts new <name> [--title "..."] [--mdx] [--date 2026-10-09]` | `src/content/blog/<year>/<name>.mdx` を frontmatter 付きで生成。既存ファイルとの衝突はエラー |
| `infixer poems new <name> [--title "..."]` | ポエムの雛形 |
| `infixer posts edit <id>` | `$EDITOR` で開く。保存後に `validate` を自動実行 |
| `infixer posts touch <id>` | `updatedDate` を今日に更新 |
| `infixer validate [<id>...]` | frontmatter のスキーマ検証＋lint（後述）。CI でも使う |
| `infixer talks add` | 対話形式で登壇資料を追加（title / url / date / event / scope）。フラグでも指定可 |
| `infixer works add` | 作ったものを追加 |
| `infixer og [<id>...] [--force]` | `scripts/generate-og.mts` のラッパー。id 指定で単体生成 |

### 4.3 `validate` でチェックする内容

スキーマ検証（zod）に加えて、サイトのビルドでは気づきにくいものを拾う。

- `publishDate` / `updatedDate` が `YYYY-MM-DD` として妥当か、`updatedDate >= publishDate` か
- ファイル名の異常（例: 現在 `src/content/blog/2026/frontend-phpcon-do-lt-web-idl..mdx` のように `..` を含むものがある）
- 年ディレクトリと `publishDate` の年の不一致
- 同一タイトルの重複
- 本文中の `/images/...` 参照先が `public/` に存在するか
- `/blog/<id>` 形式の内部リンク切れ
- `references[].url` が URL として妥当か

### 4.4 共通フラグと出力規約

| フラグ | 意味 |
| --- | --- |
| `--json` | 機械可読出力。配列またはオブジェクトを 1 つだけ stdout に出す |
| `--remote` / `--local` | データソースを明示 |
| `--base-url <url>` | リモート時の接続先（既定 `https://infixer.net`、プレビュー環境の確認用） |
| `--no-color` | 色なし（`NO_COLOR` 環境変数も尊重） |

- 人間向け出力は表形式、stdout が TTY でないときは自動で色を外す
- エラーは stderr、終了コードは `0` 成功 / `1` 実行エラー / `2` 引数エラー / `3` 見つからない（`validate` の検出あり時は `1`）
- `--json` の形は §5 の API レスポンスと同一にして、ローカルとリモートで出力が変わらないようにする

出力例:

```
$ infixer posts list --year 2026 --limit 3
2026-09-08  2026/a11y-chiba-2026            変わらないものが変わりそうなときにどうするか立ち止まることが大事
2026-06-19  2026/web-browser-engineering   Webブラウザエンジニアリングを読んだ（写経なし）
2026-06-10  2026/frontend-phpcon-do-2026   フロントエンド・PHPカンファレンス北海道2026の参加記

$ infixer posts show like-weapon --meta --json
{"id":"2026/like-weapon","collection":"blog","title":"好きな武器","publishDate":"2026-05-29",
 "url":"https://infixer.net/blog/2026/like-weapon","ogImage":"https://infixer.net/og/2026-like-weapon.png"}
```

## 5. リモートモード用の読み取り API

既存の `/api/search-posts` は全記事の本文をまとめて返すので、一覧取得には重い。CLI 用に**ビルド時に静的生成する JSON**を追加する（`export const prerender = true`）。Worker を通らず静的配信されるので、コストもレイテンシも増えない。

| エンドポイント | 中身 |
| --- | --- |
| `GET /api/v1/index.json` | バージョン情報、各リソースの件数、生成日時（CLI の互換性チェック用） |
| `GET /api/v1/posts.json` | 記事メタデータ一覧（本文なし） |
| `GET /api/v1/posts/<id>.json` | 記事 1 件（メタデータ + Markdown 原文） |
| `GET /api/v1/poems.json` / `poems/<id>.json` | ポエム |
| `GET /api/v1/talks.json` / `works.json` | 登壇資料・作ったもの |
| `GET /api/v1/search-index.json` | 検索用（id・タイトル・本文プレーンテキスト） |
| `GET /api/likes/get?slug=` | 既存のまま利用 |
| `GET /api/v1/likes/top?limit=` | 新設（動的。DB 読み取りのみ） |

レスポンスの型は `packages/core` に定義し、サイトの API 実装と CLI の両方がそれを参照する。

```ts
export type PostMeta = {
  id: string;            // "2026/like-weapon"
  collection: 'blog';
  title: string;
  description?: string;
  publishDate: string;   // YYYY-MM-DD
  updatedDate?: string;
  url: string;           // 絶対URL
  ogImage: string;       // 絶対URL
  references?: { title?: string; url: string }[];
};
export type Post = PostMeta & { format: 'md' | 'mdx'; body: string };
```

MDX の本文はコンポーネント（`<LinkCard>` など）を含むので、CLI の整形表示ではコンポーネントタグを `[LinkCard: https://...]` のようなプレースホルダーに置き換える。

## 6. 登壇資料・作ったもののデータ化

`src/lib/talks.ts` は TS の配列リテラルなので、CLI から安全に追記するのが難しい（AST 書き換えが必要になる）。そこで次のように移す。

- `src/content/talks.yaml` / `src/content/works.yaml` を新設し、Astro の `file()` ローダーでコレクション化
- スキーマは `packages/core/schema.ts` に定義（`Talk` / `Work` 型はここから export）
- `Materials.astro` は `getCollection('talks')` で読む
- `infixer talks add` は `yaml` パッケージで読み込み → 追記 → 日付順に並べ替え → 書き戻し

```yaml
# src/content/talks.yaml
- id: web-haptics-api
  title: Web Haptics APIを語りたい
  url: https://speakerdeck.com/ryokatsuse/web-haptics-api-o-kataritai
  date: 2026-09-17
  event: Web UI 実装勉強会 #4
  scope: external
```

## 7. 実装方針

- **配置**: `cli/` ディレクトリ（`cli/src/index.ts` がエントリー）。`package.json` に `"bin": { "infixer": "cli/dist/index.js" }` と `"cli": "tsx cli/src/index.ts"` を追加
- **依存**: 引数パースは `node:util` の `parseArgs` ＋自前の小さなサブコマンドルーター。追加依存はなし（`yaml`・`tsx` は既存）。色付けは `node:util` の `styleText`
- **Markdown 整形**: 最初は見出し・リスト・コードブロックの最低限を自前で整形。物足りなければ `marked-terminal` などを検討
- **テスト**: `tsx --test`（既存の `test:images` と同じ流儀）。`LocalSource` は fixture ディレクトリ、`RemoteSource` は `fetch` をモックしてテスト。`--json` 出力のスナップショットテストでローカル/リモートの一致を担保
- **CI**: `infixer validate` を GitHub Actions に追加し、PR で frontmatter の不備を検出

## 8. 段階的な進め方

| フェーズ | 内容 | 成果 |
| --- | --- | --- |
| 1 | `packages/core` 切り出し、`LocalSource`、`posts/poems list/show`、`search`、`stats`、`validate` | リポジトリ内で閲覧・検証ができる。CI に validate を入れられる |
| 2 | `posts/poems new`、`edit`、`touch`、`og`、talks/works の YAML 化と `talks/works add` | 執筆・管理が CLI で完結する |
| 3 | `/api/v1/*` の静的 JSON、`RemoteSource`、`open`、`likes` | リポジトリ外から infixer.net を読める |
| 4 | npm 公開（`npx infixer posts latest`）、`likes top`・管理系、同じ core を使った MCP サーバー | 誰でも使える／AI エージェントからも操作できる |

## 9. 決定事項と実装時の変更点

| 項目 | 決定 |
| --- | --- |
| 配布範囲 | 自分用。npm 公開はしない（フェーズ 4 の npm 公開は対象外。グローバルに使うときは `pnpm link --global`） |
| talks.ts の YAML 化 | 行う。Scrapbox の「成果物」ページとは二重管理（Scrapbox には落選したプロポーザルなどのメモも載せているため） |
| 共通コードの置き場 | pnpm workspace（`packages/core` と `packages/cli`） |
| いいねの管理系コマンド | 持たない（`likes` は読み取りのみ） |

実装の過程で設計から変えた点:

- **CLI の置き場**: `cli/` ではなく workspace に揃えて `packages/cli` にした
- **登壇資料の id**: 例では `web-haptics-api` のように URL 由来にしていたが、Scrapbox や Speaker Deck の URL からは読みやすい id が作れないため、登壇日（`2026-09-17`、重複時は `-2`）にした。作ったものは URL から推測する
- **並び順の保持**: Astro の `file()` ローダーは id 順に並べ替えるため、YAML の並び順を `order` として持たせる parser（`parseOrderedYaml`）を通している
- **validate の終了コード**: error があれば 1、warning だけなら 0（`--strict` で warning も 1）。既存記事の warning で CI が落ちないようにするため
- **id の算出**: Astro の glob ローダーはファイル名をセグメントごとに slug 化する（`web-idl..mdx` → `web-idl`）。これまで `generate-og.mts` は slug 化していなかったので、`..` を含む記事の OGP 画像のパスがずれていた。core の `entryIdFromPath` に寄せて解消した
- **ローカル/リモートの一致**: 本文の前後の空行（Astro は落とす）と、同じ日付の記事の並び（id 順で固定）を揃えた
