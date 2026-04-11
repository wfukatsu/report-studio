---
title: UI/UX 包括的レビュー — 帳票デザインスタジオ v2
type: refactor
status: completed
date: 2026-04-11
---

# UI/UX 包括的レビュー — 帳票デザインスタジオ v2

## Overview

帳票テンプレートデザインスタジオ v2 の全画面・全機能を対象に、体系的な UI/UX レビューを実施する。  
**ゴール:** 課題リストアップ → 改善プラン策定 → アクセシビリティ監査 → 日本語対応確認の 4 軸で評価し、優先度付きの改善バックログを生成する。

### 背景

直近の開発で多数の機能が追加・リファクタリングされた（PR #10/#11/#12）。  
個別機能レビューは実施済みだが、アプリ全体を横断した UI/UX 評価は行われていない。

| 直近追加機能 | UI への影響 |
|---|---|
| ScalarDB 連携 (Phase 1+1.5) | DbConnectionTab、CreateTableForm、GroupBindingSection |
| 要素システム刷新 (PR #10) | 22 種類の PropertiesPanel、Chart/Barcode 要素 |
| テンプレート更新 (PR #12) | RefreshCw ボタン、SVG 画像アップロード |

---

## レビュー範囲・カバレッジマトリクス

| 評価領域 | 対象コンポーネント | 評価軸 |
|---|---|---|
| **ツールバー** | Toolbar.tsx | 発見性・認知負荷・キーボード |
| **左サイドバー** | ElementPalette, LayersPanel | IA・発見性 |
| **右サイドバー** | PropertiesPanel（22 種類） | 一貫性・フィードバック |
| **キャンバス** | ReportCanvas, CanvasElement | インタラクション・ARIA |
| **データ系モーダル** | DataBindingModal, DbConnectionTab | ワークフロー・エラー表示 |
| **テンプレート管理** | TemplateManagerModal, SaveTemplateDialog | タスクフロー |
| **プレビュー** | PreviewModal | 出力忠実度フィードバック |
| **共通コンポーネント** | ConfirmDialog, Tooltip, Toast | パターン一貫性 |
| **日本語ローカライゼーション** | 全コンポーネント | 表記統一・敬語・文体 |
| **アクセシビリティ** | 全コンポーネント | WCAG 2.1 AA 準拠 |

---

## 評価フレームワーク

### 1. Nielsen の 10 ヒューリスティクス（日本語帳票エディタ向け適用）

| # | ヒューリスティクス | 帳票エディタでの着目点 |
|---|---|---|
| H1 | システム状態の可視性 | 保存状態・バインド状態・エラー状態の表示 |
| H2 | 実世界との対応 | 帳票用語（印鑑・元号・収入印紙）の適切な表現 |
| H3 | ユーザーコントロールと自由度 | Undo/Redo・キャンセル・確認ダイアログ |
| H4 | 一貫性と標準 | アイコン・ラベル・インタラクションパターンの統一 |
| H5 | エラーの予防 | 削除確認・未保存警告・バリデーション |
| H6 | 記憶ではなく認識 | ツールチップ・コンテキスト表示・型ヒント |
| H7 | 柔軟性と効率性 | キーボードショートカット・ドラッグ操作 |
| H8 | 美的・最小限デザイン | ツールバー肥大化・不要な視覚ノイズ |
| H9 | エラーからの回復 | エラーメッセージの平易さ・リカバリ手順 |
| H10 | ヘルプとドキュメント | ツールチップ・空状態メッセージ |

### 2. WCAG 2.1 AA 準拠チェック項目

- **1.1.1** 非テキストコンテンツの代替テキスト
- **1.3.1** 情報と関係性（構造的マークアップ）
- **2.1.1** キーボード操作可能
- **2.1.2** キーボードトラップなし
- **2.4.3** フォーカス順序
- **2.4.7** フォーカスの可視性
- **3.3.1** エラーの特定
- **4.1.2** 名前・役割・値

### 3. 日本語 UX 評価軸

- 表記統一（漢字・ひらがな・カタカナ・英字の使い分け）
- 敬体/常体の一貫性
- 帳票業務用語の正確性
- 英語混在箇所の洗い出し（placeholder・エラーメッセージ含む）

---

## 実施フェーズ

### Phase 1: 自動スキャン（Day 1）

**目的:** 機械的に検出可能な ARIA・コントラスト・構造的な問題を網羅的に抽出する。

#### タスク

- [ ] **aXe / Playwright 自動 ARIA スキャン** を主要画面に対して実行
  ```bash
  # 対象画面: メインエディタ、各モーダル（DataBinding, DbConnection, Templates）
  npx playwright test --grep "@a11y"
  ```
- [ ] **日本語ラベル自動検索** — 英語文字列が残っているコンポーネントを grep で抽出
  ```bash
  # src/components/ 以下で英語の label/placeholder/title を検索
  grep -rn 'placeholder="[A-Za-z]' src/components/
  grep -rn 'title="[A-Za-z]' src/components/
  grep -rn 'aria-label="[A-Za-z]' src/components/
  ```
- [ ] **Color Contrast チェック** — Tailwind カラーパレット使用箇所の AA 対応確認
- [ ] **Missing `alt` / `aria-label`** — icon-only ボタンの aria-label 抜け確認
  ```bash
  grep -rn '<button' src/components/toolbar/ | grep -v 'aria-label\|title'
  ```

#### 成果物

- 自動検出問題リスト（severity: critical/serious/moderate/minor）
- 英語混在箇所一覧（ファイル:行番号付き）

---

### Phase 2: ツールバー評価（Day 1-2）

**対象:** `src/components/toolbar/Toolbar.tsx`

#### チェックリスト

**認知負荷:**
- [ ] ボタン数カウント → グループごとに 6 個以下か？
- [ ] グループ間の視覚的セパレータは明確か？
- [ ] アイコンの意味は文脈なしで理解できるか？（使用例: `Shuffle` → バリアント管理）
- [ ] RefreshCw ボタン（ビルトインテンプレート更新）は文脈から用途が伝わるか？

**インタラクション:**
- [ ] ズームドロップダウン: キーボード Escape で閉じるか？
- [ ] ズームドロップダウン: 矢印キーで選択肢を移動できるか？
- [ ] 保存メニュー（ドロップダウン）: `aria-expanded` が正しく更新されるか？
- [ ] ツールチップはキーボードフォーカス時にも表示されるか？
- [ ] 無効状態（disabled）のボタンに理由を示す tooltip があるか？

**ショートカット表示:**
- [ ] Undo (⌘Z)、Redo (⌘⇧Z) が title に含まれているか？
- [ ] その他ショートカットの一覧モーダルが機能するか？

---

### Phase 3: キャンバス評価（Day 2-3）

**対象:** `src/components/canvas/ReportCanvas.tsx`, `CanvasElement.tsx`, `ContextMenu.tsx`

#### チェックリスト

**ARIA（要注意 — 既知 pending #051）:**
- [ ] `CanvasElement` に `role="button"` または `role="group"` が付与されているか？
- [ ] 選択中要素に `aria-selected` が反映されるか？
- [ ] 要素の `tabIndex` は roving tabindex パターンで実装されているか？
- [ ] スクリーンリーダーで要素名（型・位置）が読み上げられるか？

**キーボード操作:**
- [ ] Tab キーでキャンバス要素を順番に選択できるか？
- [ ] Enter/Space で要素を選択状態にできるか？
- [ ] 矢印キーで選択要素を 1mm 移動できるか（Shift+矢印で 5mm）？
- [ ] Delete/Backspace で選択要素を削除できるか？
- [ ] Escape でキャンバスの選択を解除できるか？

**コンテキストメニュー（pending #060 関連）:**
- [ ] 右クリックメニューに `role="menu"` / `role="menuitem"` があるか？
- [ ] メニュー表示時に自動フォーカスされるか？
- [ ] 矢印キーでメニュー項目を移動できるか？
- [ ] Escape でメニューが閉じるか？

**インタラクション品質:**
- [ ] マルチ選択（Shift+クリック / ドラッグ選択）の UX は直感的か？
- [ ] リサイズハンドルは 8 箇所すべて視覚的に明確か？
- [ ] グリッドスナップ ON/OFF のフィードバックは明確か？
- [ ] 要素追加時の初期配置は重なり防止されているか？

**SectionContainer（ヘッダー/フッター）:**
- [ ] セクション境界の視覚的区別は十分か？
- [ ] ヘッダー/フッター編集モードへの切り替えは明確か？

---

### Phase 4: サイドバー評価（Day 3-4）

#### 4-1. 要素パレット（ElementPalette）

- [ ] カテゴリ分類は帳票業務の文脈で適切か？（「帳票専用」と「汎用」の区別）
- [ ] 要素名称はユーザー（帳票担当者）が理解できる言葉か？
- [ ] 新しい要素（chart, barcode）がパレット内で発見しやすいか？
- [ ] ドラッグ＆ドロップのインジケータ（ドロップゾーン強調）は明確か？
- [ ] 検索機能はあるか（22 種類 → 増加傾向なので必要性を評価）？

#### 4-2. レイヤーパネル（LayersPanel）

- [ ] グループ名変更（#123）: 右クリック「リネーム」が機能しているか？
- [ ] レイヤー名の長さ制限（maxLength 設定 #122）はあるか？
- [ ] 複数選択状態はレイヤーパネルに反映されるか？
- [ ] ロック・非表示アイコンのツールチップは適切か？
- [ ] ネストが深い場合（グループ内グループ）のインデント表示は崩れないか？

#### 4-3. プロパティパネル（各要素タイプ）

**共通チェック（22 種類全要素）:**
- [ ] セクション見出しのグループ化は一貫しているか？
- [ ] 数値入力（位置・サイズ・フォントサイズ）の単位表示（mm）は統一されているか？
- [ ] カラーピッカーの実装は一貫しているか？
- [ ] 「詳細設定」的な項目は折りたたまれているか？

**新規要素の評価（PR #10）:**
- [ ] **chart 要素**: データバインディング設定の手順は直感的か？グラフタイプ選択 UI は適切か？
- [ ] **barcode 要素**: CODE39/JAN13 の入力制約エラー時のメッセージは日本語で平易か？
- [ ] **checkbox 要素**: labelPosition (left/right/top/bottom) の選択 UI はわかりやすいか？
- [ ] **eraSelect 要素**: 元号選択のレイアウト選択（column/row/grid-2col）の UI は適切か？

#### 4-4. スキーマパネル（SchemaPanel）

- [ ] SchemaGroup の master/detail の違いが UI で説明されているか？
- [ ] フィールドタイプ（string/number/date/boolean/array/image）のラベルは日本語か？

---

### Phase 5: データ連携 UI 評価（Day 4-5）

#### 5-1. DataBindingModal（4 タブ）

- [ ] タブ名（datasource/calculation/validation/dbconnection）は業務文脈で自明か？
- [ ] タブ間の遷移フローは論理的か（datasource → calculation → validation → dbconnection の順序）？
- [ ] 各タブの「空状態（Empty State）」メッセージは適切か？
- [ ] 計算式エディタ: 関数補完・シンタックスハイライトはあるか？
- [ ] バリデーションルール: ルール追加/削除のフローは明確か？

#### 5-2. DB 接続タブ（DbConnectionTab / GroupBindingSection）

これは最新追加機能のため重点評価。

- [ ] ネームスペース → テーブル → カラムの 3 段階選択フローは直感的か？
- [ ] 「DB に接続できません (503)」エラー時のメッセージ・リカバリ手順は適切か？
- [ ] 「テーブルが存在しません」（スタレ状態）の synthetic disabled オプション表示はわかりやすいか？
- [ ] 「このスキーマからテーブルを作成」ボタンは文脈から用途が伝わるか？
- [ ] CreateTableForm: テーブル作成後の「バインド完了」フィードバックは明確か？
- [ ] 409 Conflict（既存テーブル）のリカバリ UI「代わりに既存テーブルにバインドする」は明確か？
- [ ] フィールド ↔ DB カラムのマッピング UI（ドロップダウン）は直感的か？
- [ ] 「解除」ボタンの誤操作リスクはあるか（確認ダイアログの有無）？

#### 5-3. テンプレート管理

- [ ] TemplateManagerModal: テンプレート一覧の情報密度は適切か？
- [ ] SaveTemplateDialog: 保存完了フィードバックは明確か？
- [ ] TemplateSelectionModal: カテゴリ絞り込み機能は発見しやすいか？
- [ ] ビルトインテンプレート更新（RefreshCw）: 「現在の内容が失われる」警告のテキストは平易か？

---

### Phase 6: アクセシビリティ深堀り（Day 5-6）

**WCAG 2.1 AA 対応の確認と未対応箇所の特定。**

#### フォーカス管理

- [ ] モーダル開閉時のフォーカス管理（open → modal 内、close → トリガー要素）
- [ ] DataBindingModal: タブ切り替え時のフォーカス位置
- [ ] CreateTableForm（キャンセル時 → フォーカスがコールサイトに戻るか）

#### スクリーンリーダー対応

- [ ] 動的に変化するコンテンツ（保存状態・エラー）の `aria-live` 設定
- [ ] アイコンのみのボタン全数チェック（toolbar, layers panel, canvas controls）
- [ ] フォームのラベルとコントロールの関連付け（`for` / `aria-labelledby`）

#### カラーコントラスト

- [ ] 本文テキスト: 4.5:1 以上
- [ ] 大きいテキスト・UI コンポーネント: 3:1 以上
- [ ] muted テキスト（`text-muted-foreground`）のコントラスト確認
- [ ] 要素の選択状態（青枠）のコントラスト確認

#### フォーム・入力フィールド

- [ ] エラーメッセージは入力フィールドに `aria-describedby` で紐づいているか？
- [ ] 必須フィールドに `aria-required` があるか？
- [ ] CreateTableForm のカラム名入力で `aria-label` は適切か？

---

### Phase 7: 日本語 UX 評価（Day 6-7）

#### 用語・表記の一貫性チェック

**評価項目:**

- [ ] **カタカナ表記統一**: 「テーブル」vs「テーブル」、「キャンバス」vs「Canvas」
- [ ] **英字混在のルール確認**: `src` → ソース？source？ラベルと code の表記
- [ ] **敬体/常体の統一**: ボタンラベルは命令形（「保存」）、エラーは「〜してください」
- [ ] **略語・略称の扱い**: 「バリデーション」vs「検証」、「バリアント」vs「バリエーション」
- [ ] **UI 文言調査リスト:**

```bash
# 英語文字列の洗い出し
grep -rn 'placeholder="[A-Z]' src/
grep -rn '"[A-Z][a-z]* [A-Z][a-z]*"' src/components/  # "Data Source" 等
```

#### 帳票業務用語の正確性

- [ ] 「印鑑」「押印」「検印」の使い分けは適切か？
- [ ] 「元号」「和暦」の表示ラベルは一般的な帳票担当者が理解できるか？
- [ ] 「繰り返しバンド」「繰り返しリスト」の区別は UI で明確か？
- [ ] 「収入印紙」欄のラベルは正確か？

#### エラーメッセージの平易さ

技術的なエラーメッセージが残っていないか確認:

| NG 例 | OK 例 |
|---|---|
| "JSON parse error" | "データの形式が正しくありません" |
| "Invalid identifier: '9abc'" | "列名は英字・数字・アンダースコアのみ使用できます" |
| "ScalarDb unreachable" | "ScalarDB に接続できません。接続設定を確認してください" |
| "Table already exists: app.users" | "テーブル「app.users」は既に存在します" |

- [ ] DB 接続エラー全 10 種類の日本語メッセージを確認
- [ ] バリデーションルール違反メッセージの平易さ確認
- [ ] Chart/Barcode 要素の型エラーメッセージを確認

---

### Phase 8: 統合・優先度付け（Day 7-8）

#### 問題分類フレームワーク

| 優先度 | 基準 | 対応期限 |
|---|---|---|
| **P1 Critical** | 機能が使えない・データロス・WCAG 違反 | 即時（次スプリント） |
| **P2 High** | 主要フローの摩擦・混乱・日本語 UX 問題 | 近日中（1-2 スプリント） |
| **P3 Medium** | 一貫性・改善余地・アクセシビリティ向上 | 計画的に（3-4 スプリント） |
| **P4 Low** | 細部の磨き・Nice to have | バックログ管理 |

#### 成果物

1. **UI/UX 問題リスト** (`todos/` に todo ファイル追加、カテゴリ: `ui-bugs`, `accessibility`)
   - 各問題にスクリーンショット・再現手順・ヒューリスティクス番号を付記
2. **設計パターンギャップ一覧** — コンポーネント間で実装が統一されていない箇所
3. **アクセシビリティ対応マトリクス** — WCAG 2.1 AA 項目ごとの対応状況（✅/⚠️/❌）
4. **日本語ローカライゼーション修正リスト** — ファイル:行番号付き
5. **改善ロードマップ** — P1/P2/P3 ごとの改善施策と実装コスト見積もり

---

## System-Wide Impact

### Interaction Graph

UI/UX 改善は以下のコンポーネント間に波及する:

```
Toolbar (ボタン追加/変更)
  └─ Zustand store (状態反映)
       └─ キャンバス (再レンダ)

サイドバー (プロパティ変更)
  └─ Zustand store (element 更新)
       └─ useAutoSave (2秒後に保存)
            └─ PUT /api/v2/templates/{id}

アクセシビリティ改善 (ARIA 追加)
  └─ DOM 構造変更 → Vitest RTL テスト更新が必要
```

### State Lifecycle Risks

- **ARIA 改善の副作用**: `role`/`tabIndex` 追加で既存 RTL テスト（`container.firstChild` などのパス指定）が壊れる可能性
- **ラベル変更の連鎖**: `aria-label` を日本語統一した場合、テスト内の `getByRole('button', { name: /Data Source/i })` などの英語マッチが失敗
- **ConfirmDialog 追加**: 削除フローに confirm を追加した場合、自動テストで window.confirm のモックが必要

### API Surface Parity

日本語エラーメッセージへの修正が必要な箇所:

| 層 | ファイル | 現状 |
|---|---|---|
| Java バックエンド | V2ScalarDbTableController.java | 英語エラー body（設計通り） |
| フロントエンド | CreateTableForm.tsx | `errorCodeToMessage()` で日本語変換済み |
| フロントエンド | DbConnectionTab.tsx | `formatFetchError()` で一部日本語 |
| フロントエンド | classifyCreateTableError.ts | コード→日本語マッピング済み |

*バックエンドは英語 body のまま維持（API コントラクト）、フロントエンドで日本語化する設計は正しい。*

---

## Acceptance Criteria

### 機能要件

- [ ] Phase 1〜8 の全チェックリストを 1 名以上が実施し、結果を記録した
- [ ] 発見された問題が severity 別に分類され、todos/ に追加された
- [ ] P1 問題はすべて即時対応または代替案が提案された
- [ ] 日本語化未対応箇所がすべてリスト化された

### 非機能要件

- [ ] アクセシビリティ対応マトリクスが生成された（WCAG 2.1 AA 全 13 項目）
- [ ] 既存テスト（1607 件）がすべてパスし続ける
- [ ] 改善施策の実装コスト見積もりが P1/P2/P3 ごとに提示された

### 品質ゲート

- [ ] 各 Phase の担当者・完了日が記録された
- [ ] スクリーンショット証跡が各問題に添付された
- [ ] 改善後の再テスト計画が定義された

---

## 依存関係・リスク

| リスク | 影響 | 緩和策 |
|---|---|---|
| ARIA 追加で RTL テスト多数壊れる | 高 | テスト修正コストを見積もり、スプリント計画に組み込む |
| 日本語ラベル変更でテストが壊れる | 中 | `getByText` → `getByTestId` パターンへの移行を検討 |
| 既存 todo との重複 | 低 | Phase 1 前に todos/ の pending UI 関連を確認・整理 |
| 要素 PropertiesPanel 22 種類の評価工数 | 高 | 共通 UI 部品（PropSection/PropRow）レベルで評価し、個別は差分のみ |

---

## 既存 UI/UX 改善のリファレンス

過去に解決済みの問題・パターンは以下を参照:

- `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md` — ARIA・キーボードパターン集
- `docs/solutions/ui-bugs/canvas-editor-snap-zoom-pointer-fixes.md` — キャンバスインタラクション
- `docs/solutions/ui-bugs/sidebar-panel-ux-master-hf-localization.md` — パネル UX・日本語化

### 既知の pending UI todo（重複確認用）

レビュー前に以下の pending todo を確認し、新規発見と区別すること:

| Todo # | 内容 |
|---|---|
| #051 | Canvas elements ARIA + keyboard |
| #060 | Dropdown keyboard accessibility |
| #122 | Rename input maxLength |
| #123 | Group rename menu no-op |

---

## 実施スケジュール（目安）

| Day | Phase | 担当 |
|---|---|---|
| 1 | Phase 1: 自動スキャン + ツールバー評価 | — |
| 2-3 | Phase 2-3: キャンバス評価 | — |
| 3-4 | Phase 4: サイドバー評価 | — |
| 4-5 | Phase 5: データ連携 UI 評価 | — |
| 5-6 | Phase 6: アクセシビリティ深堀り | — |
| 6-7 | Phase 7: 日本語 UX 評価 | — |
| 7-8 | Phase 8: 統合・優先度付け | — |

**総工数目安:** 8 日（1 名）または 4 日（2 名並列）

---

## Sources & References

### 内部リファレンス

- アクセシビリティ実装パターン: `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md`
- キャンバスインタラクション: `docs/solutions/ui-bugs/canvas-editor-snap-zoom-pointer-fixes.md`
- パネル UX: `docs/solutions/ui-bugs/sidebar-panel-ux-master-hf-localization.md`
- ツールバー実装: `src/components/toolbar/Toolbar.tsx`
- 要素一覧: `src/elements/` (22 種類)
- DB 連携 UI: `src/components/modals/DbConnectionTab.tsx`, `dbConnection/`

### 外部リファレンス

- WCAG 2.1 AA: https://www.w3.org/TR/WCAG21/
- Nielsen 10 Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- ARIA Authoring Practices Guide: https://www.w3.org/WAI/ARIA/apg/
- 日本語 UI デザインガイドライン: JIS X 8341-3:2016（ウェブアクセシビリティ）
