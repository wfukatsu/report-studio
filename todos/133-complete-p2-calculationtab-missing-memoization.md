---
status: complete
priority: p2
issue_id: "133"
tags: [code-review, performance, react, calculationtab]
dependencies: []
---

## Problem Statement

`CalculationTab` computes `schemaFields` and `allKeys` inline on every render without `useMemo`. Since these are passed as props to every `RuleRow`, all N rows re-render on every single keystroke — even when only one row's expression changed and the schema/keys are unchanged. At 10+ rules, this causes measurable render churn.

## Findings

- `src/components/modals/CalculationTab.tsx` lines 451-457:
  ```typescript
  const schemaFields = schema?.groups.flatMap(...) ?? []  // new array every render
  const allKeys = calculationRules.map((r) => r.key)       // new array every render
  ```
- `RuleRow` is not wrapped in `React.memo` — cannot bail out even if props are referentially equal
- `onUpdate` and `onRemove` are inline closures — new function reference every render
- `isDuplicateKey` computation (O(n) filter) runs in every `RuleRow` on every render → O(n²) total
- The codebase already has `useSchemaFieldOptions` hook for exactly this memoization pattern

## Proposed Solutions

**A) Add `useMemo` + `React.memo` + stable callbacks** (Recommended)
```typescript
// CalculationTab
const schemaFields = useMemo(
  () => schema?.groups.flatMap((g) => g.fields.map((f) => ({ groupLabel: g.label, field: f }))) ?? [],
  [schema]
)
const allKeys = useMemo(() => calculationRules.map((r) => r.key), [calculationRules])
const duplicateKeySet = useMemo(() => {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const k of allKeys) { seen.has(k) ? dupes.add(k) : seen.add(k) }
  return dupes
}, [allKeys])

// Wrap RuleRow in React.memo
const RuleRow = React.memo(function RuleRow(...) { ... })
// isDuplicateKey in RuleRow becomes O(1):
const isDuplicateKey = duplicateKeySet.has(rule.key)
```
Effort: Small-Medium. Risk: Low.

## Acceptance Criteria
- [ ] `schemaFields` wrapped in `useMemo([schema])`
- [ ] `allKeys` wrapped in `useMemo([calculationRules])`
- [ ] `RuleRow` wrapped in `React.memo`
- [ ] Duplicate key detection is O(n) total (not O(n²))
- [ ] Editing one rule's expression does not cause sibling RuleRows to re-render (verify with React DevTools Profiler)

## Work Log
- 2026-04-08: Identified by performance-oracle, kieran-typescript-reviewer
