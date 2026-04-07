---
status: complete
priority: p2
issue_id: "131"
tags: [code-review, security, jexl, calculationtab]
dependencies: ["129"]
---

## Problem Statement

Expression length is validated (max 500 chars) only at JSON import time via `ReportDefinitionSchema`. During live editing, the textarea has no `maxLength` attribute and `evaluateExpression` performs no length check. A user can type arbitrarily long expressions that consume CPU before the 500ms timeout cancels them.

## Findings

- `src/lib/schemas/reportDefinition.ts:193` — `z.string().max(500)` constraint exists but is only applied during `importFromJSON`
- `src/components/modals/CalculationTab.tsx` line 351 — `<textarea>` has no `maxLength`
- `src/lib/jexlEngine.ts` — `evaluateExpression` does not check length before calling `jexl.eval`
- The 500ms timeout (`EVAL_DEBOUNCE_MS`) limits wall-clock impact but not parse-complexity attacks

## Proposed Solutions

**A) Add `maxLength` to textarea + guard in `evaluateExpression`** (Recommended)
```tsx
// CalculationTab.tsx textarea:
<textarea maxLength={500} ...
// jexlEngine.ts:
if (expression.length > 500) throw new Error('式が長すぎます (最大500文字)')
```
Effort: Small. Risk: None.

**B) Add length check only in textarea** — still allows programmatic calls without guard. Less safe.

## Acceptance Criteria
- [ ] Expression `<textarea>` has `maxLength={500}`
- [ ] `evaluateExpression` throws a clear error if `expression.length > 500`
- [ ] Unit test added verifying the length check

## Work Log
- 2026-04-08: Identified by security-sentinel
