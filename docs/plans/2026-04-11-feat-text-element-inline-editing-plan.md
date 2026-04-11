---
title: "feat: TextElement インライン編集・defaultTextStyle 継承モデル"
type: feat
status: completed
date: 2026-04-11
deepened: 2026-04-11
origin: docs/brainstorms/2026-04-05-text-element-brainstorm.md
---

# feat: TextElement インライン編集・defaultTextStyle 継承モデル

## Enhancement Summary

**Deepened on:** 2026-04-11
**Research agents used:** contenteditable-best-practices, @mention-picker, Storybook+Zustand, security-sentinel, code-simplicity-reviewer, performance-oracle, framework-docs-researcher, learnings-researcher

### Key Improvements

1. **IME ガード** — `isComposingRef`（`useRef`、NOT `useState`）で Enter/Escape をガードしないと日本語入力が破損する
2. **`contenteditable="plaintext-only"`** — HTML インジェクション防止の最重要対策。React 型定義でキャストが必要
3. **N サブスクリプション問題** — TextRenderer で defaultTextStyle をサブスクライブするとドラッグ中に過剰な調整が発生 → 親から prop で渡す
4. **`resolveStyle` の undefined-override バグ** — `{ ...defaultStyle, ...elStyle }` は `elStyle` の `undefined` 値が `defaultStyle` を上書きする → 明示的フィルタが必要
5. **Phase 4（@メンション）を延期** — `TokenInput` が `{{` トリガーで同機能を提供済み。YAGNI

### New Considerations Discovered

- dnd-kit v6: `disabled` prop だけでなく `listeners` の DOM 除去も必要
- `el.focus({ preventScroll: true })` — CSS transform キャンバス内の誤スクロール防止
- `resolveStyle` は `src/lib/styleUtils.ts` に配置（TextContent から分離、テスト容易性向上）
- F2 キーボードショートカットが WCAG 2.1 SC 2.1.1 への対応で必須
- `defaultTextStyle` 初期値 `{}` では要素がブラウザデフォルトにフォールバック → 有意義な初期値（例: `fontSize: 3.5`）を検討

---

## 背景

`2026-04-05-text-element-brainstorm.md` で定義された機能のうち、以下が**未実装**：

1. **インライン編集** — ダブルクリックでキャンバス上を直接編集
2. **defaultTextStyle のレンダリング適用** — `report.defaultTextStyle` が TextRenderer に渡っていない
3. **継承 UI** — プロパティパネルで `undefined = 継承` を視覚化

実装済み範囲（実施不要）:
- `TextStyle` 型の全プロパティ定義（`src/types/index.ts`）
- `defaultTextStyle` のストア定義・スキーマ（`src/store/layoutSlice.ts:78`）
- `TextStyleSection` UI
- `TextContent` ブロックの overflow/wordBreak/whiteSpace レンダリング

@メンション変数ピッカー（旧 Phase 4）は `TokenInput` が `{{` トリガーで同機能を提供しているため**延期**。

---

## Problem Statement

1. **`defaultTextStyle` が描画に反映されない** — `TextRenderer` は `el.style` を直接 `TextContent` に渡し、`report.defaultTextStyle` が無視される
2. **テキスト編集がプロパティパネル経由のみ** — ダブルクリックでキャンバス上直接編集できないと UX が著しく低下
3. **継承 UI が存在しない** — どのプロパティが継承中かが判別できない

---

## Proposed Solution

3つのフェーズで段階実装（各フェーズが独立した価値を持ち、随時リリース可能）:

| Phase | 内容 | 優先度 |
|---|---|---|
| 1 | `resolveStyle` + `defaultTextStyle` をレンダリングに適用 | **P1** |
| 2 | インライン編集（ダブルクリック + F2） | **P1** |
| 3 | 継承 UI（`inherited` prop を既存入力に追加） | P2 |

---

## Technical Approach

### Architecture

```
[ReportDefinition.defaultTextStyle]
        ↓ (Phase 1 — ElementRenderer で 1 サブスクリプション、prop 経由)
[TextRenderer] defaultStyle prop
        ↓
[src/lib/styleUtils.ts] resolveStyle(el.style, defaultStyle)
        ↓
[TextContent] resolved CSS を適用

[CanvasElement] onDoubleClick / F2 (Phase 2)
        ↓ setEditing(true) — ローカル state（store に置かない）
[TextInlineEditor] contenteditable plaintext-only
        ↓ onBlur / Enter → onCommit(innerText)
[store.updateElement(activePageId, id, { content })]
```

---

## Phase 1: defaultTextStyle をレンダリングに適用

### resolveStyle — 正しい実装

