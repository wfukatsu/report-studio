---
status: complete
priority: p2
issue_id: "175"
tags: [code-review, correctness, chart, validation]
dependencies: []
---

# ChartRenderer casts bound data to Record<>[] without runtime validation

## Problem Statement

`ChartRenderer.tsx` casts `data[el.dataBinding]` to `Record<string, unknown>[]` without verifying that the array elements are actually plain objects. Recharts receives an array that may contain primitives or other types, causing silent rendering failures or unexpected chart behavior.

## Findings

**File:** `src/elements/chart/Renderer.tsx:22`

```ts
if (Array.isArray(bound)) return bound as Record<string, unknown>[]
```

Should validate that at least the first element is a plain object before accepting.

## Proposed Solution

```ts
if (Array.isArray(bound) && bound.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
  return bound as Record<string, unknown>[]
}
```

Fall back to `SAMPLE_DATA` with a console warning if validation fails.

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] Runtime check verifies array elements are plain objects before cast
- [ ] Falls back to sample data with a warning on validation failure

## Work Log

- 2026-04-11: Flagged by Kieran-TS (MEDIUM #6) and Security (P2).
