---
title: "feat: Phase 1 アーキテクチャ確定 — ストア/型/要素/Section/LivePreview/Export"
type: feat
status: completed
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md
---

# feat: Phase 1 アーキテクチャ確定

## Overview

2026-04-05 のブレインストームで確定したアーキテクチャ設計決定を実装する計画。  
既存の Phase 1 計画 (`2026-04-05-feat-phase1-report-design-studio-plan.md`) を **補完・更新** する形で、以下 7 つの実装フェーズを定義する。

**本計画が追加するもの（既存計画との差分）:**
1. `Report` → `ReportDefinition` への完全型移行（旧計画は移行手順が未詳細）
2. `src/elements/{type}/` ファイル集約パターン（旧計画は ElementRenderer/PropertiesPanel がモノリシック）
3. `masterHeader` / `masterFooter` のデータモデルと Canvas 反映
4. RepeatingBand / RepeatingList の**実データレンダリングを Phase 1 に前倒し**（Live Preview のため）
5. **Live Preview 機能**（バインドタブインライン入力 + 別プレビューペイン）— 旧計画に未記載
6. JSON エクスポートの `$schema` フィールドとインポートバリデーション詳細

---

## Problem Statement

現在の `report-design-studio-v2` は以下の未解決の技術的負債を抱えている:

1. **二重型管理**: `Report` (deprecated) と `ReportDefinition` が並存。15 ファイルがまだ deprecated な `Report` 型を参照している
2. **二重要素管理**: `Page.elements[]` (フラット) と `Page.sections[].elements[]` の両方を `addElement` 等のアクションが更新している。実質 `flattenPageElements()` のみが読み取り経路として正しく動作している
3. **モノリシックレンダラー**: `ElementRenderer.tsx` (912 行) と `PropertiesPanel.tsx` (1,645 行) がすべての型の実装を 1 ファイルに詰め込んでいる。新型追加時に 4–6 ファイルへの分散変更が必要
4. **実データプレビューなし**: `RepeatingBand` / `RepeatingList` のデザインタイムプレビューはフェードモック行のみ。テストデータを注入してリアルタイムに帳票を確認できない
5. **エクスポートの不完全性**: `exportUtils.ts` は 65 行のスタブ。mm→pt 変換が不正確で、`ReportDefinition` 形式での JSON エクスポートが未実装

---

## Proposed Solution

ブレインストームで確定した 7 フェーズを順番に実装する。各フェーズは**ビルドが通る状態**を維持しながら積み上げる。

```
Phase P1 → P2 → P3 → P4 → P5 → P6 → P7
  型移行  ストア  要素集約  Section  繰り返し  LivePreview  Export
```

---

## Technical Approach

(see brainstorm: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md)

### 設計の原則

- **YAGNI**: 過剰な抽象化を避ける。3 スライス以上の分割はしない
- **後方互換**: `useReportStore` の名前と既存セレクターは移行期間中も維持
- **Zustand + immer**: 現行スタックを継続採用。スライスは単一 `create` + ファクトリ関数合成
- **JSON.parse(JSON.stringify)**: immer draft 内のディープクローンは `structuredClone` ではなくこれを使う（immer proxy で動作しないため）

---

## Implementation Phases

### Phase P1: `Report` → `ReportDefinition` 型移行

**目標:** deprecated な `Report` 型を廃止し、`ReportDefinition` をストアの唯一の状態型にする。

**作業ファイル:**

| ファイル | 変更内容 |
|---|---|
| `src/types/index.ts` | `ReportDefinition` に `masterHeader?: Section` / `masterFooter?: Section` を追加。`Report` 型の `@deprecated` 注記を維持しつつ削除候補マーク |
| `src/store/reportStore.ts` | `report: Report` → `definition: ReportDefinition` にフィールド名変更 |
| `src/lib/elementFactories.ts` | `createDefaultPage` が `PageDef` の `sections: [header, body, footer]` を生成するよう更新 |
| `src/templates/builtinTemplates.ts` | `Template` 型を `ReportDefinition` ベースに更新 |

**型変更詳細:**

```typescript
// src/types/index.ts に追加
export interface ReportDefinition {
  // ...既存フィールド...
  masterHeader?: Section   // 全ページ共通ヘッダー (undefined = ヘッダーなし)
  masterFooter?: Section   // 全ページ共通フッター (undefined = フッターなし)
}
```

**Page 二重管理の解消:**

```typescript
// Before: addElement が両方を更新していた
page.elements.push(element)           // ← 廃止
page.sections[0].elements.push(element) // ← これだけを残す

// After: sections のみを正とする
// Page.elements フィールド自体を PageDef から削除
// (PageDef は sections[] のみ持つ)
```

**移行テスト (`src/store/reportStore.test.ts` を更新):**
- `definition.pages[0].sections` が正しく `[header, body, footer]` を持つ
- `definition.masterHeader` が undefined から Section に設定できる
- 旧 `Report` 型の JSON を `importFromJSON` に渡したとき自動マイグレーションされる

**エッジケース:**
- `builtinTemplates.ts` の既存テンプレートが旧 `Report` 型 → `ReportDefinition` に変換する `migrateReport()` ユーティリティを `src/lib/migration.ts` に実装
- localStorage に保存されている旧形式 JSON の読み込み時も `migrateReport()` を通す

---

### Phase P2: Zustand ストア 3 スライス分割

**目標:** 739 行の単一 `reportStore.ts` を layoutSlice / rulesSlice / historySlice / uiSlice の 4 スライスに分割する。

> **⚠️ Technical Review 反映 (2026-04-05):** historySlice を uiSlice から分離。history は変更対象 (layout) と同じコアドメインに属しており、zoom/grid 等のビュー設定と同居させるのは責務が不自然。また HistoryEntry への calculationRules 追加はスナップショットコスト爆発リスクがあるため **pages のみ** に絞る。  
> (see: Technical Review — HIGH: uiSlice の history 責務、CRITICAL: HistoryEntry 肥大化)

**ファイル構成:**

```
src/store/
  types.ts          ★新規 — StoreState 型定義 (循環 import 回避)
  layoutSlice.ts    ★新規 — pages, sections, elements, selection
  rulesSlice.ts     ★新規 — calculationRules, templateVariables
  historySlice.ts   ★新規 — undo/redo, pushHistory (pages スナップショット)
  uiSlice.ts        ★新規 — zoom, grid, clipboard, livePreviewEnabled (ビュー設定のみ)
  selectors.ts      ★新規 — クロススライスセレクター
  index.ts          ★新規 — combine + 後方互換エイリアス
  reportStore.ts    ← 最終的にはすべて index.ts に転送する薄いシム
```