注意: `{ ...defaultStyle, ...elStyle }` は使わない。`elStyle` の `undefined` 値が `defaultStyle` の値を上書きするバグがある（TypeScript の spread with optional properties 問題）。

```ts
// src/lib/styleUtils.ts（新規ファイル）
import type { TextStyle } from '@/types'

/**
 * 要素レベルのスタイル上書きをテンプレートデフォルトにマージする。
 * elStyle の undefined 値は無視され defaultStyle の値を使う。
 * 両入力を変更しない（イミュータブル）。
 */
export function resolveStyle(
  elStyle: TextStyle | undefined,
  defaultStyle: TextStyle,
): TextStyle {
  if (!elStyle) return { ...defaultStyle }
  const result: TextStyle = { ...defaultStyle }
  let key: keyof TextStyle
  for (key in elStyle) {
    const val = elStyle[key]
    if (val !== undefined) {
      (result as Record<keyof TextStyle, TextStyle[keyof TextStyle]>)[key] = val
    }
  }
  return result
}
```

### N サブスクリプション問題の回避

悪い実装（各 TextRenderer が store サブスクライブ — 20 要素で 20 サブスクリプション、
ドラッグ中 60fps で過剰な調整が発生）:

```tsx
// NG
const defaultTextStyle = useReportStore(s => s.report.defaultTextStyle)
```

正しい実装（ElementRenderer が 1 箇所でサブスクライブし prop 経由で渡す）:

```tsx
// ElementRenderer.tsx に追加
const defaultTextStyle = useReportStore(
  useShallow(s => s.report.defaultTextStyle)
)
// TextRenderer に prop で渡す
<TextRenderer element={element} data={mergedData} defaultStyle={defaultTextStyle} />
```

### 変更ファイル

- `src/lib/styleUtils.ts` — 新規作成（`resolveStyle`）
- `src/lib/styleUtils.test.ts` — 新規作成（ユニットテスト）
- `src/components/canvas/ElementRenderer.tsx` — `defaultTextStyle` を 1 箇所でサブスクライブ → TextRenderer に prop で渡す
- `src/elements/text/Renderer.tsx` — `defaultStyle?: TextStyle` prop を受け取り `resolveStyle` を呼ぶ
- `src/elements/_blocks/renderers/TextContent.tsx` — `defaultStyle` prop 追加（後方互換のためオプショナル）

### テスト

- `resolveStyle(undefined, default)` → `default` のコピーを返す
- `resolveStyle({ fontSize: undefined }, { fontSize: 12 })` → `{ fontSize: 12 }` （undefined-override バグなし）
- `resolveStyle({ fontSize: 16 }, { fontSize: 12 })` → `{ fontSize: 16 }` （要素が優先）
- `TextRenderer`: `defaultStyle` が `TextContent` に渡ること

---

## Phase 2: インライン編集

### 新規ファイル: `src/elements/text/InlineEditor.tsx`

```tsx
interface Props {
  element: TextElement
  onCommit: (content: string) => void
  onCancel: () => void
}
```

**IME ガード（最重要 — useRef で実装）:**

```tsx
const isComposingRef = useRef(false)
// compositionend 後の最初の Enter は IME 確定用 → one-shot フラグ
const justFinishedCompositionRef = useRef(false)

onCompositionStart={() => {
  isComposingRef.current = true
  justFinishedCompositionRef.current = false
}}
onCompositionEnd={() => {
  isComposingRef.current = false
  justFinishedCompositionRef.current = true
  setTimeout(() => { justFinishedCompositionRef.current = false }, 0)
}}
onKeyDown={(e) => {
  if (isComposingRef.current || justFinishedCompositionRef.current) return
  e.stopPropagation()
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitAndClose() }
  if (e.key === 'Escape') { e.preventDefault(); cancelAndClose() }
}}
```

**コンテンツ読み取り（セキュリティ）:**

```tsx
function getCommitContent(el: HTMLDivElement): string {
  return el.innerText         // innerText を使う（innerHTML は使わない）
    .slice(0, 10_000)         // 上限 10,000 文字
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\0/g, '')       // null バイト除去
}
```

**マウント時の初期フォーカス（zoom キャンバス対策）:**

```tsx
useEffect(() => {
  const el = editorRef.current
  if (!el) return
  el.innerText = initialContent  // 一度だけ DOM に書き込む（以降 React 非制御）
  el.focus({ preventScroll: true })  // CSS transform 親での誤スクロール防止
  // カーソルを末尾へ
  const range = document.createRange()
  const sel = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}, [])  // 空依存: マウント時 1 回のみ
```

**JSX 骨格:**

