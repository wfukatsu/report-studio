---
status: complete
priority: p1
issue_id: "071"
tags: [ux-review, accessibility, a11y, wcag, keyboard]
dependencies: []
---

## Problem

The context menu opens on right-click but has no keyboard focus management. When it appears, focus stays on the canvas — keyboard users cannot reach the menu items. No role="menu"/role="menuitem", no arrow-key navigation, no focus trap. WCAG 2.1.1 violation.

## Resolution

Added ARIA roles and full keyboard navigation to `ContextMenu.tsx`:
- `role="menu"` on the container div
- `role="menuitem"` and `tabIndex={-1}` on each button (roving tabindex)
- Auto-focus first enabled item on mount via `useEffect` + `requestAnimationFrame`
- ArrowDown/ArrowUp navigation with wraparound, skipping disabled items
- Home/End to jump to first/last item
- Enter activates the focused item (native button behavior)

Added 8 tests in `ContextMenu.test.tsx` covering all acceptance criteria.

## Acceptance Criteria

- [x] role="menu" on container, role="menuitem" on items
- [x] First item auto-focused on open
- [x] Arrow key navigation between items
- [x] Enter activates focused item

## Work Log

- 2026-04-06: Fixed — added ARIA roles, keyboard navigation, and tests
