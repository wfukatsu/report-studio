---
status: complete
priority: p1
issue_id: "205"
tags: [code-review, security, authorization, backend, existing-gap]
dependencies: []
---

# `GET/PUT /api/v2/templates/{id}` に所有権チェックがない — 任意ユーザーが他ユーザーのテンプレートを読み書き可能

## Problem Statement

`V2TemplateController.java` の `get()` と `put()` メソッドは `created_by` フィールドを認証済みプリンシパルと照合しない。
これにより、認証済みの任意のユーザーが別のユーザーのテンプレートを読み取り・上書きできる。

`duplicate()` メソッドのみ所有権チェックを行っている（lines 202-205）。

Phase 2 の新しい `resolve-bindings` エンドポイントも同じパターンでテンプレートを読み込む設計だが、
このベースの脆弱性を直さない限り、所有権検証は機能しない。

## Findings

**File:** `server/src/main/java/com/report/server/V2TemplateController.java`

```java
// get() -- 所有権チェックなし
public void get(Context ctx) throws Exception {
    String id = RequestValidator.validateId(ctx);
    if (id == null) return;
    Optional<String> json = definitionsRepo.get(id);  // ← created_by 確認なし
    if (json.isEmpty()) { ctx.status(404)...; return; }
    ctx.result(json.get());
}

// put() -- 所有権チェックなし
public void put(Context ctx) throws Exception {
    // ...バリデーション...
    definitionsRepo.upsert(id, ...);  // ← 誰でも上書き可能
}

// duplicate() -- 所有権チェックあり（正しいパターン）
public void duplicate(Context ctx) throws Exception {
    // ...
    if (!owner.isEmpty() && !owner.equals(principal.userId())) {  // ← 正しい
        ctx.status(403)...;
        return;
    }
}
```

**発見者**: Security reviewer

**Phase 2 との関係**: `resolve-bindings` エンドポイントは template を読み込んで namespace/tableName を検証するが、`get()` 自体が所有権を検証しないため、攻撃者が他人のテンプレートの namespace を使ってデータを盗める。

## Proposed Solutions

### Option A: `get()` と `put()` に所有権チェックを追加（推奨）

```java
// get() への追加
public void get(Context ctx) throws Exception {
    String id = RequestValidator.validateId(ctx);
    if (id == null) return;
    
    Optional<String> json = definitionsRepo.get(id);
    if (json.isEmpty()) { ctx.status(404)...; return; }
    
    // 所有権チェック追加
    Principal principal = ctx.attribute("principal");
    if (principal != null) {
        JsonNode envelope = MAPPER.readTree(json.get());
        String owner = envelope.path("created_by").asText("");
        if (!owner.isEmpty() && !owner.equals(principal.userId())) {
            ctx.status(404)...;  // 403 でなく 404（テンプレートID列挙防止）
            return;
        }
    }
    
    ctx.result(json.get());
}
```

**Pros:** 既存 `duplicate()` パターンの踏襲、シンプル
**Cons:** `principal` が null のケース（未認証アクセス）の扱いを決める必要がある
**Effort:** Small
**Risk:** Low

### Option B: 共通 `verifyOwnership(ctx, id)` ヘルパーメソッドを抽出

```java
private boolean verifyOwnership(Context ctx, String json) {
    Principal principal = ctx.attribute("principal");
    if (principal == null) return true;  // 未認証は別のフィルターに任せる
    String owner = MAPPER.readTree(json).path("created_by").asText("");
    if (!owner.isEmpty() && !owner.equals(principal.userId())) {
        ctx.status(404)...;
        return false;
    }
    return true;
}
```

**Pros:** DRY、全メソッドから再利用可能
**Cons:** 既存コードにない抽出パターンの追加
**Effort:** Small
**Risk:** Low

## Recommended Action

**Option B** を採用し、`get()`, `put()`, `resolve-bindings` 全てで `verifyOwnership()` を使う。
Phase 2 の `resolve-bindings` 実装より先にこの修正を行う。

## Technical Details

**Affected files:**
- `server/src/main/java/com/report/server/V2TemplateController.java` — `get()`, `put()` を修正
- `server/src/main/java/com/report/server/V2BindingResolveController.java` — 新規実装時に同パターン適用

**OWASP分類**: A01 — Broken Object Level Authorization

## Acceptance Criteria

- [ ] `GET /api/v2/templates/{id}` が他ユーザーのテンプレートに 404 を返す
- [ ] `PUT /api/v2/templates/{id}` が他ユーザーのテンプレートに 404 を返す
- [ ] `created_by` が空のテンプレートは認証済み任意ユーザーがアクセス可能（レガシー互換）
- [ ] 統合テストが追加されている

## Work Log

- 2026-04-12: Discovered by Security reviewer as existing gap affecting Phase 2 design
