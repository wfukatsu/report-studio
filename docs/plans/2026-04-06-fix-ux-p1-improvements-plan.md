---
title: "fix: P1 UX改善 — ズーム表示・ペースト追従・H/Fバナー"
type: fix
status: completed
date: 2026-04-06
origin: docs/brainstorms/2026-04-06-ux-designer-audit-brainstorm.md
---

# P1 UX改善 — ズーム表示・ペースト追従・H/Fモードバナー

## Overview

デザイナー視点での UX 評価（see brainstorm）で特定された P1 問題 3 件を修正する。
いずれも「ユーザーが詰まる・混乱する」レベルの問題で、実装規模は小さく効果が大きい。

---

## Problem Statement

### 1. ズーム状態の表示が意味不明（Toolbar.tsx:519）

エディタズームとプレビューズームが異なるとき、ツールバーのズーム欄に `"—"` が表示される。
これは情報量ゼロであり、ユーザーは「ズームが壊れた？」と混乱する。
（see brainstorm: ブレインストームの決定 — 独立ズームは維持し、表示を改善する）

### 2. ペースト後に貼り付け先が見えない

`pasteElements` は body セクション中央付近に要素を追加し、選択状態にするが、
キャンバスがスクロールされていると貼り付けた要素がビューポートの外に出る。
ユーザーは「どこに貼った？」とスクロールして探す必要がある。

### 3. ヘッダー/フッター編集モード中の状態が分かりにくい

`headerEditMode = true` 中の唯一のフィードバックはツールバーの「H/F編集」ボタンが
ハイライトされることだけ。キャンバス上では何が起きているか（セクション高さが変更可能）
が全くわからず、誤操作・混乱を招く。

---

## Proposed Solution

### Fix 1: ズーム表示改善

**変更ファイル**: `src/components/toolbar/Toolbar.tsx`

`"—"` を廃止し、ズームが一致しているかどうかで 2 つの表示モードを持つ:

**一致時（現状維持）:**
```
[ZoomOut]  [ 100% ▾ ]  [ZoomIn]
```

**不一致時（新規）:**
```
[ZoomOut]  [ 100% ▾ ]  [ZoomIn]
              P: 75%
```
入力欄はエディタズームを表示・編集する（amber 色のボーダーで不一致を示す）。
入力欄の下に小さな `"P: XX%"` ラベルを表示し、プレビューズームを明示する。

**行動の変更:**
| 操作 | 変更前 | 変更後 |
|------|--------|--------|
| 入力欄の値確定 | `setZoom`（両方同期） | `setEditorZoom`（エディタのみ） |
| `+`/`-` ボタン | `setZoom` | `setEditorZoom` |
| ⌘= / ⌘- / ⌘0 | `setZoom` | `setEditorZoom` |
| ズームプリセット | `setZoom` | `setEditorZoom` |
| PreviewPane の ZoomControl | `setPreviewZoom`（変更なし） | 変更なし |

ズームプリセットドロップダウンに「プレビューに同期」メニュー項目を追加し、
ユーザーが意図的に同期できるようにする:
```typescript
// ズームドロップダウンに追加
{!zoomsMatch && (
  <button onClick={() => setZoom(editorZoom)}>
    プレビューをエディタに同期 ({Math.round(editorZoom * 100)}%)
  </button>
)}
```

---

### Fix 2: ペースト後のスクロール追従

**変更ファイル**:
- `src/components/canvas/CanvasElement.tsx` — `data-element-id` 属性追加
- `src/App.tsx` — paste キーハンドラにスクロール処理追加
- `src/components/toolbar/Toolbar.tsx` — paste ボタンにスクロール処理追加

**ステップ:**

1. `CanvasElement` の root `<div>` に `data-element-id={element.id}` を追加

```tsx
// CanvasElement.tsx
<div
  ref={setNodeRef}
  data-canvas-element="true"
  data-element-id={element.id}   // ← 追加
  ...
>
```

2. `scrollToPastedElements` ユーティリティ関数を `App.tsx` のモジュールスコープに定義

