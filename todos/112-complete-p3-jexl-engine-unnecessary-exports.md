---
status: complete
priority: p3
issue_id: "112"
tags: [code-review, typescript, simplicity]
dependencies: []
---

## Problem Statement

`jexlEngine.ts` exports two symbols that have no external callers: the `evaluateCondition` wrapper function and the `jexl` singleton instance. Exporting internals widens the module's API surface, makes future refactoring harder, and signals to readers that these are intended extension points (they are not).

## Findings

**File:** `src/lib/jexlEngine.ts`

**1. `evaluateCondition` wrapper:**

```typescript
export async function evaluateCondition(expression: string, context: Record<string, unknown>): Promise<boolean> {
  const result = await evaluateExpression(expression, context)
  return Boolean(result)
}
```

Only `validationRunner.ts` uses this function. The wrapper adds one line of logic (`Boolean(result)`) that `validationRunner.ts` could perform inline. The indirection obscures that validation rules get boolean coercion while calculation rules do not.

**2. `export { jexl }` at module bottom:**

```typescript
export { jexl }
```

No file in the codebase imports `jexl` directly. Exporting the raw singleton allows callers to call `jexl.addFunction()` or `jexl.addTransform()` bypassing the singleton configuration, which could lead to inconsistent engine state.

## Proposed Solutions

**A) Remove both exports (Recommended, Trivial)**

- Delete `evaluateCondition` function; inline `Boolean(await evaluateExpression(...))` in `validationRunner.ts`
- Remove `export { jexl }` — keep the singleton as an internal implementation detail

**B) Keep `evaluateCondition`, remove `export { jexl }`**

Acceptable compromise. `evaluateCondition` is a minor convenience; the real issue is the exposed singleton.

## Recommended Action

Option A — both are unused externally and removing them simplifies the API.

## Technical Details

- **File**: `src/lib/jexlEngine.ts`, `src/lib/validationRunner.ts`
- The `jexl` singleton with its registered functions must remain; only the export is removed
- The change to `validationRunner.ts` is one line: `const fired = Boolean(await evaluateExpression(rule.condition, context))`

## Acceptance Criteria

- [ ] `jexlEngine.ts` does not export the `jexl` instance
- [ ] `evaluateCondition` is either removed or made unexported
- [ ] `validationRunner.ts` uses `evaluateExpression` and coerces to boolean inline
- [ ] All tests pass

## Work Log

- 2026-04-06: Identified by Simplicity reviewer
