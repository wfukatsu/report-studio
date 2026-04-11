---
status: complete
priority: p3
issue_id: "154"
tags: [code-review, simplicity, backend, java, audit]
dependencies: []
---

# RetriableExecutionException path uses raw log.warn instead of AuditLog.op()

## Problem Statement

The `RetriableExecutionException` catch block in `V2ScalarDbTableController` writes a raw `log.warn("AUDIT op=create_table ...")` directly instead of calling `AuditLog.op(...)`. This is inconsistent with the three `AuditLog.op()` calls elsewhere in the same method, and is exactly the kind of drift `AuditLog` was created to prevent.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:279–281`

```java
log.warn("AUDIT op=create_table user={} ns={} table={} outcome=unreachable correlationId={} error={}",
    userId, namespace, tableName, correlationId, e.getMessage());
```

Should be:

```java
AuditLog.op("create_table", userId, namespace, tableName, "unreachable", correlationId);
log.warn("ScalarDb unreachable correlationId={}", correlationId, e);
```

Confirmed by: Simplicity (#8).

## Acceptance Criteria

- [ ] `log.warn("AUDIT op=create_table ...")` replaced with `AuditLog.op(...)` call
- [ ] Exception detail still logged via a separate `log.warn(exception)` call (not in the public error body)

## Work Log

- 2026-04-11: Flagged by Simplicity (#8). 2-line change.
