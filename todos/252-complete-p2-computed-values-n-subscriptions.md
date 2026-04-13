---
status: pending
priority: p2
issue_id: "252"
tags: [code-review, performance, zustand, rendering]
dependencies: [249]
---

# ElementRenderer が computedValues を要素ごとに購読 — N個の並列再レンダリング

## Problem Statement

`ElementRenderer` が `computedValues` をコンポーネントごとに購読しており、100要素のキャンバスでは `setComputedResults` の度に100個の並列再レンダリングが発生する。ファイル内のコメントもこれを P2 タスクとして認識しているが未解決。

## Findings

**Location:** `src/components/canvas/ElementRenderer.tsx:64`

```ts
const computedValues = useReportStore(useShallow((s) => s.computedValues))
const defaultTextStyle = useReportStore(useShallow((s) => s.definition.defaultTextStyle))
```

- 800ms ごとの計算ルール評価APIレスポンスで100要素が同時再レンダリング
- 各要素で `mergedData` と `isConditionVisible` の useMemo が実行される
- ファイル内コメント: "P2 task: lift computedValues subscription..."

## Proposed Solutions

### Solution A: computedValues を SectionContainer にリフト（推奨）

`SectionContainer` か `ReportCanvas` で一度だけ購読し、prop として渡す:

```ts
// SectionContainer.tsx
const computedValues = useReportStore(useShallow((s) => s.computedValues))
// → ElementRenderer に prop として渡す
```

1つの購読が100個を置き換える。

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] `ElementRenderer` 内の `computedValues` 購読が削除される
- [ ] `SectionContainer` か `ReportCanvas` レベルで一度のみ購読
- [ ] APIレスポンス受信時のレンダリング回数が1回に削減（React DevTools で確認）

## Work Log

- 2026-04-13: performance-oracle による code-review で発見
