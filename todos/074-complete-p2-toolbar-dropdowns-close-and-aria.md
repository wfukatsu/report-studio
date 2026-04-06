---
status: complete
priority: p2
issue_id: "074"
tags: [ux-review, accessibility, interaction, toolbar]
dependencies: []
---

## Problem

1. The alignment and z-order dropdown menus stay open after selecting an item — users must click outside to close. The zoom dropdown correctly closes after selection.
2. The alignment/z-order dropdown trigger buttons lack `aria-expanded` and `aria-haspopup`; the menu divs lack `role="menu"`; MenuButton items lack `role="menuitem"`.

## Findings

- `src/components/toolbar/Toolbar.tsx:281-293` — align MenuButton onClick doesn't call `setShowAlignMenu(false)`
- `src/components/toolbar/Toolbar.tsx:307-313` — z-order same issue
- `src/components/toolbar/Toolbar.tsx:271` — align trigger lacks `aria-expanded`
- `src/components/toolbar/Toolbar.tsx:297` — z-order trigger same
- Zoom at line 358 correctly has `aria-expanded`/`aria-haspopup` as reference

## Solutions

### A) Fix both issues together
In MenuButton onClick handlers, add `setShowAlignMenu(false)` / `setShowZOrderMenu(false)` after the action. Add `aria-expanded={showAlignMenu/showZOrderMenu}` and `aria-haspopup="menu"` to trigger buttons. Add `role="menu"` to dropdown divs and `role="menuitem"` to MenuButton.

## Files

- `src/components/toolbar/Toolbar.tsx:271-314`

## Acceptance Criteria

- [ ] Menus close after item selection
- [ ] Trigger buttons have aria-expanded/aria-haspopup
- [ ] Menu containers have role="menu"
- [ ] Items have role="menuitem"
