---
status: pending
priority: p2
issue_id: "233"
tags: [ui-ux, schema, content, qa-review]
dependencies: []
---

# スキーマタブのヒント文言が技術的すぎてユーザーフレンドリーでない

## Problem Statement

スキーマタブの空状態に表示される
「スキーマ未定義（フラットキー入力で動作します）」
は初見ユーザーには「フラットキー入力」の意味が不明瞭。
何ができるのか、どうすればよいかが伝わらない。

## Findings

`src/components/sidebar/SchemaPanel.tsx` の空状態表示部分。

## Proposed Solution

```tsx
// 変更前
"スキーマ未定義（フラットキー入力で動作します）"

// 変更後
"スキーマ未設定"

// サブテキスト追加:
"グループとフィールドを追加すると、ScalarDB から実データを取得してプレビューできます。
 今すぐ設定しなくても、{{fieldName}} 形式でサンプルデータを参照できます。"
```

**Effort:** Trivial | **Risk:** Low

## Acceptance Criteria

- [ ] 「フラットキー入力」という技術用語が削除されている
- [ ] 空状態メッセージが「何ができるか」と「どうすればよいか」を説明している
- [ ] `{{fieldName}}` 参照への言及が残っている

## Work Log

- 2026-04-12: QA review でコンテンツ問題を確認
