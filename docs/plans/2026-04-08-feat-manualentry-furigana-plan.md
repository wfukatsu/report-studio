---
title: "feat: ManualEntryField にフリガナ入力欄を追加 — furiganaEnabled + furiganaDataSource"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-furigana-manualentry-brainstorm.md
---

# feat: ManualEntryField にフリガナ入力欄を追加

## Overview

`ManualEntryField` を拡張して、フリガナ行と本文行を1要素で表現できるようにする。
現状は氏名欄1つにフリガナ用と氏名用の ManualEntry 2要素が必要だが、
`furiganaEnabled` フラグで1要素に統合し、`furiganaDataSource` でデータバインドも可能にする。

([brainstorm](../brainstorms/2026-04-08-furigana-manualentry-brainstorm.md))

## Problem Statement / Motivation

現在 `fuyouKojoTemplate.ts` の氏名欄は:

```typescript
// 2要素が必要 — フリガナと氏名の構造上の紐付けなし
input(x, y,            w, h * 0.35, { label: 'フリガナ', fontSize: 2.8 }),
input(x, y + h * 0.35, w, h * 0.65, { label: '氏名',    fontSize: 3.5 }),
```

問題:
- 1フィールド = 2要素 → テンプレートの要素数が増加し移動・調整が煩雑
- 構造上の紐付けがなく、データバインド（フリガナのプレビュー値）が別々
- テンプレート作成者に「2つを常にペアで管理」という暗黙の慣習が発生する

## Proposed Solution

(see brainstorm: Approach A — ManualEntry 拡張)

```typescript
// 1要素で完結
input(x, y, w, h, {
  label: '氏名',
  fontSize: 3.5,
  furiganaEnabled: true,
  furiganaRatio: 0.35,
  furiganaDataSource: 'employee.furigana',
})
```

- `furiganaEnabled?: boolean` (デフォルト: `false`) — フリガナゾーンを有効化
- `furiganaDataSource?: string` — フリガナのデータプレビュー値（resolveField で解決）
- `furiganaRatio?: number` (デフォルト: `0.35`) — フリガナ行の高さ割合

## Technical Details

### ManualEntryField 型拡張

```typescript
// src/types/index.ts — ManualEntryField に追加
furiganaEnabled?: boolean     // デフォルト: false
furiganaDataSource?: string   // フリガナのデータプレビュー（resolveField経由）
furiganaRatio?: number        // 高さ割合 0〜1、デフォルト: 0.35
```

既存フィールドは変更なし。`furiganaEnabled` のデフォルトが `false` なので後方互換性あり。

### Renderer の縦分割レンダリング

`furiganaEnabled === true` のとき:

```
┌──────────────────────────────────────┐
│ フリガナ                              │  ← furiganaRatio (35%) の高さ
│ ________________________________      │
├──────────────────────────────────────┤
│ 氏名（el.label）                      │  ← 残り (65%) の高さ
│ ________________________________      │
└──────────────────────────────────────┘
```

- フリガナゾーン: 「フリガナ」固定ラベル + `displayMode` に応じた入力表示 + `furiganaDataSource` の解決値
- 氏名ゾーン: 既存の `label` + `displayMode` に応じた入力表示
- `furiganaEnabled === false` のときは現行と同一

**`data` プロップを追加**: `furiganaDataSource` を解決するため `Renderer.tsx` に `data?: Record<string, unknown>` プロップを追加し、`ElementRenderer.tsx` で `data={mergedData}` を渡す。

### 変更が不要なもの

- `ReportElement` union — ManualEntry は既存型
- `ElementRenderer.tsx` の switch case — case 追加不要（`data` props の追記のみ）
- `layerUtils.ts`, `ElementPalette.tsx` — 変更不要

## Acceptance Criteria

- [x] `ManualEntryField` に `furiganaEnabled?`, `furiganaDataSource?`, `furiganaRatio?` が追加されている
- [x] `furiganaEnabled: false`（デフォルト）のとき既存の ManualEntry 動作が変わらない
- [x] `furiganaEnabled: true` のとき要素が縦2分割され、上ゾーンに「フリガナ」ラベルと入力行が表示される
- [x] `furiganaRatio` が高さ割合に反映される（デフォルト 0.35）
- [x] `furiganaDataSource` があるとき `resolveField` で解決した値がフリガナゾーンに表示される
- [x] `furiganaDataSource` が未設定 or データ未存在のとき空のフリガナゾーンが表示される
- [x] フリガナゾーンのラベルテキストは常に「フリガナ」固定（設定不可）
- [x] PropertiesPanel に furiganaEnabled トグル / furiganaRatio 数値 / furiganaDataSource テキスト入力が表示される
- [x] `furiganaEnabled: false` のとき PropertiesPanel のフリガナ設定 UI が非表示になる
- [x] 全テスト通過（`npm test -- --run`）
- [x] TypeScript コンパイルエラーなし（`npm run build`）

