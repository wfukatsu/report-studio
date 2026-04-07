---
title: "feat: FormTableElement — 帳票専用テーブル要素型"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-form-table-element-brainstorm.md
---

# feat: FormTableElement — 帳票専用テーブル要素型

## Overview

帳票デザインスタジオに `FormTableElement` を新しい要素型として追加する。

この要素は **2モード** を統一的に扱う:
- **固定レイアウトモード**: 扶養控除等申告書のような公的帳票の行・列固定グリッド
- **データバインドモード**: `dataSource` 配列を指定し、body 行をレコード数分自動展開

現状の問題（`ManualEntry` の積み上げ）を 300+ 要素から 1 要素に集約することで、位置ずれ・パフォーマンス劣化・メンテナンス困難を解消する。

---

## Problem Statement

`src/templates/fuyouKojoTemplate.ts` の実装で発覚した課題（`docs/issues/fuyou-kojo-template-issues.md` ISSUE-04）:

- 扶養控除等申告書テンプレートは 300+ の `ShapeElement` + `LabelElement` + `ManualEntryField` を積み上げて擬似テーブルを構成している
- 列幅・行高さの変更時に全要素の座標を手動更新が必要
- 印刷時の枠線ズレリスクがある
- 既存の `TableElement`（静的文字列のみ）や `RepeatingBandElement`（単純行繰り返し）ではセルごとに異なる入力種別を持つ帳票を表現できない

---

## Proposed Solution

`FormTableElement` を追加する。型安全・拡張性重視のアプローチ A（専用要素型）。
(see brainstorm: docs/brainstorms/2026-04-08-form-table-element-brainstorm.md)

---

## Technical Approach

### Type Definitions (`src/types/index.ts`)

```typescript
// ── セル種別 ────────────────────────────────────────────
export type FormTableCellType = 'label' | 'input' | 'dataField'

export interface FormTableCell {
  /** UUID — 変更不可。行複製時は新 UUID を生成する */
  id: string
  type: FormTableCellType
  /** type='label' | 'input' で使用 */
  text?: string
  placeholder?: string
  /** type='dataField' で使用 */
  fieldKey?: string
  format?: CalculationFormat
  /** fieldKey が未解決・null 時のフォールバック表示テキスト */
  fallbackText?: string
  /**
   * セルレベルスタイル。
   * 優先順位（高→低）: cell.style > column.style > row-role style (headerStyle/bodyStyle)
   */
  style?: TextStyle
}

export type FormTableRowRole = 'header' | 'body' | 'footer'

export interface FormTableRow {
  /** UUID */
  id: string
  role: FormTableRowRole
  /** 行高さ (mm) */
  height: number
  /**
   * セル配列。cells.length は必ず columns.length と等しくなければならない。
   * 不一致時は描画エンジンが末尾を空セルで補完、または余剰を無視する。
   */
  cells: FormTableCell[]
}

export interface FormTableColumn {
  /** UUID */
  id: string
  /** 列幅 (mm, 絶対値) — 最小値 3mm */
  width: number
  align?: 'left' | 'center' | 'right'
  /** 列レベルスタイル。cell.style より低優先度 */
  style?: TextStyle
}

export interface FormTableElement extends ElementBase {
  type: 'formTable'
  columns: FormTableColumn[]
  rows: FormTableRow[]
  /** データバインドモード: body 行をこの配列で展開 */
  dataSource?: string
  /**
   * 最大展開件数。0 = 無制限（既存 RepeatingBandElement と同一セマンティクス）。
   * undefined は 0 と等価。
   */
  maxItems?: number
  /** 枠線色 */
  borderColor: string
  /** 枠線幅 (mm) */
  borderWidth: number
  /** header 行スタイル（column.style / cell.style より低優先度）*/
  headerStyle?: TextStyle
  /** body / footer 行スタイル（column.style / cell.style より低優先度）*/
  bodyStyle?: TextStyle
  /** body 行奇数行背景色（cell/column スタイルの backgroundColor が優先）*/
  oddRowColor?: string
  /** body 行偶数行背景色（同上）*/
  evenRowColor?: string
}
```

**`ElementType` union に追加:**
```typescript
| 'formTable'   // 帳票専用テーブル
```

**`ReportElement` union に追加:**
```typescript
| FormTableElement
```

---

### スタイル優先度（SpecFlow Gap 3/4 解消）

