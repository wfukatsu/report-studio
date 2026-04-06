---
status: complete
priority: p2
issue_id: "037"
tags: [code-review, architecture]
dependencies: []
---

## Problem Statement

`_historyTimer` is declared at module scope in `layoutSlice.ts`, not inside the slice creator. This creates hidden global mutable state that survives `newReport()`/`loadReport()` calls and causes test isolation issues.

## Findings

- `src/store/layoutSlice.ts:152`: `let _historyTimer: ReturnType<typeof setTimeout> | null = null`
- Declared at module scope — persists across all store instances and test runs
- If a user loads a new report within 300ms of an `updateElement` call, the debounced `pushHistory` fires against the new report's state instead of the previous one
- `beforeEach(() => store.getState().newReport())` in tests does NOT reset this timer
- Tests that call `updateElement` then immediately check undo state may fail non-deterministically

## Proposed Solutions

**A) Move inside createLayoutSlice closure (Recommended)**
```ts
export function createLayoutSlice(set: ..., get: ..., api: ...) {
  const timerRef = { current: null as ReturnType<typeof setTimeout> | null }
  return {
    // use timerRef.current instead of _historyTimer
  }
}
```
Each store instance gets its own timer. Resets when a new store is created (e.g., in tests).

**B) Clear timer in newReport/loadReport actions**
```ts
newReport: () => set(draft => {
  if (_historyTimer) { clearTimeout(_historyTimer); _historyTimer = null }
  // ... rest of action
})
```
Minimally invasive but still leaves the module-scope variable.

## Recommended Action

Apply solution A — it is the architecturally correct fix and prevents all variants of the problem including test flakiness.

## Technical Details

- **File:** `src/store/layoutSlice.ts:152`

## Acceptance Criteria

- [ ] `_historyTimer` is not declared at module scope
- [ ] Timer is isolated to the store instance (closure variable or ref)
- [ ] `newReport()` and `loadReport()` correctly reset the debounce timer
- [ ] Test: calling `updateElement` then `newReport()` within 300ms does not push history to the new report

## Work Log

- 2026-04-06: Identified by architecture-strategist agent