**HistoryEntry のスキーマ (pages のみ):**

```typescript
// historySlice.ts
interface HistoryEntry {
  pages: PageDef[]
  // NOTE: calculationRules/templateVariables はスナップショットコスト高のため除外
  // ルール変更は頻度が低く、必要なら別途 undoRules() を追加する
}
```

> **なぜ calculationRules を history に含めないか:** `pushHistory` は `addElement` / `updateElement` / `removeElement` 等の高頻度アクションで呼ばれる。50エントリ × (pages + calculationRules) のシリアライズは実行時パフォーマンスに影響する。calculationRules の変更 (TemplateSettingsDialog 経由) は低頻度であり、誤って変更した場合は undo より再編集が現実的。

**ストア合成:**

```typescript
// src/store/index.ts
export const useReportStore = create<StoreState>()(
  immer((...a) => ({
    ...createLayoutSlice(...a),
    ...createRulesSlice(...a),
    ...createUISlice(...a),
  }))
)
export { useReportStore as useLayoutStore }  // 後方互換
```

**移行順序 (壊さないために):**
1. `types.ts` を作成してインターフェースを定義
2. `layoutSlice.ts` を作成し、`reportStore.ts` の pages/elements 関連アクションを移植
3. `rulesSlice.ts` を作成
4. `uiSlice.ts` を作成し、history/undo/redo を移植
5. `index.ts` で統合し、既存の `useReportStore` セレクターが壊れないことをテストで確認
6. `reportStore.ts` を段階的に空にして最終的に削除

**15 ファイルの移行 (参照箇所):**

| ファイル | 主な変更内容 |
|---|---|
| `src/App.tsx` | `s.report.pages` → `s.definition.pages` |
| `src/components/canvas/ReportCanvas.tsx` | `dataSource?.fields` → `usePreviewData()` hook (Phase P6で実装) |
| `src/components/sidebar/DataSourcePanel.tsx` | `report.dataSource` → `definition.dataSources[0]` |
| `src/components/sidebar/LayersPanel.tsx` | `flattenPageElements(page)` 維持 (既に抽象化済み) |
| `src/components/sidebar/PropertiesPanel.tsx` | セレクター更新のみ |
| `src/components/toolbar/Toolbar.tsx` | `undo/redo` アクション名維持 |
| その他 10 ファイル | `useReportStore` の import パスを `@/store` に統一 |

**新規テスト:**
- `src/store/layoutSlice.test.ts`
- `src/store/rulesSlice.test.ts`
- `src/store/uiSlice.test.ts` (historyのatomic性を検証)

---

### Phase P3: 要素ファイル集約 (`src/elements/{type}/`)

**目標:** 型定義・ファクトリ・Renderer・PropertiesPanel を要素タイプ単位のディレクトリに集約する。

