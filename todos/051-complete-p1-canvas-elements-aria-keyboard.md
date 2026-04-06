---
status: pending
priority: p1
issue_id: "051"
tags: [ux-review, accessibility, a11y, wcag, keyboard]
dependencies: []
---

## Problem Statement

Canvas elements are plain `<div>` elements with no ARIA roles, no tabIndex, and no keyboard accessibility. They are completely invisible to screen readers and cannot be reached via keyboard, violating WCAG 4.1.2 and 2.1.1 (Keyboard).

## Findings

- `src/components/canvas/CanvasElement.tsx:131-185`: outer div has no `role`, no `tabIndex`, no `aria-label`, no `aria-selected`
- Cannot Tab to canvas elements — no keyboard access at all
- `src/App.tsx:47-97`: keyboard handler handles Delete/clipboard/undo but no arrow-key nudge
- After adding/deleting elements, focus is not managed (violates WCAG 2.4.3 Focus Order)
- `src/components/canvas/ContextMenu.tsx`: context menu has no Escape handler, no auto-focus on open

## Proposed Solutions

**A) Add basic ARIA and tabIndex to CanvasElement (Recommended for P1)**
```tsx
<div
  role="button"
  tabIndex={0}
  aria-label={`${element.name || element.type} (${element.position.x}mm, ${element.position.y}mm)`}
  aria-selected={isSelected}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') onSelect(element.id)
  }}
  ...
>
```

**B) Full keyboard navigation (P2 scope)**
Arrow key nudge (1mm), Shift+Arrow (5mm), Tab between elements, focus management after add/delete. See todo 059 for arrow key nudge specifically.

## Recommended Action

Apply solution A for the P1 accessibility fix. Arrow key and focus management follow-up in P2 todos.

## Technical Details

- **File:** `src/components/canvas/CanvasElement.tsx:131-185`
- WCAG criteria: 4.1.2 Name, Role, Value (Level A), 2.1.1 Keyboard (Level A), 2.4.3 Focus Order (Level A)

## Acceptance Criteria

- [ ] Each canvas element has `role="button"`, `tabIndex={0}`, `aria-label` with element name/type
- [ ] `aria-selected` reflects selection state
- [ ] Elements can be focused and selected via keyboard (Enter/Space to select)
- [ ] Context menu has Escape key handler

## Work Log

- 2026-04-06: Identified by technical-reviewer agent in UI/UX review (WCAG 4.1.2, 2.1.1)
