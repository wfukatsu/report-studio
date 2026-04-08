---
date: 2026-04-08
topic: vertical-label-renderer
---

# 縦書きラベルの DX 改善 — LabelRenderer 修正 + vlbl() ヘルパー

## What We're Building

`LabelElement` の縦書きレンダリングを CSS レベルで正しく動作させ、
テンプレート作成時に各文字間へ `\n` を手動挿入する必要をなくす。

あわせて `fuyouKojoTemplate.ts` に `vlbl()` ヘルパーを追加し、
縦書きラベルの定義を簡潔に書けるようにする。

## Why This Approach

**現状の問題（DX）:**
- テンプレートで縦書きを作る際、各文字間に手動で `\n` を挿入しなければならない
  - 例: `'主\nた\nる\n給\nと\n控\n除\nを\n受\nけ\nる'`
- CSS の `writing-mode: vertical-rl` と適切な `overflow` / `word-break` を組み合わせれば `\n` は不要になる

**Approach A（採用）:**
- `LabelRenderer.tsx` に縦書き時の CSS（overflow/word-break）を追加して `\n` 不要にする
- `vlbl()` ヘルパーで writingMode と fontSize のデフォルトを内包
- **LabelElement のみ** 対象（TextElement は将来必要になれば対応）

**Approach B（不採用）:** vlbl() のみ（`\n` 自動挿入）。根本解決にならない。
**Approach C（不採用）:** inlineSize/blockSize 導入。影響範囲が大きすぎる（YAGNI）。

## Key Decisions

### LabelRenderer の CSS 修正

縦書きモード（`writingMode === 'vertical-rl'`）では以下を適用する:

```typescript
// src/elements/label/Renderer.tsx
const verticalStyle = style.writingMode === 'vertical-rl'
  ? { overflow: 'hidden', wordBreak: 'break-all' } as const
  : {}
```

- `overflow: 'hidden'` — テキストが次の列にはみ出ることを防ぐ
- `word-break: 'break-all'` — ラテン文字混在時にも文字単位で折り返す（CJK は word-break なしでも折り返すが、混在ケース対策）

### vlbl() ヘルパー（テンプレート専用）

```typescript
// src/templates/fuyouKojoTemplate.ts 内に追加
function vlbl(text: string, x: number, y: number, width: number, height: number, fontSize = 2.8) {
  return lbl(text, x, y, width, height, { writingMode: 'vertical-rl', fontSize })
}
```

### 既存テンプレートの書き換え

`fuyouKojoTemplate.ts` 内の縦書きラベルを vlbl() で書き直す:

```typescript
// Before:
lbl('主\nた\nる\n給\nと\n控\n除\nを\n受\nけ\nる',
    ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H,
    { fontSize: 2.5, writingMode: 'vertical-rl' })

// After:
vlbl('主たる給与から控除を受ける',
     ML, CH_Y + CH_H, COL.leftBand.w, MAIN_ROWS_H, 2.5)
```

### スコープ

- **変更対象**: `src/elements/label/Renderer.tsx` + `src/templates/fuyouKojoTemplate.ts`
- **型定義変更なし**: ElementBase / LabelElement の型は変更しない
- **TextElement は今回スコープ外**（将来必要になれば同じパターンで対応）

## Resolved Questions

- **対象要素**: LabelElement のみ（TextElement は今回外）✅
- **症状の確認**: テンプレート記述の DX 問題（レンダリングの視覚バグではない）✅
- **アプローチ**: Renderer 修正 + vlbl() ヘルパー（Approach A）✅

## Open Questions

なし — 方針確定。

## Next Steps

→ `/workflows:plan` で実装計画を作成する。
参照パターン: `src/elements/label/Renderer.tsx`、`src/templates/fuyouKojoTemplate.ts`
