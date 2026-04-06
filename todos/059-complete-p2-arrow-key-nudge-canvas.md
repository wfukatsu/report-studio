---
status: pending
priority: p2
issue_id: "059"
tags: [ux-review, keyboard, canvas, accessibility]
dependencies: []
---

# Arrow Key Nudge for Canvas Elements

## Problem

Selected canvas elements cannot be moved with arrow keys. This is a standard expectation in all design tools and is critical for pixel/mm-precise alignment without using the properties panel.

## Findings

- `src/App.tsx:47-97` — keyboard handler supports Delete, clipboard, undo/redo, zoom — no arrow key movement
- `src/store/layoutSlice.ts` — `moveElement` action exists and accepts position delta
- No handler fires on Arrow keys

## Solutions

### A) Add arrow key handlers (Recommended)

Add arrow key handlers in the useEffect keyboard handler:

```ts
const NUDGE = 1    // mm
const BIG_NUDGE = 5 // mm (Shift+Arrow)
if (e.key === 'ArrowLeft')  { e.preventDefault(); selectedIds.forEach(id => moveElement(activePageId, id, { x: -nudge, y: 0 })) }
if (e.key === 'ArrowRight') { ... }
if (e.key === 'ArrowUp')    { ... y: -nudge }
if (e.key === 'ArrowDown')  { ... y: nudge }
```

## Recommendation

**A**. Simple 8-line addition.

## Files

- `src/App.tsx:47-97`
