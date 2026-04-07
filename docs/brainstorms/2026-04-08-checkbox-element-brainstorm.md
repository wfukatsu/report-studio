---
date: 2026-04-08
topic: checkbox-element
---

# CheckboxElement — 帳票専用チェックボックス要素型

## What We're Building

`CheckboxElement` を新しい要素型として追加する。

固定チェック（印刷レイアウト用）とデータバインド（フィールド値で checked/unchecked を切り替え）の両モードを一つの要素で扱う。ラベルテキスト付き。チェックマーク記号は ✓ / × / ● から選択可。

## Why This Approach

現状の問題: 公的帳票（扶養控除等申告書など）のチェックボックスを `ManualEntry { displayMode: 'box' }` で代替しているが、checked 状態を表現できない。印刷時に空の正方形が出るだけ。

専用要素型を選んだ理由:
- `ManualEntry` の拡張は役割混在になる（入力欄 vs チェックボックス）
- `FormTableElement` と同じアプローチ — ISSUE-04 で実績あり
- `checked` / `checkmark` / `label` が明確に分離できる

## Key Decisions

### 型定義（`src/types/index.ts`）

```typescript
export type CheckmarkStyle = '✓' | '×' | '●'

export interface CheckboxElement extends ElementBase {
  type: 'checkbox'
  /** 静的 checked 状態（デザインプレビュー用） */
  checked: boolean
  /** チェックマーク記号 */
  checkmark: CheckmarkStyle
  /** ラベルテキスト（空文字なら非表示） */
  label: string
  /** データバインドモード: このフィールド値が truthy なら checked */
  dataSource?: string
  style?: TextStyle
}
```

### 描画ルール

**デザインプレビュー:**
- `checked: true` → 枠内にチェックマーク記号 + ラベル
- `checked: false` → 空枠 + ラベル

**ライブレンダリング（dataSource 指定時）:**
- `resolveField(data, dataSource)` が truthy → checked
- falsy → unchecked
- `dataSource` 未指定 → `checked` の静的値を使用

### チェックボックスの描画

```
┌─────┐ ラベルテキスト（2.8mm フォント）
│  ✓  │
└─────┘
```

- 枠: ShapeElement の 'rectangle' と同等（0.3mm border）
- チェックマーク: 枠内中央に checkmark 記号（fontSize はボックスサイズに応じて計算）
- ラベル: `label !== ''` のとき右側（または下）に小テキスト表示

### ラベル位置

- デフォルト: `right` (チェックボックスの右横)
- `none` でラベル非表示

### デフォルト値（Factory）

```typescript
createCheckboxElement() → {
  checked: false,
  checkmark: '✓',
  label: '',
  size: { width: 5, height: 5 },  // 5mm x 5mm の正方形
}
```

## Resolved Questions

- **checked マーク**: ✓ / × / ● から選択 ✅
- **ラベル**: あり（空文字なら非表示）✅
- **データバインド**: フィールド値 truthy → checked ✅
- **ManualEntry 拡張 vs 専用型**: 専用型 ✅

## Open Questions

なし — 方針確定。

## Next Steps

→ `/workflows:plan` で実装計画を作成する。
参照パターン: `src/elements/hanko/` (専用要素の典型), `src/elements/manualEntry/` (ラベル付き)
