-- ローカル開発用のフィードのテストデータ（pnpm seed:diary で入れる）
-- 本番には入れないこと。何度流しても同じ状態になるよう、固定 ID で上書きする

INSERT OR REPLACE INTO diary_posts (id, body, images, links, published_at, created_at, updated_at) VALUES
  ('seed000001', '今日は短い投稿のテスト。', '[]', '[]',
   '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z', '2026-11-01T01:00:00Z'),
  ('seed000002', '改行を含む投稿。

段落を分けて書いてみる。
URL を本文に書くとリンクになる https://example.com/inline', '[]', '[]',
   '2026-11-03T12:30:00Z', '2026-11-03T12:30:00Z', '2026-11-03T12:30:00Z'),
  ('seed000003', '画像付きの投稿。', '[{"key":"diary/seed/sample.jpg","width":1012,"height":506,"alt":"テスト用のサンプル画像"}]', '[]',
   '2026-11-05T09:15:00Z', '2026-11-05T09:15:00Z', '2026-11-05T09:15:00Z'),
  ('seed000004', 'リンクカード付きの投稿。
https://astro.build/', '[]', '["https://astro.build/"]',
   '2026-11-08T22:00:00Z', '2026-11-08T22:00:00Z', '2026-11-08T22:00:00Z'),
  ('seed000005', 'とても長い投稿。サイドバーでは 4 行で切れて、RSS のタイトルは 40 文字で切れるはず。あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん。あいうえおかきくけこさしすせそたちつてとなにぬねの。', '[]', '[]',
   '2026-11-12T03:45:00Z', '2026-11-12T03:45:00Z', '2026-11-12T03:45:00Z'),
  ('seed000006', '', '[{"key":"diary/seed/sample.jpg","width":1012,"height":506}]', '[]',
   '2026-11-15T10:00:00Z', '2026-11-15T10:00:00Z', '2026-11-15T10:00:00Z');

-- 1 ページは 20 件なので、「もっと前の投稿」が出るように 10 月分の投稿を 19 件足して計 25 件にする
INSERT OR REPLACE INTO diary_posts (id, body, images, links, published_at, created_at, updated_at)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 19)
SELECT
  printf('seed1%05d', i),
  printf('10 月のテスト投稿 その %d', i),
  '[]',
  '[]',
  printf('2026-10-%02dT12:00:00Z', i),
  printf('2026-10-%02dT12:00:00Z', i),
  printf('2026-10-%02dT12:00:00Z', i)
FROM n;

-- 閲覧時に外部へ取りに行かなくて済むよう、リンクカードの OGP も入れておく
INSERT OR REPLACE INTO link_previews (url, title, description, image, site_name, favicon_url, fetched_at) VALUES
  ('https://astro.build/', 'Astro', 'The web framework for content-driven websites.', NULL, 'astro.build', NULL, '2026-11-08T22:00:00Z');
