---
title: Accessibility — ARIA Roles, Keyboard Navigation & UX Safety Patterns
problem_type: ui_bug
component: App, Toolbar, CanvasElement, ContextMenu, DataSourcePanel
severity: p1
tags:
  - accessibility
  - aria
  - keyboard-navigation
  - wcag
  - tablist
  - context-menu
  - unsaved-changes
  - localization
date: 2026-04-06
resolved_todos:
  - 047 (translate English labels to Japanese)
  - 048 (template gallery confirm before replace)
  - 049 (sidebar tabs ARIA roles)
  - 050 (toolbar buttons accessible names)
  - 051 (canvas elements ARIA keyboard)
  - 069 (open file no unsaved warning)
  - 070 (tablist arrow key navigation)
  - 071 (context menu keyboard accessible)
  - 072 (unsaved changes visual indicator)
---

## Overview

Nine UX and accessibility issues fixed. Key themes:
1. ARIA roles and keyboard navigation for WCAG 2.1 Level A compliance
2. Data-loss prevention confirmation dialogs
3. Visual feedback for unsaved state
4. Japanese localization consistency

---

## Issue 1: English Labels in a Japanese-Targeted App

### Problem
The app targeted Japanese users but contained English labels throughout:
"Data Source", "Templates", "Fit Page", toolbar tooltips, etc.

### Fix
Direct string replacement across `DataSourcePanel`, `TemplateGallery`, `Toolbar`:
- `"Data Source"` → `"データソース"`
- `"Apply Data"` → `"データを適用"`
- `"Undo"` → `"元に戻す (⌘Z)"`
- `"Clear"` → `"クリア"`

All toolbar `title` attributes and button labels now use Japanese text.

---

## Issue 2: Template Replacement Without Confirmation

### Problem
Clicking any template in the gallery immediately replaced the entire report with no
warning. Undo did not work across `loadReport` calls — work was irreversibly lost.

### Fix
```typescript
// src/App.tsx
const handleTemplateChange = (definition: ReportDefinition) => {
  if (historyIndex > 0 && !confirm('未保存の変更があります。テンプレートを変更しますか？')) {
    return
  }
  loadReport(definition)
}
```

Same guard applied to "開く" file picker in `Toolbar.tsx`:
```typescript
const handleOpen = () => {
  if (hasUnsavedChanges && !confirm('未保存の変更があります。破棄してファイルを開きますか？')) {
    return
  }
  fileInputRef.current?.click()
}
```

`hasUnsavedChanges = historyIndex > 0`

---

## Issue 3: Sidebar Tabs — Missing ARIA Roles

### Problem
Left sidebar tabs used plain `<button>` elements with no `role="tab"`,
`aria-selected`, or `role="tablist"`. Screen readers could not convey tab structure
or active state. Violated WCAG 4.1.2.

### Fix
```tsx
// src/App.tsx
<div role="tablist" aria-label="サイドバーナビゲーション" onKeyDown={handleTabKeyDown}>
  {LEFT_TABS.map((tab) => (
    <button
      key={tab.id}
      role="tab"
      aria-selected={leftTab === tab.id}
      aria-controls={`tabpanel-${tab.id}`}
      id={`tab-${tab.id}`}
      tabIndex={leftTab === tab.id ? 0 : -1}   // roving tabindex
    >
      {tab.label}
    </button>
  ))}
</div>

<div
  role="tabpanel"
  id={`tabpanel-${leftTab}`}
  aria-labelledby={`tab-${leftTab}`}
>
  {/* panel content */}
</div>
```

**WCAG:** 4.1.2 Name, Role, Value (Level A)

---

## Issue 4: Arrow Key Navigation for Tablists

### Problem
Tabs had ARIA roles but no arrow key handlers. Per WAI-ARIA Authoring Practices,
tablists must support Left/Right arrow keys. Pressing arrows had no effect.

### Fix
```typescript
// src/App.tsx
const handleTabKeyDown = (e: React.KeyboardEvent) => {
  const tabs = LEFT_TABS.map((t) => t.id)
  const idx = tabs.indexOf(leftTab)
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    setLeftTab(tabs[(idx + 1) % tabs.length])
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    setLeftTab(tabs[(idx - 1 + tabs.length) % tabs.length])
  } else if (e.key === 'Home') {
    e.preventDefault()
    setLeftTab(tabs[0])
  } else if (e.key === 'End') {
    e.preventDefault()
    setLeftTab(tabs[tabs.length - 1])
  }
}
```

