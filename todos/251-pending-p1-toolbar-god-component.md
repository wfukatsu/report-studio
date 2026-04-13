---
status: complete
priority: p1
issue_id: "251"
tags: [code-review, architecture, performance, typescript]
dependencies: []
---

# Toolbar.tsx が1,230行のゴッドコンポーネント

## Problem Statement

`Toolbar.tsx` は1,230行を超え、42個のZustandストア購読、22個の `useState`、8個のドロップダウンメニュー、7個の非同期ハンドラ、全モーダルのレンダリングロジックを含む単一ファイルになっている。プロジェクト自身のファイルサイズガイドライン（800行上限）を50%以上超過しており、任意のストア変更時に1,230行全体の再レンダリングが発生する。

## Findings

**Location:** `src/components/toolbar/Toolbar.tsx`（1,230+ 行）

問題の内訳:
- 42個の個別Zustandストア購読
- 14個のモーダル表示ステート（`showOpenMenu`, `showSaveMenu`, `showZoomMenu`, `showAlignMenu`, `showZOrderMenu`, `showPreviewMenu`, `showDataModal`, `showVariantsModal`, `showManagerModal`, `showVariantDialog`, `showUpdateFromBuiltinConfirm`, `showSaveDialog`, `showServerSettings`, `showUserMenu`）
- 8箇所のトラッキングなし `setTimeout` エラークリア呼び出し
- `window.confirm()` の複数使用

**パフォーマンス影響:** `editorZoom` 変更（ドラッグ集中セッション中）がモーダル・ユーザーメニュー・クリップボードステートを含む全体の再評価をトリガーする。

## Proposed Solutions

### Solution A: モーダルステートとハンドラの抽出（推奨）

```
Toolbar.tsx (< 400行)
├── hooks/useToolbarModals.ts  — 全モーダル open/close ステート
├── hooks/useToolbarExport.ts  — エクスポートロジック + setTimeout管理
├── ToolbarFileMenu.tsx        — ファイル操作ドロップダウン
├── ToolbarExportMenu.tsx      — エクスポート/プレビュー系
└── ToolbarEditMenu.tsx        — 配置/Z順/グリッド系
```

- Pros: 各ファイルが < 200行、独立テスト可能
- Cons: 大きなリファクタリング、慎重なステート分割が必要
- Effort: Large
- Risk: Medium

### Solution B: モーダルステートのみ外出し（最小変更）

`useToolbarModals` フックにモーダル14個のステートを集約し、Toolbar.tsx に import して使う。

- Pros: 最小変更で見通し改善
- Cons: 根本的な再レンダリング問題は解決しない
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] `Toolbar.tsx` が 800行以下
- [ ] モーダル関連ステートが独立したフックまたはコンポーネントに分離
- [ ] エクスポートロジックが独立したフックに分離
- [ ] `editorZoom` 変更時にモーダルコンポーネントが再レンダリングされない

## Work Log

- 2026-04-13: TypeScript review + Architecture review で発見（CRITICAL）
