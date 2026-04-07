---
status: complete
priority: p1
issue_id: "130"
tags: [code-review, react, calculationtab, ux]
dependencies: []
---

## Problem Statement

`CalculationTab` uses `rule.key` as the React list key for `RuleRow`. Since `rule.key` is user-editable, every keystroke in the key field causes React to unmount the old `RuleRow` and mount a new one. This destroys local state (`testResult`, `testing`, `VariablePanel.open`) mid-edit, loses the user's test result while they rename a rule, and causes the textarea to lose focus.

## Findings

- `src/components/modals/CalculationTab.tsx` line 493: `<RuleRow key={rule.key} ...`
- `RuleRow` holds `testResult: string | null` and `testing: boolean` in local state — both reset on remount
- `VariablePanel` holds `open: boolean` — also reset on remount
- `textareaRef` is destroyed and recreated — pending `requestAnimationFrame` callbacks from `handleInsertToken` land on a detached DOM node
- `ValidationRule` (the sibling type) has a stable `id` field separate from its user-editable fields — this PR does not follow that convention

## Proposed Solutions

**A) Add `id: string` to `CalculationRule` — use as React key** (Recommended)
```typescript
// src/types/index.ts
export interface CalculationRule {
  id: string        // stable UUID, generated once, never displayed
  key: string       // user-editable binding token
  // ...
}
// src/store/rulesSlice.ts — addCalculationRule generates both:
const id = crypto.randomUUID()
const key = `calc_${id.slice(0, 8)}`
// src/components/modals/CalculationTab.tsx line 493:
<RuleRow key={rule.id} ...
```
Aligns with `ValidationRule` and `SchemaField` conventions. Also fixes `updateCalculationRule` routing (currently routes by key, which breaks on rename).
Effort: Medium. Risk: Low (additive field, no breaking changes if store migration handles missing `id`).

**B) Use array index as key** — simpler but breaks on reorder, not recommended.

## Acceptance Criteria
- [ ] `CalculationRule` has a stable `id: string` field in `src/types/index.ts`
- [ ] `addCalculationRule` generates `id` via `crypto.randomUUID()`
- [ ] `CalculationTab` uses `rule.id` as the React list key
- [ ] `updateCalculationRule` and `removeCalculationRule` in `rulesSlice` route by `id` (or keep `key` routing with a note)
- [ ] Renaming a rule's key does not reset `testResult` local state
- [ ] `CalculationRuleSchema` updated to include `id` field
- [ ] Tests updated accordingly

## Work Log
- 2026-04-08: Identified by kieran-typescript-reviewer, performance-oracle, architecture-strategist
