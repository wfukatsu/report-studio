---
title: Canvas Editor — Snap-to-Grid, Zoom Bounds, Arrow Nudge & Pointer Leak Fixes
problem_type: ui_bug
component: CanvasElement, ReportCanvas, SectionContainer, Toolbar, App
severity: p2
tags:
  - snap-to-grid
  - zoom
  - arrow-keys
  - pointer-events
  - closure-leak
  - coordinate-system
  - undo
date: 2026-04-06
resolved_todos:
  - 014 (resize handler closure leak)
  - 015 (coordinate system px vs mm)
  - 020 (undo button guard off-by-one)
  - 040 (SectionContainer zoom cancelled)
  - 054 (snap-to-grid not implemented)
  - 059 (arrow key nudge canvas)
  - 078 (arrow key ignores snap grid)
  - 089 (canvas element resize pointer leak)
  - 095 (zoom no bounds check)
---

## Issue 1: Resize/Pointer Event Listener Leak on Unmount

### Problem
`handleResizeStart` added `pointermove`/`pointerup` listeners to `window`. If the
component unmounted mid-drag (e.g., element deleted via keyboard shortcut while
resizing), the listeners persisted indefinitely — causing memory leaks and
"setState on unmounted component" React warnings.

Event handler return values are ignored by the browser, so a cleanup function returned
from `onPointerDown` never executes.

### Fix — `resizeCleanupRef` + `useEffect` teardown
```tsx
// src/components/canvas/CanvasElement.tsx
const elementRef = useRef(element)
useEffect(() => { elementRef.current = element }, [element])

const resizeCleanupRef = useRef<(() => void) | null>(null)
useEffect(() => {
  return () => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }
}, [])

const handleResizeStart = useCallback((handle: ResizeHandle, e: React.PointerEvent) => {
  e.stopPropagation()
  // ... setup ...
  const onMove = (ev: PointerEvent) => { /* resize logic using elementRef.current */ }
  const onUp   = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    resizeCleanupRef.current = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  resizeCleanupRef.current = onUp   // stored for unmount cleanup
}, [])
```

The `useEffect` cleanup guarantees listeners are removed even if the component
unmounts before `pointerup` fires.

**Rule:** Any `window.addEventListener` inside a component must have a corresponding
removal in a `useEffect` cleanup — not in the event handler itself.

---

## Issue 2: SectionContainer Height Applies Zoom Then Cancels It

### Problem
```tsx
// Before
const heightPx = mmToPx(section.height) * zoom   // × zoom
// ...
<div style={{ height: heightPx / zoom }}>         // ÷ zoom  →  no-op!
```
The two zoom operations cancelled out. The variable name `heightPx` was misleading —
children should use unscaled values because the parent already has `transform: scale(zoom)`.

### Fix
```tsx
// After — src/components/canvas/SectionContainer.tsx
const heightPx = mmToPx(section.height)           // no zoom multiplication
// ...
<div style={{ height: heightPx }}>                // direct unscaled value
```

**Rule:** CSS dimensions passed to children of a `transform: scale(zoom)` parent
must be unscaled pixel values. Do not multiply/divide by zoom in child CSS.

---

## Issue 3: Undo Button Guard Off-by-One

### Problem
```tsx
// Before
<ToolbarButton disabled={historyIndex <= 0} ...>  // wrong: disables at index 1 too
```
`historyIndex === 0` is the initial snapshot — you should be able to undo from index 1
back to 0. The button incorrectly appeared disabled after the first edit.

### Fix
```tsx
// After — src/components/toolbar/Toolbar.tsx
<ToolbarButton disabled={historyIndex < 1} ...>   // correct: enabled at index ≥ 1
```

---

## Issue 4: Snap-to-Grid Toggle Existed but Never Applied

### Problem
The grid visual rendered correctly and `snapToGrid` state was stored, but
`handleDragEnd` never read it — elements always dropped at raw pixel positions.

### Fix
```tsx
// src/components/canvas/ReportCanvas.tsx
const snap = useCallback(
  (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : v),
  [snapToGrid, gridSize],
)

// In handleDragEnd:
moveElement(page.id, el.id, { x: snap(newX), y: snap(newY) })

// In handleMove (drag preview):
moveElement(page.id, elementId, { x: snap(position.x), y: snap(position.y) })
```

