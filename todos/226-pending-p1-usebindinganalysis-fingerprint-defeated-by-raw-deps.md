---
status: pending
priority: p1
issue_id: "226"
tags: [code-review, performance, react, zustand, regression]
dependencies: []
---

# `useBindingAnalysis` のフィンガープリント最適化が `pages`/`dataSources` の raw deps によって完全に無効化されている

## Problem Statement

PR #34 で導入したフィンガープリント最適化（ドラッグ中の再実行防止）は、
`useMemo` の deps 配列に `pages` と `dataSources` の raw 参照が含まれているため、
実際には何も最適化されていない。

immer は `moveElement`/`resizeElement` のたびに `pages` の新しい参照を生成するため、
ドラッグ中（60fps）毎フレームで `useMemo` が再実行される。
コメントの意図と実装が完全に矛盾している。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:103-104, 205`

```typescript
// ← これらの subscriptions が問題
const pages = useReportStore((s) => s.definition.pages)        // drag で毎回変わる
const dataSources = useReportStore((s) => s.definition.dataSources)

return useMemo(() => {
  // ...
}, [pageFingerprint, fieldKeyFingerprint, hasDataSource, pages, dataSources])
//                                                              ^^^^^ ^^^^^^^^^^^
// ↑ pages が deps にあるため fingerprint が stable でも useMemo は毎フレーム再実行
```

**4エージェント全員が独立して同じ問題を発見。**

**証拠**: immer は `moveElement` で `s.definition.pages` に新参照を生成 → Zustand が `pages` サブスクリプションを発火 → `useMemo` が `pages` dep 変更を検出 → 全要素を再走査（regex, fieldExists）

## Proposed Solutions

### Option A: `useRef` + `useLayoutEffect` パターン（推奨）

```typescript
export function useBindingAnalysis(): BindingAnalysis {
  const pageFingerprint = useReportStore((s) => bindingFingerprint(s.definition.pages))
  const hasDataSource = useReportStore((s) => s.definition.dataSources.length > 0)
  const fieldKeyFingerprint = useReportStore((s) => {
    const fields = s.definition.dataSources[0]?.fields ?? {}
    return Object.keys(fields as Record<string, unknown>).sort().join(',')
  })

  // Raw values via refs — kept current after every render, no dep tracking needed
  const pages = useReportStore((s) => s.definition.pages)
  const dataSources = useReportStore((s) => s.definition.dataSources)
  const pagesRef = useRef(pages)
  const dataSourcesRef = useRef(dataSources)

  // Sync refs after every render (before paint) — ensures memo sees current values
  useLayoutEffect(() => {
    pagesRef.current = pages
    dataSourcesRef.current = dataSources
  })

  return useMemo(() => {
    const pages = pagesRef.current        // 安全: layoutEffect で同期済み
    const dataSources = dataSourcesRef.current
    // ... 残りの traversal ロジックは変更なし ...
    return { hasDataSource, unboundElements, fieldMappings, missingInSampleElements }
    // fingerprint のみ dep に含める（raw refs は除外）
  }, [pageFingerprint, fieldKeyFingerprint, hasDataSource])
}
```

**Pros:** ドラッグ中の再実行がゼロ、stale closure なし（useLayoutEffect で同期）
**Cons:** useRef パターンが若干複雑
**Effort:** Small | **Risk:** Low

### Option B: `pages` と `dataSources` を deps から削除し `useReportStore.getState()` で読む

```typescript
return useMemo(() => {
  const { pages, dataSources } = useReportStore.getState().definition
  // ...
}, [pageFingerprint, fieldKeyFingerprint, hasDataSource])
```

**Pros:** シンプル、useRef 不要
**Cons:** 若干の stale closure リスク（レンダー間のタイミングによって古い値を読む可能性）
**Effort:** Trivial | **Risk:** Low-Medium

### Option C: `eslint-disable` を外して deps を fingerprint のみにする

Option B の最小版。実際 React は `useMemo` 内で参照する全変数を deps にすることを強く推奨するため、lint ルールを suppress する正当な理由が必要。

## Recommended Action

**Option A** を採用。`useLayoutEffect` パターンは React 公式が推奨する "always-sync-ref" パターンと同じ。

合わせて `eslint-disable-next-line react-hooks/exhaustive-deps` コメントを正しく説明するコメントに更新する。

## Technical Details

**Affected file:** `src/hooks/useBindingAnalysis.ts:103-104, 205`

**必要な imports 追加:**
```typescript
import { useMemo, useRef, useLayoutEffect } from 'react'
```

## Acceptance Criteria

- [ ] `moveElement` を 60 回呼び出しても `useMemo` の traversal が再実行されない
- [ ] `fieldKey` を変更すると `useMemo` が再実行される
- [ ] formTable セルの `fieldKey` を変更すると `missingInSampleElements` が更新される
- [ ] React DevTools Profiler で確認: ドラッグ中 `DataBindingOverviewPanel` がレンダリングされない
- [ ] `eslint-disable-next-line` コメントが理由を説明している

## Work Log

- 2026-04-12: Discovered by PR #34 review — TypeScript, Performance, Architecture, Simplicity reviewers (4/4) independently confirmed
