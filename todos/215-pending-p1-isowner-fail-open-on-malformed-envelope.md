---
status: pending
priority: p1
issue_id: "215"
tags: [code-review, security, backend, authorization]
dependencies: []
---

# `isOwner()` の malformed envelope 例外で fail-open — 所有権チェックが完全バイパスされる

## Problem Statement

`V2TemplateController.isOwner()` は JSON パースに失敗した場合 `catch (Exception ignored) { return true }` で `true` を返す。
これにより、エンベロープが破損しているテンプレートは認証済みの**全ユーザー**が読み取り・書き込み・削除できる。

セキュリティチェックにおける fail-open は、可用性を安全性より優先する誤った選択。

## Findings

**File:** `server/src/main/java/com/report/server/V2TemplateController.java:287-294`

```java
private static boolean isOwner(Context ctx, String storedEnvelopeJson) {
    // ...
    try {
        JsonNode envelope = MAPPER.readTree(storedEnvelopeJson);
        // ...
    } catch (Exception ignored) {
        return true;  // ← FAIL OPEN: 破損したデータで全アクセス許可
    }
}
```

**攻撃ベクター**: 部分書き込みレースコンディション、バックアップストアの直接操作、import エンドポイントの悪用で破損エンベロープを作成 → 全認証ユーザーがアクセス可能になる。

## Proposed Solutions

### Option A: fail-closed に変更 + ログ出力（推奨）

```java
} catch (Exception e) {
    log.warn("Malformed template envelope, denying ownership check: {}", e.getMessage());
    return false;  // fail closed — データ整合性問題はアクセス拒否で対処
}
```

**Pros:** セキュアなデフォルト、破損データの検出が容易
**Cons:** 破損エンベロープへのアクセスが完全にブロックされる（管理者が手動修復必要）
**Effort:** Trivial (1行変更) | **Risk:** Low

### Option B: 管理者ロールには permit を維持

管理者チェックを追加してから fail-closed — このシステムに管理者ロールは存在しないため現実的でない。

## Recommended Action

**Option A** を即座に実施。1行変更でリスクゼロ。

## Technical Details

**Affected file:** `server/src/main/java/com/report/server/V2TemplateController.java:290-293`

## Acceptance Criteria

- [ ] `catch` ブロックが `return false` を返す（fail-closed）
- [ ] `log.warn` でエンベロープ ID と例外メッセージを記録
- [ ] 統合テスト: 破損した JSON エンベロープで `isOwner` が `false` を返すこと

## Work Log

- 2026-04-12: Discovered by Security reviewer
