---
status: complete
priority: p1
issue_id: "117"
tags: [code-review, architecture, state-management]
---

# `cutElements` がグループメンバーシップをクリーンアップしない

## Problem Statement

`cutElements` アクションはセクションから要素を削除するが、`page.groups` の `elementIds` を更新しない。
`removeElement` / `removeElements` は正しくクリーンアップしているのに `cutElements` だけが漏れている。

カット→ペーストを繰り返すと `page.groups` にゴーストIDが蓄積し、グループヘッダーが空のまま残る。
UUID v4 の再利用は実質起こらないが、インポートした帳票では既存IDとの衝突が理論的に起こりうる。

## Findings

**アーキテクチャレビュー**（Q1）
`layoutSlice.ts:468–486` の `cutElements` は `section.elements = section.elements.filter(...)` を直接書いており、
`removeElement` のような group cleanup 呼び出しが存在しない。

`removeElement` (line ~440) と `removeElements` (line ~530) はどちらも
`page.groups = page.groups.map(...filter...).filter(...)` で正しくクリーンアップしている。

## Proposed Solutions

### Option A: `cleanGroupMembership` ヘルパーを抽出（推奨）

`layoutSlice.ts` 内にプライベートヘルパーを定義：
```typescript
function cleanGroupMembership(page: PageDef, removedIds: Set<string>) {
  if (!page.groups) return
  page.groups = page.groups
    .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !removedIds.has(id)) }))
    .filter((g) => g.elementIds.length > 0)
}
```
`cutElements`・`removeElement`・`removeElements` の全3箇所から呼ぶ。

### Option B: `cutElements` に直接追記

既存の `removeElement` と同じパターンをインラインで `cutElements` に追加。
ヘルパー抽出より保守性が低いが変更が小さい。

## Recommended Action

Option A — ヘルパー抽出。将来の mutation パスが増えたときに漏れを防ぐ。

## Technical Details

- **Files**: `src/store/layoutSlice.ts`
- **Lines**: 468–486 (`cutElements`)、`removeElement`・`removeElements` のcleanup箇所

## Acceptance Criteria

- [ ] `cutElements` 実行後、切り取った要素のIDが `page.groups` の `elementIds` に残らない
- [ ] `removeElement`・`removeElements` と同じクリーンアップロジックを共有する
- [ ] 既存の184テストが全通過する
- [ ] 新規テスト: cut後にグループ残留しないことを検証

## Work Log

- 2026-04-06: アーキテクチャエージェントが指摘。TSレビューエージェントも同様に確認。
