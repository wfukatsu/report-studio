---
date: 2026-04-05
topic: report-definition-studio-architecture
---

# 帳票テンプレート作成UI — アーキテクチャ設計ブレインストーム

## What We're Building

帳票オブジェクト設計書（法定帳票対応版）に基づく `ReportDefinition` の全オブジェクト  
（Section / Element / Binding / Constraint / OutputVariant / SubmissionModel 等）を  
視覚的に編集できるデザインスタジオ。

対象ユーザーはコーディング不要で帳票テンプレートを作成できる帳票設計者・業務担当者・システム管理者。

既存の `report-design-studio-v2`（Vite + React + TypeScript + Zustand + immer）を **拡張** する。

---

## Why This Approach

### 既存コードの位置づけ

| 既存の資産 | 引き継ぐ / 変更する |
|---|---|
| Vite + React + TS 設定 | そのまま引き継ぐ |
| Tailwind / shadcn/ui | そのまま引き継ぐ |
| `@dnd-kit` ドラッグ基盤 | 引き継ぐ（Section コンテナ対応を追加） |
| `html2canvas` + `jspdf` エクスポート | 引き継ぐ |
| `useReportStore`（単一 flat store） | **破壊的変更**: スライス構成へ再設計 |
| `src/types/index.ts` | **破壊的変更**: ReportDefinition モデルへ全面置換 |
| `Page → elements[]` | **破壊的変更**: `Page → sections[] → elements[]` へ |
| 座標系 px | **破壊的変更**: mm（96dpi 換算）へ |
| `ElementRenderer` | 拡張（新要素タイプ追加） |
| `CanvasElement` リサイズハンドル | 引き継ぐ |

---

## Key Decisions

### 1. ドメインモデル（Phase 1 で全面移行）

**変更前:**
```
Report
 └─ pages: Page[]
     └─ elements: ReportElement[]   // flat
```

**変更後（TextElement ブレストとの整合後）:**
```
ReportDefinition
 ├─ metadata: Metadata              // documentName, version, reportType, regulation, effectiveFrom/To
 ├─ pageSettings: PageSettings      // paperSize, orientation, margins, unit
 ├─ defaultTextStyle: TextStyle     // 全 TextElement のデフォルトスタイル（CSS inherit モデル）← 追加
 ├─ dataSources: DataSourceDefinition[]
 ├─ outputVariants: OutputVariant[]
 ├─ submissionModels: SubmissionModel[]
 ├─ validationRules: ValidationRule[]  // 帳票レベルの入力検証（≠ visibilityRule）
 ├─ templateVariables: TemplateVariable[]  // {{tplVar.xxx}} トークン用 ← 追加
 ├─ calculationRules: CalculationRule[]   // {{calc.xxx}} トークン用（型定義は TextElement ブレスト参照）
 └─ pages: Page[]
     └─ sections: Section[]
         └─ elements: Element[]     // 各 Element は Binding / FieldConstraint / visibilityRule を持つ
```

**`ElementBase` への追加フィールド（TextElement ブレスト準拠）:**
```ts
interface ElementBase {
  // 既存フィールド
  id: string; type: ElementType; position: Position; size: Size
  zIndex: number; locked: boolean; visible: boolean
  // 追加
  name?: string           // レイヤーパネル表示名
  visibilityRule?: string // 要素表示条件式（calculationEngine で評価）
  printable?: boolean     // 出力対象か（default: true）
}
```

`CalculationRule` の完全な型定義は `2026-04-05-text-element-brainstorm.md` を参照。

**理由:** Phase 2 以降に互換パスを残すと技術的負債になる。型・ストア・コンポーネントを一斉に変更する初期コストを Phase 1 で払い切る。

---

### 2. 座標単位: mm（96dpi 換算）

| 項目 | 仕様 |
|---|---|
| 内部データモデル | mm（浮動小数） |
| 表示変換 | `mmToPx(mm) = mm / 25.4 * 96 * window.devicePixelRatio`（Retina/HiDPI 対応）|
| グリッドスナップ | 1mm 単位 |
| 入力 UI | mm 表示、数値入力 |
| エクスポート | mm のまま出力（PDF 生成時に mm → pt 変換） |

**理由:** 法定帳票は実寸指定が必要。px のまま管理すると DPI 依存バグが発生する。

---

### 3. Zustand スライスパターン

1つの `create<RootStore>()(...)` の中に 4 つのスライスを展開する。

```
RootStore
 ├─ layoutSlice      → ReportDefinition 本体 + Section/Element CRUD + defaultTextStyle
 ├─ rulesSlice       → ValidationRule / CalculationRule / templateVariables（全て rulesSlice で一元管理）
 ├─ variantSlice     → OutputVariant / MaskingRule / visibilityOverrides
 └─ submissionSlice  → SubmissionModel / FieldMapping / ExportRule
```

加えて **`useHistoryStore`** を別 Store として設ける。

```typescript
// 全スライスの結合スナップショットを取る
type HistorySnapshot = {
  layout: LayoutState
  rules: RulesState
  variant: VariantState
  submission: SubmissionState
}
```

- undo/redo は `useHistoryStore` が `applySnapshot()` で 4 スライスを一括復元
- UI からは既存の `undo()` / `redo()` を呼ぶだけ（API 変更なし）

**理由:** ファイル分割で責務は分離しつつ、undo/redo のアトミック性を保証する最もシンプルな構成。

---

### 4. Section のキャンバス表現: 視覚コンテナ帯

```
┌─ ReportHeader ──────────────────────────────────────┐
│  [TextElement: 会社名]   [ImageElement: ロゴ]        │
└──────────────────────────────────────────────────────┘
┌─ Body ───────────────────────────────────────────────┐
│  [TableElement: 明細]                                │
│  [RepeatingContainer]                                │
└──────────────────────────────────────────────────────┘
┌─ ReportFooter ───────────────────────────────────────┐
│  [TextElement: ページ番号]                           │
└──────────────────────────────────────────────────────┘
```

- Section はキャンバス上で `position: relative` のコンテナ div
- Section 内の Element は Section 左上を原点とした mm 座標で配置（AbsoluteLayout）
- Section 間の順序はドラッグ&ドロップで変更可能
- Section 境界にラベルと sectionType バッジを表示

**理由:** 法定帳票は領域が明確に分かれており、視覚的に Section 境界が見えることが設計ミスを防ぐ。

---

### 5. 段階的実装フェーズ（要件書との対応）

| Phase | スコープ | 状態 |
|---|---|---|
| Phase 1 | 型・ストア全面移行 + Section/Element 配置 + AbsoluteLayout + Layer パネル + Undo/Redo + CodeMirror 式エディタ基盤 + localStorage 自動保存 + JSON エクスポート + **TextElement 拡張（インライン編集 / TextStyle 16props / @メンション / tokenParser / textStyleUtils）** + **TemplateVariable + CalculationRule 基盤（calculationEngine）** + **TemplateSettingsDialog** | 着手前 |
| Phase 2 | DataSource ツリー + Binding タブ + Table/RepeatingContainer + RelativeLayout + サンプルデータプレビュー + **TextElement Phase 2（token span 化 / CalculationRule 式エディタ UI）** | 着手前 |
| Phase 3 | FieldConstraint + ValidationRule / CrossFieldRule + 検証プレビューオーバーレイ + 入力系 Element | 着手前 |
| Phase 4 | OutputVariant + MaskingRule + バリアント切り替えプレビュー | 着手前 |
| Phase 5 | SubmissionModel + FieldMapping（矢印 UI）+ バージョン履歴 + JSON インポート | 着手前 |

---

## Open Questions（解決済み）

| 質問 | 決定 |
|---|---|
| 既存プロジェクトを拡張か新規か | 既存プロジェクトを拡張する |
| Phase 1 でドメインモデル破壊的変更を行うか | Phase 1 で全面移行する |
| 座標単位を mm に変えるか | mm に切り替える（96dpi 換算） |
| Store 分割方法 | Zustand スライスパターン + 共通 history Store |
| Section のキャンバス表現 | 視覚コンテナ帯（境界線付き領域） |
| 式エディタ | CodeMirror を Phase 1 から導入 |
| データ保存先 | Phase 1 は localStorage / JSON エクスポート。将来 ScalarDB OSS + SQLite へ移行 |
| テンプレート一覧画面 | Phase 1 に含める（React Router 導入） |
| TextElement の拡張スコープ | Phase 1 に含める。インライン編集・TextStyle 16props・@メンション・tokenParser・calculationEngine 基盤をすべて Phase 1 で実装。詳細は `2026-04-05-text-element-brainstorm.md` 参照 |
| TemplateVariable と CalculationRule の実装タイミング | Phase 5 から Phase 1 に前倒し（TextElement の @メンション機能で必要なため）|
| visibilityRule と ValidationRule の区別 | visibilityRule = 要素レベルの表示条件式（ElementBase）。ValidationRule = 帳票レベルの入力検証（ReportDefinition）。両者は別物 |

## Open Questions（未解決 → Phase 2 で決定）

- **RelativeLayout の実装戦略**: `@dnd-kit/sortable` で Section 内のフロー順序を管理するか、CSS Grid/Flexbox ベースにするか？

---

## Store Slice 詳細設計

### 現状の課題

| 課題 | 現状 | 移行後 |
|---|---|---|
| `CalculationRule = Record<string, unknown>` | 型なし placeholder | 完全な型定義 |
| `TextStyle` が 7 props のみ | 不完全 | 16 props（text-element ブレスト準拠） |
| `ReportDefinition` に `templateVariables` なし | 欠落 | `templateVariables: TemplateVariable[]` 追加 |
| History が pages のみ | rules/settings 変更は undo できない | 全スライスを atomic snapshot |
| Dual-write（page.elements + sections） | 保守困難 | sections 単一ソースオブトゥルース |

---

### Phase 1 型拡張: TextStyle（16 props）

```ts
export interface TextStyle {
  // フォント
  fontSize?: number              // mm単位
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  // 色・背景
  color?: string                 // #RRGGBB
  backgroundColor?: string
  // 配置
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  // 余白
  letterSpacing?: number         // em単位
  lineHeight?: number            // 倍率（例: 1.5）
  paddingTop?: number            // mm
  paddingRight?: number          // mm
  paddingBottom?: number         // mm
  paddingLeft?: number           // mm
  // 日本語
  writingMode?: 'horizontal-tb' | 'vertical-rl'
}
```

**デフォルト値（`defaultTextStyle: TextStyle`）:**

```ts
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: 3.5,        // ≈ 10pt
  fontFamily: 'sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#000000',
  backgroundColor: 'transparent',
  textAlign: 'left',
  verticalAlign: 'top',
  letterSpacing: 0,
  lineHeight: 1.4,
  paddingTop: 1,
  paddingRight: 1,
  paddingBottom: 1,
  paddingLeft: 1,
  writingMode: 'horizontal-tb',
}
```

---

### Phase 1 型拡張: CalculationRule / TemplateVariable

```ts
export type CalculationResultType = 'number' | 'string' | 'boolean'
export type OnErrorBehavior = 'zero' | 'empty' | 'error_text'

export type NumberFormatType =
  | 'integer' | 'decimal' | 'currency_jpy' | 'currency_usd'
  | 'percent' | 'comma' | 'custom'

export type DateFormatType =
  | 'yyyy/MM/dd' | 'yyyy年MM月dd日' | 'MM/dd/yyyy'
  | 'reiwa' | 'wareki_full' | 'custom'

export interface CalculationFormat {
  type: NumberFormatType | DateFormatType
  decimalPlaces?: number
  customPattern?: string
}

export interface CalculationRule {
  key: string
  label: string
  description?: string
  expression: string
  format?: CalculationFormat
  resultType: CalculationResultType
  onError: OnErrorBehavior
}

export interface TemplateVariable {
  key: string
  label: string
  description?: string
  defaultValue: string
}
```

