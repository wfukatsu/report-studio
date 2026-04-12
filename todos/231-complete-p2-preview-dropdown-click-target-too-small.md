---
status: complete
priority: p2
issue_id: "231"
tags: [ui-ux, toolbar, preview, accessibility, qa-review]
dependencies: []
---

# プレビューメニューのドロップダウン矢印がクリックできない

## Problem Statement

「プレビュー ▼」スプリットボタンのドロップダウン矢印部分がクリックタイムアウト。
ターゲット領域が 16px 以下と推定され、WCAG 2.5.5（ターゲットサイズ 44×44px）に違反。

## Findings

`src/components/toolbar/Toolbar.tsx` のプレビューメニューボタン部分。
`@e28 [button] "プレビューメニュー"` がブラウザ自動テストでタイムアウト。

## Proposed Solution

```tsx
// 現状
<button className="..." onClick={...}>▼</button>

// 修正: 最低 32px 幅確保
<button
  className="flex items-center justify-center min-w-[32px] h-8 px-2 ..."
  onClick={...}
>
  <ChevronDown className="w-3.5 h-3.5" />
</button>
```

**Effort:** Trivial | **Risk:** Low

## Acceptance Criteria

- [ ] プレビューメニューのドロップダウン部分が最低 32px 幅
- [ ] クリックすると「プレビュー」「フルプレビュー（PDF）」メニューが表示される
- [ ] キーボード（Space/Enter）でもメニューが開く

## Work Log

- 2026-04-12: QA review でクリックタイムアウトを確認