```
[最高] FormTableCell.style
  ↓
FormTableColumn.style
  ↓
headerStyle (header rows) / bodyStyle (body/footer rows)
  ↓
[最低] デフォルト（fontSize: 3mm, textAlign: 'left'）
```

`oddRowColor` / `evenRowColor` は body 行のみに適用（header/footer 行は適用しない）。
セルの `style.backgroundColor` が設定されていれば `oddRowColor`/`evenRowColor` より優先。

---

### 列幅モデル（SpecFlow Q2 解消）

**Phase 1: 絶対 mm 値**

`FormTableColumn.width` は絶対 mm 値。列幅の合計が `element.size.width` を超える場合はクリップ（最終列が見えなくなる可能性）。不足の場合は最終列が残り幅を占有する。

これは既存の `RepeatingBandRenderer` のパーセント方式と **異なる**。政府帳票の mm 精度要件を優先する判断。

---

### 列/行 同期規約（SpecFlow Q1/Q5 解消）

- **列追加**: すべての行の `cells[]` 末尾に空の `input` セル（`{ id: uuidv4(), type: 'input', text: '' }`）を追加する
- **列削除 (index i)**: すべての行の `cells[i]` を削除する
- **この 2 操作は `updateElement` の patch で行全体を置き換える（shallow patch ではなく配列全体の再構築）**
- `cells.length < columns.length`: 描画時に不足分を空ラベルセルで補完（表示のみ、ストアには書き込まない）
- `cells.length > columns.length`: 余剰セルは描画時に無視

---

### Element Factory (`src/lib/elementFactories.ts`)

```typescript
// デフォルト定数
const DEFAULT_FORM_TABLE_COLUMNS: FormTableColumn[] = [
  { id: uuidv4(), width: 40, align: 'left' },
  { id: uuidv4(), width: 40, align: 'left' },
  { id: uuidv4(), width: 40, align: 'left' },
]

const DEFAULT_FORM_TABLE_ROWS: FormTableRow[] = [
  {
    id: uuidv4(), role: 'header', height: 8,
    cells: [
      { id: uuidv4(), type: 'label', text: '項目 1' },
      { id: uuidv4(), type: 'label', text: '項目 2' },
      { id: uuidv4(), type: 'label', text: '項目 3' },
    ],
  },
  {
    id: uuidv4(), role: 'body', height: 8,
    cells: [
      { id: uuidv4(), type: 'input', placeholder: '' },
      { id: uuidv4(), type: 'input', placeholder: '' },
      { id: uuidv4(), type: 'input', placeholder: '' },
    ],
  },
]

export function createFormTableElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'formTable',
    position: { x: 13, y: 13 },
    size: { width: 120, height: 24 },
    zIndex: 1,
    locked: false,
    visible: true,
    name: '帳票テーブル',
    columns: DEFAULT_FORM_TABLE_COLUMNS.map(c => ({ ...c, id: uuidv4() })),
    rows: DEFAULT_FORM_TABLE_ROWS.map(r => ({
      ...r,
      id: uuidv4(),
      cells: r.cells.map(c => ({ ...c, id: uuidv4() })),
    })),
    borderColor: '#000000',
    borderWidth: 0.3,
    ...overrides,
  } as ReportElement
}
```

---

### Renderer (`src/elements/formTable/Renderer.tsx`)

**デザインプレビュー**（`records=undefined` 時）:
- columns + rows をそのまま描画
- `input` セルはフォーカス可能な `ManualEntryField` 風（ボックス）として表示
- body 行の oddRowColor / evenRowColor を適用
- 要素の上部に青いバッジ `📋 帳票テーブル` を表示（同 `RepeatingBandRenderer` の badge パターン）

**ライブレンダリング**（`records: Record<string, unknown>[]` 時）:
- header/footer 行: 1回だけ描画
- body 行テンプレート: `records` の各レコードで繰り返し
- `maxItems > 0` の場合: `records.slice(0, maxItems)` を使用
- `records.length === 0` の場合: body 行ゼロ、header/footer は表示
- `records` が非配列の場合: デザインプレビューに fallback
- 高さオーバーフロー: Phase 1 はクリップ（`overflow: hidden`）+ バッジ警告

**セル描画規則:**
```
'label'    → テキスト表示（スタイル適用）
'input'    → 空のボックス（ManualEntry "box" モードと同等）
'dataField' → resolveField(record, fieldKey) の値を表示、format 適用
             ↳ import { resolveField } from '@/lib/dataBinding'
             ↳ 未解決時は cell.fallbackText ?? '' を表示
```