**ReportDefinition への追加フィールド:**

```ts
export interface ReportDefinition {
  // ... 既存
  defaultTextStyle: TextStyle           // ← 追加（CSS inherit モデルのルート）
  templateVariables: TemplateVariable[] // ← 追加（Phase 1 前倒し）
  calculationRules: CalculationRule[]   // ← 型を CalculationRule[] に昇格
}
```

---

### layoutSlice

```ts
interface LayoutState {
  reportDefinition: ReportDefinition
  selection: SelectionState
}

interface SelectionState {
  activePageId: string | null
  selectedElementIds: string[]
  /** レイヤーパネルでのフォーカス Section（null = 全体） */
  activeSectionId: string | null
}
```

**Actions — Metadata・PageSettings:**

| アクション | 引数 | 説明 |
|---|---|---|
| `updateMetadata` | `patch: Partial<Metadata>` | 帳票メタデータ更新 |
| `updatePageSettings` | `patch: Partial<PageSettings>` | 用紙設定変更（全ページ幅高再計算）|
| `updateDefaultTextStyle` | `patch: Partial<TextStyle>` | デフォルトスタイル更新 |

**Actions — Page:**

| アクション | 引数 | 説明 |
|---|---|---|
| `addPage` | `name?: string` | ページ追加（デフォルト sections 付き）|
| `removePage` | `pageId: string` | ページ削除（1ページ以上を保証）|
| `renamePage` | `pageId, name` | ページ名変更 |
| `reorderPages` | `fromIdx, toIdx` | ページ順序変更 |
| `setActivePage` | `pageId` | アクティブページ切替（selection クリア）|

**Actions — Section:**

| アクション | 引数 | 説明 |
|---|---|---|
| `addSection` | `pageId, sectionType, after?: sectionId` | Section 追加 |
| `removeSection` | `pageId, sectionId` | Section 削除（最後の body は削除不可）|
| `updateSection` | `pageId, sectionId, patch: Partial<Section>` | Section 属性更新 |
| `setSectionHeight` | `pageId, sectionId, height: number` | Section 高さ変更（mm）|
| `reorderSections` | `pageId, fromIdx, toIdx` | Section 順序変更（DnD）|

**Actions — Element:**

| アクション | 引数 | 説明 |
|---|---|---|
| `addElement` | `pageId, sectionId, element: ReportElement` | 要素追加 + zIndex 自動設定 |
| `updateElement` | `pageId, elementId, patch` | 要素属性更新（filterPatch 適用）|
| `removeElement` | `pageId, elementId` | 要素削除（Section から検索）|
| `moveElement` | `pageId, elementId, position` | 座標変更（history なし）|
| `resizeElement` | `pageId, elementId, size` | サイズ変更（history なし）|
| `duplicateElement` | `pageId, elementId` | 複製（+5mm オフセット）|
| `moveElementToSection` | `pageId, elementId, targetSectionId` | Section 間移動 |
| `setElementLocked` | `pageId, elementId, locked` | ロック切替 |
| `setElementVisible` | `pageId, elementId, visible` | 表示切替 |
| `updateZIndex` | `pageId, elementId, zIndex` | レイヤー順序変更 |
| `bringToFront` / `sendToBack` | `pageId, elementId` | 最前面/最背面へ |

**Actions — Selection:**

| アクション | 引数 | 説明 |
|---|---|---|
| `selectElement` | `elementId, multi?: boolean` | 要素選択（Shift でマルチ）|
| `selectElements` | `elementIds: string[]` | 複数要素一括選択 |
| `selectAll` | `pageId` | 全要素選択 |
| `clearSelection` | — | 選択クリア |
| `setActiveSectionId` | `sectionId \| null` | レイヤーパネル用 Section フォーカス |

**Selectors:**

```ts
// layoutSlice から export
export const selectActivePage = (s: LayoutState): PageDef | null => ...
export const selectActiveSection = (s: LayoutState): Section | null => ...
export const selectSelectedElements = (s: LayoutState): ReportElement[] => ...
export const selectAllPageElements = (page: PageDef): ReportElement[] =>
  page.sections.flatMap(s => s.elements)
export const selectElementById = (page: PageDef, id: string): ReportElement | undefined =>
  page.sections.flatMap(s => s.elements).find(e => e.id === id)
export const selectSectionForElement = (page: PageDef, elementId: string): Section | undefined =>
  page.sections.find(s => s.elements.some(e => e.id === elementId))
```

---

### rulesSlice

```ts
interface RulesState {
  templateVariables: TemplateVariable[]
  calculationRules: CalculationRule[]
  validationRules: ValidationRule[]  // Phase 3 まではスタブ（空配列）
}
```

**Actions — TemplateVariable:**

| アクション | 引数 | 説明 |
|---|---|---|
| `addTemplateVariable` | `variable: Omit<TemplateVariable, 'key'> & { key?: string }` | 追加（key は uuidv4 デフォルト）|
| `updateTemplateVariable` | `key, patch: Partial<TemplateVariable>` | 更新 |
| `removeTemplateVariable` | `key` | 削除（参照チェック後に警告）|

**Actions — CalculationRule:**

| アクション | 引数 | 説明 |
|---|---|---|
| `addCalculationRule` | `rule: Omit<CalculationRule, 'key'>` | 追加 |
| `updateCalculationRule` | `key, patch: Partial<CalculationRule>` | 更新 |
| `removeCalculationRule` | `key` | 削除（依存ルールの循環チェック後）|
| `reorderCalculationRules` | `fromIdx, toIdx` | 実行順変更 |

**Selectors:**

```ts
export const selectTemplateVariables = (s: RulesState) => s.templateVariables
export const selectCalculationRules = (s: RulesState) => s.calculationRules
// @mention MentionPicker 用: すべてのトークンをフラットリストで返す
export const selectAllMentionTokens = (state: RootStore): MentionToken[] => {
  const tvTokens = state.rules.templateVariables.map(v => ({
    type: 'tplVar' as const, key: v.key, label: v.label,
  }))
  const calcTokens = state.rules.calculationRules.map(r => ({
    type: 'calc' as const, key: r.key, label: r.label,
  }))
  return [...tvTokens, ...calcTokens]
}
```

---

### useHistoryStore（分離 Store）

```ts
type HistorySnapshot = {
  layout: LayoutState
  rules: RulesState
  // variant/submission は Phase 4/5 まで不要
}

interface HistoryStore {
  snapshots: HistorySnapshot[]
  index: number

  pushSnapshot: (snapshot: HistorySnapshot) => void
  undo: () => HistorySnapshot | null
  redo: () => HistorySnapshot | null
  canUndo: () => boolean
  canRedo: () => boolean
  clear: () => void
}
```

**スナップショット戦略:**

| アクション種別 | history push | 理由 |
|---|---|---|
| addElement / removeElement / duplicateElement | 即時 push | 構造変化 |
| updateElement（テキスト・スタイル） | 300ms デバウンス | タイピング中に毎回 push しない |
| moveElement / resizeElement | ドラッグ終了時のみ push | ドラッグ中は too noisy |
| addSection / removeSection / reorderSections | 即時 push | Section 構造変化 |
| addTemplateVariable / updateCalculationRule 等 | 即時 push | Rules 変更 |
| updateMetadata / updatePageSettings | 即時 push | 設定変更 |

**applySnapshot 実装イメージ:**

```ts
// RootStore の undo/redo から呼ぶ
function applySnapshot(snapshot: HistorySnapshot) {
  useLayoutStore.setState({ ...snapshot.layout })
  useRulesStore.setState({ ...snapshot.rules })
}
```

---

### スライス結合パターン

```ts
// src/store/index.ts
export { useLayoutStore } from './layoutSlice'
export { useRulesStore } from './rulesSlice'
export { useVariantStore } from './variantSlice'
export { useSubmissionStore } from './submissionSlice'
export { useHistoryStore } from './historyStore'

// 後方互換エイリアス（移行期に既存コンポーネントが壊れないよう）
// 旧: useReportStore → 新: useLayoutStore
// @deprecated
export const useReportStore = useLayoutStore
```

**コンポーネントからの呼び出し例:**

```ts
// 要素追加
const addElement = useLayoutStore(s => s.addElement)

// @mention トークン一覧（cross-slice selector）
const tokens = useStore(selectAllMentionTokens) // RootStore combine が必要

// undo/redo
const { undo, redo, canUndo, canRedo } = useHistoryStore()
```

---

### 移行戦略: Dual-write 撤廃ロードマップ

| ステップ | 内容 |
|---|---|
| Step 1 | `page.elements[]` を完全廃止。sections[].elements が単一ソース |
| Step 2 | `flattenPageElements()` を `selectAllPageElements()` に置換 |
| Step 3 | `Report` 型と `Page` 型 (legacy) を削除。`ReportDefinition` + `PageDef` のみ |
| Step 4 | Storybook stories の `useReportStore.setState` を `useLayoutStore.setState` に更新 |

**注意点:** `loadReport()` の legacy migration ロジック（sections なしの旧 JSON 読み込み）は `importReportJSON` の中で継続サポート。

---

### テスト戦略

```
src/store/
  layoutSlice.test.ts    → addElement / removeElement / moveElement / undo 一致テスト
  rulesSlice.test.ts     → CalculationRule CRUD + 循環参照エラー
  historyStore.test.ts   → pushSnapshot / undo / redo / debounce
  selectors.test.ts      → selectAllPageElements / selectElementById / selectAllMentionTokens
```

**重要なテストケース:**

```ts
// historyStore: undo が layout+rules を atomic に復元する
it('undo restores both layout and rules atomically', () => {
  addElement(...)     // → snapshot A
  addCalcRule(...)    // → snapshot B
  undo()              // → back to A
  expect(layout.elements).toHaveLength(before)
  expect(rules.calculationRules).toHaveLength(before)
})

// CalculationRule: 循環参照検出
it('rejects circular CalculationRule dependency', () => {
  addCalcRule({ key: 'a', expression: '{{calc.b}}' })
  expect(() => addCalcRule({ key: 'b', expression: '{{calc.a}}' }))
    .toThrow(CircularDependencyError)
})
```

---

## Section コンテナ 詳細設計

### Section の視覚表現仕様

```
┌── Section Header bar ──────────────────────────────────────────────┐
│ [≡ drag] [body ▾] ReportHeader                  [+] [⋮ menu]       │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← elements are AbsoluteLayout inside Section bounds →             │
│                                                                     │
│                                          ↕ resize handle (5px)    │
└────────────────────────────────────────────────────────────────────┘
```

**Section Header UI Elements:**

| UI 要素 | 型 | 説明 |
|---|---|---|
| ≡ ドラッグハンドル | `@dnd-kit/sortable` useSortable | Section 間順序変更 |
| sectionType バッジ | DropdownMenu | header/body/footer/custom 切替 |
| ラベル | インライン編集 | Section の表示名 |
| + ボタン | Button | この Section の下に新規 Section 追加 |
| ⋮ メニュー | DropdownMenu | 削除・複製・Section 設定 |

### Section 高さポリシー

| sectionType | 高さ変更 | 備考 |
|---|---|---|
| header | 手動リサイズ（resize handle）| ページ上端に固定 |
| body | 手動リサイズ | 複数 body Section を持てる |
| footer | 手動リサイズ | ページ下端に固定 |
| custom | 手動リサイズ | 位置は body エリア内 |

**制約:** 全 Section の合計高さ ≤ ページ高さ - (margin.top + margin.bottom)。超過時は警告表示。

### Section 内 Element の座標系

```
Section の左上角 = (0, 0) mm
→ Element.position.x / y は Section 相対座標
→ キャンバス上の絶対座標 = Section の y オフセット + Element.position.y
```

**mmToPx 変換（canvas 描画用）:**

```ts
export function mmToPx(mm: number): number {
  return (mm / 25.4) * 96 * window.devicePixelRatio
}
export function pxToMm(px: number): number {
  return (px * 25.4) / (96 * window.devicePixelRatio)
}
```

