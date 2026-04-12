---
status: pending
priority: p3
issue_id: "244"
tags: [code-review, react, data-browser, typescript]
dependencies: []
---

# DataGrid: useEffect の deps に object を使用、eslint disable で回避

## Problem Statement

`DataGrid.tsx` の `useEffect` が `[source, currentPage]` に依存しているが、`source` はZustandから来るオブジェクトで参照の安定性が保証されない。immerがdraftの変更で新しいオブジェクトを生成する場合、同一の論理的ソースでもエフェクトが過剰に実行される。`// eslint-disable-line react-hooks/exhaustive-deps` で回避しているが、本質的な安定化が望ましい。

## Findings

```tsx
// DataGrid.tsx
useEffect(() => {
  ...
}, [source, currentPage])  // eslint-disable-line react-hooks/exhaustive-deps
```

`source` がオブジェクトのため、immerがdraft更新で新しいオブジェクトリファレンスを生成すると、変化なしでエフェクトが再実行される。

## Proposed Solutions

### Option A: `sourceKey` 文字列でuseEffectを依存（推奨）

```tsx
const sourceKey = source.kind === 'scalardb-table'
  ? `${source.kind}:${source.namespace}.${source.table}`
  : source.kind === 'form-responses'
  ? `${source.kind}:${source.templateId}`
  : source.kind

useEffect(() => {
  ...
}, [sourceKey, currentPage])  // eslint disable 不要
```

- Pros: 安定した依存、eslint disable不要、意図が明確
- Cons: キーが変わった場合の検知が文字列比較
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] `useEffect` の `deps` が安定した文字列 `sourceKey` を使用
- [ ] `eslint-disable` コメントが削除される

## Work Log

- 2026-04-12: code-review (PR #45) にて kieran-typescript-reviewer が発見
