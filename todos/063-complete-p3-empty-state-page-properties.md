---
status: pending
priority: p3
issue_id: "063"
tags: [ux-review, ux, empty-state, page-settings]
dependencies: []
---

# Empty State Page Properties

## Problem

When no element is selected, the right sidebar shows only "要素を選択するとプロパティが表示されます。" — wasting the entire panel. Other design tools use this space to show page-level settings.

## Findings

`src/components/sidebar/PropertiesPanel.tsx:99-101` — empty state is a single sentence; page-level properties (size, orientation, margins, background) have no dedicated UI; users must go to separate settings to change page properties.

## Solutions

### A) Show page properties in empty state (Recommended)

Paper size (A4/A3/etc.), orientation (縦/横), page margins, background color.

### B) Add a dedicated "ページ設定" button

Opens a modal — empty state just hints "ページ設定はこちら".

## Recommended

Option A — makes the right sidebar always useful.

## Files

- `src/components/sidebar/PropertiesPanel.tsx`
