---
status: pending
priority: p2
issue_id: "206"
tags: [code-review, simplicity, yagni, zustand, data-binding-phase2]
dependencies: []
---

# `livePreviewData/Loading/Error` を `uiSlice` でなくコンポーネント `useState` に移動

## Problem Statement

計画では `livePreviewData`, `livePreviewLoading`, `livePreviewError` の3フィールドを `uiSlice` に追加しているが、
これらの値を消費するのは `DataBindingOverviewPanel` と `ReportCanvas` の2箇所のみ。
プレビューデータはプレビューモード中にのみ意味を持ち、モーダルを閉じたら消えるべき。

Zustand スライスへの追加はストア型のサイズ増加、immer ラッパー、テスト表面積の追加を招く。
コンポーネントローカルな `useState` で十分。

## Findings

**Simplicity reviewer の指摘:**
> "livePreviewError/Loading/Data の型が uiSlice に追加されると〜約20行のストアコード削減可能"

**Architecture reviewer の反論:**
> "livePreviewData が export フローで必要なら uiSlice が適切"

**調停**: エクスポートフローで `livePreviewData` が必要（Todo 203）なため、完全削除は不可。
ただし `livePreviewLoading` と `livePreviewError` はコンポーネントローカルで十分。

## Proposed Solution

```typescript
// DataBindingOverviewPanel.tsx
const [previewState, setPreviewState] = useState<
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }
>({ status: 'idle' })

// uiSlice には livePreviewData のみ保持（エクスポートで必要なため）
// livePreviewLoading, livePreviewError はコンポーネント内 useState で管理
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `uiSlice` に追加するフィールドは `livePreviewData: LivePreviewData | null` のみ
- [ ] `livePreviewLoading`, `livePreviewError` は `DataBindingOverviewPanel` の `useState` で管理
- [ ] `setLivePreviewLoading`, `setLivePreviewError` アクションは不要

## Work Log

- 2026-04-12: Discovered by Simplicity reviewer (partially accepted, modified based on Architecture reviewer)
