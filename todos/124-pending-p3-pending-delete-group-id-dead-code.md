---
status: complete
priority: p3
issue_id: "124"
tags: [code-review, dead-code, quality]
---

# `pendingDeleteGroupId` ref が dead code

## Problem Statement

`LayersPanel.tsx:78` で宣言された `pendingDeleteGroupId` ref が、
`buildGroupMenuItems` で一度書き込まれるが読み取られる箇所がゼロ。
削除 API は既に `group.id` を直接渡しており、この ref は機能しない。

## Proposed Solution

```typescript
// 削除対象
const pendingDeleteGroupId = useRef<string | null>(null)

// buildGroupMenuItems 内の代入も削除
pendingDeleteGroupId.current = group.id  // この行も削除
```

## Technical Details

- **Files**: `src/components/sidebar/LayersPanel.tsx:78, 192–194`

## Acceptance Criteria

- [x] `pendingDeleteGroupId` の宣言と全参照が削除される
- [x] 既存テスト全通過

## Work Log

- 2026-04-06: シンプリシティ・アーキエージェントが dead code として指摘。
