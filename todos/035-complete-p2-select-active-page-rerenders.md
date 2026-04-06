---
status: complete
priority: p2
issue_id: "035"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

`selectActivePage` returns the full `PageDef` object reference. Immer creates a new reference on every `moveElement`/`resizeElement` call. All 6 subscribers re-render on every pointer-move event during drag, including the heavy `PreviewPane`.

## Findings

- `src/store/selectors.ts:27`: returns `PageDef | null` directly
- 6 components subscribe: ReportCanvas, PreviewPane, PropertiesPanel, LayersPanel, Toolbar, App
- `moveElement`/`resizeElement` call `set()` without `pushHistory` but still trigger Zustand subscriber notification
- At 100 elements, 60fps drag: 6 components × 60 = 360 re-renders/sec from this selector alone
- With PreviewPane's ReportCanvas rendering 100 elements, this causes measurable jank

## Proposed Solutions

**A) Separate page ID selector from full page selector**
```ts
export const selectActivePageId = (s: StoreState): string | null =>
  s.definition.pages[0]?.id ?? null  // or from selection.activePageId

export const selectActivePage = (s: StoreState): PageDef | null =>
  s.definition.pages.find(p => p.id === s.activePageId) ?? null
```
Components that only need `pageId` (Toolbar, some panel headers) subscribe to `selectActivePageId` — this only changes on page switches, not element moves.

**B) Use `useShallow` on the page selector**
Zustand's `useShallow` does shallow-equal comparison. This doesn't help for `PageDef` changes during drag since element positions inside sections actually change.

**C) Track active page index instead of scanning**
Cache the active page index, reducing `find()` to `O(1)` array access. Minor speedup but doesn't address the re-render problem.

## Recommended Action

Apply solution A — split into two selectors so drag-only subscribers can opt out of full page re-renders.

## Technical Details

- **File:** `src/store/selectors.ts:27`
- **Subscribers:** `src/components/canvas/ReportCanvas.tsx:34`, `src/components/canvas/PreviewPane.tsx:12`, `src/components/sidebar/PropertiesPanel.tsx:86`, `src/components/sidebar/LayersPanel.tsx:55`, `src/components/toolbar/Toolbar.tsx:42`, `src/App.tsx:32`

## Acceptance Criteria

- [x] `selectActivePageId` selector exported from selectors.ts
- [x] Components that don't need full PageDef use `selectActivePageId`
- [x] Drag-and-drop does not trigger re-render in components that only use `selectActivePageId`

## Work Log

- 2026-04-06: Identified by performance-oracle agent