### Section DnD 実装

```tsx
// SectionContainer は DndContext の外側で @dnd-kit/sortable を使う
// ページ内の Section 順序変更専用の SortableContext を持つ

<SortableContext
  items={sections.map(s => s.id)}
  strategy={verticalListSortingStrategy}
>
  {sections.map(section => (
    <SortableSectionContainer key={section.id} section={section} />
  ))}
</SortableContext>
```

**注意:** Section 内の Element DnD（`@dnd-kit/core`）と Section 間 DnD（`@dnd-kit/sortable`）は別の `DndContext` を使う。ネストした DndContext は ID 衝突を起こすため、Section ドラッグ開始時は Element DnD を無効化する。

### Section の sectionType 制約

| ルール | 詳細 |
|---|---|
| header は 1 つのみ | 2 つ目を追加しようとするとエラートースト |
| footer は 1 つのみ | 同上 |
| body は複数可 | 制限なし |
| 削除保護 | 最後の body Section は削除不可 |

---

## Layer Panel 詳細設計

### ツリー構造

```
LayerPanel
 ├─ PageSelector（タブ）
 └─ LayerTree
     ├─ SectionLayerItem
     │   ├─ [▶] 展開/折畳み
     │   ├─ sectionType アイコン
     │   ├─ ラベル（Section.name）
     │   ├─ [👁] visible toggle（Section 全体）
     │   └─ ElementLayerItem[]
     │       ├─ [≡] DnD ハンドル（Section 内順序変更）
     │       ├─ element type アイコン
     │       ├─ ラベル（element.name ?? type + ID短縮）
     │       ├─ [👁] visible toggle
     │       └─ [🔒] lock toggle
     └─ ... 次の Section
```

### ElementLayerItem ラベル解決

```ts
function getElementDisplayName(el: ReportElement): string {
  if ('name' in el && el.name) return el.name
  const typeLabel: Record<ElementType, string> = {
    text: 'テキスト', image: '画像', shape: '図形',
    table: '表', chart: 'グラフ', dataField: 'データフィールド',
    label: 'ラベル', manualEntry: '手入力',
    hanko: '印鑑', repeatingContainer: '繰返しコンテナ',
  }
  return `${typeLabel[el.type] ?? el.type} ${el.id.slice(0, 4)}`
}
```

### インタラクション仕様

| 操作 | 動作 |
|---|---|
| Layer クリック | `selectElement(id)` |
| Cmd/Ctrl + クリック | `selectElement(id, multi=true)` |
| 👁 トグル | `setElementVisible(pageId, id, !visible)` |
| 🔒 トグル | `setElementLocked(pageId, id, !locked)` |
| DnD（Section 内） | `reorderElements` アクション（zIndex 再計算）|
| DnD（Section 間） | `moveElementToSection(pageId, id, targetSectionId)` |
| ダブルクリック | インライン名前変更（`updateElement(patch: {name})` ）|
| 右クリック | コンテキストメニュー（複製・削除・前面へ・背面へ）|

### 選択との双方向同期

```ts
// キャンバスで要素選択 → Layer Panel がスクロールしてフォーカス
useEffect(() => {
  if (selectedElementIds.length === 1) {
    layerItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}, [selectedElementIds])
```

### Phase 1 スコープ（実装する / しない）

| 機能 | Phase 1 | 理由 |
|---|---|---|
| 要素リスト表示（型・名前・アイコン）| ✅ | 必須 |
| visible / lock トグル | ✅ | 必須 |
| クリック選択・マルチ選択 | ✅ | 必須 |
| Section 折畳み | ✅ | UX 向上 |
| 要素 DnD（zIndex 並替え） | ✅ | 必須 |
| Section 間要素移動（DnD）| ❌ Phase 2 | 複雑。Phase 1 ではコンテキストメニューで代替 |
| インライン名前変更 | ✅（シンプル実装）| ダブルクリック→input |
| グループ化 | ❌ Phase 3 | 対象外 |

---

## DataSourcePanel 詳細設計

### パネル構成

```
DataSourcePanel
 ├─ DataSourceSelector（ドロップダウン）  ← Phase 1: 1つのみ
 ├─ JSONInputArea（テキストエリア + パース）
 ├─ FieldTypeInferenceToggle（自動推論 ON/OFF）
 └─ FieldTree
     ├─ FieldTreeNode（プリミティブ）→ ドラッグして Binding に使える
     └─ FieldTreeNode（ネスト）→ 展開/折畳み
```

### フィールド型推論

```ts
type InferredFieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null'

function inferFieldType(value: unknown): InferredFieldType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(value)) return 'date'
    return 'string'
  }
  return 'string'
}
```

**型アイコンマッピング:**

| 推論型 | アイコン | 説明 |
|---|---|---|
| string | `Aa` | テキスト |
| number | `#` | 数値 |
| boolean | `✓` | 真偽値 |
| date | `📅` | 日付 |
| array | `[]` | 配列（展開可能）|
| object | `{}` | オブジェクト（展開可能）|
| null | `∅` | NULL値 |

### JSON 入力フロー

```
① テキストエリアに JSON ペースト
② onChange で JSON.parse を試みる
③ 成功: FieldTree を更新
④ 失敗: エラートースト「無効な JSON です」（ユーザー入力中は validate しない）
⑤ 「適用」ボタン押下: store.setDataSource(parsed) を呼ぶ
```

**セキュリティ注意:** `resolveField()` は既存の FORBIDDEN_KEYS チェックを継続。DataSourcePanel 側でも `__proto__`・`constructor`・`prototype` キーを含む JSON は拒否。

### フィールドの Binding ドラッグ

Phase 2 機能だが、Phase 1 で UI 骨格だけ用意：
- `FieldTreeNode` は `draggable` 属性付き（ただし DnD 動作は未実装）
- ドラッグ時の payload: `{ fieldKey: 'customer.name', type: 'string' }`

### サンプルデータ

Phase 1 ではデフォルトのサンプル JSON を組み込み:

```ts
export const SAMPLE_DATA_SOURCE: DataSource = {
  id: 'sample',
  name: 'サンプルデータ',
  fields: {
    documentTitle: '請求書',
    issueDate: '2026-04-01',
    customer: { name: '株式会社サンプル', address: '東京都渋谷区' },
    items: [
      { name: '商品A', qty: 2, price: 5000 },
      { name: '商品B', qty: 1, price: 12000 },
    ],
    total: 22000,
  },
}
```

---

## 日本語要件 詳細設計（Phase 1 必須）

### 1. 縦書き（writingMode: 'vertical-rl'）

**TextElement の縦書き CSS:**

```css
.text-element[data-writing-mode="vertical-rl"] {
  writing-mode: vertical-rl;
  text-orientation: mixed;  /* 英数字を自動回転 */
}
```

**レンダリング上の制約:**

| 項目 | 対応 |
|---|---|
| 英数字の回転 | `text-orientation: mixed`（自動）|
| 縦中横（縦書き中の横組み数字）| `text-combine-upright: all`（CSS プロパティ）|
| textAlign の意味変化 | 縦書きでは left/right が上下になる |
| html2canvas との互換性 | `writing-mode` は html2canvas v1.4+ でサポート済み |

**TextStyle 拡張フィールド:**

```ts
interface TextStyle {
  // ...
  writingMode?: 'horizontal-tb' | 'vertical-rl'
  textCombineUpright?: 'none' | 'all'  // 縦中横制御
}
```

**プロパティパネル:** writingMode トグルボタン（横書き / 縦書き）を StylePropertiesTab の「レイアウト」セクションに追加。

---

### 2. 和暦（Japanese Era Calendar）

**CalculationFormat への統合:**

```ts
export type DateFormatType =
  | 'yyyy/MM/dd'
  | 'yyyy年MM月dd日'
  | 'reiwa'          // 令和X年XX月XX日
  | 'wareki_short'   // R6.04.01
  | 'wareki_full'    // 令和6年4月1日
  | 'custom'

// 和暦変換テーブル（浮動小数精度回避のため文字列で管理）
const ERA_TABLE = [
  { name: '令和', kanji: '令和', abbr: 'R', start: '2019-05-01' },
  { name: '平成', kanji: '平成', abbr: 'H', start: '1989-01-08' },
  { name: '昭和', kanji: '昭和', abbr: 'S', start: '1926-12-25' },
  { name: '大正', kanji: '大正', abbr: 'T', start: '1912-07-30' },
  { name: '明治', kanji: '明治', abbr: 'M', start: '1868-01-25' },
] as const
```

**`formatWareki(date: Date, format: DateFormatType): string`** を `dateFormatter.ts` に実装。

```ts
// 例
formatWareki(new Date('2026-04-01'), 'wareki_full') // → "令和8年4月1日"
formatWareki(new Date('2026-04-01'), 'wareki_short') // → "R8.04.01"
```

---

### 3. 印鑑要素（HankoElement）

**ElementType への追加:**

```ts
export type ElementType =
  | 'text' | 'image' | 'table' | 'chart' | 'shape' | 'dataField'
  | 'label' | 'manualEntry'
  | 'hanko'  // ← 新規
```

**HankoElement 型:**

```ts
export interface HankoElement extends ElementBase {
  type: 'hanko'
  /** 印鑑に表示するテキスト（通常は姓）*/
  text: string
  /** 枠の形状 */
  shape: 'circle' | 'rectangle'
  /** 枠の色 */
  borderColor: string
  /** テキスト色 */
  textColor: string
  /** フォントサイズ（mm）*/
  fontSize: number
  /** writingMode（縦書き固定がデフォルト）*/
  writingMode: 'vertical-rl' | 'horizontal-tb'
  /** 二重枠 */
  doubleBorder: boolean
  /** バインディング（DataSource のフィールドから自動入力）*/
  binding?: string
}
```

**デフォルトサイズ:** 20mm × 20mm（実際の印鑑規格に合わせる）

**ElementRenderer の追加ケース:**

```tsx
case 'hanko':
  return <HankoRenderer element={element as HankoElement} scale={scale} />
```

**HankoRenderer の描画:**

```tsx
function HankoRenderer({ element, scale }: HankoRendererProps) {
  const px = (mm: number) => mmToPx(mm) * scale
  const borderStyle = element.doubleBorder
    ? `2px solid ${element.borderColor}, 0 0 0 4px ${element.borderColor}`
    : undefined
  // SVG か CSS で枠を描く（SVG が印刷品質で優れる）
  return (
    <svg
      width={px(element.size.width)}
      height={px(element.size.height)}
      style={{ overflow: 'visible' }}
    >
      {/* 外枠 */}
      <circle cx="50%" cy="50%" r="48%"
        fill="none" stroke={element.borderColor} strokeWidth={element.doubleBorder ? 2 : 1} />
      {element.doubleBorder && (
        <circle cx="50%" cy="50%" r="44%"
          fill="none" stroke={element.borderColor} strokeWidth={1} />
      )}
      {/* テキスト（縦書き） */}
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="central"
        fill={element.textColor}
        fontSize={px(element.fontSize)}
        style={{ writingMode: element.writingMode }}
      >
        {element.text}
      </text>
    </svg>
  )
}
```

---

### 4. ふりがな（Ruby テキスト）

Phase 2 以降。Phase 1 では仕様のみ定義:

```ts
interface RubyAnnotation {
  target: string   // 親文字列
  ruby: string     // ふりがな
  position: number // 文字列内の開始位置
}

// TextElement に将来追加
interface TextElement extends ElementBase {
  // ...
  rubyAnnotations?: RubyAnnotation[]  // Phase 2
}
```

CSS: `<ruby>漢字<rt>かんじ</rt></ruby>`

---

## Open Questions（未解決 → Phase 2 で決定）

- **RelativeLayout の実装戦略**: `@dnd-kit/sortable` で Section 内のフロー順序を管理するか、CSS Grid/Flexbox ベースにするか？

