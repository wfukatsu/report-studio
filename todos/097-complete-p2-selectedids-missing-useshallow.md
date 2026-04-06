---
status: complete
priority: p2
issue_id: "097"
tags: [code-review, performance, react, zustand]
dependencies: []
---

# 097 — selectedIds in App.tsx missing useShallow — unnecessary root re-renders

## Problem Statement

`App.tsx` subscribes to `s.selection.selectedElementIds` directly, returning the array reference. With immer, every store mutation (even unrelated ones) creates new object references, so the array reference changes on every mutation even if selectedElementIds didn't change. This causes unnecessary re-renders of the entire `App` component.

The Toolbar component correctly uses `useShallow` for array selectors — App.tsx should too.

## Findings

**File:** `src/App.tsx:36`
```tsx
const selectedIds = useReportStore((s) => s.selection.selectedElementIds)
```

Should be:
```tsx
const selectedIds = useReportStore((s) => s.selection.selectedElementIds, useShallow)
```

Or:
```tsx
import { useShallow } from 'zustand/react/shallow'
const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))
```

**Reference:** `Toolbar.tsx:44` uses `useShallow` correctly.

## Proposed Solutions

### Option A: Add useShallow
Import `useShallow` from `zustand/react/shallow` and wrap the selector.

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] selectedIds selector uses useShallow
- [ ] App component does not re-render when other parts of the store change

## Work Log
- 2026-04-06: Filed from third-round UX review
