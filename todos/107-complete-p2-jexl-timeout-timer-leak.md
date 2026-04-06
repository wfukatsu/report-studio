---
status: complete
priority: p2
issue_id: "107"
tags: [code-review, performance, memory-leak]
dependencies: []
---

## Problem Statement

`jexlEngine.ts` implements a 500ms evaluation timeout via `Promise.race`, but the `setTimeout` created inside the timeout helper is never cleared when the expression resolves first. Every successful evaluation leaks one timer that fires 500ms later calling `reject` on an already-settled promise. At high evaluation frequency (e.g., preview re-render on every keystroke, 200-rule validation burst), this produces a large queue of no-op timer callbacks.

## Findings

**File:** `src/lib/jexlEngine.ts`

The `timeoutReject` helper creates a new `setTimeout` each time but provides no `AbortSignal` or `clearTimeout` path. The pattern is:

```typescript
function timeoutReject(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Evaluation timeout')), ms)
  )
}

// In evaluateExpression:
return Promise.race([jexl.evaluate(expression, context), timeoutReject(500)])
```

When `jexl.evaluate` resolves before the 500ms deadline, `Promise.race` resolves with the expression value — but the `setTimeout` callback is still scheduled and will fire 500ms later, calling `reject` on a promise nobody holds. The callback itself is a no-op (settled promise), but:

1. The timer object is not garbage-collected until it fires
2. At 200 validation rules × ~0 ms evaluation time, 200 timers are scheduled simultaneously, all firing ~500ms later as a burst
3. On low-end devices this 200-callback burst at 500ms can cause a brief jank

## Proposed Solutions

**A) Return a cancel function from timeoutReject (Recommended, Small effort)**

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>
  const timeoutP = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error('Evaluation timeout')), ms)
  })
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timerId))
}

// In evaluateExpression:
return withTimeout(jexl.evaluate(expression, context), 500)
```

The `.finally(() => clearTimeout(timerId))` runs whether the expression resolves or the timeout fires, eliminating the leak. No external dependencies.

**B) Use AbortController pattern**

Create a shared `AbortController`, pass its signal to the timeout, and abort when the main promise resolves. More complex for this simple use case.

**C) Accept the leak (Status quo)**

Timer callbacks are no-ops and very cheap. At the current scale (200 rules max, run once before export), the 200 timer burst fires only once per export. Defer fix until actual perf data shows impact.

## Recommended Action

Option A — three-line refactor with zero risk and clean resource management.

## Technical Details

- **File**: `src/lib/jexlEngine.ts`
- The `.finally()` chain on `Promise.race` is the standard pattern for cancellable timeouts
- This also interacts with issue #108 (concurrent evaluation burst): fixing the concurrency limit reduces the peak timer count from 200 to 16 simultaneously active timers

## Acceptance Criteria

- [ ] `evaluateExpression` clears the timeout timer when the expression resolves before the deadline
- [ ] `evaluateExpression` still rejects with a timeout error when the expression exceeds 500ms
- [ ] No timer-related memory leak in profiler when evaluating 200 rules sequentially

## Work Log

- 2026-04-06: Identified by Performance reviewer (HIGH) and Architecture reviewer (MEDIUM)
