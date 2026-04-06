---
status: pending
priority: p1
issue_id: "007"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

All 100+ `CanvasElement` instances re-render on every selection change. `selectSelectedElements` creates a new array reference on every store tick (even during drag at 60fps), causing `ReportCanvas` to re-render and propagate re-renders to all children. This makes the canvas non-interactive at 100+ elements during drag operations.

## Findings

- `CanvasElement` has no `React.memo` wrapper — every store update causes a full re-render of every canvas element.
- `selectedIds` is a new array reference on every render in `ReportCanvas.tsx:74`.
- `selectSelectedElements` uses `Array.filter()`, which returns a new array on every call regardless of whether the selection changed (`reportStore.ts:342-348`).
- During drag, `moveElement` fires on every `pointermove` event — each dispatch triggers a full canvas re-render.
- Worst-case throughput: 100 elements × 60fps = 6,000 component renders per second during drag.

## Proposed Solutions

**A) Add `React.memo` to `CanvasElement` and `ElementRenderer`; replace `selectSelectedElements` with a Set-based selector using `useShallow`** — Eliminates per-element re-renders caused by unrelated state changes. Highest leverage, well-understood React optimization pattern.

**B) Virtualize canvas elements with a virtual scrolling approach** — Reduces DOM nodes but does not fix the re-render root cause. Overkill for this problem given the canvas uses absolute positioning.

**C) Batch `moveElement` calls to avoid per-frame dispatches** — Reduces the frequency of store updates during drag but does not fix the per-element render count for each dispatch. Partial improvement only.

**Recommended: A** — `React.memo` plus a stable Set-based selector is the standard, well-understood solution. Combine with `useShallow` from Zustand to prevent reference-equality false positives.

## Recommended Action

## Technical Details

- `useShallow` from `zustand/shallow` provides reference-stable selector results when the array contents haven't changed.
- `React.memo` on `CanvasElement` requires that its props be stable — verify that callback props (onSelect, onMove, etc.) are wrapped in `useCallback` in `ReportCanvas`.
- `selectSelectedElements` can be replaced by a selector returning `Set<string>` of selected IDs, which `CanvasElement` checks with `selectedIds.has(element.id)` — O(1) lookup.
- `ElementRenderer` should also be memoized since it renders the visual content of each element.

## Acceptance Criteria

- Selecting one element causes only that element and the previously selected element(s) to re-render — verified with React DevTools Profiler.
- All other `CanvasElement` instances do not re-render on selection change.
- Drag at 100 elements maintains 60fps (no frame drops > 16ms per frame in Profiler).
- All existing canvas interaction tests pass.

## Work Log

## Resources

- src/components/canvas/CanvasElement.tsx
- src/components/canvas/ReportCanvas.tsx:74,95-108
- src/store/reportStore.ts:342-348
