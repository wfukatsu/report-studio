---
title: "feat: CheckboxElement — 帳票専用チェックボックス要素型"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-checkbox-element-brainstorm.md
---

# feat: CheckboxElement — 帳票専用チェックボックス要素型

## Overview

公的帳票（扶養控除等申告書など）のチェックボックスを正しく表現するための専用要素型 `CheckboxElement` を追加する。
固定 checked 状態（デザインプレビュー用）とデータバインド（フィールド値で checked/unchecked を切り替え）の両モードを一つの要素で扱う。

([brainstorm](../brainstorms/2026-04-08-checkbox-element-brainstorm.md))

## Problem Statement / Motivation

現状、`ManualEntry { displayMode: 'box' }` でチェックボックスを代替しているが：
- `checked` 状態を表現できない（印刷時に空の正方形が出るだけ）
- データバインドでの checked/unchecked 切り替えができない

専用要素型を追加することで、公的帳票テンプレートが正確に表現できるようになる。

## Proposed Solution

`src/elements/hanko/` の実装パターンに倣い、`CheckboxElement` を完全な新要素型として追加する。
ManualEntry の拡張ではなく専用型とする（入力欄とチェックボックスの役割混在を避けるため）。

## Type Definition

```typescript
// src/types/index.ts に追加

export type CheckmarkStyle = '✓' | '×' | '●'

export interface CheckboxElement extends ElementBase {
  type: 'checkbox'
  /** 静的 checked 状態（デザインプレビュー用） */
  checked: boolean
  /** チェックマーク記号 */
  checkmark: CheckmarkStyle
  /** ラベルテキスト（空文字なら非表示） */
  label: string
  /** データバインドモード: resolveField(data, dataSource) !== '' なら checked */
  dataSource?: string
  style?: TextStyle
}
```

## Rendering Rules (see brainstorm)

**デザインプレビュー:**
- `checked: true` → SVG rect（0.3mm 相当の border）内に checkmark 記号 + 右ラベル
- `checked: false` → 空の SVG rect + 右ラベル

**ライブレンダリング（dataSource 指定時）:**
- `resolveField(data, dataSource) !== ''`（非空文字列） → checked として描画
- `''`（空文字列 / フィールド未存在） → unchecked
- `dataSource` 未指定 → `checked` の静的値を使用

> Note: `resolveField` は常に `string` を返す。truthy 判定は `!== ''` で行う。

## Factory Defaults

```typescript
// src/lib/elementFactories.ts
createCheckboxElement() → {
  checked: false,
  checkmark: '✓',
  label: '',
  size: { width: 5, height: 5 },  // 5mm × 5mm の正方形
}
```

## Technical Considerations

- `resolveField` は既に prototype pollution ガードを持つ（`docs/solutions/` 参照） — 新たな実装は不要
- チェックマーク記号（✓/×/●）のフォントサイズはボックスサイズに応じて計算: `fontSize = size.height * 0.6` (mm)
- `style?: TextStyle` はラベルテキストのスタイル（fontSize / color）用。今回の実装スコープでは PropertiesPanel への露出は行わず、将来の拡張のために型定義に保持する（デフォルト値は不要）

## Acceptance Criteria

- [x] `CheckboxElement` 型が `src/types/index.ts` に定義され、`ReportElement` union に追加されている
- [x] `createCheckboxElement()` ファクトリ関数が `src/lib/elementFactories.ts` に存在する
- [x] `CheckboxRenderer` が `checked: true` 時にチェックマーク記号を表示する
- [x] `CheckboxRenderer` が `checked: false` 時に空枠を表示する
- [x] `CheckboxRenderer` が `dataSource` 指定時に `resolveField(data, dataSource) !== ''` で checked 状態を決定する
- [x] `label !== ''` のとき右側にラベルテキストが表示される
- [x] `label === ''` のときラベルが非表示
- [x] パレットに「チェックボックス」アイテムが追加されている
- [x] PropertiesPanel で `checked`, `checkmark`, `label`, `dataSource` が編集できる
- [x] レイヤーパネルに適切なアイコンと名前（「チェックボックス」）が表示される
- [x] 全テスト通過（`npm test -- --run`）
- [x] TypeScript コンパイルエラーなし（`npm run build`）

## Implementation Checklist

### Step 1: 型定義

