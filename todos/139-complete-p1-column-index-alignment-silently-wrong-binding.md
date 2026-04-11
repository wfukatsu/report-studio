---
status: complete
priority: p1
issue_id: "139"
tags: [code-review, correctness, scalardb, phase1-5]
dependencies: []
---

# Column index alignment produces silently wrong field→column bindings

## Problem Statement

`CreateTableForm.tsx` uses positional index alignment between local `columns[]` state and `result.columns` from the server response to assign `dbColumnName` per field. ScalarDB does not guarantee that `getColumnNames()` returns columns in insertion order, so a mismatch produces wrong bindings with no error — field A gets field B's column name and vice versa.

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx:184–187`

```ts
result.columns.map((col, idx) => ({
  fieldId: columns[idx]?.fieldId ?? '',
  dbColumnName: col.name,
})).filter((fc) => fc.fieldId !== '')
```

`result.columns` comes from `admin.getTableMetadata()` re-read after creation, whose iteration order is `LinkedHashSet`-backed in ScalarDB 3.14.4 and not contractually guaranteed across versions. If server returns columns in a different order than submitted, every field receives the wrong `dbColumnName`. The `?? ''` + `.filter` pattern masks the mismatch silently.

Confirmed by: Kieran-TS (H1), Architecture (CRITICAL-1), Simplicity (#4).

## Proposed Solutions

### Option A: Match by name (Recommended)
Build a `Map<name, fieldId>` from local state and look up by server-returned column name:

```ts
const localByName = new Map(columns.map((c) => [c.name, c.fieldId]))
result.columns
  .map((col) => ({ fieldId: localByName.get(col.name) ?? '', dbColumnName: col.name }))
  .filter((fc) => fc.fieldId !== '')
```

**Pros:** Correct regardless of server ordering. Handles user-renamed columns. Self-documenting.
**Cons:** None.
**Effort:** Small | **Risk:** Low

### Option B: Sort both arrays by name before aligning
Sort `columns` and `result.columns` by name before zipping.

**Pros:** Simple.
**Cons:** Still fragile if names differ. Option A is cleaner.
**Effort:** Small | **Risk:** Low

## Recommended Action

Implement Option A. One-line `new Map()` + lookup replaces the fragile index access.

## Technical Details

- **File:** `src/components/modals/dbConnection/CreateTableForm.tsx:184–187`
- **Test to update:** `CreateTableForm.test.tsx` happy-path test (currently mocks `result.columns` in same order as submitted — add a test where server returns columns in reversed order and verify `dbColumnName` assignments are still correct)

## Acceptance Criteria

- [ ] `result.columns.map((col, idx) => ...)` index-based mapping removed
- [ ] Lookup is by `col.name` using a `Map` built from local `columns` state
- [ ] Test added: server returns columns in reversed order → bindings still correct

## Work Log

- 2026-04-11: Identified by Kieran-TS (H1), Architecture (CRITICAL-1). Flagged as only hard correctness defect in the PR.
