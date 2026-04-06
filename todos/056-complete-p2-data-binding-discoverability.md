---
status: pending
priority: p2
issue_id: "056"
tags: [ux-review, ux, data-binding, discoverability]
dependencies: []
---

# Data Binding Discoverability

## Problem

Connecting data to elements requires manually typing field key strings with no autocomplete. Bound vs unbound elements look identical on canvas. The relationship between "データ" tab and "バインド" tab is unclear.

## Findings

- `src/elements/dataField/PropertiesPanel.tsx` — fieldKey is a plain text input with no suggestions
- `src/components/sidebar/BindingPanel.tsx` — shows fields from data source but doesn't cross-reference canvas elements
- No visual indicator on canvas for bound elements
- 2-step workflow: load data in "データ" tab, then edit in "バインド" tab

## Solutions

### A) Field key autocomplete

Show available field paths from loaded dataSource in a dropdown when typing in dataField PropertiesPanel.

### B) Binding indicator on canvas

Show binding indicator icon on bound elements in canvas (small chain-link icon).

### C) Merge tabs

Merge "データ" and "バインド" tabs (see todo 061).

## Recommendation

**A + B** for P2, **C** for P3.

## Files

- `src/elements/dataField/PropertiesPanel.tsx`
- `src/components/canvas/CanvasElement.tsx`
