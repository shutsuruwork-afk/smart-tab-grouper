# 🗂️ Smart Tab Grouper - Chrome Extension

Version 1.0.0

開いているブラウザのタブを、登録ドメインとタイトルキーワードに基づいて色付きタブグループへ整理する Chrome 拡張機能（Manifest V3）のプロトタイプです。

分類ロジックは検証中です。現時点では、誤操作を避ける確認フローと設定画面のUI / UXを優先して実装しています。

---

## 現在確認できる機能

- 拡張機能アイコンを押した直後の「本当に整理しますか？」確認
- 安価に算出した対象件数の予告と、整理後のグループ／タブ一覧
- ポップアップを閉じても30分間有効な `Ctrl + Z` / `⌘ + Z` Undo
- 完了画面から1操作で行う誤分類の移動とドメイン登録
- 分類グループごとの最優先ドメイン編集、完全重複の検出、親子ドメインの最長一致
- Chromeタブグループ色の設定
- 未分類タブを任意で一つの `Others` グループへまとめる設定（既定はオフ）
- Rose / Blue / Green / Violet / Neutral のUIテーマ
- 基準色1色からライト／ダーク両方を生成するカスタムテーマ
- 本番タブを変更せずにポップアップと設定画面を確認できるUI Lab
- 選択した一つのタブグループだけを、確認後に安全に再構成する操作
- 既存グループの名前・色・折りたたみ状態をまとめて編集し、Ctrl+Z / ⌘Zで戻す操作

製品として守る判断基準は [UI / UX 方針](docs/UI_UX_POLICY.md)、プロトタイプの現在地と未検証事項は [実装状況](docs/IMPLEMENTATION_STATUS.md) を参照してください。

---

## 📦 インストール方法 (Chrome / Edge)

1. リポジトリをクローンまたは ZIP でダウンロードします。
2. Chrome で `chrome://extensions/` を開きます。
3. 右上の **「デベロッパーモード」** を ON にします。
4. **「パッケージ化されていない拡張機能を読み込む」** をクリックし、このプロジェクトのルートフォルダを選択します。

---

## UIを最短で確認する

プロジェクト直下の `open-ui-preview.cmd` をダブルクリックします。詳細は [UIテスト環境](preview/README.md) を参照してください。

## 技術構成

- **Manifest**: Chrome Extension Manifest V3
- **Language**: Vanilla JavaScript
- **UI & Styling**: HTML5 / CSS custom properties / system light-dark themes
- **Permissions**: `tabs`, `tabGroups`, `storage`, `unlimitedStorage`

---

## 📄 ライセンス

MIT License
