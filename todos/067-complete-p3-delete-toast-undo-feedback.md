---
status: pending
priority: p3
issue_id: "067"
tags: [ux-review, ux, feedback, undo]
dependencies: []
---

# Delete Toast Undo Feedback

## Problem

Pressing Delete/Backspace removes elements immediately with no visual feedback or undo hint. Users unfamiliar with Cmd+Z may not know they can recover deleted elements.

## Findings

`src/App.tsx:81-85` — Delete key removes elements with no toast/notification; undo button exists but doesn't show what will be undone; no action history label.

## Solutions

### A) Show a toast notification after deletion (Recommended)

"要素を削除しました" with "元に戻す" link that calls `undo()`.

### B) Add undo action label to undo button tooltip

"元に戻す: 要素の削除 (⌘Z)" — requires storing action names in history.

## Recommended

Option A as quick win; Option B as follow-up.

## Files

- `src/App.tsx:81-85`
- Add a toast utility
