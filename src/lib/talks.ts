// 登壇資料と作ったもののリンク集
// 出典: https://scrapbox.io/ryokatsu/%E6%88%90%E6%9E%9C%E7%89%A9

export type TalkScope = 'external' | 'internal';

export type Talk = {
  title: string;
  url: string;
  /** 登壇日 (YYYY-MM-DD) */
  date: string;
  /** 登壇したイベント名 */
  event: string;
  scope: TalkScope;
};

export type Work = {
  title: string;
  url: string;
  description: string;
};

/** 社外・社内をまとめて時系列に並べた登壇資料 */
export const talks: Talk[] = [
  {
    title: 'ゆめみのアクセシビリティの現在地と今後',
    url: 'https://speakerdeck.com/ryokatsuse/yumeminoakusesihiriteinoxian-zai-di-tojin-hou',
    date: '2024-07-16',
    event: 'アクセシビリティLT会',
    scope: 'external',
  },
  {
    title: 'ChatGPTだけでESLintのプラグインを作ってみた powered by OpenAI',
    url: 'https://scrapbox.io/ryokatsu/ChatGPT%E3%81%A0%E3%81%91%E3%81%A7ESLint%E3%81%AE%E3%83%97%E3%83%A9%E3%82%B0%E3%82%A4%E3%83%B3%E3%82%92%E4%BD%9C%E3%81%A3%E3%81%A6%E3%81%BF%E3%81%9F%20powered%20by%20OpenAI',
    date: '2024-07-31',
    event: '[フロントエンド]月1LT会',
    scope: 'internal',
  },
  {
    title: 'shadcn/uiで考えるコンポーネント設計',
    url: 'https://speakerdeck.com/ryokatsuse/uitekao-erukonhonentoshe-ji',
    date: '2024-09-06',
    event: 'ゆめみ×LayerX×サイボウズ3社合同フロントエンドカンファレンス北海道2024後夜祭＠東京',
    scope: 'external',
  },
  {
    title: 'Cosenseではじめる雑な日報',
    url: 'https://scrapbox.io/ryokatsu/Cosense%E3%81%A7%E3%81%AF%E3%81%98%E3%82%81%E3%82%8B%E9%9B%91%E3%81%AA%E6%97%A5%E5%A0%B1',
    date: '2024-09-25',
    event: '社内LT会',
    scope: 'internal',
  },
  {
    title: 'remedaのpipeを使ってデータフローをリファクタリングした話',
    url: 'https://scrapbox.io/ryokatsu/remeda%E3%81%AEpipe%E3%82%92%E4%BD%BF%E3%81%A3%E3%81%A6%E3%83%87%E3%83%BC%E3%82%BF%E3%83%95%E3%83%AD%E3%83%BC%E3%82%92%E3%83%AA%E3%83%95%E3%82%A1%E3%82%AF%E3%82%BF%E3%83%AA%E3%83%B3%E3%82%B0%E3%81%97%E3%81%9F%E8%A9%B1',
    date: '2025-01-21',
    event: 'TechTrain x ゆめみ ここを意識してほしい！リファクタリング勉強会',
    scope: 'external',
  },
  {
    title: 'CSSのif構文は夢を見るか',
    url: 'https://scrapbox.io/ryokatsu/CSS%E3%81%AEif%E6%A7%8B%E6%96%87%E3%81%AF%E5%A4%A2%E3%82%92%E8%A6%8B%E3%82%8B%E3%81%8B',
    date: '2025-01-30',
    event: '[フロントエンド]月1LT会',
    scope: 'internal',
  },
  {
    title: '世界はモード切り替えで出来ている',
    url: 'https://scrapbox.io/ryokatsu/%E4%B8%96%E7%95%8C%E3%81%AF%E3%83%A2%E3%83%BC%E3%83%89%E5%88%87%E3%82%8A%E6%9B%BF%E3%81%88%E3%81%A7%E5%87%BA%E6%9D%A5%E3%81%A6%E3%81%84%E3%82%8B',
    date: '2025-05-14',
    event: '[フロントエンド]月1LT会',
    scope: 'internal',
  },
  {
    title: 'Obsidianで挫折した人がCosenseで日報を書き続けて1年が経った話',
    url: 'https://scrapbox.io/ryokatsu/Obsidian%E3%81%A7%E6%8C%AB%E6%8A%98%E3%81%97%E3%81%9F%E4%BA%BA%E3%81%8CCosense%E3%81%A7%E6%97%A5%E5%A0%B1%E3%82%92%E6%9B%B8%E3%81%8D%E7%B6%9A%E3%81%91%E3%81%A61%E5%B9%B4%E3%81%8C%E7%B5%8C%E3%81%A3%E3%81%9F%E8%A9%B1',
    date: '2025-06-24',
    event: '社内なんでもLT',
    scope: 'internal',
  },
  {
    title: '友達ではなく仲間とはなにか？ 〜『映像研には手を出すな！』から学ぶ仕事の取り組み方〜',
    url: 'https://speakerdeck.com/ryokatsuse/you-da-dehanakuzhong-jian-tohananika-ying-xiang-yan-nihashou-wochu-suna-karaxue-bushi-shi-noqu-rizu-mifang',
    date: '2025-08-10',
    event: '【劇場版】アニメから得た学びを発表会 2025',
    scope: 'external',
  },
  {
    title: 'アクセシビリティの自動テストはどのように行われているのか？ axe-coreの処理を巡る旅',
    url: 'https://axe-core-deep-dive.vercel.app/1',
    date: '2026-01-09',
    event: 'BuriKaigi 2026',
    scope: 'external',
  },
  {
    title: 'ARIA Notifyについて',
    url: 'https://www.figma.com/deck/9HQ1bTbDhWmEyL46TnLmZW/ARIA-Notify%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6?node-id=1-42',
    date: '2026-04-20',
    event: 'CA11Y #3 〜アクセシビリティのLTしようぜ〜',
    scope: 'external',
  },
  {
    title: 'inferと仲良くなる10分間',
    url: 'https://speakerdeck.com/ryokatsuse/infertozhong-liang-kunaru10fen-jian',
    date: '2026-05-24',
    event: 'TSKaigi 2026',
    scope: 'external',
  },
  {
    title: 'Web IDL って知ってる？',
    url: 'https://frontend-phpcon-do-lt-web-idl.vercel.app/1?clicks=0',
    date: '2026-06-05',
    event: 'フロントエンド・PHPカンファレンス北海道2026',
    scope: 'external',
  },
  {
    title: 'CSS Houdiniとはなんだったのか',
    url: 'https://browser-and-ui-lt-ten.vercel.app/1',
    date: '2026-07-21',
    event: 'Browser and UI #4 Any',
    scope: 'external',
  },
  {
    title: 'なぜ<image>タグではなく<img>タグなのか',
    url: 'https://html-only-presentation.vercel.app/index.html',
    date: '2026-08-07',
    event: 'HTML Night in Tokyo',
    scope: 'external',
  },
];

/** 作ったもの */
export const works: Work[] = [
  {
    title: 'emo-lan',
    url: 'https://github.com/ryokatsuse/emo-lan',
    description:
      '絵文字でコーディングしてHTMLにコンパイルしてくれる難解プログラミング言語',
  },
  {
    title: '技術スタックビューワー',
    url: 'https://js-stack-viewer.vercel.app/',
    description: 'Webサイトで使われている技術スタックを可視化するツール',
  },
  {
    title: 'dev-launcher',
    url: 'https://github.com/ryokatsuse/dev-launcher',
    description:
      '複数の開発環境をまとめて立ち上げられる、開発環境管理のためのCLI',
  },
];
