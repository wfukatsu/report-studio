---
status: pending
priority: p3
issue_id: "066"
tags: [ux-review, ux, terminology, 帳票]
dependencies: []
---

# Repeating Element Terminology

## Problem

"繰り返しバンド" and "繰り返しリスト" are report-engine jargon (from JasperReports/BIRT). Business users creating invoices think in terms of "明細行" (line items) or "一覧表" (list). The distinction between Band and List is also not self-evident.

## Findings

`src/components/sidebar/ElementPalette.tsx:77-87` — labels "繰り返しバンド" and "繰り返しリスト"; no tooltip description explaining what each does; category label "繰り返し要素" is also abstract.

## Solutions

### A) Add tooltip descriptions to palette items

- 繰り返しバンド: "データ行を表形式で繰り返し表示（例：請求書の明細行）"
- 繰り返しリスト: "データをカード・グリッド形式で表示（例：商品カタログ）"

### B) Rename

- 繰り返しバンド → "明細バンド（表形式）"
- 繰り返しリスト → "明細リスト（カード形式）"

## Recommended

Both A and B.

## Files

- `src/components/sidebar/ElementPalette.tsx:77-87`
