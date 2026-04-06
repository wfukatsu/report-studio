---
title: "feat: Phase 1 帳票デザインスタジオ — 全面実装"
type: feat
status: active
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md
---

# feat: Phase 1 帳票デザインスタジオ — 全面実装

## Overview

`report-design-studio-v2` の Phase 1 を完成させる。法定帳票・業務帳票・証明書に対応した 12 種の Element タイプ、Zustand スライスストア、TextElement インライン編集、Section コンテナ、Layer Panel、および日本固有要件（和暦・縦書き・印鑑・収入印紙等）をすべて実装する。

**三つのブレスト文書が設計の権威:**
- `docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md` — 全体アーキテクチャ、ストアスライス、Section/Layer/DataSource 詳細設計
- `docs/brainstorms/2026-04-05-text-element-brainstorm.md` — TextElement インライン編集・tokenParser・calculationEngine 完全仕様
- `docs/brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md` — Atomic Design コンポーネント分解・Props 定義

---

## 現在の実装状況（2026-04-05 時点）

### ✅ 完了済み

| ファイル | 内容 |
|---|---|
| `src/types/index.ts` | TextStyle 16 props、ElementType 14型（repeatingBand・repeatingList 追加）、全 Element インターフェース、CalculationRule/TemplateVariable/CalculationFormat 完全型 |
| `src/lib/elementFactories.ts` | 全 14 型のファクトリー関数（createRepeatingBandElement・createRepeatingListElement 追加）|
| `src/lib/numberFormatter.ts` | formatNumber/formatDate/formatWareki/toKanjiNumeral/applyFormat |
| `src/components/canvas/ElementRenderer.tsx` | 全 14 型のレンダリング（repeatingBand: ヘッダー・フェードプレビュー行・繰り返しインジケーター・集計フッター / repeatingList: カードグリッドプレビュー・フェード）|
| `src/components/sidebar/ElementPalette.tsx` | 6カテゴリのパレット（繰り返し要素カテゴリ追加・折りたたみ対応）|
| `src/store/reportStore.ts` | ELEMENT_ALLOWED_KEYS を全 14 型に拡張（repeatingBand・repeatingList 追加）|
| `src/components/sidebar/PropertiesPanel.tsx` | 全 14 型対応プロパティパネル（RepeatingBandSection・RepeatingListSection 追加）|
| UIモック `designs/report-editor-ui-20260405/finalized.html` | 繰り返し要素カテゴリ・キャンバスプレビュー・レイヤー項目・右パネルプロパティを反映 |

### ⬜ 未実装（本計画の対象）

全 6 サブフェーズで実装する。

---

## Problem Statement

現状の `reportStore.ts` は単一フラットな Zustand store であり、次の限界がある:

1. **型の不整合**: `CalculationRule = Record<string, unknown>` プレースホルダーのまま（本日解消済みだが store と型が未接続）
2. **履歴のスコープ不足**: undo/redo が `pages` 配列のみを対象。CalculationRule 変更は undo できない
3. **スライス非分割**: templateVariables・calculationRules 等の Rules データの置き場がない
4. **TextElement 機能不足**: インライン編集・@メンション・トークンパーサが未実装
5. **Section 視覚表現なし**: Section は型定義のみで、キャンバス上の視覚コンテナ帯が実装されていない
6. **Panel 機能不足**: Layer Panel は未実装、PropertiesPanel は基本タブのみ

---

## Proposed Solution

Phase 1 を 6 つのサブフェーズに分割して実装する。各フェーズはビルドが通る状態を保ちながら段階的に積み上げる。

---

## Technical Approach

### アーキテクチャ方針（ブレスト確定済み + リサーチ補強）

