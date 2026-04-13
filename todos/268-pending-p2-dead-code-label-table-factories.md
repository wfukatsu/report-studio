---
status: pending
priority: p2
issue_id: "268"
tags: [code-review, dead-code, cleanup]
dependencies: []
---

# label/table 要素のファクトリとディレクトリが dead code

## Problem Statement

`label` → `text`、`table` → `formTable` のマイグレーションが完了しているが、古い要素のファクトリ関数・ディレクトリが残存しており、コードベースの混乱を招いている。

## Findings

**label（廃止済み）:**
- `src/lib/elementFactories.ts`: `createLabelElement()` が存在（パレットからは削除済み）
- `src/elements/label/Renderer.tsx` と `PropertiesPanel.tsx` が存在
- `src/elements/label/` ディレクトリ全体が dead code

**table（廃止済み）:**
- `src/lib/elementFactories.ts`: `createTableElement()` が存在
- `src/elements/table/Renderer.tsx` と `PropertiesPanel.tsx` が存在
- `src/elements/table/` ディレクトリ全体が dead code

両者ともパレットから削除済みで新規作成不可。load-time migration が存在し、既存データは自動変換される。

## Proposed Solutions

### Solution A: dead code を削除

1. `elementFactories.ts` から `createLabelElement`、`createTableElement` を削除
2. `src/elements/label/`、`src/elements/table/` ディレクトリを削除
3. `ElementType` union から `'label'`、`'table'` を削除（後方互換性のため migration.ts は維持）
4. `ElementRenderer.tsx` と `PropertiesPanel.tsx` の safety-net ブランチを削除

- Effort: Small
- Risk: Low（migration.ts が既存データを変換するため）

## Acceptance Criteria

- [ ] `elementFactories.ts` に `createLabelElement` / `createTableElement` が存在しない
- [ ] `src/elements/label/` / `src/elements/table/` ディレクトリが存在しない
- [ ] `migration.ts` の変換ロジックは維持されている

## Work Log

- 2026-04-13: pattern-recognition-specialist による code-review で発見
