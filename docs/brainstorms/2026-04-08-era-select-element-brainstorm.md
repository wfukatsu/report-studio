---
date: 2026-04-08
topic: era-select-element
---

# 和暦元号選択要素 — EraSelectElement

## What We're Building

専用要素型 `EraSelectElement` を追加し、扶養控除等申告書の生年月日欄にある
「明・大・昭・平・令」の元号選択を1要素で表現できるようにする。

**解決する問題:**
1. **DX**: `lbl('明・大・\n昭・平・令', ...)` という手動記述をなくす
2. **データバインド**: `dataSource` で選択中の元号を表示できる（プレビュー用）

## Why This Approach

**新規 EraSelectElement 型を選択した理由:**
- CheckboxElement、FormTableElement と同じパターン — 学習コストゼロ
- LabelElement 拡張は役割混在（ラベル vs 選択肢表示）になり YAGNI 違反
- 元号は公的帳票専用の概念 → 専用型が最適

**元号リスト固定（設定不可）の理由:**
- 和暦元号は常に 明・大・昭・平・令 の5択
- `eras?: string[]` を設定可能にする必要はない（YAGNI）

## Key Decisions

### 要素型定義

```typescript
export interface EraSelectElement extends ElementBase {
  type: 'eraSelect'
  /** 選択中の元号（resolveField で解決）— 空文字なら未選択 */
  dataSource?: string
}
```

### 元号リスト

固定: `['明', '大', '昭', '平', '令']` — 型定義に含めない

### Renderer の表示

縦列 + ○/● 表示:

```
○明
○大
●昭  ← dataSource が '昭' に解決されたとき
○平
○令
```

- `dataSource` 未設定 or 空文字: 全て ○（未選択）
- マッチした元号: ●（選択中）、それ以外: ○
- フォントサイズ: 要素サイズに応じてスケール (`fontSize = size.height / 5 * 0.7` mm 程度)

### PropertiesPanel

`dataSource` のテキスト入力1つのみ（CheckboxElement の `dataSource` 入力と同パターン）。

### テンプレート書き換え

```typescript
// Before:
lbl('明・大・\n昭・平・令', ML + LEFT_COL_W + 68, HY + 4, 12, 5, { fontSize: 2.2 })

// After:
eraSelect(ML + LEFT_COL_W + 68, HY + 4, 12, 5, 'employee.era')
```

### スコープ

**新規追加:**
- `src/types/index.ts` — `EraSelectElement` + `'eraSelect'` を ElementType に追加
- `src/lib/elementFactories.ts` — `createEraSelectElement()`
- `src/elements/eraSelect/Renderer.tsx`
- `src/elements/eraSelect/Renderer.test.tsx`
- `src/elements/eraSelect/PropertiesPanel.tsx`
- `src/elements/eraSelect/PropertiesPanel.test.tsx`

**統合:**
- `src/components/canvas/ElementRenderer.tsx` — case 追加
- `src/components/sidebar/PropertiesPanel.tsx` — dispatch 追加
- `src/components/sidebar/ElementPalette.tsx` — パレットアイテム追加
- `src/components/sidebar/layerUtils.ts` — icon + name 追加

**テンプレート更新:**
- `src/templates/fuyouKojoTemplate.ts` — `lbl('明・大・...')` を `eraSelect()` ヘルパーで置き換え

## Resolved Questions

- **ゴール**: DX 改善 + データバインド両方 ✅
- **UI スタイル**: 縦列 ○/● 表示（紙形式に忠実）✅
- **アプローチ**: 新規 EraSelectElement（LabelElement 拡張は不採用）✅
- **元号リスト**: 固定（明・大・昭・平・令）、設定不可 ✅

## Open Questions

なし — 方針確定。

## Next Steps

→ `/workflows:plan` で実装計画を作成する。
参照パターン: `src/elements/checkbox/` (CheckboxElement 実装)
