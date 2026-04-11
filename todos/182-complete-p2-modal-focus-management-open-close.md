---
status: complete
priority: p2
issue_id: "182"
tags: [code-review, accessibility, wcag, modal, focus-management]
dependencies: ["181"]
---

# DataBindingModal のフォーカス管理（open/close）未実装

## Problem Statement

`DataBindingModal` が開いた時・閉じた時のフォーカス管理が実装されていない。
- **open 時**: 最初のフォーカス可能要素（タブバー）に自動フォーカスされない
- **close 時**: モーダルを開いたトリガー要素にフォーカスが戻らない

スクリーンリーダーユーザーは、モーダルを閉じた後に「今どこにいるか」分からなくなる。

## Findings

**File:** `src/components/modals/DataBindingModal.tsx:23-54`

`useEffect` でのフォーカス管理なし。`open` prop の変化に応じたフォーカス制御がない。

Confirmed by: Accessibility deep-dive review (2026-04-11).

## Proposed Solution

```tsx
// DataBindingModal.tsx
const initialFocusRef = useRef<HTMLElement | null>(null)

useEffect(() => {
  if (open) {
    // 開いたトリガーを記録
    initialFocusRef.current = document.activeElement as HTMLElement
    // 最初のタブにフォーカス
    setTimeout(() => {
      const firstTab = document.querySelector('[role="tab"]') as HTMLElement
      firstTab?.focus()
    }, 50) // アニメーション後
  }
}, [open])

const handleClose = useCallback(() => {
  onClose()
  setTimeout(() => initialFocusRef.current?.focus(), 0)
}, [onClose])
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [x] DataBindingModal が開いた時、最初のタブにフォーカスが移動する
- [x] DataBindingModal が閉じた時、モーダルを開いたボタンにフォーカスが戻る
- [x] DataBindingModal のフォーカストラップも追加（ConfirmDialog #181 と同じパターン）

## Work Log

- 2026-04-11: Accessibility UI/UX レビューで発見。
