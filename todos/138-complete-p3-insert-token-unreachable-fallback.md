---
status: complete
priority: p3
issue_id: "138"
tags: [code-review, simplicity, calculationtab]
dependencies: []
---

## Problem Statement

`handleInsertToken` has a `if (!ta)` fallback branch that is unreachable in practice. The `textareaRef` is attached to a textarea that is unconditionally rendered within the same mounted `RuleRow`. The fallback appends without cursor restoration — a worse behavior that can never be triggered.

## Findings

- `src/components/modals/CalculationTab.tsx` lines 290-294:
  ```typescript
  if (!ta) {
    onUpdate({ expression: rule.expression + token })
    return
  }
  ```
- The textarea is always rendered before `VariablePanel` (which triggers `handleInsertToken`) in the same component tree
- The fallback creates a subtle false expectation: it looks like a safety net but is actually dead code

## Proposed Solutions

**A) Remove the fallback, use non-null assertion** (Recommended)
```typescript
function handleInsertToken(token: string) {
  const ta = textareaRef.current!
  const start = ta.selectionStart ?? rule.expression.length
  // ...
}
```
Effort: Tiny. Risk: None.

## Acceptance Criteria
- [ ] `if (!ta)` guard removed from `handleInsertToken`
- [ ] `textareaRef.current` accessed with `!` assertion
- [ ] Existing tests still pass

## Work Log
- 2026-04-08: Identified by code-simplicity-reviewer
