---
status: complete
priority: p1
issue_id: "118"
tags: [code-review, performance, state-management]
---

# ラバーバンド選択で N 回の store 更新が発生する

## Problem Statement

`handleDragSelectIds` が `clearSelection()` + `ids.forEach(selectElement)` で N+1 回の Zustand `set()` を呼ぶ。
100要素を囲むと 101 回の immer ミューテーション＋全サブスクライバー再レンダリングが連鎖する。
100要素時点でポインターリリース直後の jank が観測可能。

## Findings

**パフォーマンスレビュー**（Critical #1）
```typescript
// src/components/canvas/ReportCanvas.tsx:72–75
const handleDragSelectIds = useCallback((ids: string[]) => {
  clearSelection()
  ids.forEach((id) => selectElement(id, true))  // N 回 set()
}, [clearSelection, selectElement])
```

**TSレビュー**も同じ問題を確認。`selectAll` アクションは正しく1回の `set()` で実装されているので、
同じパターンを drag-select にも適用すべき。

## Proposed Solutions

### Option A: `setSelectionIds` アクションを追加（推奨）

```typescript
// layoutSlice.ts に追加
setSelectionIds: (ids: string[]) => set((s) => {
  s.selection.selectedElementIds = ids
}),
```

```typescript
// ReportCanvas.tsx
const handleDragSelectIds = useCallback((ids: string[]) => {
  setSelectionIds(ids)
}, [setSelectionIds])
```

N 回 → 1 回。`store/types.ts` の `LayoutSlice` 型にも追加必要。

### Option B: 現状維持 + React 18 バッチング依存

React 18 の automatic batching がイベントハンドラ外でも動作するため、
実際の再レンダリング回数は少ない可能性がある。ただし中間状態（1件選択、2件選択…）は
Observable のまま残り、将来の middleware 追加時に問題になりうる。

## Recommended Action

Option A。`selectAll` と一貫したパターンにする。実装コストは5行以下。

## Technical Details

- **Files**: `src/store/layoutSlice.ts`, `src/store/types.ts`, `src/components/canvas/ReportCanvas.tsx`

## Acceptance Criteria

- [x] `setSelectionIds(ids)` アクションが追加される
- [x] `handleDragSelectIds` が `setSelectionIds` を1回呼ぶだけになる
- [x] 100要素選択時に store 更新が1回のみ発生する（DevTools で確認）
- [x] 既存テスト全通過

## Work Log

- 2026-04-06: パフォーマンスエージェント・TSレビューエージェント・アーキエージェントが三重に指摘。
