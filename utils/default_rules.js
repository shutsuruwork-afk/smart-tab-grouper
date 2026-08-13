/**
 * Smart Tab Grouper - Default Preset Rules & Extended Settings
 */

export const DEFAULT_CATEGORIES = [
  {
    id: "cat_dev",
    name: "💻 開発・プログラミング",
    color: "purple",
    enabled: true,
    domains: [
      "github.com",
      "github.io",
      "gitlab.com",
      "stackoverflow.com",
      "qiita.com",
      "zenn.dev",
      "developer.mozilla.org",
      "docs.python.org",
      "npmjs.com",
      "pypi.org",
      "crates.io",
      "codepen.io",
      "replit.com",
      "vscode.dev",
      "stackblitz.com",
      "localhost",
      "127.0.0.1"
    ],
    titleKeywords: [
      "GitHub",
      "Stack Overflow",
      "Qiita",
      "Zenn",
      "MDN Web Docs",
      "API Documentation",
      "ドキュメント"
    ]
  },
  {
    id: "cat_novel",
    name: "✍️ 小説執筆・リサーチ",
    color: "green",
    enabled: true,
    domains: [
      "syosetu.com",
      "ncode.syosetu.com",
      "kakuyomu.jp",
      "alphapolis.co.jp",
      "novelup.plus",
      "pixiv.net",
      "weblio.jp",
      "dictionary.goo.ne.jp",
      "kotobank.jp",
      "wikipedia.org",
      "wikisource.org",
      "chiebukuro.yahoo.co.jp",
      "notion.so",
      "docs.google.com",
      "evernote.com",
      "scrapbox.io"
    ],
    titleKeywords: [
      "小説家になろう",
      "カクヨム",
      "アルファポリス",
      "ノベルアップ",
      "類語辞典",
      "国語辞典",
      "大辞林",
      "プロット",
      "執筆",
      "原稿",
      "設定資料",
      "Wikipedia"
    ]
  },
  {
    id: "cat_ai_search",
    name: "🔍 検索・AIアシスタント",
    color: "cyan",
    enabled: true,
    domains: [
      "google.com",
      "google.co.jp",
      "bing.com",
      "duckduckgo.com",
      "search.yahoo.co.jp",
      "chatgpt.com",
      "chat.openai.com",
      "claude.ai",
      "perplexity.ai",
      "gemini.google.com",
      "copilot.microsoft.com",
      "poe.com"
    ],
    titleKeywords: [
      "Google 検索",
      "Bing 検索",
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Gemini"
    ]
  },
  {
    id: "cat_media",
    name: "🎬 動画・メディア",
    color: "red",
    enabled: true,
    domains: [
      "youtube.com",
      "youtu.be",
      "netflix.com",
      "twitch.tv",
      "bilibili.com",
      "nicovideo.jp",
      "primevideo.com",
      "tver.jp",
      "abema.tv",
      "spotify.com"
    ],
    titleKeywords: [
      "YouTube",
      "Twitch",
      "ニコニコ動画",
      "TVer",
      "Netflix"
    ]
  },
  {
    id: "cat_sns",
    name: "💬 SNS・対話",
    color: "pink",
    enabled: true,
    domains: [
      "x.com",
      "twitter.com",
      "discord.com",
      "slack.com",
      "reddit.com",
      "line.me",
      "instagram.com",
      "facebook.com",
      "bluesky.app",
      "misskey.io"
    ],
    titleKeywords: [
      "X (Twitter)",
      "Discord",
      "Slack",
      "Reddit"
    ]
  },
  {
    id: "cat_shopping",
    name: "🛒 ショッピング",
    color: "yellow",
    enabled: true,
    domains: [
      "amazon.co.jp",
      "amazon.com",
      "rakuten.co.jp",
      "mercari.com",
      "shopping.yahoo.co.jp",
      "yodobashi.com",
      "biccamera.com"
    ],
    titleKeywords: [
      "Amazon",
      "楽天市場",
      "メルカリ"
    ]
  },
  {
    id: "cat_news",
    name: "📰 ニュース・情報",
    color: "orange",
    enabled: true,
    domains: [
      "news.yahoo.co.jp",
      "nikkei.com",
      "hatena.ne.jp",
      "asahi.com",
      "yomiuri.co.jp",
      "itmedia.co.jp",
      "gigazine.net",
      "bbc.com",
      "cnn.com"
    ],
    titleKeywords: [
      "Yahoo!ニュース",
      "日経電子版",
      "はてなブックマーク",
      "ITmedia"
    ]
  }
];

export const DEFAULT_SETTINGS = {
  autoGroupOnUpdate: false,         // タブ更新時のリアルタイム自動グループ化
  contentClassificationEnabled: false, // 未登録サイトをページ内容から補助分類するか
  groupPinnedTabs: false,          // ピン留めタブをグループ化対象に含めるか
  groupByDomainAsFallback: false,  // 旧試作設定。未分類をドメイン別にはまとめない
  groupUnmatchedAsOthers: false,   // 未分類タブを一つの「Others」へまとめるか
  collapseInactiveGroups: false,   // 非アクティブなグループを折りたたむか
  strictDomainPriority: true,      // 登録済みドメイン判定を最優先（キーワード誤検知を完全防止）
  previewMode: false,              // プレビュー・ドライランモード（実環境を汚さず分類結果をテスト）
  exclusions: [                    // 除外ドメイン・キーワードリスト
    "chrome://",
    "chrome-extension://"
  ],
  theme: "dark"
};
