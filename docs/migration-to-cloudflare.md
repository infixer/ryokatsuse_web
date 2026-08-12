# Vercel → Cloudflare 移行ログ / 計画

最終更新: 2026-07-29

## 目的

- お名前.com をやめて、より安価なドメイン管理に乗り換える
- 新ドメイン **infixer.net**（Cloudflare Registrar で取得済み）を正式サイトにする
- 旧ドメイン **ryokatsu.dev** からはパスを保持したリダイレクトで新サイトへ誘導する
- ホスティングを Vercel から Cloudflare Workers に移す
- OGP 生成も新サイト（infixer.net）向けに直す

個人サイトのため、移行時に多少の障害が出ても許容する方針。

## 移行前の状態

| 項目 | 内容 |
| --- | --- |
| ryokatsu.dev レジストラ | お名前.com |
| ryokatsu.dev DNS | Vercel DNS (`ns1.vercel-dns-2.com` / `ns2`) |
| DNS レコード | apex / www とも A レコードのみ。MX・TXT なし（2026-07-29 時点で `dig` 確認済み） |
| infixer.net | Cloudflare NS (`carrera` / `zahir`) でアクティブ済み |
| アプリ | Astro 7 / `output: 'server'` / `@astrojs/vercel` |
| DB | Astro DB (`@astrojs/db`) → Turso (aws-ap-northeast-1) にリモート接続 |
| OGP | `src/pages/og/[slug].png.ts` で satori + `@resvg/resvg-js`（`prerender = true`） |

## フェーズ計画

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 1 | アプリを Cloudflare Workers 対応にする（アダプタ・OGP・DB・セッション） | ✅ 完了 |
| 2 | ryokatsu.dev の DNS を Cloudflare へ移す（NS 変更・向き先は Vercel のまま） | ✅ 完了 (2026-07-29) |
| 3 | Workers にデプロイし、infixer.net を Custom Domain として本番化 | ✅ 完了 (2026-07-29) |
| 4 | ryokatsu.dev → infixer.net の 301 リダイレクトを設定（Phase 3 と同日に） | ✅ 完了 (2026-07-29) |
| 5 | ryokatsu.dev のレジストラを お名前.com → Cloudflare Registrar へ移管 | ✅ 完了 (2026-07-29) |

### なぜ DNS 移行（Phase 2）を先にやるか

Cloudflare の Redirect Rules は ryokatsu.dev のゾーンが Cloudflare に載っていないと設定できない。
つまり「新サイト公開 → リダイレクト設置」の間に NS 切替の待ち時間（数十分〜24h）が挟まると、
その間ずっと **同一コンテンツが 2 ドメインで別々の canonical を持って並存**する。

- `infixer.net` … canonical `https://infixer.net/...`
- `ryokatsu.dev` … Vercel の旧デプロイが生存、canonical `https://ryokatsu.dev/...`

新規ドメインの立ち上がりとしては最悪のパターンなので、これを避ける。

Phase 2 は「Cloudflare にゾーンを追加 → 現行の Vercel A レコードをそのまま Proxy OFF で登録 →
NS 変更」であり、**実行してもサイトの挙動は一切変わらない**（Vercel を向いたまま）。
リスクなしで先に済ませられるので先にやる。ゾーンが Active になってから Phase 3 → 4 を
同じ作業セッションで通せば、重複期間は分単位に収まる。

---

## Phase 1: アプリの Cloudflare Workers 対応（完了）

### 依存関係

```bash
pnpm remove @astrojs/vercel
pnpm add @astrojs/cloudflare
pnpm add -D wrangler tsx yaml
```

`package.json` に `pnpm.onlyBuiltDependencies: ["workerd"]` を追加（`wrangler dev` に必要なビルドスクリプトの許可）。

### astro.config.mjs

- アダプタを `vercel()` → `cloudflare({ imageService: 'compile' })` に変更
  - Workers 実行時に `sharp` は動かないため、画像最適化はビルド時に完了させる
- `site` を `https://ryokatsu.dev` → `https://infixer.net` に変更
- `session: { driver: sessionDrivers.memory() }` を削除
  - Cloudflare アダプタが `SESSION` KV バインディングを自動で配線する
