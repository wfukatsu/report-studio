---
status: pending
priority: p1
issue_id: "249"
tags: [code-review, performance, zustand, canvas, rendering]
dependencies: []
---

# selectActivePage が PageDef 全体を返し毎フレームで全キャンバス再レンダリング

## Problem Statement

`ReportCanvas` が `selectActivePage` でページ全体オブジェクトを購読しているため、`moveElement` / `resizeElement` / `updateElement` など全てのストア変更で新しいオブジェクト参照が生成され、キャンバス全体が再レンダリングされる。100要素を含むキャンバスでドラッグ中に1秒あたり数千回の不要なレンダリングが発生する。

## Findings

**Location:** `src/components/canvas/ReportCanvas.tsx:85`

```ts
const activePage = useReportStore(selectActivePage)
// selectActivePage = s.definition.pages.find(...) — 毎変更で新参照
```

**影響の連鎖:**
1. `activePage` 新参照 → `ReportCanvas` 再レンダリング
2. → `SectionContainer` 再レンダリング（section propが新参照）
3. → `sortedElements` の useMemo 再計算（O(n log n)）
4. → `effectiveElement` オブジェクト生成（グループオーバーライド対象全要素）
5. → `CanvasElement` の memo() 評価（100要素全て）

**計測値（推定）:** 60fps ドラッグ × 100要素 = 6,000回/秒のセクション再レンダリング

## Proposed Solutions

### Solution A: activePageId のみ購読、page は別途取得（推奨）

```ts
// ReportCanvas.tsx
const activePageId = useReportStore((s) => s.activePageId)
const activePage = useReportStore(
  useShallow((s) => s.definition.pages.find(p => p.id === activePageId))
)
```

ただし `useShallow` は shallow equality で比較するため、immer が生成する構造的に同一なオブジェクトでもページレベルの変更があると再レンダリングする。より細かい粒度で購読するには:

```ts
// SectionContainer に section を prop として渡す際、sections のIDリストのみ購読
const sectionIds = useReportStore(
  useShallow((s) => selectActivePage(s)?.sections.map(sec => sec.id) ?? [])
)
```

- Pros: 最も効果的、ドラッグ中の再レンダリングを大幅削減
- Cons: SectionContainer のデータ取得パターン変更が必要
- Effort: Medium
- Risk: Medium

### Solution B: page を App.tsx から prop として安定参照で渡す

`selectActivePage` を App.tsx レベルで購読し、`ReportCanvas` には `page` を prop で渡す。`React.memo` と `useShallow` の組み合わせで参照の安定化を図る。

- Pros: ReportCanvas の責務を分離できる
- Cons: prop drilling が増える
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] ドラッグ中に `SectionContainer` が毎フレーム再レンダリングされない（React DevTools で確認）
- [ ] 100要素キャンバスでのドラッグが60fps以上を維持
- [ ] 要素の更新が正しく画面に反映される（回帰テスト）

## Work Log

- 2026-04-13: performance-oracle による code-review で発見（CRITICAL）
