---
status: complete
priority: p2
issue_id: "078"
tags: [code-review, accessibility, keyboard, snap-grid]
dependencies: []
---

# 078 — Arrow key nudge ignores snap-to-grid

## Problem Statement

Arrow key nudge (`moveElement`) bypasses the snap-to-grid logic applied in drag-and-drop. This creates inconsistency: elements dragged snap to grid, but elements moved with arrow keys do not. A user who carefully aligns elements via drag will find arrow-key nudge breaks that alignment.

**Why it matters:** Snap-to-grid is a precision tool — violating it undermines the user's intent to keep elements aligned.

## Findings

**File:** `src/App.tsx:116-127`

```tsx
const dx = e.key === 'ArrowLeft' ? -nudge : e.key === 'ArrowRight' ? nudge : 0
const dy = e.key === 'ArrowUp' ? -nudge : e.key === 'ArrowDown' ? nudge : 0
moveElement(activePageId, id, { x: el.position.x + dx, y: el.position.y + dy })
```

The snap grid logic in `ReportCanvas.tsx` uses:
```tsx
const snap = (v: number) => Math.round(v / gridSize) * gridSize
```

This is only applied in `handleDragEnd`, not in arrow key handler.

**Store:** `snapToGrid` and `gridSize` are available via selectors but not read in `App.tsx`.

## Proposed Solutions

### Option A: Apply snap after delta (Recommended)
Read `snapToGrid` and `gridSize` from store in `App.tsx`, then apply snap to the resulting position.

**Pros:** Consistent with drag behavior, minimal change  
**Cons:** None significant  
**Effort:** Small  
**Risk:** Low

### Option B: Move arrow key handler into ReportCanvas
Co-locate keyboard nudge with drag logic so snap is applied in one place.

**Pros:** Better cohesion  
**Cons:** Canvas component grows, keyboard handling spread across files  
**Effort:** Medium  
**Risk:** Low

## Recommended Action

Option A — add snap to arrow key handler in App.tsx.

## Technical Details

**Files affected:**
- `src/App.tsx` — add store selectors + snap logic
- No other changes needed

**Acceptance Criteria:**
- [ ] Arrow key nudge respects snap-to-grid when snapToGrid is enabled
- [ ] When snapToGrid is disabled, nudge works as before (1mm / 5mm with Shift)
- [ ] Existing behavior unchanged when snapToGrid is false

## Work Log

- 2026-04-06: Filed from second-round UX review
