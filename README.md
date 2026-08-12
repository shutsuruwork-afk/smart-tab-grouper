# 🗂️ Smart Tab Grouper - Chrome Extension

開いているブラウザのタブを、ドメイン最優先判定・タイトルキーワード・カスタムルールに基づき、分野ごとに自動・手動で色付きタブグループに整理する Chrome / Edge 拡張機能 (Manifest V3) です。

---

## ✨ 主な特徴

- 💻 **開発・プログラミングプリセット (紫)**: GitHub, Stack Overflow, Qiita, Zenn, MDN, Python Docs, npm, Localhost など
- ✍️ **小説執筆・リサーチプリセット (緑)**: 小説家になろう (`syosetu.com`), カクヨム (`kakuyomu.jp`), アルファポリス, Weblio類語・国語辞典, Wikipedia, Notion など
- 🔍 **検索・AIアシスタント (シアン)**: ChatGPT, Claude, Perplexity, Gemini, Google 検索 など
- 🎯 **登録済みドメイン最優先判定**: タイトルのキーワード誤検知を防止し、指定ドメインを最優先で正しく分類。
- 🧪 **テスト用プレビューモード (ドライラン)**: 実環境のタブを変更せずに、事前分類シミュレーション結果を確認可能。
- ↩️ **ワンクリック Undo (元に戻す)**: 誤って整理してしまっても、1クリックで元のタブ配置へ復元。
- 🚫 **誤検知防止・除外リスト (ブラックリスト)**: 特定のサイトや社内ドメインを自動整理から除外設定可能。
- 📥 **設定のインポート / エクスポート**: カスタム分類ルールを JSON ファイルでバックアップ・共有。

---

## 📦 インストール方法 (Chrome / Edge)

1. リポジトリをクローンまたは ZIP でダウンロードします。
2. Chrome で `chrome://extensions/` を開きます。
3. 右上の **「デベロッパーモード」** を ON にします。
4. **「パッケージ化されていない拡張機能を読み込む」** をクリックし、このプロジェクトのルートフォルダを選択します。

---

## 🛠️ 技術構成

- **Manifest**: Chrome Extension Manifest V3
- **Language**: Vanilla JavaScript (ES Modules)
- **UI & Styling**: HTML5, Modern CSS3 (Glassmorphism & Dark Theme)
- **Permissions**: `tabs`, `tabGroups`, `storage`, `unlimitedStorage`

---

## 📄 ライセンス

MIT License
