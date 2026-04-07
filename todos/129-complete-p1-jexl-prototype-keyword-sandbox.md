---
status: complete
priority: p1
issue_id: "129"
tags: [code-review, security, jexl]
dependencies: []
---

## Problem Statement

`evaluateExpression` in `src/lib/jexlEngine.ts` does not block prototype-access keywords. A JEXL expression containing `constructor`, `__proto__`, or `prototype` can escape the intended data sandbox and access the JavaScript runtime. In the single-user design tool context the immediate risk is self-contained, but if templates are shared/exported and loaded by another user, stored expressions run in that user's browser context.

## Findings

- `@pawel-up/jexl` resolves identifiers via unsafe property access — no property blocklist
- Keywords `constructor`, `__proto__`, `prototype` allow prototype chain traversal
- The 500-character expression limit exists in `ReportDefinitionSchema` but is only enforced at import time, not during live evaluation in `handleTest`
- The codebase already uses a `FORBIDDEN` keyword guard in `resolveField` (todo #001) — the same pattern is needed in `evaluateExpression`

## Proposed Solutions

**A) Add forbidden keyword regex guard at the top of `evaluateExpression`** (Recommended)

Add a pre-evaluation check before calling the JEXL library:
```typescript
const JEXL_FORBIDDEN = /\b(constructor|__proto__|prototype)\b/
// Inside evaluateExpression, before calling jexl:
if (JEXL_FORBIDDEN.test(expression)) {
  throw new Error('式に禁止されているキーワードが含まれています')
}
```
Effort: Small. Risk: Low (adds a pre-check before library call).

**B) Configure JEXL with an explicit function/transform allowlist** — more comprehensive but requires deeper library configuration.
Effort: Medium. Risk: Low.

## Acceptance Criteria
- [ ] An expression containing `constructor` throws a clear error message
- [ ] An expression containing `__proto__` throws a clear error message
- [ ] Valid expressions like `price * quantity` still evaluate correctly
- [ ] Unit test added to `src/lib/jexlEngine.test.ts` for each forbidden keyword pattern

## Work Log
- 2026-04-08: Identified by security-sentinel
