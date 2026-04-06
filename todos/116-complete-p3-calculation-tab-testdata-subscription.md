---
status: complete
priority: p3
issue_id: "116"
tags: [code-review, performance, react]
dependencies: []
---

## Problem Statement

`CalculationTab.tsx` subscribes to `testData` from the Zustand store as a reactive value (`const testData = useReportStore((s) => s.definition.dataSource)`). This causes `CalculationTab` to re-render every time the data source changes, even though `testData` is only needed when the user clicks the "テスト" button. Reading reactive state for one-time imperative actions is wasteful.

## Findings

**File:** `src/components/modals/CalculationTab.tsx`

```typescript
const testData = useReportStore((s) => s.definition.dataSource)
```

`testData` is used in exactly one place — inside the async `handleTest` callback of `RuleRow`:

```typescript
const handleTest = async () => {
  const result = await evaluateExpression(rule.expression, testData ?? {})
  setTestResult(String(result))
}
```

Because `testData` is a reactive subscription, any change to `dataSource` while the modal is open (e.g., user edits data source in another tab) triggers a re-render of `CalculationTab` and all its children.

**Correct pattern:** Read imperative-only state via `useReportStore.getState()` at the time the action fires, not as a reactive subscription.

## Proposed Solutions

**A) Use `getState()` inside the handler (Recommended, Trivial)**

```typescript
// Remove the reactive subscription:
// const testData = useReportStore((s) => s.definition.dataSource)  // DELETE

// Read imperatively at click time:
const handleTest = async () => {
  const testData = useReportStore.getState().definition.dataSource
  const result = await evaluateExpression(rule.expression, testData ?? {})
  setTestResult(String(result))
}
```

No subscription needed. No re-renders from data source changes. `getState()` is synchronous and always returns the current value.

**B) Keep the subscription but add `useShallow`**

Not applicable here — `dataSource` is an object, and `useShallow` only prevents re-renders when the reference is the same. Since `dataSource` is replaced on update, re-renders still occur.

## Recommended Action

Option A — one-line change, eliminates unnecessary subscription.

## Technical Details

- **File**: `src/components/modals/CalculationTab.tsx`
- `useReportStore.getState()` is the Zustand idiom for imperative reads outside React render cycle
- This pattern is already used elsewhere in the codebase for one-shot reads

## Acceptance Criteria

- [ ] `CalculationTab` no longer subscribes to `definition.dataSource`
- [ ] "テスト" button still evaluates the expression against current data source
- [ ] Changing data source while modal is open does not re-render `CalculationTab`

## Work Log

- 2026-04-06: Identified by Performance reviewer and TypeScript reviewer
