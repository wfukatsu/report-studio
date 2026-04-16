# Brainstorm: テンプレート保存アーキテクチャ — スキーマライブラリ方式

**Date:** 2026-04-16
**Status:** Approved
**Author:** Claude Code + Fukatsu

---

## What We're Building

テンプレートの保存アーキテクチャを拡張し、スキーマ定義（データモデル + DBバインディング）を独立した「スキーマライブラリ」として保存・再利用可能にする。

### 現状のV2アーキテクチャ

```
v2_definitions テーブル
  └── JSON blob
      ├── metadata, pageSettings, pages[] (レイアウト)
      ├── schema (スキーマ定義 — 埋め込み)
      ├── dataSources[] (サンプルデータ)
      └── calculationRules[], validationRules[]
```

- スキーマはテンプレートJSONの中に埋め込み
- テンプレートは `created_by` でユーザー別管理
- ビルトインテンプレートはフロントエンドの `builtinTemplates.ts` に静的定義

### 拡張後のアーキテクチャ

```
v2_definitions テーブル (既存・変更なし)
  └── JSON blob (スキーマは引き続き埋め込み)

v2_schema_library テーブル (新設)
  ├── id (PK)
  ├── name — スキーマの名前（例: "見積書スキーマ v1.2"）
  ├── json_data — SchemaDefinition + dataSources のJSON
  ├── created_by — 作成者ユーザーID
  ├── visibility — 'private' | 'shared'
  ├── created_at — 作成日時
  ├── updated_at — 更新日時
  └── group_key — ScalarDB secondary index 用（将来のマルチテナント対応予約。当面は created_by と同値）
```

### テンプレートの2種類

| 種類 | 保存場所 | 管理者 | 備考 |
|------|----------|--------|------|
| ビルトインテンプレート | バックエンドのシードデータ or 管理者がアップロード | 管理者(admin) | 全ユーザーに表示。管理者のみ編集可能 |
| ユーザーテンプレート | v2_definitions (created_by = userId) | 各ユーザー | 作成者のみに表示 |

---

## Why This Approach

### コピーオンライト方式の理由

スキーマをテンプレートに「リンク」する方式（参照ID方式）は、共有スキーマの変更が全テンプレートに即反映される。これは:
- 意図しないレイアウト破壊のリスクがある（フィールド名変更でバインドが切れる）
- テンプレートの独立性が損なわれる
- マイグレーションが複雑

**コピーオンライト方式なら**:
- スキーマライブラリから「適用」するとテンプレートにコピーされる
- テンプレート内のスキーマを変更しても、ライブラリの元スキーマには影響しない
- 既存のv2_definitionsのJSON構造を一切変更しない
- 逆方向も可能: テンプレートのスキーマをライブラリに「保存」

### V2との互換性

- v2_definitions テーブルは変更なし
- 既存のテンプレート保存/読み込みAPIは変更なし
- スキーマライブラリは独立した新APIとして追加
- フロントエンドのスキーマ適用/保存はUIアクションとして追加

---

## Key Decisions

1. **コピーオンライト方式**: スキーマはライブラリから「コピー」してテンプレートに適用。参照リンクではない。安全で既存互換
2. **v2_schema_library テーブル新設**: 名前付きスキーマの保存庫。SchemaDefinition + dataSources をJSON保存
3. **visibility: 'private' | 'shared'**: プライベート（自分のテンプレート間で再利用）と共有（テナント全体で公開）を切り替え可能
4. **ビルトインテンプレートのスキーマは管理者のみ編集可能**: admin ロールのユーザーがビルトインテンプレートのスキーマを更新可能。一般ユーザーはコピーのみ
5. **既存v2_definitions は変更なし**: スキーマは引き続きテンプレートJSON内に埋め込み。ライブラリとの紐付けはフロントエンド側でコピー操作として実現

---

## Operations

### スキーマの操作フロー

| 操作 | 説明 |
|------|------|
| **ライブラリに保存** | テンプレートのスキーマに名前を付けてライブラリに保存（POST /api/v2/schema-library） |
| **ライブラリから適用** | ライブラリのスキーマをテンプレートにコピー（フロントエンドでsetSchema()） |
| **ライブラリ一覧** | 自分のスキーマ + 共有スキーマを一覧表示（GET /api/v2/schema-library） |
| **ライブラリ更新** | 保存済みスキーマを更新（PUT /api/v2/schema-library/{id}） |
| **ライブラリ削除** | スキーマをライブラリから削除（DELETE /api/v2/schema-library/{id}） |
| **テンプレートからエクスポート** | テンプレートのスキーマをJSONファイルとしてダウンロード |
| **JSONからインポート** | JSONファイルからスキーマをテンプレートに適用 |

### API エンドポイント（新設）

```
GET    /api/v2/schema-library          — 一覧（自分の + shared）
POST   /api/v2/schema-library          — 保存
GET    /api/v2/schema-library/{id}     — 取得
PUT    /api/v2/schema-library/{id}     — 更新
DELETE /api/v2/schema-library/{id}     — 削除
```

### スキーマライブラリのJSON構造

```json
{
  "schema": {
    "groups": [
      {
        "id": "...",
        "label": "取引先情報",
        "role": "master",
        "dataKey": "company",
        "fields": [...],
        "tableMeta": { "namespace": "...", "tableName": "..." }
      }
    ]
  },
  "dataSources": [
    {
      "id": "...",
      "name": "サンプルデータ",
      "fields": { ... }
    }
  ]
}
```

---

## Resolved Questions

- **Q: ビルトインテンプレートはどこに保存？** → バックエンドのシードデータとして `v2_definitions` に保存。`created_by` を `__system__` で区別。シードはバックエンド起動時に `ensureBuiltinTemplates()` で投入（既存ならスキップ）。管理者はUIから追加テンプレートをビルトインとして登録可能。全ユーザーに表示されるが、admin ロールのみ編集可能
- **Q: スキーマライブラリのアクセス制御は？** → `created_by` で所有者チェック。`visibility: 'shared'` のスキーマは全ユーザーが読み取り可能（編集は作成者のみ）
- **Q: テンプレートのスキーマ変更がライブラリに影響するか？** → しない（コピーオンライト）。テンプレート内のスキーマは独立したコピー
- **Q: 同じスキーマをライブラリに二重保存できるか？** → 名前の重複チェックはしない。IDで区別

---

## Open Questions

(なし — すべて解決済み)

---

## References

### 既存のバックエンド構造
- V2テンプレートAPI: `server/src/main/java/com/report/server/V2TemplateController.java`
- V2保存テーブル: `v2_definitions` (ScalarDB)
- JsonBlobRepository: `server/src/main/java/com/report/server/JsonBlobRepository.java`
- V1スキーマ分離の先行実装: `schemas` テーブル, `GenericJsonController.java`
- APIルート定義: `server/src/main/java/com/report/server/ApiRoutes.java`
