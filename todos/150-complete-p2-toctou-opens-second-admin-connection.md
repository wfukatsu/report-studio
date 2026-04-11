---
status: complete
priority: p2
issue_id: "150"
tags: [code-review, backend, correctness, scalardb]
dependencies: []
---

# TOCTOU recovery opens a second DistributedTransactionAdmin inside outer try-with-resources

## Problem Statement

`V2ScalarDbTableController.createTable()` catches `ExecutionException` and opens a second `DistributedTransactionAdmin` via `factory.getTransactionAdmin()` inside the catch block — while the outer `try-with-resources` still holds the first open admin. If the `ExecutionException` was caused by connection saturation or resource exhaustion, opening a second connection to check `tableExists` compounds the problem and may itself throw, causing the catch block to fail and the outer exception to be lost.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:297–305`

```java
} catch (ExecutionException e) {
    // ...
    try (DistributedTransactionAdmin adminCheck = factory.getTransactionAdmin()) {  // ← second connection
        if (adminCheck.tableExists(namespace, tableName)) {
            // ...
        }
    } catch (Exception checkEx) {
        log.warn("TOCTOU re-check failed correlationId={}", correlationId, checkEx);
    }
```

The outer `try-with-resources` at line ~241 still holds `admin` open at this point.

Confirmed by: Architecture (HIGH-2).

## Proposed Solutions

### Option A: Reuse the existing `admin` reference in the TOCTOU check (Recommended)

The outer `admin` is still in scope in the catch block (it's declared in the `try` header). The `ExecutionException` was thrown by `admin.createTable()`, not by the admin object itself. The admin object is still usable for a read operation:

```java
} catch (ExecutionException e) {
    // ... auth checks ...
    // TOCTOU recovery using the already-open admin
    try {
        if (admin.tableExists(namespace, tableName)) {
            AuditLog.op("create_table", userId, namespace, tableName, "conflict", correlationId);
            ctx.status(409).json(Map.of("error", "Table already exists: " + namespace + "." + tableName));
            return;
        }
    } catch (Exception checkEx) {
        log.warn("TOCTOU re-check failed correlationId={}", correlationId, checkEx);
    }
```

**Pros:** No second connection opened. The admin auto-closes via the outer try-with-resources.
**Effort:** Small | **Risk:** Low

### Option B: Accept the second connection risk

Document the behavior. The inner `catch (Exception checkEx)` already handles the failure of the re-check gracefully.

**Effort:** None | **Risk:** Low (only affects resource-exhaustion scenarios)

## Recommended Action

Option A. Reusing `admin` is simpler and avoids the dual-connection issue entirely.

## Technical Details

- **File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:297–305`

## Acceptance Criteria

- [ ] TOCTOU re-check uses the already-open `admin` reference (not a new `factory.getTransactionAdmin()`)
- [ ] Existing TOCTOU test (case 17 in `V2ScalarDbTableControllerTest`) still passes

## Work Log

- 2026-04-11: Flagged by Architecture (HIGH-2). One-line change in the catch block.
