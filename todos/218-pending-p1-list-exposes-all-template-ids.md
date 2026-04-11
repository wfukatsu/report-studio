---
status: pending
priority: p1
issue_id: "218"
tags: [code-review, security, backend, authorization]
dependencies: ["215"]
---

# `list()` が全ユーザーのテンプレート ID を返す — per-resource 所有権チェックを無効化

## Problem Statement

`GET /api/v2/templates` は `definitionsRepo.list()` で全テンプレートを返す。
所有権チェックを `get()`/`put()`/`delete()` に追加しても、`list()` が全テンプレート ID を列挙するため、
認証済みユーザーが他ユーザーの ID を収集して試行することで anti-enumeration が無意味になる。

## Findings

**File:** `server/src/main/java/com/report/server/V2TemplateController.java:45-71`

```java
public void list(Context ctx) throws Exception {
    List<String> blobs = definitionsRepo.list();  // ← 全テンプレートを返す
    for (String blob : blobs) {
        // created_by の確認なし
        items.add(item);
    }
}
```

**実際の攻撃フロー**:
1. ユーザー Bob が `GET /api/v2/templates` を呼ぶ → 全テンプレート ID のリストを取得
2. 各 ID に `GET /api/v2/templates/{id}` を試行
3. `created_by` のないレガシーテンプレートは完全に読み取れる

## Proposed Solutions

### Option A: `list()` に呼び出し元フィルターを追加（推奨）

```java
public void list(Context ctx) throws Exception {
    Principal principal = ctx.attribute("principal");
    List<String> blobs = definitionsRepo.list();
    ArrayNode items = MAPPER.createArrayNode();
    for (String blob : blobs) {
        try {
            JsonNode envelope = MAPPER.readTree(blob);
            String id = envelope.path("id").asText(null);
            if (id == null || id.isBlank()) continue;
            // 所有権フィルター
            String owner = envelope.path("created_by").asText("");
            if (principal != null && !principal.isAnonymous()
                    && !owner.isEmpty()
                    && !owner.equals(principal.userId())) {
                continue;  // 他ユーザーのテンプレートを除外
            }
            // ... build item ...
        } catch (Exception ignored) { }
    }
    // ...
}
```

**Pros:** ID 列挙攻撃を防止、単純な変更
**Cons:** レガシーテンプレート（`created_by` 空）は全員に見える（後方互換のため許容）
**Effort:** Small | **Risk:** Low

### Option B: リポジトリレベルでユーザーフィルターを追加

`JsonBlobRepository.list(userId)` を追加してストレージレイヤーでフィルター。

**Pros:** パフォーマンス向上（大量テンプレート時）
**Cons:** リポジトリ変更が必要
**Effort:** Medium | **Risk:** Medium

## Recommended Action

**Option A** をマルチユーザー本番デプロイ前に実施。単一ユーザーのローカル環境では緊急度低め。

## Technical Details

**Affected file:** `server/src/main/java/com/report/server/V2TemplateController.java:45-71`

## Acceptance Criteria

- [ ] `GET /api/v2/templates` が呼び出し元ユーザーのテンプレートのみ返す
- [ ] `created_by` が空のレガシーテンプレートは全員に見える（後方互換）
- [ ] 統合テスト: ユーザー A のテンプレートがユーザー B の list に含まれない

## Work Log

- 2026-04-12: Discovered by Security reviewer (P2 elevated to P1 for multi-user environments)
