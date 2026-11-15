# フィード（旧：日記）

PC・スマホ・タブレットのブラウザから、SNS に書くくらいの気軽さで投稿する短い投稿（フィード）です。最初は「日記」として作ったため、コード・DB・管理画面のパスには `diary` の名前が残っています。ブログ（Git 管理の Markdown をビルド時に生成）と違い、投稿は DB に保存し、保存した瞬間に公開されます。

## 全体像

| 項目 | 方針 |
| --- | --- |
| 保存先 | 本文・リンクカードは Cloudflare D1（`DIARY_DB`）、画像は R2（`DIARY_MEDIA`） |
| 表示 | `/feed`（タイムライン）・`/feed/<id>`（1 投稿）をリクエスト時に描画。トップページの右カラムに最新 5 件 |
| 投稿 | `/admin/diary`（新規）・`/admin/diary/<id>/edit`（編集） |
| 認証 | Cloudflare Access で `/admin/*` と `/api/admin/*` を保護。Worker 側でも JWT を検証する |
| タイトル | 持たない。見出しは投稿日時（個別ページの title は「2026年11月15日の日記」） |
| 公開範囲 | すべて公開（非公開の日記は作らない） |

いいね（Turso）は今のところ別の DB のまま。D1 への移行は後で行う。

## 投稿画面の操作

文字を書くことをいちばん大事にして、操作は最小限にしている。太字などの装飾は持たない。

- **文字**：textarea にそのまま書く。改行はそのまま表示される。文字数制限なし。入力量に合わせて高さが伸びる
- **画像**：画像ボタンからファイルを選ぶ（貼り付け・ドラッグ＆ドロップも可）。1 投稿 4 枚まで
  - ブラウザで長辺 1600px に縮小し、WebP（Safari では JPEG）に変換してから送る。canvas に描き直すので、位置情報などの EXIF もここで消える
  - GIF はアニメーションを残すため、そのまま送る
- **リンク**：URL だけを貼り付けると、その場でリンクカードになる（本文には入らない）。文章の途中に URL を書いた場合は、ただのリンクになる
- **投稿**：「投稿する」ボタンか ⌘/Ctrl + Enter。スマホでは、本文が長くなってもツールバーが画面の下に残る
- **下書き**：新規投稿の書きかけは localStorage に自動保存し、次に開いたときに復元する

## ホーム画面から開く（PWA）

投稿画面（`/admin/diary` 以下）だけを PWA にして、スマホのホーム画面からワンタップで開けるようにしている。

- マニフェストは `public/diary-app/manifest.webmanifest`。scope と start_url は `/admin/diary`
  - ブラウザは Cookie なしでマニフェストを取りに行くため、Access で保護していない `/diary-app/` に置いている
- アイコンは `scripts/generate-diary-icons.mts` で生成する（`pnpm exec tsx scripts/generate-diary-icons.mts`）
- ホーム画面から開いたとき（`display-mode: standalone`）は、サイト全体のヘッダーとフッターを隠す
- **Android**：他のアプリの「共有」から日記を選ぶと、URL はリンクカードに、それ以外の文章は本文に入った状態で投稿画面が開く（`share_target`）。iOS は Web アプリの共有先に対応していない
- Service Worker は持たない（オフラインで書く必要がないため）。書きかけは localStorage に残る

追加のしかた：

- iPhone / iPad：Safari で `/admin/diary` を開き、共有 → 「ホーム画面に追加」
- Android：Chrome で開き、メニュー → 「ホーム画面に追加」（または「アプリをインストール」）

iPhone のホーム画面から開いたアプリは Safari と Cookie を共有しないため、初回はアプリの中で Access のログインがもう一度必要になる。何度もログインしなくて済むよう、Access のアプリケーションの Session Duration を長め（例：1 か月）にしておくとよい。

## 表示（SNS 風）

1 投稿は「アイコン・名前・日時 → 本文 → 画像 → リンクカード」の順に並ぶ。

- 本文中の URL は自動でリンクにする。リンクカードにした URL だけの行は本文から省く
- 画像は 1 枚なら元の比率（縦長は 3:4 で切り、最大高さあり）、2〜4 枚は 16:9 の枠にグリッドで並べる。タップすると元の画像を開く
- リンクカードはブログと同じ `LinkCardView.astro` を使う（ブログの `<LinkCard>` もこのコンポーネントで描画している）

## トップページ

広い画面（`lg` 以上）では、ブログ（左）とフィード（右、幅 18rem）の 2 カラムにしている。狭い画面では、ブログ・ポエムのあとにフィードが続く。登壇資料・作ったものは 2 カラムの下に全幅で置く。

