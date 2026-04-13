---
status: pending
priority: p2
issue_id: "253"
tags: [code-review, performance, canvas, drag-resize]
dependencies: []
---

# セクションリサイズが pointermove ごとにストアを直接更新 — 120書き込み/秒

## Problem Statement

セクションのリサイズハンドルが毎 `pointermove` イベントで `updateSectionHeight` を呼び出し、Zustand ストアに直接書き込んでいる。スロットルなし・RAF ゲートなしで、120Hzディスプレイでは1秒間に120回のストア変更と全キャンバス再レンダリングが発生する。

## Findings

**Location:** `src/components/canvas/SectionContainer.tsx:107` / `src/components/canvas/ReportCanvas.tsx:247-252`

```ts
onResizeSection(section.id, newHeight)  // pointermove ごとに呼ばれる
// → updateSectionHeight(page.id, sectionId, newHeightMm) — 直接ストア書き込み
```

要素リサイズ（CanvasElement）は同様に非スロットルだが、dnd-kit の `distance: 4` アクティベーション制約でわずかに緩和されている。

## Proposed Solutions

### Solution A: ローカル ref でバッファリング、pointerup 時のみストア更新（推奨）

```ts
const localHeightRef = useRef(section.height)

const handlePointerMove = (e: PointerEvent) => {
  // ローカル ref のみ更新（ストアへの書き込みなし）
  localHeightRef.current = calculateNewHeight(e)
  // CSS で直接サイズを更新（視覚的フィードバック）
  resizeHandleRef.current?.style.setProperty('--height', `${localHeightRef.current}px`)
}

const handlePointerUp = () => {
  onResizeSection(section.id, localHeightRef.current)  // ストア更新は1回のみ
}
```

- Effort: Small
- Risk: Low

### Solution B: requestAnimationFrame によるスロットル

```ts
let rafId: number | null = null
const handlePointerMove = (e: PointerEvent) => {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    onResizeSection(section.id, calculateNewHeight(e))
  })
}
```

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] セクションリサイズ中の1秒あたりのストア書き込み回数が ≤ 60回（1フレームに1回）
- [ ] リサイズの視覚的フィードバックが遅延なく表示される
- [ ] pointerup 後に正しいサイズでストアが更新される

## Work Log

- 2026-04-13: performance-oracle による code-review で発見
