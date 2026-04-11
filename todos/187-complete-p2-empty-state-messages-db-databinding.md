---
status: complete
priority: p2
issue_id: "187"
tags: [code-review, ui-ux, empty-state, japanese-ux, scalardb]
dependencies: []
---

# 空状態メッセージの改善（DbConnectionTab・DataBindingModal）

## Problem Statement

2 箇所の空状態メッセージが技術的すぎるか不足しており、ユーザーが次のアクションを取れない:

1. **DbConnectionTab**: カタログ空状態が「ScalarDB にテーブルを作成してから」と言うが、作成方法を案内していない
2. **DataBindingModal**: データソースが未設定の際の案内文が不足

## Findings

### 1. DbConnectionTab 空状態
**File:** `src/components/modals/DbConnectionTab.tsx:145-149`

```tsx
// 現状
"テーブルを含むネームスペースが見つかりません。ScalarDB にテーブルを作成してから再取得してください。"
// 問題: 「どうやって作成するのか」が不明
```

→ 実は「このスキーマからテーブルを作成」ボタン（Phase 1.5）が同画面にある。メッセージがそのボタンを案内していない。

### 2. DataBindingModal データソース空状態
**File:** `src/components/modals/DataBindingModal.tsx:91-111`

サンプルデータ・プレビューデータ両方が未設定の場合、各サブコンポーネントに委ねられており、モーダル全体としての案内がない。

Confirmed by: Data integration UI review (2026-04-11).

## Proposed Solution

### DbConnectionTab
```tsx
// カタログ空状態を改善
"テーブルが見つかりません。\n以下のいずれかの方法でテーブルを作成してください：\n・下の「このスキーマからテーブルを作成」ボタンを使用する\n・ScalarDB 管理ツールでテーブルを作成して「再取得」を押す"
```

または、ボタンを空状態の中に誘導リンクとして表示する。

### DataBindingModal
```tsx
// データソースタブ初期状態
{!hasDataSource && (
  <div className="text-sm text-muted-foreground p-4 text-center">
    サンプルデータを追加するとレポートのプレビューができます。
    <br />
    <button className="underline text-primary mt-1">JSON ファイルから読み込む</button>
  </div>
)}
```

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] DbConnectionTab の空状態メッセージが「テーブル作成ボタン」への案内を含む
- [ ] DataBindingModal のデータソースタブに適切な空状態メッセージがある
- [ ] 次のアクションが明示されている

## Work Log

- 2026-04-11: Data integration UI/UX レビューで発見。
