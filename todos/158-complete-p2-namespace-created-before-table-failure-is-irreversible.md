---
status: complete
priority: p2
issue_id: "158"
tags: [code-review, backend, scalardb, java, correctness]
dependencies: []
---

# Namespace is auto-created before table DDL — failure leaves dangling namespace

## Problem Statement

`V2ScalarDbTableController.createTable()` auto-creates the namespace if absent, then calls `admin.createTable()`. If `createTable` throws (DDL rejection, auth failure, etc.), the namespace has already been created on disk but the request returns 5xx. The user receives an error, retries or gives up, and is left with an empty namespace they cannot see in the catalog (empty namespaces are invisible to `getNamespaceNames()`) and cannot remove from the designer UI.

This is not data corruption, but it is silent schema pollution that accumulates on failed retries.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:232–235`

```java
if (!admin.namespaceExists(namespace)) {
    admin.createNamespace(namespace);
}
admin.createTable(namespace, tableName, metadata);
```

Confirmed by: Kieran-TS (second pass MEDIUM).

## Proposed Solutions

### Option A: Document the behavior in Javadoc (Recommended for Phase 1.5)

Add a Javadoc note explaining that namespace creation may be a one-way side effect and that operator cleanup via the ScalarDB CLI is needed for failed-creation cases. Accept this as a Phase 1.5 limitation.

**Pros:** Zero risk. Honest.
**Effort:** Tiny | **Risk:** None

### Option B: Attempt namespace cleanup on createTable failure

In the `ExecutionException` catch block, if a namespace was auto-created and the table creation failed, call `admin.dropNamespace(namespace)` to clean up.

**Pros:** Leaves no dangling state.
**Cons:** `dropNamespace` can fail; adds another error path; may race with legitimate concurrent creates.
**Effort:** Small | **Risk:** Medium (introduces new failure modes)

### Option C: Only auto-create namespace on successful DDL round-trip

Refactor: skip namespace auto-creation. Return 400 "Namespace does not exist" and let the UI offer a "create namespace first" flow.

**Pros:** No side effects. Clean error semantics.
**Cons:** More UI work. Different from current design.
**Effort:** Medium | **Risk:** Low

## Recommended Action

Option A for Phase 1.5. Document the limitation clearly in the Javadoc and the Phase 2 inheritance checklist. Option B/C can be addressed in Phase 2 when the full DDL workflow is hardened.

## Technical Details

- **File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:232–235`
- Add to Javadoc: "NOTE: Namespace creation is not transactional with table creation. A namespace created by this endpoint may persist even if the subsequent `createTable` fails. Operators can clean up using the ScalarDB CLI."

## Acceptance Criteria

- [ ] Javadoc on `createTable` method documents the namespace side-effect behavior
- [ ] OR: Namespace cleanup attempted on failure (Option B implemented)

## Work Log

- 2026-04-11: Flagged by Kieran-TS second pass. Phase 1.5 scope — documenting is the practical fix.
