---
status: complete
priority: p2
issue_id: "073"
tags: [ux-review, i18n, consistency]
dependencies: []
---

## Problem

PagePanel still has English labels ("Pages", "Add page", "Remove page") despite all other panels being translated to Japanese in the P1 round.

## Findings

- `src/components/sidebar/PagePanel.tsx:17-18,25` — "Pages" heading, "Add page" button title, "Remove page" button title are all English

## Solutions

Replace with Japanese: "ページ一覧", "ページを追加", "ページを削除"

## Files

- `src/components/sidebar/PagePanel.tsx`

## Acceptance Criteria

- [ ] All PagePanel labels in Japanese
