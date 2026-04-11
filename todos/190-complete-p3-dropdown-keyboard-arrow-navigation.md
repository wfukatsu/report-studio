---
status: complete
priority: p3
issue_id: "190"
tags: [code-review, accessibility, keyboard, toolbar, dropdown]
dependencies: ["184"]
---

# ツールバードロップダウンの矢印キーナビゲーション未実装

## Problem Statement

ツールバーの配置・Z順・ズームドロップダウンメニューが、矢印キー（↑/↓）での項目移動に対応していない。WAI-ARIA Menu Button Pattern では、メニュー内の矢印キーナビゲーションが推奨される。

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:616-627`（Alignment）、`644-650`（Z-order）、`782-830`（Zoom）

各メニューの `onKeyDown` ハンドラが存在しない（またはメニュー項目が自身で Escape のみ処理）。

## Proposed Solution

各ドロップダウンメニューに WAI-ARIA Menu Button Pattern のキーボードハンドラを追加:

```tsx
const handleMenuKeyDown = (e: React.KeyboardEvent, items: HTMLElement[]) => {
  const current = document.activeElement as HTMLElement
  const idx = items.indexOf(current)
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); items[(idx + 1) % items.length]?.focus(); break
    case 'ArrowUp': e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); break
    case 'Home': e.preventDefault(); items[0]?.focus(); break
    case 'End': e.preventDefault(); items[items.length - 1]?.focus(); break
  }
}
```

**Effort:** Medium | **Risk:** Low

## Acceptance Criteria

- [ ] メニュー内で ↑/↓ キーで項目を移動できる
- [ ] Home/End キーで最初/最後の項目に移動できる
- [ ] Enter で選択、Escape でメニューが閉じる（既存動作維持）

## Work Log

- 2026-04-11: Toolbar UI/UX レビューで発見。WCAG AAA 相当。P3 として将来対応。
