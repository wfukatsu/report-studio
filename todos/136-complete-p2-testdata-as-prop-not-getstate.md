---
status: complete
priority: p2
issue_id: "136"
tags: [code-review, typescript, testability, calculationtab]
dependencies: []
---

## Problem Statement

`RuleRow.handleTest` calls `useReportStore.getState().testData` directly inside an async event handler. This bypasses the React subscription model and makes `RuleRow` depend on the global store singleton in a way invisible from props — impossible to test in isolation without mocking the store module.

## Findings

- `src/components/modals/CalculationTab.tsx` line 279: `const testData = useReportStore.getState().testData`
- `CalculationTab` already subscribes to the store — `testData` is available at that level
- Tests in `CalculationTab.test.tsx` rely on `useReportStore.getState().newReport()` which leaves `testData` as `{}` — the `getState()` path is never exercised for non-empty testData
- The architecture-strategist notes this diverges from the established pattern: `CalculationTab` already subscribes and passes most store data as props

## Proposed Solutions

**A) Subscribe to `testData` in `CalculationTab`, pass as prop to `RuleRow`** (Recommended)
```typescript
// CalculationTab
const testData = useReportStore((s) => s.testData)
// RuleRow receives testData as prop, no direct store access
```
Effort: Small. Risk: None (purely structural).

**B) Keep `getState()` but add a comment** — preserves current behavior (snapshot at click time) but leaves testability gap.
Effort: Tiny. Risk: Low.

## Acceptance Criteria
- [ ] `RuleRow` does not call `useReportStore.getState()` directly
- [ ] `testData` passed as a prop from `CalculationTab` to `RuleRow`
- [ ] Test can inject non-empty testData and verify the evaluation uses it
- [ ] New test added for evaluation with populated testData

## Work Log
- 2026-04-08: Identified by kieran-typescript-reviewer, architecture-strategist
