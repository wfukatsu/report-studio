---
status: pending
priority: p3
issue_id: "197"
tags: [code-review, quality, canvas, drag-select]
dependencies: []
---

# handleDragSelectIds ラッパーを削除し setSelectionIds を直接渡す

## Problem Statement

`ReportCanvas.tsx` に `handleDragSelectIds` という `setSelectionIds` の 1 行ラッパーが `useCallback` として定義されている。`setSelectionIds` は Zustand の安定参照であり、ラッパーを通す必要がない。

## Findings

**File:** `src/components/canvas/ReportCanvas.tsx:122-124`

```ts
const handleDragSelectIds = useCallback((ids: string[]) => {
  setSelectionIds(ids)
}, [setSelectionIds])
// ...
onSelectIds: handleDragSelectIds,
```

## Proposed Solution

```ts
// handleDragSelectIds を削除し、useDragSelect に直接渡す
onSelectIds: setSelectionIds,
```

- **LOC 削減:** -3 行
- **Risk:** None (setSelectionIds は Zustand の安定参照)

## Acceptance Criteria

- [ ] `handleDragSelectIds` が削除されている
- [ ] `useDragSelect` に `setSelectionIds` が直接渡されている
- [ ] テストが PASS する

## Work Log

- 2026-04-11: code-simplicity-reviewer が指摘 (PR #30 レビュー)