---

## Element 詳細設計

### Element 型一覧と Phase スコープ

| ElementType | 説明 | Phase |
|---|---|---|
| `text` | インライン編集・@mention・CSS inherit | Phase 1 |
| `label` | 静的テキスト（編集不可・バインディングなし）| Phase 1 |
| `image` | 画像（base64/URL）| Phase 1 |
| `shape` | 図形（矩形・円・線）| Phase 1 |
| `dataField` | データソースフィールド値表示 | Phase 1 |
| `manualEntry` | 手書き/デジタル入力欄（印刷フォーム用）| Phase 1 |
| `hanko` | 印鑑要素（SVGレンダリング）| Phase 1 |
| `approvalStampRow` | 多段印鑑欄 | Phase 1 |
| `revenueStamp` | 収入印紙貼付欄 | Phase 1 |
| `barcode` | QRコード / Code128 バーコード | Phase 1 |
| `table` | 静的・バインディング対応テーブル | Phase 1（静的）/ Phase 2（バインディング）|
| `chart` | グラフ（recharts）| Phase 1（スタブ）/ Phase 2（バインディング）|
| `repeatingBand` | コレクションを行として縦繰り返し（Detail Band）| Phase 2 |
| `repeatingList` | コレクションをカードとして縦/横/グリッドに繰り返し | Phase 2 |

---

### 共通 ElementBase 完全版

```ts
export interface ElementBase {
  id: string
  type: ElementType
  /** Section 相対座標（mm）*/
  position: Position
  /** サイズ（mm）*/
  size: Size
  zIndex: number
  locked: boolean
  visible: boolean
  /** レイヤーパネル表示名（未設定時は type + id短縮で自動生成）*/
  name?: string
  /** 要素表示条件式 — calculationEngine で評価（falsy で非表示）*/
  visibilityRule?: string
  /** 印刷出力対象か（false = 画面表示のみ）*/
  printable?: boolean
}
```

---

### TextElement（完全版）

`2026-04-05-text-element-brainstorm.md` が権威。ここでは他 Element との対比用に要点のみ。

```ts
export interface TextElement extends ElementBase {
  type: 'text'
  /** {{tplVar.key}} / {{calc.key}} / {{fieldKey}} トークンを含む生文字列 */
  content: string
  /** undefined = defaultTextStyle から継承 */
  style: Partial<TextStyle>
}
```

**デフォルト値:**

```ts
export function createTextElement(overrides?: Partial<TextElement>): TextElement {
  return {
    id: uuidv4(),
    type: 'text',
    position: { x: 10, y: 10 },
    size: { width: 60, height: 10 },
    zIndex: 1,
    locked: false,
    visible: true,
    content: 'テキスト',
    style: {},  // 全プロパティ undefined = 完全継承
    ...overrides,
  }
}
```

**ELEMENT_ALLOWED_KEYS 追加:**

```ts
text: new Set([
  'position', 'size', 'zIndex', 'visible', 'locked', 'name',
  'visibilityRule', 'printable',
  'content', 'style',
]),
```

**PropertiesPanel タブ構成:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, visible, locked, name, printable |
| スタイル | `StylePropertiesTab`（Partial<TextStyle> + defaultStyle 継承表示）|
| バインディング | content テキストエリア + @mention トリガー説明 |
| visibilityRule | 式エディタ（CodeMirror） |

---

### LabelElement

静的テキスト。データバインディングなし、インライン編集なし。見出し・説明文・罫線ラベル等。

```ts
export interface LabelElement extends ElementBase {
  type: 'label'
  text: string
  style: Partial<TextStyle>
}
```

**TextElement との違い:**

| 比較項目 | TextElement | LabelElement |
|---|---|---|
| インライン編集 | ダブルクリックで編集可 | 不可（プロパティパネルのみ）|
| @mention / トークン | 対応 | 非対応（`{{...}}` はそのまま表示）|
| データバインディング | 間接（content にトークン埋め込み）| なし |
| 主用途 | 動的テキスト・差込印刷 | 見出し・固定ラベル |

**デフォルト値:**

```ts
export function createLabelElement(overrides?: Partial<LabelElement>): LabelElement {
  return {
    id: uuidv4(), type: 'label',
    position: { x: 10, y: 10 },
    size: { width: 40, height: 6 },
    zIndex: 1, locked: false, visible: true,
    text: 'ラベル',
    style: {},
    ...overrides,
  }
}
```

**ElementRenderer:**

```tsx
case 'label': {
  const el = element as LabelElement
  const resolved = mergeStyle(defaultTextStyle, el.style)
  return (
    <div
      style={{
        width: '100%', height: '100%',
        fontSize: mmToPx(resolved.fontSize ?? 3.5) * scale,
        fontFamily: resolved.fontFamily,
        fontWeight: resolved.fontWeight,
        color: resolved.color,
        textAlign: resolved.textAlign,
        padding: toPaddingCss(resolved, scale),
        writingMode: resolved.writingMode,
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {el.text}
    </div>
  )
}
```

**PropertiesPanel タブ:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, name |
| スタイル | `StylePropertiesTab`（Partial<TextStyle>）|

---

### ShapeElement（完全版）

```ts
export type ShapeKind = 'rectangle' | 'circle' | 'line'

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  fill: string           // 'transparent' = 塗りなし
  stroke: string         // '#000000'
  strokeWidth: number    // mm
  /** 角丸（rectangle のみ、mm）*/
  borderRadius?: number
  /** 線の向き（line のみ）*/
  lineAngle?: 'horizontal' | 'vertical' | 'diagonal-45' | 'diagonal-135'
  /** 破線（stroke-dasharray）*/
  strokeDash?: 'solid' | 'dashed' | 'dotted'
}
```

**デフォルト値:**

```ts
export function createShapeElement(overrides?: Partial<ShapeElement>): ShapeElement {
  return {
    id: uuidv4(), type: 'shape',
    position: { x: 10, y: 10 },
    size: { width: 40, height: 20 },
    zIndex: 1, locked: false, visible: true,
    shape: 'rectangle',
    fill: 'transparent',
    stroke: '#000000',
    strokeWidth: 0.3,   // ≈ 1pt
    ...overrides,
  }
}
```

**ElementRenderer（SVG ベース — 印刷品質）:**

```tsx
case 'shape': {
  const el = element as ShapeElement
  const w = mmToPx(el.size.width) * scale
  const h = mmToPx(el.size.height) * scale
  const sw = mmToPx(el.strokeWidth) * scale
  const dashMap = { solid: 'none', dashed: `${sw * 4} ${sw * 2}`, dotted: `${sw} ${sw}` }
  const dash = dashMap[el.strokeDash ?? 'solid']

  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      {el.shape === 'rectangle' && (
        <rect
          x={sw / 2} y={sw / 2} width={w - sw} height={h - sw}
          rx={el.borderRadius ? mmToPx(el.borderRadius) * scale : 0}
          fill={el.fill} stroke={el.stroke} strokeWidth={sw} strokeDasharray={dash}
        />
      )}
      {el.shape === 'circle' && (
        <ellipse
          cx={w / 2} cy={h / 2} rx={(w - sw) / 2} ry={(h - sw) / 2}
          fill={el.fill} stroke={el.stroke} strokeWidth={sw} strokeDasharray={dash}
        />
      )}
      {el.shape === 'line' && (
        <line
          x1={0} y1={h / 2} x2={w} y2={h / 2}
          stroke={el.stroke} strokeWidth={sw} strokeDasharray={dash}
        />
      )}
    </svg>
  )
}
```

**注意:** `line` 要素は高さが無意味なので、size.height は固定で resizeHandle は横方向のみ有効にする（`resizableAxes: 'x-only'`）。

**ELEMENT_ALLOWED_KEYS:**

```ts
shape: new Set([
  'position', 'size', 'zIndex', 'visible', 'locked', 'name', 'visibilityRule', 'printable',
  'shape', 'fill', 'stroke', 'strokeWidth', 'borderRadius', 'lineAngle', 'strokeDash',
]),
```

**PropertiesPanel タブ:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, name |
| スタイル | fill（ColorInput）, stroke（ColorInput）, strokeWidth（PropInputUnit mm）, borderRadius, strokeDash |

---

### ImageElement（完全版）

```ts
export type ImageSource = 'base64' | 'url' | 'placeholder'

export interface ImageElement extends ElementBase {
  type: 'image'
  /** data:image/...;base64,... または https://... または '' (placeholder) */
  src: string
  alt: string
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  /** 画像ソースの種類（UI 表示分岐用）*/
  sourceType: ImageSource
  /** 不透明度（0–1）*/
  opacity?: number
}
```

**デフォルト値:**

```ts
export function createImageElement(overrides?: Partial<ImageElement>): ImageElement {
  return {
    id: uuidv4(), type: 'image',
    position: { x: 10, y: 10 },
    size: { width: 30, height: 30 },
    zIndex: 1, locked: false, visible: true,
    src: '',
    alt: '画像',
    objectFit: 'contain',
    sourceType: 'placeholder',
    opacity: 1,
    ...overrides,
  }
}
```

**アップロードフロー:**

```
① ユーザーが「画像を選択」ボタンをクリック
② <input type="file" accept="image/*"> を hidden 状態でトリガー
③ FileReader.readAsDataURL(file) で base64 変換
④ updateElement(pageId, id, { src: dataUrl, sourceType: 'base64', alt: file.name })
⑤ ElementRenderer に反映

URL 入力フロー:
① テキスト入力で URL を指定
② updateElement(pageId, id, { src: url, sourceType: 'url' })
③ img の onError で src='' にフォールバック → placeholder 表示
```

**ElementRenderer:**

```tsx
case 'image': {
  const el = element as ImageElement
  if (!el.src) {
    // Placeholder
    return (
      <div style={{ width: '100%', height: '100%', background: '#f0f0f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px dashed #ccc', color: '#999', fontSize: 10 * scale }}>
        📷 画像
      </div>
    )
  }
  return (
    <img
      src={el.src} alt={el.alt}
      style={{
        width: '100%', height: '100%',
        objectFit: el.objectFit,
        opacity: el.opacity ?? 1,
        display: 'block',
      }}
      onError={(e) => { (e.target as HTMLImageElement).src = '' }}
      draggable={false}
    />
  )
}
```

**セキュリティ注意:** base64 は XSS リスクがないが、URL 入力の場合は `javascript:` スキームを拒否する:

```ts
function sanitizeImageUrl(url: string): string {
  if (/^javascript:/i.test(url.trim())) return ''
  return url
}
```

**PropertiesPanel タブ:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, name |
| スタイル | objectFit（Select）, opacity（Slider 0–100%）|
| 画像 | ファイル選択ボタン / URL 入力 / Placeholder 表示 |

---

### DataFieldElement（完全版）

```ts
export interface DataFieldElement extends ElementBase {
  type: 'dataField'
  /** ドット記法 (例: 'customer.name', 'items[0].price') */
  fieldKey: string
  /** フォールバック表示テキスト（fieldKey が未設定 or 値が null の場合）*/
  fallbackText?: string
  /** 表示ラベル（帳票上の項目名。fieldKey の上部/左に添える）*/
  label?: string
  labelPosition?: 'top' | 'left' | 'none'  // default: 'none'
  /** undefined = defaultTextStyle から継承 */
  style: Partial<TextStyle>
  /** 値のフォーマット（数値・日付・和暦等）*/
  format?: CalculationFormat
  /** バインディング設定（Phase 2: より複雑な式）*/
  expression?: string
}
```

**resolveFieldValue の統合:**

```ts
// ElementRenderer 内
import { resolveField } from '@/lib/dataBinding'
import { applyFormat } from '@/lib/numberFormatter'

function renderDataFieldValue(el: DataFieldElement, data: Record<string, unknown>): string {
  const raw = resolveField(data, el.fieldKey)
  if (raw === undefined || raw === null) return el.fallbackText ?? ''
  if (el.format) return applyFormat(raw, el.format)
  return String(raw)
}
```

