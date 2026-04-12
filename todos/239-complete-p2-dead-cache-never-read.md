---
status: pending
priority: p2
issue_id: "239"
tags: [code-review, data-browser, simplicity, performance]
dependencies: []
---

# dataBrowserScalarDbCache は書かれるが読まれない（デッドコード）

## Problem Statement

`DataGrid.tsx` は `cacheScalarDbScan()` でScalarDBのスキャン結果をZustandストアに書き込むが、ページ変更時にキャッシュを読む実装がない。毎回APIを呼ぶため、キャッシュが完全に無駄。さらに、`Map` をimmerスライスで使うのはobject識別子の扱いが複雑。

## Findings

```tsx
// DataGrid.tsx — 書いているが読んでいない
cacheScalarDbScan(source.namespace, source.table, offset, data)  // ← 書く
// ページ変更時:
scanScalarDbTable(...)  // ← 毎回APIを呼ぶ（キャッシュ参照なし）
```

```ts
// dataBrowserSlice.ts — Map in immer
dataBrowserScalarDbCache: new Map(),
cacheScalarDbScan: (namespace, table, offset, data) => set((s) => {
  const key = `${namespace}.${table}:${offset}`
  const newMap = new Map(s.dataBrowserScalarDbCache)  // immerプロキシのコピーは不安定
  newMap.set(key, data)
  s.dataBrowserScalarDbCache = newMap
}),
```

`Map` はimmerが正しくトラッキングできないため `new Map(draft)` パターンが必要だが、これはStructural Sharingを無効化する。`Record<string, ...>` にすれば通常の `s.cache[key] = data` で書ける。

## Proposed Solutions

### Option A: キャッシュを削除してシンプル化（最も単純）

`dataBrowserScalarDbCache`, `cacheScalarDbScan` をスライス・types.ts・DataGridから完全削除。約15行削減、動作変化なし。

- Pros: コード削減、複雑性排除
- Cons: バックナビゲーション時のキャッシュなし（現状と同じ）
- Effort: Small
- Risk: Low

### Option B: キャッシュを `Record` にしてダブルヒットを防ぐ（推奨）

```ts
// types.ts
dataBrowserScalarDbCache: Record<string, import('@/api/reportApi').ScalarDbScanResponse>

// dataBrowserSlice.ts
cacheScalarDbScan: (namespace, table, offset, data) => set((s) => {
  s.dataBrowserScalarDbCache[`${namespace}.${table}:${offset}`] = data
}),
```

```tsx
// DataGrid.tsx のuseEffect内
const cacheKey = `${source.namespace}.${source.table}:${offset}`
const cached = dataBrowserScalarDbCache[cacheKey]
if (cached) {
  setScalarDbData(cached); setColumns(cached.columns.map(c => c.name)); setLoadState('ok'); return
}
```

- Pros: ページナビゲーション時のAPIリクエストを削減、immer適合
- Cons: Option Aより実装量多い
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] Option A または B を選択して実装
- [ ] フロントエンドビルド通過
- [ ] (Option B) 既訪問ページへの戻りでAPIリクエストなし

## Work Log

- 2026-04-12: code-review (PR #45) にて code-simplicity-reviewer + performance-oracle が発見