```typescript
// App.tsx
function scrollToElements(ids: string[]) {
  if (!ids.length) return
  // DOM に反映されるのを次フレームまで待つ
  requestAnimationFrame(() => {
    const firstId = ids[0]
    const el = document.querySelector(`[data-element-id="${firstId}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  })
}
```

3. `⌘V` キーハンドラとツールバーの Paste ボタン両方で `scrollToElements` を呼ぶ

```typescript
// App.tsx ⌘V handler
if ((e.metaKey || e.ctrlKey) && e.key === 'v' && activePageId) {
  pasteElements(activePageId)
  // 次フレームで新規選択 ID を読み取ってスクロール
  requestAnimationFrame(() => {
    const ids = useReportStore.getState().selection.selectedElementIds
    scrollToElements(ids)
  })
}
```

**注意**: `scrollIntoView` はブラウザが `transform: scale(zoom)` 適用後の実座標を使うため、
mm → px → zoom の手動変換は不要。

**エッジケース対応:**
- `previewMode = true` のとき paste キーハンドラは既に gate されている（`activePageId` ガード）
- `canvasRef.current` が null のとき: DOM クエリが null を返すだけでスクロールをスキップ
- body セクションがない場合: `pasteElements` が fallback で index 0 に追加（変更なし）

---

### Fix 3: ヘッダー/フッター編集モードバナー

**変更ファイル**:
- `src/components/canvas/ReportCanvas.tsx` — バナー追加
- `src/App.tsx` — Escape キーで H/F モード終了
- `src/components/toolbar/Toolbar.tsx` — H/F 削除時に auto-exit

**バナー仕様:**

```
┌──────────────────────────────────────────────┐  ← sticky top: RULER_SIZE
│ 📐 ヘッダー/フッター 編集モード  [編集を終了] │
└──────────────────────────────────────────────┘
```

- `position: sticky; top: RULER_SIZE` でルーラーの直下に固定（スクロールしても見える）
- `z-index: 10001`（キャンバス要素 zIndex max = 9999 より上）
- amber/warning 配色（`bg-amber-50 border-amber-300 text-amber-800`）
- 「編集を終了」ボタン → `setHeaderEditMode(false)` 呼び出し
- `previewMode = true` のときはバナーを非表示

**実装位置 (ReportCanvas.tsx):**

```tsx
// 既存の return (
//   <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
//     {/* Sticky header row: corner square + horizontal ruler */}
//     ...
//     のあと、ルーラー下・コンテンツ上に追加

