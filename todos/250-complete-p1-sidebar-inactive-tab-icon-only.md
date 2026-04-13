---
status: pending
priority: p1
issue_id: "250"
tags: [code-review, ui-ux, discoverability, accessibility]
dependencies: []
---

# 左サイドバーの非アクティブタブがアイコンのみ表示でラベル不明

## Problem Statement

左サイドバーの非アクティブタブはアイコンのみ表示され、ラベルが表示されない。`Link2`（データバインディング概要）や `MessageSquare`（回答）などのアイコンは意味が曖昧で、ユーザーがそのタブをクリックするまで何が表示されるか分からない。機能の発見可能性に重大な問題がある。

## Findings

**Location:** `src/App.tsx:325–347`

非アクティブタブはアイコンのみ、`title` 属性のみでラベルを表示している:
- `title` 属性はタッチデバイスでは表示されない
- スクリーンリーダーには読まれるが視覚的には不可視
- 特に `Link2`（データ）と `MessageSquare`（回答）は意味が曖昧

タブ構成:
```
要素(Layers) → スキーマ(Database) → レイヤー(Layers2) → ページ(File) → 回答(MessageSquare) → データ(Link2)
```

`Link2` と `MessageSquare` は特に意味が取りにくい。

## Proposed Solutions

### Solution A: 全タブにラベルを常時表示（推奨）

アイコン下にラベルを常に表示する（縦に小さく）:

```tsx
<button className="flex flex-col items-center gap-0.5 p-2 ...">
  <Icon className="h-4 w-4" />
  <span className="text-[9px] leading-tight">{tab.label}</span>
</button>
```

- Pros: 最も発見可能性が高い、アクセシビリティ向上
- Cons: タブの縦幅が増加
- Effort: Small
- Risk: Low

### Solution B: ホバー時にラベルを表示（Tooltip を使用）

既存の Tooltip コンポーネントで非アクティブタブのラベルを表示:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button ...><Icon /></button>
  </TooltipTrigger>
  <TooltipContent side="right">{tab.label}</TooltipContent>
</Tooltip>
```

- Pros: 現在のレイアウトを維持
- Cons: タッチデバイスで未対応、キーボードユーザーにも見えない
- Effort: Small
- Risk: Low

### Solution C: アイコンをより直感的なものに変更

`Link2` → `BindingIcon`（カスタム）、`MessageSquare` → `ClipboardList` など:

- Pros: アイコン自体の改善
- Cons: Solution A/B と組み合わせることが望ましい
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] 全タブのラベルがキーボードユーザー・タッチユーザーに視覚的に認識できる
- [ ] または各タブのアイコンが機能を直感的に表す
- [ ] スクリーンリーダーで全タブが正しくアナウンスされる

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見（CRITICAL）
