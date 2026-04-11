---
status: complete
priority: p3
issue_id: "162"
tags: [code-review, java, safety, scalardb]
dependencies: []
---

# ctx.attribute("principal") cast is unsafe — should use instanceof pattern

## Problem Statement

`ctx.attribute("principal")` returns `Object`. The assignment `Principal principal = ctx.attribute("principal")` will throw `ClassCastException` at runtime if any middleware stores a non-`Principal` value under the key `"principal"`. The null check only guards the absent-attribute case. If auth middleware is swapped, misconfigured, or if a library stores something under the same key, this line causes an unhandled 500 rather than falling through to `"unknown"`.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:220–221`

```java
Principal principal = ctx.attribute("principal");
String userId = (principal != null) ? principal.userId() : "unknown";
```

A safer pattern using Java 16+ pattern matching:

```java
Object attr = ctx.attribute("principal");
String userId = (attr instanceof Principal p) ? p.userId() : "unknown";
```

Confirmed by: Security reviewer second pass LOW.

## Proposed Solutions

Use `instanceof` pattern matching:

```java
Object attr = ctx.attribute("principal");
String userId = (attr instanceof Principal p) ? p.userId() : "unknown";
```

**Effort:** Tiny | **Risk:** None

## Acceptance Criteria

- [ ] `ctx.attribute("principal")` stored in `Object attr` before cast
- [ ] `instanceof Principal p` pattern used for safe extraction
- [ ] No functional change — `userId` still resolves to `principal.userId()` when the principal is a valid `Principal`

## Work Log

- 2026-04-11: Flagged by Security second pass. Defensive hardening, not a current bug.
