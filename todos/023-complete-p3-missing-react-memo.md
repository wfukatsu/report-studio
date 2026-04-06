---
status: pending
priority: p3
issue_id: "023"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

CanvasElement and ElementRenderer have no React.memo wrapper. Even after fixing selectSelectedElements (see 007), CanvasElement will still re-render whenever its parent (ReportCanvas) re-renders, because object prop references change. At 100 elements this causes unnecessary work on every store update.

## Findings

Performance reviewer: ElementRenderer — no React.memo, `interpolate()` runs regex on every render for every text element. CanvasElement — no React.memo, though `useCallback` deps on `element` means many handler stubs are recreated. These are secondary to 007 but compound the re-render cost.

## Proposed Solutions

A) Wrap CanvasElement and ElementRenderer with React.memo using default shallow comparison — effective once parent passes stable prop references

B) Use React.memo with custom comparator checking only the fields that affect rendering

C) Defer until after fixing 007 — measure if still needed

## Recommended Action

<!-- Leave blank -->

## Technical Details

- The fix for issue 007 (selectSelectedElements) is a prerequisite: without stable selector output, memo wrappers provide little benefit
- ElementRenderer is a pure rendering component with no side effects, making it an ideal candidate for memo
- CanvasElement contains drag/resize logic; a custom comparator may be needed to avoid stale closure issues with event handlers
- Profiler baseline should be captured before and after to validate improvement at scale (50–100 elements)

## Acceptance Criteria

- [ ] Issue 007 (selectSelectedElements) is resolved first
- [ ] React Profiler shows measurable reduction in unnecessary re-renders at 50+ elements
- [ ] CanvasElement wrapped with React.memo (default or custom comparator)
- [ ] ElementRenderer wrapped with React.memo
- [ ] No regressions in drag, resize, or selection behavior

## Work Log

## Resources

- Files: `src/components/canvas/CanvasElement.tsx`, `src/components/canvas/ElementRenderer.tsx`
- Related: issue 007 (selectSelectedElements selector)
