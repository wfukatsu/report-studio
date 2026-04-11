---
status: complete
priority: p2
issue_id: "186"
tags: [code-review, ui-ux, japanese-ux, create-table-form, scalardb]
dependencies: []
---

# CreateTableForm の日本語 UX 改善（キーロール・placeholder・aria-label）

## Problem Statement

`CreateTableForm` に 3 つの日本語 UX 問題がある:
1. キーロール選択肢が英語のまま（「partition」「clustering」「index」）
2. テーブル名 `placeholder` が英語（`"table_name"`）
3. カラム行の `aria-label` が機械的な英語インデックス記述

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx`

```tsx
// L328-332: キーロール選択肢が英語
<option value="none">-</option>
<option value="partition">partition</option>   // ✗
<option value="clustering">clustering</option> // ✗
<option value="index">index</option>           // ✗

// L281: placeholder が英語
<input placeholder="table_name" />  // ✗

// L307, 313, 323: aria-label が機械的
<input aria-label={`column-name-${idx}`} />    // ✗ 不明確
<select aria-label={`type-${idx}`} />          // ✗ 不明確
<select aria-label={`キーロール-${idx}`} />    // △ 日本語だが不完全
```

Confirmed by: Japanese UX + Accessibility review (2026-04-11).

## Proposed Solution

```tsx
// キーロール選択肢
<option value="none">-（通常列）</option>
<option value="partition">パーティションキー</option>
<option value="clustering">クラスタリングキー</option>
<option value="index">セカンダリインデックス</option>

// テーブル名 placeholder
<input placeholder="例: orders, user_accounts" />

// aria-label（より明確に）
<input aria-label={`${idx + 1}番目のカラム名`} />
<select aria-label={`${idx + 1}番目のカラムのデータ型`} />
<select aria-label={`${idx + 1}番目のカラムのキーロール`} />
```

**Effort:** Small（文字列変更のみ）| **Risk:** None

## Acceptance Criteria

- [ ] キーロール選択肢がすべて日本語に変更されている
- [ ] テーブル名 placeholder が日本語の例示に変更されている
- [ ] カラム行の aria-label が日本語で意味が明確になっている
- [ ] 既存テストが通過する（テスト内の aria-label 参照を更新）

## Work Log

- 2026-04-11: Japanese UX + Accessibility レビューで発見。3点の小さな改善をまとめて対応。
