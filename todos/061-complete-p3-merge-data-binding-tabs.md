---
status: pending
priority: p3
issue_id: "061"
tags: [ux-review, ux, information-architecture]
dependencies: []
---

# Merge Data and Binding Tabs

## Problem

"データ" tab (import JSON data source) and "バインド" tab (edit preview field values) represent two steps of the same workflow but live in separate tabs. Users must tab-switch in the middle of a single workflow.

## Findings

`src/App.tsx:22-25` — "data" and "binding" are separate tabs; both relate to data; BindingPanel edits `testData` for preview while DataSourcePanel sets the design-time data source; conceptually related but split.

## Solutions

### A) Merge into single "データ" tab (Recommended)

DataSourcePanel at top (collapsible after data loaded), BindingPanel (renamed "プレビューデータ") below.

### B) Keep separate but add cross-tab navigation hint

"データを読み込んだ後、バインドタブで値を設定できます"

## Recommended

Option A.

## Files

- `src/App.tsx:18-25`
- Data/binding panels
