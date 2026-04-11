---
status: complete
priority: p3
issue_id: "229"
tags: [code-review, performance, react, zustand]
dependencies: ["226"]
---

# `bindingFingerprint` が Zustand セレクター内で毎ドラッグフレーム O(n) 実行される

## Problem Statement

`bindingFingerprint()` は Zustand セレクター内でインライン呼び出しされており、
ストアの全ての更新（ドラッグ中の 60fps を含む）のたびに実行される。

関数は全ページ → 全要素 → 全セルを走査して文字列を構築するため O(n)。
ドラッグ中は毎フレーム実行されるが、結果文字列は変わらない（位置/サイズを含まない）。

これにより Zustand が再レンダリングをブロックできても、selector の実行コストは毎フレーム払われる。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:91`

```typescript
const pageFingerprint = useReportStore(
  (s) => bindingFingerprint(s.definition.pages)  // ← 60fps で O(n) 実行
)
```

ただし todo #226 の修正（`useLayoutEffect` パターン）を適用すれば、
`useReportStore` subscriptions 自体が削減されるため、このコストも下がる。

## Proposed Solution (todo #226 完了後)

```typescript
// pages ref を使って fingerprint を useMemo で計算
// → Zustand selector の O(n) 実行を避ける
const pages = useReportStore((s) => s.definition.pages)  // ref sync のため残す
const pageFingerprint = useMemo(
  () => bindingFingerprint(pages),
  [pages]  // pages ref が変わったときのみ再計算（依然ドラッグ中は毎フレームだが...）
)
```

ただし `useMemo` でも `pages` ref が毎ドラッグフレームで変わるため、
根本解決は todo #226 の `useLayoutEffect` パターン（pages を dep から外す）。

**Effort:** Small | **Risk:** Low (todo #226 の後に対応)

## Acceptance Criteria

- [ ] ドラッグ中に `bindingFingerprint` が実行される回数が削減される
- [ ] (todo #226 完了後) 実質的にドラッグ中は実行されない

## Work Log

- 2026-04-12: Discovered by Performance reviewer (P3) and Architecture reviewer during PR #34 review