```tsx
<div
  ref={editorRef}
  contentEditable={"plaintext-only" as React.HTMLAttributes<HTMLDivElement>['contentEditable']}
  suppressContentEditableWarning
  spellCheck={false}
  role="textbox"
  aria-multiline="false"
  aria-label={`テキスト編集`}
  onCompositionStart={...}
  onCompositionEnd={...}
  onKeyDown={...}
  onBlur={(e) => {
    if (pickerRef.current?.contains(e.relatedTarget as Node)) return
    if (!isComposingRef.current) onCommit(getCommitContent(editorRef.current!))
  }}
  style={{ outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
/>
```

### CanvasElement.tsx の変更

```tsx
// 追加サブスクリプション
const updateElement = useReportStore((s) => s.updateElement)

// ローカル editing state（store に置かない）
const [editing, setEditing] = useState(false)

// useDraggable: isEditing を disabled に追加 + listeners を DOM から除去
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: element.id,
  disabled: element.locked || readonly || editing,
})

// listeners を editing 中は除去（disabled だけでは pointerdown が通る）
{...(!readonly && !element.locked && !editing ? { ...listeners, ...attributes } : {})}

// ダブルクリックハンドラ
const handleDoubleClick = useCallback((e: React.MouseEvent) => {
  if (element.type !== 'text' || element.locked || readonly || isDragging) return
  e.stopPropagation()
  setEditing(true)
}, [element.type, element.locked, readonly, isDragging])

// F2 キー（WCAG 2.1 SC 2.1.1）— 既存 onKeyDown に追加
if (e.key === 'F2' && element.type === 'text' && isSelected && !readonly) {
  e.preventDefault()
  setEditing(true)
}

// role の切り替え（editing 中は button → textbox）
role={editing ? 'textbox' : 'button'}
aria-pressed={editing ? undefined : isSelected}

// commit/cancel 後に wrapper にフォーカスを戻す
onCommit={(content) => {
  if (activePageId) updateElement(activePageId, element.id, { content })
  setEditing(false)
  requestAnimationFrame(() => wrapperRef.current?.focus())
}}
onCancel={() => {
  setEditing(false)
  requestAnimationFrame(() => wrapperRef.current?.focus())
}}
```

**aria-live アナウンス:**

`ReportCanvas.tsx` に既存の `aria-live` リージョンを活用:

```tsx
<div role="status" aria-live="polite" className="sr-only">
  {editingInfo ? `${editingInfo.name} のテキストを編集中` : ''}
</div>
```

### テスト

```
InlineEditor:
- マウント時に contenteditable に initial content が設定されること
- blur で onCommit が正しいテキストで呼ばれること
- Escape で onCancel が呼ばれ onCommit は呼ばれないこと
- Enter（Shift なし）で onCommit が呼ばれること
- isComposing 中は Enter/Escape をスキップすること
- コンテンツが 10,000 文字に切り詰められること

CanvasElement:
- ダブルクリックで InlineEditor が表示されること
- F2（選択中）で InlineEditor が表示されること
- ロック済み/readonly/isDragging 中は編集モードに入らないこと
- text 以外の要素はダブルクリックで editing にならないこと
- onCommit 後に CanvasElement wrapper にフォーカスが戻ること
- editing 中 listeners が DOM 要素から除去されていること
- Delete キーが編集中にキャンバス要素削除を発火しないこと
```

---

## Phase 3: 継承 UI（simplified）

`PropInputUnit<T>` 汎用コンポーネントは不要（YAGNI）。
既存の `NumInput` / `ColorInput` / `SelectInput` に `inherited?: boolean` と `onReset?: () => void` prop を追加するだけで十分:

```tsx
// NumInput の変更例（最小限）
export function NumInput({ value, onChange, inherited, onReset, ...rest }: Props & {
  inherited?: boolean
  onReset?: () => void
}) {
  return (
    <div className="flex items-center gap-1 group relative">
      <input
        className={cn(
          'border rounded px-2 py-1 text-xs w-full',
          inherited ? 'bg-muted text-muted-foreground border-dashed' : 'bg-background',
        )}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        {...rest}
      />
      {!inherited && onReset && (
        <button
          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground"
          style={{ visibility: inherited ? 'hidden' : 'visible' }}
          onClick={onReset}
          tabIndex={0}
          aria-label="デフォルトにリセット"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
```

`TextStyleSection` に `defaultStyle?: TextStyle` prop を追加し、各入力で `inherited={style.fontSize === undefined}` を渡す。

---

## Acceptance Criteria

### Phase 1

