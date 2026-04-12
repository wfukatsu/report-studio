---
status: pending
priority: p1
issue_id: "236"
tags: [code-review, security, performance, data-browser]
dependencies: []
---

# No Rate Limiter on ScalarDB Scan Endpoint

## Problem Statement

`V2ScalarDbScanController` の `scanRows()` エンドポイントにレートリミットが存在しない。フルテーブルスキャン（最大10,001行/リクエスト）を何度でも連続呼び出しできるため、DoS攻撃や偶発的な過負荷の原因となる。他の高負荷エンドポイント（`v2SubmitLimiter`, `v2ExportLimiter`, PDF生成）はすべてRateLimiterを持つが、このエンドポイントだけ欠落している。

## Findings

- `AppWiring.java:178` — `v2ScalarDbScanCtrl = new V2ScalarDbScanController(factory);` — RateLimiterなし
- 比較: `V2BindingResolveController` は `new RateLimiter(3, 10_000L)` を使用
- 認証済みユーザーが `/api/v2/scalardb/tables/{ns}/{table}/rows` をタイトループで呼ぶと、各リクエストがJVMヒープに10,001行をロードするため、複数同時実行でOOMリスク
- CSRF保護なし（GETメソッドのため設計通りだが、レートリミットが唯一の防御線）

## Proposed Solutions

### Option A: `AppWiring` でRateLimiterを注入（推奨）

```java
// AppWiring.java
RateLimiter scanLimiter = new RateLimiter(20, 60_000L); // 20 req/min per user
v2ScalarDbScanCtrl = new V2ScalarDbScanController(factory, scanLimiter);
```

```java
// V2ScalarDbScanController.java
private final RateLimiter rateLimiter;

public V2ScalarDbScanController(TransactionFactory factory) {
    this(factory, new RateLimiter(20, 60_000L));
}

V2ScalarDbScanController(TransactionFactory factory, RateLimiter rateLimiter) {
    this.factory = factory;
    this.rateLimiter = rateLimiter;
}

// scanRows() の先頭に追加:
String userId = (principal != null) ? principal.userId() : "anonymous";
if (!rateLimiter.isAllowed(userId)) {
    ctx.status(429);
    ctx.json(Map.of("error", "Too many requests"));
    return;
}
```

- Pros: 既存パターン踏襲、テスト容易、低コスト
- Cons: なし
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] `V2ScalarDbScanController` に `RateLimiter` を注入するコンストラクタを追加
- [ ] `AppWiring.java` で `scanLimiter = new RateLimiter(20, 60_000L)` を作成してコントローラに渡す
- [ ] 429レスポンス: `{"error": "Too many requests"}`
- [ ] バックエンドビルド通過

## Work Log

- 2026-04-12: code-review (PR #45) にて security-sentinel が発見
