---
status: pending
priority: p2
issue_id: "228"
tags: [code-review, security, backend, authorization]
dependencies: []
---

# `GET /api/v2/templates/{id}/export` に所有権チェックなし — UUID 推測で他ユーザーのテンプレートを取得可能

## Problem Statement

`V2TemplateExportController.export()` は `isOwner()` を呼ばない。
認証済みの任意のユーザーが UUID を知っている（または推測した）テンプレートの
完全な ReportDefinition JSON をダウンロードできる。

`GET /api/v2/templates/{id}` には所有権チェックが追加されたが、
同じデータを返す export エンドポイントが未修正のまま — ポリシーの不整合。

## Findings

`server/.../V2TemplateExportController.java:61-105` (推定) — `isOwner()` 呼び出しなし

```
GET /api/v2/templates/{id}        → isOwner() チェック ✓
PUT /api/v2/templates/{id}        → isOwner() チェック ✓  
DELETE /api/v2/templates/{id}     → isOwner() チェック ✓
GET /api/v2/templates/{id}/export → isOwner() チェック ✗ ← 抜け漏れ
```

**UUID v4 は 122 bit のエントロピーを持つため総当たりは非現実的**だが、
ID が何らかの経路でリークした場合（URL 履歴、ログ等）に第三者がアクセス可能。

## Proposed Solution

```java
public void export(Context ctx) throws Exception {
    String id = RequestValidator.validateId(ctx);
    if (id == null) return;

    var stored = definitionsRepo.get(id);
    if (stored.isEmpty()) {
        ctx.status(HttpStatus.NOT_FOUND)...;
        return;
    }
    // 他エンドポイントと同じ ownership check を追加
    if (!V2TemplateController.isOwner(ctx, stored.get())) {
        ctx.status(HttpStatus.NOT_FOUND)...;
        return;
    }
    // ... 残りの export ロジック
}
```

`isOwner()` を `private static` から `package-private static` に変更して
`V2TemplateExportController` からアクセスできるようにするか、
`TemplateOwnershipChecker` などの共通ユーティリティクラスに抽出する。

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `GET /api/v2/templates/{id}/export` が他ユーザーのテンプレートに 404 を返す
- [ ] 自分のテンプレートへの export は従来通り動作する
- [ ] 統合テスト追加

## Work Log

- 2026-04-12: Discovered by Security reviewer during PR #34 review (outside PR scope but found during review)
