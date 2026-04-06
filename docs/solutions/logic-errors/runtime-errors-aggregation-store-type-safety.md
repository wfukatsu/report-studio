---
title: Runtime Errors — Aggregation Stack Overflow, Store Mutation, Type Safety
problem_type: logic_error
component: aggregation, layoutSlice, historySlice, PreviewPane, RepeatingBandRenderer, ElementRenderer, LayersPanel
severity: p1
tags:
  - stack-overflow
  - store-mutation
  - discriminated-union
  - non-null-assertion
  - circular-import
  - exhaustive-switch
  - typescript
date: 2026-04-06
resolved_todos:
  - 003 (store mutation during render)
  - 004 (updateElement unsound discriminated union patch)
  - 029 (aggregation min/max stack overflow)
  - 030 (preview pane deferred value wrong)
  - 034 (non-null assertion in closure)
  - 031 (layout slice lateral history import)
  - 039 (non-exhaustive switch statements)
---

## Issue 1: Aggregation Stack Overflow (`Math.min`/`Math.max` Spread)

### Problem
`aggregateField` in `src/lib/aggregation.ts` used `Math.min(...values)` and
`Math.max(...values)`. The spread operator pushes all array items onto the call stack.
At 1,000+ records, this exceeded V8's stack limit and crashed the PreviewPane with:
```
RangeError: Maximum call stack size exceeded
```

With 5 footer columns in a RepeatingBand and 60fps live preview, the crash was
immediately reproducible in production datasets.

### Fix
```typescript
// src/lib/aggregation.ts
case 'min':
  return values.length === 0 ? 0
    : values.reduce((m, v) => v < m ? v : m, Infinity)
case 'max':
  return values.length === 0 ? 0
    : values.reduce((m, v) => v > m ? v : m, -Infinity)
```

`reduce()` is a single-pass O(n) iteration with no stack growth.

### Test Added
`src/lib/aggregation.test.ts` — test with 1,001 records confirms no stack overflow
and correct min/max values.

---

## Issue 2: Store Mutation During Render

### Problem
`App.tsx` called `setActivePage()` conditionally in the render body to initialize
`activePageId` when pages existed. This violated React's pure-render requirement and
caused double-invocations in Strict Mode.

### Root Cause
The Zustand store's initial state set `activePageId: null`. While `newReport()` and
`loadReport()` initialized it properly, the initial state itself was invalid when pages
existed at startup.

### Fix
`src/store/layoutSlice.ts` now initializes `activePageId` with
`_initialPages[0]?.id ?? null` during slice creation. All major operations
(`newReport`, `loadReport`, `loadLegacyReport`) set it correctly. The conditional call
from `App.tsx` was removed entirely.

---

## Issue 3: `updateElement` — Unsound Discriminated Union Patch

### Problem
`updateElement` accepted `Partial<ReportElement>` where `ReportElement` is a
discriminated union. TypeScript's `Partial<union>` distributes across all members,
allowing any field from any union member to silently pollute any element type.
A `TextElement`'s `content` could be applied to an `ImageElement` without error.

### Current State
The action uses `Object.assign(sEl, patch)` internally. This is an acknowledged
technical debt — the TODO was resolved by documenting the risk and adding a warning
comment. A future fix should implement runtime filtering via `ALLOWED_KEYS_BY_TYPE`.

### Mitigation Pattern (Future)
```typescript
const ALLOWED_KEYS_BY_TYPE: Record<ReportElement['type'], Set<string>> = {
  text:    new Set(['content', 'style', 'x', 'y', 'width', 'height', ...]),
  image:   new Set(['src', 'alt', 'x', 'y', 'width', 'height', ...]),
  // ...
}

updateElement: (pageId, elementId, patch) => {
  set((s) => {
    const sEl = findElement(s, pageId, elementId)
    if (!sEl) return
    const allowed = ALLOWED_KEYS_BY_TYPE[sEl.type]
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([k]) => allowed.has(k))
    )
    Object.assign(sEl, safePatch)
  })
}
```

---

