---
status: complete
priority: p3
issue_id: "214"
tags: [code-review, performance, catalog, data-binding-phase2]
dependencies: []
---

# `DataBindingModal` のカタログ fetch が毎回モーダルオープン時に実行される

## Problem Statement

計画では `DataBindingModal` の `useState` + `useEffect` でカタログを管理。
モーダルを閉じてすぐ開くと unmount → remount でカタログが再フェッチされる。

5分以内の再オープンなら前回のカタログデータを再利用すべき。

## Findings

**Performance reviewer:**
> "module-level Map with 5-minute TTL (matching CACHE_TTL_MS convention in responsesSlice.ts) が適切"

**Simplicity reviewer の反論:**
> "モーダルオープンは頻繁ではない。useState で十分"

**調停**: P3（nice-to-have）として記録。ユーザーが不満を示した場合に対応。

## Proposed Solution

```typescript
// src/api/reportApi.ts にモジュールレベルキャッシュ
let _catalogCache: { data: ScalarDbCatalog; fetchedAt: number } | null = null
const CATALOG_TTL_MS = 5 * 60 * 1000

export async function fetchScalarDbCatalogCached(signal?: AbortSignal): Promise<ScalarDbCatalog> {
  if (_catalogCache && Date.now() - _catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return _catalogCache.data
  }
  const data = await fetchScalarDbCatalog(signal)
  _catalogCache = { data, fetchedAt: Date.now() }
  return data
}
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] モーダルを閉じて5分以内に再オープンした場合、カタログの再フェッチが発生しない
- [ ] "再取得"ボタンはキャッシュを無効化して強制フェッチする

## Work Log

- 2026-04-12: Discovered by Performance reviewer (P2 demoted to P3 based on usage frequency)
