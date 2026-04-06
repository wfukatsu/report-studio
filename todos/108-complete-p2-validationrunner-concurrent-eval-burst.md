---
status: complete
priority: p2
issue_id: "108"
tags: [code-review, performance]
dependencies: ["107"]
---

## Problem Statement

`validationRunner.ts` uses `Promise.all` to run all validation rules concurrently with no concurrency limit. At 200 rules, this launches 200 JEXL evaluations simultaneously, queuing 200 micro-tasks in one tick and potentially causing a main-thread burst that freezes the UI during the export pre-flight check.

## Findings

**File:** `src/lib/validationRunner.ts:25–40`

```typescript
await Promise.all(
  rules.map(async (rule) => {
    if (!rule.condition.trim()) return
    try {
      const fired = await evaluateCondition(rule.condition, context)
      ...
    } catch { ... }
  }),
)
```

**Impact at scale (200 rules):**
- 200 JEXL parser/evaluator calls queued simultaneously in one event loop tick
- Combined with the timer leak (issue 107), 200 × 500ms timers are created simultaneously
- On a mid-tier device, the synchronous parsing phase blocks the main thread before the first `await` yields
- User sees UI freeze during "checking validation rules before export"

## Proposed Solutions

**A) Concurrency pool with limit 16 (Recommended, Small effort)**

```typescript
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// In runValidation:
await runWithConcurrency(
  rules.map((rule) => async () => { /* evaluation logic */ }),
  16,
)
```

**B) Sequential evaluation (Simplest, slowest)**
Replace `Promise.all` with a simple `for...of` loop. Eliminates bursting entirely but increases wall-clock time linearly.

**C) Keep Promise.all but add a yield (Quick patch)**
Insert `await new Promise(r => setTimeout(r, 0))` every N rules to let the event loop breathe between batches. Hacky but effective.

## Recommended Action

Option A — self-contained helper with no external dependencies.

## Technical Details

- **File**: `src/lib/validationRunner.ts`
- Current max rules: 200 (enforced by Zod schema `validationRules: z.array(...).max(200)`)
- The concurrency helper can be extracted to a shared `src/lib/asyncUtils.ts` for reuse

## Acceptance Criteria

- [ ] Pre-flight validation with 200 rules does not cause observable UI freeze
- [ ] Wall-clock time for 200 fast rules is not significantly longer than with `Promise.all`
- [ ] All violations are still collected correctly (no results lost due to pooling)

## Work Log

- 2026-04-06: Identified as CRITICAL by Performance reviewer
