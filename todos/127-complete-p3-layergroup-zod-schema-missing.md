---
status: complete
priority: p3
issue_id: "127"
tags: [code-review, security, validation]
---

# `LayerGroup` が Zod スキーマに未定義（インポート時無検証）

## Problem Statement

`PageDefSchema` が `.passthrough()` を使っているため、
インポートした JSON の `pages[*].groups` が完全に無検証で受け入れられる。
細工された JSON で任意の長さの name、不正な elementIds などを注入できる。

## Findings

**セキュリティエージェント**（LOW）
XSS や RCE のリスクはないが、データ破損・localStorage 肥大化の原因になりうる。

## Proposed Solution

```typescript
// src/lib/schemas/reportDefinition.ts に追加
const LayerGroupSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  elementIds: z.array(z.string().min(1).max(100)).max(300),
  collapsed: z.boolean(),
  visible: z.boolean(),
  locked: z.boolean(),
})

// PageDefSchema に追加
const PageDefSchema = z.object({
  // 既存フィールド...
  groups: z.array(LayerGroupSchema).max(100).optional(),
}).passthrough()
```

## Technical Details

- **Files**: `src/lib/schemas/reportDefinition.ts`

## Acceptance Criteria

- [x] `LayerGroupSchema` が定義され `PageDefSchema.groups` に適用される
- [x] 不正な name（200文字超）を含む JSON インポートが弾かれる
- [x] 既存テスト全通過

## Work Log

- 2026-04-06: セキュリティエージェントが指摘。
