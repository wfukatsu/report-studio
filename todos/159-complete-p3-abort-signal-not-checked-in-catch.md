---
status: complete
priority: p3
issue_id: "159"
tags: [code-review, react, async, scalardb]
dependencies: []
---

# AbortController signal not checked in catch block — may show spurious error on cancel

## Problem Statement

`CreateTableForm.handleSubmit` creates an `AbortController` and passes the signal to `createScalarDbTable`. The `catch` block does not guard against the aborted case. If the request is aborted (user clicks キャンセル while a POST is in-flight), the `catch` block still runs `classifyCreateTableError(err)` and calls `setErrorMessage(...)`, which could show a spurious error to the user.

In practice today: clicking キャンセル calls `onCancel()` → parent sets `createFormGroupId = null` → component unmounts → cleanup effect aborts. By the time the abort propagates, the component is already gone. So there is no visible bug right now. But if the cancel flow ever changes (e.g. keeping the form mounted during abort), this would produce "ネットワークエラーが発生しました" on a successful user cancel.

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx` — `catch` block in `handleSubmit`

Missing guard:
```ts
} catch (err) {
  if (controller.signal.aborted) return   // ← add this
  const info = classifyCreateTableError(err)
  ...
}
```

Confirmed by: Architecture reviewer (second pass LOW).

## Proposed Solutions

Add `if (controller.signal.aborted) return` as the first line of the catch block.

**Effort:** Tiny | **Risk:** None

## Acceptance Criteria

- [ ] `catch` block guards against aborted signal before classifying error
- [ ] Test: simulate abort mid-flight → no error message shown, no state update

## Work Log

- 2026-04-11: Flagged by Architecture second pass. Currently harmless but fragile.
