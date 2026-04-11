---
status: complete
priority: p1
issue_id: "140"
tags: [code-review, security, scalardb, information-leakage]
dependencies: []
---

# V2ScalarDbCatalogController leaks raw exception message in 503 response

## Problem Statement

`V2ScalarDbCatalogController.getCatalog()` passes `e.getMessage()` directly into `ServiceUnavailableResponse`, which the global exception handler in `ApiRoutes.java` forwards verbatim to the client as `{"error": "ScalarDb unreachable: <raw message>"}`. JDBC driver exception messages can contain hostnames, port numbers, connection URLs, and credentials. This is a security vulnerability.

`V2ScalarDbTableController` (same PR) handles this correctly — it uses `CorrelationId`, logs server-side, and returns only a generic message. The catalog controller must be brought to parity.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbCatalogController.java:93–97`

```java
} catch (Exception e) {
    log.warn("ScalarDb catalog listing failed", e);
    throw new ServiceUnavailableResponse(
            "ScalarDb unreachable: " + e.getMessage());  // ← leaks driver internals
}
```

The global handler at `ApiRoutes.java:49–53` passes `hre.getMessage()` to the JSON response body. Every authenticated user who sees a 503 from the catalog endpoint receives whatever the JDBC driver puts in its exception message.

Confirmed by: Security (C-1), Architecture (CRITICAL-2).

## Proposed Solutions

### Option A: Follow V2ScalarDbTableController pattern (Recommended)

```java
} catch (Exception e) {
    String correlationId = CorrelationId.generate();
    log.warn("AUDIT op=catalog_fetch outcome=unreachable correlationId={} error={}",
        correlationId, e.getMessage(), e);
    throw new ServiceUnavailableResponse("ScalarDb unreachable");
}
```

**Pros:** Consistent with the write controller. No information leakage. CorrelationId enables log cross-reference.
**Cons:** None.
**Effort:** Small | **Risk:** Low

### Option B: Minimal fix — strip the message

```java
throw new ServiceUnavailableResponse("ScalarDb unreachable");
```

**Pros:** One-character change.
**Cons:** No correlationId for debugging.
**Effort:** Tiny | **Risk:** None

## Recommended Action

Option A. Adds correlationId for debuggability and is consistent with the write controller's established pattern.

## Technical Details

- **File:** `server/src/main/java/com/report/server/V2ScalarDbCatalogController.java:95`
- **Global handler:** `server/src/main/java/com/report/server/ApiRoutes.java:49–53`
- **Pattern to follow:** `V2ScalarDbTableController.java` exception handlers

## Acceptance Criteria

- [ ] `e.getMessage()` removed from the `ServiceUnavailableResponse` constructor argument
- [ ] `CorrelationId.generate()` called and logged server-side before throwing
- [ ] Response body is `{"error": "ScalarDb unreachable"}` with no driver detail
- [ ] Backend test for 503 case in `V2ScalarDbCatalogControllerTest` verifies body does not contain connection details

## Work Log

- 2026-04-11: Flagged by Security (C-1) and Architecture (CRITICAL-2). One-line fix.
