---
status: complete
priority: p3
issue_id: "223"
tags: [code-review, security, backend, null-safety]
dependencies: ["215"]
---

# `duplicate()` が `principal` の null チェックなしで `principal.userId()` を呼ぶ — 潜在的 NPE

## Problem Statement

`V2TemplateController.duplicate()` は `isOwner()` を通過後（`principal == null` → `return true`）、
`principal.userId()` を直接参照する（line 242）。
本番では認証ミドルウェアが `null` を防ぐが、開発モード or ミドルウェアバイパス時に NPE。

## Findings

**File:** `server/src/main/java/com/report/server/V2TemplateController.java:200,242`

```java
Principal principal = ctx.attribute("principal");  // line 200 — null チェックなし
// ... isOwner(ctx, stored.get()) — principal==null → true で通過
newEnvelope.put("created_by", principal.userId());  // line 242 — NPE の可能性
```

**`create()` の正しいパターン**:
```java
String createdBy = (principal != null) ? principal.userId() : "unknown";
```

## Proposed Solution

```java
String duplicatedBy = (principal != null) ? principal.userId() : "unknown";
newEnvelope.put("created_by", duplicatedBy);
```

**Effort:** Trivial | **Risk:** Low

## Acceptance Criteria

- [ ] `principal` が null の状態で `/api/v2/templates/{id}/duplicate` を呼んでも NPE が発生しない
- [ ] `created_by` に `"unknown"` が設定される（`create()` と同じパターン）

## Work Log

- 2026-04-12: Discovered by Security reviewer (P3)
