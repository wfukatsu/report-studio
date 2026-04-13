---
status: pending
priority: p2
issue_id: "269"
tags: [code-review, architecture, data-flow, duplication]
dependencies: []
---

# データ優先度ロジックが ReportCanvas と Toolbar に重複

## Problem Statement

「外部オーバーライド > ScalarDB ライブデータ > サンプルJSONデータ」の優先度チェーンが `ReportCanvas.tsx` と `Toolbar.tsx` の2箇所に重複しており、手動での同期が必要。キャンバスが表示するデータとPDF出力のデータが食い違うリスクがある。

## Findings

`src/components/canvas/ReportCanvas.tsx:126`:
```ts
const data = dataOverride ?? stableLiveData ?? mergedSampleData ?? EMPTY_DATA
```

`src/components/toolbar/Toolbar.tsx:229`:
```ts
const exportData = livePreviewData ?? testData
```

優先度チェーンの実装が異なる（`dataOverride` の扱い、空データ時のフォールバック）。

## Proposed Solutions

### Solution A: useResolvedData() カスタムフックに集約

```ts
// src/hooks/useResolvedData.ts
export function useResolvedData(dataOverride?: Record<string, unknown>) {
  const livePreviewData = useReportStore((s) => s.livePreviewData)
  const schema = useReportStore((s) => s.definition.schema)
  const testData = useReportStore((s) => s.testData)
  const stableLiveData = useMemo(
    () => livePreviewData ? buildFlatDataFromResolved(livePreviewData, schema) : null,
    [livePreviewData, schema],
  )
  return dataOverride ?? stableLiveData ?? testData ?? {}
}
```

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] `useResolvedData()` フックが1箇所に定義されている
- [ ] `ReportCanvas` と `Toolbar` が同じフックを使用
- [ ] PDF 出力時とキャンバス表示時のデータが一致する

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