- `db()` → `db({ mode: 'web' })`（後述のハマりどころ 1）
- `vite.resolve.alias` に `cross-fetch` のシムを追加（後述のハマりどころ 2）

### wrangler.jsonc（新規）

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "infixer-net",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "kv_namespaces": [{ "binding": "SESSION" }]
}
```

- `main` は `./dist/_worker.js/index.js` ではなくアダプタ提供のエントリポイントを指す。
  dist を直接指すと `astro sync` 時点で「main field doesn't point to an existing file」で落ちる
- KV namespace は id を書かなくてもデプロイ時に Wrangler が自動プロビジョニングする

### OGP 生成をビルド前の静的生成に変更

**問題**: `@resvg/resvg-js` はネイティブバイナリ（`.node`）。Astro のサーバービルドは
prerender なルートも含めて Worker バンドルに入れるため、rolldown が `.node` を読めず
`UNLOADABLE_DEPENDENCY` でビルドが失敗する。`vite.ssr.external` で外部化しても回避できない。

**対処**: OGP 生成を Astro のルートから外し、ビルド前の Node スクリプトに移した。

- 削除: `src/pages/og/[slug].png.ts`
- 追加: `scripts/generate-og.mts`
  - `src/content/blog/**` と `src/content/poems/**` を走査し、frontmatter の `title` を読む
  - Astro の glob ローダーと同じ id 規則でスラグを組み立てる（poems は `poems-` 接頭辞）
  - `public/og/<slug>.png` に書き出す（144 件）
  - PNG がソースより新しければスキップ。`pnpm og --force` で全再生成
- `package.json`: `"build": "pnpm og && astro build --remote"`、`"og": "tsx scripts/generate-og.mts"`

出力パスは従来のエンドポイントと同一（`/og/<slug>.png`）なので、ページ側の参照は変更不要。
元々 `prerender = true` だったため実質的な挙動は変わらない。

**副作用**: `src/pages/ogp-test.astro` を削除した。任意テキストの動的 OG 生成に依存した
デバッグ用ページで、静的生成では機能しないため。

### ブランド文字列の変更

`SITE_TITLE` を `ryokatsu.dev` → `infixer.net` に変更。これに伴い以下も更新:

- `src/config.ts` — `SITE_TITLE`（OGP 画像右下の表記もここを参照）
- `src/components/Layout.astro` — ハードコードされていた `siteTitle` を `SITE_TITLE` 参照に
- `src/pages/posts-feed.xml.js` — RSS の `title`
- `src/pages/index.astro` — sr-only の h1
- `src/pages/about.astro` — ページタイトル
- `src/components/LinkCard.astro` — 内部リンク判定に `infixer.net` / `www.infixer.net` を追加。
  `ryokatsu.dev` はリダイレクト元として残すため判定に残置

### .gitignore

```
.wrangler/
public/og/
.font-cache/
.dev.vars
```

`.dev.vars` は `.env.local` のコピー（`wrangler dev` は `.env.local` を読まないため）。
ただし `ASTRO_DB_REMOTE_URL` は `libsql://` → `https://` に書き換えてある。

---

## ハマりどころ

### 1. astro:db が Node ビルドの libsql クライアントを掴む

`/api/likes/*` が全て 500。エラーの `cause` を掘ると:

```
TypeError: Cannot read properties of null (reading 'has')
    at processHeader (node-internal:internal_http_outgoing:904:39)
    at ClientRequest._storeHeader (node-internal:internal_http_outgoing:209:21)
```

`@astrojs/db` は既定で `@libsql/client`（Node ビルド）を読む。これは `node:http` に依存しており、
`nodejs_compat` の http シムが不完全なため実行時に落ちる。

**対処**: `db({ mode: 'web' })`。`@astrojs/db` の integration オプションで、
`@libsql/client/web`（HTTP only）に切り替わる。

### 2. hrana-client が cross-fetch 経由で node-fetch をバンドル

mode: 'web' にしても同じエラー。バンドルを見ると `node-fetch@2` が入っている。
`@libsql/hrana-client` が `cross-fetch` を使っており、バンドル時に Node 向け実装が選ばれていた。

**対処**: `src/lib/cross-fetch-shim.ts` を追加し、`vite.resolve.alias` で `cross-fetch` を
そこに向ける。中身はグローバル `fetch` の再エクスポートのみ。Workers も Node 22 も
グローバル `fetch` を持っているのでビルド時・実行時どちらでも動く。

### 3. wrangler dev がビルド成果物を拾い直さない

`pnpm build` し直しても `wrangler dev` が古い Worker を保持することがあり、
新規ルートが 404 になった。検証中は都度 `wrangler dev` を再起動するのが確実。

---

## Phase 1 の検証結果（ローカル `wrangler dev`）

```
/, /about, /blog, /blog/2026/astro-db-like/, /poems, /materials   200
/favorites (SSR + session)                                        200
/og/2026-astro-db-like.png, /og/poems-*.png                       200 image/png
/posts-feed.xml, /sitemap-index.xml                               200
/api/likes/get?slug=2026/astro-db-like  → {"count":17}   Turso remote クエリ成功
/api/favorites/toggle → /api/favorites/check             KV セッション往復成功
/api/search-posts                                                 200
```

- 生成済み OGP 画像の右下表記が `infixer.net` になっていることを目視確認
- prerender されたページの `og:url` / `og:image` が `https://infixer.net/...` になっていることを確認
- `pnpm lint` — 通過（警告は biome が .astro の frontmatter を解釈できないことによる既存のもの）
- `pnpm astro check` — 0 errors

なお `/api/likes/toggle` は本番 Turso への書き込みになるため実行していない。
読み取りが通っている時点でクライアントの動作は確認できている。

---

## Phase 2: ryokatsu.dev の DNS を Cloudflare へ（✅ 完了 2026-07-29）

サイトの向き先は Vercel のまま。無停止で先に済ませておく前段作業。

**実施記録**: NS 切替はお名前.com での保存から約 4 分で反映（10:15 保存 → 10:19 切替確認）。
ゾーン Active、サイト無停止を確認。DNSSEC は元から無効で対応不要だった。
Vercel DNS にはワイルドカード `*` A レコードがあったが、実利用サブドメインは無く複製せず。
apex MX / TXT なし、CAA は Vercel 自動付与のもので複製不要と判断。
Search Console の infixer.net プロパティは Google×Cloudflare 連携で TXT 自動追加により検証。

1. Cloudflare Dashboard → Add a domain → `ryokatsu.dev`（Free プラン可）
2. 移行前に現行の Vercel DNS レコードを書き出す（`npx vercel dns ls ryokatsu.dev`）。
   apex に MX / TXT がないことは確認済みだが、サブドメインやメール認証用 TXT の有無を念のため確認
3. Cloudflare 側に Vercel 向けのレコードを **Proxy OFF (DNS only)** で登録（この時点では Vercel を向けたまま）

   Vercel Dashboard → Settings → Domains に表示された値（2026-07-29 取得）:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | `@` | `216.198.79.1` |
   | CNAME | `www` | `e88146813433c370.vercel-dns-017.com` |

   - **`dig` で見えている IP をコピーしてはいけない**。実測は apex `76.76.21.241` /
     `66.33.60.67`、www `76.76.21.98` / `76.76.21.142` と上表のどれとも一致しない。
     これは Vercel DNS が自前で返している最適化応答で、外部 DNS から使う値ではない。
     必ず Dashboard の表示値を使う。CNAME はプロジェクト固有値なので他所の記事の値も使えない
   - Proxy ON にすると Vercel の証明書検証と衝突するので、この段階では必ず OFF
4. お名前.com → ネームサーバー設定 → 「その他のネームサーバーを使う」で Cloudflare の NS 2 件に変更
5. ゾーンが Active になるまで待つ（数十分〜24h）。この間サイトは Vercel のまま動く
6. SSL/TLS を **Full (strict)**、Edge Certificates で **Always Use HTTPS** を ON
   （`.dev` は HSTS プリロード済みなので HTTPS 必須）
7. Google Search Console に `infixer.net` のプロパティを追加して所有権確認まで済ませておく
   （Phase 4 のアドレス変更ツールで必要になる）

## Phase 3: Workers へのデプロイと infixer.net の本番化（✅ 完了 2026-07-29）

**実施記録**（doc の当初手順から変更あり: Dashboard の Connect to Git ではなく CLI から直接デプロイした）:

1. Vercel の Git 連携を Disconnect（master マージ時に Vercel がビルドしないように）
2. PR #78 (`fix/deploy`) を master にマージ
3. `pnpm build` → `pnpm exec wrangler deploy`
   - KV namespace `infixer-net-session` はデプロイ時に自動プロビジョニングされた
4. `.dev.vars` の値（https:// 形式）から `wrangler secret put` で
   `ASTRO_DB_REMOTE_URL` / `ASTRO_DB_APP_TOKEN` を登録
5. workers.dev で全ルート 200・Turso クエリ成功を確認
6. Custom Domain 接続: **wrangler.jsonc の `routes`（`custom_domain: true`）は
   wrangler 4.115.0 が黙って無視した**ため、API で直接アタッチした:
   `PUT /accounts/{account}/workers/domains`（zone_id, hostname, service, environment）。
   wrangler.jsonc の routes 定義は意図の記録として残置（アタッチ済みなので冪等）
7. infixer.net で全ルート 200、canonical `https://infixer.net/...`、いいね API 成功を確認

**未了**: Git push → 自動デプロイの CI 接続（Workers Builds）。当面は手動
`pnpm build && pnpm exec wrangler deploy` で運用し、必要になったら Dashboard →
Workers & Pages → infixer-net → Settings → Build から Git を接続する。

### 当初の手順（参考・Dashboard 経由の場合）

1. Turso のシークレットを **`https://` 形式**で登録する

   ```bash
   pnpm exec wrangler secret put ASTRO_DB_REMOTE_URL
   pnpm exec wrangler secret put ASTRO_DB_APP_TOKEN
   ```

2. Cloudflare Dashboard → Workers & Pages → Create → Connect to Git でこのリポジトリを接続
   - Build command: `pnpm build`
   - Deploy command: `pnpm exec wrangler deploy`
   - 環境変数に `ASTRO_DB_REMOTE_URL` / `ASTRO_DB_APP_TOKEN`（`astro build --remote` がビルド時に使う）
3. `*.workers.dev` で動作確認
4. Worker の Settings → Domains & Routes → Add Custom Domain → `infixer.net`
5. OGP、RSS、`/api/*`、いいね、お気に入りを一通り確認

`.github/workflows/ci.yml` は lint / astro check のみなので変更不要。

## Phase 4: ryokatsu.dev → infixer.net のリダイレクト（✅ 完了 2026-07-29）

**実施記録**:

- Redirect Rules で「すべての受信リクエスト」→ 動的
  `concat("https://infixer.net", http.request.uri.path)`、301、クエリ保持で作成
- ルール作成後に DNS 2 件をプロキシ ON（オレンジ雲）に切替。この順序なら素通りの瞬間がない
- 検証: apex / パス保持 / クエリ保持 / RSS / 旧 OGP / www / http いずれも 301 →
  infixer.net。http も 1 ホップで直接 https://infixer.net に飛ぶ（Always Use HTTPS を
  経由しない）ことを確認。最終到達 200・リダイレクト 1 回
- Vercel プロジェクトは削除済み
- **未了**: Search Console のアドレス変更ツール（ryokatsu.dev → infixer.net）

### 当初の計画（参考）

Cloudflare の **Redirect Rules**（Worker 不要・無料）でパスを保持した 301 を 1 本設定する。

- 対象: `ryokatsu.dev` および `www.ryokatsu.dev` の全リクエスト
- 転送先: `https://infixer.net` + 元のパス・クエリ
- ステータス: 301（Permanent）

`Always Use HTTPS` と併用すると `http://ryokatsu.dev/x → https://ryokatsu.dev/x →
https://infixer.net/x` の 2 ホップになる。Redirect Rule の式を http / https 両方にマッチさせれば
1 ホップにできる。`.dev` は HSTS プリロード済みでブラウザは http を投げないため実害は小さいが、
クローラ向けにやっておくと無駄がない。

設定後、Vercel プロジェクトからドメインを削除する（**必ず切替後**。先に消すと Vercel が 503 を返す）。

検証項目:

- `curl -I https://ryokatsu.dev/blog/2026/astro-db-like/` が 301 で
  `https://infixer.net/blog/2026/astro-db-like/` に飛ぶこと
- ルート、RSS (`/posts-feed.xml`)、旧 OGP パスも同様に飛ぶこと

### SEO 上の後始末

- **Google Search Console のアドレス変更ツール**を使う。301 設置後、両プロパティが検証済みの状態で
  ryokatsu.dev → infixer.net を申請する。評価の引き継ぎが明示的に速くなる
- **旧ドメインに noindex は付けない**。301 と競合してリンク評価が失われる。301 だけで正しい
- パスは 1:1 対応であること。まとめてトップに飛ばすと soft 404 扱いになる（同一アプリなので条件は満たす）
- infixer.net で `/sitemap-index.xml` を Search Console に送信する。
  `@astrojs/sitemap` は `site`（= infixer.net）基準で生成するので内容は既に正しい
- `public/robots.txt` は存在しない（Astro も生成しない）ので対応不要

## Phase 5: レジストラ移管（✅ 完了 2026-07-29）

**実施記録**: Phase 4 と同日に実施。Whois 代行・移管ロックはともに元から未設定で解除作業なし。
AuthCode 取得 → Cloudflare Transfer Domains（$12.20）→ お名前.com の承認メールで承認 →
約 1 時間で完了。レジストラは CloudFlare, Inc.、有効期限は 2027-08-26 に延長された。
移管中もリダイレクトは無停止。

**残タスク**:

- [ ] Cloudflare で ryokatsu.dev の自動更新（Auto-renew）を OFF にする（失効方針のため必須）
- [ ] お名前.com の退会（ryokatsu.bar の扱いを決めてから）
- [ ] Search Console のアドレス変更ツール（ryokatsu.dev → infixer.net）
- [ ] 必要なら Workers Builds の Git 接続（現状デプロイは手動
      `pnpm build && pnpm exec wrangler deploy`）

（以下は当初の計画メモ）

**方針（2026-07-29 決定）**: ryokatsu.dev は恒久維持しない。移管で自動付与される +1 年
（→ 2027-08-26 失効）をリダイレクト期間とし、Cloudflare 側で自動更新 OFF にして自然失効させる。
移管完了後にお名前.com は退会する。

**期限**: ryokatsu.dev の有効期限は **2026-08-26**（RDAP で確認）。期限切れ間際の移管は
トラブりやすいので、**2026-08-12 頃までに移管を開始する**こと。逆算で Phase 2〜4 は
2026-08 第 1 週までに完了させる。

- 移管費用は `.dev` で $12〜13（原価）1 回のみ。ICANN ルールで有効期限が +1 年される
- 放置して 8/26 に失効させる案は却下：リダイレクト期間が数週間しかなく、
  7 年分のインデックス・被リンク・RSS 購読の evaluation 移転が間に合わない

**前提**: 取得・前回移管から 60 日以上経過（取得 2019-08、直近変更 2025-10 → OK）、
Cloudflare ゾーンが Active。

お名前.com 側:

1. Whois 情報公開代行を解除
2. ドメイン移管ロックを解除
3. Whois 登録メールアドレスが受信可能か確認
4. AuthCode（認証鍵）を取得

Cloudflare 側:

5. Domain Registration → Transfer Domains → `ryokatsu.dev` を選択
6. AuthCode を入力し支払い（`.dev` の 1 年更新料が発生し、既存の有効期限に +1 年される）
7. 承認メールのリンクを承認 → 通常 5 日以内、お名前.com 側で承認すれば即日完了

---

## 未解決 / 今後の検討事項

- `@astrojs/db` は deprecated 警告が出ている（「データベースクライアントを直接使え」）。
  将来的には Cloudflare D1 + Drizzle への移行を検討してもよい。
  そうすれば Turso への外部依存と、上記のハマりどころ 1・2 が両方消える
- `public/og/` は gitignore しているため、CI/Workers Builds では毎回 144 件を再生成する。
  ビルド時間が気になるようならキャッシュを検討
- ~~旧ドメインのリダイレクトは恒久的に維持する前提~~ → 方針変更（2026-07-29）:
  移管による +1 年（2027-08-26 まで）をリダイレクト期間とし、以後は失効させる。
  失効が近づいたら RSS・プロフィール等の露出 URL が infixer.net に
  なっているか最終確認すること
- Vercel プロジェクトは Phase 4 完了（ドメイン削除）後、任意のタイミングで削除してよい
