-- 日記の投稿
CREATE TABLE diary_posts (
  id           TEXT PRIMARY KEY,
  body         TEXT NOT NULL DEFAULT '',   -- プレーンテキスト。文字数制限なし
  images       TEXT NOT NULL DEFAULT '[]', -- JSON: [{ key, width, height }]
  links        TEXT NOT NULL DEFAULT '[]', -- JSON: リンクカードにする URL の配列
  published_at TEXT NOT NULL,              -- ISO 8601 (UTC)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX diary_posts_published_at ON diary_posts (published_at DESC);

-- リンクカード用 OGP のキャッシュ。閲覧時に外部サイトへ取りに行かないために使う
CREATE TABLE link_previews (
  url         TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image       TEXT,
  site_name   TEXT NOT NULL,
  favicon_url TEXT,
  fetched_at  TEXT NOT NULL
);
