---
status: pending
priority: p2
issue_id: "258"
tags: [code-review, ui-ux, japanese-specific, approval-stamp]
dependencies: []
---

# ApprovalStampRow プロパティパネルに印影画像設定UIがない

## Problem Statement

`approvalStampRow` 要素の型定義 `ApprovalStampRowCell` に `stampSrc` プロパティが存在し、レンダラーも画像表示能力を持つが、プロパティパネルに `stampSrc` を設定するUIが一切ない。ユーザーは承認印欄に印影画像を割り当てる手段がなく、機能として実質的に不完全。

## Findings

- **型定義:** `src/types/index.ts` の `ApprovalStampRowCell` に `stampSrc?: string` が存在
- **レンダラー:** `src/elements/approvalStampRow/Renderer.tsx` — `stampSrc` を使って画像を表示する実装がある
- **プロパティパネル:** `src/elements/approvalStampRow/PropertiesPanel.tsx` — 役職名・列幅のみ設定可能、`stampSrc` の設定UIなし

## Proposed Solutions

### Solution A: プロパティパネルにファイルアップロード/URL入力を追加（推奨）

各セルの設定に画像設定を追加:

```tsx
<PropRow label="印影画像">
  <input type="file" accept="image/*" onChange={handleImageUpload} />
  {cell.stampSrc && (
    <img src={cell.stampSrc} alt="印影" className="h-8 w-8 object-contain" />
  )}
</PropRow>
```

または既存の `ImageElement` が使っているのと同じアップロード機構（Base64/URL）を流用。

- Effort: Medium
- Risk: Low

### Solution B: データバインディングによる動的画像設定

`stampSrc` をスキーマフィールドにバインドできるようにする（動的な印影）。

- Effort: Large
- Risk: Medium

## Acceptance Criteria

- [ ] ApprovalStampRow のプロパティパネルで各セルに印影画像を設定できる
- [ ] 画像はプレビューとして表示される
- [ ] 画像なしの状態でも正常に動作する（オプショナル）

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