**列幅計算:**
```typescript
// 絶対 mm 値をそのまま使用
<td style={{ width: `${col.width}mm`, minWidth: `${col.width}mm` }}>
```

**パフォーマンス:**
```typescript
export const FormTableRenderer = memo(function FormTableRenderer({ element, data = {}, records }: Props) { ... })
```

---

### ElementRenderer 更新 (`src/components/canvas/ElementRenderer.tsx`)

```typescript
import { FormTableRenderer } from '@/elements/formTable/Renderer'

// switch 内 default の手前に追加:
case 'formTable': {
  const records = element.dataSource
    ? (mergedData[element.dataSource] as Record<string, unknown>[] | undefined)
    : undefined
  return (
    <ElementErrorBoundary element={element}>
      <FormTableRenderer element={element} data={mergedData} records={records} />
    </ElementErrorBoundary>
  )
}
```

---

### ElementPalette 更新 (`src/components/sidebar/ElementPalette.tsx`)

```typescript
// 'repeating' カテゴリに追加
{
  label: '帳票テーブル',
  icon: <TableProperties className="w-4 h-4" />,
  createElement: createFormTableElement,
  description: 'セルごとにラベル/入力欄/データを配置できる帳票専用テーブル',
}
```

---

### PropertiesPanel (`src/elements/formTable/PropertiesPanel.tsx`)

**UI構造（スクロールリスト）:**

```
PropSection "テーブル構造"
  ├── [列管理]
  │     ├── 列一覧（幅・揃え）
  │     ├── [列追加] ボタン
  │     └── 各列の [削除] ボタン
  ├── [行管理]
  │     ├── 行一覧（役割・高さ）
  │     ├── [行追加: ヘッダー / ボディ / フッター] ボタン
  │     └── 各行の [削除] ボタン
  └── 選択中の行の各セル
        ├── セル種別 SelectInput
        ├── (label) テキスト入力
        ├── (input) プレースホルダー入力
        └── (dataField) フィールドキー入力 + 書式

PropSection "スタイル"
  ├── 枠線色 ColorInput
  ├── 枠線幅 NumInput
  ├── ヘッダースタイル（背景色・テキストスタイル）
  ├── ボディスタイル（背景色・テキストスタイル）
  ├── 奇数行背景色 ColorInput
  └── 偶数行背景色 ColorInput

PropSection "データバインド"
  ├── dataSource テキスト入力
  └── maxItems NumInput (0=無制限)
```

**選択中行モデル（SpecFlow Q7 解消）:**
- パネル内でローカル `selectedRowId` を `useState` で管理
- 行一覧の行をクリックすると選択され、下部にその行のセル編集 UI が展開
- 列追加/削除は全行に即時反映（`onChange` で全行の cells 配列を再構築）

---

### LayersPanel 更新 (`src/components/sidebar/LayersPanel.tsx`)

```typescript
// アイコン表示の switch に追加
case 'formTable': return <TableProperties className="w-3.5 h-3.5" />
```

---

## Implementation Phases

### Phase 1: 型定義とファクトリ（基盤）

**ファイル変更:**
- `src/types/index.ts` — 型定義追加（`FormTableCell`, `FormTableRow`, `FormTableColumn`, `FormTableElement`, union 更新）
- `src/lib/elementFactories.ts` — `createFormTableElement` 追加

**完了基準:**
- [x] TypeScript ビルドエラーなし（`assertNever` が新型を要求）
- [x] `createFormTableElement()` がデフォルト 3列 × 2行（header+body）を返す

---

### Phase 2: Renderer（描画エンジン）

> **TDD 必須**: `Renderer.test.tsx` を先に書き RED を確認してから `Renderer.tsx` を実装する。

**ファイル変更:**
- `src/elements/formTable/Renderer.test.tsx` — **先に作成（RED）**
- `src/elements/formTable/Renderer.tsx` — テスト通過後に実装（GREEN）
- `src/components/canvas/ElementRenderer.tsx` — switch に formTable ケース追加

**完了基準:**
- [x] `Renderer.test.tsx` が先に存在し、初回は失敗する（RED フェーズ完了）
- [x] デザインプレビューで 3×2 グリッドが正しく描画される
- [x] `input` セルがボックス境界線付きで描画される
- [x] `dataField` セルが `records` のフィールド値を表示する
- [x] `records=undefined` → デザインプレビュー、`records=[]` → body 0行
- [x] `oddRowColor` / `evenRowColor` が body 行のみに適用される
- [x] `element.size.height` を超えた行がクリップされ、バッジ警告が表示される
- [x] `React.memo` でラップされている
- [x] `ElementErrorBoundary` でラップされている

