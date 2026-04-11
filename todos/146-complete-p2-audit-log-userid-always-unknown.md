---
status: complete
priority: p2
issue_id: "146"
tags: [code-review, security, audit, backend, scalardb]
dependencies: []
---

# V2ScalarDbTableController audit log always records userId="unknown"

## Problem Statement

Every `AuditLog.op(...)` call in `V2ScalarDbTableController` passes `userId = "unknown"` hardcoded. The authenticated principal is available via `ctx.attribute("principal")` — the auth before-filter sets it. The deferred work is authorization policy (what the user is allowed to do), not identity resolution. Audit logs with no user identity are useless for accountability in production.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:238`

```java
String userId = "unknown"; // Authorization deferred to Phase 2
```

The comment incorrectly conflates "resolving the userId" with "enforcing authorization". Identity resolution is safe to do now without any authorization policy changes.

Confirmed by: Security (M-1).

## Proposed Solutions

### Option A: Extract principal userId without enforcing authorization (Recommended)

```java
// Near the top of createTable(), after parsing the body:
var principal = (com.report.server.auth.Principal) ctx.attribute("principal");
String userId = (principal != null) ? principal.userId() : "unknown";
```

This does not change who is allowed to call the endpoint — any authenticated user still proceeds. It only improves the audit log.

**Pros:** Makes audit log meaningful. Zero risk — no policy enforcement added.
**Effort:** Tiny | **Risk:** None

### Option B: Keep as-is, update comment

Update the comment to accurately reflect that principal extraction is being deferred along with authorization.

**Effort:** Tiny | **Risk:** None (deferred accountability)

## Recommended Action

Option A. Extracting the userId is a one-liner that has no behavioral impact and makes the audit trail meaningful.

## Technical Details

- **File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:238`
- **Principal type:** Check `AppWiring.java` or `ApiRoutes.java` for the exact class name

## Acceptance Criteria

- [ ] `ctx.attribute("principal")` read and cast to the auth principal type
- [ ] `userId` set from `principal.userId()` when principal is non-null
- [ ] Fallback to `"unknown"` only when principal is null (unauthenticated request that bypassed the filter)
- [ ] All `AuditLog.op()` calls use the extracted `userId`

## Work Log

- 2026-04-11: Flagged by Security (M-1). Trivial fix, does not touch authorization logic.
