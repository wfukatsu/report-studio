---
title: "feat: EraSelectElement — 和暦元号選択要素型"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-era-select-element-brainstorm.md
---

# feat: EraSelectElement — 和暦元号選択要素型

## Overview

公的帳票の生年月日欄にある「明・大・昭・平・令」の元号選択を専用要素型で表現する。
現在の `lbl('明・大・\n昭・平・令', ...)` という手動記述を置き換え、
`dataSource` でデータバインドして選択中の元号をハイライト表示できるようにする。

([brainstorm](../brainstorms/2026-04-08-era-select-element-brainstorm.md))

## Problem Statement / Motivation

現在 `fuyouKojoTemplate.ts` の元号欄は静的 `lbl()` で記述されている:

```typescript
// line 259
lbl('明・大・\n昭・平・令', ML + LEFT_COL_W + 68, HY + 4, 12, 5, { fontSize: 2.2 })

// line 390 (buildPersonRow 内)
lbl('明・大\n昭・平', COL.birthday.x + 1, rowY + 1, 7, rowH - 2, { fontSize: 2.2 })
```

問題:
1. **DX**: テンプレート作成者が元号リストを手動で書く必要がある（typo リスクあり）
2. **プレビュー**: データバインドで選択中の元号が分からない（全て同じ表示）

## Proposed Solution

(see brainstorm: Approach A — 新規 EraSelectElement 型)

CheckboxElement と同じパターンで `EraSelectElement` を追加する:

```typescript
export interface EraSelectElement extends ElementBase {
  type: 'eraSelect'
  /** 選択中の元号 — resolveField で解決。空文字なら未選択（全て ○） */
  dataSource?: string
}
```

テンプレート使用例:
```typescript
// Before: 手動記述 (2要素)
lbl('明・大・\n昭・平・令', x, y, w, h, { fontSize: 2.2 })

// After: 専用要素 (1関数)
eraSelect(x, y, w, h)                          // 未選択プレビュー
eraSelect(x, y, w, h, 'employee.era')           // データバインドあり
```

## Technical Details

### 要素型定義

```typescript
// src/types/index.ts — CheckboxElement の近くに追加
export interface EraSelectElement extends ElementBase {
  type: 'eraSelect'
  dataSource?: string
}
```

元号リスト `['明', '大', '昭', '平', '令']` は Renderer 内定数として保持（型に含めない）。

### Renderer の表示ロジック

縦列 + ○/● 表示（紙形式に忠実）:

```
○明
○大
●昭  ← resolveField(data, dataSource) === '昭' のとき
○平
○令
```

- `dataSource` 未設定 or 空文字: 全て ○
- マッチした元号: ●、それ以外: ○
- フォントサイズ: `size.height / 5 * 0.75` mm（5行 × 行高さに収める）

### ファクトリデフォルト

```typescript
createEraSelectElement() → {
  size: { width: 7, height: 12 },  // 5元号 × ~2.4mm/行
}
```

### PropertiesPanel

`dataSource` のテキスト入力のみ（CheckboxElement の dataSource 入力と同パターン）。

### テンプレート更新

2箇所の `lbl()` を `eraSelect()` ヘルパーで置き換える:

**line 259 (ヘッダー行):**
```typescript
// Before:
lbl('明・大・\n昭・平・令', ML + LEFT_COL_W + 68, HY + 4, 12, 5, { fontSize: 2.2 })
// After:
eraSelect(ML + LEFT_COL_W + 68, HY + 4, 12, 5, 'employee.era')
```

**line 390 (buildPersonRow 内):**
```typescript
// Before:
lbl('明・大\n昭・平', COL.birthday.x + 1, rowY + 1, 7, rowH - 2, { fontSize: 2.2 })
// After: 全5元号を表示（EraSelectElement は常に明・大・昭・平・令 を表示）
eraSelect(COL.birthday.x + 1, rowY + 1, 7, rowH - 2)
```

## Acceptance Criteria

- [ ] `EraSelectElement` 型が `src/types/index.ts` に定義され、`ReportElement` union に追加されている
- [ ] `createEraSelectElement()` ファクトリ関数が `src/lib/elementFactories.ts` に存在する
- [ ] Renderer が「明・大・昭・平・令」を縦列 ○/● 形式で表示する
- [ ] `dataSource` 未設定のとき全て ○（未選択）表示
- [ ] `dataSource` 指定時に `resolveField` で解決した値の元号に ● を表示
- [ ] マッチしない値の場合、全て ○（未選択）表示（エラーなし）
- [ ] PropertiesPanel に `dataSource` テキスト入力が表示される（空文字 → undefined）
- [ ] パレットの「日本語帳票専用」カテゴリに「元号選択」が追加されている
- [ ] レイヤーパネルに `Calendar` アイコンと「元号選択」名が表示される
- [ ] `fuyouKojoTemplate.ts` の `lbl('明・大・...')` 2箇所が `eraSelect()` で書き換えられている
- [ ] 全テスト通過（`npm test -- --run`）
- [ ] TypeScript コンパイルエラーなし（`npm run build`）

## Implementation Checklist

### Step 1: 型定義