## Implementation Checklist

### Step 1: 型定義

- [x] `src/types/index.ts` — `ManualEntryField` に3フィールド追加

### Step 2: Renderer テスト追加（TDD）

- [x] `src/elements/manualEntry/Renderer.test.tsx` に furigana テストケースを追加（RED）
  - `furiganaEnabled: true` でフリガナゾーン（「フリガナ」テキスト）が表示される
  - `furiganaEnabled: false`（デフォルト）で「フリガナ」テキストが表示されない
  - `furiganaDataSource` 指定時に data から値を解決してフリガナゾーンに表示される
  - `furiganaDataSource` 指定・データ未存在のとき空のゾーンのみ表示（エラーなし）

### Step 3: Renderer 実装（GREEN）

- [x] `src/elements/manualEntry/Renderer.tsx` を修正
  - Props に `data?: Record<string, unknown>` を追加
  - `furiganaEnabled` 時: 縦2分割レイアウト（furiganaRatio 使用）
  - フリガナゾーンに `resolveField(data, furiganaDataSource)` の値を表示

### Step 4: ElementRenderer 更新

- [x] `src/components/canvas/ElementRenderer.tsx` — `manualEntry` case に `data={mergedData}` を追加
  ```tsx
  case 'manualEntry': return <ManualEntryRenderer element={element} data={mergedData} />
  ```

### Step 5: PropertiesPanel テスト追加（TDD）

- [x] `src/elements/manualEntry/PropertiesPanel.test.tsx` を**新規作成**（RED）
  - `furiganaEnabled` チェックボックスが onChange を呼ぶ
  - `furiganaEnabled: true` のとき furiganaRatio / furiganaDataSource コントロールが表示される
  - `furiganaEnabled: false` のときそれらのコントロールが非表示
  - `furiganaDataSource` テキスト入力が onChange を呼ぶ（空文字 → undefined）
  - `furiganaRatio` 数値入力が onChange を呼ぶ

### Step 6: PropertiesPanel 実装（GREEN）

- [x] `src/elements/manualEntry/PropertiesPanel.tsx` を修正
  - フリガナ設定セクションを追加: `furiganaEnabled` トグル（checkbox）
  - `furiganaEnabled: true` のときのみ表示: `furiganaRatio`（NumInput）、`furiganaDataSource`（text input, 空→undefined）

### Step 7: テンプレート更新（デモ）

- [x] `src/templates/fuyouKojoTemplate.ts` — 氏名欄2要素を `furiganaEnabled: true` の1要素に統合

### Step 8: 品質確認

- [x] `npm test -- --run` で全テスト通過
- [x] `npm run build` でビルドエラーなし

## File Structure

```
変更ファイル:
  src/types/index.ts                              # ManualEntryField 拡張
  src/elements/manualEntry/Renderer.tsx           # furigana 分割レンダリング + data prop
  src/elements/manualEntry/Renderer.test.tsx      # furigana テストケース追加
  src/elements/manualEntry/PropertiesPanel.tsx    # furigana UI 追加
  src/components/canvas/ElementRenderer.tsx       # data={mergedData} 追加
  src/templates/fuyouKojoTemplate.ts              # 氏名欄を1要素に統合（デモ）

新規ファイル:
  src/elements/manualEntry/PropertiesPanel.test.tsx  # 新規作成
```

## Dependencies & Risks

- **後方互換性**: `furiganaEnabled` のデフォルトが `false` なので既存要素に影響なし
- **`data` プロップ追加**: `ManualEntryRenderer` が `data` を受け取るようになるが、渡さなければ `undefined` として振る舞う（既存テストに影響なし）
- **`resolveField` セキュリティ**: `furiganaDataSource` の解決には既存の `resolveField`（FORBIDDEN_KEYS ガード付き）を使用 — XSS/prototype pollution リスクなし
- **スコープ外**: メイン入力欄の `dataSource` バインド（ManualEntry 全体のデータバインドは今回対象外）

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-furigana-manualentry-brainstorm.md](../brainstorms/2026-04-08-furigana-manualentry-brainstorm.md)
  - Key decisions: ManualEntry 拡張（新規型不採用）、furiganaRatio 設定可能（デフォルト 0.35）、furiganaDataSource はプレビュー値のみ
- ManualEntry Renderer: `src/elements/manualEntry/Renderer.tsx`
- ManualEntry type: `src/types/index.ts` (ManualEntryField ~line 278)
- ElementRenderer dispatch: `src/components/canvas/ElementRenderer.tsx` (~line 73)
- resolveField security: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`
