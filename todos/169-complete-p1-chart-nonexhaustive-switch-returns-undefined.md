---
status: complete
priority: p1
issue_id: "169"
tags: [code-review, correctness, chart, react]
dependencies: []
---

# ChartContent switch is non-exhaustive — unknown chartType returns undefined (React crash)

## Problem Statement

`ChartContent.tsx` switches on `chartType` (`'bar' | 'line' | 'pie' | 'donut'`) with no `default` branch. If `chartType` is an unrecognized value (e.g. from a future type or a deserialized old template), the component returns `undefined` and React throws "Objects are not valid as a React child".

## Findings

**File:** `src/elements/_blocks/renderers/ChartContent.tsx:44`

The switch returns `JSX.Element` in known branches but has no `default`, making the inferred return type `JSX.Element | undefined`. React will crash on `undefined`.

Confirmed by: Kieran-TS (HIGH #1).

## Proposed Solutions

Add a `default` case that renders a clear fallback:

```tsx
default: return (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
    不明なグラフタイプ: {String(chartType)}
  </div>
)
```

**Effort:** Tiny | **Risk:** None

## Acceptance Criteria

- [ ] `default` case added to the `switch` in `ChartContent.tsx`
- [ ] Return type of the function is `JSX.Element` (not `JSX.Element | undefined`)
- [ ] Unknown chartType renders a visible fallback instead of crashing

## Work Log

- 2026-04-11: Flagged by Kieran-TS (HIGH #1). One-liner fix.
