---
title: "feat: スキーマフィールドのD&Dキャンバス配置"
type: feat
status: completed
date: 2026-04-15
origin: docs/brainstorms/2026-04-15-schema-field-dnd-to-canvas-brainstorm.md
---

# feat: スキーマフィールドのD&Dキャンバス配置

## Overview

バインドタブで定義したスキーマフィールドを、デザインタブの左サイドバー（要素パレット + 新規スキーマタブ）に表示し、キャンバスへのドラッグ&ドロップで dataField 要素の作成・既存要素へのバインド・繰り返しバンドへの列追加を実現する。

(see brainstorm: docs/brainstorms/2026-04-15-schema-field-dnd-to-canvas-brainstorm.md)

## Problem Statement / Motivation

現状の帳票設計ワークフロー:
1. バインドタブでスキーマグループ/フィールドを定義
2. デザインタブに切り替えて dataField 要素を手動配置
3. プロパティパネルで fieldKey を手入力
4. バインドタブに戻って schemaBinding を接続

これを **フィールドをキャンバスにドロップ** の1ステップに短縮する。

## Proposed Solution

3つの機能を一括実装する:

### 機能A: フィールド一覧の表示

1. **要素パレット末尾セクション** — 既存の `PALETTE_CATEGORIES` の後に「スキーマフィールド」セクションを動的生成
2. **左サイドバー「スキーマ」タブ** — `LEFT_TABS` に `'schema'` を追加。グループ別にフィールドをツリー表示

### 機能B: キャンバスへのD&D

新しい MIME type `application/rds-schema-field` を使用。ドロップ先でヒットテスト:

| 優先順 | ヒットテスト条件 | 動作 |
|--------|-----------------|------|
| 1 | 最前面要素が dataField/text/checkbox/eraSelect | 既存要素の `schemaBinding` を設定 |
| 2 | 最前面要素が repeatingBand/repeatingList | `fields` に列追加 + `dataSource` 設定 |
| 3 | 空き領域 or 上記以外 | 新規 dataField 要素を作成 (fieldKey + schemaBinding 設定) |

### 機能C: 繰り返しバンドへの列追加

detailグループのフィールドを repeatingBand にドロップすると:
- `fields` 配列に `{ key: fieldKey, label: fieldLabel, width: 20, align: 'left' }` を追加
- `dataSource` をグループの `dataKey` に自動設定（未設定 or 空の場合のみ）

## Acceptance Criteria

### 機能A: フィールド一覧表示
- [ ] 要素パレット末尾に「スキーマフィールド」セクションが表示される (`ElementPalette.tsx`)
- [ ] 各フィールドはグループ名(マスター/明細バッジ)で分類表示される
- [ ] 左サイドバーに「スキーマ」タブが追加される (`App.tsx`: LEFT_TABS)
- [ ] スキーマタブにグループ別フィールドツリーが表示される (`SchemaFieldsTab.tsx`)
- [ ] スキーマ未定義時は空状態メッセージを表示（パレットセクションは非表示）
- [ ] 各フィールドは `draggable` 属性付きボタンとして表示

### 機能B: D&Dで新規要素作成 + 既存バインド
- [ ] フィールドをキャンバスの空き領域にドロップすると dataField 要素が作成される (`ReportCanvas.tsx`)
- [ ] 作成された要素の `fieldKey` にフィールドキーが設定される
- [ ] 作成された要素の `schemaBinding.fieldId` にフィールドIDが設定される
- [ ] 作成された要素の `name` にフィールドラベルが設定される
- [ ] 既存の dataField/text/checkbox/eraSelect 要素にドロップすると `schemaBinding` のみ設定される
- [ ] ドロップ時の座標変換・セクション判定・スナップ・衝突回避は既存ロジックを利用

### 機能C: 繰り返しバンドへの列追加
- [ ] repeatingBand/repeatingList 要素にフィールドをドロップすると `fields` に新列が追加される
- [ ] 追加された列の `key` = fieldKey, `label` = fieldLabel, `width` = 20
- [ ] repeatingBand の `dataSource` が空なら、ドロップしたフィールドのグループの `dataKey` を自動設定
- [ ] 同じキーの列が既に存在する場合は追加しない（重複防止）

## Implementation Tasks

### Phase 1: DnD基盤 + ファクトリ

- [ ] `elementFactories.ts` に `createDataFieldFromSchema()` ファクトリを追加
  ```typescript
  // src/lib/elementFactories.ts
  export function createDataFieldFromSchema(field: {
    fieldId: string; fieldKey: string; fieldLabel: string;
  }): ReportElement {
    return createDataFieldElement({
      fieldKey: field.fieldKey,
      name: field.fieldLabel,
      label: field.fieldLabel,
      schemaBinding: { fieldId: field.fieldId },
    })
  }
  ```

- [ ] DnD ペイロード型を定義
  ```typescript
  // src/components/bindingEditor/types.ts (or new shared file)
  export const SCHEMA_FIELD_MIME = 'application/rds-schema-field'
  export interface SchemaFieldDragPayload {
    fieldId: string
    groupId: string
    fieldKey: string
    fieldLabel: string
    groupRole: 'master' | 'detail'
    groupDataKey: string
  }
  ```

### Phase 2: 要素パレットにスキーマセクション追加

