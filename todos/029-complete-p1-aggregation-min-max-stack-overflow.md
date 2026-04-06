---
status: complete
priority: p1
issue_id: "029"
tags: [code-review, performance, correctness]
dependencies: []
---

## Problem Statement

`aggregateField` in `src/lib/aggregation.ts:34-36` uses `Math.min(...values)` and `Math.max(...values)`. JavaScript's spread operator pushes all array items onto the call stack — at 1000+ records this throws `RangeError: Maximum call stack size exceeded` and crashes the entire PreviewPane.

## Findings

- `src/lib/aggregation.ts:34`: `return Math.min(...values)` — fatal at ≥125k elements (V8 limit)
- `src/lib/aggregation.ts:36`: `return Math.max(...values)` — same
- `RepeatingBandLiveRenderer` calls `aggregateField` per footer column per render
- With 5 columns and live preview at 60fps: 300 passes per second over the array
- Tests in `aggregation.test.ts` only cover small arrays (≤10 records) — the crash is untested

## Resolution

Replaced `Math.min(...values)` and `Math.max(...values)` with `values.reduce()` — single-pass, O(n), no stack allocation. Added test case with 1001 records confirming no stack overflow.

## Acceptance Criteria

- [x] `Math.min(...values)` replaced with reduce
- [x] `Math.max(...values)` replaced with reduce
- [x] Test case added: 1001 records, min/max returns correct value without throwing

## Work Log

- 2026-04-06: Identified by performance-oracle agent during Phase 1-7 refactoring review
- 2026-04-05: Fixed — replaced spread with reduce, added 1001-record test
