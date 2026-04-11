---
status: pending
priority: p2
issue_id: "210"
tags: [code-review, architecture, ux, data-binding-phase2]
dependencies: []
---

# detail グループエラーのフロントエンド UX コントラクトが計画に未定義

## Problem Statement

計画ではバックエンドが `errors.grp_X = "detail groups not supported in Phase 2"` を返すと定義しているが、
フロントエンドがこのエラーをどう処理するかが記述されていない。

開発者がその場限りの実装を行い、既存のエラー表示パターン（`DataBindingOverviewPanel.errorElements`）と
整合しないUIになるリスクがある。

## Findings

**Existing pattern**: `useBindingAnalysis.ts` が `errorElements`, `fieldMappings`, `unboundElements` を区別。
`DataBindingOverviewPanel` は `errorElements` セクションに ✖ アイコンで表示。

**計画の欠落**: 
- `errors[groupId]` が non-null の場合、そのグループのフィールドに紐づく要素はどう表示されるか？
- サンプルデータにフォールバックするか？エラーメッセージを表示するか？

## Proposed Solution

```typescript
// resolve-bindings レスポンス処理
for (const [groupId, errorMsg] of Object.entries(response.errors)) {
  if (errorMsg !== null) {
    // そのグループのフィールドを参照する要素はサンプルデータにフォールバック
    // DataBindingOverviewPanel の errorElements に追加
    // 例: "detail グループ: Phase 2 では未対応" というラベルで表示
  }
}
```

**UX仕様**: `errors[groupId] !== null` → そのグループのフィールドを参照する要素は `testData` にフォールバック + Overview パネルに警告表示。

**Effort:** Small (mainly plan document update) | **Risk:** Low

## Acceptance Criteria

- [ ] 計画ドキュメントに detail グループエラーのフロントエンド UX が記述されている
- [ ] `errors[groupId] !== null` の場合、そのグループの要素はサンプル JSON にフォールバックする
- [ ] `DataBindingOverviewPanel` がエラーグループを `errorElements` セクションに表示する

## Work Log

- 2026-04-12: Discovered by Architecture reviewer (UX contract missing)
