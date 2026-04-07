---
title: "feat: 縦書きラベル DX 改善 — LabelRenderer + vlbl() ヘルパー"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-vertical-label-renderer-brainstorm.md
---

# feat: 縦書きラベル DX 改善 — LabelRenderer + vlbl() ヘルパー

## Overview

`LabelRenderer` に縦書き時の `wordBreak` CSS を追加し、`fuyouKojoTemplate.ts` に `vlbl()` ヘルパーを追加する。
各文字間へ `\n` を手動挿入する必要をなくし、縦書きラベルの記述を簡潔にする。

([brainstorm](../brainstorms/2026-04-08-vertical-label-renderer-brainstorm.md))

## Problem Statement

現在 `fuyouKojoTemplate.ts` の長い縦書きラベルでは、各文字の間に手動で `\n` を挿入する必要がある:

```typescript
// src/templates/fuyouKojoTemplate.ts:338-340
lbl('主\nた\nる\n給\nと\n控\n除\nを\n受\nけ\nる',
    ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H,
    { fontSize: 2.5, writingMode: 'vertical-rl' })
```

短い縦書きラベル（4〜6文字）はすでに `\n` なしで動作しているが（lines 232, 254, 267）、
13文字以上の長いラベルで `\n` が使われている。

## Root Cause Analysis

- `LabelRenderer.tsx` は `whiteSpace: 'pre-wrap'` を適用しており、`\n` が段組み区切りとして機能する
- `writing-mode: vertical-rl` では `\n` が新しい列（左方向）を作る — 意図した動作ではない
- 実際には `\n` なしで長いテキストは単一縦列に流れるが、ラテン文字混在時のフォールバックとして `wordBreak: 'break-all'` を追加すると安全

## Proposed Solution

(see brainstorm: Approach A)

1. **LabelRenderer**: `writingMode === 'vertical-rl'` 時に `wordBreak: 'break-all'` を追加
2. **fuyouKojoTemplate.ts**: `vlbl()` ヘルパーを追加
3. **fuyouKojoTemplate.ts**: `\n` 区切りのラベルを `vlbl()` で書き直す

## Technical Details

### LabelRenderer 修正

```typescript
// src/elements/label/Renderer.tsx (line ~22 付近に追加)
const isVertical = style.writingMode === 'vertical-rl'
// 既存: overflow: 'hidden' は line 24 に既にある
// 追加:
wordBreak: isVertical ? ('break-all' as const) : undefined,
```

- `overflow: 'hidden'` は既存（変更不要）
- `wordBreak: 'break-all'` のみ追加（ラテン文字混在ケース対策）

### vlbl() ヘルパー

```typescript
// src/templates/fuyouKojoTemplate.ts に追加
function vlbl(text: string, x: number, y: number, w: number, h: number, fontSize = 2.8): ReportElement {
  return lbl(text, x, y, w, h, { writingMode: 'vertical-rl', fontSize })
}
```

戻り値型は `lbl()` と同じ `ReportElement`。

### テンプレート書き換え（fuyouKojoTemplate.ts line 338-340）

```typescript
// Before:
lbl('主\nた\nる\n給\nと\n控\n除\nを\n受\nけ\nる',
    ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H,
    { fontSize: 2.5, writingMode: 'vertical-rl' })

// After:
vlbl('主たる給与から控除を受ける',
     ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H, 2.5)
```

## Acceptance Criteria

- [x] `LabelRenderer.tsx` が `writingMode === 'vertical-rl'` 時に `wordBreak: 'break-all'` を適用する
- [x] 短い縦書きラベル（4〜6文字）の既存動作が変わらない
- [x] `vlbl()` ヘルパーが `fuyouKojoTemplate.ts` に存在し、`lbl()` の薄いラッパーとして機能する
- [x] `fuyouKojoTemplate.ts` 内の `\n` 区切りラベル（line 338-340）が `vlbl()` で書き直されている
- [x] 全テスト通過（`npm test -- --run`）
- [x] TypeScript コンパイルエラーなし（`npm run build`）

## Implementation Checklist

### Step 1: LabelRenderer 修正

- [x] `src/elements/label/Renderer.tsx` に `wordBreak` 条件付きスタイルを追加

### Step 2: LabelRenderer テスト追加（TDD）

- [x] `src/elements/label/Renderer.test.tsx` にテストケースを追加
  - `writingMode: 'vertical-rl'` の要素で `wordBreak: break-all` が適用される
  - `writingMode: 'horizontal-tb'`（デフォルト）では `wordBreak` が設定されない
  - `\n` なしの縦書きテキストが正しくレンダリングされる（テキスト内容が表示される）

### Step 3: テンプレート更新

- [x] `src/templates/fuyouKojoTemplate.ts` に `vlbl()` ヘルパーを追加（`lbl()` の直後）
- [x] line 338-340 の `\n` 区切りラベルを `vlbl()` に書き換える

### Step 4: 品質確認

- [x] `npm test -- --run` で全テスト通過
- [x] `npm run build` でビルドエラーなし

## File Structure

```
変更ファイル:
  src/elements/label/Renderer.tsx       # wordBreak 追加
  src/elements/label/Renderer.test.tsx  # 縦書きテストケース追加
  src/templates/fuyouKojoTemplate.ts    # vlbl() 追加 + \n ラベル書き換え
```

## Dependencies & Risks

- **リスク**: `wordBreak: 'break-all'` の追加は既存の短い縦書きラベルに影響しない（単列に収まるため折り返しが発生しない）
- **リスク**: `whiteSpace: 'pre-wrap'` はそのまま維持 — 横書きラベルの改行動作を変えない
- **スコープ外**: TextElement の縦書き対応（将来必要になれば同パターンで対応可能）

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-vertical-label-renderer-brainstorm.md](../brainstorms/2026-04-08-vertical-label-renderer-brainstorm.md)
  - Key decisions: LabelRenderer CSS 修正（overflow は既存）+ vlbl() ヘルパー + \n 除去
- LabelRenderer: `src/elements/label/Renderer.tsx` (writingMode line 22, whiteSpace line 23, overflow line 24)
- LabelRenderer test: `src/elements/label/Renderer.test.tsx` (makeElement パターン line 6-19)
- Template: `src/templates/fuyouKojoTemplate.ts` (lbl() line 18-40, vertical label line 338-340)
