---
status: complete
priority: p3
issue_id: "137"
tags: [code-review, simplicity, calculationtab]
dependencies: []
---

## Problem Statement

`FormatEditor` has three one-line handler functions (`handleTypeChange`, `handleDecimalPlacesChange`, `handleCustomPatternChange`) that all share the identical spread pattern `{ ...(format ?? { type: defaultType }), <field>: <value> }`. This repetition is unnecessary and slightly obscures the intent.

## Findings

- `src/components/modals/CalculationTab.tsx` lines 83-94: three handlers with identical spread base
- Each function only differs in which field it sets
- A single `patch(fields: Partial<CalculationFormat>)` helper eliminates the repetition

## Proposed Solutions

**A) Collapse into a single `patch` helper** (Recommended)
```typescript
function patch(fields: Partial<CalculationFormat>) {
  onUpdate({ ...(format ?? { type: defaultType }), ...fields })
}
// onChange handlers become inline lambdas on the JSX elements
```
Removes ~8 lines. Makes the spread pattern visible once.
Effort: Tiny. Risk: None.

## Acceptance Criteria
- [ ] Three named handler functions replaced by one `patch` helper
- [ ] All existing tests still pass

## Work Log
- 2026-04-08: Identified by code-simplicity-reviewer