**ElementRenderer:**

```tsx
case 'dataField': {
  const el = element as DataFieldElement
  const resolved = mergeStyle(defaultTextStyle, el.style)
  const value = renderDataFieldValue(el, data ?? {})
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex',
      flexDirection: el.labelPosition === 'top' ? 'column' : 'row',
      alignItems: el.labelPosition === 'left' ? 'center' : 'flex-start' }}>
      {el.labelPosition !== 'none' && el.label && (
        <span style={{ fontSize: mmToPx(resolved.fontSize ?? 3.5) * scale * 0.8,
          color: '#666', whiteSpace: 'nowrap', paddingRight: 4 }}>
          {el.label}
        </span>
      )}
      <span style={{
        fontSize: mmToPx(resolved.fontSize ?? 3.5) * scale,
        fontFamily: resolved.fontFamily,
        fontWeight: resolved.fontWeight,
        color: resolved.color,
        writingMode: resolved.writingMode,
        overflow: 'hidden',
      }}>
        {value || <span style={{ color: '#ccc' }}>{el.fieldKey || 'フィールドキー未設定'}</span>}
      </span>
    </div>
  )
}
```

**PropertiesPanel タブ:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, name |
| スタイル | `StylePropertiesTab`（Partial<TextStyle>）|
| バインディング | fieldKey 入力（ドット記法）+ DataSourceNode ドロップ対象 + fallbackText |
| フォーマット | format.type（Select）+ decimalPlaces / customPattern |
| visibilityRule | 式エディタ |

**ELEMENT_ALLOWED_KEYS:**

```ts
dataField: new Set([
  'position', 'size', 'zIndex', 'visible', 'locked', 'name', 'visibilityRule', 'printable',
  'fieldKey', 'fallbackText', 'label', 'labelPosition', 'style', 'format', 'expression',
]),
```

---

### TableElement（完全版）

```ts
export interface TableCell {
  content: string          // リテラル or {{token}}
  style?: Partial<TextStyle>
  /** 列スパン（未実装: Phase 3）*/
  colSpan?: number
  /** 行スパン（未実装: Phase 3）*/
  rowSpan?: number
}

export interface TableColumn {
  id: string
  /** 表示ヘッダーテキスト */
  header: string
  /** 列幅（mm）。合計が TableElement.size.width と一致するよう正規化 */
  width: number
  /** Phase 2: データソースフィールドへのバインディング */
  fieldKey?: string
  headerStyle?: Partial<TextStyle>
  cellStyle?: Partial<TextStyle>
  /** 値フォーマット（数値・日付）*/
  format?: CalculationFormat
}

export interface TableElement extends ElementBase {
  type: 'table'
  columns: TableColumn[]
  rows: TableCell[][]       // rows[rowIndex][colIndex]
  /** ヘッダー行を表示するか */
  headerVisible: boolean
  /** 行の交互背景色 */
  stripedRows: boolean
  /** 奇数行背景色 */
  rowOddBackground?: string
  /** 偶数行背景色 */
  rowEvenBackground?: string
  /** セル枠線 */
  borderColor: string
  borderWidth: number      // mm
  /** Phase 2: データバインディング設定 */
  dataBinding?: string
}
```

**デフォルト値（3列2行の空テーブル）:**

```ts
export function createTableElement(overrides?: Partial<TableElement>): TableElement {
  const defaultCols: TableColumn[] = [
    { id: uuidv4(), header: '列1', width: 20 },
    { id: uuidv4(), header: '列2', width: 20 },
    { id: uuidv4(), header: '列3', width: 20 },
  ]
  const emptyRow: TableCell[] = defaultCols.map(() => ({ content: '' }))
  return {
    id: uuidv4(), type: 'table',
    position: { x: 10, y: 20 },
    size: { width: 60, height: 30 },
    zIndex: 1, locked: false, visible: true,
    columns: defaultCols,
    rows: [emptyRow, emptyRow],
    headerVisible: true,
    stripedRows: false,
    borderColor: '#000000',
    borderWidth: 0.3,
    ...overrides,
  }
}
```

**ElementRenderer（Phase 1: 静的テーブル）:**

```tsx
case 'table': {
  const el = element as TableElement
  const totalW = el.columns.reduce((s, c) => s + c.width, 0)
  const bw = mmToPx(el.borderWidth) * scale
  return (
    <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse',
      tableLayout: 'fixed', fontSize: mmToPx(3.5) * scale }}>
      {el.headerVisible && (
        <thead>
          <tr>
            {el.columns.map(col => (
              <th key={col.id}
                style={{ width: `${(col.width / totalW) * 100}%`,
                  border: `${bw}px solid ${el.borderColor}`,
                  padding: `${2 * scale}px`, ...textStyleToCss(col.headerStyle ?? {}, defaultTextStyle, scale) }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {el.rows.map((row, ri) => (
          <tr key={ri} style={{ background: el.stripedRows
            ? (ri % 2 === 0 ? el.rowOddBackground : el.rowEvenBackground)
            : undefined }}>
            {row.map((cell, ci) => (
              <td key={ci}
                style={{ border: `${bw}px solid ${el.borderColor}`,
                  padding: `${2 * scale}px`, overflow: 'hidden',
                  ...textStyleToCss(cell.style ?? {}, defaultTextStyle, scale) }}>
                {interpolate(cell.content, data ?? {})}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

**PropertiesPanel タブ（Phase 1）:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, name |
| テーブル | 列追加/削除、列幅調整（スライダー）、ヘッダー表示切替、行追加/削除 |
| スタイル | borderColor, borderWidth, stripedRows, rowOddBackground |
| バインディング（Phase 2 stub）| dataBinding（プレースホルダー表示）|

**ELEMENT_ALLOWED_KEYS:**

```ts
table: new Set([
  'position', 'size', 'zIndex', 'visible', 'locked', 'name', 'visibilityRule', 'printable',
  'columns', 'rows', 'headerVisible', 'stripedRows', 'rowOddBackground', 'rowEvenBackground',
  'borderColor', 'borderWidth', 'dataBinding',
]),
```

---

### ChartElement（Phase 1: スタブ）

```ts
export type ChartKind = 'bar' | 'line' | 'pie' | 'donut'

export interface ChartDataset {
  label: string
  data: number[]
  color?: string
}

export interface ChartElement extends ElementBase {
  type: 'chart'
  chartType: ChartKind
  title?: string
  /** Phase 1: 静的データ（手動入力）*/
  labels: string[]         // 横軸ラベル / pie のスライスラベル
  datasets: ChartDataset[]
  /** Phase 2: データバインディング */
  dataBinding?: string
  labelFieldKey?: string
  valueFieldKey?: string
}
```

**デフォルト値（Phase 1: サンプルデータ付き）:**

```ts
export function createChartElement(overrides?: Partial<ChartElement>): ChartElement {
  return {
    id: uuidv4(), type: 'chart',
    position: { x: 10, y: 10 },
    size: { width: 80, height: 50 },
    zIndex: 1, locked: false, visible: true,
    chartType: 'bar',
    title: 'グラフ',
    labels: ['1月', '2月', '3月'],
    datasets: [{ label: 'データ', data: [10, 20, 15], color: '#4f46e5' }],
    ...overrides,
  }
}
```

**ElementRenderer（recharts 使用）:**

```tsx
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
         XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

case 'chart': {
  const el = element as ChartElement
  const chartData = el.labels.map((label, i) => ({
    name: label,
    ...Object.fromEntries(el.datasets.map(d => [d.label, d.data[i] ?? 0])),
  }))
  const w = mmToPx(el.size.width) * scale
  const h = mmToPx(el.size.height) * scale

  if (el.chartType === 'bar') {
    return (
      <ResponsiveContainer width={w} height={h}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 * scale }} />
          <YAxis tick={{ fontSize: 10 * scale }} />
          {el.datasets.map(d => (
            <Bar key={d.label} dataKey={d.label} fill={d.color ?? '#4f46e5'} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }
  // line / pie / donut は同様のパターンで実装
  return <div style={{ ... }}>グラフプレースホルダー</div>
}
```

**recharts の印刷注意:** `html2canvas` は SVG 内の `foreignObject` を正しくレンダリングしない場合がある。PDF エクスポート時は `chart-to-image` アプローチ（recharts の `toBase64Image()` API）で先に PNG 化する。

---

### ManualEntryField

法定帳票の手書き/デジタル入力欄。フォーム記入者がペンや入力デバイスで埋める空白フィールド。

```ts
export type ManualEntryDisplayMode = 'line' | 'box' | 'grid' | 'none'

export interface ManualEntryField extends ElementBase {
  type: 'manualEntry'
  /** 項目名ラベル（帳票上部/左側に表示）*/
  label: string
  labelPosition: 'top' | 'left' | 'none'
  /** 表示形式 */
  displayMode: ManualEntryDisplayMode
  /** 入力欄の罫線色 */
  lineColor: string
  /** 文字数に合わせたマス目分割（grid モード時）*/
  gridCount?: number
  /** プレースホルダーテキスト（エディタ上での表示のみ。印刷時は空白）*/
  placeholder?: string
  /** Phase 3: バリデーション制約 */
  constraint?: FieldConstraint
  style: Partial<TextStyle>
}

export type FieldConstraint = {
  required?: boolean
  maxLength?: number
  minLength?: number
  pattern?: string      // 正規表現
  inputType?: 'text' | 'number' | 'date' | 'phone' | 'postal_code'
}
```

**表示モードの見た目:**

| displayMode | 見た目 | 典型ユースケース |
|---|---|---|
| `line` | 下線のみ（ _________ ）| 氏名・住所欄 |
| `box` | 矩形ボーダー（□□□□□）| 記号・コード入力欄 |
| `grid` | マス目（n 文字分）| 郵便番号・マイナンバー |
| `none` | 空白領域のみ | 自由記述欄 |

**デフォルト値:**

```ts
export function createManualEntryField(overrides?: Partial<ManualEntryField>): ManualEntryField {
  return {
    id: uuidv4(), type: 'manualEntry',
    position: { x: 10, y: 10 },
    size: { width: 60, height: 8 },
    zIndex: 1, locked: false, visible: true,
    label: '記入欄',
    labelPosition: 'top',
    displayMode: 'line',
    lineColor: '#000000',
    placeholder: '（記入）',
    style: {},
    ...overrides,
  }
}
```

**ElementRenderer:**

```tsx
case 'manualEntry': {
  const el = element as ManualEntryField
  const w = mmToPx(el.size.width) * scale
  const h = mmToPx(el.size.height) * scale
  const lc = el.lineColor
  const bw = 0.3 * scale // 0.3mm default border

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex',
      flexDirection: el.labelPosition === 'top' ? 'column' : 'row',
      gap: 2 * scale }}>
      {el.labelPosition !== 'none' && (
        <span style={{ fontSize: mmToPx(3) * scale, color: '#333', whiteSpace: 'nowrap' }}>
          {el.label}
        </span>
      )}
      <div style={{ flex: 1, position: 'relative',
        borderBottom: el.displayMode === 'line' ? `${bw}px solid ${lc}` : undefined,
        border: el.displayMode === 'box' ? `${bw}px solid ${lc}` : undefined,
      }}>
        {el.displayMode === 'grid' && el.gridCount && (
          // グリッドマス目をSVGで描画
          <svg width="100%" height="100%">
            {Array.from({ length: el.gridCount - 1 }, (_, i) => (
              <line key={i}
                x1={`${((i + 1) / el.gridCount!) * 100}%`} y1={0}
                x2={`${((i + 1) / el.gridCount!) * 100}%`} y2="100%"
                stroke={lc} strokeWidth={bw} />
            ))}
            <rect x={bw/2} y={bw/2} width={`calc(100% - ${bw}px)`} height={`calc(100% - ${bw}px)`}
              fill="none" stroke={lc} strokeWidth={bw} />
          </svg>
        )}
        {!readonly && el.placeholder && (
          <span style={{ position: 'absolute', top: 2, left: 4,
            fontSize: mmToPx(2.8) * scale, color: '#bbb', pointerEvents: 'none' }}>
            {el.placeholder}
          </span>
        )}
      </div>
    </div>
  )
}
```

**PropertiesPanel タブ:**

| タブ | 内容 |
|---|---|
| 基本 | position x/y, size w/h, zIndex, name |
| スタイル | `StylePropertiesTab`（Partial<TextStyle>）+ lineColor + displayMode |
| 制約（Phase 3 stub）| required, maxLength, inputType（プレースホルダー表示）|

---

### ElementFactory 一覧

```ts
// src/lib/elementFactories.ts（既存ファイルを拡張）
export {
  createTextElement,
  createLabelElement,
  createImageElement,
  createShapeElement,
  createDataFieldElement,
  createManualEntryField,
  createHankoElement,
  createTableElement,
  createChartElement,
}

