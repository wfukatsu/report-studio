---
title: "feat: サイドバー整理・DataBindingモーダル・テンプレート選択モーダル"
type: feat
status: completed
date: 2026-04-06
origin: docs/brainstorms/2026-04-06-sidebar-cleanup-databinding-templates-brainstorm.md
---

# feat: サイドバー整理・DataBindingモーダル・テンプレート選択モーダル

## Overview

左サイドバーの「テンプレート」「データ」タブは性格が異なるため（レポート全体設定 vs オブジェクト操作）より適切なUI位置へ移動する。データはツールバーボタン→モーダルへ、テンプレートは新規作成時の選択ダイアログへ。合わせてV1のDataBinding機能（式評価・バリデーション・計算フィールド）をモーダルに統合する。

---

## Problem Statement

- 左サイドバーの「テンプレート」「データ」は、要素操作（要素・レイヤー・ページ）と性格が根本的に異なる「設定」操作であり、同列に並ぶことで認知負荷が高い
- テンプレートは**作成時**に選ぶものであり、常時サイドバーに表示する必要がない
- データ設定・式評価・バリデーションはV1に実装済みだがV2に未統合

---

## Proposed Solution

1. **左サイドバー**: 要素・レイヤー・ページのみ残し、テンプレート・データを削除
2. **テンプレート**: 新規作成時に `TemplateSelectionModal` で選択 / 右サイドバー「ページ」タブから変更
3. **データ**: ツールバーの「データ」ボタン → `DataBindingModal`（3タブ: データソース・式/計算・バリデーション）
4. **右サイドバー**: 「ページ」タブを追加（用紙サイズ・向き・余白・テンプレート変更）
5. **表示条件 (visibilityRule)**: 既にPropertiesPanelに実装済み — 追加作業不要

---

## Technical Approach

### Architecture

```
App.tsx
├── Toolbar
│   ├── [データ] button → DataBindingModal (new)
│   └── [新規作成] button → TemplateSelectionModal (new, was: confirm + newReport())
├── Left Sidebar (LeftTab: 'elements' | 'layers' | 'pages')
│   └── ← 'templates' と 'data' を削除
└── Right Sidebar (RightTab: 'properties' | 'versions' | 'page') ← 'page' を追加
    ├── PropertiesPanel (unchanged)
    ├── VersionHistoryPanel (unchanged)
    └── PageSettingsPanel (new — extracted from PropertiesPanel:141-233)

Components (new):
├── src/components/modals/TemplateSelectionModal.tsx
│   └── 共通化: 新規作成 / ページ設定の「テンプレート変更」両方から呼ばれる
├── src/components/modals/DataBindingModal.tsx
│   ├── Tab 1: DataSourceTab (= DataSourcePanel + BindingPanel を移植)
│   ├── Tab 2: CalculationTab (CalculationRule editor + JEXL preview)
│   └── Tab 3: ValidationTab (ValidationRule editor)
└── src/components/sidebar/PageSettingsPanel.tsx (extracted from PropertiesPanel)

Store changes:
└── src/store/types.ts + rulesSlice.ts
    ├── ValidationRule 型定義 (現在 unknown[])
    ├── addValidationRule / updateValidationRule / removeValidationRule アクション追加
    └── Zod schema (reportDefinition.ts:166) を typed ValidationRuleSchema に更新

New package:
└── @pawel-up/jexl  (client-side JEXL evaluation for modal preview)
```

### Key Design Decisions (see brainstorm)

- **DataBindingモーダルへの変更は即時適用**（ドラフト状態なし）。ルール変更は undo 履歴に積まない（`pushHistory` 不要）
- **テンプレート変更時**: 全要素・ページ構成をクリア、確認ダイアログを表示（`historyIndex > 0` の場合）
- **バリデーションはエクスポート時実行**（リアルタイム不要）。error severity の違反でエクスポートをブロック
- **ページ設定はレポート全体**（ページごとではなく）— `definition.pageSetup` への書き込み
- **JEXL評価**: モーダル内プレビューは `@pawel-up/jexl` クライアントサイド。本番計算は既存 `useEvaluator` (backend API)が継続担当

---

## Implementation Phases

### Phase 1: サイドバー UI 整理

**目標**: 左サイドバーのタブ削減 + 右サイドバーにページ設定タブ追加

#### タスク