- トップページはビルド時に静的生成しているので、フィード部分（`FeedTimeline.astro`）だけを `server:defer`（サーバーアイランド）にしている。ページ本体は静的なまま、最新 5 件をリクエスト時に差し込む
- 読み込み中は仮表示（スケルトン）を出す。D1 が読めないときも、トップページ自体は表示される
- 1 件は「日時・本文（4 行まで）・1 枚目の画像（2 枚以上なら +N）・1 つ目のリンクのタイトル」。全体が `/feed/<id>` へのリンク

## リンクカードの取得

`src/lib/ogp.ts` の `fetchOgp` で取得する（ブログの登壇資料などと共通）。

- YouTube は、Cloudflare Workers などデータセンターからのアクセスに、動画の情報（`og:title`・`og:image`）が無いページを返す。そのため YouTube の URL は公式の oEmbed API（`https://www.youtube.com/oembed`）からタイトル・チャンネル名・サムネイルを取る。他に同じ問題のあるサイトが出てきたら `OEMBED_PROVIDERS` に足す
- Cosense（Scrapbox）は HTML に OGP が無いので API から取る

## データ

`db/diary-migrations/0001_init.sql`

```sql
diary_posts   (id, body, images JSON, links JSON, published_at, created_at, updated_at)
link_previews (url, title, description, image, site_name, favicon_url, fetched_at)
```

- `images`：`[{ key, width, height }]`。`key` は R2 のキー（`diary/2026/11/<id>.webp`）で、`/media/<key>` から配信する
- `links`：リンクカードにする URL の配列
- `link_previews`：OGP のキャッシュ。投稿画面のカードにある再取得ボタンで取り直せる（`?refresh=1`）。貼り付けたときと保存したときに取得し、閲覧時は DB を読むだけにする。取得に失敗した URL は保存せず、次の機会に取り直す

容量の目安：日本語 2,000 字は約 6KB なので、毎日書いても 1 年で数 MB。画像は R2 に置くので D1 にはほぼ影響しない。

## ルーティング

| パス | 内容 |
| --- | --- |
| `GET /feed` | タイムライン（20 件ずつ。`?before=<published_at>` で前のページ） |
| `GET /feed/<id>` | 1 投稿 |
| `GET /diary`・`/diary/<id>` | `/feed` へ 301 リダイレクト（名前を変える前のリンク用） |
| `GET /media/<key>` | R2 の画像を配信（`immutable` で長期キャッシュ） |
| `GET /admin/diary` | 投稿画面と最近の投稿（編集・削除） |
| `GET /admin/diary/<id>/edit` | 編集画面 |
| `GET /admin/diary/link-card?url=` | OGP を取得し、カードの HTML 断片を返す（Astro の partial） |
| `POST /api/admin/diary/posts` | 投稿 |
| `PUT /api/admin/diary/posts/<id>` | 更新（外した画像は R2 からも消す） |
| `DELETE /api/admin/diary/posts/<id>` | 削除（画像も消す） |
| `POST /api/admin/diary/media` | 画像を R2 に保存 |

## セットアップ

### 1. D1・R2

`wrangler.jsonc` に `DIARY_DB`（`infixer-diary`）と `DIARY_MEDIA`（`infixer-diary-media`）を定義してある。どちらも事前に作成済み（`wrangler d1 create infixer-diary` / `wrangler r2 bucket create infixer-diary-media`）。

デプロイ前に、本番の D1 にテーブルを作る（マイグレーションを追加したときも同じ）。

```sh
pnpm exec wrangler d1 migrations apply infixer-diary --remote
```

### 2. Cloudflare Access

1. Cloudflare ダッシュボードの Zero Trust → Access → Applications で Self-hosted のアプリを作る
2. ドメインに `infixer.net/admin` と `infixer.net/api/admin` を登録する
3. ポリシーで自分のメールアドレスだけを Allow にする（ログイン方法はワンタイム PIN や GitHub）
4. アプリの **Application Audience (AUD) Tag** を控える
5. Worker に次の 2 つを設定する（変数か secret）

```sh
pnpm exec wrangler secret put CF_ACCESS_TEAM_DOMAIN   # 例: myteam.cloudflareaccess.com
pnpm exec wrangler secret put CF_ACCESS_AUD           # 控えた AUD タグ
```

この 2 つが無いと、管理画面と API はすべて 403 を返す（設定漏れのときは開けずに閉じる）。`astro dev` では検証しない。

### 3. ローカル開発

`wrangler.jsonc` の `database_id` を変えたときは、ローカルの D1 も別のファイルになるので、マイグレーションを流し直す。

```sh
pnpm exec wrangler d1 migrations apply infixer-diary --local
pnpm dev
```

`http://localhost:4321/admin/diary` から投稿できる。D1・R2 はローカルの模擬環境（`.wrangler/state`）に保存されるので、本番のデータには触れない。

## 今後

- いいねを D1 に移し、日記にもいいねを付ける
- フィードの RSS
- `/api/v1/feed.json` と `infixer feed` コマンド
- 投稿前に削除した画像が R2 に残るので、定期的に掃除する
- 検索の対象に日記を含める
