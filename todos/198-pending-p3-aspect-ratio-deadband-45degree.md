---
status: pending
priority: p3
issue_id: "198"
tags: [code-review, performance, canvas, resize, aspect-ratio]
dependencies: []
---

# Shift+リサイズで 45 度方向ドラッグ時に支配軸の判定がフリップする可能性

## Problem Statement

Shift+コーナーリサイズの支配軸判定 (`widthChange >= heightChange`) は浮動小数点変換後の値で行われる。ポインタが 45 度方向に動いた場合、`pxToMm` 変換の誤差により `widthChange` と `heightChange` がほぼ等しくなり、フレームごとに支配軸が横↔縦に切り替わる「フリップ」が視覚的に発生しうる。

## Findings

**File:** `src/components/canvas/CanvasElement.tsx:152-153`

```ts
const widthChange = Math.abs(newWidthMm - resizeStart.current.widthMm)
const heightChange = Math.abs(newHeightMm - resizeStart.current.heightMm)
if (widthChange >= heightChange) {
```

`pxToMm` は浮動小数点除算 (`px / 25.4 * 96`) を行うため、微小な誤差が蓄積する。

## Proposed Solutions

### Option A: デッドバンドを設ける

```ts
const DEADBAND_MM = 0.5  // 0.5mm の判定余白
if (widthChange >= heightChange + DEADBAND_MM) {
  // 幅が明確に支配
} else if (heightChange > widthChange + DEADBAND_MM) {
  // 高さが明確に支配
}
// どちらでもない場合は前回の支配軸を維持 (startRef に保存)
```

- **Pros:** 45 度付近の不安定な切り替えが防止される
- **Cons:** 追加の状態管理が必要 (前回支配軸の保存)
- **Effort:** Medium

### Option B: ピクセルデルタで判定 (mouseX/Y 差分)

```ts
const rawDx = Math.abs(ev.clientX - resizeStart.current.mouseX)
const rawDy = Math.abs(ev.clientY - resizeStart.current.mouseY)
if (rawDx >= rawDy) { ... }
```

- **Pros:** pxToMm 変換前なので浮動小数点誤差が小さい
- **Cons:** ピクセル座標を使用するため mm 座標系と概念が混在
- **Effort:** Small

### Option C: 現状維持 (タイブレーカーで水平を優先)

現在の `>=` は widthChange === heightChange のとき水平を優先するため、タイブレーカーは一貫している。実用的には 0.5 度以内の方向でのみ発生し、ユーザーへの影響は軽微。

- **Effort:** None

## Recommended Action

初期実装は Option C (現状維持) で許容し、ユーザーから報告があれば Option B を適用する。

## Acceptance Criteria

- [ ] 45 度方向ドラッグでフリップが頻発しないことを手動確認
- [ ] (将来) デッドバンドテストが追加される場合は axisConstraint と同様の純関数で実装

## Work Log

- 2026-04-11: performance-oracle が指摘 (PR #30 レビュー)
