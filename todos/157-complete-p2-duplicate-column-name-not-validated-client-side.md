---
status: complete
priority: p2
issue_id: "157"
tags: [code-review, ux, validation, react, scalardb]
dependencies: []
---

# CreateTableForm: no client-side duplicate column name check

## Problem Statement

`handleSubmit` validates each column's identifier format but does not check for duplicate column names. If two column-name inputs are edited to the same value, the form sends the duplicates to the server, which returns 400. The UI shows "リクエストが不正です。入力内容を確認してください。" — a generic message with no indication of which column is duplicated. Since the form pre-populates column names from field keys (which are unique) but allows free editing, user error is a realistic path.

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx` — `handleSubmit` (between identifier validation and `setIsSubmitting(true)`)

No duplicate check exists. The server enforces it at `V2ScalarDbTableController.java:149–152`.

Confirmed by: Kieran-TS (second pass LOW), Architecture (second pass MEDIUM).

## Proposed Solutions

### Option A: Add inline duplicate check before submit (Recommended)

```ts
// After the per-column validateScalarDbIdentifier loop, before setIsSubmitting:
const columnNames = columns.map((c) => c.name)
if (new Set(columnNames).size !== columnNames.length) {
  setErrorMessage('カラム名が重複しています。各カラム名を一意にしてください。')
  return
}
```

**Pros:** Fast fail with clear message. Zero server round-trip needed.
**Effort:** Tiny | **Risk:** None

### Option B: Inline per-row duplicate highlight

Highlight the duplicate rows in the column grid in real time.

**Pros:** More discoverable.
**Cons:** More complex, not essential for Phase 1.5.
**Effort:** Medium | **Risk:** Low

## Recommended Action

Option A. Single-line Set check, immediately before the submit state transitions.

## Acceptance Criteria

- [ ] Duplicate column names detected before POST is sent
- [ ] Error message specifically says columns are duplicated (not generic "request error")
- [ ] Test case: form with two identical column names → submit disabled or error shown before POST fires

## Work Log

- 2026-04-11: Identified by Kieran-TS and Architecture in second review pass.
