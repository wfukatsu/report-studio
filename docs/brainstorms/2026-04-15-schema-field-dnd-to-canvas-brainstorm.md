# Brainstorm: スキーマフィールドのD&Dキャンバス配置

**Date:** 2026-04-15
**Status:** Approved
**Author:** Claude Code + Fukatsu

---

## What We're Building

バインドタブで定義したスキーマフィールドを、デザインタブから直接キャンバスにドラッグ&ドロップで配置できるようにする。3つの機能を実装する:

### 機能A: 要素パレット + スキーマタブにフィールド一覧表示

| 表示場所 | 内容 |
|----------|------|
| 要素パレットの末尾セクション | 「スキーマフィールド」カテゴリを追加。各グループ(マスター/明細)ごとにフィールドをリスト表示 |
| 左サイドバーの新規「スキーマ」タブ | 「要素」「レイヤー」「ページ」タブの横に「スキーマ」タブを追加。グループ別にフィールド一覧を表示 |

各フィールドはドラッグ可能なボタンとして表示。

### 機能B: フィールドをキャンバスにD&Dで新規要素作成

| ドロップ先 | 動作 |
|-----------|------|
| キャンバスの空き領域 | `dataField` 要素を新規作成。`fieldKey` = フィールドキー、`schemaBinding` = { fieldId } を自動設定 |
| 既存の dataField/text/checkbox 要素 | 既存要素の `schemaBinding` を自動設定（バインドタブでの接続と同じ効果） |

### 機能C: detailフィールドを繰り返しバンドにD&D

| ドロップ先 | 動作 |
|-----------|------|
| 既存の repeatingBand 要素 | `fields` 配列に新列を追加 (key=fieldKey, label=fieldLabel, width=デフォルト) + `dataSource` をdetailグループの `dataKey` に自動設定 |

---

## Why This Approach

1. **ワークフローの短縮**: 現状はバインドタブで接続→デザインタブで要素を手動配置→プロパティでfieldKey設定という3ステップ。D&Dなら1ステップで完了
2. **直感的な操作**: スキーマ定義が視覚的に使える。フィールド名を見てそのままドロップするだけ
3. **既存パターンとの整合性**: パレットからのD&D（`application/rds-palette` MIME type）は既に実装済み。同じ仕組みを拡張するだけ

---

## Key Decisions

1. **フィールドD&Dは常に dataField 要素を作成**: フィールド型（string/number/date）に関わらず dataField で統一。シンプルさ優先
2. **既存要素へのドロップ = 自動バインド**: 既存の dataField/text/checkbox に重ねてドロップすると schemaBinding を設定（バインドタブの接続と同効果）
3. **detailフィールド → repeatingBand = 列追加 + dataSource自動設定**: フィールドをバンドにドロップすると fields に列を追加し、dataSource をグループの dataKey に自動設定
4. **パレットとスキーマタブの両方に表示**: 要素パレットの末尾にセクション追加 + 左サイドバーに「スキーマ」タブ追加
5. **DnD MIME type は `application/rds-schema-field` を新設**: パレットの `application/rds-palette` と区別する。ペイロードは `{ fieldId, groupId, fieldKey, fieldLabel, groupRole, groupDataKey }` の JSON

---

## Technical Design

### D&D データフロー

```
ドラッグ開始 (パレット or スキーマタブ)
  → dataTransfer.setData('application/rds-schema-field', JSON.stringify({
      fieldId, groupId, fieldKey, fieldLabel, groupRole, groupDataKey
    }))
  ※ JSON.parse は try/catch でガードする

ドロップ先判定 (ReportCanvas.onDrop) — ヒットテスト優先順位:
  1. application/rds-schema-field がある → スキーマフィールドD&D処理に入る
  2. ドロップ座標の最前面要素を取得 (zIndex順)
     a. 最前面が dataField/text/checkbox → 既存要素の schemaBinding を設定
     b. 最前面が repeatingBand → fields に列追加 + dataSource を groupDataKey に設定
     c. 最前面要素なし or 上記以外 → 新規 dataField 要素作成 (fieldKey + schemaBinding設定)
```

**ルール:** 要素が重なっている場合は最前面（zIndex最大）の要素を優先。repeatingBand内にdataFieldがある場合、dataFieldの方がzIndexが高ければバインド、repeatingBandの方が高ければ列追加。

### 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `paletteData.tsx` | 末尾に「スキーマフィールド」カテゴリ追加（ストアから動的生成） |
| `ElementPalette.tsx` | スキーマフィールドセクション描画 + ドラッグハンドラ追加 |
| 新規: `SchemaFieldsTab.tsx` | 左サイドバー「スキーマ」タブの内容 |
| `App.tsx` or サイドバー | タブに「スキーマ」追加 |
| `ReportCanvas.tsx` | onDrop に `application/rds-schema-field` ハンドラ追加 |
| `elementFactories.ts` | `createDataFieldFromSchema(field)` ファクトリ追加 |

---

## Resolved Questions

- **Q: フィールドD&D時にサイズは？** → dataField のデフォルトサイズ（40×8mm程度）を使用
- **Q: repeatingBand にドロップした列の幅は？** → デフォルト20mmで追加。PropertiesPanel で調整
- **Q: master vs detail フィールドの区別は？** → パレット/タブ上でグループ名とroleバッジで表示。D&D時のデータに groupRole を含める
- **Q: スキーマが未定義の場合は？** → パレットのスキーマセクションは非表示。スキーマタブは「バインドタブでスキーマを定義してください」の空状態を表示

---

## Open Questions

(なし — すべて解決済み)
