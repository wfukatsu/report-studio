---
status: complete
priority: p2
issue_id: "277"
tags: [code-review, css, scrolling, component-design]
dependencies: []
---

# TemplateManagerContent が自前の overflow-y-auto を持ち二重スクロールコンテナになる

## Problem Statement

`TemplateManagerContent` の root div が `overflow-y-auto` を持つ（`TemplateManagerModal.tsx` line 120）。タブページ内（`TemplateManagementTab.tsx` line 40）でも親が `overflow-y-auto` を持つため、二重スクロールコンテナが生じる。コンテンツコンポーネントはスクロール動作を自分で管理すべきでなく、親コンテナに委ねるべき。

## Findings

- **Agent**: kieran-typescript-reviewer (HIGH-3)
- **Location**: `src/components/modals/TemplateManagerModal.tsx` line 120 (`overflow-y-auto` on root div)

## Proposed Solutions

### Option A: TemplateManagerContent の root div から overflow-y-auto を削除
```tsx
// TemplateManagerModal.tsx — line 120
<div className="p-5 space-y-5">  // overflow-y-auto を削除
```
- モーダルラッパー側の `<div className="flex-1 overflow-y-auto">` でスクロールを制御（既にあり）
- **Effort**: Tiny
- **Risk**: 低（モーダル内表示を確認すること）

## Acceptance Criteria

- [ ] TemplateManagementTab でコンテンツが適切にスクロールし、二重スクロールバーが出ない
- [ ] TemplateManagerModal でも同様に正常動作する

## Work Log

- 2026-04-13: kieran-typescript-reviewer で発見
