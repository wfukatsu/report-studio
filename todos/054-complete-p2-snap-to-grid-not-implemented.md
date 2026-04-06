---
status: pending
priority: p2
issue_id: "054"
tags: [ux-review, ux, canvas, precision]
dependencies: []
---

# Snap-to-Grid Not Implemented

## Problem

Snap-to-grid toggle exists in toolbar but has no effect on element drag. The grid is purely visual. For precise form layout (aligning fields to mm grid), snap is essential.

## Findings

- `src/store/uiSlice.ts:37` — `snapToGrid` state exists
- `src/components/canvas/ReportCanvas.tsx:67-76` — `handleDragEnd` computes new position without reading `snapToGrid`
- Grid display works but positions are unsnapped

## Solutions

### A) Snap coordinates in handleDragEnd (Recommended)

```ts
const gridSize = 1 // mm
const snapPos = (v: number) => snapToGrid ? Math.round(v / gridSize) * gridSize : v
```

## Recommendation

**A**. Small change, high value for form designers.

## Files

- `src/components/canvas/ReportCanvas.tsx:67-76`
- `src/store/uiSlice.ts`
