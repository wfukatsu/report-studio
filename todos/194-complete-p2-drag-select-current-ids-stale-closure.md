---
status: pending
priority: p2
issue_id: "194"
tags: [code-review, react, hooks, canvas, marquee, selection]
dependencies: []
---

# useDragSelect の currentSelectedIds が deps にあり onPointerUp が不必要に再生成される

## Problem Statement

`useDragSelect` の `onPointerUp` コールバックの deps に `currentSelectedIds` が含まれており、選択状態が変わるたびに `onPointerUp` が再生成される。マーキードラッグ中に選択が外部から変化した場合、コールバックが差し替わる。また、ドラッグ開始時点の `currentSelectedIds` ではなく、終了時点の最新値が使われるため意味的な不整合がある。

## Findings

**File:** `src/hooks/useDragSelect.ts:125`

```ts
const onPointerUp = useCallback((_e: ...) => {
  const finalIds = additive
    ? Array.from(new Set([...currentSelectedIds, ...toSelect]))
    : toSelect
  onSelectIds(finalIds)
}, [sections, onSelectIds, currentSelectedIds])  // currentSelectedIds が deps
```

`currentSelectedIds` は `ReportCanvas.tsx` の `selectedIds` (Zustand store) から来る配列。選択のたびに新しい参照になるため `onPointerUp` が再生成される。

**より良いパターン:** ポインターダウン時に `currentSelectedIds` のスナップショットを `startRef` に保存し、`onPointerUp` では `startRef.current.selectedIds` を使う。

## Proposed Solutions

### Option A: startRef にスナップショットを保存 (推奨)

```ts
// onPointerDown で開始時の選択をスナップショット
startRef.current = {
  x: ...,
  y: ...,
  shiftKey: e.shiftKey,
  selectedIds: currentSelectedIds,  // 開始時の選択を保存
}

// onPointerUp では startRef から読む
const additive = startRef.current?.shiftKey ?? false
const startSelectedIds = startRef.current?.selectedIds ?? []
// ...
const finalIds = additive
  ? Array.from(new Set([...startSelectedIds, ...toSelect]))
  : toSelect

// deps から currentSelectedIds を削除
}, [sections, onSelectIds])
```

- **Pros:** `onPointerUp` の不要な再生成を排除。意味的に正確 (開始時の選択を基準にする)
- **Cons:** `startRef` の型が増える
- **Effort:** Small
- **Risk:** Low

### Option B: currentSelectedIds を ref でラップ

```ts
const currentSelectedIdsRef = useRef(currentSelectedIds)
useEffect(() => { currentSelectedIdsRef.current = currentSelectedIds }, [currentSelectedIds])
// onPointerUp では currentSelectedIdsRef.current を使う
```

- **Pros:** Option A より変更量が少ない
- **Cons:** 開始時点のスナップショットが取れないため、ドラッグ中に選択が変わると終了時の選択に基づく動作になる
- **Effort:** Small
- **Risk:** Low

## Recommended Action

Option A を適用する。意味的に正確で deps も完全に排除できる。

## Technical Details

- **Affected files:** `src/hooks/useDragSelect.ts`
- **Performance:** 選択変更のたびに `onPointerUp` が再生成されるが、マーキードラッグ中に選択が変わることは稀なため実用上は問題小

## Acceptance Criteria

- [ ] `onPointerUp` の deps から `currentSelectedIds` が削除されている
- [ ] Shift+マーキーが開始時の選択を基準に merge されること
- [ ] 既存の useDragSelect テストが PASS する

## Work Log

- 2026-04-11: kieran-typescript-reviewer (HIGH) と performance-oracle が独立して指摘 (PR #30 レビュー)