(see brainstorm: docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md#store-slice-詳細設計)

> **⚠️ リサーチ修正（2026-04-05）**: 当初ブレストでは separate `create` を想定したが、Zustand v5 のベストプラクティスは**単一 `create` + スライスファクトリ関数**の合成パターン。別々の `create` ではクロススライスアクセスが難しくなり、atomic undo/redo が実装できない。

```
// src/store/store.ts
export type StoreState = LayoutSlice & RulesSlice & HistorySlice

export const useReportStore = create<StoreState>()(
  immer((...a) => ({
    ...createLayoutSlice(...a),
    ...createRulesSlice(...a),
    ...createHistorySlice(...a),
  }))
)

// 後方互換エイリアス（既存コンポーネントが壊れない）
export const useLayoutStore = useReportStore
```

クロススライスセレクターは `src/store/selectors.ts` に独立させる（スライスファイル間の循環 import を防ぐ）:

```ts
// src/store/selectors.ts
export const selectAllMentionTokens = (state: StoreState): MentionToken[] => {
  const fromLayout = state.pages.flatMap(p => p.elements).flatMap(extractTokens)
  const fromRules = state.rules.flatMap(r => r.tokens)
  return [...new Set([...fromLayout, ...fromRules])]
}
```

後方互換: `export { useReportStore as useLayoutStore }` — シンプルな named re-export で型安全。

### mm 座標系

全 Element の position / size は mm 単位。Canvas レンダリング時のみ px 変換:

```ts
// src/lib/textStyleUtils.ts
export const mmToPx = (mm: number) => (mm / 25.4) * 96 * window.devicePixelRatio
export const pxToMm = (px: number) => (px * 25.4) / (96 * window.devicePixelRatio)
```

---

## Implementation Phases

### Sub-phase 1A: Foundation Libraries（ブロッカー）

**全サブフェーズの前提。最初に完成させる。**

#### 1A-1. `src/lib/textStyleUtils.ts` ★新規

```ts
// mergeStyle: Partial<TextStyle> を defaultStyle で補完 (CSS inherit モデル)
export function mergeStyle(base: TextStyle, override: Partial<TextStyle>): TextStyle

// TextStyle → React.CSSProperties (scale 適用)
export function textStyleToCss(
  style: Partial<TextStyle>,
  defaultStyle: TextStyle,
  scale: number
): React.CSSProperties

// 定数
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: 3.5, fontFamily: 'sans-serif', fontWeight: 'normal',
  color: '#000000', textAlign: 'left', verticalAlign: 'top',
  lineHeight: 1.4, writingMode: 'horizontal-tb', /* ... */
}

export const mmToPx = (mm: number) => (mm / 25.4) * 96 * window.devicePixelRatio
export const pxToMm = (px: number) => (px * 25.4) / (96 * window.devicePixelRatio)
```

テスト: `src/lib/textStyleUtils.test.ts`
- `mergeStyle`: undefined プロパティは base で補完、defined プロパティは override 優先
- `textStyleToCss`: mm → px 変換、writingMode が正しく渡る

#### 1A-2. `src/lib/tokenParser.ts` ★新規

(see brainstorm: docs/brainstorms/2026-04-05-text-element-brainstorm.md#tokenparserts詳細設計)

```ts
// TOKEN_REGEX: /\{\{([^}]+)\}\}/g
export type TokenSegment = { type: 'text'; value: string } | { type: 'token'; key: string; raw: string }

export function parseTokens(content: string): TokenSegment[]
export function insertMentionToken(
  content: string, triggerIndex: number, queryLength: number, tokenKey: string
): { newContent: string; newCursorOffset: number }
export function detectMentionTrigger(content: string, cursorOffset: number): MentionTriggerState | null
export function getCursorOffsetInText(el: HTMLDivElement): number
export function setCursorAtOffset(el: HTMLDivElement, offset: number): void
```

テスト: `src/lib/tokenParser.test.ts`
- `parseTokens`: `"Hello {{name}}"` → 2 segments
- `insertMentionToken`: `@` から `{{key}}` への置換、カーソル位置の正確な計算
- `detectMentionTrigger`: `@abc` → `{ triggerIndex, query: 'abc' }`

#### 1A-3. `src/lib/calculationEngine.ts` ★新規

(see brainstorm: docs/brainstorms/2026-04-05-text-element-brainstorm.md#calculationrule詳細設計)

完全な再帰下降パーサ + 評価器。AST ノード型:

```ts
type ASTNode =
  | { type: 'NumberLiteral'; value: number }
  | { type: 'StringLiteral'; value: string }
  | { type: 'FieldRef'; path: string }
  | { type: 'CalcRef'; key: string }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] }
  | { type: 'BinaryOp'; op: '+' | '-' | '*' | '/' | '%'; left: ASTNode; right: ASTNode }
  | { type: 'Compare'; op: '==' | '!=' | '>' | '>=' | '<' | '<='; left: ASTNode; right: ASTNode }
  | { type: 'LogicalOp'; op: 'AND' | 'OR'; left: ASTNode; right: ASTNode }
  | { type: 'Not'; operand: ASTNode }
  | { type: 'UnaryMinus'; operand: ASTNode }
  | { type: 'IsBlank'; operand: ASTNode }

export function evaluateExpression(
  expression: string,
  context: EvaluationContext
): number | string | boolean

export function sortCalculationRules(rules: CalculationRule[]): CalculationRule[]
export class CircularDependencyError extends Error {}
```

`EvaluationContext`:
```ts
interface EvaluationContext {
  fields: Record<string, unknown>     // DataSource fields
  tplVars: Record<string, string>     // templateVariables
  calcResults: Record<string, unknown> // 既計算の CalculationRule 結果
  systemVars?: { pageNumber?: number; totalPages?: number; today?: Date }
}
```

テスト: `src/lib/calculationEngine.test.ts`
- 四則演算: `"2 + 3 * 4"` → `14`
- 文字列連結: `"{{field.name}} 様"` → `"山田太郎 様"`
- 条件式: `"IF({{total}} > 50000, '大口', '通常')"` → `'大口'`
- 和暦変換: `"WAREKI({{issueDate}})"` → `"令和8年4月1日"`
- 循環参照: `CircularDependencyError` をスロー

---

### Sub-phase 1B: Zustand Store Migration

**既存 `reportStore.ts` を Slice パターンに移行。**

(see brainstorm: docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md#layoutslice)

#### 1B-0. `src/store/types.ts` ★新規（循環 import 回避用）

```ts
// LayoutSlice + RulesSlice + HistorySlice の型を一箇所に集約
// 各スライスファイルはここから import するだけでクロスインポートが不要
export type StoreState = LayoutSlice & RulesSlice & HistorySlice
```

#### 1B-1. `src/store/layoutSlice.ts` ★新規

スライスファクトリパターン（Zustand v5 推奨）:

```ts
import { type StateCreator } from 'zustand'
import type { StoreState } from './types'

export type LayoutSlice = { /* ... */ }

export const createLayoutSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  LayoutSlice
> = (set, get) => ({ /* ... */ })
```

State shape:
```ts
interface LayoutState {
  reportDefinition: ReportDefinition
  selection: SelectionState
}
```

全アクション（ブレスト定義）:

| グループ | アクション |
|---|---|
| Metadata | `updateMetadata`, `updatePageSettings`, `updateDefaultTextStyle` |
| Page | `addPage`, `removePage`, `renamePage`, `reorderPages`, `setActivePage` |
| Section | `addSection`, `removeSection`, `updateSection`, `setSectionHeight`, `reorderSections` |
| Element | `addElement`, `updateElement`, `removeElement`, `moveElement`, `resizeElement`, `duplicateElement`, `moveElementToSection`, `setElementLocked`, `setElementVisible`, `updateZIndex`, `bringToFront`, `sendToBack` |
| Selection | `selectElement`, `selectElements`, `selectAll`, `clearSelection`, `setActiveSectionId` |
| Load | `loadReportDefinition`, `newReport`, `exportJSON`, `importJSON` |

セレクター:
```ts
export const selectActivePage = (s: LayoutState): PageDef | null
export const selectAllPageElements = (page: PageDef): ReportElement[]
export const selectElementById = (page: PageDef, id: string): ReportElement | undefined
export const selectSectionForElement = (page: PageDef, elementId: string): Section | undefined
export const selectSelectedElements = (s: LayoutState): ReportElement[]
```

#### 1B-2. `src/store/rulesSlice.ts` ★新規

State:
```ts
interface RulesState {
  templateVariables: TemplateVariable[]
  calculationRules: CalculationRule[]
  validationRules: ValidationRule[]  // Phase 3 まで空配列スタブ
}
```

アクション:
- `addTemplateVariable`, `updateTemplateVariable`, `removeTemplateVariable`
- `addCalculationRule`, `updateCalculationRule`, `removeCalculationRule`, `reorderCalculationRules`

セレクター:
```ts
export const selectAllMentionTokens = (layout: LayoutState, rules: RulesState): MentionToken[]
```

#### 1B-3. `src/store/historySlice.ts` ★新規（historyStore.ts → historySlice.ts に名称変更）

単一 `create` に統合するため `historySlice.ts` に改名。`get()` で全スライスを atomic に snapshot:

```ts
type HistorySnapshot = Pick<StoreState, 'pages' | 'rules'>

export type HistorySlice = {
  _history: HistorySnapshot[]
  _future: HistorySnapshot[]
  pushHistory(): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
}

export const createHistorySlice: StateCreator<StoreState, ...> = (set, get) => ({
  _history: [], _future: [],

  pushHistory: () => {
    const { pages, rules } = get()
    const snap: HistorySnapshot = JSON.parse(JSON.stringify({ pages, rules }))
    set(draft => {
      draft._history.push(snap)
      draft._future = []
      if (draft._history.length > 100) draft._history.shift()
    })
  },

  undo: () => {
    const { _history, _future, pages, rules } = get()
    if (!_history.length) return
    const prev = _history[_history.length - 1]
    const current: HistorySnapshot = JSON.parse(JSON.stringify({ pages, rules }))
    set(draft => {
      draft._history.pop()
      draft._future.unshift(current)
      draft.pages = prev.pages
      draft.rules = prev.rules   // ← 単一 set() で layout + rules を atomic 復元
    })
  },
  // redo: 同様
})
```

デバウンス戦略（ブレスト準拠）:

| アクション | push タイミング |
|---|---|
| addElement / removeElement / duplicate | 即時 |
| updateElement (text/style) | 300ms デバウンス |
| moveElement / resizeElement | ドラッグ終了時 |
| Section CRUD | 即時 |
| Rules 変更 | 即時 |

#### 1B-4. `src/store/store.ts` + `src/store/index.ts` ★新規

```ts
// src/store/store.ts — 単一 create で全スライスを統合
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createLayoutSlice } from './layoutSlice'
import { createRulesSlice } from './rulesSlice'
import { createHistorySlice } from './historySlice'
import type { StoreState } from './types'

export const useReportStore = create<StoreState>()(
  immer((...a) => ({
    ...createLayoutSlice(...a),
    ...createRulesSlice(...a),
    ...createHistorySlice(...a),
  }))
)

// テスト用リセット: useReportStore.setState(useReportStore.getInitialState())
```

```ts
// src/store/index.ts — 再エクスポート + 後方互換エイリアス
export { useReportStore } from './store'
export { useReportStore as useLayoutStore } from './store'  // 後方互換
export * from './selectors'
export type { StoreState } from './types'
```

#### 1B-5. 全コンポーネントのストア参照を更新

移行対象ファイル:

| ファイル | 主な変更 |
|---|---|
| `src/components/canvas/ReportCanvas.tsx` | `report.pages` → `reportDefinition.pages` |
| `src/components/canvas/CanvasElement.tsx` | `report.settings` → `reportDefinition.pageSettings` |
| `src/components/sidebar/PropertiesPanel.tsx` | `report.settings` → store actions |
| `src/components/sidebar/DataSourcePanel.tsx` | `report.dataSource` → `dataSources[0]` |
| `src/components/sidebar/PagePanel.tsx` | `report.pages` → `reportDefinition.pages` |
| `src/components/toolbar/Toolbar.tsx` | undo/redo → `useHistoryStore` |
| `src/App.tsx` | ストア初期化 |
| `src/templates/builtinTemplates.ts` | `Report` → `ReportDefinition` |

テスト: `src/store/layoutSlice.test.ts`, `src/store/rulesSlice.test.ts`, `src/store/historyStore.test.ts`

---

### Sub-phase 1C: Canvas & Section Container

#### 1C-1. `src/lib/textStyleUtils.ts` の ElementRenderer への統合

`src/components/canvas/ElementRenderer.tsx` を更新:
- `mergeStyle(defaultTextStyle, el.style)` を各レンダラーで使用
- `textStyleToCss(style, defaultTextStyle, scale)` でスタイル適用
- `scale` prop を Props に追加

#### 1C-2. `src/components/canvas/SectionContainer.tsx` ★新規

(see brainstorm: docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md#section-コンテナ-詳細設計)

```tsx
interface SectionContainerProps {
  section: Section
  pageId: string
  scale: number
  data?: Record<string, unknown>
  readonly?: boolean
}
```

レイアウト構造:

```
┌─ Section Header Bar ─────────────────────────────────────┐
│ [≡] [body ▾] Body                         [+] [⋮]        │
├──────────────────────────────────────────────────────────┤
│  ← AbsoluteLayout: Element[]                          →  │
│                               ↕ resize handle (5px)      │
└──────────────────────────────────────────────────────────┘
```

機能:
- Section ヘッダー: sectionType バッジ、ラベル、追加/メニューボタン
- `@dnd-kit/sortable` による Section 間 DnD（Section レベルの SortableContext）
- resize handle でのドラッグによる高さ変更（`setSectionHeight` を呼ぶ）
- Section 内の AbsoluteLayout（既存 CanvasElement を流用）

**dnd-kit 実装パターン（リサーチ補強済み）:**

> **⚠️ DndContext はネストしない**: ライブラリ作者推奨は単一 `DndContext` のみ。ネストした DndContext ではイベントが内側で止まり外側に届かない。Section ソート（SortableContext）と Element 自由配置（useDraggable）を単一 DndContext 内で `active.data.current.type` で振り分ける。

```tsx
// 単一 DndContext で Section ソート + Element 移動を処理
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
    {sections.map(s => (
      <SortableSection key={s.id} section={s}>
        {s.elements.map(el => (
          <DraggableElement key={el.id} element={el} />
        ))}
      </SortableSection>
    ))}
  </SortableContext>
  <DragOverlay>{activeItem ? <ElementGhost /> : null}</DragOverlay>
</DndContext>

// Layer Panel は別ツリーなので独立した DndContext で OK

// センサー設定: 5px 移動でドラッグ開始 → 短いクリックは onSelect のまま
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor)
)

// onDragEnd での振り分け
function handleDragEnd({ active, delta }: DragEndEvent) {
  const type = active.data.current?.type as 'section' | 'element'
  if (type === 'element') {
    const dxMm = delta.x / PX_PER_MM
    const dyMm = delta.y / PX_PER_MM
    store.moveElement(active.id as string, dxMm, dyMm)
  }
}
```

**Section リサイズハンドル**: dnd-kit の `useDraggable` を使わず、ネイティブ `pointerdown/move/up` で実装。`e.stopPropagation()` で外側の PointerSensor に届かないようにする。

**パフォーマンス（50+ elements）**: `React.memo` で draggable wrapper と render-heavy content を分離 + `DragOverlay` でオリジナルノードへの transform 適用を排除 + `data` は `useMemo` で安定化。

#### 1C-3. `src/components/canvas/ReportCanvas.tsx` の Section 対応更新

現状: pages の elements を flat に描画  
変更後:
- `page.sections` をループして SectionContainer を縦積みに描画
- Section の高さ合計 = ページ高さ - margin.top - margin.bottom を保証
- Ruler / スナップライン を維持

#### 1C-4. `src/hooks/useInlineEdit.ts` ★新規

(see brainstorm: docs/brainstorms/2026-04-05-text-element-brainstorm.md#インライン編集コンポーネント分解)

```ts
interface UseInlineEditReturn {
  isEditing: boolean
  content: string
  editorRef: RefObject<HTMLDivElement>
  enterEditMode(): void
  commitEdit(): void
  cancelEdit(): void
  isComposing: boolean
  handleCompositionStart(): void
  handleCompositionEnd(e: CompositionEvent): void
  handleInput(e: Event): void
  handleKeyDown(e: KeyboardEvent): void
  mentionState: MentionState | null
  handleMentionSelect(tokenKey: string): void
}
```

contenteditable 実装パターン（リサーチ補強済み）:

> **⚠️ React 合成イベント不使用**: IME イベントは React の synthetic events ではなくネイティブ `addEventListener` で処理。React は compositionend と input のイベント順序をブラウザ間で正規化するが、その正規化が IME との組み合わせで壊れるケースがある（React issue #3926, #8683）。

```ts
// composingRef で IME 状態を手動管理
const composingRef = useRef(false)

useEffect(() => {
  const el = editorRef.current
  if (!el) return
  const onCompositionStart = () => { composingRef.current = true }
  const onCompositionEnd = () => {
    composingRef.current = false
    workingValueRef.current = el.textContent ?? ''
  }
  const onInput = () => {
    if (composingRef.current) return  // 変換中は無視
    workingValueRef.current = el.textContent ?? ''
  }
  el.addEventListener('compositionstart', onCompositionStart)
  el.addEventListener('compositionend', onCompositionEnd)
  el.addEventListener('input', onInput)
  return () => { /* cleanup */ }
}, [])
```

追加実装要件（リサーチ結果）:
- paste → `e.clipboardData.getData('text/plain')` + `execCommand('insertText')` （Clipboard API フォールバック付き）
- トークンスパン HTML は DOMPurify でサニタイズ（`ALLOWED_TAGS: ['span', '#text']`）
- カーソル保持: `innerHTML` 書き換え前後に character-offset ブックマーク save/restore
- React 18: 編集中の値は `workingValueRef` に保持、`onBlur` でのみ store にコミット（composition 中に setState 禁止）
- **`vertical-rl` Chrome バグ**: 縦書き contenteditable では arrow key が正しく動かない。対策: 縦書き要素はクリックで**横書きオーバーレイを表示**して編集し、確定後に縦書き表示に戻す

#### 1C-5. `src/components/canvas/TextInlineEditor.tsx` ★新規

```tsx
interface TextInlineEditorProps {
  element: TextElement
  pageId: string
  scale: number
  defaultTextStyle: TextStyle
  mentionTokens: MentionToken[]
  onCommit(newContent: string): void
  onCancel(): void
}
```

- `useInlineEdit` を使用
- `contenteditable="true"` div をオーバーレイ
- `MentionPicker` を `mentionState` があるときに表示

#### 1C-6. `src/components/canvas/MentionPicker.tsx` ★新規

```tsx
interface MentionPickerProps {
  query: string
  tokens: MentionToken[]
  anchorRect: DOMRect
  onSelect(tokenKey: string): void
  onClose(): void
}
```

- `query` でトークンをフィルタ
- キーボード操作（↑↓ Enter Escape）
- カテゴリ別表示（tplVar / calc / field / system）

---

### Sub-phase 1D: Properties UI

#### 1D-1. `src/components/sidebar/tabs/BasicPropsTab.tsx` ★新規

```tsx
interface BasicPropsTabProps {
  element: ReportElement
  pageId: string
  onUpdate(patch: Partial<ReportElement>): void
}
```

フィールド:
- Position X, Y（`PropInputUnit` mm）
- Size W, H（`PropInputUnit` mm）
- zIndex（`PropInput` number）
- name（`PropInput` text）
- visible（`Toggle`）
- locked（`Toggle`）
- printable（`Toggle`）

#### 1D-2. `src/components/sidebar/tabs/StylePropertiesTab.tsx` ★新規

(see brainstorm: docs/brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md#stylepropertiestab)

```tsx
interface StylePropertiesTabProps {
  style: Partial<TextStyle>
  defaultStyle: TextStyle       // PropInputUnit の placeholder 用
  onUpdate(patch: Partial<TextStyle>): void
  onResetAll(): void
}
```

16 props を 4 グループで表示:
1. **フォント**: fontFamily(Select), fontSize(PropInputUnit), fontWeight/fontStyle/textDecoration(Toggle)
2. **色**: color(ColorInput), backgroundColor(ColorInput)
3. **配置**: textAlign(TextAlignGroup), verticalAlign(SegmentedControl), writingMode(Toggle)
4. **余白・行間**: lineHeight(PropInputUnit), letterSpacing(PropInputUnit), padding × 4(PaddingInputGroup)

継承状態対応: `value: undefined` → グレー italic で default 値を表示 + ✕ リセットボタン

#### 1D-3. `src/components/sidebar/tabs/BindingPropertiesTab.tsx` ★新規

element.type に応じて表示フィールドを変える:

| type | フィールド |
|---|---|
| text | content テキストエリア（@mention ヒント付き）|
| dataField | fieldKey 入力 + format 設定 + fallbackText |
| hanko | binding（フィールドパス）|
| barcode | value（{{token}} 対応）|
| table | dataBinding（Phase 2 stub）|

#### 1D-4. `src/components/sidebar/tabs/VisibilityRuleTab.tsx` ★新規

```tsx
interface VisibilityRuleTabProps {
  visibilityRule?: string
  onUpdate(rule: string | undefined): void
}
```

- CodeMirror エディタ（`@uiw/react-codemirror`）
- 式の評価プレビュー（context を sample data で評価）
- エラー表示

#### 1D-5. `src/components/sidebar/PropertiesPanel.tsx` の更新

タブ構成を element.type に応じて変更:

```ts
const TAB_CONFIG: Record<ElementType, string[]> = {
  text:             ['basic', 'style', 'binding', 'visibility'],
  label:            ['basic', 'style'],
  image:            ['basic', 'image'],
  shape:            ['basic', 'shape'],
  dataField:        ['basic', 'style', 'binding', 'visibility'],
  table:            ['basic', 'table', 'binding'],
  chart:            ['basic', 'chart'],
  manualEntry:      ['basic', 'style', 'constraint'],
  hanko:            ['basic', 'hanko', 'binding'],
  barcode:          ['basic', 'barcode'],
  approvalStampRow: ['basic', 'stamprow'],
  revenueStamp:     ['basic', 'revenuestamp'],
}
```

多選択時: 共通フィールド（position/size/zIndex/visible/locked）のみ表示。

#### 1D-6. `src/components/sidebar/LayerPanel.tsx` ★新規

(see brainstorm: docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md#layer-panel-詳細設計)

```tsx
// ツリー構造
LayerPanel
  └─ SectionLayerItem (折りたたみ可)
      └─ ElementLayerItem[] (DnD で zIndex 並替え)
```

機能:
- 要素選択のキャンバスとの双方向同期
- 👁 visible / 🔒 locked トグル
- ダブルクリックでインライン名前変更
- Section 折りたたみ/展開
- 要素の DnD（Section 内 zIndex 並替え）

Phase 1 スコープ外: Section 間の要素移動（コンテキストメニューで代替）

#### 1D-7. `src/components/dialogs/TemplateSettingsDialog.tsx` ★新規

5 タブ構成:

| タブ | 内容 |
|---|---|
| メタデータ | documentName, version, reportType, regulation, effectiveFrom/To |
| ページ設定 | paperSize(Select), orientation(Toggle), margins(PropInputUnit×4) |
| テキストデフォルト | `StylePropertiesTab`（`defaultTextStyle` を編集）|
| テンプレート変数 | TemplateVariable CRUD（key/label/description/defaultValue）|
| 計算式 | CalculationRule CRUD + CodeMirror 式エディタ |

#### 1D-8. `src/components/sidebar/DataSourcePanel.tsx` の更新

現状のダミーツリーを実装:
- `DataSourceNode` を再帰的に展開
- `inferFieldType()` による型アイコン表示
- JSON 貼り付け → `setDataSource()` フロー
- サンプルデータ初期表示

---

### Sub-phase 1E: App Shell

#### 1E-1. `react-router-dom` インストール・設定

```bash
npm install react-router-dom
```

`src/App.tsx` にルーティング:

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<TemplateGalleryPage />} />
    <Route path="/editor" element={<EditorPage />} />
    <Route path="/editor/:templateId" element={<EditorPage />} />
  </Routes>
</BrowserRouter>
```

#### 1E-2. `src/pages/EditorPage.tsx` ★新規

現状の `App.tsx` のエディタ部分を移動:
- EditorLayout（CSS Grid）
- AppHeader / EditorToolbar / 左パネル / キャンバス / 右パネル / ボトムパネル

#### 1E-3. `src/pages/TemplateGalleryPage.tsx` ★新規

既存の `TemplateGallery.tsx` を組み込み + 「新規テンプレート」ボタン。

#### 1E-4. `src/components/toolbar/Toolbar.tsx` → `EditorToolbar.tsx` リファクタ

`useHistoryStore` への接続:
- undo/redo ボタン: `canUndo()`, `canRedo()` の状態を反映
- ズームコントロール
- バリアント切り替え（Phase 4 stub）
- TemplateSettingsDialog 起動ボタン

#### 1E-5. `src/hooks/useLocalStoragePersistence.ts` ★新規

```ts
// 帳票 JSON を localStorage に自動保存 (1秒デバウンス)
export function useLocalStoragePersistence(reportId: string): void
// 保存した帳票一覧を取得
export function listSavedReports(): ReportSummary[]
// 特定の帳票を削除
export function deleteSavedReport(reportId: string): void
```

---

### Sub-phase 1F: Export & Polish

#### 1F-1. `src/lib/exportUtils.ts` の更新

PDF 出力の mm → pt 変換（1mm ≈ 2.8346pt）:

```ts
const MM_TO_PT = 2.8346

function exportPDF(canvasRefs: RefObject<HTMLDivElement>[]): Promise<void>
// html2canvas で各ページを PNG に変換後、jsPDF で mm → pt 変換して配置
```

新規 Element タイプ（hanko, barcode, approvalStampRow 等）が html2canvas で正しくレンダリングされることを検証。SVG ベースの要素（ShapeElement, HankoElement）は html2canvas の SVG 対応を確認。

#### 1F-2. JSON エクスポート/インポートの更新

`ReportDefinition` 形式での完全な JSON エクスポート:

```ts
function exportReportDefinitionJSON(def: ReportDefinition): string
function importReportDefinitionJSON(json: string): ReportDefinition | null
```

レガシー `Report` 形式の読み込みにも対応（`importJSON` で自動マイグレーション）。

#### 1F-3. Storybook stories の更新

影響を受ける stories の更新（旧 `useReportStore` 参照の更新）:
- `Toolbar.stories.tsx`
- `PropertiesPanel.stories.tsx`
- `ElementRenderer.stories.tsx`
- `ReportCanvas.stories.tsx`

---

## System-Wide Impact

### 相互作用グラフ

```
ElementPalette.onAdd
  → layoutSlice.addElement(pageId, sectionId, element)
  → historyStore.pushSnapshot()
      → 全コンポーネントが useLayoutStore を通じて再レンダリング

TextInlineEditor.commitEdit
  → layoutSlice.updateElement(patch: { content })
  → [300ms debounce] → historyStore.pushSnapshot()

TemplateSettingsDialog.saveCalculationRule
  → rulesSlice.updateCalculationRule()
  → historyStore.pushSnapshot()
  → selectAllMentionTokens が再計算
  → MentionPicker の候補リストが更新
```

### エラー伝播

- `calculationEngine.evaluateExpression` でエラー: `onError` ポリシーに応じて `0` / `''` / `'#ERROR'` を返す（throw しない）
- `CircularDependencyError`: TemplateSettingsDialog でキャッチし、ユーザーへのエラートーストで通知
- `importJSON` でパースエラー: `{ ok: false, error: string }` を返し、UIトーストで表示

### 状態ライフサイクルリスク

- Store migration 時: `useReportStore` → `useLayoutStore` の alias が破れると全コンポーネントが壊れる。移行は一括で行い、中間状態を作らない
- localStorage: 帳票 JSON が巨大になる場合の quota exceeded → エラーハンドリングを明示的に実装

### 統合テストシナリオ

1. **テンプレート選択 → エディタ起動 → 要素追加 → undo → redo**: 全スライスの atomic 復元を確認
2. **@mention 挿入 → TemplateSettingsDialog で変数編集 → キャンバスでプレビュー**: cross-store 更新の反映
3. **Section DnD → Layer Panel のツリー同期**: Section 順序変更がキャンバスと同時に反映
4. **大量要素（50+）でのパフォーマンス**: Canvas re-render 頻度の確認
5. **localStorage 保存 → ブラウザリロード → 帳票復元**: 完全な永続化ラウンドトリップ

---

## Acceptance Criteria

### 機能要件

- [ ] 12 種類の Element をパレットからキャンバスに追加できる
- [ ] 全 Element をキャンバス上でドラッグ移動・リサイズできる
- [ ] Section が視覚的なコンテナ帯として表示される（ヘッダー・ボーダー・ラベル）
- [ ] Section の順序をドラッグ&ドロップで変更できる
- [ ] Section 高さをリサイズハンドルで変更できる
- [ ] TextElement をダブルクリックしてインライン編集できる
- [ ] `@` で始まるメンションにより変数候補ピッカーが表示される
- [ ] `{{key}}` トークンがプレビュー時にデータ値で置換される
- [ ] TemplateSettingsDialog でテンプレート変数と計算式を編集できる
- [ ] Layer Panel で全要素の階層ツリーが表示される
- [ ] Layer Panel で visible/locked トグル、名前変更ができる
- [ ] DataSource Panel に JSON を貼り付けるとフィールドツリーが更新される
- [ ] Properties Panel で BasicPropsTab / StylePropertiesTab が機能する
- [ ] StylePropertiesTab で CSS inherit モデルが正しく動作する（undefined = デフォルト継承）
- [ ] Undo/Redo が layout + rules の変更を atomic に復元する
- [ ] 帳票が localStorage に自動保存され、リロード後に復元される
- [ ] JSON エクスポートで `ReportDefinition` 形式のファイルが出力される
- [ ] PDF エクスポートで mm 座標が正しく pt に変換される

### 日本語固有要件

- [ ] DataFieldElement で `format: 'wareki_full'` が令和年号で表示される
- [ ] TextElement で `writingMode: 'vertical-rl'` が縦書き表示される
- [ ] HankoElement が SVG で円形二重枠として表示される
- [ ] ApprovalStampRowElement が多段印鑑欄として表示される（5段デフォルト）
- [ ] RevenueStampElement が「収入印紙」ラベル付きの枠として表示される
- [ ] BarcodeElement（QR）が `qrcode.react` で正しく表示される
- [ ] `toKanjiNumeral(1000000)` → `"金百万円也"` が正確

### 非機能要件

- [ ] `npm run build` が型エラーゼロで通る
- [ ] テストカバレッジが 80% 以上（lib/ を中心に）
- [ ] 100 要素のキャンバスで 60fps を維持（不要な re-render がない）
- [ ] Storybook が全 stories エラーなし

---

## Dependencies & Prerequisites

### 追加インストール済み

- `qrcode.react` — QRコードレンダリング ✅
- `react-barcode` — Code128 バーコード ✅

### 追加インストール必要

```bash
npm install react-router-dom @uiw/react-codemirror @codemirror/lang-javascript
npm install -D @types/react-router-dom
```

### コンポーネント追加依存

- `@uiw/react-codemirror` — visibilityRule エディタ、CalculationRule エディタ
- `react-router-dom` — ページルーティング
- `immer` (既存) — 全スライスで使用

---

## Risk Analysis & Mitigation

| リスク | 影響度 | 対策 |
|---|---|---|
| Store migration でコンポーネント一斉破壊 | 高 | 1B を最初のコミットとして一括移行。中間状態を作らない。単一 `create` 統合パターンで後方互換エイリアスを提供 |
| contenteditable の IME（特に Chrome + macOS 日本語）| 中 | **ネイティブ addEventListener のみ使用**。React 合成イベント禁止。`composingRef` で状態管理。値は `workingValueRef` → blur でコミット |
| `vertical-rl` contenteditable の Chrome バグ | 中 | 縦書き要素は**横書きオーバーレイで編集**するミティゲーション。Chrome の arrow key バグを完全回避 |
| html2canvas が SVG/CSS writing-mode を未サポート | 中 | v1.4+ で SVG サポート済みを確認。問題時は SVG → Canvas 変換を手動実装 |
| dnd-kit の nested DndContext | 低 | 単一 `DndContext` のみ使用（ライブラリ作者推奨）。Layer Panel は別ツリーで独立した DndContext |
| calculationEngine の循環参照で無限ループ | 高 | `sortCalculationRules()` の topological sort で事前検出。timeout guard も追加 |
| immer 内 `structuredClone` がプロキシを壊す | 低 | `JSON.parse(JSON.stringify(...))` のみ使用（既存コードと統一済み）。immer draft で `structuredClone` 禁止 |
| localStorage quota exceeded（大帳票）| 低 | try/catch で quota エラーをキャッチしてトースト表示 |

---

## File Checklist

### 新規作成ファイル

- [ ] `src/lib/textStyleUtils.ts`
- [ ] `src/lib/textStyleUtils.test.ts`
- [ ] `src/lib/tokenParser.ts`
- [ ] `src/lib/tokenParser.test.ts`
- [ ] `src/lib/calculationEngine.ts`
- [ ] `src/lib/calculationEngine.test.ts`
- [ ] `src/store/types.ts`
- [ ] `src/store/layoutSlice.ts`
- [ ] `src/store/layoutSlice.test.ts`
- [ ] `src/store/rulesSlice.ts`
- [ ] `src/store/rulesSlice.test.ts`
- [ ] `src/store/historySlice.ts`
- [ ] `src/store/historySlice.test.ts`
- [ ] `src/store/store.ts`
- [ ] `src/store/selectors.ts`
- [ ] `src/store/index.ts`
- [ ] `src/hooks/useInlineEdit.ts`
- [ ] `src/hooks/useLocalStoragePersistence.ts`
- [ ] `src/components/canvas/SectionContainer.tsx`
- [ ] `src/components/canvas/TextInlineEditor.tsx`
- [ ] `src/components/canvas/MentionPicker.tsx`
- [ ] `src/components/sidebar/LayerPanel.tsx`
- [ ] `src/components/sidebar/tabs/BasicPropsTab.tsx`
- [ ] `src/components/sidebar/tabs/StylePropertiesTab.tsx`
- [ ] `src/components/sidebar/tabs/BindingPropertiesTab.tsx`
- [ ] `src/components/sidebar/tabs/VisibilityRuleTab.tsx`
- [ ] `src/components/dialogs/TemplateSettingsDialog.tsx`
- [ ] `src/pages/EditorPage.tsx`
- [ ] `src/pages/TemplateGalleryPage.tsx`

### 更新ファイル

- [ ] `src/store/reportStore.ts` → 削除 or deprecated stub のみ残す
- [ ] `src/components/canvas/ReportCanvas.tsx` — Section 対応
- [ ] `src/components/canvas/CanvasElement.tsx` — inline edit DblClick、mm 座標
- [ ] `src/components/canvas/ElementRenderer.tsx` — scale/defaultTextStyle 対応
- [ ] `src/components/sidebar/PropertiesPanel.tsx` — タブ切り替えロジック
- [ ] `src/components/sidebar/DataSourcePanel.tsx` — 実装
- [ ] `src/components/sidebar/PagePanel.tsx` — layoutSlice 接続
- [ ] `src/components/toolbar/Toolbar.tsx` — historyStore 接続
- [ ] `src/App.tsx` — Router 設定
- [ ] `src/templates/builtinTemplates.ts` — ReportDefinition 形式に更新
- [ ] `src/lib/exportUtils.ts` — mm → pt PDF 変換
- [ ] Storybook stories（4ファイル）

---

## Sources & References

### Origin

- **アーキテクチャブレスト:** [docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md](../brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md)
  — 主要決定: mm座標系・Zustand スライスパターン・Section 視覚コンテナ帯・12 Element 型・日本固有要件
- **TextElement ブレスト:** [docs/brainstorms/2026-04-05-text-element-brainstorm.md](../brainstorms/2026-04-05-text-element-brainstorm.md)
  — 主要決定: contenteditable 実装・tokenParser 完全設計・calculationEngine AST・MentionPicker UX
- **Atomic Design ブレスト:** [docs/brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md](../brainstorms/2026-04-05-atomic-design-component-breakdown-brainstorm.md)
  — 主要決定: StylePropertiesTab の Partial<TextStyle> インターフェース・コンポーネント Props 定義

### Internal References

- 現ストア実装: `src/store/reportStore.ts`
- 型定義（今日更新済み）: `src/types/index.ts`
- 数値フォーマット（今日作成済み）: `src/lib/numberFormatter.ts`
- データバインディング: `src/lib/dataBinding.ts`
- 用紙サイズ: `src/lib/paperSizes.ts`

### Deep Research 補足（2026-04-05）

**Zustand v5 スライスパターン:**
- Zustand v5 では `create<T>()()` カリー形式必須（v4 との非互換）
- `immer` middleware import パス: `zustand/middleware/immer`
- テスト: `useReportStore.getInitialState()` で初期状態リセット（v5 公式 API）
- 参照: Zustand ドキュメント "Slices Pattern"

**ContentEditable + 日本語 IME:**
- React issue #3926, #8683: React 合成イベントは IME イベント順序を壊す
- `compositionend` + `input` はネイティブ addEventListener で処理
- DOMPurify: `ALLOWED_TAGS: ['span', '#text']` でトークンスパンの XSS 対策
- Chrome `vertical-rl` contenteditable の arrow key バグは 2026 時点で未修正
- 参照: use-editable (FormidableLabs), Yao-Hui Chua "Composition Events deep-dive"

**@dnd-kit ネスト DnD:**
- 単一 DndContext 推奨: Discussion #766, Issue #58（作者回答）
- `PointerSensor` の `activationConstraint: { distance: 5 }` でクリックとドラッグを分離
- Section リサイズ: `useDraggable` でなくネイティブ pointer events + `stopPropagation`
- `DragOverlay` + `React.memo` で 50+ 要素のパフォーマンスを確保
- 参照: dnd-kit 公式ドキュメント, Discussion #476 "Click vs drag"
