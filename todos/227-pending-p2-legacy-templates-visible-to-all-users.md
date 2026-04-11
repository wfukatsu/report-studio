---
status: pending
priority: p2
issue_id: "227"
tags: [code-review, security, backend, authorization]
dependencies: []
---

# レガシーテンプレート（`created_by` 空）が全認証ユーザーに公開・変更可能 — 未文書化・未テスト

## Problem Statement

`isOwner()` と `list()` の実装で、`created_by` が空のテンプレート（認証導入前のレガシーデータ）は
**全認証ユーザーが読み取り・変更・削除・複製できる**。

この設計判断は `isOwner()` の Javadoc に記載があるが、API レベルの仕様として文書化されておらず、
また仕様通りの動作であることを確認するテストが存在しない。

## Findings

**File:** `server/.../V2TemplateController.java:61, 311`

```java
// list() でのフィルター — owner が空なら全員に見える
if (principal != null && !owner.isEmpty() && !owner.equals(principal.userId())) {
    continue;  // ← owner.isEmpty() = true なら continue されない = 全員に見える
}

// isOwner() — owner が空なら true を返す
if (owner.isEmpty()) return true;  // legacy template — allow all
```

**具体的なリスク**:
- 管理者や移行スクリプトが `created_by` 未設定でテンプレートを作成した場合、
  そのテンプレートは全認証ユーザーにとって "自分のもの" として扱われる
- テンプレートを削除・上書きするユーザーが意図せず他ユーザーのデータを変更できる

## Proposed Solutions

### Option A: レガシーテンプレートをセンチネル所有者 `"system"` に帰属 + マイグレーション（長期）

既存テンプレートに `created_by: "system"` をバックフィルし、
システム所有テンプレートは全員が読み取り可能だが書き込みは不可とする。

**Effort:** Medium | **Risk:** Medium (データ移行が必要)

### Option B: 現状維持 + 意図を明確に文書化（最小コスト）

`list()` メソッドに Javadoc を追加し、`V2TemplateControllerTest` に
「レガシーテンプレートは全ユーザーに見える」テストを追加する。

```java
/**
 * Legacy templates (created before authentication was introduced, {@code created_by} empty)
 * are visible to all authenticated users. This is intentional for backward compatibility.
 * To restrict access, backfill {@code created_by} on existing templates.
 */
public void list(Context ctx) throws Exception {
```

**Effort:** Trivial | **Risk:** Low

## Recommended Action

短期は **Option B**（文書化 + テスト追加）。
本番でマルチユーザー展開する前に Option A を検討する。

## Acceptance Criteria

- [ ] `list()` に Javadoc でレガシーテンプレートの挙動が説明されている
- [ ] テスト: `created_by` が空のテンプレートは全認証ユーザーの `list()` に表示される
- [ ] テスト: `created_by` が空のテンプレートに対して `get()`/`put()`/`delete()` が任意のユーザーで成功する

## Work Log

- 2026-04-12: Discovered by Security reviewer during PR #34 review
