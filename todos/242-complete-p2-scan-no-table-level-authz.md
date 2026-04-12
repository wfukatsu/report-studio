---
status: pending
priority: p2
issue_id: "242"
tags: [code-review, security, data-browser, backend]
dependencies: [236]
---

# ScalarDB スキャンにテーブルレベルの認可がない（任意のテーブルを閲覧可能）

## Problem Statement

認証済みユーザーなら誰でも `GET /api/v2/scalardb/tables/{ns}/{table}/rows` で任意のScalarDBテーブルを閲覧できる。マルチテナント環境や内部テーブルが存在する場合、意図しないデータアクセスが可能になる。カタログAPI `GET /api/v2/scalardb/catalog` も同様に全テーブルを列挙する。

## Findings

```java
// V2ScalarDbScanController.java:65-76
Principal principal = ctx.attribute("principal");
if (principal == null || principal.isAnonymous()) {
    ctx.status(HttpStatus.UNAUTHORIZED);
    return;
}
// ← ここで終わり。ロールチェックなし、テーブル許可リストなし
String namespace = ctx.pathParam("ns");
String tableName = ctx.pathParam("table");
```

- 認証（非匿名）は検証するが、認可（どのテーブルに触れるか）は検証しない
- `isValidIdentifier()` はインジェクション防止のみ（認可ではない）
- コントローラーのJavadocに "data isolation is at the application layer, not per-user row filtering" と明記されているが、アプリ層での制御実装は現時点でゼロ

## Proposed Solutions

### Option A: 管理者ロールを要求（短期対応）

```java
// Principal に isAdmin() メソッドがあるか確認し、あれば:
if (!principal.isAdmin()) {
    ctx.status(HttpStatus.FORBIDDEN);
    ctx.json(Map.of("error", "Admin role required"));
    return;
}
```

- Pros: 実装即時、既存のロール機構を使用
- Cons: 管理者以外のユーザーが使えなくなる
- Effort: Small
- Risk: Low（ブレインストームで「認証済み全員」と決定したが、環境次第でリスク）

### Option B: 許可ネームスペースの設定ファイル（中期）

`scalardb.properties` または環境変数で閲覧可能ネームスペースを列挙し、それ以外は403。

- Pros: 柔軟、マルチテナント対応
- Cons: 設定管理が必要
- Effort: Medium
- Risk: Low

### Option C: 現状維持 + 追加のレートリミット（最小）

単一テナント・内部使用ツールであれば認証済み全員アクセスを維持し、236番のレートリミットのみで対処。

## Acceptance Criteria

- [ ] どのアプローチで対応するかを決定してコメントまたは実装
- [ ] セキュリティ要件がJavadocに明記される

## Work Log

- 2026-04-12: code-review (PR #45) にて security-sentinel が発見
