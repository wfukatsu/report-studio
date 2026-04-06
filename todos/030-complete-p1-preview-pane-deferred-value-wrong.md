---
status: complete
priority: p1
issue_id: "030"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

`PreviewPane.tsx` applies `useDeferredValue` only to `previewData` (test data fields), but `activePage` is subscribed directly without deferral. When elements are dragged/resized, `activePage` changes reference on every pointer event, triggering immediate full re-renders of `PreviewPane` at 60fps — completely negating the purpose of `useDeferredValue`.

## Findings

- `src/components/canvas/PreviewPane.tsx:13-16`:
  ```tsx
  const activePage = useReportStore(selectActivePage)  // NOT deferred — re-renders on every drag frame
  const rawPreviewData = usePreviewData()
  const previewData = useDeferredValue(rawPreviewData)  // deferred, but data changes are rare
  ```
- `selectActivePage` returns a new `PageDef` reference on every `moveElement`/`resizeElement` call (immer always creates new references)
- During a drag: PreviewPane re-renders at 60fps with full ReportCanvas tree (~100+ elements)
- The deferred rendering only activates for `BindingPanel` test data changes, not for drag/resize

## Proposed Solutions

**A) Defer both page and data (Recommended)**
```tsx
export const PreviewPane = memo(function PreviewPane() {
  const activePage = useReportStore(selectActivePage)
  const rawPreviewData = usePreviewData()
  const deferredPage = useDeferredValue(activePage)   // add this
  const deferredData = useDeferredValue(rawPreviewData)
  const isPending = activePage !== deferredPage || rawPreviewData !== deferredData
  return (
    <div className={`... ${isPending ? 'opacity-70' : ''}`}>
      <ReportCanvas page={deferredPage} data={deferredData} readonly showGrid={false} />
    </div>
  )
})
```

**B) Stabilise selectActivePage to not change reference on move/resize**
Move/resize operations update element position but the page structure (sections, element list) is unchanged. If `selectActivePage` used a structural equality check that ignores element position/size, it would not fire during drag. Harder to implement correctly.

**C) Use React.startTransition around updateTestData**
Only helps for test data changes, not drag — doesn't fix the root issue.

## Recommended Action

Apply solution A — it is a 2-line change and correctly defers both layout and data updates.

## Technical Details

- **File:** `src/components/canvas/PreviewPane.tsx:13-16`

## Acceptance Criteria

- [ ] `useDeferredValue` applied to both `activePage` and `rawPreviewData`
- [ ] `isPending` flag covers both deferred values
- [ ] PreviewPane has `opacity-70` class during any pending update (drag or data change)
- [ ] Dragging an element does not cause synchronous re-render of PreviewPane

## Work Log

- 2026-04-06: Identified by performance-oracle agent during Phase 1-7 refactoring review
