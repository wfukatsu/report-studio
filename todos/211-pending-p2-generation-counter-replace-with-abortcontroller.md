---
status: pending
priority: p2
issue_id: "211"
tags: [code-review, simplicity, yagni, zustand, async, data-binding-phase2]
dependencies: ["206"]
---

# `livePreviewDataGeneration` 世代カウンターを Zustand から削除 — AbortController で代替

## Problem Statement

計画では `livePreviewDataGeneration: number` を `uiSlice` に追加し、スキーマ変更のたびにインクリメントして
古い非同期レスポンスを破棄する仕組みを提案している。

しかし、`livePreviewData` のフェッチは「プレビュー更新」ボタン押下という明示的なユーザー操作でのみ発火する。
スキーマが変更されたら `livePreviewData` を `null` にクリアするだけで十分。
競合は `AbortController` で既存コードと同じパターンで扱える。

## Findings

**既存の正しいパターン**: `DbConnectionTab.tsx` の `fetchCatalog` が `AbortController` + `mountedRef` で
コンポーネントアンマウント後の setState を防いでいる。

**Simplicity reviewer:**
> "Generation counter を store に置くのは誤ったイディオム。loadGeneration は競合防止のガードだが
> ここで必要なのは「手動リフレッシュ」の意図的なトリガー。単純に livePreviewData を null にリセットすれば十分。"

**但し**: TODO 206 で決定した通り、`livePreviewData` は `uiSlice` に残す（エクスポートフローで必要なため）。
その場合、スキーマ変更時の無効化は `setLivePreviewData(null)` で十分。

## Proposed Solution

```typescript
// uiSlice に追加（世代カウンターなし）
livePreviewData: LivePreviewData | null
setLivePreviewData: (data: LivePreviewData | null) => void

// schemaSlice の変更アクションすべてで
setLivePreviewData(null)  // スキーマ変更で古いプレビューデータを消す
```

```typescript
// DataBindingOverviewPanel のフェッチ
const abortRef = useRef<AbortController | null>(null)

async function handleRefreshPreview() {
  abortRef.current?.abort()
  const controller = new AbortController()
  abortRef.current = controller
  setPreviewState({ status: 'loading' })
  try {
    const response = await resolveBindings(templateId, request, controller.signal)
    if (controller.signal.aborted) return  // スキーマ変更で中止されたら破棄
    store.setLivePreviewData(buildFlatData(response, definition.schema))
    setPreviewState({ status: 'ready' })
  } catch (e) { /* ... */ }
}
```

世代カウンターは不要。`AbortController` で十分。

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] `livePreviewDataGeneration: number` が `uiSlice` に追加されていない
- [ ] `incrementLivePreviewGeneration` アクションが存在しない
- [ ] `AbortController` でリクエスト中止を処理している
- [ ] スキーマ変更アクションが `setLivePreviewData(null)` を呼ぶ

## Work Log

- 2026-04-12: Discovered by Simplicity reviewer
