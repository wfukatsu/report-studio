---
status: pending
priority: p1
issue_id: "263"
tags: [code-review, architecture, duplication, ui-ux]
dependencies: []
---

# FONT_FAMILIES 定数が8ファイルに重複定義 — 正規版は _blocks/constants.ts

## Problem Statement

`FONT_FAMILIES` 配列が8ファイルに独立して定義されており、正規版（`_blocks/constants.ts`）と内容が食い違っている。フォントを追加・削除する際は8箇所を変更しなければならない。

## Findings

正規版（11フォント）: `src/elements/_blocks/constants.ts`

重複定義（フォント数が異なる）:
- `src/elements/currentDate/PropertiesPanel.tsx` — 7フォント
- `src/elements/pageNumber/PropertiesPanel.tsx` — 7フォント
- `src/elements/tenantCompanyName/PropertiesPanel.tsx` — 7フォント
- `src/elements/tenantCustom/PropertiesPanel.tsx` — 7フォント
- `src/elements/tenantAddress/PropertiesPanel.tsx` — 7フォント（インライン）
- `src/elements/tenantPhone/PropertiesPanel.tsx` — 7フォント（インライン）
- `src/elements/tenantRepresentative/PropertiesPanel.tsx` — 7フォント（インライン）
- `src/elements/label/PropertiesPanel.tsx` — 11フォント（正規版と同じだが独立コピー）

## Proposed Solutions

### Solution A: 全ファイルで _blocks/constants.ts を import（推奨）

```tsx
import { FONT_FAMILIES } from '@/elements/_blocks/constants'

// 各 PropertiesPanel で:
<SelectInput options={FONT_FAMILIES.map(f => ({ value: f, label: f }))} ... />
```

- Effort: Small（8ファイルの置き換え）
- Risk: Low

## Acceptance Criteria

- [ ] `FONT_FAMILIES` の定義が `_blocks/constants.ts` の1箇所のみ
- [ ] 全 PropertiesPanel が同じフォントリストを表示する

## Work Log

- 2026-04-13: pattern-recognition-specialist による code-review で発見（CRITICAL）