// PaletteItem の元データ（ElementPalette.tsx で使用）
export const PALETTE_ITEMS: PaletteItemDef[] = [
  // テキスト系
  { type: 'text',       label: 'テキスト',     category: 'text',    icon: 'T',    factory: createTextElement },
  { type: 'label',      label: 'ラベル',       category: 'text',    icon: 'Aa',   factory: createLabelElement },
  { type: 'dataField',  label: 'データフィールド', category: 'data', icon: '⬡', factory: createDataFieldElement },
  // 図形系
  { type: 'shape',      label: '矩形',         category: 'shape',   icon: '□',   factory: () => createShapeElement({ shape: 'rectangle' }) },
  { type: 'shape',      label: '円',           category: 'shape',   icon: '○',   factory: () => createShapeElement({ shape: 'circle' }) },
  { type: 'shape',      label: '線',           category: 'shape',   icon: '—',   factory: () => createShapeElement({ shape: 'line', size: { width: 40, height: 0.5 } }) },
  // 入力系
  { type: 'manualEntry', label: '記入欄',      category: 'input',   icon: '✏️',  factory: createManualEntryField },
  { type: 'hanko',      label: '印鑑',         category: 'input',   icon: '◎',   factory: createHankoElement },
  // 複合系
  { type: 'table',      label: 'テーブル',     category: 'complex', icon: '⊞',   factory: createTableElement },
  { type: 'image',      label: '画像',         category: 'complex', icon: '🖼',  factory: createImageElement },
  { type: 'chart',      label: 'グラフ',       category: 'complex', icon: '📊',  factory: createChartElement },
]
```

---

### ElementRenderer 完全 switch 設計

```tsx
// src/components/canvas/ElementRenderer.tsx
interface ElementRendererProps {
  element: ReportElement
  /** レンダリングスケール（ズーム率）*/
  scale: number
  /** データソースのフィールド値（DataFieldElement / TextElement のトークン解決に使用）*/
  data?: Record<string, unknown>
  /** プレビューモードか（true = インタラクション無効）*/
  readonly?: boolean
  /** CSS inherit モデルのルートスタイル */
  defaultTextStyle: TextStyle
}

export function ElementRenderer({ element, scale, data, readonly, defaultTextStyle }: ElementRendererProps) {
  if (!element.visible && readonly) return null
  if (!element.printable && readonly) return null

  switch (element.type) {
    case 'text':       return <TextRenderer ... />
    case 'label':      return <LabelRenderer ... />
    case 'image':      return <ImageRenderer ... />
    case 'shape':      return <ShapeRenderer ... />
    case 'dataField':  return <DataFieldRenderer ... />
    case 'manualEntry': return <ManualEntryRenderer ... />
    case 'hanko':      return <HankoRenderer ... />
    case 'table':      return <TableRenderer ... />
    case 'chart':      return <ChartRenderer ... />
    default:
      return <div style={{ color: 'red', fontSize: 10 }}>Unknown: {(element as ElementBase).type}</div>
  }
}
```

**各 Renderer を独立ファイルに分割:**

```
src/components/canvas/renderers/
  TextRenderer.tsx
  LabelRenderer.tsx
  ImageRenderer.tsx
  ShapeRenderer.tsx
  DataFieldRenderer.tsx
  ManualEntryRenderer.tsx
  HankoRenderer.tsx
  TableRenderer.tsx
  ChartRenderer.tsx
```

**`mergeStyle` ユーティリティ（textStyleUtils.ts）:**

```ts
// undefined プロパティを defaultStyle で埋める（CSS inherit の JS 実装）
export function mergeStyle(defaultStyle: TextStyle, override: Partial<TextStyle>): TextStyle {
  return {
    ...defaultStyle,
    ...Object.fromEntries(
      Object.entries(override).filter(([, v]) => v !== undefined)
    ),
  } as TextStyle
}

// TextStyle → React style オブジェクト変換（scale 適用）
export function textStyleToCss(style: Partial<TextStyle>, defaultStyle: TextStyle, scale: number): React.CSSProperties {
  const merged = mergeStyle(defaultStyle, style)
  return {
    fontSize: mmToPx(merged.fontSize ?? 3.5) * scale,
    fontFamily: merged.fontFamily,
    fontWeight: merged.fontWeight,
    fontStyle: merged.fontStyle,
    textDecoration: merged.textDecoration,
    color: merged.color,
    backgroundColor: merged.backgroundColor,
    textAlign: merged.textAlign as React.CSSProperties['textAlign'],
    letterSpacing: merged.letterSpacing != null ? `${merged.letterSpacing}em` : undefined,
    lineHeight: merged.lineHeight,
    writingMode: merged.writingMode as React.CSSProperties['writingMode'],
    paddingTop: merged.paddingTop != null ? mmToPx(merged.paddingTop) * scale : undefined,
    paddingRight: merged.paddingRight != null ? mmToPx(merged.paddingRight) * scale : undefined,
    paddingBottom: merged.paddingBottom != null ? mmToPx(merged.paddingBottom) * scale : undefined,
    paddingLeft: merged.paddingLeft != null ? mmToPx(merged.paddingLeft) * scale : undefined,
  }
}
```

---

### visibilityRule の評価タイミング

```
① ElementRenderer がマウント / data 変更時
② calculationEngine.evaluateExpression(el.visibilityRule, context) を呼ぶ
③ falsy な場合:
   - 編集モード: 要素を半透明（opacity: 0.3）で表示 + 「非表示条件中」バッジ
   - プレビューモード: 完全に非表示（return null）
   - 印刷/PDF: 完全に非表示
④ 循環依存や評価エラー: visible 扱い（安全側）+ コンソール警告
```

---

### CanvasElement / PropertiesPanel との接続

```
CanvasElement
 ├─ useDraggable(@dnd-kit) — locked=true の場合 disabled
 ├─ ResizeHandles — locked=true の場合 非表示
 ├─ ダブルクリック → type='text' の場合 enterEditMode()
 └─ ElementRenderer（scale=zoom, data=dataSource.fields）

PropertiesPanel
 ├─ selectedElements[0].type でタブ構成を決定
 ├─ 多選択時 → 共通項目（position/size/zIndex）のみ表示
 └─ 各タブ → store.updateElement(pageId, id, patch) を呼ぶ
```

---

### テスト戦略

```
src/lib/
  elementFactories.test.ts  → 全 factory のデフォルト値検証
  textStyleUtils.test.ts    → mergeStyle / textStyleToCss
  dataBinding.test.ts       → resolveField + interpolate（既存）

src/components/canvas/renderers/
  ShapeRenderer.test.tsx    → SVG 出力の構造確認
  DataFieldRenderer.test.tsx → resolveField + format 結合
  ManualEntryRenderer.test.tsx → displayMode 別レンダリング
  TableRenderer.test.tsx    → headerVisible / stripedRows / interpolate 確認
```

**Storybook Story 一覧（ElementRenderer）:**

| Story | 説明 |
|---|---|
| `TextElement/Default` | デフォルトスタイル継承 |
| `TextElement/WithToken` | `{{customer.name}}` トークンを含む |
| `TextElement/Vertical` | writingMode='vertical-rl' |
| `LabelElement/Default` | 静的ラベル |
| `ShapeElement/Rectangle` | 矩形 fill + stroke |
| `ShapeElement/Circle` | 円 |
| `ShapeElement/Line` | 水平線 / 破線 |
| `ImageElement/WithSrc` | base64 画像 |
| `ImageElement/Placeholder` | src='' のプレースホルダー |
| `DataFieldElement/Resolved` | data から値を解決 |
| `DataFieldElement/Fallback` | fieldKey なし → fallbackText |
| `DataFieldElement/Formatted` | format='wareki_full' |
| `ManualEntryField/Line` | 下線スタイル |
| `ManualEntryField/Grid` | マス目（7文字）|
| `HankoElement/Circle` | 円形二重枠 |
| `TableElement/Static` | 静的3列2行 |
| `TableElement/WithTokens` | セル内 {{token}} 解決 |
| `ChartElement/Bar` | 棒グラフサンプル |

---

## 法定帳票・業務帳票・証明書 要件適合調査

### 調査対象ドキュメント

| カテゴリ | 具体例 |
|---|---|
| 法定帳票 | 源泉徴収票, 給与明細書, 領収書, 適格請求書（インボイス）|
| 一般業務帳票 | 請求書, 見積書, 注文書, 納品書 |
| 証明書 | 在職証明書, 住民票, 卒業証明書 |

---

### 適合マトリクス（現設計との照合）

| 要件 | 現設計での対応 | ギャップ |
|---|---|---|
| 固定グリッドレイアウト（源泉徴収票）| Section + AbsoluteLayout でセル配置 | ✅ 対応可能 |
| 明細テーブル（請求書・納品書）| `TableElement` | ✅ 対応可能 |
| テキスト・ラベル | `TextElement` / `LabelElement` | ✅ 対応可能 |
| ロゴ・印鑑画像 | `ImageElement` | ✅ 部分対応 |
| 罫線・ボーダー | `ShapeElement`（rectangle/line）| ✅ 対応可能 |
| 和暦日付フィールド | `CalculationFormat.type='wareki_full'` | ✅ 実装済み |
| 縦書き | `TextStyle.writingMode='vertical-rl'` | ✅ 実装済み |
| 単一印鑑欄（角印/代表者印）| `HankoElement` | ✅ 対応可能 |
| インボイス登録番号（T番号）| `DataFieldElement` or `LabelElement` | ✅ データとして対応可能 |
| 証明文ブロック（在職証明書等）| `LabelElement`（複数行）| ✅ 対応可能 |
| 備考欄・摘要欄 | `TextElement` / `ManualEntryField` | ✅ 対応可能 |
| **多段印鑑欄（担当→部長→社長）**| **未対応**（HankoElement は単体のみ）| 🔴 **ギャップ** |
| **収入印紙貼付欄**（印紙税 ≥¥5万）| **未対応**（ShapeElement で代替は困難）| 🔴 **ギャップ** |
| **税率区分表**（8%/10% 分離）| `TableElement` で手動構築は可能だが… | 🟡 **機能ギャップ**（自動化なし）|
| **QRコード / バーコード** | **未対応**（住民票・納品書等で必要）| 🔴 **ギャップ** |
| **ふりがな欄** | **未対応**（TextElement の親子概念がない）| 🟡 **ギャップ** |
| **大字（漢数字）表記**（壱百万円也）| **未対応**（CalculationFormat に未追加）| 🟡 **ギャップ** |
| **宛名敬称**（御中/様/殿）| `TextElement` の suffix として手動追加は可能 | 🟡 **UX ギャップ** |
| **受領印欄**（納品書の受領確認）| `HankoElement` で代替可能 | 🟢 HankoElement で対応 |
| **振込先口座ブロック** | 複数 `LabelElement` + `DataFieldElement` で構築可能 | 🟢 対応可能（専用型は不要）|
| **地紋（偽造防止背景パターン）** | PageSettings に background プロパティ追加が必要 | 🟡 ページ設定ギャップ |
| **エンボス印** | `HankoElement` のバリアントとして追加可能 | 🟢 HankoElement 拡張で対応 |
| **両者押印エリア** | 2 × `HankoElement` を横並びで配置 | 🟢 対応可能 |
| **軽減税率マーカー（※）** | `TableColumn` に `taxRate: 8\|10\|null` 追加が必要 | 🟡 テーブル機能ギャップ |

---

### 重要ギャップ 詳細

#### 🔴 ギャップ 1: QRコード / バーコード（`BarcodeElement`）

**必要な帳票:** 住民票, 資格確認書, 現代の請求書（電子インボイス連携）, 現場管理帳票

```ts
export type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13' | 'datamatrix'

