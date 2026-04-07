---
status: complete
priority: p2
issue_id: "132"
tags: [code-review, security, validation, calculationtab]
dependencies: []
---

## Problem Statement

`CalculationRule.key` has no character-class constraint — only `min(1).max(100)`. A user can create a rule with key `"__proto__"`, `"x.constructor"`, or whitespace strings. These keys are: (1) used as JEXL variable references inserted into expressions, (2) used as object property names in `testData` sent to the backend, and (3) displayed in `VariablePanel` buttons. A `__proto__` key in testData could cause prototype pollution on the backend evaluator.

## Findings

- `src/lib/schemas/reportDefinition.ts:190` — `key: z.string().min(1).max(100)` — no regex constraint
- `src/components/modals/CalculationTab.tsx` key `<input>` — no `pattern` attribute
- Backend evaluator receives raw merged record — if Java JEXL does not guard property access, this is exploitable
- Keys with spaces/dots would also break JEXL variable reference syntax

## Proposed Solutions

**A) Add regex to schema + HTML pattern attribute** (Recommended)
```typescript
// src/lib/schemas/reportDefinition.ts
key: z.string().min(1).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'キーは英数字とアンダースコアのみ使用できます')
// src/components/modals/CalculationTab.tsx key input:
<input pattern="[a-zA-Z_][a-zA-Z0-9_]*" ...
```
Also add a real-time validation message below the key input (in addition to the duplicate-key warning).
Effort: Small. Risk: Low (purely additive validation).

## Acceptance Criteria
- [ ] `CalculationRuleSchema.key` has regex `^[a-zA-Z_][a-zA-Z0-9_]*$`
- [ ] Key `<input>` has `pattern` attribute and shows validation error for invalid keys
- [ ] Keys like `__proto__`, `constructor`, `x.y` are rejected at the UI and schema level
- [ ] Unit test for the schema validation

## Work Log
- 2026-04-08: Identified by security-sentinel
