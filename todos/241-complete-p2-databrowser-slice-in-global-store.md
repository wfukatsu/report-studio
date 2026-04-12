---
status: pending
priority: p2
issue_id: "241"
tags: [code-review, architecture, data-browser, zustand]
dependencies: []
---

# dataBrowserSlice が helpless report editor のグローバルストアに混在

## Problem Statement

`dataBrowserSlice` は帳票エディターのグローバル `reportStore` に追加されているが、データブラウザはエディターと完全に独立した関心事（共有読み書きなし）。これによりエディター内のすべての `useReportStore` サブスクライバーが、データブラウザの状態変化（検索クエリ入力など）で無駄な再レンダリングを起こす可能性がある。

## Findings

```ts
// src/store/index.ts — 帳票エディターストアに15フィールドを追加
const dataBrowser = createDataBrowserSlice(...a)
return {
  ...layout, ...rules, ...history, ...ui, ...computed,
  ...schema, ...variants, ...responses, ...auth, ...tenant,
  ...product,
  ...dataBrowser,  // ← エディターと無関係
}
```

- `StoreState` 型が15個の `dataBrowser*` フィールドで肥大化
- `/data-browser` ページを開いていないときでも、`reportStore` の初期状態にデータブラウザの空Mapが含まれる
- `useReportStore((s) => s.dataBrowserSearchQuery)` の変化が `useReportStore` を使う他コンポーネントの再レンダリングトリガーになりうる（セレクターの精度によるが）

## Proposed Solutions

### Option A: 独立した `useDataBrowserStore` を作成（推奨）

```ts
// src/store/dataBrowserStore.ts — 新規ファイル
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createDataBrowserSlice } from './dataBrowserSlice'
import type { DataBrowserSliceState } from './dataBrowserSlice'

export const useDataBrowserStore = create<DataBrowserSliceState>()(
  immer(createDataBrowserSlice)
)
```

`DataBrowserPage.tsx` と `DataGrid.tsx` が `useDataBrowserStore` を使うように変更。`StoreState` から `dataBrowser*` フィールドを削除。

- Pros: 関心分離、エディターへの影響なし、型がシンプル
- Cons: 一時的な参照（`useReportStore` → `useDataBrowserStore`の変更）
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] `dataBrowserSlice` が `reportStore` から分離され独立した `useDataBrowserStore` として定義される
- [ ] `DataBrowserPage`, `DataGrid`, `DataSourceTree` が `useDataBrowserStore` を使用
- [ ] `StoreState` から `dataBrowser*` フィールドが削除される
- [ ] フロントエンドビルド通過

## Work Log

- 2026-04-12: code-review (PR #45) にて architecture-strategist が発見
