# schemas/ — ReportDefinition スキーマの単一ソース

Issue #52「テンプレートスキーマの単一ソース化」の成果物。エンベロープ仕様は `docs/template-envelope-spec.md` を参照。

## ファイル

### `report-definition-limits.json`(手書き・単一ソース)

`ReportDefinition` の構造上限値。**ここだけを編集する**。消費側:

- **フロントエンド**: `src/lib/schemas/limits.ts` が JSON import で読み、Zod スキーマ(`reportDefinition.ts`)の `.max()` に適用
- **サーバ**: `server/build.gradle.kts` の `processResources` がリソースにバンドルし、`ReportDefinitionValidator` がクラス初期化時に読み込む(欠損時は同値のフォールバック定数)

双方の同期は `ReportDefinitionValidatorTest.limitsMatchSharedLimitsFile`(Java)と `jsonSchema.test.ts`(TS)が担保する。

### `report-definition.schema.json`(生成物・編集禁止)

Zod スキーマ(`src/lib/schemas/reportDefinition.ts`)から生成した JSON Schema (draft 2020-12)。外部ツールやドキュメントとして利用できる。

再生成:

```bash
npm run generate:schema
```

チェックイン済みコピーと Zod スキーマの乖離は `src/lib/schemas/jsonSchema.test.ts` のドリフトテストが検出する(Zod スキーマを変更したら再生成してコミットすること)。
