---
status: complete
priority: p2
issue_id: "041"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

`LayersPanel` checks `selectedIds.includes(el.id)` in a linear scan per layer row — O(elements × selectedIds) per render. With 100 elements and multi-select, this is 10,000 string comparisons per render, and LayersPanel re-renders on every `activePage` change.

## Findings

- `src/components/sidebar/LayersPanel.tsx:96`: `const isSelected = selectedIds.includes(el.id)`
- `selectedIds` is a plain array — `includes` is O(n)
- With 100 selected elements and 100 layer rows: 10,000 comparisons per render
- `ReportCanvas` already uses a `Set` for O(1) lookups (`selectedIds` → `Set` at `ReportCanvas.tsx:63`)
- `LayersPanel` renders on every `activePage` change (drag/resize)

## Proposed Solutions

**A) Convert to Set before render loop (Recommended)**
```tsx
const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
// then in render:
const isSelected = selectedIdSet.has(el.id)  // O(1)
```

**B) Use `selectSelectedElements` from selectors.ts**
`selectors.ts:34-43` already has an efficient implementation. Use it directly instead of inline conversion.

## Recommended Action

Apply solution A — 2-line change, straightforward.

## Technical Details

- **File:** `src/components/sidebar/LayersPanel.tsx:96`

## Acceptance Criteria

- [x] `selectedIds` converted to `Set` with `useMemo`
- [x] `.has()` used instead of `.includes()` per layer row
- [x] Multi-select with 100 elements renders without O(n²) comparisons

## Work Log

- 2026-04-06: Identified by performance-oracle agent