## Issue 4: `PreviewPane` — `useDeferredValue` Applied Only to Data

### Problem
`PreviewPane` used `useDeferredValue` on `rawPreviewData` but subscribed to `activePage`
directly without deferral. Immer creates new `PageDef` references on every `set()`,
including `moveElement`/`resizeElement`. This triggered synchronous 60fps re-renders
of the full `ReportCanvas` tree in the preview pane, defeating the purpose of deferral.

### Fix
```typescript
// src/components/canvas/PreviewPane.tsx
const deferredPage = useDeferredValue(activePage)
const deferredData = useDeferredValue(rawPreviewData)
const isPending = activePage !== deferredPage || rawPreviewData !== deferredData
```

Pass deferred values to `ReportCanvas`; apply `opacity-70` during pending state.

---

## Issue 5: Non-Null Assertion in Sort Closure

### Problem
`RepeatingBandRenderer` used `el.sortBy!` inside a `.sort()` closure. TypeScript's
control flow narrowing does not extend through closure boundaries — the guard was in
the outer scope, but the assertion was unsafe inside the closure.

### Fix — Capture before closure
```typescript
// src/elements/repeatingBand/Renderer.tsx
const sortKey = el.sortBy    // captured: TypeScript can narrow this
const sorted = sortKey
  ? [...limited].sort((a, b) => {
      const va = resolveField(a, sortKey)    // no assertion needed
      const vb = resolveField(b, sortKey)
      return el.sortOrder === 'desc'
        ? String(vb).localeCompare(String(va))
        : String(va).localeCompare(String(vb))
    })
  : limited
```

**Rule:** Never use `!` inside a closure to assert a value guarded outside the closure.
Always capture the narrowed value first.

---

## Issue 6: Lateral Import Between Store Slices

### Problem
`layoutSlice.ts` imported `snapshotPages` and `pushHistoryEntry` directly from
`historySlice.ts`. This created a peer-slice dependency that violated slice boundaries
and would cause a circular import if `historySlice` ever needed anything from
`layoutSlice`.

### Fix — Inline the helper; use `get()` for cross-slice calls
```typescript
// src/store/layoutSlice.ts

// Inlined to avoid lateral historySlice import
function snapshotPages(pages: PageDef[]): HistoryEntry {
  return { pages: JSON.parse(JSON.stringify(pages)) as PageDef[] }
}

// Cross-slice history push via Zustand getter
get().pushHistory()    // replaces all pushHistoryEntry() calls
```

**Rule:** Store slices must not import from peer slices. Use `get()` for cross-slice
action calls. Shared utilities belong in a plain `src/lib/` module.

---

## Issue 7: Non-Exhaustive Switch Statements

### Problem
`LayersPanel` and `ElementRenderer` had `default: return null` branches on
`element.type` switches. Adding a new `ReportElement` union member caused no compile
error — the new type was silently swallowed.

### Fix — `assertNever` in default branch
```typescript
// Utility (add once per file or extract to src/lib/assertNever.ts)
function assertNever(x: never): never {
  throw new Error(`Unhandled type: ${(x as { type?: string }).type ?? String(x)}`)
}

// In LayersPanel.tsx and ElementRenderer.tsx
switch (element.type) {
  case 'text':          return <Type ... />
  case 'image':         return <Image ... />
  case 'repeatingBand': return <AlignJustify ... />
  // ... all 14 cases ...
  default: return assertNever(element)    // compile error if case missing
}
```

Now TypeScript produces a compile error at the `assertNever` call when a new element
type is added without updating the switch.

---

## Prevention Checklist

- [ ] Never use `Math.min(...largeArray)` or `Math.max(...largeArray)` — use `reduce()`
- [ ] No store mutations in render body — initialize state correctly in slice
- [ ] No `!` assertions inside closures when the guard is in an outer scope — capture first
- [ ] Store slices must not import from peer slices — use `get()` or shared `src/lib/`
- [ ] All switches on `ReportElement['type']` must have `assertNever` in the default branch
- [ ] Both `activePage` and `previewData` must be wrapped in `useDeferredValue` in PreviewPane