- [ ] `report.defaultTextStyle.fontSize = 8` 設定後、`element.style.fontSize` が undefined の TextElement が 8mm で描画される
- [ ] `element.style.fontSize = 12` の要素は defaultTextStyle に関わらず 12mm で描画される
- [ ] `resolveStyle({ fontSize: undefined }, { fontSize: 12 })` → `{ fontSize: 12 }` を返す
- [ ] `resolveStyle({ fontSize: 16 }, { fontSize: 12 })` → `{ fontSize: 16 }` を返す

### Phase 2

- [ ] TextElement をダブルクリックすると TextInlineEditor が表示される
- [ ] 選択済み TextElement で F2 を押すと編集モードに入る
- [ ] 編集中に `listeners` が DOM から除去される（ドラッグ不可）
- [ ] blur で `updateElement` が呼ばれ、新しい content でキャンバスが更新される
- [ ] Escape で編集がキャンセルされ `updateElement` は呼ばれない
- [ ] Enter（Shift なし）で改行が挿入されない
- [ ] ロック済み・readonly・isDragging 中は編集モードに入らない
- [ ] 編集終了後 CanvasElement wrapper にフォーカスが戻る
- [ ] 日本語 IME 変換中の Enter が編集を誤コミットしない
- [ ] Delete キーが編集中にキャンバス要素削除を発火しない

### Phase 3

- [ ] `element.style.fontSize` が undefined のとき、入力欄がグレー背景・破線ボーダーで表示される
- [ ] 値を持つとき ✕ ボタンが表示される（レイアウトシフトなし）
- [ ] ✕ クリックで `element.style.fontSize` が `undefined` になる

---

## Security Notes

- `innerText` を使う（`innerHTML` は使わない）
- null バイト除去: `.replace(/\0/g, '')`
- 10,000 文字上限: `.slice(0, 10_000)`
- `contenteditable="plaintext-only"` で HTML マークアップ挿入を防止
- `interpolate()` に `SAFE_KEY_PATTERN` チェック追加 (`/^[$a-zA-Z_][$a-zA-Z0-9_.]*$/`)

---

## Dependencies & Risks

| リスク | 対策 |
|---|---|
| IME 候補ウインドウが zoom ≠ 1.0 で位置ずれ | 既知の browser 制限。文書化のみ |
| `contenteditable="plaintext-only"` の React 型エラー | 型キャストで対処 |
| `compositionend` + `keydown` の発火順がブラウザ差異 | `justFinishedCompositionRef` one-shot フラグで対処 |
| ElementRenderer が TextRenderer へ prop バケツリレー増加 | 最小限の Props 拡張（TextRenderer のみ） |

---

## Files

| ファイル | 操作 |
|---|---|
| `src/lib/styleUtils.ts` | 新規: `resolveStyle` 関数 |
| `src/lib/styleUtils.test.ts` | 新規: ユニットテスト |
| `src/elements/text/InlineEditor.tsx` | 新規: contenteditable インライン編集 |
| `src/elements/text/InlineEditor.test.tsx` | 新規: IME テスト含む |
| `src/components/canvas/ElementRenderer.tsx` | 変更: defaultTextStyle を 1 箇所でサブスクライブ |
| `src/elements/text/Renderer.tsx` | 変更: defaultStyle prop + resolveStyle 呼び出し |
| `src/elements/_blocks/renderers/TextContent.tsx` | 変更: defaultStyle prop 追加（オプショナル） |
| `src/components/canvas/CanvasElement.tsx` | 変更: onDoubleClick, F2, editing state, listeners ゲート |
| `src/elements/_base/sharedUI.tsx` | 変更: inherited, onReset props 追加 |
| `src/elements/_blocks/panels/TextStyleSection.tsx` | 変更: defaultStyle prop + inherited 表示 |
| `src/elements/text/Renderer.test.tsx` | 変更: defaultStyle 適用テスト追加 |

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-05-text-element-brainstorm.md](docs/brainstorms/2026-04-05-text-element-brainstorm.md)

### Internal References

- `CanvasElement` 構造: `src/components/canvas/CanvasElement.tsx:12-51,191-215`
- `updateElement` シグネチャ: `src/store/layoutSlice.ts:345`
- `useDraggable` disabled: `src/components/canvas/CanvasElement.tsx:51`
- ReportCanvas キーボードガード: `src/components/canvas/ReportCanvas.tsx:111,128`
- FORBIDDEN_KEYS + interpolate: `src/lib/dataBinding.ts:6,41`
- `defaultTextStyle` 初期値: `src/store/layoutSlice.ts:78`

### Institutional Learnings Applied

- `docs/solutions/performance-issues/react-canvas-rerender-optimization.md` — editing state はローカル、commit は blur 時のみ
- `docs/solutions/ui-bugs/canvas-editor-snap-zoom-pointer-fixes.md` — zoom 座標は親 scale に任せる、cleanup は useEffect で