- [x] `App.tsx` の `LeftTab` 型から `'templates'` と `'data'` を削除
- [x] `LEFT_TABS` 配列から該当エントリを削除（残: 要素・レイヤー・ページ）
- [x] `App.tsx` の左サイドバー render ブロックから `TemplateGallery` / `DataSourcePanel` / `BindingPanel` の参照を削除
- [x] `App.tsx` の `RightTab` 型に `'page'` を追加
- [x] `RIGHT_TABS` 配列に `{ id: 'page', label: 'ページ' }` を追加
- [x] `src/components/sidebar/PageSettingsPanel.tsx` を新規作成
  - `PropertiesPanel.tsx:141-233` のページ設定ブロックを抽出・移植
  - 用紙サイズ・向き・余白の入力フォーム
  - 「テンプレートを変更...」ボタン（Phase 2 で接続）
- [x] `App.tsx` の右サイドバー render に `page` タブ → `<PageSettingsPanel />` を追加
- [x] `PropertiesPanel.tsx` からページ設定ブロック（lines 141-233）を削除し `<PageSettingsPanel />` への言及コメントに置換

**成功基準**:
- [x] 左サイドバーにテンプレート・データタブが表示されない
- [x] 右サイドバーに「ページ」タブが表示され、用紙サイズ・向き・余白が編集できる
- [x] 既存テストが通る（`PropertiesPanel.test.tsx`）

---

### Phase 2: TemplateSelectionModal

**目標**: 新規作成時のテンプレート選択モーダル実装 + ページ設定からの再利用

#### タスク

- [x] `src/components/modals/TemplateSelectionModal.tsx` を新規作成
  - Props: `open: boolean`, `onClose: () => void`, `onSelect: (definition: ReportDefinition) => void`
  - 組み込みテンプレートのグリッド表示（サムネイル + 名称）
  - 「空白」オプション（一番左、`createDefaultDefinition()` を返す）
  - バックエンド接続時はバックエンドテンプレート一覧も表示（`listReports()` 使用）
  - テンプレート選択 → 「作成」ボタンで `onSelect` コールバック実行
  - キャンセル対応
- [x] `TemplateGallery.tsx` の `applyTemplate` 関数をモジュール関数として `src/lib/templateUtils.ts` に抽出
  - `applyTemplate(template: Template): ReportDefinition` — migrate + return定義
- [x] Phase 1 でテンプレートタブ削除後、`TemplateGallery.tsx` コンポーネントは未使用になる → `src/lib/templateUtils.ts` 抽出完了後にファイルを削除
- [x] `Toolbar.tsx` の `handleNew` を修正
  - `confirm()` → `TemplateSelectionModal` を表示に変更
  - `historyIndex > 0` の場合に上書き確認（既存ロジックを維持）
  - 選択確定時に `loadReport(definition)` を実行（`newReport()` を置き換え）
- [x] `PageSettingsPanel.tsx` の「テンプレートを変更...」ボタンを接続
  - `TemplateSelectionModal` を開く
  - `historyIndex > 0` の場合に上書き確認ダイアログ
  - 確定時に `loadReport(definition)` を実行

#### 仕様の補足（SpecFlow分析より）

- 「空白」を選択すると全ページ・全要素をクリアした `createDefaultDefinition()` に置き換わる
- バックエンドテンプレート一覧ロード失敗時はフォールバックでビルトインのみ表示（エラーメッセージ表示）

**成功基準**:
- [x] 新規作成ボタンを押すとテンプレート選択モーダルが開く
- [x] 空白・各テンプレートを選択して作成できる
- [x] 編集中（historyIndex > 0）は上書き確認ダイアログが表示される
- [x] ページ設定の「テンプレートを変更...」でも同モーダルが使用できる

---

### Phase 3: DataBindingModal — 基盤 + データソースタブ

**目標**: DataBindingModal の枠組み + 既存パネルの移植

#### タスク

- [x] `src/components/modals/DataBindingModal.tsx` を新規作成
  - Props: `open: boolean`, `onClose: () => void`
  - 大型モーダル（画面の 70-80% 幅）、固定中央、ドラッグ不可
  - 3タブ: データソース・式/計算・バリデーション
  - タブ切替は即時（中間状態なし）
- [x] `Toolbar.tsx` に「データ」ボタンを追加
  - undo/redo の次のグループに配置
  - アイコン: Lucide `Database` など適切なアイコン
  - クリックで `DataBindingModal` を開く（Toolbar内 `useState` で管理）
- [x] Tab 1「データソース」の実装
  - `DataSourcePanel.tsx` を既存コンポーネントとしてそのまま再利用（コピー不可）
  - `BindingPanel.tsx` を既存コンポーネントとしてそのまま再利用（プレビューデータ編集）
  - モーダル内でも同じ store バインディング（`definition.dataSources[0]`, `testData`）

**成功基準**:
- [x] ツールバーに「データ」ボタンが表示され、クリックでモーダルが開く
- [x] 「データソース」タブでデータソースの編集とプレビューデータの編集ができる
- [x] 既存の DataSourcePanel / BindingPanel のテストが引き続き通る（またはリファクタ済み）