- [ ] `src/types/index.ts` — `EraSelectElement` インターフェースを追加（`CheckboxElement` の近く）
- [ ] `src/types/index.ts` — `'eraSelect'` を `ElementType` union に追加
- [ ] `src/types/index.ts` — `| EraSelectElement` を `ReportElement` union に追加

### Step 2: ファクトリ関数

- [ ] `src/lib/elementFactories.ts` — `createEraSelectElement()` を追加
- [ ] `src/lib/elementFactories.test.ts` — ファクトリのユニットテストを追加

### Step 3: Renderer（TDD）

- [ ] `src/elements/eraSelect/Renderer.test.tsx` を先に作成（RED）
  - 5元号（明・大・昭・平・令）全てがレンダリングされる
  - `dataSource` 未設定のとき全て ○ が表示される
  - `dataSource` 指定時に resolveField で '昭' が解決されると、'昭' に ● が付く
  - マッチしない値のとき全て ○
- [ ] `src/elements/eraSelect/Renderer.tsx` を実装（GREEN）

### Step 4: PropertiesPanel（TDD）

- [ ] `src/elements/eraSelect/PropertiesPanel.test.tsx` を先に作成（RED）
  - `dataSource` 入力が onChange を呼ぶ
  - 空文字 → `undefined` を渡す
- [ ] `src/elements/eraSelect/PropertiesPanel.tsx` を実装（GREEN）

### Step 5: 統合

- [ ] `src/components/canvas/ElementRenderer.tsx` — import + switch case 追加
  ```tsx
  case 'eraSelect': return <EraSelectRenderer element={element} data={mergedData} />
  ```
- [ ] `src/components/sidebar/PropertiesPanel.tsx` — import + dispatch 追加
  ```tsx
  {el.type === 'eraSelect' && <EraSelectPropertiesPanel el={el} onChange={update} />}
  ```
- [ ] `src/components/sidebar/ElementPalette.tsx` — `Calendar` アイコン import + パレットアイテム追加（「日本語帳票専用」カテゴリ）
- [ ] `src/components/sidebar/layerUtils.ts` — `Calendar` アイコン import + `elementIcon()` + `defaultName()` の両 switch に追加

### Step 6: テンプレート更新

- [ ] `src/templates/fuyouKojoTemplate.ts` — `eraSelect()` ヘルパー関数を追加
  ```typescript
  function eraSelect(x: number, y: number, w: number, h: number, dataSource?: string): ReportElement {
    return { id: uuidv4(), type: 'eraSelect', position: { x, y }, size: { width: w, height: h },
      zIndex: 3, locked: true, visible: true, dataSource }
  }
  ```
- [ ] `src/templates/fuyouKojoTemplate.ts` — line 259 の `lbl('明・大・...')` を `eraSelect()` に書き換え
- [ ] `src/templates/fuyouKojoTemplate.ts` — line 390 (buildPersonRow 内) の `lbl('明・大...')` を `eraSelect()` に書き換え

### Step 7: 品質確認

- [ ] `npm test -- --run` で全テスト通過
- [ ] `npm run build` でビルドエラーなし

## File Structure

```
新規ファイル:
  src/elements/eraSelect/
    Renderer.tsx              # EraSelectRenderer コンポーネント
    Renderer.test.tsx         # ユニットテスト
    PropertiesPanel.tsx       # EraSelectPropertiesPanel
    PropertiesPanel.test.tsx  # ユニットテスト

変更ファイル:
  src/types/index.ts                           # EraSelectElement + union 追加
  src/lib/elementFactories.ts                  # createEraSelectElement 追加
  src/lib/elementFactories.test.ts             # テスト追加
  src/components/canvas/ElementRenderer.tsx    # case 追加
  src/components/sidebar/PropertiesPanel.tsx   # dispatch 追加
  src/components/sidebar/ElementPalette.tsx    # パレットアイテム追加
  src/components/sidebar/layerUtils.ts         # icon + name 追加
  src/templates/fuyouKojoTemplate.ts           # lbl → eraSelect 置き換え
```

## Dependencies & Risks

- **CheckboxElement パターンに忠実**: 同じ構造で実装するため実装リスク低
- **`Calendar` アイコン**: Lucide React に存在する — `layerUtils.ts` と `ElementPalette.tsx` に import を追加するだけ
- **buildPersonRow 内の書き換え**: line 390 は関数内。`eraSelect()` ヘルパーの `dataSource` 引数は省略可能にする
- **元号リスト固定**: `['明', '大', '昭', '平', '令']` は Renderer 定数 — 型定義を汚染しない

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-era-select-element-brainstorm.md](../brainstorms/2026-04-08-era-select-element-brainstorm.md)
  - Key decisions: 新規要素型（LabelElement 拡張不採用）、元号固定（設定不可）、縦列 ○/● 表示
- CheckboxElement 実装パターン: `src/elements/checkbox/` (Renderer.tsx, PropertiesPanel.tsx, tests)
- CheckboxElement ファクトリ: `src/lib/elementFactories.ts` (~line 366)
- 型定義: `src/types/index.ts` (ReportElement union ~line 566)
- ElementRenderer dispatch: `src/components/canvas/ElementRenderer.tsx`
- テンプレート: `src/templates/fuyouKojoTemplate.ts` (line 259, line 390)
