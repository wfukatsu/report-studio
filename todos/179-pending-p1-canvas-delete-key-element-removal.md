---
status: pending
priority: p1
issue_id: "179"
tags: [code-review, ui-ux, canvas, keyboard, accessibility]
dependencies: []
---

# キャンバス要素の Delete/Backspace キー削除が未実装

## Problem Statement

選択した要素を Delete または Backspace キーで削除できない。キーボード操作を主体とするユーザーが要素を削除するには必ずマウス操作（コンテキストメニューまたは右クリック→削除）が必要であり、キーボードオンリー操作の基本要件を満たしていない。

## Findings

**File:** `src/components/canvas/ReportCanvas.tsx`

グローバル keydown ハンドラは Ctrl+G（グループ化）のみ実装されており、Delete/Backspace のハンドリングがない。

Confirmed by: Canvas UI/UX review (2026-04-11).

## Proposed Solution

`ReportCanvas.tsx` のグローバル keydown ハンドラに追加:

```tsx
useEffect(() => {
  if (readonly) return
  const handleKeyDown = (e: KeyboardEvent) => {
    // テキスト入力中は無視
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
      e.preventDefault()
      selectedIds.forEach(id => {
        if (activePage) removeElement(activePage.id, id)
      })
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [selectedIds, activePage, readonly, removeElement])
```

**Effort:** Small | **Risk:** Low（テキスト入力フィールドにフォーカスがある場合は無視する guard が必要）

## Acceptance Criteria

- [ ] 要素選択時に Delete キーで削除できる
- [ ] 要素選択時に Backspace キーで削除できる
- [ ] テキスト入力フィールド内での Backspace は通常動作を維持する
- [ ] 複数選択時は選択要素すべてが削除される

## Work Log

- 2026-04-11: Canvas UI/UX レビューで発見。
