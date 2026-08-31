# オーサリング規約 — 違反すると黙って壊れるもの

`templates edit` は PUT の前にこれらを自動検査する（1〜3 はエラーで停止、4 は警告）。
いずれも **サーバー側の `ReportDefinitionValidator` では検出されない** ため、
保存は成功したのに画面や PDF に出ない、という形で表面化する。

---

## 1. 要素は `page.sections[N].elements` に置く

`Page.elements`（トップレベル）は `@deprecated` で、レンダラーに完全に無視される。
`PageDef` 型にはそもそも `elements` フィールドが無い。

```jsonc
// ✅ 正しい
{
  "id": "...", "name": "ページ 1", "background": "#ffffff",
  "width": 210, "height": 297,
  "sections": [
    { "id": "...", "sectionType": "body", "height": 297, "elements": [ /* ここ */ ] }
  ]
}

// ❌ 保存は通るが画面に出ない
{ "id": "...", "elements": [ /* 無視される */ ], "sections": [] }
```

`addElement` op は `sectionId` 省略時に最初の `body` セクションへ入れる。
セクションが 1 つも無いページには追加できない（`addPage` は body セクション付きで作る）。

`templates summary` はこの混入を検出して警告する。

---

## 2. スキーマパスは 2 階層まで

`dataKey.fieldKey` の 2 階層。両方とも `^[a-zA-Z_][a-zA-Z0-9_]*$`。

```
✅ customer.name     ✅ total        ❌ quotation.customer.name
```

3 階層のキーは**ネストしたサンプル JSON からは描画できてしまう**ので、エディタ上は
正しく見える。しかし DB バインドは不可能 — `buildFlatDataFromResolved` は各グループの
解決済み行を `data[dataKey]` に置くだけで、ネストした経路を再構築しない。
サンプルで動いて本番で空になる、という最悪の壊れ方をする。

---

## 3. 要素型は 24 種のみ

正は `schemas/element-types.json`（`npm run generate:schema` が生成、フロントの
`ReportElement` union とコンパイル時に固定され、サーバーの parity テストも読む）。

廃止済み:

| 旧 | 現行 | 備考 |
|----|------|------|
| `label` | `text` | ElementRenderer が読み込み時に自動変換 |
| `table` | `formTable` | 旧データは警告表示 |

---

## 4. スキーマの未知キーは import 時に除去される

`SchemaFieldSchema` / `SchemaGroupSchema` / `ScalarDbTableMetaSchema` は
**`.passthrough()` ではない**（ファイルの他の部分とは違う）。定義に無いキーは
テンプレート取り込み時（ビルトインロード・API ラウンドトリップ）に黙って落ちる。

明示的に許可されているキー:

| 対象 | 許可キー |
|------|---------|
| `schema.groups[]` | `id` `label` `role` `dataKey` `fields` `tableMeta` `linkedMasterGroupId` |
| `schema.groups[].fields[]` | `id` `key` `label` `type` `itemType` `dbColumnName` `computed` `expression` |
| `tableMeta` | `namespace` `tableName` |

新しいバインド用フィールドを増やすときは `src/lib/schemas/reportDefinition.ts` にも
足したうえで `npm run generate:schema` を走らせる必要がある。

---

## design と preview の差は `readonly` フラグ 1 本

同じ `data` を解決するので**値は同一**。違うのは見せ方だけ。PDF は preview 側と揃う。

| 挙動 | エディタ (`readonly=false`) | プレビュー / PDF (`readonly=true`) |
|------|---------------------------|----------------------------------|
| 空バインド要素 | プレースホルダを表示 | **何も描画しない** |
| `repeatingBand` / `repeatingList` / `formTable` | 設計プレビュー（モック行・`{{key}}`・バッジ） | `dataSource` があれば実データ行 |
| `pageNumber` / `currentDate` / `tenant*` | トークンや書式のまま | 解決値 |
| `tenant*` で値も `fallback` も未設定 | 設計上の表示あり | **何も描画しない**（サーバー PDF と一致） |
| サンプルヒント（点線下線・「サンプル」バッジ） | あり | なし |

「エディタでは見えるのに PDF で消える」の原因はほぼこの表のどれか。

---

## その他

- 生成時のデフォルト文言は**作成時の UI 言語**に従う（`i18n.t()` 経由）。ただし
  **サーバーが永続化する**デフォルト名（「新しいテンプレート」「 (コピー)」「(インポート)」）は ja 固定
- サーバーの人間可読メッセージはすべて ja 固定。機械可読なのは `code`（UPPER_SNAKE）の側
- テンプレートの交換形式は正準エンベロープ `{formatVersion: 2, definition}`。
  `POST /api/v2/templates/import` は裸の定義を 400 で弾く（CLI が自動で包む）。
  `PUT /api/v2/templates/{id}` は互換のため裸も受理する
- `formatVersion` が現行より大きいファイルは常に拒否（部分読み込みは試みない）