- [x] `src/types/index.ts` — `CheckmarkStyle` 型を追加
- [x] `src/types/index.ts` — `CheckboxElement` インターフェースを追加（`HankoElement` の近くに配置）
- [x] `src/types/index.ts` — `ReportElement` union に `| CheckboxElement` を追加

### Step 2: ファクトリ関数

- [x] `src/lib/elementFactories.ts` — `createCheckboxElement()` を追加
- [x] `src/lib/elementFactories.test.ts` — ファクトリのユニットテストを追加

### Step 3: Renderer（TDD）

- [x] `src/elements/checkbox/Renderer.test.tsx` を先に作成（RED）
  - `checked: true` でチェックマーク記号が表示される
  - `checked: false` で記号が表示されない
  - `checkmark: '×'` で × 記号が表示される / `checkmark: '●'` で ● が表示される
  - `dataSource` 指定時に data から非空文字列を解決して checked になる（`resolveField !== ''` 判定）
  - `dataSource` 指定時に空文字列 / 未存在フィールドで unchecked になる
  - `label` が非空のとき表示される / 空のとき非表示
- [x] `src/elements/checkbox/Renderer.tsx` を実装（GREEN）

### Step 4: PropertiesPanel（TDD）

- [x] `src/elements/checkbox/PropertiesPanel.test.tsx` を先に作成（RED）
  - `checked` トグルが onChange を呼ぶ
  - `checkmark` セレクタが onChange を呼ぶ
  - `label` テキスト入力が onChange を呼ぶ
  - `dataSource` テキスト入力が onChange を呼ぶ（空文字 → undefined）
- [x] `src/elements/checkbox/PropertiesPanel.tsx` を実装（GREEN）

### Step 5: 統合

- [x] `src/components/canvas/ElementRenderer.tsx` — import + switch case 追加
- [x] `src/components/sidebar/PropertiesPanel.tsx` — import + dispatch 追加
- [x] `src/components/sidebar/ElementPalette.tsx` — import + パレットアイテム追加（「基本要素」カテゴリへ）
- [x] `src/components/sidebar/layerUtils.ts` — `elementIcon()` と `defaultName()` の両 switch に追加
- [x] `ALLOWED_KEYS_BY_TYPE` を定義しているファイル（store）を grep で特定し、`checkbox` エントリを追加する

### Step 6: 品質確認

- [x] `npm test -- --run` ですべてのテストが通る
- [x] `npm run build` でビルドエラーなし
- [x] TypeScript の exhaustiveness check（assertNever）が各 switch で通る

## File Structure

```
src/elements/checkbox/
  Renderer.tsx            # CheckboxRenderer コンポーネント
  Renderer.test.tsx       # ユニットテスト
  PropertiesPanel.tsx     # CheckboxPropertiesPanel コンポーネント
  PropertiesPanel.test.tsx
```

## Similar Implementations (Reference)

- `src/elements/hanko/Renderer.tsx` — データバインド付きレンダラーの参照実装
- `src/elements/hanko/PropertiesPanel.tsx` — バインドフィールド入力パターン
- `src/elements/manualEntry/Renderer.tsx` — ラベル付きレンダリングパターン
- `src/elements/shape/Renderer.tsx` — SVG rect 描画パターン（0.3mm border）

## Dependencies & Risks

- **依存関係**: なし（既存の `resolveField` を利用）
- **リスク**: `CheckmarkStyle` の Unicode 文字（✓/×/●）は PDF エクスポート時のフォントに依存する。html2canvas 経由の PNG/PDF エクスポートではブラウザフォントを使うため基本的に問題なし。
- **`ALLOWED_KEYS_BY_TYPE`**: store の `updateElement` に型安全パッチフィルターが存在する（`docs/solutions/` の知見）。`checkbox` エントリを追加しないと実行時に全フィールド更新が無効になる可能性がある。Step 5 に具体的なタスクを追加済み。

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-checkbox-element-brainstorm.md](../brainstorms/2026-04-08-checkbox-element-brainstorm.md)
  - Key decisions: 専用要素型（ManualEntry 拡張不採用）、checkmark は ✓/×/● の3択、`resolveField !== ''` → checked
- Similar feature pattern: `src/elements/hanko/` (lines 1–31)
- Element registry: `src/types/index.ts` (ReportElement union ~lines 527–542)
- Dispatch: `src/components/canvas/ElementRenderer.tsx` (switch ~lines 63–98)
- Factory pattern: `src/lib/elementFactories.ts` (createHankoElement ~lines 147–165)
- Security: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`
