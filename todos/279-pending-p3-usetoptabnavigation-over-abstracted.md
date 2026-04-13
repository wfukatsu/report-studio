---
status: pending
priority: p3
issue_id: "279"
tags: [code-review, simplicity, yagni, refactor]
dependencies: []
---

# useTopTabNavigation フックが 3 タブのリストに対して過剰な抽象化

## Problem Statement

`useTopTabNavigation.ts`（89 行）は唯一の消費者である `TopNavigation.tsx`（46 行）のためだけに存在する。再利用予定もなく（`DataManagementTab` や `TemplateManagementTab` のサブナビゲーションでは使用されていない）、抽象化のために追加されたファイル・型・インポートが機能より多い。

フックをインライン化することで 89 行のファイルと `TabProps` インターフェースが削除できる。

## Findings

- **Agent**: code-simplicity-reviewer (MEDIUM / YAGNI)
- **Location**: `src/hooks/useTopTabNavigation.ts`

## Proposed Solutions

### Option A: フックを TopNavigation にインライン化
- `useTopTabNavigation.ts` を削除
- キーボードハンドラと ref Map を `TopNavigation.tsx` 内に直接記述（+25 行程度）
- **Pros**: ファイル削減、依存関係削減
- **Cons**: `TopNavigation.tsx` が少し長くなる
- **Effort**: Small
- **Risk**: 低（ARIA 動作は変わらない）

### Option B: 現状維持（将来の再利用に備える）
- 2 つ目の tablist が追加された時点でメリットが生まれる
- **Effort**: なし
- **Risk**: なし

## Acceptance Criteria

- [ ] Option A: `useTopTabNavigation.ts` が削除され、`TopNavigation.tsx` がフルセルフコンテインド
- [ ] Option B: 再利用ケースが発生するまで保留

## Work Log

- 2026-04-13: code-simplicity-reviewer で発見
