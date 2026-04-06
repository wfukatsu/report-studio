---
status: complete
priority: p3
issue_id: "085"
tags: [code-review, error-handling, ux, error-boundary]
dependencies: []
---

# 085 — ElementErrorBoundary has no recovery mechanism

## Problem Statement

`ElementErrorBoundary` catches errors and shows "⚠ 表示エラー" but provides no way for the user to recover (e.g., select and delete the broken element, or retry rendering). A broken element silently blocks editing that area of the canvas.

## Findings

**File:** `src/components/canvas/ElementErrorBoundary.tsx`

Current fallback UI is a static error div with no interactive controls. The user cannot:
- Click to select the broken element
- Delete the broken element
- Retry rendering

## Proposed Solutions

### Option A: Add "削除" button in error fallback (Recommended)
Pass the element ID and a delete callback into the boundary. The fallback renders a "この要素を削除" button.

```tsx
interface Props {
  elementId: string
  onDelete: (id: string) => void
  children: ReactNode
}
// In fallback:
<button onClick={() => onDelete(elementId)}>この要素を削除</button>
```

**Pros:** User can recover without reloading  
**Effort:** Small  
**Risk:** Low

### Option B: Add retry button (reset error state)
Add `reset()` method that clears `hasError`, allowing re-render attempt.

**Pros:** Non-destructive recovery  
**Cons:** If element data is corrupt, retry will fail again  
**Effort:** Small  
**Risk:** Low

## Recommended Action

Option A + B — try retry first, offer delete if retry fails.

## Technical Details

**Files affected:**
- `src/components/canvas/ElementErrorBoundary.tsx` — add recovery controls
- `src/components/canvas/CanvasElement.tsx` — pass elementId + onDelete props to boundary

**Acceptance Criteria:**
- [ ] Broken elements can be deleted from the error fallback UI
- [ ] Retry button attempts re-render
- [ ] No regression for normal (non-errored) elements

## Work Log

- 2026-04-06: Filed from second-round UX review
