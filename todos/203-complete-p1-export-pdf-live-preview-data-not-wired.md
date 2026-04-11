---
status: complete
priority: p1
issue_id: "203"
tags: [code-review, architecture, export, data-binding-phase2, silent-failure]
dependencies: []
---

# エクスポート PDF に `livePreviewData` が渡されない — サンプルデータで生成される無音失敗

## Problem Statement

Phase 2 の計画は「エクスポート時は `livePreviewData` をそのまま使用（再フェッチしない）」と述べているが、
`doExportPdf` / `handleBackendPdf` (`Toolbar.tsx`) の呼び出し側を変更する記述がない。

現在の実装では `generateStatelessPdf(defJson, dataJson)` の `dataJson` は常に `testData`（サンプル JSON）。
`livePreviewData` が存在しても渡されないため、プレビューで実データが見えているのに
エクスポートが空データの PDF を生成するという無音失敗が起きる。

ユーザーはコンパイルエラーも例外も受け取らず、間違った PDF を手にする。

## Findings

**File:** `src/lib/exportUtils.ts` — `exportToServerPdf(definition, testData)` シグネチャ
**File:** `src/components/Toolbar.tsx` — `doExportPdf` / `handleBackendPdf` がストアから `testData` を取得

```typescript
// 現状 (Toolbar.tsx 推定)
const testData = useReportStore((s) => s.testData)
// ...
await exportToServerPdf(definition, testData)  // ← livePreviewData を渡していない
```

**計画の欠落**: Step 3 / Step 4 にエクスポートフローを更新する記述がない。

## Proposed Solutions

### Option A: Toolbar でフォールバックロジックを追加（推奨）

```typescript
// Toolbar.tsx
const testData = useReportStore((s) => s.testData)
const livePreviewData = useReportStore((s) => s.livePreviewData)

// livePreviewData が存在する場合はそれを優先
const exportData = livePreviewData ?? testData
await exportToServerPdf(definition, exportData)
```

**Pros:** 既存 API 変更なし、フォールバック安全
**Cons:** `livePreviewData` が古い世代の場合に間違ったデータを使う可能性
**Effort:** Small
**Risk:** Low

### Option B: エクスポート前に世代チェック + ユーザー確認

```typescript
// 世代が現在のスキーマと一致しない場合は警告
if (livePreviewData && livePreviewDataGeneration !== currentSchemaGeneration) {
  const confirmed = await showConfirm(
    'プレビューデータが古くなっています。サンプルデータでエクスポートしますか？'
  )
  exportData = confirmed ? testData : throw new Error('Export cancelled')
} else {
  exportData = livePreviewData ?? testData
}
```

**Pros:** データ品質を保証
**Cons:** フロー複雑化、世代カウンターが必要
**Effort:** Medium
**Risk:** Medium

## Recommended Action

**Option A** で Phase 2 は実装し、Option B は Phase 2.5 以降で検討する。
計画ドキュメントに Toolbar.tsx の変更を Step 4 に明示的に追記する。

## Technical Details

**Affected files:**
- `src/components/Toolbar.tsx` または相当するエクスポートトリガーコンポーネント
- `docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md` — Step 4 に追記

**`generateTemplatePdf` (バックエンドテンプレート PDF パス):**
こちらも同様に `livePreviewData ?? testData` を渡す必要があるか確認。

## Acceptance Criteria

- [ ] `doExportPdf` が `livePreviewData ?? testData` を `generateStatelessPdf` / `exportToServerPdf` に渡す
- [ ] `livePreviewData` が `null` の場合は既存の `testData` にフォールバックする
- [ ] エクスポートして生成された PDF が実 DB データを反映している（統合テスト）

## Work Log

- 2026-04-12: Discovered by Architecture reviewer (silent wrong-data PDF)
