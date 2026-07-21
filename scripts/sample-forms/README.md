# サンプル帳票（一般的な帳票 5 種 + 継続ページ実演 1 種）

GUI で後から編集できるフラットな構造のサンプルテンプレートと、そのライブバインド先の
ScalarDB サンプルスキーマ・サンプルデータ一式。

| ファイル | 帳票 | バインド先テーブル |
|----------|------|--------------------|
| `templates/invoice.json` | 御請求書 | `demo.invmod_header` / `demo.invmod_items` |
| `templates/quotation.json` | 御見積書 | `demo.quomod_header` / `demo.quomod_items` |
| `templates/purchase-order.json` | 御注文書 | `demo.pomod_header` / `demo.pomod_items` |
| `templates/delivery-note.json` | 納品書 | `demo.delivery_header` / `demo.delivery_items` |
| `templates/receipt.json` | 領収書 | `demo.receipt_header`（明細なし） |
| `templates/band-flow.json` | 売上明細一覧（継続ページ） | `demo.bandflow_header` / `demo.bandflow_items` |

`band-flow.json` は **継続ページ（バンドフロー）の実演用**: 明細 40 行を行高 7mm ×
バンド枠高 112mm（容量 15 行/頁）にバインドしており、サーバ PDF 出力で 3 ページ
（15+15+10 行）に自動分割される。デザイナー上では同じ式によるあふれ警告バッジが表示され、
静的要素（タイトル・宛名等）とバンドヘッダは全ページに繰返し描画、`pageNumber` 要素は
`1 / 3` … と展開される。仕様は `docs/pagination-spec.md`「V2 バンドフロー」を参照。

## 構成

- **スキーマ**: フラット 2 階層（`dataKey.fieldKey`）。各グループに `tableMeta.tableName`、各
  フィールドに `dbColumnName` を設定済み。ヘッダはサロゲート PK `report_id`（`doc_no` は一意の
  業務列）。補助マスター（顧客・集計・振込先）と明細は `linkedMasterGroupId` で主マスターに
  リンクし、プレビュー時に `report_id` を自動補完する。
- **要素**: すべて `page.sections[0].elements` に格納。`dataField` の `fieldKey`、`repeatingBand`
  の `dataSource`／`fields` などバインド系プロパティは GUI からそのまま編集可能。
- **サンプルデータ**: `dataSources[0]`（デザイン時プレビュー用）＋ `db-seed.json`（ライブプレビュー
  用の実テーブル行）。両者の値は一致。

## コマンド

```bash
# テンプレJSON と db-seed.json を再生成（冪等）
npm run build:samples

# バックエンド起動後、テーブル作成＋行投入＋テンプレを public 保存（冪等）
npm run dev:backend        # 別ターミナルで :8080 を起動
npm run seed:samples
```

`seed:samples` 後、アプリの「テンプレート」モーダル → 公開テンプレート から読み込むと
`currentTemplateId` が付与され、ライブプレビューパネルで `doc_no` から実データを取得できる。

## 生成の仕組み

`build.mjs` は請求書テンプレートを土台に納品書を機械変換し（振込先・支払期限ブロック除去、
納品日追加、`delivery_*` へ再結線）、領収書を新規構築する。請求書・見積書・発注書は
git 履歴の "modern" 版を土台にクリーン化（商品ルックアップ `relations` を除去）したもの。
