---
status: complete
priority: p2
issue_id: "184"
tags: [code-review, accessibility, toolbar, aria, keyboard]
dependencies: []
---

# ズームメニューの ARIA セマンティクス不整合（横幅フィット・role="menu"）

## Problem Statement

ツールバーのズームドロップダウンメニューに 3 つの ARIA 問題がある:
1. 「横幅フィット」「ページ全体フィット」ボタンに `aria-label` がない
2. ズームプリセット選択肢に `role="menuitem"` がない
3. 保存メニュー開閉ボタンに `aria-haspopup="menu"` がない（alignment/z-order には実装済み）

## Findings

**File:** `src/components/toolbar/Toolbar.tsx`

```tsx
// Line 798-806: aria-label なし
<button title="横幅フィット"> <FitWidthIcon /> </button>

// Line 783-794: role="menuitem" なし
{[25, 50, 75, 100, 125, 150, 200].map(z => (
  <button key={z}>{z}%</button>  // role なし
))}

// Line 526-533: aria-haspopup なし（alignment L604 には実装済み）
<button aria-expanded={showSaveMenu} aria-label="保存メニュー">
  // aria-haspopup="menu" が欠落
```

Confirmed by: Toolbar UI/UX review (2026-04-11).

## Proposed Solution

```tsx
// 横幅フィット・ページ全体フィット
<button aria-label="横幅フィット" title="横幅フィット"> <FitWidthIcon /> </button>
<button aria-label="ページ全体フィット" title="ページ全体フィット"> <FitPageIcon /> </button>

// ズームプリセット
<div role="menu" aria-label="ズームレベル">
  {[25, 50, 75, 100, 125, 150, 200].map(z => (
    <button role="menuitem" aria-pressed={editorZoom === z / 100} key={z}>{z}%</button>
  ))}
</div>

// 保存メニュー
<button aria-expanded={showSaveMenu} aria-haspopup="menu" aria-label="保存メニュー">
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] 「横幅フィット」「ページ全体フィット」に `aria-label` 追加
- [ ] ズームプリセットボタン群を `role="menu"` コンテナ内に配置
- [ ] 各プリセットに `role="menuitem"` 追加
- [ ] 保存メニューボタンに `aria-haspopup="menu"` 追加

## Work Log

- 2026-04-11: Toolbar UI/UX レビューで発見。