- [ ] `ElementPalette.tsx` にスキーマフィールドセクションを追加
  - ストアから `schema.groups` を取得
  - システムグループ (`isSystemGroup`) をフィルタ
  - 各グループのフィールドを `draggable` ボタンとして描画
  - `onDragStart` で `application/rds-schema-field` MIME typeにJSON payloadをセット
  - スキーマ未定義時はセクション自体を非表示

### Phase 3: 左サイドバー「スキーマ」タブ追加

- [ ] `SchemaFieldsTab.tsx` を新規作成
  - グループ別の折りたたみ可能なフィールドツリー
  - 各フィールドに role バッジ + ドラッグハンドル
  - 空状態: 「バインドタブでスキーマを定義してください」
  - 同じ `SCHEMA_FIELD_MIME` DnD を共有

- [ ] `App.tsx` の `LEFT_TABS` に `{ id: 'schema', label: 'スキーマ' }` を追加
- [ ] `App.tsx` のタブコンテンツに `{leftTab === 'schema' && <SchemaFieldsTab />}` を追加

### Phase 4: ReportCanvas ドロップハンドラ拡張

- [ ] `ReportCanvas.tsx` の `handlePaletteDragOver` を拡張
  - `application/rds-schema-field` も `e.preventDefault()` 対象に追加

- [ ] `ReportCanvas.tsx` に `handleSchemaFieldDrop` ハンドラを追加
  1. `e.dataTransfer.getData(SCHEMA_FIELD_MIME)` をパースする (try/catch)
  2. ドロップ座標を mm に変換（既存の `pxToMm` + zoom 計算を再利用）
  3. セクションを特定
  4. **ヒットテスト**: セクション内要素を zIndex 降順でループ
     - 座標が AABB 内に入る最前面要素を検出
     - 要素タイプで分岐:
       - `dataField|text|checkbox|eraSelect` → `setElementSchemaBinding(pageId, elementId, fieldId)`
       - `repeatingBand` → `updateElement(pageId, elementId, { fields: [...el.fields, newCol], dataSource: ... })`
       - ヒットなし → `createDataFieldFromSchema()` + `addElement()` (座標+スナップ+衝突回避)

- [ ] 座標変換・スナップ・衝突回避のロジックは `handlePaletteDrop` と同じコードをインラインで複製する（共有関数への抽出はリファクタフェーズで行う）

### Phase 5: ビルド検証 + テスト

- [ ] `npm run build` でエラーなし確認
- [ ] `npm run lint` で警告なし確認
- [ ] ブラウザで手動検証:
  - パレットからフィールドをドラッグしてキャンバスに配置できる
  - 既存要素にドロップしてバインドされる
  - repeatingBand にドロップして列が追加される
  - スキーマタブからも同じ操作ができる

## Technical Considerations

### 既存コードとの整合性

| 項目 | 既存パターン | 新実装 |
|------|-------------|--------|
| MIME type | `application/rds-palette` (文字列) | `application/rds-schema-field` (JSON) |
| ドラッグデータ | `item.label` | `JSON.stringify(SchemaFieldDragPayload)` |
| ドロップ処理 | `handlePaletteDrop` | `handleSchemaFieldDrop` (並列追加) |
| 要素作成 | `PALETTE_ITEM_MAP[label]()` | `createDataFieldFromSchema(payload)` |
| 座標変換 | `pxToMm((e.clientX - rect.left) / zoom)` | 同じロジックを共有関数に抽出 |

### ヒットテスト実装

```typescript
// セクション内要素をzIndex降順でソートし、座標がAABB内にある最前面要素を返す
function hitTest(
  x: number, y: number,
  elements: ReportElement[],
): ReportElement | null {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  for (const el of sorted) {
    if (
      x >= el.position.x &&
      x <= el.position.x + el.size.width &&
      y >= el.position.y &&
      y <= el.position.y + el.size.height
    ) {
      return el
    }
  }
  return null
}
```

### パフォーマンス考慮

- パレットのスキーマセクションは `useMemo` でメモ化（groups が変わるまで再計算しない）
- ヒットテストは要素数が少ない（1ページ数十要素）ため、線形探索で十分

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| `JSON.parse` 失敗 | try/catch でガード、失敗時は何もしない |
| 既存 `handlePaletteDrop` との干渉 | MIME type で分岐、既存ロジックは変更しない |
| repeatingBand のフィールド重複 | 同じ key が既にあれば追加しない |
| スキーマ未定義でのドラッグ | パレットセクション自体を非表示にする |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-15-schema-field-dnd-to-canvas-brainstorm.md](docs/brainstorms/2026-04-15-schema-field-dnd-to-canvas-brainstorm.md) — Key decisions: dataField統一, 既存要素への自動バインド, repeatingBand列追加+dataSource自動設定, zIndex順ヒットテスト

### Internal References

- 既存パレットD&D: `src/components/sidebar/ElementPalette.tsx:42-46` (onDragStart)
- キャンバスドロップ: `src/components/canvas/ReportCanvas.tsx:260-337` (handlePaletteDrop)
- パレットデータ: `src/components/sidebar/paletteData.tsx:81-177` (PALETTE_CATEGORIES)
- 左サイドバータブ: `src/App.tsx:23-36` (LEFT_TABS)
- 要素ファクトリ: `src/lib/elementFactories.ts:82-97` (createDataFieldElement)
- スキーマバインド: `src/store/schemaSlice.ts:203-214` (setElementSchemaBinding)
- PALETTE_ITEM_MAP: `src/components/sidebar/paletteData.tsx:174-177`
