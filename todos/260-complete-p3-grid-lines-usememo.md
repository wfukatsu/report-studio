---
status: pending
priority: p3
issue_id: "260"
tags: [code-review, performance, canvas, usememo]
dependencies: []
---

# グリッド線・ルーラー目盛りのループが毎レンダリングで実行される（useMemo なし）

## Problem Statement

`ReportCanvas.tsx` でグリッド線とルーラー目盛りの配列を計算するループが `useMemo` なしでインライン実行されており、毎レンダリングで再計算される。ズームやグリッドサイズが変化していない場合でも実行される無駄な計算。

## Findings

**Location:** `src/components/canvas/ReportCanvas.tsx:346-355`

```ts
// ❌ 毎レンダリングで実行
const hTicks: number[] = []
for (let mm = 0; mm <= page.width; mm += 10) hTicks.push(mm)
const gridLinePxH: number[] = []
for (let mm = 0; mm <= page.width; mm += gridSize) gridLinePxH.push(mmToPx(mm))
```

A4(297mm高)・グリッド5mmで60+エントリを毎ドラッグフレームで生成。

## Proposed Solutions

### Solution A: useMemo でラップ

```ts
const { hTicks, vTicks, gridLinePxH, gridLinePxV } = useMemo(() => {
  const hTicks: number[] = []
  for (let mm = 0; mm <= page.width; mm += 10) hTicks.push(mm)
  // ...
  return { hTicks, vTicks, gridLinePxH, gridLinePxV }
}, [page.width, page.height, gridSize])
```

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] グリッド線配列が `useMemo` でメモ化されている
- [ ] `page.width`, `page.height`, `gridSize` が変更した場合のみ再計算される

## Work Log

- 2026-04-13: performance-oracle による code-review で発見
