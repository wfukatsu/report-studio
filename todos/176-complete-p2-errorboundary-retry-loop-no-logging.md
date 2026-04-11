---
status: complete
priority: p2
issue_id: "176"
tags: [code-review, correctness, react, error-handling]
dependencies: []
---

# ElementErrorBoundary: retry loops on deterministic errors and swallows errors silently

## Problem Statement

`ElementErrorBoundary.handleRetry` resets state to `{hasError: false}` causing React to re-render the child. If the rendering error is deterministic (null-dereference, bad prop), the child immediately throws again — the user sees a flicker and gets the same error state. Additionally, `componentDidCatch` is not implemented, so rendering errors are invisible in production (no console output, no telemetry).

## Findings

**File:** `src/elements/_blocks/renderers/ElementErrorBoundary.tsx:24-26`

No `componentDidCatch`, no error logging. Retry enables infinite error cycles.

Confirmed by: Kieran-TS (MEDIUM #7), Architecture (HIGH #2).

## Proposed Solutions

1. Add `componentDidCatch(error, info)` that logs `console.error(elementId, error, info.componentStack)`
2. Limit retry to 3 attempts (disable button after 3)
3. Document in the component that retry is best-effort for transient errors

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] `componentDidCatch` added with `console.error` logging including element ID
- [ ] Retry limited to 3 attempts OR button disabled after first retry on same error
- [ ] Tests added for error boundary rendering

## Work Log

- 2026-04-11: Kieran-TS (MEDIUM #7) + Architecture (HIGH #2). Invisible production errors.
