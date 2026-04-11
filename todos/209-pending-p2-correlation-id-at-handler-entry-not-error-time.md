---
status: pending
priority: p2
issue_id: "209"
tags: [code-review, security, observability, backend, data-binding-phase2]
dependencies: []
---

# Correlation ID がエラー時のみ生成される — 成功リクエストのトレーサビリティがない

## Problem Statement

現在の `V2ScalarDbCatalogController` 等は `CorrelationId.generate()` をエラーパスのみで呼び出す。
成功した `resolve-bindings` リクエストは監査ログに追跡IDがなく、
インシデント後に「誰がいつ何のデータを取得したか」を確認できない。

`resolve-bindings` は実 DB データへのアクセスであり、他エンドポイントより監査の必要性が高い。

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:250`

```java
// ← エラー時のみ生成。成功時はログなし
catch (Exception e) {
    String corrId = CorrelationId.generate();
    log.error("Table creation failed corrId={}", corrId, e);
}
```

**推奨パターン (V2ScalarDbTableController のコメントより):**
```java
// ハンドラー先頭でCorrelationIdを生成し、成功/失敗両方のログに使用
String correlationId = CorrelationId.generate();
AuditLog.op("resolve_bindings", correlationId, userId, ...);
```

## Proposed Solution

`V2BindingResolveController.resolve()` のハンドラー先頭で `correlationId` を生成し:
1. 全 `log.warn` / `log.error` に含める
2. 成功時の `AuditLog.op("resolve_bindings", ...)` にも含める
3. レスポンスの `"requestId"` フィールドに返す（クライアントがログ参照に使える）

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] ハンドラー先頭で `correlationId = CorrelationId.generate()`
- [ ] 成功・失敗どちらも `AuditLog.op(...)` に correlationId が記録される
- [ ] レスポンスに `"requestId": correlationId` が含まれる
- [ ] エラーログに correlationId が含まれる

## Work Log

- 2026-04-12: Discovered by Security reviewer (forensic traceability gap)
