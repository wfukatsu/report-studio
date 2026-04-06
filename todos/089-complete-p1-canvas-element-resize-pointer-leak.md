---
status: complete
priority: p1
issue_id: "089"
tags: [code-review, bug, memory-leak, canvas]
dependencies: []
---

# 089 — CanvasElement resize: pointer event listeners leak on unmount

## Problem Statement

`handleResizeStart` in CanvasElement attaches `pointermove` and `pointerup` listeners to `window` and returns a cleanup function. However, it is called as a `onPointerDown` event handler — the return value of an event handler is ignored by the browser. If the component unmounts while a resize drag is in progress, the window listeners are never cleaned up and continue calling `onMove`/`onResize` on the unmounted component's callbacks, causing potential memory leaks and React "setState on unmounted component" warnings.

## Findings

**File:** `src/components/canvas/CanvasElement.tsx:126-129`

The `handleResizeStart` function is used as `onPointerDown={handleResizeStart}` on resize handle divs. Inside, it adds `window.addEventListener('pointermove', onMove)` and `window.addEventListener('pointerup', onUp)`. The cleanup is `() => { window.removeEventListener(...) }` but this return value is discarded since it's in an event handler, not a useEffect.

## Proposed Solutions

### Option A: Track active resize with a ref + useEffect cleanup (Recommended)
```tsx
const isResizingRef = useRef(false)
const cleanupResizeRef = useRef<(() => void) | null>(null)

// In handleResizeStart:
cleanupResizeRef.current = () => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

// In useEffect cleanup:
useEffect(() => {
  return () => cleanupResizeRef.current?.()
}, [])
```

### Option B: Use AbortController
Create an AbortController on resize start, pass its signal to addEventListener, abort on unmount via useEffect cleanup.

**Pros:** Cleaner modern API  
**Effort:** Small  
**Risk:** Low

## Recommended Action

Option A — minimal change, no external dependencies.

## Technical Details

**Files affected:**
- `src/components/canvas/CanvasElement.tsx`

**Acceptance Criteria:**
- [ ] Unmounting a CanvasElement during resize drag removes pointermove/pointerup listeners
- [ ] No "setState on unmounted component" warnings in console
- [ ] Normal resize functionality unaffected

## Work Log

- 2026-04-06: Filed from third-round UX review
