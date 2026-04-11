---
status: complete
priority: p2
issue_id: "207"
tags: [code-review, security, backend, scalardb, toctou, data-binding-phase2]
dependencies: []
---

# ScalarDB `TableMetadata` が null の場合のガード不在 — TOCTOU レースで NullPointerException

## Problem Statement

`V2BindingResolveController` は `DistributedTransactionAdmin.getTableMetadata(namespace, tableName)` を呼ぶ。
テンプレート保存後にテーブルが削除された場合、このメソッドは `null` を返す（例外でない）。
計画にこの null チェックが明記されておらず、実装者が見落とす可能性が高い。

`null` のまま partition key 構築を進めると `NullPointerException` が発生し、HTTP 500 が返る。

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbCatalogController.java`
— `admin.getTableMetadata()` の null 扱いパターンを参照

```java
// 問題のあるコード（計画のまま実装した場合）
TableMetadata meta = admin.getTableMetadata(namespace, table);
Key pk = buildKey(keyValues, meta);  // ← meta が null なら NPE
```

**正しいパターン:**
```java
TableMetadata meta = admin.getTableMetadata(namespace, table);
if (meta == null) {
    // HTTP 409: スキーマバインド時点でテーブルが存在したが今は削除されている
    errors.put(groupId, "Schema table was removed since this template was saved; please re-bind.");
    AuditLog.op("resolve_bindings", correlationId, userId, "schema_removed", namespace + "." + table);
    continue;
}
```

**Security reviewer の指摘**: TOCTOU (Time-of-check Time-of-use) レースとして文書化。

## Proposed Solution

`V2BindingResolveController` の各グループ処理ループで `TableMetadata` の null チェックを必須とする。
null の場合は HTTP 207 のエラー部分にメッセージを入れて継続（部分成功）。

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `TableMetadata` が `null` の場合、`errors[groupId]` に "Table not found" 相当のメッセージが入る
- [ ] HTTP 500 が発生しない
- [ ] AuditLog に `schema_removed` が記録される
- [ ] 統合テストでテーブル削除後のリクエストをカバー

## Work Log

- 2026-04-12: Discovered by Security reviewer (TOCTOU null TableMetadata)
