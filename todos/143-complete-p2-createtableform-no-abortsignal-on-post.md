---
status: complete
priority: p2
issue_id: "143"
tags: [code-review, correctness, react, async, scalardb]
dependencies: []
---

# CreateTableForm has no AbortSignal — in-flight POST continues after unmount

## Problem Statement

`CreateTableForm.tsx` calls `createScalarDbTable(request)` without passing an `AbortSignal`. If the user cancels the form or the parent modal closes while the POST is in-flight, the request completes and calls `bindGroupToTableWithColumns` on a component that may have already unmounted. This produces a React state-update-on-unmounted-component warning and potentially incorrect store state.

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx:171`

```ts
const result = await createScalarDbTable({
  namespace: effectiveNamespace,
  tableName,
  columns: columns.map((c) => ({ name: c.name, type: c.type })),
  partitionKeys,
  clusteringKeys,
  secondaryIndexes,
})
// no signal — request completes even after unmount
```

Compare with `DbConnectionTab.tsx` which correctly uses `AbortController` tied to `useEffect` cleanup for the catalog fetch.

Confirmed by: Architecture (HIGH-3).

## Proposed Solutions

### Option A: useRef + AbortController on submit/cancel (Recommended)

```ts
const abortRef = useRef<AbortController | null>(null)

// in handleSubmit, before the await:
abortRef.current?.abort()
const controller = new AbortController()
abortRef.current = controller

const result = await createScalarDbTable({ ... }, controller.signal)

// in onCancel handler:
abortRef.current?.abort()
onCancel()

// in useEffect cleanup:
useEffect(() => () => { abortRef.current?.abort() }, [])
```

**Pros:** Cancels the in-flight request on unmount. Consistent with catalog fetch pattern.
**Effort:** Small | **Risk:** Low

### Option B: Ignore and accept the risk

The warning is cosmetic in React 18 (state updates on unmounted components are no-ops). Table creation is a side effect that has already fired — abort doesn't undo the DDL.

**Effort:** None | **Risk:** Low (warning only, no data corruption)

## Recommended Action

Option A. The DDL cannot be undone, but the client-side state update (binding the group) should not happen if the user explicitly cancelled. The `AbortController` ensures the `.then(result => ...)` path does not execute after cancel/unmount.

## Technical Details

- **File:** `src/components/modals/dbConnection/CreateTableForm.tsx:171`
- **Pattern to follow:** `src/components/modals/DbConnectionTab.tsx:56–78` (AbortController in useEffect cleanup)

## Acceptance Criteria

- [ ] `AbortController` created on each submit attempt
- [ ] Signal passed to `createScalarDbTable(request, controller.signal)`
- [ ] Abort called in cleanup `useEffect` and in `onCancel`
- [ ] Test: cancel button clicked during in-flight POST → `bindGroupToTableWithColumns` NOT called

## Work Log

- 2026-04-11: Flagged by Architecture (HIGH-3).
