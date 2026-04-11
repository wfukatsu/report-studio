---
status: complete
priority: p2
issue_id: "123"
tags: [code-review, ux, quality]
---

# グループ右クリック「リネーム」メニューが no-op

## Problem Statement

`buildGroupMenuItems` のリネームアイテムが `onClick: () => {}` の空実装。
ユーザーが「リネーム」をクリックしても何も起きない。
ダブルクリックではリネームできるが、メニューからは動かない。

## Findings

**シンプリシティエージェント**（Finding #6）
```typescript
// LayersPanel.tsx:177–178
{ kind: 'action', icon: ..., label: 'リネーム', onClick: () => {} }
// ↑ ダブルクリックでリネームできるため、とコメントあり
```

根本原因: `LayerGroupRow` がリネームステートをローカルで管理しているため、
外部（コンテキストメニュー）からリネームをトリガーする手段がない（`LayerRow` との非対称）。

## Proposed Solutions

### Option A: メニューアイテムを削除（最小変更）

no-op アイテムは存在するより消えた方がよい。ダブルクリックで操作可能であることを tooltip 等で示す。

### Option B: `LayerGroupRow` のリネームステートを `LayersPanel` に持ち上げる

`LayerRow` と同じパターン（`isRenaming`, `renameValue`, `onStartRename` などを props で受け取る）にして、
メニューの `onClick` から `setRenamingGroupId(group.id)` を呼べるようにする。

## Recommended Action

まず Option A（メニューアイテム削除）で即時対応。
`LayerGroupRow` のステート持ち上げは別 Todo で計画する。

## Technical Details

- **Files**: `src/components/sidebar/LayersPanel.tsx`（buildGroupMenuItems）

## Acceptance Criteria

- [x] グループ右クリックメニューにリネームアイテムがない、または正しく動作する
- [x] クリックして何も起きないアイテムが存在しない

## Work Log

- 2026-04-06: シンプリシティ・アーキテクチャエージェントが指摘。
