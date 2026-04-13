---
status: pending
priority: p2
issue_id: "255"
tags: [code-review, performance, recharts, ui-ux]
dependencies: []
---

# Bar チャートに isAnimationActive={false} がなく再レンダリングのたびにアニメーション

## Problem Statement

`ChartContent.tsx` の `Bar` コンポーネントに `isAnimationActive={false}` が設定されていないため、ストア変更のたびに棒グラフのエントランスアニメーションが再生される。`Line` と `Pie` は正しく設定されているが `Bar` だけ漏れている。

## Findings

**Location:** `src/elements/_blocks/renderers/ChartContent.tsx:55`

```tsx
// ❌ Line/Pie は正しいが Bar だけ漏れている
<Bar key={key} dataKey={key} fill={colors[i % colors.length]} />

// ✅ 正しい例（他の要素）
<Line ... isAnimationActive={false} />
<Pie ... isAnimationActive={false} />
```

ストア変更のたびに棒グラフがフラッシュ・再アニメーションする。

## Proposed Solutions

### Solution A: isAnimationActive={false} を追加（一行修正）

```tsx
<Bar key={key} dataKey={key} fill={colors[i % colors.length]} isAnimationActive={false} />
```

- Effort: Small（1行変更）
- Risk: Low

## Acceptance Criteria

- [ ] 棒グラフがストア変更時にアニメーションを再生しない
- [ ] `<Bar isAnimationActive={false} />` が設定されている

## Work Log

- 2026-04-13: performance-oracle による code-review で発見
