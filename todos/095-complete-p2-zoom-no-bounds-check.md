---
status: complete
priority: p2
issue_id: "095"
tags: [code-review, ux, toolbar, zoom]
dependencies: []
---

# 095 — Zoom ±0.1 buttons have no min/max bounds (can reach 0 or negative)

## Problem Statement

The zoom-out button calls `setZoom(zoom - 0.1)` and zoom-in calls `setZoom(zoom + 0.1)` with no bounds check. Users can zoom to 0%, negative values, or extremely high values (1000%+). At very low zoom, the canvas becomes invisible; at very high zoom, performance degrades.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:442-447`
```tsx
onClick={() => setZoom(zoom - 0.1)}  // no min
onClick={() => setZoom(zoom + 0.1)}  // no max
```

The zoom preset list goes 25%-200%, but the ±0.1 buttons bypass these limits.

## Proposed Solutions

### Option A: Clamp at call site
```tsx
onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
onClick={() => setZoom(Math.min(4, zoom + 0.1))}
```

Or clamp inside `setZoom` in the store.

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] Zoom cannot go below 10% (0.1)
- [ ] Zoom cannot go above 400% (4)
- [ ] Zoom-out button disabled at minimum
- [ ] Zoom-in button disabled at maximum

## Work Log
- 2026-04-06: Filed from third-round UX review
