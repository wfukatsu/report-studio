---
title: "feat: マージンガイド表示 + スナップ + プリセット"
type: feat
status: completed
date: 2026-04-09
origin: docs/brainstorms/2026-04-09-margin-visibility-brainstorm.md
---

# feat: マージンガイド表示 + スナップ + プリセット

## Overview

キャンバス上でページの余白（マージン）を視覚的に表示する。マージン外エリアをグレーオーバーレイで塗り、要素ドラッグ時にマージン境界へスナップし、PageSettingsPanel にプリセットボタンを追加する。

(see brainstorm: docs/brainstorms/2026-04-09-margin-visibility-brainstorm.md)

## Problem Statement

`pageSettings.margins` の値はストアに保存されサイドバーで編集できるが、キャンバス上に一切反映されない。ユーザーは余白の範囲がわからず、要素を印刷可能範囲外に配置してしまう。

## Proposed Solution

6つの機能を 3フェーズで実装:

1. **Phase 1**: ストア + ツールバー + キャンバスオーバーレイ（M-01〜M-03）
2. **Phase 2**: マージンスナップ（M-04）
3. **Phase 3**: プリセット + PDF データ受け渡し（M-05〜M-06）

## Technical Approach

### Phase 1: マージンガイドオーバーレイ

#### 1.1 ストア拡張

**ファイル**: `src/store/uiSlice.ts`, `src/store/types.ts`

- [ ] `showMarginGuide: boolean` を UI ステートに追加（デフォルト `true`）
- [ ] `toggleMarginGuide` アクションを追加

#### 1.2 ツールバートグルボタン

**ファイル**: `src/components/toolbar/Toolbar.tsx`

- [ ] グリッド・トンボボタンの隣に「余白ガイド」トグルボタンを追加
- [ ] アイコン: `Square` (lucide-react) またはカスタム余白アイコン
- [ ] ツールチップ: 「余白ガイド表示切替」

#### 1.3 キャンバスオーバーレイ描画

**ファイル**: `src/components/canvas/ReportCanvas.tsx`

マージンオーバーレイを SVG `<path>` の fill-rule evenodd で描画する。外枠（ページ全体）から内枠（マージン内）を切り抜く:

```tsx
{showMarginGuide && (() => {
  const { margins } = definition.pageSettings
  const mt = mmToPx(margins.top)
  const mr = mmToPx(margins.right)
  const mb = mmToPx(margins.bottom)
  const ml = mmToPx(margins.left)
  const w = canvasWidthPx
  const h = canvasHeightPx
  // outer rect (clockwise) + inner rect (counter-clockwise) = frame
  const d = `M0,0 H${w} V${h} H0 Z M${ml},${mt} V${h - mb} H${w - mr} V${mt} Z`
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
         width={w} height={h}>
      <path d={d} fill="rgba(0,0,0,0.06)" fillRule="evenodd" />
    </svg>
  )
})()}
```

- [ ] `showMarginGuide` ストア値を購読
- [ ] `definition.pageSettings.margins` を読み取り
- [ ] SVG path でグレーオーバーレイを描画（`rgba(0,0,0,0.06)`、`pointerEvents: 'none'`）
- [ ] グリッドオーバーレイの直後、要素の下（`zIndex: 2`）に配置
- [ ] readonly/プレビューモードでも表示

### Phase 2: マージンスナップ

#### 2.1 スナップ候補にマージン境界を追加

**ファイル**: `src/components/canvas/CanvasElement.tsx` またはスナップユーティリティ

- [ ] 既存のグリッドスナップロジックを確認（`snapToGrid` 関連コード）
- [ ] `snapToGrid` が ON の場合、スナップ候補にマージン境界の 4辺（top/right/bottom/left in px）を追加
- [ ] 要素の端（左端/右端/上端/下端）がマージン境界から ±2px 以内なら吸着
- [ ] マージン外への配置は制限しない（ユーザーが意図的に配置する場合あり）

### Phase 3: プリセット + PDF データ受け渡し

#### 3.1 マージンプリセット

**ファイル**: `src/components/sidebar/PageSettingsPanel.tsx`

- [ ] 余白入力の上にプリセットボタンを追加:
  - 「標準」(20mm) / 「狭い」(10mm) / 「最小」(5mm) / 「なし」(0mm)
- [ ] クリックで `updateSettings({ margins: { top: v, right: v, bottom: v, left: v } })` を呼ぶ

#### 3.2 PDF マージンデータ受け渡し

**ファイル**: `server/src/main/java/com/report/server/V2ProjectionBuilder.java`

- [ ] `pageSetup` に `margins` オブジェクト（top/right/bottom/left）を含める
- [ ] 現時点では PdfRenderer 側でマージンによるクリッピングは行わない（将来対応の基盤のみ）

## Acceptance Criteria

- [ ] キャンバス上でマージン外エリアが薄いグレー（`rgba(0,0,0,0.06)`）で表示される
- [ ] デフォルトで ON、ツールバーのトグルボタンで ON/OFF できる
- [ ] 要素ドラッグ時にマージン境界にスナップする（`snapToGrid` ON 時）
- [ ] PageSettingsPanel に 4つのプリセットボタンがある
- [ ] プレビューモードでもマージンガイドが表示される
- [ ] `npm test -- --run` 全パス
- [ ] 既存のグリッド・トンボ表示に影響しない
- [ ] マージン 0mm の場合にオーバーレイが表示されない（エッジケース）
- [ ] マージン値変更時にオーバーレイが即座に更新される
- [ ] `showMarginGuide` のトグルでオーバーレイが ON/OFF する（ストアテスト）

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-09-margin-visibility-brainstorm.md](../brainstorms/2026-04-09-margin-visibility-brainstorm.md) — Key decisions: グレーアウト方式、デフォルトON+トグル、スナップは吸着のみ（制限なし）、PDF はデータ受け渡しのみ

### Internal References

- キャンバス描画: `src/components/canvas/ReportCanvas.tsx:280-291`（グリッド描画パターン）
- トンボ描画: `src/components/canvas/ReportCanvas.tsx:471-514`（SVG オーバーレイパターン）
- UI ストア: `src/store/uiSlice.ts:63`（`showGrid`, `showTrimMarks` パターン）
- ページ設定パネル: `src/components/sidebar/PageSettingsPanel.tsx:72-97`
- ツールバーボタン: `src/components/toolbar/Toolbar.tsx:597-604`（グリッド・トンボトグル）
