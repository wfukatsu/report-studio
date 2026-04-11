---
status: complete
priority: p2
issue_id: "121"
tags: [code-review, architecture, validation]
---

# 異なるセクションをまたぐグループ化のバリデーションがない

## Problem Statement

`groupSelectedElements` は選択要素が異なるセクションに属していても group を作成する。
異なるセクション要素が同一グループに入ると：
- レイヤーパネルに複数のグループヘッダーが表示される（同一グループが2箇所に出現）
- 折りたたみ操作が一方のセクションにしか効かない
- `reorderElements` が section ごとに動作するため視覚的グループが保たれない

## Findings

**アーキテクチャレビュー**（Q2）
`renderGroupedElements` は `sectionGroups` をフィルタして各セクションにグループヘッダーを表示するが、
クロスセクショングループの場合は同じグループIDのヘッダーが複数セクションに出現する。

## Proposed Solutions

### Option A: `groupSelectedElements` でバリデーション（推奨）

```typescript
groupSelectedElements: (pageId, name) => {
  const selectedIds = get().selection.selectedElementIds
  if (selectedIds.length < 2) return
  const page = get().definition.pages.find((p) => p.id === pageId)
  if (!page) return

  // 全選択IDが同一セクションに属するか確認
  const sectionForId = new Map<string, string>()
  for (const section of page.sections) {
    for (const el of section.elements) {
      sectionForId.set(el.id, section.id)
    }
  }
  const sections = new Set(selectedIds.map((id) => sectionForId.get(id)).filter(Boolean))
  if (sections.size > 1) {
    // ユーザーへのフィードバック（toast等）
    console.warn('グループ化は同一セクション内の要素のみ可能です')
    return
  }
  // ... 既存ロジック
}
```

## Technical Details

- **Files**: `src/store/layoutSlice.ts`
- ユーザーへのエラーフィードバック手段（toast）も要検討

## Acceptance Criteria

- [x] ヘッダーとボディの要素を同時選択して ⌘G を押しても group が作成されない
- [x] エラー時にユーザーに分かるフィードバックがある
- [x] 同一セクション内の選択は従来通り group 化できる

## Work Log

- 2026-04-06: アーキテクチャエージェントが latent design flaw として指摘。
