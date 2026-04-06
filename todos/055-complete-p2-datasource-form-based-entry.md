---
status: pending
priority: p2
issue_id: "055"
tags: [ux-review, ux, data, usability]
dependencies: []
---

# DataSource Form-Based Entry

## Problem

DataSourcePanel requires users to paste raw JSON. Business users and 帳票作成者 are not developers and don't know JSON syntax. No CSV import, no field editor.

## Findings

- `src/components/sidebar/DataSourcePanel.tsx:49-66` — textarea expects raw JSON
- Error messages ("JSONはオブジェクトである必要があります") are technical
- No example data button
- No alternative input method

## Solutions

### A) Key-value table editor

Add simple key-value table editor as alternative to raw JSON (toggleable "高度な入力" for JSON).

### B) Sample data generator

Add "サンプルデータを生成" button that creates example data matching field keys used in the current template.

### C) CSV paste support

Add CSV paste support in `parseDataSourceJSON`.

## Recommendation

**A + B** together.

## Files

- `src/components/sidebar/DataSourcePanel.tsx`
- `src/lib/dataSourceUtils.ts`
