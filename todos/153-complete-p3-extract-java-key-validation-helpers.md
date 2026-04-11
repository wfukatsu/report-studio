---
status: complete
priority: p3
issue_id: "153"
tags: [code-review, simplicity, backend, java, scalardb]
dependencies: ["141"]
---

# Extract validateKeysExist + validateNoDuplicates helpers in V2ScalarDbTableController

## Problem Statement

`V2ScalarDbTableController.createTable()` contains three structurally identical validation loops for `partitionKeys`, `clusteringKeys`, and `secondaryIndexes` — both for duplicate detection and for column-existence checking. Extracting two private helper methods reduces the method by ~20 lines and makes the validation intent explicit.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:203–234`

Three copies each of:
- `hasDuplicates(list)` + `findFirstDuplicate(list)` → error/return
- `for (String k : list) { if (!columnNameSet.contains(k)) ... }` → error/return

Confirmed by: Simplicity (#6, #7).

## Proposed Solutions

```java
private static boolean rejectDuplicates(List<String> keys, String field, Context ctx) {
    if (hasDuplicates(keys)) {
        ctx.status(400).json(Map.of("error", "Duplicate key column: '" + findFirstDuplicate(keys) + "'"));
        return true;
    }
    return false;
}

private static boolean rejectUnknownKeys(List<String> keys, Set<String> columns, Context ctx) {
    for (String k : keys) {
        if (!columns.contains(k)) {
            ctx.status(400).json(Map.of("error", "Key column '" + k + "' not found in columns list"));
            return true;
        }
    }
    return false;
}
```

Usage:
```java
if (rejectDuplicates(partitionKeys, "partitionKeys", ctx)) return;
if (rejectDuplicates(clusteringKeys, "clusteringKeys", ctx)) return;
if (rejectDuplicates(secondaryIndexes, "secondaryIndexes", ctx)) return;
if (rejectUnknownKeys(partitionKeys, columnNameSet, ctx)) return;
if (rejectUnknownKeys(clusteringKeys, columnNameSet, ctx)) return;
if (rejectUnknownKeys(secondaryIndexes, columnNameSet, ctx)) return;
```

## Acceptance Criteria

- [ ] `rejectDuplicates` private helper extracted
- [ ] `rejectUnknownKeys` private helper extracted
- [ ] All 17 existing controller tests still pass
- [ ] `createTable()` method reduced by ~20 lines

## Work Log

- 2026-04-11: Flagged by Simplicity reviewer (#6, #7). Pure refactor, no behavior change.
