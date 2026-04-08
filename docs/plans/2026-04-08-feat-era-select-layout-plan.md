---
title: "feat: 元号選択レイアウトパターン（column/row/grid-2col）+ 表示元号選択"
type: feat
status: active
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-era-select-layout-brainstorm.md
---

# feat: 元号選択レイアウトパターン + 表示元号選択

## Overview

EraSelectElement に `layout`（column/row/grid-2col）と `eras`（表示元号配列）を追加し、
プロパティパネルから選択可能にする。

(see brainstorm: docs/brainstorms/2026-04-08-era-select-layout-brainstorm.md)

## Acceptance Criteria

- [ ] `layout: 'column'` — 縦1列に並ぶ（現行動作、デフォルト）
- [ ] `layout: 'row'` — 横1行に並ぶ
- [ ] `layout: 'grid-2col'` — 2列グリッドに並ぶ
- [ ] `eras` 未設定時は `['明','大','昭','平','令']`（5元号、後方互換）
- [ ] プロパティパネルでレイアウト選択可能
- [ ] プロパティパネルで元号のオン/オフ切り替え可能（最低1つ必須）
- [ ] フォントサイズがレイアウト・元号数に応じて自動計算
- [ ] dataSource バインドが全レイアウトで正しく動作（●/○表示）
- [ ] テスト追加（各レイアウト + eras カスタマイズ）
- [ ] 全テスト通過 + ビルドエラーなし

## Implementation Checklist

### Step 1: 型定義

- [ ] `src/types/index.ts` — `EraSelectElement` に追加:
  ```typescript
  layout?: 'column' | 'row' | 'grid-2col'
  eras?: string[]
  ```

### Step 2: ファクトリ

- [ ] `src/lib/elementFactories.ts` — `createEraSelectElement` にデフォルト追加:
  ```typescript
  layout: 'column',
  eras: ['明', '大', '昭', '平', '令'],
  ```

### Step 3: レンダラー（TDD）

- [ ] `src/elements/eraSelect/Renderer.test.tsx` — テスト追加:
  - layout=column → flex-direction: column（既存動作）
  - layout=row → flex-direction: row
  - layout=grid-2col → CSS grid 2列
  - eras カスタマイズ → 指定した元号のみ表示
  - dataSource バインド → 各レイアウトで ●/○ が正しく表示

- [ ] `src/elements/eraSelect/Renderer.tsx` — レイアウト分岐:

  **column（デフォルト）**: 現行の `flex-direction: column`

  **row**: `flex-direction: row`、フォントサイズは幅ベースで計算

  **grid-2col**: `display: grid; grid-template-columns: 1fr 1fr`

  **フォントサイズ計算:**
  ```
  column: Math.max(height / erasCount * 0.75, 2.0) mm
  row:    Math.max(width / erasCount * 0.5, 2.0) mm
  grid:   Math.max(height / Math.ceil(erasCount/2) * 0.6, 2.0) mm
  ```

  **eras 取得**: `el.eras ?? ['明', '大', '昭', '平', '令']`

### Step 4: プロパティパネル

- [ ] `src/elements/eraSelect/PropertiesPanel.tsx`:
  - レイアウト選択: 3つのアイコントグル（column/row/grid）
  - 元号チェックボックス: 各元号のオン/オフ（最低1つバリデーション）
  - 既存の dataSource 入力はそのまま

### Step 5: テンプレート互換性確認

- [ ] `fuyouKojoTemplate.ts` の `eraSelect()` ヘルパー: `layout`/`eras` 未指定 → デフォルト値で後方互換。変更不要。
- [ ] `quotationTemplate.ts` 等: 同上。変更不要。

### Step 6: ビルド・テスト

- [ ] `npm test -- --run` 全テスト通過
- [ ] `npm run build` ビルドエラーなし

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-era-select-layout-brainstorm.md](../brainstorms/2026-04-08-era-select-layout-brainstorm.md)
- **現行レンダラー:** `src/elements/eraSelect/Renderer.tsx` — column 固定、ERAS 定数
- **型定義:** `src/types/index.ts:326-330` — `EraSelectElement`
- **ファクトリ:** `src/lib/elementFactories.ts` — `createEraSelectElement()`
- **プロパティパネル:** `src/elements/eraSelect/PropertiesPanel.tsx`
