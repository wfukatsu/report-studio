---
status: complete
priority: p3
issue_id: "099"
tags: [code-review, bug, error-boundary, react]
dependencies: []
---

# 099 — ElementErrorBoundary doesn't reset when element changes

## Problem Statement

Once an ElementErrorBoundary catches an error, `hasError` stays `true` forever. If the user edits the element that caused the error (e.g., fixes an invalid field binding), the boundary doesn't auto-recover — it still shows the error fallback. The user must click "再試行" manually, which is non-obvious.

## Findings

**File:** `src/components/canvas/ElementErrorBoundary.tsx`

React error boundaries don't auto-reset when children change. `componentDidUpdate` is not implemented.

## Proposed Solutions

### Option A: Reset on elementId prop change
```tsx
componentDidUpdate(prevProps: Props) {
  if (this.state.hasError && prevProps.elementId !== this.props.elementId) {
    this.setState({ hasError: false, error: null })
  }
}
```

Or better: add a `key={element.id}` (or `key={element.id + '-' + element.version}`) at the boundary usage site so React remounts the boundary when the element changes.

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] Boundary auto-resets when element is edited (key change or componentDidUpdate)

## Work Log
- 2026-04-06: Filed from third-round UX review
