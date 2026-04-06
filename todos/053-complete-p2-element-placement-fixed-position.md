---
status: complete
priority: p2
issue_id: "053"
tags: [ux-review, ux, canvas, interaction]
dependencies: []
---

# Element Placement at Fixed Position

## Problem

All new elements from palette are placed at hardcoded (13,13)mm. Multiple elements stack on top of each other. No drag-from-palette-to-canvas-position.

## Findings

`src/lib/elementFactories.ts:14` — `position: { x: 13, y: 13 }` hardcoded in base defaults; all 14 factory functions share this default.

## Solutions

### A) Place at viewport center

Calculate center of visible canvas area and use that as default position.

### B) Auto-offset

Track last placed position, increment by element height for next placement.

### C) Drag from palette to canvas

Use @dnd-kit cross-container drag for direct placement on canvas.

## Recommendation

**A + B** as short-term fix, **C** as Phase 2 enhancement.

## Files

- `src/lib/elementFactories.ts`
- `src/components/sidebar/ElementPalette.tsx`