{!readonly && headerEditMode && (
  <div
    style={{
      position: 'sticky',
      top: RULER_SIZE,
      zIndex: 10001,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      background: 'hsl(var(--amber-50, 48 100% 96%))',
      borderBottom: '1px solid hsl(var(--amber-300, 45 96% 64%))',
      color: 'hsl(var(--amber-800, 32 81% 29%))',
      fontSize: '12px',
    }}
    role="status"
    aria-live="polite"
  >
    <PanelTop className="w-3.5 h-3.5 shrink-0" />
    <span className="flex-1">ヘッダー/フッター 編集モード — セクション下端をドラッグして高さを変更できます</span>
    <button
      onClick={() => setHeaderEditMode(false)}
      className="..."
      aria-label="ヘッダー/フッター編集モードを終了"
    >
      編集を終了
    </button>
  </div>
)}
```

**Escape キーハンドラ (App.tsx):**
現在の keydown ハンドラに追加:
```typescript
if (e.key === 'Escape' && headerEditMode) {
  // テキスト入力中は Escape を消費しない
  const tag = (e.target as HTMLElement).tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
    setHeaderEditMode(false)
  }
}
```

**Auto-exit on section deletion (Toolbar.tsx):**
`handleToggleMasterHeader` と `handleToggleMasterFooter` の削除分岐に追加:
```typescript
const handleToggleMasterHeader = () => {
  if (masterHeader) {
    if (!confirm('ヘッダーとその内容を削除しますか？')) return
    setMasterHeader(null)
    // ← 追加: フッターも存在しない場合は H/F モードを終了
    if (!masterFooter) setHeaderEditMode(false)
  } else { ... }
}
```

---

## Technical Considerations

- **ズーム同期の意味変更**: `setEditorZoom` に変更すると、⌘= が preview zoom に影響しなくなる。
  PreviewPane の `ZoomControl` が唯一のプレビューズーム変更手段となる（明確化されて良い）。
- **scrollIntoView と CSS transform**: Chrome/Safari はどちらも `transform: scale()` 適用後の
  レイアウト位置を `scrollIntoView` に使うため、`mmToPx × zoom` 計算は不要。
- **バナーの amber 色**: Tailwind の `amber-*` クラスは利用可能か確認が必要。
  利用不可の場合は CSS 変数直接指定（`hsl(38 92% 50%)` など）で対応。
- **zIndex 競合**: バナーは `z-index: 10001`、キャンバス要素の max zIndex は `9999`（SectionContainer の SECTION_LABELS 表示が `zIndex: 1000`）。モーダルオーバーレイは `z-50`（`z-index: 50`）。バナーはモーダルより前面に出てしまうので `z-index: 10` 程度で十分かもしれない（sticky なので DOM 順でモーダルより下になる）。→ 実装時に確認。

## System-Wide Impact

- **Interaction graph**: `setEditorZoom` 呼び出し → `uiSlice.editorZoom` 更新 → `ReportCanvas` が `editorZoom` を使って再レンダリング → `ZoomControl` に伝播。`previewZoom` は影響を受けない。
- **State lifecycle risks**: `headerEditMode = true` の状態は localStorage に保存されない（`uiSlice` はセッション限り）。ページリロードで自動リセット — 問題なし。
- **API surface parity**: `⌘=` / `⌘-` / `⌘0` キーハンドラ、ツールバー `+`/`-` ボタン、ズームプリセット全てで `setEditorZoom` に統一する必要がある。漏れがあると一部操作だけ preview を上書きするという不整合が発生する。

---

## Acceptance Criteria

### Fix 1: ズーム表示
- [x] ズームが一致するとき: 従来通り "100%" を表示（変更なし）
- [x] ズームが不一致のとき: "—" を表示せず、エディタズーム値（amber 色）を表示し、"P: XX%" ラベルを隣または下に表示する
- [x] ズームが不一致のとき: +/- ボタン、入力確定、⌘=/-/0、プリセット選択はすべてエディタズームのみを変更する（previewZoom は変わらない）
- [x] ズームドロップダウンに「プレビューをエディタに同期」が不一致時のみ表示される
- [x] PreviewPane の ZoomControl の挙動は変更しない
- [x] `livePreviewEnabled = false` のとき、プレビューズームラベルは表示しない（プレビューが非表示のため無意味）

### Fix 2: ペースト追従
- [x] ペースト後、新規要素が選択状態になっている（既存挙動の確認）
- [x] ペースト後、キャンバスが選択要素の位置にスクロールする
- [x] `⌘V`（App.tsx）とツールバーの「貼り付け」ボタン両方でスクロールが動作する
- [x] ペースト後スクロールが smooth アニメーションで行われる
- [x] `canvasRef` が null のとき（readonly 等）: 要素の追加は成功し、スクロールのみスキップされる（エラーなし）

### Fix 3: H/F バナー
- [x] `headerEditMode = true` かつ `readonly = false` のとき、キャンバス上部にバナーが表示される
- [x] バナーは sticky でスクロールしても見え続ける
- [x] バナーの「編集を終了」ボタンクリックで `headerEditMode = false` になりバナーが消える
- [x] Escape キー（テキスト入力中を除く）で `headerEditMode = false` になる
- [x] `previewMode = true` のときバナーは表示されない
- [x] masterHeader と masterFooter が両方 null のとき、`headerEditMode` が自動で `false` になる
- [x] バナーは `role="status"` + `aria-live="polite"` で支援技術に通知される

### 共通
- [x] 既存テスト全通過 (`npm test -- --run`)
- [x] TypeScript エラーなし (`npx tsc --noEmit`)

---

## Dependencies & Risks

- **リスク低**: Fix 2 の `scrollIntoView` + CSS transform の組み合わせ。ブラウザ依存があり得るが
  Chrome/Safari/Firefox いずれも spec 準拠で動作する。
- **リスク低**: Fix 1 のズーム行動変更。`setZoom` → `setEditorZoom` の変更はシンプルな置換。
  テストで確認可能。
- **リスク低**: Fix 3 のバナー。新規 div 追加のみ。既存ロジック変更はわずか（Escape ハンドラ追加、auto-exit 2箇所）。
- **注意**: Fix 1 でプリセット選択が `setEditorZoom` に変わると、ユーザーがプリセットを使って
  「ページ全体を合わせたい」ときに preview zoom が変わらない。「同期」ボタンで対処可能。

---

## Sources & References

### Origin
- **Brainstorm document:** [docs/brainstorms/2026-04-06-ux-designer-audit-brainstorm.md](../brainstorms/2026-04-06-ux-designer-audit-brainstorm.md)
  - 決定事項: ズームは独立維持・表示改善、P1 から着手

### Internal References
- Zoom display logic: `src/components/toolbar/Toolbar.tsx:519` (`displayZoom`, `zoomsMatch`)
- Zoom state: `src/store/uiSlice.ts:71-83` (`setZoom`, `setEditorZoom`, `setPreviewZoom`)
- pasteElements: `src/store/layoutSlice.ts:499-524`
- headerEditMode: `src/store/uiSlice.ts:61,91,95`
- H/F toggle: `src/components/toolbar/Toolbar.tsx:263-281` (`handleToggleMasterHeader/Footer`)
- ReportCanvas scroll container: `src/components/canvas/ReportCanvas.tsx:330` (`overflow: auto`)
- CanvasElement root div: `src/components/canvas/CanvasElement.tsx:155`
- RULER_SIZE: `src/config/constants.ts`
