---
status: complete
priority: p1
issue_id: "070"
tags: [ux-review, accessibility, a11y, wcag, keyboard]
dependencies: []
---

## Problem

The left sidebar tablist has role="tablist" and role="tab" on each button, but no arrow-key navigation. Per WAI-ARIA Authoring Practices, tablists must support Left/Right arrow keys to move focus between tabs. Currently, pressing arrow keys while focused on a tab has no effect. WCAG 2.1.1 violation.

## Findings

- `src/App.tsx:147-166` — tablist and tab roles are set, but no onKeyDown handler
- Inactive tabs have tabIndex omitted (defaults to 0), which means all tabs are in the tab order — this is wrong for ARIA tablist pattern
- Only the active tab should have tabIndex=0, others tabIndex=-1 (roving tabindex pattern)

## Solutions

### A) Add onKeyDown handler on the tablist div (Recommended)

```tsx
onKeyDown={(e) => {
  const tabs = LEFT_TABS.map(t => t.id)
  const currentIndex = tabs.indexOf(leftTab)
  if (e.key === 'ArrowRight') { e.preventDefault(); setLeftTab(tabs[(currentIndex + 1) % tabs.length]) }
  if (e.key === 'ArrowLeft')  { e.preventDefault(); setLeftTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length]) }
  if (e.key === 'Home')       { e.preventDefault(); setLeftTab(tabs[0]) }
  if (e.key === 'End')        { e.preventDefault(); setLeftTab(tabs[tabs.length - 1]) }
}}
```

Also set `tabIndex: tab.id === leftTab ? 0 : -1` on each tab button.

## Files

- `src/App.tsx:147-166`

## WCAG

- 2.1.1 Keyboard (Level A)

## Acceptance Criteria

- [ ] Arrow keys move focus between tabs
- [ ] Only active tab has tabIndex=0
- [ ] Home/End jump to first/last tab
