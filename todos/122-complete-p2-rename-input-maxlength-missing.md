---
status: complete
priority: p2
issue_id: "122"
tags: [code-review, security, ux]
---

# リネーム入力に `maxLength` がない

## Problem Statement

`LayerRow.tsx` と `LayerGroupRow.tsx` のリネーム `<input>` に `maxLength` がない。
検索バーは `maxLength={100}` 済みだが、リネーム入力だけ漏れている。
任意の長さの文字列が `localStorage` と API に送信される。

## Findings

**セキュリティエージェント**（LOW）
- `LayerRow.tsx:56` — element リネーム入力
- `LayerGroupRow.tsx:64` — グループリネーム入力

XSS リスクはない（React テキストノードで描画）が、localStorage 容量圧迫の可能性がある。

## Proposed Solutions

```tsx
// LayerRow.tsx
<input maxLength={200} ... />

// LayerGroupRow.tsx
<input maxLength={200} ... />

// LayersPanel.tsx commitRename
if (renameValue.trim()) {
  updateElement(pageId, el.id, { name: renameValue.trim().slice(0, 200) } as ...)
}

// LayerGroupRow.tsx commitRename
onRename((renameValue.trim() || group.name).slice(0, 200))
```

200 の上限値は `src/config/constants.ts` に定数として定義するのが望ましい。

## Technical Details

- **Files**: `src/components/sidebar/LayerRow.tsx`, `src/components/sidebar/LayerGroupRow.tsx`, `src/components/sidebar/LayersPanel.tsx`

## Acceptance Criteria

- [x] 両リネーム入力に `maxLength={200}` が設定されている
- [x] commitRename でも `.slice(0, 200)` でトリムされる
- [x] 既存テスト全通過

## Work Log

- 2026-04-06: セキュリティエージェントが指摘。
