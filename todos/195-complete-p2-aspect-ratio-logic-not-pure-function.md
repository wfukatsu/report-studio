---
status: pending
priority: p2
issue_id: "195"
tags: [code-review, architecture, canvas, resize, aspect-ratio, agent-native]
dependencies: []
---

# アスペクト比維持ロジックが純関数に抽出されておらず constrainDelta と非対称

## Problem Statement

機能A (軸拘束移動) の `constrainDelta` は `src/lib/axisConstraint.ts` に純関数として切り出されているが、機能B (アスペクト比固定リサイズ) の計算ロジックは `CanvasElement.tsx` の `onPointerMove` クロージャ内に約 18 行のインラインコードとして埋め込まれている。

設計の非対称性に加え、エージェント (AI) がアスペクト比を維持したままリサイズを行う際に利用できる共有ライブラリが存在しないという agent-native パリティの問題もある。

## Findings

**File:** `src/components/canvas/CanvasElement.tsx:148-165`

```ts
// onPointerMove クロージャ内にインライン
const isCorner = handle === 'se' || handle === 'sw' || handle === 'ne' || handle === 'nw'
if (ev.shiftKey && isCorner) {
  const { ratio } = resizeStart.current
  const widthChange = Math.abs(newWidthMm - resizeStart.current.widthMm)
  const heightChange = Math.abs(newHeightMm - resizeStart.current.heightMm)
  if (widthChange >= heightChange) {
    newHeightMm = Math.max(MIN_MM, newWidthMm / ratio)
    if (newHeightMm === MIN_MM) newWidthMm = Math.max(MIN_MM, MIN_MM * ratio)
  } else {
    newWidthMm = Math.max(MIN_MM, newHeightMm * ratio)
    if (newWidthMm === MIN_MM) newHeightMm = Math.max(MIN_MM, MIN_MM / ratio)
  }
  if (handle.includes('w')) newXMm = ...
  if (handle.includes('n')) newYMm = ...
}
```

**比較:**
- 機能A: `src/lib/axisConstraint.ts` に純関数 `constrainDelta` として分離 → テスト 11 ケース
- 機能B: CanvasElement クロージャ内にインライン → テストは CanvasElement.test.tsx 経由のみ

**agent-native 観点:** エージェントが比率を維持してリサイズしたい場合、この計算ロジックは公開された関数として存在せず、`CanvasElement.tsx` 内を参照するしかない。

## Proposed Solutions

### Option A: src/lib/aspectRatioConstraint.ts に純関数を抽出 (推奨)

```ts
// src/lib/aspectRatioConstraint.ts
export interface AspectConstraintInput {
  newWidth: number
  newHeight: number
  startWidth: number
  startHeight: number
  ratio: number
  minMm: number
}

export function constrainAspectRatio(input: AspectConstraintInput): { width: number; height: number } {
  const { newWidth, newHeight, startWidth, startHeight, ratio, minMm } = input
  const widthChange = Math.abs(newWidth - startWidth)
  const heightChange = Math.abs(newHeight - startHeight)
  let w = newWidth, h = newHeight
  if (widthChange >= heightChange) {
    h = Math.max(minMm, w / ratio)
    if (h === minMm) w = Math.max(minMm, minMm * ratio)
  } else {
    w = Math.max(minMm, h * ratio)
    if (w === minMm) h = Math.max(minMm, minMm / ratio)
  }
  return { width: w, height: h }
}
```

- **Pros:** axisConstraint.ts と対称。CanvasElement クロージャが短くなる。純関数のテストが容易。エージェントが直接呼べる
- **Cons:** 新ファイル追加
- **Effort:** Small
- **Risk:** Low

### Option B: 現状維持 + コメント強化

- **Pros:** 変更なし
- **Cons:** 設計の非対称性が残る
- **Effort:** None
- **Risk:** None

## Recommended Action

Option A を適用する。`axisConstraint.ts` のパターンに揃えることでコードベースの一貫性が向上し、エージェントアクセスも改善される。

## Technical Details

- **New file:** `src/lib/aspectRatioConstraint.ts`
- **New test:** `src/lib/aspectRatioConstraint.test.ts`
- **Modify:** `src/components/canvas/CanvasElement.tsx` — インラインロジックを `constrainAspectRatio` 呼び出しに置換

## Acceptance Criteria

- [ ] `src/lib/aspectRatioConstraint.ts` が存在し `constrainAspectRatio` をエクスポートする
- [ ] `src/lib/aspectRatioConstraint.test.ts` が境界ケース (MIN_MM クランプ、ratio=Infinity ガード) を含む
- [ ] `CanvasElement.tsx` のインラインロジックが `constrainAspectRatio` 呼び出しに置換されている
- [ ] 既存の CanvasElement.test.tsx のアスペクト比テストが引き続き PASS する

## Work Log

- 2026-04-11: architecture-strategist (P2)、agent-native-reviewer (警告)、code-simplicity-reviewer が独立して指摘 (PR #30 レビュー)