---

### Phase 3: PropertiesPanel（設定 UI）

> **TDD 必須**: `PropertiesPanel.test.tsx` を先に書き RED を確認してから実装する。

**ファイル変更:**
- `src/elements/formTable/PropertiesPanel.test.tsx` — **先に作成（RED）**
- `src/elements/formTable/PropertiesPanel.tsx` — テスト通過後に実装（GREEN）
- `src/components/sidebar/PropertiesPanel.tsx` — `formTable` ケース追加

**完了基準:**
- [x] `PropertiesPanel.test.tsx` が先に存在し、初回は失敗する（RED フェーズ完了）
- [x] 列の追加・削除が全行の cells を同期的に更新する
- [x] 列追加時に各行の末尾に `input` セルが追加される
- [x] 列削除時に各行の対応 cells[i] が削除される
- [x] 行の追加・削除が動作する
- [x] 行選択時にセル編集 UI が展開される
- [x] セル種別変更（label/input/dataField）が正しく動作する
- [x] `dataSource` / `maxItems` の設定が動作する
- [x] すべての onChange が `rows: [...]` 全体を置き換える（浅いパッチ問題を回避）

---

### Phase 4: ElementPalette + LayersPanel（UI 統合）

**ファイル変更:**
- `src/components/sidebar/ElementPalette.tsx` — パレット項目追加
- `src/components/sidebar/LayersPanel.tsx` — アイコン case 追加

**完了基準:**
- [x] パレットの「繰り返し・テーブル」カテゴリに「帳票テーブル」が表示される
- [x] ドラッグ&ドロップでキャンバスに配置できる
- [x] LayersPanel に `TableProperties` アイコンが表示される

---

### Phase 5: カバレッジ確認

各 Phase のテストは実装と同時に作成済み。このフェーズでは **80%+ カバレッジ** を確認し、不足ケースを補完する。

**確認対象:**
- `src/elements/formTable/Renderer.test.tsx` — 全ケース網羅済みか
- `src/elements/formTable/PropertiesPanel.test.tsx` — 列/行同期・セル種別変更を網羅済みか
- `src/lib/elementFactories.test.ts` — `createFormTableElement` のテスト追加済みか

**完了基準:**
- [x] `npm run test:coverage` で `src/elements/formTable/` のカバレッジが 80%+（99.89% stmts）
- [x] Factory: デフォルト生成 / overrides 適用 / 呼び出しごとに UUID が異なる の 3 ケース存在

---

## System-Wide Impact

### Interaction Graph

```
ElementPalette クリック
  → createFormTableElement()
  → addElement(pageId, el)
  → layoutSlice.addElement()
    → immer produce: section.elements.push(el)
    → pushHistory()

PropertiesPanel onChange
  → updateElement(pageId, el.id, { rows: [...] })
  → layoutSlice.updateElement()
    → immer produce: Object.assign(sEl, patch)
    → pushHistory() [debounced 300ms]

ElementRenderer switch 'formTable'
  → mergedData[element.dataSource] → records
  → <FormTableRenderer element records />
  → HTMLTable with <td> per cell
  → html2canvas → PDF/PNG export
```

### Error Propagation

- `fieldKey` が解決できない場合: `resolveField` が `undefined` を返す → `cell.fallbackText ?? ''` を表示（クラッシュしない）
- `records` が非配列の場合: デザインプレビューに fallback（クラッシュしない）
- Renderer が例外を投げた場合: `ElementErrorBoundary` がキャッチしてリカバリー UI を表示

### State Lifecycle Risks

- **列/行 同期**: `updateElement` は `Object.assign`（浅いパッチ）。`columns` と `rows` の両方を同時に更新する場合、`patch: { columns: newCols, rows: newRows }` として 1 回の呼び出しで更新すること
- **UUID 衝突**: 行・列・セルの複製時は必ず `uuidv4()` で新 ID を生成する。`JSON.parse(JSON.stringify(...))` によるディープクローン後に全 ID を再生成する

### API Surface Parity