The same `snap()` function is reused for both drag-drop and arrow key nudge (Issue 5)
to guarantee consistent behavior across movement methods.

---

## Issue 5: Arrow Key Nudge Not Implemented; Ignores Snap Grid

### Problem
Arrow keys were unhandled despite all other shortcuts working. When arrow nudge was
later added, it initially didn't read `snapToGrid`, making it inconsistent with
drag-and-drop which does snap.

### Fix
```tsx
// src/App.tsx
if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)
    && !meta && activePageId && selectedIds.length > 0 && activePage) {
  e.preventDefault()
  const nudge = e.shiftKey ? 5 : 1    // Shift = 5px, plain = 1px
  const elements = flattenPageElements(activePage)
  const snap = (v: number) => snapToGrid ? Math.round(v / gridSize) * gridSize : v

  selectedIds.forEach((id) => {
    const el = elements.find((elem) => elem.id === id)
    if (!el) return
    const dx = e.key === 'ArrowLeft' ? -nudge : e.key === 'ArrowRight' ? nudge : 0
    const dy = e.key === 'ArrowUp'   ? -nudge : e.key === 'ArrowDown'  ? nudge : 0
    moveElement(activePageId, id, {
      x: snap(el.position.x + dx),
      y: snap(el.position.y + dy),
    })
  })
}
```

Shift+Arrow nudges 5 px (coarse), plain Arrow nudges 1 px (fine). Both respect
`snapToGrid` for grid-aligned positioning.

---

## Issue 6: Zoom Buttons Had No Bounds Check

### Problem
`setZoom(zoom ± 0.1)` had no clamping. Users could zoom to 0% (invisible canvas),
negative values, or 1000%+ (severe performance degradation).

### Fix
```tsx
// src/components/toolbar/Toolbar.tsx
const ZOOM_MIN = 0.1   // 10%
const ZOOM_MAX = 3.0   // 300%
const clampZoom = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))

<ToolbarButton
  onClick={() => setZoom(clampZoom(editorZoom - 0.1))}
  disabled={editorZoom <= ZOOM_MIN}
  title="ズームアウト (⌘-)"
>
  <ZoomOut className="w-4 h-4" />
</ToolbarButton>

<ToolbarButton
  onClick={() => setZoom(clampZoom(editorZoom + 0.1))}
  disabled={editorZoom >= ZOOM_MAX}
  title="ズームイン (⌘=)"
>
  <ZoomIn className="w-4 h-4" />
</ToolbarButton>
```

Buttons are disabled at the bounds so users receive visual feedback that they've
reached the zoom limit.

---

## Issue 7: px / mm Coordinate System Not Wired (Deferred)

### Problem
`paperSizes.ts` provides `getPageDimensions()` and `mmToPx()` but the store and
templates hardcode `794 × 1123 px` (A4 at 96 dpi). Three files contained the magic
numbers without referencing the utility.

### Current State
Documented as technical debt. The coordinate system architecture exists but is not
wired into store initialization and template generation. Recommended fix:
- Replace all `794`/`1123` literals with `getPageDimensions('A4', 'portrait')`
- Call `mmToPx()` / `pxToMm()` only at the canvas render boundary

**Files to update when addressed:**
- `src/store/reportStore.ts` (initial page dimensions)
- `src/templates/builtinTemplates.ts` (template page dimensions)
- `src/lib/exportUtils.ts` (PDF page size)

---

## Prevention Checklist

- [ ] `window.addEventListener` inside components always paired with `useEffect` cleanup
- [ ] Children of `transform: scale(zoom)` use unscaled pixel values — never multiply CSS by zoom
- [ ] Undo disabled condition: `historyIndex < 1` (not `<= 0`)
- [ ] Drag `handleDragEnd` calls `snap()` when placing elements
- [ ] Arrow key nudge reads `snapToGrid` / `gridSize` from store — same `snap()` as drag
- [ ] Zoom setters wrapped in `clampZoom(ZOOM_MIN, ZOOM_MAX)`; buttons disabled at bounds
- [ ] Page dimensions come from `getPageDimensions()` — no hardcoded `794`/`1123`
