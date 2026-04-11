---
status: pending
priority: p2
issue_id: "188"
tags: [code-review, ui-ux, canvas, element-placement]
dependencies: []
---

# 要素追加時の初期位置重なり防止がなくキャンバスが見づらい

## Problem Statement

パレットから要素をドロップすると初期位置にそのまま配置されるため、複数の要素を連続して追加すると重なって表示される。ユーザーが毎回手動で位置調整を強いられる。

## Findings

**File:** `src/components/canvas/ReportCanvas.tsx:171-214`（handlePaletteDrop）

ドロップ座標がそのまま使われており、既存要素との衝突検出・自動オフセットがない。

Confirmed by: Canvas UI/UX review (2026-04-11).

## Proposed Solution

```tsx
// handlePaletteDrop 内で、衝突する場合は位置をずらす
const findNonOverlappingPosition = (
  x: number, y: number, w: number, h: number,
  existing: ReportElement[]
): { x: number; y: number } => {
  let finalX = x, finalY = y
  let offset = 0
  const OFFSET_STEP = 5 // 5mm ずつ

  while (existing.some(el =>
    el.position.x < finalX + w && el.position.x + el.size.width > finalX &&
    el.position.y < finalY + h && el.position.y + el.size.height > finalY
  )) {
    offset += OFFSET_STEP
    finalX = x + offset
    finalY = y + offset
  }
  return { x: finalX, y: finalY }
}
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] 既存要素と重なる位置に要素をドロップした場合、自動的にオフセットされる
- [ ] 連続して同じ場所にドロップしても要素が重ならない
- [ ] オフセット後の位置はセクション範囲内に収まる

## Work Log

- 2026-04-11: Canvas UI/UX レビューで発見。
