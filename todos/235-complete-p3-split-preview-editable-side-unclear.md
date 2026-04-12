---
status: complete
priority: p3
issue_id: "235"
tags: [ui-ux, preview, canvas, qa-review]
dependencies: []
---

# 二面プレビューで編集側とプレビュー側の区別が不明確

## Problem Statement

プレビューON時にエディタとライブプレビューが左右に並ぶが、
両方が同じ白地のキャンバスに見え、どちらが編集可能かが視覚的に不明確。

## Findings

`src/App.tsx` のプレビューパネル表示ロジック、および
`src/components/canvas/ReportCanvas.tsx` の `readonly` prop 制御。

現状、二面表示の区別はステータスバーのラベル（「エディタ」「ライブプレビュー」）
のみで、見落とされやすい。

## Proposed Solution

```tsx
// 案1: プレビュー側にラベルオーバーレイ（最小変更）
// ライブプレビューキャンバスの上部に薄い帯を追加
<div className="absolute top-0 left-0 right-0 h-5 bg-primary/10 flex items-center justify-center z-10 pointer-events-none">
  <span className="text-[10px] text-primary font-medium">ライブプレビュー</span>
</div>

// 案2: 編集側にアクティブボーダー
// エディタキャンバスのラッパーに border-primary を追加
<div className="border-2 border-primary/30 rounded" />
```

**Effort:** Trivial | **Risk:** Low

## Acceptance Criteria

- [ ] 二面表示時、編集側とプレビュー側が視覚的に区別できる
- [ ] 区別方法はキャンバス上部のラベルかボーダーで実装

## Work Log

- 2026-04-12: QA review で視覚的区別不明確を確認
