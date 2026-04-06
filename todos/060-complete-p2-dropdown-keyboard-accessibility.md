---
status: pending
priority: p2
issue_id: "060"
tags: [ux-review, keyboard, accessibility, a11y]
dependencies: []
---

# Dropdown Keyboard Accessibility

## Problem

Zoom dropdown and context menu are not keyboard-accessible: no Escape to close, no arrow-key navigation, no focus trap, no ARIA attributes.

## Findings

- `src/components/toolbar/Toolbar.tsx:215-247` — zoom menu: no Escape handler, no click-outside detection, no `aria-expanded`, no `aria-haspopup`
- `src/components/canvas/ContextMenu.tsx:46-55` — context menu: closes on `mousedown` only, no Escape key handler, no auto-focus on open, no roving tabindex for items

## Solutions

### A) Fix zoom menu

Add `useEffect` click-outside detection, add Escape handler, add `aria-expanded`/`aria-haspopup="listbox"` on trigger button, add `role="listbox"` + `role="option"` on items.

### B) Fix context menu

Add Escape handler via `keydown` listener, auto-focus first item on open (`useEffect` + `ref.current?.focus()`), add `role="menu"` + `role="menuitem"`, implement roving tabindex (up/down arrows).

### C) Use shadcn/ui components (Recommended)

Replace both with shadcn/ui Popover and DropdownMenu which handle all of this out of the box. Fallback: A + B if minimal change preferred.

## Recommendation

**C** (use shadcn components). Fallback: **A + B** if minimal change preferred.

## Files

- `src/components/toolbar/Toolbar.tsx:215-247`
- `src/components/canvas/ContextMenu.tsx`
