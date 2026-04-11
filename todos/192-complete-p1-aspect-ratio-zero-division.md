---
status: pending
priority: p1
issue_id: "192"
tags: [code-review, typescript, canvas, resize, aspect-ratio]
dependencies: []
---

# アスペクト比計算で height=0 の場合に ratio=Infinity がストアに伝播する

## Problem Statement

`CanvasElement.tsx` の `handleResizeStart` で `ratio = el.size.width / el.size.height` を計算するとき、`el.size.height` が `0` の場合 `ratio = Infinity` になる。その後の計算で `newHeightMm` または `newWidthMm` が `Infinity` になり、Zustand ストアに `Infinity` が書き込まれる。`Math.max(MIN_MM, Infinity) = Infinity` となるためクランプも効かない。

## Findings

**File:** `src/components/canvas/CanvasElement.tsx:120`

```ts
resizeStart.current = {
  // ...
  ratio: el.size.width / el.size.height,  // height=0 のとき Infinity
}
```

**影響範囲:**
- 外部レポート JSON に `height: 0` の要素が含まれる場合
- テンプレートにバグがある場合
- 将来の migration でデフォルト値が誤っている場合

`Math.max(MIN_MM, Infinity)` = `Infinity` のため MIN_MM クランプが機能せず、要素サイズが `Infinity` になりキャンバスが壊れる。

セキュリティエージェント (security-sentinel) も同じ問題を P2 として報告。

## Proposed Solutions

### Option A: 開始時にゼロガード (推奨)

```ts
ratio: el.size.height > 0 ? el.size.width / el.size.height : 1,
```

- **Pros:** 1 行の修正。`height=0` の要素でも比率 1:1 として動作
- **Cons:** ratio=1 は任意だが、Infinity より明らかに安全
- **Effort:** Small
- **Risk:** None

### Option B: `Infinity` を事後検出してフォールバック

```ts
if (!isFinite(ratio)) return  // アスペクト比維持をスキップ
```

- **Pros:** Infinity 以外の不正値にも対応
- **Cons:** サイレントにスキップするため根本原因が見えにくい
- **Effort:** Small
- **Risk:** None

## Recommended Action

Option A を適用する。

## Technical Details

- **Affected files:** `src/components/canvas/CanvasElement.tsx:120`
- **Store impact:** `resizeElement(pageId, id, { width: Infinity, height: Infinity })` が呼ばれると Zustand の immer draft に Infinity が書き込まれる

## Acceptance Criteria

- [ ] `el.size.height = 0` の要素で Shift+リサイズしてもストアに Infinity が書き込まれない
- [ ] `el.size.height = 0` でも 5mm 以上の正常なサイズが維持される
- [ ] テストケース追加: `height=0` の要素を Shift+リサイズしても onResize が有限値で呼ばれる

## Work Log

- 2026-04-11: kieran-typescript-reviewer (CRITICAL) と security-sentinel (P2) の両エージェントが独立して検出 (PR #30 レビュー)
