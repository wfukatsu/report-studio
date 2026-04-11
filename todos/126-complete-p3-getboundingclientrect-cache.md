---
status: complete
priority: p3
issue_id: "126"
tags: [code-review, performance, hooks]
---

# `useDragSelect` の `getBoundingClientRect` をドラッグ開始時にキャッシュする

## Problem Statement

`useDragSelect.ts` の `onPointerMove` が毎フレーム `e.currentTarget.getBoundingClientRect()` を呼んでいる。
ドラッグ中はコンテナのサイズ・位置が変わらないため、`onPointerDown` 時に一度取得してキャッシュすれば十分。

## Proposed Solution

```typescript
const containerRectRef = useRef<DOMRect | null>(null)

const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (readonly || e.button !== 0) return
  if (e.target !== e.currentTarget) return
  containerRectRef.current = e.currentTarget.getBoundingClientRect()  // キャッシュ
  const rect = containerRectRef.current
  startRef.current = {
    x: (e.clientX - rect.left) / zoom,
    y: (e.clientY - rect.top) / zoom,
  }
  // ...
}, [readonly, zoom])

const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (!startRef.current || !containerRectRef.current) return
  const rect = containerRectRef.current  // キャッシュを使用
  const x = (e.clientX - rect.left) / zoom
  // ...
}, [zoom])
```

また、`zoom` を ref 経由で参照することで `useCallback` の依存配列から除外でき、
ドラッグ中の zoom 変更による stale closure バグも防げる。

## Technical Details

- **Files**: `src/hooks/useDragSelect.ts`

## Acceptance Criteria

- [x] `onPointerMove` 内で `getBoundingClientRect()` が呼ばれなくなる
- [x] ドラッグ精度が変わらない

## Work Log

- 2026-04-06: パフォーマンス・TSレビューエージェントが指摘。
