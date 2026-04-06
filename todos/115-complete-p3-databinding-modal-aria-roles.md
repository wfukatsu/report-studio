---
status: complete
priority: p3
issue_id: "115"
tags: [code-review, accessibility]
dependencies: []
---

## Problem Statement

`DataBindingModal.tsx` implements a custom 3-tab interface (データソース / 式・計算 / バリデーション) using `<button>` elements for tab triggers, but is missing the required ARIA `role="tab"`, `role="tablist"`, and `role="tabpanel"` attributes. Screen readers announce the tab area as a list of plain buttons rather than a tab widget, and keyboard navigation does not follow the ARIA tab pattern (arrow keys to switch tabs).

## Findings

**File:** `src/components/modals/DataBindingModal.tsx`

Current tab trigger structure:

```tsx
<div className="flex border-b">
  {(['データソース', '式・計算', 'バリデーション'] as const).map((label, i) => (
    <button
      key={label}
      onClick={() => setActiveTab(i)}
      className={...}
    >
      {label}
    </button>
  ))}
</div>
```

Missing attributes:
- Container `<div>` needs `role="tablist"` and `aria-label="データバインディング設定"`
- Each `<button>` needs `role="tab"`, `aria-selected={activeTab === i}`, and `aria-controls="tab-panel-{i}"`
- Tab panel content `<div>` needs `role="tabpanel"`, `id="tab-panel-{i}"`, `aria-labelledby="tab-{i}"`

Additionally, ARIA tab pattern requires left/right arrow key navigation between tabs (currently requires Tab key to reach each button).

## Proposed Solutions

**A) Add ARIA attributes and arrow-key handler (Recommended, Small effort)**

```tsx
<div role="tablist" aria-label="データバインディング設定" className="flex border-b">
  {tabs.map((label, i) => (
    <button
      key={label}
      id={`tab-${i}`}
      role="tab"
      aria-selected={activeTab === i}
      aria-controls={`tabpanel-${i}`}
      onClick={() => setActiveTab(i)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setActiveTab((activeTab + 1) % tabs.length)
        if (e.key === 'ArrowLeft') setActiveTab((activeTab + tabs.length - 1) % tabs.length)
      }}
      tabIndex={activeTab === i ? 0 : -1}
    >
      {label}
    </button>
  ))}
</div>
<div
  role="tabpanel"
  id={`tabpanel-${activeTab}`}
  aria-labelledby={`tab-${activeTab}`}
>
  {/* active tab content */}
</div>
```

**B) Use a headless UI library (Radix `Tabs`)**

Already a project dependency. `@radix-ui/react-tabs` provides the full ARIA pattern out of the box. More reliable but requires restructuring the component.

## Recommended Action

Option A for quick fix; Option B if a headless UI refactor is planned.

## Technical Details

- **File**: `src/components/modals/DataBindingModal.tsx`
- The same pattern should be checked in any other custom tab UIs in the codebase

## Acceptance Criteria

- [ ] Tab container has `role="tablist"`
- [ ] Each tab button has `role="tab"` and `aria-selected`
- [ ] Tab panel has `role="tabpanel"` linked via `aria-controls`/`aria-labelledby`
- [ ] Arrow keys switch active tab
- [ ] Non-active tabs have `tabIndex={-1}` (roving tabindex)

## Work Log

- 2026-04-06: Identified by Accessibility reviewer and Agent-Native reviewer
