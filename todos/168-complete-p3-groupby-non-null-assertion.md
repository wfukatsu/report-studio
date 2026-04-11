---
status: complete
priority: p3
issue_id: "168"
tags: [code-review, types, react, repeatingBand]
dependencies: []
---

# GroupedBandRenderer uses el.groupBy! non-null assertion — replace with narrowed type

## Problem Statement

`GroupedBandRenderer` uses `el.groupBy!` at line ~290 in `Renderer.tsx`. While the parent `RepeatingBandLiveRenderer` guards with `if (el.groupBy)` before calling it, non-null assertions bypass TypeScript's safety net. If the call site is ever refactored the assertion becomes a hidden null pointer.

## Proposed Solution

Change the component prop signature to narrow `groupBy`:

```ts
function GroupedBandRenderer({
  el,
}: {
  el: RepeatingBandElement & { groupBy: string }
}) {
  const groupByField = el.groupBy  // no assertion needed
```

**Effort:** Tiny | **Risk:** None

## Acceptance Criteria

- [ ] `el.groupBy!` removed
- [ ] Component prop type narrows `groupBy` to `string`

## Work Log

- 2026-04-11: Flagged by Kieran-TS (M4).