export interface BarcodeElement extends ElementBase {
  type: 'barcode'
  kind: BarcodeKind
  /** エンコードする値（テキスト or {{token}}）*/
  value: string
  /** エラー訂正レベル（QR のみ）*/
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
  /** バーカラー */
  darkColor?: string
  /** 背景色 */
  lightColor?: string
  /** 値をバーコードの下に表示するか（1D バーコード用）*/
  showText?: boolean
  /** 静音ゾーン（mm）*/
  quietZone?: number
}
```

**レンダリングライブラリ候補:**
- `qrcode.react`（QR 専用、React コンポーネント、軽量）
- `react-barcode`（Code128 等の 1D バーコード）
- `bwip-js`（多形式対応、重い）

**推奨:** Phase 1 では `qrcode.react` + `react-barcode` の2ライブラリで QR + Code128 をカバー。その他形式は Phase 2。

```tsx
case 'barcode': {
  const el = element as BarcodeElement
  const resolvedValue = interpolate(el.value, data ?? {})
  const w = mmToPx(el.size.width) * scale
  const h = mmToPx(el.size.height) * scale

  if (el.kind === 'qr') {
    return (
      <QRCodeSVG
        value={resolvedValue || ' '}
        size={Math.min(w, h)}
        fgColor={el.darkColor ?? '#000000'}
        bgColor={el.lightColor ?? '#ffffff'}
        level={el.errorCorrection ?? 'M'}
      />
    )
  }
  if (el.kind === 'code128') {
    return (
      <Barcode
        value={resolvedValue || '0'}
        width={1} height={h * 0.8}
        displayValue={el.showText ?? true}
        lineColor={el.darkColor ?? '#000000'}
        background={el.lightColor ?? '#ffffff'}
      />
    )
  }
  return <div>未対応バーコード形式: {el.kind}</div>
}
```

---

#### 🔴 ギャップ 2: 多段印鑑欄（`ApprovalStampRowElement`）

**必要な帳票:** 請求書, 見積書, 注文書（社内ルーティング用）

法定要件ではないが、日本の B2B 帳票の **事実上の標準レイアウト**。3〜5個の連続した印鑑ボックスが横一列に並び、各ボックスの上部/下部にロール名（担当・係長・課長・部長・社長）が印刷される。

```ts
export interface ApprovalStampCell {
  /** 役職名（ボックスのラベル）*/
  role: string
  /** 事前に押印済みの画像 URL（電子印鑑）*/
  stampSrc?: string
  /** ボックスの幅（mm）*/
  width: number
}

