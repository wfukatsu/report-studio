---
status: pending
priority: p2
issue_id: "057"
tags: [ux-review, error-handling, reliability]
dependencies: []
---

# React ErrorBoundary Missing

## Problem

No React ErrorBoundary components exist. If any element renderer throws (bad data, malformed barcode, chart error), the entire app crashes with a white screen. The `assertNever` throw in ElementRenderer also causes full crash.

## Findings

- Grep confirms zero ErrorBoundary usage in codebase
- `src/components/canvas/ElementRenderer.tsx` — `assertNever` throws synchronously on unknown element type
- `src/elements/chart/Renderer.tsx`, `src/elements/barcode/Renderer.tsx` — complex renderers likely to throw on malformed data

## Solutions

### A) Per-element ErrorBoundary (Recommended)

Add ErrorBoundary wrapping ElementRenderer per canvas element — shows error indicator instead of crash:

```tsx
// In CanvasElement.tsx, wrap <ElementRenderer>:
<ElementBoundary elementId={element.id}>
  <ElementRenderer element={element} data={data} />
</ElementBoundary>
```

### B) Top-level ErrorBoundary

Add top-level ErrorBoundary in App.tsx as safety net.

## Recommendation

**Both A and B**.

## Files

- `src/components/canvas/CanvasElement.tsx`
- `src/App.tsx`
