# テンプレートエンベロープ仕様

Issue #52「テンプレートスキーマの単一ソース化」で統一された、`ReportDefinition` の交換・永続化形式の仕様。

## 正準エンベロープ (formatVersion: 2)

`ReportDefinition` をファイル・API・ストレージ間で受け渡す唯一の形式:

```json
{
  "formatVersion": 2,
  "definition": { ...ReportDefinition... }
}
```

- `formatVersion` — **単調増加の整数**。エンベロープまたは定義の形が非互換に変わるたびにインクリメントする
- `definition` — `ReportDefinition` 本体(スキーマは `schemas/report-definition.schema.json` を参照)
- 追加フィールドは文脈ごとに許容される(下表)。消費側は未知フィールドを無視すること

### 文脈ごとの拡張フィールド

| 文脈 | 追加フィールド | 備考 |
|------|--------------|------|
| ローカルエクスポート / 組み込みテンプレート (`.rds2.json`) | `exportedAt` (ISO 8601) | `exportToJSON()` / `GET /api/v2/templates/{id}/export` が生成 |
| API リソース表現 (GET/PUT レスポンス) | `id`, `name`, `createdAt` (ISO 8601), `updatedAt` (ISO 8601), `visibility` | `TemplateController.buildResourceEnvelope` |
| サーバ保存形 (`v2_definitions` テーブル) | `id`, `name`, `created_at` (epoch millis), `updated_at` (epoch millis), `created_by`, `visibility` | 内部永続化形式。snake_case + epoch millis は歴史的経緯であり、API 境界で ISO 8601 / camelCase に変換される |

## API 境界での取り扱い

| エンドポイント | リクエスト | レスポンス |
|---------------|-----------|-----------|
| `GET /api/v2/templates/{id}` | — | 正準エンベロープ(リソース表現) |
| `PUT /api/v2/templates/{id}` | 正準エンベロープ。**裸の `ReportDefinition` も非推奨形式として受理**(旧クライアント互換) | 正準エンベロープ(リソース表現) |
| `POST /api/v2/templates/import` | 正準エンベロープ **必須**(裸の定義は 400) | `{id, name}` |
| `GET /api/v2/templates/{id}/export` | — | 正準エンベロープ + `exportedAt` |
| `POST .../versions/{vid}/restore` | — | 正準エンベロープ(`formatVersion` + `definition` のみ) |

保存境界(PUT / import)では `ReportDefinitionValidator` による構造バリデーション(上限値)が必ず実行される。

## バージョン履歴とマイグレーションラダー

| version | 形式 | 判別条件 |
|---------|------|---------|
| 0 | 旧 `Report` JSON | マーカーなし、`id` + `pages[]` を持つ |
| 1 | 裸の `ReportDefinition` + `$schema: "report-definition/v1"` | `$schema` フィールド |
| 2 | `{formatVersion: 2, definition}` エンベロープ(現行) | 整数 `formatVersion` フィールド |

マイグレーションは **ラダー方式**(v0→v1→v2 と一段ずつ)で適用される:

- **フロントエンド**: `src/lib/migration.ts` の `detectFormatVersion()` + `MIGRATIONS` マップ。
  `importFromJSON()` が検出 → ラダー適用 → Zod バリデーション → 内容正規化(label→text 等)の順に処理する
- **サーバ**: `TemplateEnvelope.unwrap()` が v1(`$schema` マーカー)を v2 に引き上げる。
  v0(旧 `Report`)のマイグレーションは `migrateReport` の完全移植を要するため**クライアント側のみ**対応。サーバは v0 を構造チェックのみで受理する(PUT 互換経路)

### 前方互換ポリシー

`formatVersion` が現行値より大きいファイル/ボディは**常に拒否**する(部分的な読み込みは試みない)。バージョンを上げる場合は:

1. `src/lib/formatVersion.ts` の `FORMAT_VERSION` をインクリメント
2. `src/lib/migration.ts` の `MIGRATIONS` に v(N-1)→vN の変換を追加
3. `server/.../TemplateEnvelope.java` の `CURRENT_FORMAT_VERSION` と unwrap 分岐を更新
4. 本ドキュメントのバージョン履歴表を更新

## 定義スキーマの単一ソース

- 構造上限値: `schemas/report-definition-limits.json`(フロント Zod・サーバ `ReportDefinitionValidator` の両方が読む)
- JSON Schema: `schemas/report-definition.schema.json`(Zod スキーマから `npm run generate:schema` で生成)

詳細は `schemas/README.md` を参照。