- `FormTableElement` は `outputVariants.hiddenElementIds` でのみ非表示可能（セル単位の非表示は Phase 2 以降）
- `validationRules` の JEXL 式からは `element.id` でアクセス可能
- PDF/PNG エクスポートは追加対応不要（`html2canvas` がキャンバス DOM を自動キャプチャ）

---

## Acceptance Criteria

### Functional

- [x] `FormTableElement` がパレットから配置できる
- [x] 固定レイアウトモード: label / input / dataField セルが正しく描画される
- [x] データバインドモード: `dataSource` 配列の各レコードで body 行が繰り返される
- [x] `maxItems > 0` のとき展開行数が制限される
- [x] PropertiesPanel で列追加/削除・行追加/削除・セル編集ができる
- [x] 列追加時は全行の cells が同期更新される
- [x] 列削除時は全行の cells[i] が同期削除される
- [x] スタイル（枠線色・幅、headerStyle、bodyStyle、奇偶行色）が設定・反映される
- [x] Undo/Redo が正しく動作する（add/remove は即時、update は debounced 300ms）
- [x] `element.size.height` 超過時にクリップされバッジ警告が表示される
- [x] LayersPanel に正しいアイコンと名称が表示される

### Non-Functional

- [x] `React.memo` 適用済み（100+ 要素キャンバスで 60fps ドラッグ）
- [x] TypeScript ビルドエラーなし（`assertNever` が全 case の網羅を強制）
- [x] テストカバレッジ 80%+（99.89% statements）
- [ ] `FormTableElement` 1 要素で置き換えた 扶養控除等申告書テンプレートの要素数が 300+ → 10 以下になる（次フェーズ）

---

## Dependencies & Risks

| リスク | 影響 | 対策 |
|--------|------|------|
| `PropertiesPanel` の 2D セル編集 UI が複雑 | 実装難易度高 | Phase 3 で「選択中行のセルリスト」という簡易モデルを採用（SpecFlow Q7 解消）|
| 絶対 mm 列幅 ↔ `element.size.width` 不整合 | 列がはみ出す | 最終列に残り幅を割り当て + バッジ警告 |
| `updateElement` 浅いパッチで cells 配列が壊れる | データ損失 | rows 全体を置き換えるパッチに統一 |
| `assertNever` 追加場所の漏れ（LayersPanel など）| TSエラー | Phase 1 完了後 `npx tsc --noEmit` で確認 |

---

## Open Questions (計画フェーズで解決済み)

| 質問 | 決定 |
|------|------|
| 列幅: 絶対 mm vs パーセント | 絶対 mm（政府帳票 mm 精度要件） |
| `maxItems=0` のセマンティクス | 0 = 無制限（既存 RepeatingBand に合わせる） |
| input セルの描画 | ManualEntry "box" モードと同等（ボーダー付き空ボックス）|
| dataSource 未解決時の挙動 | body 行 0 件、header/footer は表示 |
| セル/列同期 | columns[] が authority、行追加/削除時に全行 cells[] を原子的に更新 |
| スタイル優先度 | cell > column > row-role (header/body) |
| 行 conditionalDisplay | Phase 1 対象外（YAGNI） |
| OutputVariant セル単位マスク | Phase 2 以降 |

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-08-form-table-element-brainstorm.md](docs/brainstorms/2026-04-08-form-table-element-brainstorm.md)
  - Key decisions carried forward: FormTableElement 専用型、固定 + データバインド両モード、Phase 1 はシンプルグリッド（colspan なし）

### Internal References

- 既存の型定義パターン: `src/types/index.ts:361` (RepeatingBandElement)
- ファクトリパターン: `src/lib/elementFactories.ts`（`createRepeatingBandElement`）
- ElementRenderer dispatcher: `src/components/canvas/ElementRenderer.tsx:62–88`
- PropertiesPanel 構造: `src/components/sidebar/PropertiesPanel.tsx:182–213`
- 共有 UI コンポーネント: `src/elements/_base/sharedUI.tsx`
- 課題ドキュメント: `docs/issues/fuyou-kojo-template-issues.md` (ISSUE-04)

### Learnings

- `assertNever` の漏れは TSエラーになる: `docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md`
- 浅いパッチで配列が壊れる: `docs/solutions/logic-errors/component-quality-code-cleanup.md`
- `React.memo` は必須: `docs/solutions/performance-issues/react-canvas-rerender-optimization.md`
- PropertiesPanel タブ構造（PropSection/PropRow）: `docs/solutions/feature-implementation/sidebar-ui-reorganization-databinding-modal-templates.md`