---

### Phase 4: DataBindingModal — 式・計算タブ

**目標**: CalculationRule エディタ + クライアントサイドJEXLプレビュー

#### タスク

- [x] `@pawel-up/jexl` をインストール (`npm install @pawel-up/jexl`)
- [x] `src/lib/jexlEngine.ts` を新規作成
  - `@pawel-up/jexl` の Jexl インスタンスをシングルトンとして生成
  - カスタム関数を登録:
    - `sum(items, field)` — コレクションのフィールド値を合計
    - `count(items)` — コレクションの要素数
    - `round(value, scale)` — 指定桁数で四捨五入
  - `evaluateWithTimeout(expr: string, ctx: Record<string, unknown>, ms = 500): Promise<unknown>` を export
    - `Promise.race` で 500ms タイムアウト実装
- [x] Tab 2「式・計算」の実装
  - `definition.calculationRules[]` の一覧表示（key・label・expression・resultType）
  - ルール追加・編集・削除（既存 `addCalculationRule / updateCalculationRule / removeCalculationRule` アクション使用）
  - 式エディタ: テキスト入力 + 「テスト実行」ボタン
    - 「テスト実行」: `jexlEngine.evaluateWithTimeout(expr, testData)` でクライアントサイド評価
    - 結果をインライン表示（成功: 値、エラー: エラーメッセージ）
  - `resultType` セレクタ（number / string / boolean）
  - `roundingPolicy` セレクタ（none / floor / ceil / round）

#### 仕様の補足（SpecFlow分析より）

- モーダル内の変更は即時ストアに反映。ルール変更は undo 履歴に積まない
- 式の入力中（typing）は評価しない。「テスト実行」ボタン押下時のみ評価
- バックエンド未接続でも計算ルールは定義可能（プレビューはクライアントサイドで動作）

**成功基準**:
- [x] 式・計算タブで CalculationRule の追加・編集・削除ができる
- [x] 「テスト実行」で testData を使ったクライアントサイド式評価が動作する
- [x] `sum(items, 'amount')` 等のカスタム関数が動作する
- [x] 500ms タイムアウトでタイムアウトエラーが表示される

---

### Phase 5: DataBindingModal — バリデーションタブ + エクスポート統合

**目標**: ValidationRule 型定義 + バリデーションタブ + エクスポート前検証

#### タスク

- [x] `src/types/index.ts` に `ValidationRule` 型を追加
  ```typescript
  export interface ValidationRule {
    id: string
    condition: string      // JEXL式（trueのとき違反）
    message: string
    severity: 'error' | 'warning'
  }
  ```
  既存の `type ValidationRule = Record<string, unknown>` を置き換え

- [x] `src/lib/schemas/reportDefinition.ts` の `validationRules` スキーマを更新
  - line 166: `z.array(z.record(...))` → `z.array(ValidationRuleSchema).max(200)`
  - `ValidationRuleSchema` を `CalculationRuleSchema`（lines 123-135）に倣って定義

- [x] `src/store/types.ts` に ValidationRule CRUD アクションを追加
  - `addValidationRule: (rule: ValidationRule) => void`
  - `updateValidationRule: (id: string, patch: Partial<ValidationRule>) => void`
  - `removeValidationRule: (id: string) => void`

- [x] `src/store/rulesSlice.ts`（または対応スライス）に上記アクション実装

- [x] Tab 3「バリデーション」の実装
  - `definition.validationRules[]` の一覧表示
  - ルール追加・編集・削除
  - 条件式入力（JEXL式テキスト入力）+ 「テスト実行」ボタン（クライアントサイド評価）
  - メッセージ入力
  - severity セレクタ（エラー / 警告）

- [x] エクスポート前バリデーション実装（`src/lib/exportUtils.ts` または `Toolbar.tsx`）
  - エクスポート実行前に `definition.validationRules` を全評価
  - `error` severity の違反がある場合: エクスポートをブロック + バイオレーション一覧モーダルを表示
  - `warning` severity のみ: 警告表示後にエクスポート継続可能
  - バリデーション実行に `jexlEngine.evaluateWithTimeout` を使用

#### 仕様の補足（SpecFlow分析より）

- ValidationRule の最大数: 200（既存 Zod スキーマの `.max(200)` を維持）
- 複数ルールは全て評価（最初の違反でショートサーキットしない）
- `ValidationViolation` 型は既存（`src/store/types.ts:59-63`）をそのまま使用

**成功基準**:
- [x] バリデーションタブで ValidationRule の追加・編集・削除ができる
- [x] error severity のルール違反があるとエクスポートがブロックされる
- [x] warning severity のみの場合は警告表示後にエクスポートできる
- [x] 既存エクスポートテストが通る

