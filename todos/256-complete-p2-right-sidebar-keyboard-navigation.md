---
status: pending
priority: p2
issue_id: "256"
tags: [code-review, accessibility, keyboard-navigation, ui-ux]
dependencies: []
---

# 右サイドバータブにキーボードナビゲーション（矢印キー）がない

## Problem Statement

左サイドバーのタブは `ArrowLeft/ArrowRight/Home/End` キーによるナビゲーション（roving tabindex パターン）を正しく実装しているが、右サイドバーのタブ群は同じパターンを実装していない。WAI-ARIA タブコンポーネントのガイドラインではタブリスト内のキーボードナビゲーションが必須。

## Findings

**Location:** `src/App.tsx:399–425`（右サイドバーのタブ定義）

左サイドバー（`App.tsx:299–323`）では:
- `role="tablist"` + `role="tab"` 実装済み
- `onKeyDown` で `ArrowLeft/ArrowRight/Home/End` 処理
- roving tabindex で `tabIndex={-1}` / `tabIndex={0}` 切り替え

右サイドバーでは:
- `onKeyDown` ハンドラなし
- 矢印キーでタブ間を移動できない
- WCAG 2.1 SC 2.1.1 (Keyboard) の不適合

## Proposed Solutions

### Solution A: 左サイドバーと同じキーボードハンドラを適用（推奨）

左サイドバーの `onKeyDown` ロジックを `useTabKeyNav` カスタムフックに抽出し、両サイドバーで共有する。

```tsx
const { handleKeyDown } = useTabKeyNav({ tabs: RIGHT_TABS, activeTab, setActiveTab })

<div role="tablist" onKeyDown={handleKeyDown}>
  {RIGHT_TABS.map(tab => (
    <button
      role="tab"
      tabIndex={activeTab === tab.id ? 0 : -1}
      aria-selected={activeTab === tab.id}
      ...
    />
  ))}
</div>
```

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] 右サイドバーで `ArrowLeft/ArrowRight` キーによるタブ移動が動作する
- [ ] `Home/End` キーで最初/最後のタブに移動できる
- [ ] `role="tablist"`, `role="tab"`, `aria-selected` が正しく実装されている
- [ ] 左右サイドバーで同一のキーボードパターン

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
