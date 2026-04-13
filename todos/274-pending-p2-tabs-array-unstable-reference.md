---
status: pending
priority: p2
issue_id: "274"
tags: [code-review, performance, react, memoization]
dependencies: []
---

# useTopTabNavigation に渡す tabs 配列がレンダーごとに新しい参照を生成する

## Problem Statement

`TopNavigation.tsx` が `useTopTabNavigation` を呼ぶ際に `tabs: TABS.map((t) => t.id)` を渡している。`TABS.map(...)` はレンダーごとに新しい配列参照を返すため、フックの `handleKeyDown` と `getTabProps` の `useCallback` メモ化が実質的に無効化される。タブ切り替えのたびに 3 つの `onKeyDown` クロージャが新規生成される。

## Findings

- **Agent**: kieran-typescript-reviewer (CRITICAL-1), code-simplicity-reviewer, performance-oracle (HIGH)
- **Location**: `src/components/layout/TopNavigation.tsx` line 18, `src/hooks/useTopTabNavigation.ts` lines 33–86

## Proposed Solutions

### Option A: モジュールスコープの定数として切り出す（推奨）
```ts
// TopNavigation.tsx
const TAB_IDS = TABS.map((t) => t.id)  // モジュールスコープ、1回だけ生成

export function TopNavigation(...) {
  const { getTabProps } = useTopTabNavigation({
    tabs: TAB_IDS,  // 安定した参照
    ...
  })
}
```
- **Effort**: Small
- **Risk**: 低

### Option B: フック内でロジックをインライン化（簡素化も兼ねる）
- `useTopTabNavigation` フックを廃止し、`TopNavigation` にキーボードハンドラを直接記述
- code-simplicity-reviewer も同様の提案をしている
- **Effort**: Medium
- **Risk**: 中

## Acceptance Criteria

- [ ] `TopNavigation` のレンダー時に `TABS.map()` が毎回呼ばれない
- [ ] タブ切り替えで不要な `onKeyDown` クロージャが再生成されない

## Work Log

- 2026-04-13: kieran-typescript-reviewer、performance-oracle で発見
