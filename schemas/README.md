# schemas/ — ReportDefinition スキーマの単一ソース

Issue #52「テンプレートスキーマの単一ソース化」の成果物。エンベロープ仕様は `docs/template-envelope-spec.md` を参照。

## ファイル

### `report-definition-limits.json`(手書き・単一ソース)

`ReportDefinition` の構造上限値。**ここだけを編集する**。消費側:

- **フロントエンド**: `src/lib/schemas/limits.ts` が JSON import で読み、Zod スキーマ(`reportDefinition.ts`)の `.max()` に適用
- **サーバ**: `server/build.gradle.kts` の `processResources` がリソースにバンドルし、`ReportDefinitionValidator` がクラス初期化時に読み込む(欠損時は同値のフォールバック定数)

双方の同期は `ReportDefinitionValidatorTest.limitsMatchSharedLimitsFile`(Java)と `jsonSchema.test.ts`(TS)が担保する。

### `shared-constants.json`(手書き・単一ソース、#425)

ScalarDB 識別子の制約や商品マスター system group ID など、フロントとサーバで共有する定数の単一ソース。**ここだけを編集する**。消費側:

- **フロントエンド**: `src/lib/scalardbIdentifier.ts` / `src/lib/schemas/reportDefinition.ts` / `src/store/systemGroups.ts` が JSON import で読む
- **サーバ**: 同値を mirror する

### `report-definition.schema.json` / `element-types.json`(生成物・編集禁止)

いずれも `npm run generate:schema`(`scripts/generate-json-schema.ts`)が出力する:

- `report-definition.schema.json` — Zod スキーマ(`src/lib/schemas/reportDefinition.ts`)から生成した JSON Schema (draft 2020-12)。外部ツールやドキュメントとして利用できる。
- `element-types.json` — `ReportElement` union(`ELEMENT_TYPES`)から生成した要素タイプ一覧(#415)。

再生成:

```bash
npm run generate:schema
```

チェックイン済みコピーと Zod スキーマの乖離は `src/lib/schemas/jsonSchema.test.ts` のドリフトテストが検出する(Zod スキーマを変更したら再生成してコミットすること)。
