---
status: pending
priority: p3
issue_id: "027"
tags: [code-review, simplicity, quality]
dependencies: []
---

## Problem Statement

ElementRenderer.tsx:118-124 wraps a simple data access in an immediately-invoked function expression (IIFE). This is unnecessarily complex — it should be a plain ternary or two-line const.

## Findings

Simplicity reviewer: `const resolvedData = element.dataBinding ? ((() => { const rows = (data[element.dataBinding] as string[][] | undefined); return rows ?? element.data })()) : element.data`. This is 5 lines that can be 1.

## Proposed Solutions

A) Replace IIFE with:
```ts
const resolvedData = element.dataBinding
  ? ((data[element.dataBinding] as string[][] | undefined) ?? element.data)
  : element.data
```

## Recommended Action

<!-- Leave blank -->

## Technical Details

- The IIFE pattern was likely used to introduce a named intermediate variable (`rows`) for clarity, but the name adds no information over the expression itself
- The replacement is semantically identical: same type cast, same nullish coalescing fallback, same ternary branch
- No behavior change; purely a readability improvement
- This is a one-line fix with essentially zero risk

## Acceptance Criteria

- [ ] IIFE at ElementRenderer.tsx:118-124 is replaced with a single ternary expression
- [ ] All existing table rendering tests pass without modification
- [ ] The replacement fits within the 50-line function size guideline

## Work Log

## Resources

- Files: `src/components/canvas/ElementRenderer.tsx` lines 118–124
