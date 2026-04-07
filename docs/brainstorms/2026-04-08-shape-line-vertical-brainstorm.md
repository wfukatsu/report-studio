---
date: 2026-04-08
topic: shape-line-vertical
---

# Shape('line') 縦線描画ロジック修正

## What We're Building

`ShapeRenderer` の `line` 描画を、縦線にも対応させる。
現状は常に水平線 (`y1="50%" y2="50%"`) を描くため、`fuyouKojoTemplate` の縦線が正しく表示されない。

## Why This Approach

**自動判定方式（`height > width` で縦線）を選んだ理由:**

- `fuyouKojoTemplate` の `line` ヘルパーは縦線を `size: { width: 0.1, height: w }` で表現している（既存コード）
- 型定義変更・テンプレート変更が不要
- 「細くて長い要素 = 縦線」は直感的に正しい
- `orientation` プロパティ追加は YAGNI — 将来必要になったときに追加できる

## Key Decisions

- **修正箇所**: `src/elements/shape/Renderer.tsx` のみ（1 行変更レベル）
- **判定条件**: `el.size.height > el.size.width` → 縦線 (`x1="50%" y1="0" x2="50%" y2="100%"`)
- **型変更なし**: `ShapeElement` の型定義は変更しない
- **テンプレート変更なし**: `fuyouKojoTemplate` の `line()` ヘルパーはそのまま動く

## Resolved Questions

- **`orientation` プロパティ追加は必要か**: 不要（YAGNI） ✅
- **既存の水平線への影響**: `width >= height` ならすべて水平線のまま ✅

## Open Questions

なし — 方針確定。

## Next Steps

→ 直接実装可能。`src/elements/shape/Renderer.tsx` 1 ファイルの修正 + テスト追加。
