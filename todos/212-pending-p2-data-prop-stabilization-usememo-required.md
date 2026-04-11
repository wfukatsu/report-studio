---
status: pending
priority: p2
issue_id: "212"
tags: [code-review, performance, react, canvas, data-binding-phase2]
dependencies: []
---

# `buildFlatDataFromResolved` を `useMemo` 外で呼ぶと 50-100 要素が全て再レンダリング

## Problem Statement

`livePreviewData` が更新されるたびに新しいオブジェクト参照が生成される。
`ReportCanvas` が `const data = dataOverride ?? livePreviewData ?? mergedSampleData` として渡すと、
`SectionContainer` の `memo()` が参照等価チェックで失敗し、全 50-100 要素が再レンダリングされる。

`buildFlatDataFromResolved` がコンポーネント本体に直接書かれると毎レンダリングで実行される。

## Findings

**Performance reviewer の分析:**
> "livePreviewData が新オブジェクト参照として更新されるたびに SectionContainer の memo が失敗する。
> buildFlatDataFromResolved は純粋関数として useMemo にラップされなければならない。"

**Existing pattern**: `usePreviewData` フックが `useMemo(() => mergePreviewData(dataSources), [dataSources])` で安定した参照を提供。

## Proposed Solution

```typescript
// DataBindingOverviewPanel.tsx またはカスタムフック
const stableLiveData = useMemo(
  () => livePreviewData
    ? buildFlatDataFromResolved(livePreviewData, definition.schema)
    : null,
  [livePreviewData, definition.schema]  // livePreviewData は immer で同一内容なら同一参照
)

// ReportCanvas の data prop へ
const data = dataOverride ?? stableLiveData ?? mergedSampleData
```

**`buildFlatDataFromResolved` は純粋関数として `src/lib/previewDataTransform.ts` に配置:**
- 引数: `resolved`, `schema`
- 副作用なし
- テスト可能
- `useMemo` で安全に使用可能

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `buildFlatDataFromResolved` が `src/lib/previewDataTransform.ts` の export された純粋関数
- [ ] `ReportCanvas` に渡す `data` が `useMemo` でラップされている
- [ ] プレビューデータ更新時に無関係な選択変更・ズーム変更で `useDataResolver` が再実行されない
- [ ] ユニットテスト: 同じ入力 → 同じ出力

## Work Log

- 2026-04-12: Discovered by Performance reviewer (P1 memo cascade) and Architecture reviewer
