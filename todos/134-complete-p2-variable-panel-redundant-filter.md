---
status: complete
priority: p2
issue_id: "134"
tags: [code-review, typescript, calculationtab, simplicity]
dependencies: []
---

## Problem Statement

`VariablePanel` receives `otherRuleKeys` (already filtered to exclude the current rule's key by `RuleRow`) but then re-applies the same `.filter((k) => k !== currentKey)` inside. This is dead logic — always a no-op — but creates a false impression of safety and will silently break if the prop contract ever changes.

## Findings

- `src/components/modals/CalculationTab.tsx` line 219: `{otherRuleKeys.filter((k) => k !== currentKey).map(...)}`
- `RuleRow` at line 273: `const otherRuleKeys = allKeys.filter((k) => k !== rule.key)` — already excludes current key
- `currentKey` prop equals `rule.key` — the filter is always identity
- Double allocation on every render of every VariablePanel

## Proposed Solutions

**A) Remove the inner filter from VariablePanel** (Recommended)
```tsx
// Before
{otherRuleKeys.filter((k) => k !== currentKey).map((k) => (...))}
// After
{otherRuleKeys.map((k) => (...))}
```
Also remove `currentKey` prop from `VariablePanel` if it has no other use after this change.
Effort: Tiny. Risk: None.

## Acceptance Criteria
- [ ] `.filter((k) => k !== currentKey)` removed from `VariablePanel`
- [ ] `currentKey` prop removed from `VariablePanel` if unused after the change
- [ ] Existing tests still pass

## Work Log
- 2026-04-08: Identified by code-simplicity-reviewer, kieran-typescript-reviewer, performance-oracle
