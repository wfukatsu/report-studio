---
status: pending
priority: p3
issue_id: "199"
tags: [code-review, testing, canvas, resize]
dependencies: []
---

# CanvasElement テストのリサイズハンドル取得が CSS スタイル依存で壊れやすい

## Problem Statement

`CanvasElement.test.tsx` の `getSEHandle` 関数がインラインスタイルの文字列マッチ (`[style*="se-resize"]`) や `style.cursor === 'se-resize'` でハンドルを取得している。CSS の実装詳細に依存しており、スタイル変更で無言に壊れる可能性がある。

## Findings

**File:** `src/components/canvas/CanvasElement.test.tsx:69-75`

```ts
function getSEHandle(container: HTMLElement) {
  const handles = container.querySelectorAll('[style*="se-resize"]')
  if (handles.length > 0) return handles[0] as HTMLElement
  return Array.from(container.querySelectorAll('div')).find(
    (el) => (el as HTMLElement).style.cursor === 'se-resize',
  ) as HTMLElement | undefined
}
```

## Proposed Solution

`ResizeHandleEl` コンポーネントに `data-resize-handle` 属性を追加し、テストで `[data-resize-handle="se"]` でクエリする。

```tsx
// ResizeHandleEl の div に追加:
data-resize-handle={handle}

// テストでの取得:
function getHandle(container: HTMLElement, handle: string) {
  return container.querySelector(`[data-resize-handle="${handle}"]`) as HTMLElement | null
}
```

- **Pros:** 実装詳細ではなくセマンティクスでクエリ。CSS 変更に対してロバスト
- **Cons:** プロダクションコードに微小な変更が必要
- **Effort:** Small
- **Risk:** None

## Acceptance Criteria

- [ ] `ResizeHandleEl` に `data-resize-handle={handle}` 属性が追加されている
- [ ] `CanvasElement.test.tsx` が `[data-resize-handle="se"]` でハンドルを取得している
- [ ] テストが PASS する

## Work Log

- 2026-04-11: kieran-typescript-reviewer (LOW) が指摘 (PR #30 レビュー)
