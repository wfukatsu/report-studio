---
status: pending
priority: p1
issue_id: "050"
tags: [ux-review, accessibility, a11y, wcag]
dependencies: []
---

## Problem Statement

Toolbar icon-only buttons use only the `title` attribute for labeling. `title` is not reliably announced by all screen readers. Toggle buttons lack `aria-pressed`. This violates WCAG 4.1.2 (Name, Role, Value) and 1.1.1 (Non-text Content).

## Findings

- `src/components/toolbar/Toolbar.tsx:293-319`: `ToolbarButton` uses `title` prop but no `aria-label`
- Toggle buttons (Grid, Snap, Header Edit Mode, Live Preview, Preview Mode) have no `aria-pressed={active}`
- Report name input at line 93-98 has no `aria-label` or associated `<label>`
- Icon-only buttons: all alignment, z-order, copy/cut/paste, undo/redo buttons are invisible to screen readers

## Proposed Solutions

**A) Add aria-label and aria-pressed to ToolbarButton (Recommended)**
```tsx
function ToolbarButton({ children, onClick, disabled, title, active }: ...) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active !== undefined ? active : undefined}
      className={cn(...)}
    >
```
Add `aria-label="レポート名"` to the report name input.

**B) Visually show labels for primary buttons**
Surface text labels for the 6 most-used buttons, hide secondary buttons behind dropdowns.

## Recommended Action

Apply solution A immediately (minimal, non-visual change). Combine with B in a future toolbar redesign.

## Technical Details

- **File:** `src/components/toolbar/Toolbar.tsx:293-319` (ToolbarButton component), `:93-98` (input)
- WCAG criteria: 4.1.2 Name, Role, Value (Level A), 1.1.1 Non-text Content (Level A)

## Acceptance Criteria

- [ ] `ToolbarButton` renders `aria-label={title}` on the button element
- [ ] Toggle buttons render `aria-pressed={active}` 
- [ ] Report name input has `aria-label="レポート名"`
- [ ] Screen reader announces button names when focused

## Work Log

- 2026-04-06: Identified by technical-reviewer agent in UI/UX review (WCAG 4.1.2, 1.1.1)