(see brainstorm: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md#3-型システム--要素ファイル集約パターン)

**ディレクトリ構成:**

```
src/elements/
  _base/
    index.ts           // ElementBase, Position, Size, TextStyle, BASE_ALLOWED_KEYS
  text/
    index.ts           // TextElement 型 + TEXT_ALLOWED_KEYS
    factory.ts         // createTextElement()
    Renderer.tsx       // TextRenderer コンポーネント
    PropertiesPanel.tsx
  label/               // ...同様
  dataField/
  image/
  shape/
  table/
  chart/
  barcode/
  manualEntry/
  hanko/
  approvalStampRow/
  revenueStamp/
  repeatingBand/
    index.ts           // RepeatingBandElement, RepeatingBandField, REPEATING_BAND_ALLOWED_KEYS
    factory.ts
    Renderer.tsx       // DesignPreview + LiveRenderer の切り替えを含む (Phase P5 で実装)
    PropertiesPanel.tsx
  repeatingList/
    ...
```

**ELEMENT_ALLOWED_KEYS 合成:**

```typescript
// src/elements/_base/allowedKeys.ts
export const BASE_ALLOWED_KEYS = new Set([
  'position', 'size', 'zIndex', 'visible', 'locked', 'name', 'visibilityRule', 'printable',
])

// src/elements/text/index.ts
export const TEXT_ALLOWED_KEYS = new Set([
  ...BASE_ALLOWED_KEYS,
  'content', 'style', 'furigana', 'furiganaScale',
])

// src/store/uiSlice.ts
import { TEXT_ALLOWED_KEYS } from '@/elements/text'
import { REPEATING_BAND_ALLOWED_KEYS } from '@/elements/repeatingBand'
// ...
const ELEMENT_ALLOWED_KEYS: Record<ElementType, Set<string>> = {
  text: TEXT_ALLOWED_KEYS,
  repeatingBand: REPEATING_BAND_ALLOWED_KEYS,
  // ...
}
```

**ElementRenderer.tsx の薄いディスパッチャー化:**

```typescript
// src/components/canvas/ElementRenderer.tsx (Before: 912行 → After: ~60行)
import { TextRenderer }          from '@/elements/text/Renderer'
import { LabelRenderer }         from '@/elements/label/Renderer'
// ...14 imports

export const ElementRenderer = memo(({ element, data, scale }: Props) => {
  switch (element.type) {
    case 'text':          return <TextRenderer element={element} data={data} scale={scale} />
    case 'label':         return <LabelRenderer element={element} scale={scale} />
    case 'repeatingBand': return <RepeatingBandRenderer element={element} data={data} scale={scale} />
    // ...
    default: return null
  }
})
```

**PropertiesPanel.tsx の薄いディスパッチャー化:**

```typescript
// src/components/sidebar/PropertiesPanel.tsx (Before: 1645行 → After: ~80行)
import { TextPropertiesPanel }          from '@/elements/text/PropertiesPanel'
import { RepeatingBandPropertiesPanel } from '@/elements/repeatingBand/PropertiesPanel'
// ...

export function PropertiesPanel() {
  const [el] = useReportStore(selectSelectedElements)
  if (!el) return <EmptyState />
  // ...共通セクション...
  switch (el.type) {
    case 'text':          return <TextPropertiesPanel element={el} onChange={updateElement} />
    case 'repeatingBand': return <RepeatingBandPropertiesPanel element={el} onChange={updateElement} />
    // ...
  }
}
```

**移行手順 (14 型、型ごとに完結):**

> **⚠️ Technical Review 反映 (2026-04-05):**  
> - PropertiesPanel の共通セクション (position/size/visibility) は `_base/BasePropertiesSection.tsx` に先に抽出すること  
> - Stories ファイルも更新対象 (計画チェックリストに追加済み)  
> - ESLint `no-restricted-imports` で `elements/` → `store/` の循環 import を防止する設定を追加  
> (see: Technical Review — HIGH: P3 回帰リスク)

1. `_base/` を作成し共通型 (`ElementBase`, `TextStyle`, `BASE_ALLOWED_KEYS`) を移す
2. `_base/BasePropertiesSection.tsx` を作成し position/size/visibility/lock/name の共通 UI を抽出
3. `text/` → `label/` → `shape/` の 3 型でパターンを確立 → 動作確認
4. 残り 11 型を順次移行。各型の移行後に `npm run build` で確認
5. 全型移行後に旧 `elementFactories.ts` を `src/elements/` への再エクスポートシムに変換
6. `.eslintrc` に `no-restricted-imports` ルールを追加 (`src/elements/*/` → `src/store/` の import を禁止)

**新規要素追加チェックリスト (今後の開発者向け):**
```
[ ] src/elements/{type}/ ディレクトリを作成
[ ] index.ts: 型定義 + ALLOWED_KEYS
[ ] factory.ts: createXxxElement()
[ ] Renderer.tsx: XxxRenderer コンポーネント
[ ] PropertiesPanel.tsx: XxxPropertiesPanel コンポーネント
[ ] src/types/index.ts の ElementType union に追加
[ ] store/uiSlice.ts の ELEMENT_ALLOWED_KEYS に追加
[ ] ElementPalette.tsx にパレットアイテムを追加
```

---

### Phase P4: Section コンテナ実装

**目標:** header/body/footer の 3 固定 Section をキャンバス上に視覚化し、ドラッグリサイズを実装する。

(see brainstorm: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md#7-section-実装設計)

**データモデル変更 (P1 で追加済み):**

```typescript
// ReportDefinition に追加済み
masterHeader?: Section   // 全ページ共通ヘッダー
masterFooter?: Section   // 全ページ共通フッター

// 各 PageDef.sections は必ず [header, body, footer] の3要素
// header/footer は masterHeader/Footer と同期
```

**`SectionContainer.tsx` 実装:**

```typescript
// src/components/canvas/SectionContainer.tsx ★新規
interface SectionContainerProps {
  section: Section
  pageId: string
  scale: number
  data?: Record<string, unknown>
  /** false のとき要素のドラッグ/リサイズを無効化 (header/footer はマスター経由でのみ編集) */
  editable?: boolean
  onHeightChange?: (newHeightMm: number) => void
}
```

**ドラッグリサイズ実装 (pointerEvent パターン):**

```typescript
// Section 下端に cursor:row-resize のリサイズハンドル (height: 4px)
function onResizePointerDown(e: React.PointerEvent) {
  e.stopPropagation()  // DndContext のドラッグセンサーに届かないように
  e.currentTarget.setPointerCapture(e.pointerId)
  startYRef.current = e.clientY
  startHeightRef.current = section.height
}
function onResizePointerMove(e: React.PointerEvent) {
  const dyMm = pxToMm((e.clientY - startYRef.current) / scale)
  const newHeight = Math.max(10, startHeightRef.current + dyMm)  // 最小 10mm
  onHeightChange?.(newHeight)
}
```

**キャンバス表示構造:**

```
┌─ [HEADER] 30mm ──────────────────────────────┐  ← bg:#f8faff, 編集不可
│  Logo・会社名・日付                           │
│────────────────────────── ← resize handle ────│
├─ [BODY] 220mm ───────────────────────────────┤  ← 編集可
│  (各要素が Section 相対座標で配置)            │
│────────────────────────── ← resize handle ────│
└─ [FOOTER] 15mm ──────────────────────────────┘  ← bg:#f8faff, 編集不可
   ページ番号・印刷日
```

**header/footer クリック時の動作:**
- クリックすると「マスターヘッダーを編集するには [編集] をクリックしてください」トーストを表示
- ツールバーに「ヘッダー編集モード」ボタンを追加 → ON にすると header Section が editable になる

**masterHeader/Footer の伝播 (deep clone 必須):**

> **⚠️ Technical Review 反映:** `Object.assign(headerSection, patch)` は elements 配列を参照共有する。immer proxy 外でのアクセスで全ページが連動して壊れる危険がある。必ず `JSON.parse(JSON.stringify)` で deep clone する。  
> (see: Technical Review — CRITICAL: masterHeader 参照共有バグ)

```typescript
// src/lib/sectionUtils.ts ★新規 (ユーティリティ関数)
/** Section を deep clone して新 id を振り直す (全要素 id も新規生成) */
export function cloneSectionForPage(section: Section): Section {
  const cloned = JSON.parse(JSON.stringify(section)) as Section
  cloned.id = uuidv4()
  cloned.elements = cloned.elements.map(el => ({ ...el, id: uuidv4() }))
  return cloned
}

// layoutSlice.ts
updateMasterHeader: (patch: Partial<Section>) => set(draft => {
  draft.definition.masterHeader = {
    ...JSON.parse(JSON.stringify(draft.definition.masterHeader ?? {})),
    ...JSON.parse(JSON.stringify(patch)),
  }
  // 全ページの header Section に deep clone で同期
  draft.definition.pages.forEach(page => {
    const headerIdx = page.sections.findIndex(s => s.sectionType === 'header')
    if (headerIdx !== -1) {
      page.sections[headerIdx] = cloneSectionForPage(draft.definition.masterHeader!)
    }
  })
})
```

**ページ追加時の Section 初期化 (deep clone + 要素 ID 振り直し):**

> **⚠️ Technical Review 反映:** `{ ...masterHeader, id: uuidv4() }` はシャローコピーであり、elements 配列内の各要素 id が全ページ間で重複する。`selectElement(id)` / `updateElement(id)` が意図しないページの要素を操作するバグが生じる。  
> (see: Technical Review — HIGH: addPage シャローコピー)

```typescript
// addPage アクション内
addPage: () => set(draft => {
  const { masterHeader, masterFooter } = draft.definition
  const newPage: PageDef = {
    // ...
    sections: [
      masterHeader
        ? cloneSectionForPage(masterHeader)     // deep clone + 全要素 id 振り直し
        : createDefaultSection('header'),
      createDefaultSection('body', bodyHeight),
      masterFooter
        ? cloneSectionForPage(masterFooter)
        : createDefaultSection('footer'),
    ]
  }
  draft.definition.pages.push(newPage)
})
```

**エッジケース対応:**
- ページ削除時: masterHeader/Footer は不変 (ページと独立している)
- masterHeader を null に設定 → 全ページの header Section の elements を空にするが Section 自体は残す
- Section height の合計が pageHeight を超えた場合: body の最小高さを 50mm として制約

**新規テスト:**
- `src/components/canvas/SectionContainer.test.tsx`
- 高さリサイズのドラッグシミュレーション
- masterHeader 変更が全ページに伝播することを確認

---

### Phase P5: 繰り返し要素 実データレンダリング

**目標:** RepeatingBand / RepeatingList に実配列データを渡したとき、設計タイムのフェードモックから切り替えて実際のレコードを描画する。

(see brainstorm: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md#繰り返し要素のリアルタイムレンダリング-phase-1-前倒し)

**背景:** Live Preview (Phase P6) のために Phase 2 から前倒し。`records?: unknown[]` が `undefined` のときはデザインプレビューを表示するため、デザインタイムの動作は変わらない。

**RepeatingBandRenderer の実装:**

```typescript
// src/elements/repeatingBand/Renderer.tsx
interface RepeatingBandRendererProps {
  element: RepeatingBandElement
  /** Live Preview 時に渡す配列データ。undefined = デザインプレビュー表示 */
  records?: Record<string, unknown>[]
  scale: number
}

export function RepeatingBandRenderer({ element, records, scale }: RepeatingBandRendererProps) {
  if (!records) {
    return <RepeatingBandDesignPreview element={element} scale={scale} />
  }
  return <RepeatingBandLiveRenderer element={element} records={records} scale={scale} />
}
```

**RepeatingBandLiveRenderer の仕様:**

```typescript
function RepeatingBandLiveRenderer({ element, records }: ...) {
  // 1. maxItems による件数制限
  const limitedRecords = element.maxItems > 0
    ? records.slice(0, element.maxItems)
    : records

  // 2. sortBy / sortOrder の適用
  const sorted = element.sortBy
    ? [...limitedRecords].sort((a, b) => {
        const va = resolveField(a, element.sortBy!)
        const vb = resolveField(b, element.sortBy!)
        return element.sortOrder === 'desc'
          ? String(vb).localeCompare(String(va))
          : String(va).localeCompare(String(vb))
      })
    : limitedRecords

  // 3. ヘッダー行レンダリング (showHeader)
  // 4. データ行レンダリング (奇数/偶数交互背景色)
  // 5. フッター集計行 (showFooter → totals で sum/count/avg/min/max)
}
```

**集計関数:**

```typescript
// src/lib/aggregation.ts ★新規
export function aggregateField(
  records: Record<string, unknown>[],
  fieldKey: string,
  formula: RepeatingBandTotalFormula
): number {
  const values = records.map(r => Number(resolveField(r, fieldKey) ?? 0))
  switch (formula) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'count': return records.length
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
  }
}
```

**RepeatingListLiveRenderer の仕様:**

```typescript
// src/elements/repeatingList/Renderer.tsx
function RepeatingListLiveRenderer({ element, records }) {
  const limited = element.maxItems > 0 ? records.slice(0, element.maxItems) : records

  // layout: 'vertical' | 'horizontal' | 'grid'
  // gridColumns: number (grid のみ)
  // 各カード内は element.fields の (x, y, width, height) で配置
  // field.key → resolveField(record, field.key) で値取得
}
```

**Phase 2 以降に残す機能:**
- `splitByPage` (ページをまたぐ行の分割)
- `groupBy` (グループヘッダー/フッター行)
- カードテンプレートビジュアルエディタ (RepeatingList)

**新規テスト:**
- `src/elements/repeatingBand/Renderer.test.tsx`
- `src/lib/aggregation.test.ts`
- records が空のとき: フッターのみ表示、集計値は 0/NaN をどう扱うか (0 を返す)
- maxItems=3 で 10 レコード: 3 行のみ表示

---

### Phase P6: Live Preview

**目標:** バインドタブでフィールドごとのテスト値を入力し、別プレビューペインで帳票のリアルタイム表示を確認できる。

(see brainstorm: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md#6-live-preview-アーキテクチャ)

**全体レイアウト:**

```
┌──────────────┬──────────────────────────┬──────────────────────────┐
│ 左パネル     │ 編集キャンバス            │ プレビューペイン          │
│ (バインド/   │ (デザインタイム表示)      │ (ライブデータ表示)        │
│  レイヤー)   │                           │ ← ツールバー[プレビュー]  │
└──────────────┴──────────────────────────┴──────────────────────────┘
                                             ↑ トグルボタンで ON/OFF
```

**新規ファイル:**

| ファイル | 役割 |
|---|---|
| `src/components/canvas/PreviewPane.tsx` ★新規 | プレビューペインコンポーネント |
| `src/hooks/usePreviewData.ts` ★新規 | データソースからフラット Record を生成 |

**`usePreviewData` hook:**

```typescript
// src/hooks/usePreviewData.ts
export function usePreviewData(): Record<string, unknown> {
  const dataSources = useReportStore(s => s.definition.dataSources)
  // 複数 DataSource をマージ (後勝ち)
  return useMemo(
    () => dataSources.reduce((acc, ds) => ({ ...acc, ...ds.fields }), {}),
    [dataSources]
  )
}
```

**`PreviewPane.tsx`:**

```typescript
// src/components/canvas/PreviewPane.tsx
export const PreviewPane = React.memo(function PreviewPane() {
  const definition = useReportStore(s => s.definition)
  const activePage = useReportStore(selectActivePage)
  const previewData = usePreviewData()

  return (
    <div className="preview-pane border-l overflow-auto">
      <ReportCanvas
        page={activePage}
        definition={definition}
        data={previewData}    // ← テストデータを注入
        readonly={true}
        showGrid={false}
      />
    </div>
  )
})
```

**バインドタブのインライン入力 UI (`PropertiesPanel.tsx` のバインドタブに追加):**

```typescript
// DataSource フィールドをキーごとに編集できるテーブル
// 単一値: テキスト input (onChange → 300ms debounce → updateTestData)
// 配列値: クリックで JSON textarea 展開
//         構文エラー時: textarea の border を赤くし "JSON 構文エラー" を表示
//         有効 JSON のみ store に commit (エラー中は古い値を保持してプレビューを壊さない)

function BindingTab() {
  const [ds] = useReportStore(s => s.definition.dataSources)
  const updateTestData = useReportStore(s => s.updateTestData)
  const debouncedUpdate = useMemo(() => debounce(updateTestData, 300), [updateTestData])

  return (
    <table>
      {Object.entries(ds?.fields ?? {}).map(([key, value]) => (
        <FieldRow key={key} fieldKey={key} value={value} onChange={debouncedUpdate} />
      ))}
    </table>
  )
}
```

**テストデータの永続化:**

```typescript
// layoutSlice.ts にアクション追加
updateTestData: (dataSourceId: string, fieldKey: string, value: unknown) => set(draft => {
  const ds = draft.definition.dataSources.find(d => d.id === dataSourceId)
  if (ds) ds.fields[fieldKey] = value
  // history には push しない (テストデータ変更は undo 対象外)
})
```

**ツールバーの「プレビュー」トグルボタン:**

```typescript
// uiSlice.ts に状態追加
livePreviewEnabled: boolean
toggleLivePreview: () => set(draft => { draft.livePreviewEnabled = !draft.livePreviewEnabled })

// Toolbar.tsx にボタン追加
<button onClick={toggleLivePreview} aria-pressed={livePreviewEnabled}>
  <Eye className="w-4 h-4" />プレビュー
</button>

// App.tsx のレイアウトで livePreviewEnabled が true のとき PreviewPane を表示
{livePreviewEnabled && <PreviewPane />}
```

**パフォーマンス保証:**

> **⚠️ Technical Review 反映 (2026-04-05):**  
> - `React.memo + useMemo` だけでは 50+ 要素ページの再レンダリングを防げない  
> - `updateTestData` に 300ms debounce をかけると体感遅延が大きい  
> → `updateTestData` は debounce なし即時 store 反映、PreviewPane は `useDeferredValue` で低優先度レンダリング  
> (see: Technical Review — HIGH: Live Preview パフォーマンス, MEDIUM: debounce 二重適用)

```typescript
// src/components/canvas/PreviewPane.tsx
export function PreviewPane() {
  const definition = useReportStore(s => s.definition)
  const activePage = useReportStore(selectActivePage)
  const previewData = usePreviewData()

  // useDeferredValue: 入力ジャンクなく、レンダリングは低優先度で実行
  const deferredData = useDeferredValue(previewData)
  const isPending = previewData !== deferredData  // Suspense フラグ

  return (
    <div className={`preview-pane ${isPending ? 'opacity-70' : ''}`}>
      <ReportCanvas
        page={activePage}
        data={deferredData}
        readonly={true}
        showGrid={false}
      />
    </div>
  )
}
```

```typescript
// BindingTab: updateTestData は即時反映 (debounce なし)
// 配列 JSON の parse エラー時のみ store 更新をスキップ
function onArrayFieldChange(dsId: string, key: string, jsonText: string) {
  try {
    const parsed = JSON.parse(jsonText)
    updateTestData(dsId, key, parsed)  // 即時
    setJsonError(null)
  } catch {
    setJsonError('JSON 構文エラー')  // store は変更しない
  }
}
```

- `PreviewPane` は `React.memo` でラップ (previewData 参照が変わったときのみ再レンダリング)
- `useDeferredValue` で 50+ 要素のレンダリングを低優先度化 (入力のジャンクを防止)
- `ReportCanvas` に `renderMode="preview"` を追加し、ドラッグ/リサイズ DOM 要素の描画を省略
- 配列 JSON のパースエラー中は store を更新しない (前回の有効値を保持)

**新規テスト:**
- `src/hooks/usePreviewData.test.ts`
- 複数 DataSource のマージが後勝ちで動くこと
- 配列 JSON に構文エラーがある間は store の値が変わらないこと
- PreviewPane が livePreviewEnabled の切り替えで表示/非表示されること

---

### Phase P7: エクスポートパイプライン

**目標:** JSON / PDF / Print の 3 種エクスポートを本格実装する。

(see brainstorm: docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md#4-エクスポートパイプライン)

#### P7-1. JSON エクスポート (`src/lib/exportUtils.ts` 拡張)

```typescript
const SCHEMA_VERSION = 'report-definition/v1' as const

export function exportToJSON(definition: ReportDefinition): string {
  const exportable = {
    $schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...JSON.parse(JSON.stringify(definition)),  // deep clone で immer proxy を除去
  }
  return JSON.stringify(exportable, null, 2)
}

// src/types/reportDefinitionSchema.ts ★新規 (Zod スキーマ)
// import { z } from 'zod'
// export const reportDefinitionSchema = z.object({
//   id: z.string(),
//   metadata: z.object({ documentName: z.string(), version: z.string(), reportType: z.string() }),
//   pageSettings: z.object({ paperSize: z.string(), orientation: z.string(), margins: z.object({...}), unit: z.literal('mm') }),
//   pages: z.array(pageDefSchema),
//   dataSources: z.array(dataSourceDefinitionSchema),
//   templateVariables: z.array(z.any()),
//   calculationRules: z.array(z.any()),
//   ...
// })

export function importFromJSON(
  json: string
): { ok: true; definition: ReportDefinition } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json)
    if (!parsed.$schema) {
      // 旧 Report 形式: 自動マイグレーション
      const migrated = migrateReport(parsed)
      return { ok: true, definition: migrated }
    }
    if (parsed.$schema !== SCHEMA_VERSION) {
      return { ok: false, error: `非対応スキーマ: ${parsed.$schema}` }
    }
    // Zod スキーマで構造バリデーション
    // const result = reportDefinitionSchema.safeParse(parsed)
    // if (!result.success) return { ok: false, error: result.error.message }
    // return { ok: true, definition: result.data }

    // Zod 未導入時の最低限バリデーション (Phase 1 暫定)
    if (!Array.isArray(parsed.pages)) {
      return { ok: false, error: 'pages フィールドが配列ではありません' }
    }
    if (!parsed.metadata || typeof parsed.metadata.documentName !== 'string') {
      return { ok: false, error: 'metadata.documentName が不正です' }
    }
    if (!parsed.pageSettings || typeof parsed.pageSettings.paperSize !== 'string') {
      return { ok: false, error: 'pageSettings.paperSize が不正です' }
    }
    return { ok: true, definition: parsed as ReportDefinition }
  } catch (e) {
    return { ok: false, error: `JSON パースエラー: ${String(e)}` }
  }
}

// TODO Phase 2: zod を devDependencies に追加し reportDefinitionSchema で完全バリデーション
```

**`migrateReport()` (旧 Report → ReportDefinition):**

> **⚠️ Technical Review 反映 (2026-04-05):** 以下フィールドの見落としに対応:  
> 1. `unit: 'px'|'in'` は `mm` に変換前に座標変換が必要  
> 2. `report.settings.margin` (単数) → `pageSettings.margins` (複数) のキー変換  
> 3. `dataSource.id` を保持 (捨てると要素の binding 参照が切れる)  
> 4. `Page.elements[]` → `sections[bodyIdx].elements` への振り分け  
> 5. `createdAt/updatedAt` → `metadata` に保存  
> (see: Technical Review — CRITICAL: migrateReport フィールド欠落)

```typescript
// src/lib/migration.ts ★新規
const UNIT_CONVERSION: Record<string, number> = {
  px: 1 / (96 / 25.4),  // px → mm (96dpi 想定)
  in: 25.4,              // in → mm
  mm: 1,
}

export function migrateReport(report: Record<string, unknown>): ReportDefinition {
  const settings = (report.settings ?? {}) as Record<string, unknown>
  const unit = String(settings.unit ?? 'mm') as 'px' | 'mm' | 'in'
  const scale = UNIT_CONVERSION[unit] ?? 1

  const oldDataSource = report.dataSource as { id?: string; name?: string; fields?: Record<string, unknown> } | null

  return {
    id: String(report.id ?? uuidv4()),
    metadata: {
      documentName: String(report.name ?? 'Untitled'),
      version: '1',
      reportType: 'general',
      // createdAt/updatedAt を保存 (廃止せず移行)
      description: [
        report.createdAt ? `createdAt: ${report.createdAt}` : '',
        report.updatedAt ? `updatedAt: ${report.updatedAt}` : '',
      ].filter(Boolean).join(', '),
    },
    pageSettings: {
      paperSize: String(settings.paperSize ?? 'A4') as PaperSize,
      orientation: String(settings.orientation ?? 'portrait') as 'portrait' | 'landscape',
      // margin (単数キー) → margins (複数キー)
      margins: settings.margin as Margins ?? settings.margins as Margins ?? { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
    defaultTextStyle: DEFAULT_TEXT_STYLE,
    templateVariables: [],
    calculationRules: [],
    dataSources: oldDataSource
      ? [{
          id: oldDataSource.id ?? uuidv4(),  // id を保持 (binding 参照を壊さない)
          name: oldDataSource.name ?? 'Default',
          fields: oldDataSource.fields ?? {},
        }]
      : [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: migratePages(report.pages as any[], scale),
  }
}

function migratePages(pages: any[], scale: number): PageDef[] {
  return (pages ?? []).map(page => ({
    id: page.id ?? uuidv4(),
    name: page.name ?? 'Page',
    width: (page.width ?? 210) * scale,
    height: (page.height ?? 297) * scale,
    background: page.background ?? '#ffffff',
    sections: migrateSections(page, scale),
  }))
}

function migrateSections(page: any, scale: number): Section[] {
  // sections が既にある場合はそれを使う
  if (Array.isArray(page.sections) && page.sections.length > 0) {
    return page.sections.map((s: any) => migrateSection(s, scale))
  }
  // elements[] のみある旧形式: body section に全要素を移す
  const bodyElements = (page.elements ?? []).map((el: any) => migrateElement(el, scale))
  const pageHeight = (page.height ?? 297) * scale
  return [
    createDefaultSection('header', 0),
    { id: uuidv4(), sectionType: 'body', height: pageHeight, elements: bodyElements },
    createDefaultSection('footer', 0),
  ]
}
```

#### P7-2. PDF エクスポート (mm → pt 修正)

```typescript
// src/lib/exportUtils.ts — 定数追加
export const MM_TO_PT = 2.8346  // 1mm = 2.8346pt

export async function exportReportToPdf(
  pageEls: HTMLElement[],
  definition: ReportDefinition,
  fileName = 'report.pdf'
): Promise<void> {
  const { paperSize, orientation, margins } = definition.pageSettings
  const dims = getPageDimensions(paperSize, orientation)

  // jsPDF を mm 単位で初期化
  const pdf = new jsPDF({ unit: 'mm', format: paperSize.toLowerCase(), orientation })

  for (let i = 0; i < pageEls.length; i++) {
    if (i > 0) pdf.addPage()
    const canvas = await html2canvas(pageEls[i], { scale: 2, useCORS: true })
    // mm 単位で配置 (余白考慮)
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      margins.left, margins.top,
      dims.width - margins.left - margins.right,
      dims.height - margins.top - margins.bottom,
    )
  }
  pdf.save(fileName)
}
```

**SVG 要素 (ShapeElement, HankoElement) の html2canvas 対応確認:**
- `html2canvas` は SVG の `foreignObject` を一部サポートしない
- 対策: Shape/Hanko の SVG を `<img src="data:image/svg+xml;...">` で描画するオプションを追加

#### P7-3. Print (window.print)

```typescript
// src/lib/printUtils.ts ★新規
export function printReport() {
  // キャンバスを一時的に .printable クラスに切り替え
  document.body.classList.add('printing')
  window.print()
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing')
  }, { once: true })
}
```

```css
/* src/index.css に追加 */
@media print {
  .no-print { display: none !important; }  /* toolbar, sidepanels */
  .printable { display: block !important; }
  @page {
    size: A4 portrait;
    margin: 0;  /* ReportCanvas のマージン設定を使用 */
  }
}
```

**新規テスト:**
- `src/lib/exportUtils.test.ts`
- `exportToJSON` → `importFromJSON` の往復テスト
- 旧 `Report` 形式のインポートで `migrateReport` が正しく動作
- `$schema` が不正のときエラーを返す

---

## System-Wide Impact

### 相互作用グラフ

```
Live Preview フロー:
BindingTab.onChange (300ms debounce)
  → layoutSlice.updateTestData(dsId, fieldKey, value)
  → usePreviewData() が再計算
  → PreviewPane (React.memo) が previewData 変化を検知
  → ReportCanvas (readonly, data=previewData)
  → ElementRenderer → RepeatingBandRenderer({ records=data['items'] })
  → RepeatingBandLiveRenderer → rows

masterHeader 変更フロー:
ToolbarMasterHeaderEdit.onSave
  → layoutSlice.updateMasterHeader(patch)
  → 全 PageDef.sections[0] に同期
  → layoutSlice.pushHistory() (undo 対象)
  → ReportCanvas が全ページ再レンダリング
```

### エラー伝播

| エラー | 発生場所 | 処理 |
|---|---|---|
| JSON パースエラー | `importFromJSON` | `{ ok: false, error }` を返す。UIトーストで表示 |
| 配列 JSON 構文エラー | BindingTab textarea | store に commit しない。textarea を赤表示 |
| records 空配列 | RepeatingBandLiveRenderer | ヘッダー行のみ + "データなし" 行を表示 |
| Section height 超過 | SectionContainer resize | body の最小 50mm を保証。超過分は body から削る |

### 状態ライフサイクルリスク

1. **ストア移行の中間状態**: `reportStore.ts` → `index.ts` への移行中は `useReportStore` が両方の import 元に存在しうる。移行は一括ファイルスイッチで行い、中間状態を作らない
2. **localStorage と旧形式**: ブラウザが旧 `Report` 形式を保持している場合、`loadReport` → `migrateReport()` を通す。`$schema` がないものはすべて旧形式とみなす
3. **PreviewPane と undo**: `updateTestData` は `pushHistory` を呼ばない。undo しても テストデータは残る — これは意図的な仕様 (テストデータは帳票定義の一部として保持)
4. **Element 集約移行中のビルド**: P3 の途中で `ElementRenderer.tsx` が部分的に移行済みの import を持つと型エラーが出る。型を前に移行し、実装を後から追う (index.ts → factory.ts → Renderer.tsx の順)

### 統合テストシナリオ

1. **ReportDefinition インポート → 編集 → エクスポート往復**: `importFromJSON(exportToJSON(def))` の完全ラウンドトリップ
2. **旧 Report 形式のインポート → migrateReport → 編集 → エクスポート**: 自動マイグレーションの動作確認
3. **BindingTab でテストデータ入力 → PreviewPane で表示更新 → RepeatingBand に配列を渡す**: Live Preview の E2E フロー
4. **masterHeader 更新 → 全ページ同期 → undo → masterHeader 元に戻る**: atomic history の確認
5. **50+ 要素のページで Live Preview オン/オフ**: パフォーマンス回帰なし (レンダリング < 100ms)

---

## Acceptance Criteria

### 型移行 (P1)
- [ ] `Report` 型を参照するコンポーネントが 0 になる (`grep -r "Report\b" src/` で型参照なし)
- [ ] `Page.elements[]` フィールドが廃止され `sections` のみになる
- [ ] 旧 `Report` 形式の JSON を `importFromJSON` に渡すと `ReportDefinition` に変換される

### ストア分割 (P2)
- [ ] `layoutSlice.ts` / `rulesSlice.ts` / `uiSlice.ts` が独立したスライスとして存在する
- [ ] `undo()` 実行後に layout と rules が両方とも 1 ステップ前に戻る
- [ ] `uiSlice` の zoom/grid 変更は undo 対象にならない
- [ ] 既存の 15 ファイルすべてが `npm run build` でエラーなくビルドできる

### 要素ファイル集約 (P3)
- [ ] `src/elements/{type}/` に 14 型のディレクトリが存在する
- [ ] `ElementRenderer.tsx` が 100 行以下のディスパッチャーになる
- [ ] `PropertiesPanel.tsx` が 150 行以下のディスパッチャーになる
- [ ] 各型の `index.ts` が `ALLOWED_KEYS` をエクスポートする

### Section コンテナ (P4)
- [ ] キャンバス上に header / body / footer の 3 セクションが表示される
- [ ] header / footer は薄いグレー背景で編集不可表示
- [ ] Section 下端のリサイズハンドルをドラッグすると高さが変わる (最小 10mm)
- [ ] masterHeader を更新すると全ページの header が同期される
- [ ] ページ追加時に masterHeader/Footer が新ページに引き継がれる

### 繰り返し要素実データレンダリング (P5)
- [ ] `records` prop を渡すと実データでテーブル行が描画される
- [ ] `records` が `undefined` のときフェードプレビューが表示される (既存動作維持)
- [ ] `sortBy` / `sortOrder` が正しく適用される
- [ ] `totals` の sum/count/avg/min/max が正しく計算される
- [ ] `maxItems=3` で 10 件のデータを渡すと 3 行のみ表示される

### Live Preview (P6)
- [ ] ツールバーの「プレビュー」ボタンでプレビューペインが表示/非表示される
- [ ] バインドタブのフィールド値を変更するとプレビューペインが 300ms 以内に更新される
- [ ] 配列フィールドに JSON 配列を入力すると RepeatingBand がリアルタイムで展開される
- [ ] 配列 JSON に構文エラーがある間はプレビューが前回の有効な状態を保持する
- [ ] テストデータは JSON エクスポートに含まれる

### エクスポート (P7)
- [ ] `exportToJSON(definition)` の出力に `$schema: "report-definition/v1"` が含まれる
- [ ] `importFromJSON(exportToJSON(definition))` で元の definition が復元される
- [ ] 旧 `Report` 形式 JSON のインポートがエラーなく成功する
- [ ] PDF エクスポートで各ページのサイズが mm 単位で正確に出力される
- [ ] `window.print()` でサイドパネル・ツールバーが印刷対象外になる

### テスト品質
- [ ] `npm run test:coverage` で全体カバレッジ 80% 以上 (現在 7.57%)
- [ ] 各 Phase の新規ファイルに対応するテストファイルが存在する

---

## Dependencies & Prerequisites

### 外部依存 (変更なし)
- `zustand` (^5.x) + `zustand/middleware/immer`
- `immer` — `JSON.parse(JSON.stringify)` でドラフト内クローンを継続使用
- `@dnd-kit/core` + `@dnd-kit/sortable` — Section DnD に使用
- `html2canvas` + `jspdf` — PDF エクスポート継続使用

### 内部依存 (実装順序)

> **⚠️ Technical Review 反映:** P7-2/P7-3 (PDF/Print) は P4 の SectionContainer DOM 構造に依存。依存グラフを修正。  
> (see: Technical Review — MEDIUM: P7 の PDF は P4 完了後)

```
P1 → P2 → P3 (並列開始可) → P4 → P7-2, P7-3 (PDF/Print)
P1 → P7-1 (JSON のみ、並列開始可)
P4 → P5 → P6
```

- P1 が完了しないと P2 は開始できない (型定義の前提)
- P2 が完了しないと P3~P6 はスライスを参照できない
- P3 は P2 完了後に並列開始可能 (ファイル集約は型に依存するが他フェーズに非依存)
- P7-1 (JSON エクスポート) は P1 完了後に並列開始可能
- P7-2/P7-3 (PDF/Print) は P4 完了後に実装 (SectionContainer DOM が確定してから)
- P5 は P4 完了後に開始 (P3 の `repeatingBand/` ディレクトリが存在することが前提)
- P6 は P5 に依存 (実データレンダリングなしにプレビューが意味をなさない)

---

## Risk Analysis & Mitigation

| リスク | 影響度 | 対策 |
|---|---|---|
| P2 ストア移行で 15 ファイルが壊れる | 高 | 移行は一括ではなくファイルごとに段階的に、ビルドを通しながら進める |
| P3 移行中の部分的ファイル集約でビルドエラー | 高 | 型定義 (index.ts) を先に移行し、Renderer/PropertiesPanel は後から追う。型エラーが出たら即時修正 |
| html2canvas が SVG 要素をレンダリングできない | 中 | Shape/Hanko で SVG を `<img src="data:image/svg+xml;">` に変換する逃げ道を最初から用意 |
| masterHeader 同期バグ (ページ間でオブジェクト共有) | 中 | `addPage` 時に deep clone (`JSON.parse(JSON.stringify)`) してから sections に追加 |
| Live Preview の 300ms debounce が遅い | 低 | 体感を確認してから 150ms に調整。まず 300ms で実装して計測 |
| 旧 Report 形式の localStorage 互換性 | 低 | `migrateReport()` を先に実装し、app 起動時のロード処理で自動変換 |
| テストカバレッジ 80% 未達 | 中 | 各 Phase のコーディング完了後に対応テストを書いてから次 Phase に進む (TDD 準拠) |

---

## File Checklist

### 新規作成
- [ ] `src/lib/migration.ts` — `migrateReport()` (旧 Report → ReportDefinition)
- [ ] `src/lib/aggregation.ts` — `aggregateField()` (RepeatingBand 集計)
- [ ] `src/store/types.ts` — StoreState 型定義
- [ ] `src/store/layoutSlice.ts` — pages/elements/selection アクション
- [ ] `src/store/rulesSlice.ts` — calculationRules/templateVariables アクション
- [ ] `src/store/uiSlice.ts` — zoom/grid/clipboard/history アクション
- [ ] `src/store/selectors.ts` — クロススライスセレクター
- [ ] `src/store/index.ts` — combine + 後方互換エイリアス
- [ ] `src/elements/_base/index.ts` — 共通型 + BASE_ALLOWED_KEYS
- [ ] `src/elements/text/` (4 ファイル)
- [ ] `src/elements/label/` (4 ファイル)
- [ ] `src/elements/dataField/` (4 ファイル)
- [ ] `src/elements/image/` (4 ファイル)
- [ ] `src/elements/shape/` (4 ファイル)
- [ ] `src/elements/table/` (4 ファイル)
- [ ] `src/elements/chart/` (4 ファイル)
- [ ] `src/elements/barcode/` (4 ファイル)
- [ ] `src/elements/manualEntry/` (4 ファイル)
- [ ] `src/elements/hanko/` (4 ファイル)
- [ ] `src/elements/approvalStampRow/` (4 ファイル)
- [ ] `src/elements/revenueStamp/` (4 ファイル)
- [ ] `src/elements/repeatingBand/` (4 ファイル — LiveRenderer 含む)
- [ ] `src/elements/repeatingList/` (4 ファイル — LiveRenderer 含む)
- [ ] `src/components/canvas/SectionContainer.tsx`
- [ ] `src/components/canvas/PreviewPane.tsx`
- [ ] `src/hooks/usePreviewData.ts`
- [ ] `src/lib/printUtils.ts`

### 更新
- [ ] `src/types/index.ts` — `ReportDefinition` に `masterHeader?`, `masterFooter?` を追加
- [ ] `src/store/reportStore.ts` — スライスへの転送シムに変換 (最終的に削除)
- [ ] `src/components/canvas/ElementRenderer.tsx` — 薄いディスパッチャーに変換
- [ ] `src/components/sidebar/PropertiesPanel.tsx` — 薄いディスパッチャーに変換
- [ ] `src/components/canvas/ReportCanvas.tsx` — SectionContainer を使うよう更新
- [ ] `src/components/toolbar/Toolbar.tsx` — Live Preview トグルボタンを追加
- [ ] `src/App.tsx` — PreviewPane を条件レンダリング
- [ ] `src/lib/exportUtils.ts` — JSON export/import + mm→pt 修正
- [ ] `src/templates/builtinTemplates.ts` — `ReportDefinition` 形式に更新

### テスト
- [ ] `src/lib/migration.test.ts`
- [ ] `src/lib/aggregation.test.ts`
- [ ] `src/store/layoutSlice.test.ts`
- [ ] `src/store/rulesSlice.test.ts`
- [ ] `src/store/uiSlice.test.ts`
- [ ] `src/elements/repeatingBand/Renderer.test.tsx`
- [ ] `src/elements/repeatingList/Renderer.test.tsx`
- [ ] `src/components/canvas/SectionContainer.test.tsx`
- [ ] `src/hooks/usePreviewData.test.ts`
- [ ] `src/lib/exportUtils.test.ts` (更新)
- [ ] `src/store/reportStore.test.ts` (更新)

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-05-architecture-decisions-brainstorm.md](../brainstorms/2026-04-05-architecture-decisions-brainstorm.md)

  Key decisions carried forward:
  - 3スライス分割 (layout/rules/ui) + uiSlice 内で layout+rules をアトミックにスナップショット
  - `src/elements/{type}/` 4ファイル集約パターン + ELEMENT_ALLOWED_KEYS を各 index.ts でエクスポート
  - Live Preview = 別プレビューペイン (ツールバートグル) + バインドタブインライン入力 + 300ms debounce
  - masterHeader/Footer を ReportDefinition トップレベルに追加、全ページ同期
  - 繰り返し要素実データレンダリングを Phase 2 → Phase 1 に前倒し (sortBy/totals/maxItems)

### Internal References

- 既存 Phase 1 計画: [docs/plans/2026-04-05-feat-phase1-report-design-studio-plan.md](2026-04-05-feat-phase1-report-design-studio-plan.md) — Sub-phase 1A~1F の詳細実装仕様
- アーキテクチャブレスト: [docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md](../brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md) — ストアスライス詳細設計
- 繰り返し要素ブレスト: [docs/brainstorms/2026-04-05-repeating-elements-brainstorm.md](../brainstorms/2026-04-05-repeating-elements-brainstorm.md) — RepeatingBand/List 完全型定義
- `src/types/index.ts` — ReportDefinition, Section, PageDef 型
- `src/store/reportStore.ts:152` — 現行 ReportStore インターフェース
- `src/components/canvas/ElementRenderer.tsx:36` — 現行 switch 構造 (912 行)
- `src/components/sidebar/PropertiesPanel.tsx:1492` — 現行 PropertiesPanel 本体 (1,645 行)
- `src/lib/exportUtils.ts` — 現行 65 行スタブ

### Related Work

- 既存 Phase 1 計画 (Sub-phase 1A: Foundation Libraries) は本計画の前提。特に `textStyleUtils.ts` / `tokenParser.ts` は P3 の Renderer 実装で使用する
