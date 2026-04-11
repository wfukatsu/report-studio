---
status: complete
priority: p2
issue_id: "172"
tags: [code-review, types, react, repeatingBand]
dependencies: []
---

# RepeatingBandLiveRenderer uses row.record! non-null assertion — fix with discriminated union

## Problem Statement

`RepeatingBandLiveRenderer` uses `row.record!` (non-null assertion) because the `flatRows` array mixes group-header rows and data rows without a proper discriminated union. If a `type: 'data'` row is ever produced without a `record` field (currently impossible but not type-enforced), this crashes at runtime.

## Findings

**File:** `src/elements/repeatingBand/Renderer.tsx:192`

The `flatRows` array type should be a discriminated union:

```ts
type FlatRow =
  | { type: 'group-header'; groupLabel: string; rowIdx: number }
  | { type: 'data'; record: Record<string, unknown>; rowIdx: number }
```

Confirmed by: Kieran-TS (HIGH #2).

## Acceptance Criteria

- [ ] `flatRows` typed as a proper discriminated union
- [ ] `row.record!` non-null assertion removed
- [ ] TypeScript narrows `record` to non-optional in the `type === 'data'` branch

## Work Log

- 2026-04-11: Flagged by Kieran-TS (HIGH #2).