**WCAG:** 2.1.1 Keyboard (Level A)

---

## Issue 5: Toolbar Buttons — No Accessible Names

### Problem
Icon-only toolbar buttons used only `title` attribute. Screen readers do not reliably
announce `title`. Toggle buttons lacked `aria-pressed`. Report name input had no label.

### Fix
`ToolbarButton` component now sets:
```tsx
// src/components/toolbar/Toolbar.tsx
<button
  aria-label={title}
  aria-pressed={active}               // for toggle buttons
  aria-expanded={isOpen}              // for dropdown buttons
  aria-haspopup={isOpen !== undefined ? 'true' : undefined}
>
  {children}
</button>
```

Report name input:
```tsx
<input aria-label="レポート名" ... />
```

Unsaved indicator:
```tsx
<span role="status" aria-label="未保存の変更があります" ... />
```

**WCAG:** 4.1.2, 1.1.1 (Level A), 4.1.3 (Level AA)

---

## Issue 6: Canvas Elements — Not Keyboard Focusable

### Problem
Canvas element `<div>`s had no `role`, `tabIndex`, `aria-label`, or keyboard support.
Users could not reach them via Tab key; screen readers could not identify them.

### Fix
```tsx
// src/components/canvas/CanvasElement.tsx
<div
  role="button"
  tabIndex={readonly ? -1 : 0}
  aria-label={element.name ? `${element.name} (${element.type})` : element.type}
  aria-pressed={isSelected}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(element.id)
    }
  }}
>
```

**WCAG:** 4.1.2, 2.1.1, 2.4.3 (Level A)

---

## Issue 7: Context Menu — Not Keyboard Accessible

### Problem
Context menu opened on right-click but focus stayed on the canvas element. Keyboard
users could not reach menu items. No `role="menu"` / `role="menuitem"`, no arrow key
navigation, no focus trap.

### Fix
```tsx
// src/components/canvas/ContextMenu.tsx
<div role="menu" onKeyDown={handleMenuKeyDown}>
  {items.map((item) => (
    <button role="menuitem" tabIndex={-1} ...>
      {item.label}
    </button>
  ))}
</div>
```

Keyboard behavior:
- **Auto-focus**: `useEffect` + `requestAnimationFrame` focuses first enabled item on mount
- **ArrowDown/Up**: cycle focus, wrap around, skip disabled items
- **Home/End**: jump to first/last enabled item
- **Escape**: close menu

8 tests added in `src/components/canvas/ContextMenu.test.tsx` covering:
role announcement, auto-focus, arrow navigation, Home/End, Enter activation, disabled skip.

**WCAG:** 4.1.2, 2.1.1, 2.4.3 (Level A)

---

## Issue 8: Unsaved Changes Visual Indicator

### Problem
No visible indicator for unsaved state. Save button looked identical whether saved or not.
Users had no way to know if work needed saving before closing the browser.

### Fix
```tsx
// src/components/toolbar/Toolbar.tsx
const hasUnsavedChanges = historyIndex > 0

{hasUnsavedChanges && (
  <span
    className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
    title="未保存の変更があります"
    role="status"
    aria-label="未保存の変更があります"
  />
)}

<ToolbarButton active={hasUnsavedChanges} title="保存" ...>
  <Save className="w-4 h-4" />
</ToolbarButton>
```

Amber dot appears next to document name; save button highlights when unsaved.
Pattern matches professional apps (VS Code, Figma, Notion).

---

## Prevention Checklist

### ARIA Patterns
- [ ] Tab navigation: `role="tablist"` → `role="tab"` + `aria-selected` + `aria-controls` → `role="tabpanel"`
- [ ] Menus: `role="menu"` → `role="menuitem"`, auto-focus first item on open
- [ ] Icon buttons: `aria-label` (not just `title`)
- [ ] Toggle buttons: `aria-pressed`
- [ ] Dropdown buttons: `aria-expanded` + `aria-haspopup`
- [ ] Interactive non-button divs: `role="button"` + `tabIndex={0}` + keyboard handler

### Keyboard Navigation
- [ ] Tablists: ArrowLeft/Right cycle, Home/End jump, roving tabindex
- [ ] Menus: ArrowDown/Up cycle (skip disabled), Escape closes, Enter activates
- [ ] Canvas elements: Enter/Space selects

### Data Safety
- [ ] Destructive operations (load file, change template) check `historyIndex > 0` first
- [ ] Confirm dialog text explains what will be lost (Japanese)
- [ ] Visual unsaved indicator present (`role="status"` for screen reader announcement)
