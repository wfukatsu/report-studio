---
status: pending
priority: p1
issue_id: "216"
tags: [code-review, performance, react, zustand, canvas]
dependencies: []
---

# `useBindingAnalysis` が毎ドラッグフレームで再実行 — `pages` セレクターが全要素ミューテーションで無効化される

## Problem Statement

`useBindingAnalysis` フックが `useReportStore((s) => s.definition.pages)` で `pages` 全体をサブスクライブ。
Immer は `moveElement`/`resizeElement` のたびに新しい `pages` 参照を生成するため、
ドラッグ中（60fps）に毎フレーム `useMemo` が再実行される。

1回の実行で全要素（100要素 × `matchAll` + `fieldExists`）を処理するため、パフォーマンスに直接影響する。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:46-47`

```typescript
const pages = useReportStore((s) => s.definition.pages)    // ← 全ページ参照
const dataSources = useReportStore((s) => s.definition.dataSources)  // ← 全データソース

return useMemo(() => {
  // 全要素を走査 + matchAll + fieldExists
}, [pages, dataSources])
```

**測定可能な影響**: 5ページ×100要素×60fps = 6000回/秒の不要な分析実行。
**既知パターン**: `docs/solutions/performance-issues/react-canvas-rerender-optimization.md` で同様の問題が文書化済み。

## Proposed Solutions

### Option A: バインディングフィンガープリントセレクター（推奨）

```typescript
// バインディング関連フィールドのみを含む安定した文字列を生成
const bindingFingerprint = useReportStore((s) => {
  return s.definition.pages
    .flatMap((p) => p.sections.flatMap((sec) => sec.elements))
    .map((el) => {
      if (el.type === 'text') return `${el.id}:t:${el.content ?? ''}`
      if (el.type === 'dataField') return `${el.id}:df:${el.fieldKey ?? ''}`
      if (el.type === 'checkbox' || el.type === 'eraSelect') return `${el.id}:${el.type}:${el.dataSource ?? ''}`
      if (el.type === 'formTable') return el.rows.flatMap(r => r.cells.map(c => `${c.id}:${c.fieldKey ?? ''}`)).join(',')
      return `${el.id}:${el.type}`
    })
    .join('|')
})
// フィンガープリントが変わった時のみ分析を再実行
```

**Pros:** ドラッグ中はフィンガープリントが変わらないため再実行なし、位置・サイズ変更に完全免疫
**Cons:** フィンガープリント生成自体が O(n) — ただしこれはセレクター内で毎フレーム実行（安価）
**Effort:** Small | **Risk:** Low

### Option B: `useShallow` を使用

```typescript
import { useShallow } from 'zustand/shallow'
// ただし immer が section 参照も置き換えるため完全解決にはならない
```

**Pros:** 実装が単純
**Cons:** immer はセクションレベルの参照も置き換えるため、要素位置変更でも再実行が発生する可能性
**Effort:** Trivial | **Risk:** Medium

## Recommended Action

**Option A** を採用。フィンガープリントは `src/hooks/useBindingAnalysis.ts` のモジュール内ヘルパー関数として実装。

## Technical Details

**Affected file:** `src/hooks/useBindingAnalysis.ts:46-52`

## Acceptance Criteria

- [ ] 要素ドラッグ中（`moveElement` 連続呼び出し）で `useBindingAnalysis` の分析処理が再実行されない
- [ ] 要素の `fieldKey` 変更時は再実行される
- [ ] React DevTools Profiler で確認: ドラッグ中に `DataBindingOverviewPanel` のレンダリングが発生しない

## Work Log

- 2026-04-12: Discovered by Performance reviewer (P1) and Architecture reviewer (P1)
