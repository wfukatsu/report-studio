---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, performance, quality]
dependencies: []
---

## Problem Statement

CanvasElement.tsx handleResizeStart registers pointermove/pointerup on window inside a closure. If the component unmounts mid-drag (element deleted during drag), the window event listeners are never removed — a permanent memory/event leak. The useCallback also recreates on every element reference change, negating memoization.

## Findings

Performance reviewer: CanvasElement.tsx:43-96 — handleResizeStart creates onPointerMove/onPointerUp closures inside the callback, registers them on window. No cleanup if component unmounts during drag. useCallback depends on [element, onMove, onResize, readonly] — element changes reference on every store write, so callback is effectively recreated on every render.

## Proposed Solutions

A) Use useRef to store mutable resize state and a stable element ref; remove element from useCallback deps; add a useEffect cleanup that removes window listeners on unmount

B) Use an AbortController to cancel in-flight drag on unmount

C) Track active drag in the store and clean up via store subscription

## Recommended Action

## Technical Details

- The stable element ref pattern: `const elementRef = useRef(element); useEffect(() => { elementRef.current = element; }, [element])` — allows the callback to read current element without being a dep
- useEffect cleanup: return a function that calls window.removeEventListener for both pointermove and pointerup if a drag is in progress at unmount time
- AbortController (Option B) is also clean but requires passing signal to the event listener options

## Acceptance Criteria

- [ ] window event listeners are removed if CanvasElement unmounts during an active drag
- [ ] handleResizeStart useCallback does not depend on the element reference directly
- [ ] No memory leak detectable via Chrome DevTools listener panel after repeated add/delete during drag
- [ ] Existing drag-resize behavior is unchanged (regression tests pass)

## Work Log

## Resources

- src/components/canvas/CanvasElement.tsx:43-96
