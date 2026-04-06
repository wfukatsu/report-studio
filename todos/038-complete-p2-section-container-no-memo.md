---
status: complete
priority: p2
issue_id: "038"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

`SectionContainer` re-creates `sortedElements` on every render with no memoization and is not wrapped in `React.memo`. During drag at 60fps, a sort of 100 elements runs 700 comparisons × 60fps = 42,000 comparisons/sec purely for a stable list.

## Findings

- `src/components/canvas/SectionContainer.tsx:89`: `[...section.elements].sort((a, b) => a.zIndex - b.zIndex)` — no useMemo
- `SectionContainer` has no `React.memo` wrapper
- Parent `ReportCanvas` re-renders on every element move → all 3 SectionContainers re-render
- `section.elements` reference does not change during move/resize (only element positions change inside elements) — making this sort safely memoizable across drag frames

## Proposed Solutions

**A) Add React.memo + useMemo (Recommended)**
```tsx
export const SectionContainer = memo(function SectionContainer({ section, ...rest }) {
  const sortedElements = useMemo(
    () => [...section.elements].sort((a, b) => a.zIndex - b.zIndex),
    [section.elements],
  )
  // ...
})
```

**B) Maintain sorted order in the store**
Keep elements sorted by zIndex in the store so the sort is never needed. Harder to implement correctly when zIndex changes.

## Recommended Action

Apply solution A — minimal change, high impact.

## Technical Details

- **File:** `src/components/canvas/SectionContainer.tsx:61,89`

## Acceptance Criteria

- [x] `SectionContainer` is wrapped in `React.memo`
- [x] `sortedElements` is memoized with `useMemo([section.elements])`
- [x] Drag-and-drop does not recompute the sort on every pointer event

## Work Log

- 2026-04-06: Identified by performance-oracle agent
