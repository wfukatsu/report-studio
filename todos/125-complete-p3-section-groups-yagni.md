---
status: complete
priority: p3
issue_id: "125"
tags: [code-review, yagni, dead-code]
---

# `sectionGroups` パラメータが将来用の YAGNI

## Problem Statement

`LayersPanel.tsx` の `SectionDndContainer` 内で `sectionGroups` を `useMemo` で計算し、
`renderGroupedElements` にパラメータとして渡しているが、
関数内で `void sectionGroups` としてサプレスしており実際には使用されていない。
コメントに「将来のグループ追加ボタン用」と明記された YAGNI。

## Proposed Solution

`sectionGroups` を `SectionDndContainer`・`SectionDndContainerProps`・
`renderGroupedElements` のパラメータリストから削除する。
将来ボタンを追加するときに改めて実装する。

## Technical Details

- **Files**: `src/components/sidebar/LayersPanel.tsx`
- **Lines**: ~443–446（useMemo）、~497（引数）、~558・580–581（パラメータと void）

## Acceptance Criteria

- [x] `sectionGroups` に関連するコード（約12行）が削除される
- [x] TSコンパイルエラーなし
- [x] 既存テスト全通過

## Work Log

- 2026-04-06: シンプリシティエージェントが指摘。
