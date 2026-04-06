---
status: pending
priority: p1
issue_id: "049"
tags: [ux-review, accessibility, a11y, wcag]
dependencies: []
---

## Problem Statement

The left sidebar tab navigation uses plain `<button>` elements with no ARIA roles. Screen readers cannot convey that these are tabs or which one is active, violating WCAG 4.1.2 (Name, Role, Value).

## Findings

- `src/App.tsx:109-123`: Tab container `<div className="flex border-b">` has no `role="tablist"`
- Each tab button has no `role="tab"`, no `aria-selected`, no `aria-controls`
- Tab panel `<div className="flex-1 overflow-y-auto">` has no `role="tabpanel"`, no `aria-labelledby`
- Grep confirms zero ARIA attributes exist anywhere in the codebase

## Proposed Solutions

**A) Add ARIA roles directly (Recommended — minimal change)**
```tsx
<div role="tablist" aria-label="サイドバーナビゲーション" className="flex border-b overflow-x-auto shrink-0">
  {LEFT_TABS.map((tab) => (
    <button
      key={tab.id}
      role="tab"
      aria-selected={leftTab === tab.id}
      aria-controls={`tabpanel-${tab.id}`}
      id={`tab-${tab.id}`}
      onClick={() => setLeftTab(tab.id)}
      ...
    >
```
```tsx
<div
  role="tabpanel"
  id={`tabpanel-${leftTab}`}
  aria-labelledby={`tab-${leftTab}`}
  className="flex-1 overflow-y-auto"
>
```

**B) Use shadcn/ui Tabs component**
Replace the custom implementation with shadcn/ui `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, which includes proper ARIA out of the box.

## Recommended Action

Apply solution A for minimal diff, or B if refactoring the sidebar structure anyway.

## Technical Details

- **File:** `src/App.tsx:109-132`
- WCAG criterion: 4.1.2 Name, Role, Value (Level A)

## Acceptance Criteria

- [ ] Tab container has `role="tablist"`
- [ ] Each tab button has `role="tab"` and `aria-selected`
- [ ] Active tab panel has `role="tabpanel"` with matching `aria-labelledby`
- [ ] Screen reader announces "サイドバーナビゲーション タブリスト" and active tab name

## Work Log

- 2026-04-06: Identified by technical-reviewer agent in UI/UX review (WCAG 4.1.2)