---

## Acceptance Criteria

### 機能要件

- [x] 左サイドバーにテンプレート・データタブが存在しない
- [x] 右サイドバーに「ページ」タブが存在し、用紙サイズ・向き・余白が設定できる
- [x] ページ設定からテンプレートを変更でき、既存内容は確認後にクリアされる
- [x] 新規作成ボタンがテンプレート選択モーダルを開く（空白 + ビルトインテンプレート + バックエンドテンプレート）
- [x] ツールバーの「データ」ボタンがDataBindingモーダルを開く
- [x] DataBindingモーダルの「データソース」タブで従来通りのデータ定義・プレビューデータ編集ができる
- [x] DataBindingモーダルの「式・計算」タブで CalculationRule を管理でき、クライアントサイド評価でテストできる
- [x] DataBindingモーダルの「バリデーション」タブで ValidationRule を管理できる
- [x] error severity の ValidationRule 違反でエクスポートがブロックされる

### 非機能要件

- [x] 既存テストが全て通る（`PropertiesPanel`, `VersionHistoryPanel`, `Toolbar` テスト等）
- [x] TypeScript 型エラーなし（`npm run build` が通る）
- [x] 新規コンポーネントのユニットテスト（各モーダルコンポーネント、`jexlEngine.ts`）

---

## System-Wide Impact

### Interaction Graph

- `Toolbar.handleNew` → `TemplateSelectionModal` → `loadReport()` → `invalidateComputed()` → `useEvaluator` debounce 発火
- `DataBindingModal` (ValidationRule変更) → store → エクスポート前チェック（次回エクスポート時）
- `PageSettingsPanel` (用紙サイズ変更) → store → `ReportCanvas` が再レンダリング（canvas scale 依存あり）

### Error Propagation

- JEXL 評価エラー: `jexlEngine.evaluateWithTimeout` がエラーを返す → タブ内インライン表示。エクスポートはブロックしない（式の構文エラーは warning 扱い）
- テンプレートロードエラー（バックエンド）: `TemplateSelectionModal` 内でフォールバック（ビルトインのみ表示）

### State Lifecycle Risks

- テンプレート変更でページ・要素が全クリアされる → `historyIndex > 0` チェックで保護
- DataBindingModal のルール変更（CalculationRule / ValidationRule CRUD）は **undo 履歴に積まない**。データソース設定（`setDataSource`）も現在 undo 対象外であり一貫性を維持する。モーダルを閉じた後に Ctrl+Z が汚染されないよう `pushHistory` を呼ばない実装とする

---

## Dependencies & Risks

| リスク | 影響 | 緩和策 |
|---|---|---|
| `@pawel-up/jexl` のJEXL 3.x 互換性 | 式・計算タブのプレビューが V1 と挙動差 | 主要関数 (sum/count/round) はユニットテストで検証 |
| `PropertiesPanel` からページ設定抽出時の store 接続 | PageSettingsPanel の状態管理 | PropertiesPanel の既存コードを丁寧に移植 |
| ValidationRule 型変更による既存データ互換 | 保存済みレポートの読み込みエラー | Zod `.passthrough()` で forward-compatible |

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-06-sidebar-cleanup-databinding-templates-brainstorm.md](../brainstorms/2026-04-06-sidebar-cleanup-databinding-templates-brainstorm.md)
  - Key decisions carried forward: (1) テンプレートはモーダル選択 + ページ設定タブから変更、(2) データはツールバーボタン→モーダル、(3) 条件表示はプロパティパネルのvisibilityRule（実装済み）

### Internal References

- `src/App.tsx:20-29` — LeftTab/RightTab 型と LEFT_TABS 配列
- `src/components/toolbar/Toolbar.tsx:193-196` — `handleNew` 関数（置き換え対象）
- `src/components/sidebar/PropertiesPanel.tsx:141-233` — ページ設定ブロック（抽出対象）
- `src/components/sidebar/PropertiesPanel.tsx:74-76` — visibilityRule フィールド（実装済み）
- `src/components/templates/TemplateGallery.tsx:46-58` — `applyTemplate` 関数（抽出・再利用）
- `src/store/types.ts:59-63` — `ValidationViolation` 型（既存）
- `src/store/types.ts:147-155` — CalculationRule CRUD アクション（ValidationRule にも同パターン）
- `src/lib/schemas/reportDefinition.ts:123-135` — `CalculationRuleSchema`（ValidationRuleSchema の参考）
- `src/lib/schemas/reportDefinition.ts:166` — 未型付け `validationRules`（更新対象）
- `src/hooks/useEvaluator.ts` — 既存バックエンド評価フック（変更なし）
