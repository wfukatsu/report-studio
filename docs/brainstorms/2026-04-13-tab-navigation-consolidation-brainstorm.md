---
date: 2026-04-13
topic: tab-navigation-consolidation
---

# タブナビゲーション統合

## What We're Building

トップナビゲーション型の3タブ構成に画面を統合する。現在デザイン画面・複数モーダル・別ページ(`/data-browser`)に分散しているUIを、「デザイン」「データ管理」「テンプレート管理」の3タブに集約する。

## Why This Approach

- **トップナビゲーション型**を採用：直感的でよく使われるパターン。各ドメインがフル画面を使えるため、情報密度が高いデータ管理・テンプレート管理でも使いやすい。
- モーダルをフルページUIに昇格させることで、操作の文脈が明確になり、深い作業がしやすくなる。

## Key Decisions

- **状態保持**: タブ切り替え時もデザインタブの編集状態（選択要素・ズーム・ページ等）を維持する。`display: none` による非破壊マウントで実現。
- **ルーティング廃止**: `/data-browser` ルートは「データ管理」タブに統合し、独立ルートを廃止。
- **モーダル→ページ化**: テンプレート管理に関わる各モーダル（TemplateManagerModal・TemplateSelectionModal・SaveTemplateDialog・VariantsModal）はタブ内のページUIとして再実装。

## Tab Contents

### デザインタブ
現状そのまま維持：
- Toolbar
- ReportCanvas（キャンバス本体）
- 左サイドバー：ElementPalette・LayersPanel・PagePanel
- 右サイドバー：PropertiesPanel・PageSettingsPanel・VersionHistoryPanel

### データ管理タブ
以下をタブ内に統合：
- SchemaPanel（テーブル・カラム定義）
- DataSourcePanel（データソース設定）
- CalculationTab（計算フィールド）
- ValidationTab（バリデーション設定）
- DataBrowserPage（実データ閲覧）
- ResponsesPanel（回答フィールド）

### テンプレート管理タブ
以下のモーダルをページUIに昇格：
- TemplateManagerModal → テンプレート一覧・削除
- TemplateSelectionModal → テンプレートギャラリー
- SaveTemplateDialog → テンプレート保存フォーム
- VariantsModal → バリアント管理

## Open Questions

- データ管理タブ内のサブナビゲーション（SchemaPanel / DataBrowserPage など複数機能）をどう分割するか（左サイドツリー or 横サブタブ）
- テンプレート管理タブでの「保存」操作はデザインタブから呼び出す形を残すか、タブ内でのみ操作させるか

## Next Steps

→ `/compound-engineering:workflows:plan` で実装計画を作成
