---
status: complete
priority: p2
issue_id: "098"
tags: [code-review, react, bug, datasource-panel]
dependencies: []
---

# 098 — DataSourcePanel formRows uses array index as key — input state misattributed after delete

## Problem Statement

Form rows in DataSourcePanel use `key={i}` (array index). When a row is deleted from the middle, React reuses existing DOM inputs and misattributes their values. For example, if row 0 = "customer.name" and row 1 = "order.id", deleting row 0 causes the remaining row to briefly show the wrong value in the DOM until React reconciles.

## Findings

**File:** `src/components/sidebar/DataSourcePanel.tsx:120`
```tsx
{formRows.map((row, i) => (
  <div key={i} ...>
```

## Proposed Solutions

### Option A: Add stable ID to each FieldRow
```tsx
type FieldRow = { id: string; key: string; value: string }

// When creating rows:
setFormRows(rows => [...rows, { id: crypto.randomUUID(), key: '', value: '' }])

// In map:
{formRows.map((row) => (
  <div key={row.id} ...>
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] Each form row has a stable unique ID as key
- [ ] Deleting a row does not cause other rows' inputs to flicker
- [ ] Row addition and deletion work correctly

## Work Log
- 2026-04-06: Filed from third-round UX review
