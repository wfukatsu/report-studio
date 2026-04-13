---
status: pending
priority: p2
issue_id: "266"
tags: [code-review, architecture, store, refactoring]
dependencies: []
---

# layoutSlice が816行のゴッドスライス — 8つの責務を持つ

## Problem Statement

`layoutSlice.ts` は816行で、他の10スライスの平均の4倍の大きさ。8つの異なる責務を1ファイルに持ち、テストしづらく変更の影響範囲が大きい。

## Findings

`src/store/layoutSlice.ts`（816行）が担う責務:
1. レポート定義・メタデータ管理
2. ページ CRUD
3. 要素 CRUD（add/update/remove/duplicate）
4. 要素ジオメトリ（move/resize）
5. 選択状態管理
6. クリップボード操作（copy/cut/paste）
7. レイヤーグループ管理
8. マスターヘッダー/フッター管理

## Proposed Solutions

### Solution A: クリップボードとレイヤーを分離（最小リファクタリング）

```
layoutSlice.ts    → 要素CRUD + ページCRUD（400行以下に）
clipboardSlice.ts → copyElements, cutElements, pasteElements
layerSlice.ts     → addLayerGroup, removeLayerGroup, groupSelectedElements, reorderElements
```

- Effort: Medium
- Risk: Low（既存 export はそのまま、実装を分割するだけ）

## Acceptance Criteria

- [ ] layoutSlice.ts が 500 行以下
- [ ] 各スライスが単一責務
- [ ] 既存のストア API（useReportStore から各アクション参照）が変わらない

## Work Log

- 2026-04-13: pattern-recognition-specialist による code-review で発見
