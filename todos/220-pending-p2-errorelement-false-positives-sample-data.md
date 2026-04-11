---
status: pending
priority: p2
issue_id: "220"
tags: [code-review, architecture, ux, data-binding]
dependencies: []
---

# `errorElements` がサンプルデータ不在を「バインディングエラー」として誤認識 — 新規レポートで全バインドがエラー表示

## Problem Statement

`useBindingAnalysis` の `fieldExists(fields, fk)` は `dataSources[0].fields`（サンプルJSON）に対してフィールドの存在を確認する。
サンプルデータが空（`{}`）の場合、バインドされた全要素が `errorElements` に分類され、
「バインディングエラー」セクションに全要素が表示される。

これはスキーマの有効性（DBバインドが正常）とは無関係で、ユーザーを混乱させる。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:54-65`

```typescript
const fields = (dataSource?.fields ?? {}) as Record<string, unknown>
// ...
function registerBound(base, fk) {
  fieldMappings.push({ ...base, fieldKey: fk })
  if (hasDataSource && !fieldExists(fields, fk)) {
    errorElements.push({ ...base, fieldKey: fk })  // ← サンプルデータ不在 = エラー
  }
}
```

**問題の状況**:
1. 新規レポートで要素に `fieldKey` を設定 → サンプル JSON に値がない → 全要素が赤エラーとして表示
2. schema と tableMeta が正しく設定されていても、サンプル JSON が空なら誤エラー

## Proposed Solutions

### Option A: `errorElements` のラベルを変更して意味を明確化（最小コスト）

```typescript
// Section タイトルを変更
"バインディングエラー" → "サンプルデータ未設定"
// suffix を変更
suffix="不明" → suffix="値なし"
```

**Pros:** コード変更最小、ユーザーが意味を理解しやすくなる
**Cons:** 根本的な誤分類は残る
**Effort:** Trivial | **Risk:** Low

### Option B: `errorElements` の判定条件を明確化（推奨）

```typescript
// hasDataSource があり、かつフィールドキーがサンプルデータに存在しない場合
// ← これはエラーでなく「サンプル値なし」として分類
if (hasDataSource && !fieldExists(fields, fk)) {
  missingInSampleElements.push({ ...base, fieldKey: fk })  // 別カテゴリ
}
```

**BindingAnalysis** インターフェースに `missingInSampleElements` を追加し、
「バインディングエラー」（フォーマット不正など）と「サンプル値なし」を区別する。

**Pros:** セマンティクスが正確
**Cons:** インターフェース変更が必要
**Effort:** Small | **Risk:** Low

## Recommended Action

短期: **Option A** でユーザー混乱を軽減。中期: **Option B** でセマンティクス修正。

## Technical Details

**Affected files:**
- `src/hooks/useBindingAnalysis.ts:54-65`
- `src/components/sidebar/DataBindingOverviewPanel.tsx` — セクションタイトル

## Acceptance Criteria

- [ ] サンプルデータが空のレポートで全バインド要素が赤エラーとして表示されない
- [ ] 「バインディングエラー」と「サンプル値未設定」が区別される（またはラベルが正確）

## Work Log

- 2026-04-12: Discovered by Architecture reviewer and TypeScript reviewer
