---
status: complete
priority: p1
issue_id: "034"
tags: [code-review, typescript]
dependencies: []
---

## Problem Statement

`RepeatingBandRenderer` uses `el.sortBy!` non-null assertions inside a sort comparator closure. TypeScript control flow does not narrow through closures, so this is a type-unsafe assertion even though it looks guarded.

## Findings

- `src/elements/repeatingBand/Renderer.tsx:108-109`:
  ```ts
  const va = resolveField(a, el.sortBy!)  // inside .sort() closure
  const vb = resolveField(b, el.sortBy!)  // inside .sort() closure
  ```
- The `if (el.sortBy)` guard is on the outer block, not inside the closure
- TypeScript cannot narrow through closures — the `!` is suppressing a legitimate type warning
- If `el.sortBy` is modified to `undefined` asynchronously (unlikely but possible with immer), the sort would call `resolveField(a, undefined)` and return empty string for all comparisons silently

## Proposed Solutions

**A) Capture the value before the closure (Recommended)**
```ts
const sortKey = el.sortBy  // string, guaranteed non-null at this point
if (sortKey) {
  const sorted = [...limited].sort((a, b) => {
    const va = resolveField(a, sortKey)  // no assertion needed
    const vb = resolveField(b, sortKey)
    return el.sortOrder === 'desc'
      ? String(vb).localeCompare(String(va))
      : String(va).localeCompare(String(vb))
  })
}
```

**B) Keep the assertion, add a comment**
Documents the intent but leaves the unsound assertion in place.

## Recommended Action

Apply solution A — it eliminates the assertion and makes TypeScript's narrowing work correctly.

## Technical Details

- **File:** `src/elements/repeatingBand/Renderer.tsx:106-115`

## Acceptance Criteria

- [ ] No `!` non-null assertion on `el.sortBy` inside a closure
- [ ] TypeScript compiles without suppressed errors on this code path
- [ ] Sort behavior is unchanged

## Work Log

- 2026-04-06: Identified by TypeScript reviewer agent
