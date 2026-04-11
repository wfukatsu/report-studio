---
title: スキーマ ↔ データベース バインド機能
date: 2026-04-10
status: brainstorm
related:
  - ../../../report-design-studio/ (v1 参照実装)
  - src/store/schemaSlice.ts
  - server/ (Javalin + ScalarDB 3.14)
---

# スキーマ ↔ データベース バインド機能 ブレインストーム

## What We're Building

ReportDefinition 内の `SchemaDefinition`（master/detail グループ + fields）を
**ScalarDB の実テーブルと紐付け**、プレビュー/エクスポート時に
バックエンド経由で実データを解決してレンダリングできるようにする。併せて、
計算フィールドと、schema field ↔ report element のビジュアル接続 UI を提供する。

v1 (`report-design-studio`) に既に完動する実装があるので、**型・UI パターン・
バックエンド構成をそのままパリティ移植**する方針。

## Why This Approach

- v1 は本番で使われており、設計（SchemaGroup + tableMeta、BindingConnection、
  ComputedExpression AST、BindingMapper、ConnectionLines）が実証済み
- v2 の `schemaSlice` は既に v1 と近い型（groups/role/fields/dataKey）を持つので、
  型の差分追加と UI/バックエンドの移植が中心となる（詳細は後述の Feature Scope 参照）
- v2 の server/ は既に ScalarDB 3.14 + Javalin 6 で動いているので、
  JDBC 抽象化は不要 → **ScalarDB のみ**にスコープを絞ることで実装量を削減

## Key Decisions

| 項目 | 決定 |
|---|---|
| **対象 DB** | ScalarDB のみ（汎用 JDBC は将来検討） |
| **スコープ** | DB バインド / 要素バインド / computed fields / visual mapper の 4 本立て（全部入り） |
| **実データ取得タイミング** | Preview / Export 時のみ。デザイン時はサンプル JSON のまま |
| **テーブル作成** | Phase 1 は既存テーブルへのバインドのみ。UI からの新規テーブル作成 (DDL 発行 + status マシン) は Phase 1.5 に分離 |
| **永続化先** | 独立の projection API (`/api/v2/templates/{id}/projection`) を新設 |
| **Computed field エディタ** | Visual AST エディタを主、テキスト式入力をフォールバック |
| **フェーズ分け** | 段階的に 4 フェーズ (1 / 1.5 / 2 / 3) で実装 |

## Feature Scope (4本立て)

### 1. DB バインド（SchemaGroup ↔ Table）
- `SchemaGroup.tableMeta?: { namespace, tableName, status: 'draft'|'creating'|'created'|'error' }`
- `SchemaField` 拡張: `columnName?`, `scalarType?` (INT/BIGINT/FLOAT/DOUBLE/TEXT/BOOLEAN/BLOB),
  `keyType?` ('partition'|'clustering'|'column'|'index')
- UI: `DBPanel`（SchemaPanel 内のタブとして追加）
- **Phase 1 は「既存テーブルへのバインドのみ」**。UI からのテーブル新規作成 (DDL 発行 + status マシン) は Phase 1.5 に分離

### 2. 要素バインド（SchemaField ↔ ReportElement）
- `BindingConnection { fieldId, elementId }` を ReportDefinition に保持
- 現状の `{{fieldKey}}` トークン方式と共存（legacy）
- バインド済み要素は ElementRenderer でフィールド値を解決

### 3. Computed Fields
- `ComputedField { kind: 'computed', id, name, type, expression: { formula: string, visual?: VisualExpression, resultType } }`
- VisualExpression: AST（関数呼び出し、算術/比較/論理、field ref、literal）
- 対応関数（初期）: SUM / COUNT / AVG / MIN / MAX / IF / CONCAT / FORMAT_DATE / FORMAT_NUMBER
- バックエンドで JEXL 評価（v2 の `ExpressionEngine` を利用。AST → JEXL 式への変換層のみ追加）

### 4. Visual Mapper（ドラッグ接続 UI）
- `BindingMapper` ページ: 左にスキーマフィールド、右にレポート要素、中央に SVG 接続線
- v1 の `BindingMapper` + `ConnectionLines` を移植
- ツールバーのボタンからモーダルで開く（専用ルートは使わない）

## Backend Work (/api/v2)

- `POST /schemas` — スキーマ作成、field 定義から DDL 生成
- `PUT /schemas/{id}` — tableMeta 更新（status 遷移）
- `GET/PUT /templates/{id}/projection` — BindingConnection[] と computedFields を JSON ブロブで保存
- `POST /evaluate` — ReportDefinition + query params → 解決済みデータを返す。
  レスポンス形: `{ master: { [groupId]: Record<fieldKey, value> }, detail: { [groupId]: Array<Record<fieldKey, value>> } }`
- `ExpressionEngine` を computed field 評価に拡張

## Phasing

### Phase 1 — DB バインド基盤（既存テーブルのみ）
- 型拡張（SchemaGroup.tableMeta, SchemaField.columnName/scalarType/keyType）
- `DBPanel` UI（SchemaPanel のタブ）
- ScalarDB の既存 namespace/table 一覧取得 API
- **Deliverable**: 既存 ScalarDB テーブルにスキーマグループを紐付けできる
  （紐付け情報は保存されるが、実データがレポートに反映されるのは Phase 2 以降）

### Phase 1.5 — UI からのテーブル新規作成
- `POST/PUT /schemas` + DDL 生成
- draft → creating → created/error のステータスマシン
- **Deliverable**: デザイナー画面からテーブルを作成できる

### Phase 2 — 要素バインド + 実データ解決
- `BindingConnection[]` 型追加 + ReportDefinition 統合
- `/api/v2/templates/{id}/projection` エンドポイント
- `POST /api/v2/evaluate` （ScalarDB から実データ取得 → 解決済み値返却）
- Preview/Export フローで evaluate を呼び出す
- **Deliverable**: プレビュー時に実 DB データが表示される

### Phase 3 — Computed fields + Visual mapper
- ComputedField 型 + Visual AST エディタ
- テキスト式フォールバック入力
- `BindingMapper` + `ConnectionLines` 移植
- ExpressionEngine で computed 評価
- **Deliverable**: 計算フィールドとビジュアル接続 UI が使える

## Open Questions

- **master ↔ detail の 1:N 関係クエリ方法**: detail グループをどのキーで master に結合するか。
  ScalarDB に JOIN はないので、フィールドに `parentKey` 参照を持たせてアプリ側で結合するか、
  クラスタリングキーの階層構造を使うか。v1 の実装パターンを調査して plan で確定する
- **master グループの検索条件**: プレビュー時に「どの行を取得するか」をどう指定するか
  （固定 partition key / URL パラメータ / モーダルで選択） — plan で決定

## Next Step

`/workflows:plan` で **Phase 1（DB バインド基盤）** の実装計画を作成する。
