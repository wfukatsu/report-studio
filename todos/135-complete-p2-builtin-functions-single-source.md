---
status: complete
priority: p2
issue_id: "135"
tags: [code-review, architecture, jexl, agent-native, calculationtab]
dependencies: []
---

## Problem Statement

`BUILTIN_FUNCTIONS` is defined as a private constant in `CalculationTab.tsx` but the actual functions are registered in `jexlEngine.ts`. These two files are silently coupled — adding a new function to the engine does not update the UI panel, and vice versa. Additionally, agents writing JEXL expressions have no programmatic way to enumerate available functions.

## Findings

- `src/components/modals/CalculationTab.tsx` lines 49-53: private `BUILTIN_FUNCTIONS` array
- `src/lib/jexlEngine.ts` registers `sum`, `count`, `round` via `jexl.addFunction` — no export of function names
- Agents referencing the store or types cannot discover available JEXL functions without reading UI component source
- Similar drift issue as the prior `resolveField`/`FORBIDDEN` finding (#001)

## Proposed Solutions

**A) Export `JEXL_BUILTINS` from `jexlEngine.ts`; import in `CalculationTab`** (Recommended)
```typescript
// src/lib/jexlEngine.ts
export const JEXL_BUILTINS = [
  { name: 'sum',   signature: 'sum(array)',           description: '配列の合計値' },
  { name: 'count', signature: 'count(array)',          description: '配列の要素数' },
  { name: 'round', signature: 'round(value, places?)', description: '小数の丸め' },
] as const

// src/components/modals/CalculationTab.tsx — remove local BUILTIN_FUNCTIONS, import above
```
Effort: Small. Risk: None.

## Acceptance Criteria
- [ ] `JEXL_BUILTINS` exported from `src/lib/jexlEngine.ts`
- [ ] Local `BUILTIN_FUNCTIONS` constant removed from `CalculationTab.tsx`
- [ ] `CalculationTab` imports and renders from `JEXL_BUILTINS`
- [ ] `jexlEngine.test.ts` can import `JEXL_BUILTINS` and verify each entry has a registered function

## Work Log
- 2026-04-08: Identified by architecture-strategist, agent-native-reviewer
