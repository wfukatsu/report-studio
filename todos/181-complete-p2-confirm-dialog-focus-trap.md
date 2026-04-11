---
status: complete
priority: p2
issue_id: "181"
tags: [code-review, accessibility, wcag, modal, keyboard]
dependencies: []
---

# ConfirmDialog にフォーカストラップがなく WCAG 2.1 AA 違反

## Problem Statement

`ConfirmDialog` はフォーカストラップ（Focus Trap）を実装していない。ダイアログが開いた状態でキーボードの Tab キーを押すと、ダイアログの外の要素にフォーカスが移動してしまう。WAI-ARIA Dialog Pattern では、モーダルダイアログ内でフォーカスを閉じ込めることが必須要件（WCAG 2.1 AA: 2.1.2 キーボードトラップなし の例外として、モーダルダイアログ内のフォーカス維持は許容される）。

## Findings

**File:** `src/components/common/ConfirmDialog.tsx:28-66`

`useEffect` でフォーカストラップの実装がない。`autoFocus` も設定されていないため、ダイアログ表示時にフォーカスの初期位置も不定。

Confirmed by: Accessibility deep-dive review (2026-04-11).

## Proposed Solution

```tsx
// ConfirmDialog.tsx
useEffect(() => {
  if (!open) return
  // ダイアログが開いたら確認ボタンにフォーカス
  confirmButtonRef.current?.focus()
  // フォーカストラップ
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first?.focus()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [open])
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [x] ConfirmDialog 表示時に確認ボタン（またはキャンセルボタン）に自動フォーカス
- [x] Tab/Shift+Tab でダイアログ内を循環し、外部に出ない
- [x] Escape でダイアログが閉じる（既存動作確認）
- [x] ダイアログが閉じた後、開いたトリガー要素にフォーカスが戻る

## Work Log

- 2026-04-11: Accessibility UI/UX レビューで発見。WCAG 2.1 AA 準拠に必要。
