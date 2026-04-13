---
status: pending
priority: p2
issue_id: "257"
tags: [code-review, accessibility, wcag, ui-ux]
dependencies: []
---

# 10px テキストが muted-foreground カラーで WCAG AA コントラスト比未達

## Problem Statement

`muted-foreground` トークン（HSL: 215.4 16.3% 46.9%）は白背景に対して約 4.5:1 のコントラスト比を持つが、コードベース全体で `text-[10px]` などの小さいテキストサイズで使用されている。WCAG 2.1 AA は通常テキスト（14px未満）に 4.5:1 を要求するが、10px では事実上読み難く、AAA 基準（7:1）には大幅に未達。

## Findings

影響箇所:
- `PropSection` タイトル（`sharedUI.tsx` 内）
- レイヤーパネルのフッターラベル
- 非アクティブタブのアイコン下テキスト
- `EditorStatusBar` ラベル類
- 各種プロパティパネルのラベル

計算:
- `muted-foreground` ≈ `#6B7A8D`（HSL換算）
- 白背景 `#FFFFFF` に対するコントラスト比: 約 4.5:1
- WCAG AA 達成には 14px 以上のテキストが必要（または 4.5:1 の比率）
- `text-[10px]` は通常テキスト扱いのため 4.5:1 必要だが、実質的な可読性が問題

## Proposed Solutions

### Solution A: 小テキストの最小サイズを 11-12px に引き上げ（推奨）

```css
/* 修正前 */
.prop-section-label { font-size: 10px; }

/* 修正後 */
.prop-section-label { font-size: 11px; }  /* text-[11px] */
```

また `muted-foreground` の明度を若干下げてコントラスト比 4.5:1 以上を確保:
```css
--muted-foreground: 215.4 16.3% 40%;  /* 46.9% → 40% */
```

- Effort: Small
- Risk: Low

### Solution B: カラートークン整理

デザインシステムレベルで `--small-text-color` トークンを追加し、10px 以下のテキストには専用のより暗いトークンを使用。

- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] 全テキストコンテンツが WCAG 2.1 AA コントラスト比（4.5:1）を達成
- [ ] `text-[10px]` 以下のテキストが 11px 以上に引き上げられるか、より高コントラストカラーを使用
- [ ] Chrome DevTools Accessibility パネルでコントラスト違反ゼロ

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
