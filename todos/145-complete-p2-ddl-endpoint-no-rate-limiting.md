---
status: complete
priority: p2
issue_id: "145"
tags: [code-review, security, performance, backend, scalardb]
dependencies: []
---

# POST /api/v2/scalardb/tables has no rate limiting

## Problem Statement

`V2ScalarDbTableController` is wired without a `RateLimiter`. Every other stateful write endpoint has an associated limiter (`v2SubmitLimiter`, `v2ExportLimiter`). A DDL operation is orders of magnitude more expensive than a data write — it acquires schema locks, potentially blocks compaction, and on some ScalarDB backends triggers full metadata replication. Any authenticated user can flood this endpoint.

## Findings

**File:** `server/src/main/java/com/report/server/AppWiring.java:150–151`

```java
v2ScalarDbCatalogCtrl = new V2ScalarDbCatalogController(factory);
v2ScalarDbTableCtrl = new V2ScalarDbTableController(factory);  // ← no RateLimiter
```

Compare with:

```java
v2ExportLimiter = new RateLimiter(10, 60_000L);
v2ExportCtrl = new V2TemplateExportController(v2DefinitionsRepo, v2ExportLimiter);
```

Confirmed by: Security (H-2).

## Proposed Solutions

### Option A: Add per-IP RateLimiter until auth is wired (Recommended)

```java
// AppWiring.java
v2ScalarDbTableLimiter = new RateLimiter(10, 60_000L); // 10 creates/min per IP
v2ScalarDbTableCtrl = new V2ScalarDbTableController(factory, v2ScalarDbTableLimiter);
```

In `V2ScalarDbTableController.createTable()`:

```java
if (!limiter.tryAcquire(ctx.ip())) {
    ctx.status(429).json(Map.of("error", "Too many table creation requests"));
    return;
}
```

**Pros:** Consistent with existing pattern. Mitigates DDL flood.
**Effort:** Small | **Risk:** Low

### Option B: Defer until Phase 2 authorization

Accept the risk for the Phase 1.5 scope where the tool is used by a known, small set of developers.

**Effort:** None | **Risk:** Medium (DoS via DDL)

## Recommended Action

Option A for any production deployment. For dev-only Phase 1.5, documenting the gap (Option B) is acceptable with a TODO comment.

## Technical Details

- **Files:** `AppWiring.java:150`, `V2ScalarDbTableController.java` constructor
- **Existing pattern:** `RateLimiter` usage in `V2TemplateExportController`, `V2FormResponseController`

## Acceptance Criteria

- [ ] `RateLimiter` instance created in `AppWiring` for the DDL endpoint
- [ ] `V2ScalarDbTableController` accepts and applies the limiter at the start of `createTable`
- [ ] 429 response returned when rate limit exceeded
- [ ] Backend test for rate limit enforcement

## Work Log

- 2026-04-11: Flagged by Security (H-2). Phase 1.5 scope is dev-tool but this should be wired before any broader access.
