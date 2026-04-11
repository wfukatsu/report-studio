---
status: complete
priority: p2
issue_id: "221"
tags: [code-review, performance, react, zustand]
dependencies: ["216"]
---

# `dataSources` サブスクリプションがフィールド値編集のたびに `useBindingAnalysis` を再実行

## Problem Statement

`useBindingAnalysis` が `dataSources` 全体をサブスクライブしているため、
ユーザーが `BindingPanel` でフィールド値を編集するたびに `useMemo` が再実行される。
分析はフィールドキーの**存在**だけを確認するのに、値の変更でも再実行されてしまう。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:47`

```typescript
const dataSources = useReportStore((s) => s.definition.dataSources)
// → dataSources[0].fields の値が変わると dataSources 参照が変わる → useMemo 再実行
```

分析に必要なのは「どのフィールドキーが存在するか」のみ。値は不要。

## Proposed Solution

```typescript
// フィールドキーセットのフィンガープリントのみサブスクライブ
const fieldKeySet = useReportStore((s) => {
  const fields = s.definition.dataSources[0]?.fields ?? {}
  return Object.keys(fields).sort().join(',')  // キーセットが変わった時のみ再計算
})
const hasDataSource = useReportStore((s) => !!s.definition.dataSources[0])
```

これにより、フィールド値の編集では `useMemo` が再実行されず、
フィールドキーの追加/削除時のみ再実行される。

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `BindingPanel` でフィールド値を編集しても `DataBindingOverviewPanel` が再レンダリングされない
- [ ] フィールドキーを追加/削除すると `errorElements` が更新される

## Work Log

- 2026-04-12: Discovered by Performance reviewer (P2)