export interface ApprovalStampRowElement extends ElementBase {
  type: 'approvalStampRow'
  cells: ApprovalStampCell[]
  /** ラベルの位置 */
  labelPosition: 'top' | 'bottom'
  /** 枠線色 */
  borderColor: string
  borderWidth: number
  /** 各セルの高さ（mm）*/
  cellHeight: number
}
```

**デフォルト値（5段）:**

```ts
export function createApprovalStampRowElement(): ApprovalStampRowElement {
  return {
    id: uuidv4(), type: 'approvalStampRow',
    position: { x: 10, y: 10 },
    size: { width: 75, height: 20 },  // 5 × 15mm
    zIndex: 1, locked: false, visible: true,
    cells: [
      { role: '担当', width: 15 },
      { role: '係長', width: 15 },
      { role: '課長', width: 15 },
      { role: '部長', width: 15 },
      { role: '社長', width: 15 },
    ],
    labelPosition: 'bottom',
    borderColor: '#000000',
    borderWidth: 0.3,
    cellHeight: 15,
  }
}
```

**ElementRenderer:**

```tsx
case 'approvalStampRow': {
  const el = element as ApprovalStampRowElement
  const bw = mmToPx(el.borderWidth) * scale
  const labelH = mmToPx(4) * scale

  return (
    <div style={{ display: 'flex', height: '100%',
      border: `${bw}px solid ${el.borderColor}` }}>
      {el.cells.map((cell, i) => {
        const cw = mmToPx(cell.width) * scale
        return (
          <div key={i} style={{ width: cw, display: 'flex', flexDirection: 'column',
            borderRight: i < el.cells.length - 1
              ? `${bw}px solid ${el.borderColor}` : undefined }}>
            {el.labelPosition === 'top' && (
              <div style={{ height: labelH, fontSize: 8 * scale, textAlign: 'center',
                borderBottom: `${bw}px solid ${el.borderColor}`, display: 'flex',
                alignItems: 'center', justifyContent: 'center' }}>
                {cell.role}
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cell.stampSrc && (
                <img src={cell.stampSrc}
                  style={{ maxWidth: '80%', maxHeight: '80%', opacity: 0.85 }} />
              )}
            </div>
            {el.labelPosition === 'bottom' && (
              <div style={{ height: labelH, fontSize: 8 * scale, textAlign: 'center',
                borderTop: `${bw}px solid ${el.borderColor}`, display: 'flex',
                alignItems: 'center', justifyContent: 'center' }}>
                {cell.role}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

---

#### 🔴 ギャップ 3: 収入印紙貼付欄（`RevenueStampElement`）

**必要な帳票:** 領収書（¥50,000以上）, 請負契約書

印紙税法上の切手状印紙（収入印紙）を貼付するための専用ゾーン。単純な矩形とは異なり、「収入印紙」というラベル・「消印欄」（印紙と書類を跨ぐキャンセル印のガイドライン）の構造を持つ。

```ts
export interface RevenueStampElement extends ElementBase {
  type: 'revenueStamp'
  /** 印紙面金額表示（例: '200円', '400円'）*/
  amount?: string
  borderColor: string
  borderWidth: number
  showLabel: boolean
  /** 消印ガイドラインを表示するか（斜線）*/
  showCancellationGuide: boolean
}
```

**デフォルトサイズ:** 40mm × 25mm（実際の収入印紙 40 × 27mm に準拠）

```tsx
case 'revenueStamp': {
  const el = element as RevenueStampElement
  const w = mmToPx(el.size.width) * scale
  const h = mmToPx(el.size.height) * scale
  const bw = mmToPx(el.borderWidth) * scale

  return (
    <div style={{ width: w, height: h, border: `${bw}px solid ${el.borderColor}`,
      position: 'relative', backgroundColor: '#fafafa' }}>
      {el.showLabel && (
        <span style={{ position: 'absolute', top: 2, left: 4,
          fontSize: 8 * scale, color: '#666', letterSpacing: 1 }}>
          収入印紙
        </span>
      )}
      {el.amount && (
        <span style={{ position: 'absolute', bottom: 2, right: 4,
          fontSize: 8 * scale, color: '#888' }}>
          {el.amount}
        </span>
      )}
      {el.showCancellationGuide && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <line x1="50%" y1="0" x2="50%" y2="100%"
            stroke="#ccc" strokeWidth={1} strokeDasharray="4 3" />
        </svg>
      )}
    </div>
  )
}
```

---

### 機能ギャップ 詳細

#### 🟡 機能ギャップ A: 大字（漢数字）表記

**必要な帳票:** 小切手, 正式契約書, 一部の公式領収書

`CalculationFormat.type` に `'kanji_numeral'` を追加し、`numberFormatter.ts` に変換関数を実装する。

```ts
export type NumberFormatType =
  | 'integer' | 'decimal' | 'currency_jpy' | 'currency_usd'
  | 'percent' | 'comma'
  | 'kanji_numeral'  // 追加: 例 → 金壱百万円也
  | 'custom'

// numberFormatter.ts
export function toKanjiNumeral(amount: number): string {
  // 例: 1050000 → "金壱百五拾万円也"
  const DAIJI = ['', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九']
  const UNITS = ['', '拾', '百', '千']
  const BIG_UNITS = ['', '万', '億', '兆']
  // ... 変換ロジック
  return `金${result}円也`
}
```

---

#### 🟡 機能ギャップ B: 軽減税率マーカー（TableColumn）

**必要な帳票:** 適格請求書（インボイス）

`TableColumn` に `taxRate` フィールドを追加し、レンダリング時に ※ マーカーを自動付与する。

```ts
export interface TableColumn {
  // ... 既存フィールド
  /** 消費税率（null = 非課税 / 不明）*/
  taxRate?: 8 | 10 | null
  taxRateMarkerPosition?: 'prefix' | 'suffix' | 'none'
}
```

---

#### 🟡 機能ギャップ C: ふりがな欄

**必要な帳票:** 申込書, 一部の証明書, 名前フォーム

`TextElement` / `ManualEntryField` に `furigana` サブフィールドを追加し、`<ruby>` タグで上部にふりがなを表示する。

```ts
interface TextElement extends ElementBase {
  // ...
  furigana?: string          // ふりがな文字列
  furiganaScale?: number     // フォントサイズ倍率（デフォルト: 0.5）
}
```

```tsx
// ElementRenderer
{el.furigana ? (
  <ruby>
    {el.content}
    <rt style={{ fontSize: `${(el.furiganaScale ?? 0.5) * 100}%` }}>
      {el.furigana}
    </rt>
  </ruby>
) : el.content}
```

---

#### 🟡 機能ギャップ D: 地紋（セキュリティ背景パターン）

**必要な帳票:** 住民票, 公的証明書

`Section` の背景プロパティとして追加（一部 Section のみ地紋 ON が必要なケースに対応）。

```ts
export interface Section {
  // ... 既存
  backgroundPattern?: {
    type: 'none' | 'diagonal_lines' | 'grid' | 'dots' | 'copy_guard'
    color?: string        // 地紋色（薄いグレーが典型）
    opacity?: number      // 0–1
    density?: 'light' | 'medium' | 'heavy'
  }
}
```

---

### 修正後の ElementType 完全リスト

```ts
export type ElementType =
  // テキスト系
  | 'text'
  | 'label'
  // データ表示系
  | 'dataField'
  | 'table'
  | 'chart'
  // 図形・画像系
  | 'shape'
  | 'image'
  | 'barcode'
  // 入力系
  | 'manualEntry'
  // 日本固有
  | 'hanko'
  | 'approvalStampRow'
  | 'revenueStamp'
  // 繰り返し系（Phase 2）
  | 'repeatingBand'   // コレクションを行として縦繰り返し（Detail Band）
  | 'repeatingList'   // コレクションをカードとして縦/横/グリッドに繰り返し
```

---

### 修正後の PALETTE_ITEMS カテゴリ

```ts
export const PALETTE_CATEGORIES = [
  { category: 'text',      label: 'テキスト系',     items: ['text', 'label', 'dataField'] },
  { category: 'shape',     label: '図形・画像',     items: ['shape:rect', 'shape:circle', 'shape:line', 'image'] },
  { category: 'repeating', label: '繰り返し要素',   items: ['repeatingBand', 'repeatingList'] },  // Phase 2
  { category: 'data',      label: 'データ表示',     items: ['table', 'chart', 'barcode:qr', 'barcode:code128'] },
  { category: 'input',     label: '記入・入力',     items: ['manualEntry'] },
  { category: 'japanese',  label: '日本語帳票専用', items: ['hanko', 'approvalStampRow', 'revenueStamp'] },
]
```

---

### Phase 対応表（修正版）

| ElementType | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `text` | ✅ 完全実装 | — | — |
| `label` | ✅ 完全実装 | — | — |
| `image` | ✅ 完全実装 | — | — |
| `shape` | ✅ 完全実装 | — | — |
| `dataField` | ✅ 完全実装 | format 追加 | — |
| `manualEntry` | ✅ 型定義 + 基本レンダリング | — | constraint 実装 |
| `hanko` | ✅ 完全実装 | エンボス variant | — |
| `barcode` | ✅ QR + Code128 | 多形式対応 | — |
| `approvalStampRow` | ✅ 完全実装 | — | — |
| `revenueStamp` | ✅ 完全実装 | — | — |
| `table` | ✅ 静的テーブル | データバインディング, taxRate | セル結合 |
| `chart` | スタブ | 完全実装 | — |
| `repeatingBand` | UIモック・型定義・ElementRenderer プレビュー | 完全実装（ページング・グループ化）| — |
| `repeatingList` | UIモック・型定義・ElementRenderer プレビュー | 完全実装（カードテンプレートエディタ）| — |

---

### 調査まとめ: 設計変更点

| 変更 | 内容 | Priority |
|---|---|---|
| `ElementType` に 3型追加 | `barcode`, `approvalStampRow`, `revenueStamp` | P1 必須 |
| `BarcodeElement` 型定義・Renderer | qrcode.react + react-barcode | P1 必須 |
| `ApprovalStampRowElement` 型定義・Renderer | 多段印鑑欄 | P1 必須 |
| `RevenueStampElement` 型定義・Renderer | 収入印紙貼付欄 | P1 必須 |
| `NumberFormatType` に `kanji_numeral` 追加 | 大字変換関数 | P1 推奨 |
| `TableColumn.taxRate` 追加 | 軽減税率マーカー ※ | P1 推奨 |
| `TextElement.furigana` 追加 | ruby タグレンダリング | P1 推奨 |
| `Section.backgroundPattern` 追加 | 地紋（セキュリティ背景）| P2 |
| `CalculationRule` による税率区分表集計 | 8%/10% 自動小計 | P2 |

---

## 繰り返し要素 詳細設計（Phase 2）

> 2026-04-05 追加。UIモック・型定義・ElementRenderer プレビューは Phase 1 で先行実装済み。
> 完全動作（実際のデータバインディング・レンダリング）は Phase 2 で実装する。

### 設計背景・ユースケース

法定帳票・業務帳票では「データソースのコレクション（配列）をテンプレートで繰り返す」要件が頻出する。
FastReport の Detail Band / SSRS の Tablix / JasperReports の Detail Band に相当する機能。

| ユースケース | 適用要素 |
|---|---|
| 明細行一覧（注文書・請求書・給与明細） | `repeatingBand` |
| 勤怠ログ・稼働時間集計 | `repeatingBand` |
| 社員名簿・連絡先カード | `repeatingList` |
| 商品カタログ（画像+情報）| `repeatingList` |
| 組織図・部署別一覧 | `repeatingList` |
| IDカード・バッジ印刷 | `repeatingList` |

---

### RepeatingBandElement（Detail Band）

**コンセプト:** コレクションの各レコードを **1行（水平方向）** として縦に繰り返す。ヘッダー行・集計フッター行を持ち、ストライプ表示・ソート・グループ化をサポートする。

```
┌─────┬───────────────┬────┬────┬──────┬────────┐  ← ヘッダー行（showHeader=true）
│ No. │ 品目          │数量│単位│ 単価 │  金額  │
├─────┼───────────────┼────┼────┼──────┼────────┤
│  1  │ 給与収入      │ 12 │ 月 │250,000│3,000,000│  } itemHeight ごとに
├─────┼───────────────┼────┼────┼──────┼────────┤  } dataSource 件数分繰り返す
│  2  │ 交通費        │ 12 │ 月 │ 30,000│ 360,000│  } （奇数行: oddRowColor）
├─────┼───────────────┼────┼────┼──────┼────────┤  } （偶数行: evenRowColor）
│ ... │ ...           │ ...│ ...│  ... │    ... │
├─────┼───────────────┼────┼────┼──────┼────────┤
│     │ 合計          │    │    │      │3,600,000│  ← フッター行（showFooter=true・totals）
└─────┴───────────────┴────┴────┴──────┴────────┘
```

**型定義:**

```ts
export interface RepeatingBandField {
  key: string                    // データソースのフィールドキー
  label: string                  // ヘッダー表示名
  width: number                  // 列幅（mm）
  align: 'left' | 'center' | 'right'
  format?: {
    type: 'comma' | 'currency_jpy' | 'percent' | 'yyyy/MM/dd' | 'wareki_full' | 'custom'
    customPattern?: string
  }
  visibilityRule?: string        // 列単位の表示条件
}

export interface RepeatingBandTotal {
  fieldKey: string               // 集計対象フィールド
  formula: 'sum' | 'avg' | 'count' | 'max' | 'min'
  label: string                  // フッター行のラベル（空欄列に表示）
  format?: RepeatingBandField['format']
}

export interface RepeatingBandElement extends ElementBase {
  type: 'repeatingBand'

  // ── データ ──
  dataSource: string             // バインドするコレクションキー（例: "items"）
  fields: RepeatingBandField[]   // 列定義（順序 = 表示順）

  // ── レイアウト ──
  itemHeight: number             // 1行の高さ（mm）
  showHeader: boolean            // ヘッダー行表示
  showFooter: boolean            // フッター集計行表示
  totals: RepeatingBandTotal[]   // 集計行設定（複数可）

  // ── 外観 ──
  oddRowColor: string            // 奇数行背景色（デフォルト: #ffffff）
  evenRowColor: string           // 偶数行背景色（デフォルト: #f9fafb）
  borderColor: string
  borderWidth: number            // mm
  style?: Partial<TextStyle>     // データ行フォント設定
  headerStyle?: Partial<TextStyle> // ヘッダー行フォント設定

  // ── ソート・グループ ──
  sortBy?: string                // ソートするフィールドキー
  sortOrder?: 'asc' | 'desc'
  groupBy?: string               // グループ化フィールドキー（Phase 2.1以降）

  // ── ページング ──
  maxItems: number               // 最大表示件数（0 = 無制限）
  pageBreak: 'none' | 'before' | 'after'
}
```

**ELEMENT_ALLOWED_KEYS:**

```ts
repeatingBand: new Set([
  'dataSource', 'fields', 'itemHeight', 'showHeader', 'showFooter', 'totals',
  'oddRowColor', 'evenRowColor', 'borderColor', 'borderWidth',
  'style', 'headerStyle',
  'sortBy', 'sortOrder', 'groupBy',
  'maxItems', 'pageBreak',
])
```

**ElementRenderer プレビュー戦略:**

レンダリング時は実データを持たないため、プレビューデータ（3行）をフェードイン→フェードアウトで表示し「繰り返しが続く」視覚表現とする。

```
行1: opacity 1.0  (確定行)
行2: opacity 0.7  (フェード中)
行3: opacity 0.4  (フェードアウト)
     ↻ {dataSource} レコード数分 繰り返し
```

---

### RepeatingListElement（カードリスト）

**コンセプト:** コレクションの各レコードを **カード（自由レイアウト）** として縦・横・グリッドに並べる。各カード内のフィールドは mm 座標で自由配置できる。

```
layout: 'grid', gridColumns: 3

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 山田 太郎    │ │ 鈴木 花子    │ │ 田中 一郎    │  } itemHeight ごとに
│ 部長         │ │ 課長         │ │ 係長         │  } dataSource 件数分繰り返す
│ 営業部       │ │ 経理部       │ │ 総務部       │  } （gridColumns 列×N行）
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐   ...
│ 佐藤 次郎    │ │ 高橋 三郎    │
│ 主任         │ │ 担当         │
│ 人事部       │ │ 開発部       │
└──────────────┘ └──────────────┘
```

**型定義:**

```ts
export interface RepeatingListField {
  key: string                    // データソースのフィールドキー
  label: string                  // 設計時ラベル（プレビュー表示用）
  /** カード内の相対座標（mm）*/
  x: number
  y: number
  width: number
  height: number
  style?: Partial<TextStyle>
  format?: RepeatingBandField['format']
}

export interface RepeatingListElement extends ElementBase {
  type: 'repeatingList'

  // ── データ ──
  dataSource: string             // バインドするコレクションキー（例: "members"）
  fields: RepeatingListField[]   // カード内フィールド定義

  // ── レイアウト ──
  layout: 'vertical' | 'horizontal' | 'grid'
  gridColumns: number            // layout='grid' 時の列数
  itemWidth: number              // カード幅（mm）
  itemHeight: number             // カード高さ（mm）
  gap: number                    // カード間余白（mm）

  // ── カード外観 ──
  itemBackground?: string        // カード背景色
  borderColor?: string
  borderWidth?: number           // mm
  borderRadius?: number          // mm

  // ── ページング ──
  maxItems: number               // 最大表示件数（0 = 無制限）
  pageBreak: 'none' | 'before' | 'after'
}
```

**ELEMENT_ALLOWED_KEYS:**

```ts
repeatingList: new Set([
  'dataSource', 'fields',
  'layout', 'gridColumns', 'itemWidth', 'itemHeight', 'gap',
  'itemBackground', 'borderColor', 'borderWidth', 'borderRadius',
  'maxItems', 'pageBreak',
])
```

**ElementRenderer プレビュー戦略:**

プレビューデータ（最大 `gridColumns` 件）をフェードで表示し、末尾に繰り返しインジケーターを置く。

```
カード1: opacity 1.0
カード2: opacity 0.85
カード3: opacity 0.7
カード4: opacity 0.5
カード5: opacity 0.3
        ↻ {dataSource} レコード数分 繰り返し (grid · {gridColumns}列)
```

---

### バンド vs リスト 比較

| 観点 | `repeatingBand` | `repeatingList` |
|---|---|---|
| **形状** | 行（水平・固定高さ）| カード（自由サイズ） |
| **繰り返し方向** | 縦のみ | 縦・横・グリッド |
| **列レイアウト** | ヘッダー付き固定列（width 指定）| カード内 mm 座標で自由配置 |
| **集計行** | あり（sum/avg/count/max/min） | なし |
| **ソート** | あり | なし（Phase 2 で検討）|
| **代表的用途** | 明細表・勤怠表・注文リスト | 名簿・カタログ・IDカード印刷 |
| **対応帳票ツール** | FastReport Detail Band / SSRS Tablix | Crystal Reports SubReport カード配置 |

---

### Phase 2 実装ロードマップ

| マイルストーン | 内容 |
|---|---|
| Phase 2.0 | `repeatingBand` 完全実装。実データバインディング・ページをまたぐ繰り返し（splitByPage）|
| Phase 2.1 | `repeatingList` 完全実装。カードテンプレートエディタ（カード内ドラッグ配置）|
| Phase 2.2 | `repeatingBand` グループ化（groupBy）・グループヘッダー/フッター行 |
| Phase 2.3 | ページング制御（maxItems + 複数ページ分割）|

---

## Open Questions（未解決 → Phase 2 で決定）

- **RelativeLayout の実装戦略**: `@dnd-kit/sortable` で Section 内のフロー順序を管理するか、CSS Grid/Flexbox ベースにするか？
- **repeatingBand のページ分割**: 1ページに収まらない場合の継続ヘッダー再表示をどう実装するか？
- **repeatingList カードテンプレート**: カード内フィールドをドラッグ配置するサブエディタを独立モーダルにするか、インライン編集にするか？

---

## Next Steps

→ `/workflows:plan` で Phase 1 の実装計画を作成する
