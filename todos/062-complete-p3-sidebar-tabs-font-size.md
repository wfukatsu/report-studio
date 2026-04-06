---
status: pending
priority: p3
issue_id: "062"
tags: [ux-review, ux, typography, sidebar]
dependencies: []
---

# Sidebar Tabs Font Size

## Problem

Left sidebar tabs use `text-[10px]` (7.5pt) which is below the 11px minimum recommended for UI text. With 6 tabs in 208px, labels overflow and get clipped. "データ" and "バインド" tabs are partially cut off on standard displays.

## Findings

`src/App.tsx:115` — `text-[10px]` on tab buttons; sidebar is `w-52` (208px) for 6 tabs; tabs overflow horizontally and are scrollable (`overflow-x-auto`) but users don't know this.

## Solutions

### A) Increase to `text-xs` (12px) and reduce to 4-5 primary tabs (Recommended)

Merge data/binding per todo 061 to reduce tab count, giving more room per tab.

### B) Switch to vertical icon+label tabs (VS Code style)

Reduces tab bar to icon column, shows label on hover or always.

### C) Use abbreviated labels

"要素" "層" "頁" "型" "データ" — but this sacrifices clarity.

## Recommended

Option A combined with todo 061 (fewer tabs = more room).

## Files

- `src/App.tsx:108-132`
