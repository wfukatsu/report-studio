---
status: complete
priority: p3
issue_id: "161"
tags: [code-review, simplicity, backend, java, scalardb]
dependencies: []
---

# rejectInvalidIdentifiers on key lists is redundant — rejectUnknownKeys already guarantees validity

## Problem Statement

`createTable()` validates column names with the `IDENTIFIER` regex inline (lines 138–160). Then for each key list, it calls `rejectInvalidIdentifiers` before `rejectUnknownKeys`. But `rejectUnknownKeys` confirms that every key string exists in `columnNameSet` — and every entry in `columnNameSet` was already validated as a valid identifier. Therefore, any key that passes `rejectUnknownKeys` is guaranteed to have already passed the identifier check. The `rejectInvalidIdentifiers` call for key lists adds a validation layer that can never catch an input the later check wouldn't also catch.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:198–200`

```java
if (rejectInvalidIdentifiers(partitionKeys, ctx)) return;
if (rejectInvalidIdentifiers(clusteringKeys, ctx)) return;
if (rejectInvalidIdentifiers(secondaryIndexes, ctx)) return;
```

These three calls are reachable only with malformed key names that don't exist in the column set — which `rejectUnknownKeys` would already reject with a more descriptive error.

Confirmed by: Simplicity reviewer (second pass NEW).

## Proposed Solutions

Remove the `rejectInvalidIdentifiers` calls for key lists. Reorder validation to:
1. `partitionKeys.isEmpty()` check
2. `rejectDuplicateKeys` for each list
3. `rejectUnknownKeys` for each list

**Effort:** Tiny | **Risk:** Low — the behavior change is that `partitionKeys: ["9invalid"]` now returns "Key column '9invalid' not found in columns list" instead of "Invalid identifier: '9invalid'". The user still gets a clear error; the message is slightly different.

Alternatively, keep `rejectInvalidIdentifiers` for explicit messaging but document why it's kept.

## Acceptance Criteria

- [ ] Three `rejectInvalidIdentifiers` calls for key lists removed (or explicitly kept with comment)
- [ ] All existing test cases for key list validation still pass
- [ ] Error messages remain clear for malformed key-list inputs

## Work Log

- 2026-04-11: Flagged by Simplicity second pass. Minor code-economy fix.
