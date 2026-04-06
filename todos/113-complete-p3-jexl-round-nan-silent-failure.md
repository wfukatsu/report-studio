---
status: complete
priority: p3
issue_id: "113"
tags: [code-review, data-integrity, ux]
dependencies: []
---

## Problem Statement

The `round()` custom function registered in `jexlEngine.ts` silently returns `NaN` when passed a non-numeric value. Calculation rules that call `round(someTextField)` where the field is empty or contains a string will produce `NaN` as the stored result without any user-visible error. The `NaN` value then propagates into template expressions as the string `"NaN"`.

## Findings

**File:** `src/lib/jexlEngine.ts`

```typescript
jexl.addFunction('round', (value: unknown, decimals = 0) => {
  return Math.round(Number(value) * 10 ** decimals) / 10 ** decimals
})
```

`Number(null)` → `0`, `Number('')` → `0`, `Number('abc')` → `NaN`, `Number(undefined)` → `NaN`.

When `value` is a string like `"abc"`, `Math.round(NaN * 1) / 1` → `NaN`. The calculation rule stores `NaN`, and any template expression referencing it renders as the literal string `"NaN"` on the exported PDF.

**Contrast with `sum()`:**

```typescript
jexl.addFunction('sum', (...args: unknown[]) => {
  return args.flat().reduce((acc, v) => acc + Number(v), 0)
})
```

`sum()` coerces `NaN` to `0` implicitly via `acc + NaN` → `NaN`, so it has the same issue but it's less likely to surface because `sum` typically receives arrays of numbers from data fields.

## Proposed Solutions

**A) Return `null` for non-finite inputs (Recommended)**

```typescript
jexl.addFunction('round', (value: unknown, decimals = 0) => {
  const n = Number(value)
  if (!isFinite(n)) return null
  return Math.round(n * 10 ** decimals) / 10 ** decimals
})
```

`null` in a template expression renders as empty string, which is more user-friendly than `"NaN"`.

**B) Throw an error for non-finite inputs**

```typescript
if (!isFinite(n)) throw new Error(`round(): expected a number, got "${value}"`)
```

This causes the calculation rule to emit an evaluation error, visible to the user. More correct but potentially disruptive if data fields are sometimes empty.

**C) Accept the NaN behavior**

Document that `round()` passes through `NaN` for non-numeric inputs. Acceptable only if users are told to handle empty fields before calling `round()`.

## Recommended Action

Option A — returning `null` is the most user-friendly silent fallback. Option B for stricter environments.

## Technical Details

- **File**: `src/lib/jexlEngine.ts`
- The same `isFinite` guard should be applied to `sum()` if it should also avoid `NaN` output
- `isFinite(NaN)` → `false`, `isFinite(Infinity)` → `false`, `isFinite(0)` → `true`

## Acceptance Criteria

- [ ] `round('abc')` returns `null` (or throws), not `NaN`
- [ ] `round(null)` returns `null` (or throws), not `NaN`
- [ ] `round(3.14159, 2)` still returns `3.14`
- [ ] Unit test covering non-numeric input added to `jexlEngine.test.ts`

## Work Log

- 2026-04-06: Identified by TypeScript reviewer and Simplicity reviewer
