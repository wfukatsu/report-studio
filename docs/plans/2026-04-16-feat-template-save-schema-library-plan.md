---
title: "feat: テンプレート保存アーキテクチャ — スキーマライブラリ"
type: feat
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-template-save-architecture-brainstorm.md
---

# feat: テンプレート保存アーキテクチャ — スキーマライブラリ

## Overview

スキーマ定義（データモデル + DBバインディング + サンプルデータ）を独立した「スキーマライブラリ」として保存・再利用可能にする。コピーオンライト方式で既存テーブル変更なし。

(see brainstorm: docs/brainstorms/2026-04-16-template-save-architecture-brainstorm.md)

## Problem Statement

現状、スキーマはテンプレートJSON内に埋め込まれているため:
- 同じスキーマを使う複数テンプレート（見積書・請求書・納品書）でスキーマを個別に定義する必要がある
- レイアウトを変更しようとしてスキーマまでリセットしてしまうリスク
- チーム内でスキーマ定義を共有する仕組みがない

## Proposed Solution

### コピーオンライト方式（brainstorm Decision #1）

```
v2_definitions テーブル (既存・変更なし)
  └── テンプレートJSON（スキーマは引き続き埋め込み）

v2_schema_library テーブル (新設)
  └── 名前付きスキーマの保存庫
```

- **適用**: ライブラリからスキーマを選択 → テンプレートにコピー
- **保存**: テンプレートのスキーマをライブラリに名前付きで保存
- **共有**: `visibility: 'private' | 'shared'` で制御

## Implementation Tasks

### Phase 1: バックエンド — SchemaLibraryController

- [ ] `JsonBlobRepository` インスタンスを `AppWiring` に追加
  ```java
  // server/src/main/java/com/report/server/AppWiring.java
  final JsonBlobRepository schemaLibraryRepo =
      new JsonBlobRepository(factory, NAMESPACE, "schema_library");
  schemaLibraryRepo.ensureTable();
  final SchemaLibraryController schemaLibraryCtrl =
      new SchemaLibraryController(schemaLibraryRepo);
  ```

- [ ] `SchemaLibraryController.java` を新規作成 — V2TemplateController パターンに準拠
  ```
  server/src/main/java/com/report/server/SchemaLibraryController.java
  ```
  - エンベロープ構造:
    ```json
    {
      "id": "uuid",
      "name": "見積書スキーマ v1.2",
      "created_at": 1234567890,
      "updated_at": 1234567890,
      "created_by": "user-id",
      "visibility": "private",
      "definition": {
        "schema": { "groups": [...] },
        "dataSources": [...]
      }
    }
    ```
  - `list(ctx)`: 自分の + visibility='shared' のスキーマを返す
  - `create(ctx)`: POST body から name + definition を受け取り保存
  - `get(ctx)`: 所有者チェック or visibility='shared' で読み取り許可
  - `put(ctx)`: 所有者のみ更新可能
  - `delete(ctx)`: 所有者のみ削除可能。204返却

- [ ] `ApiRoutes.java` にルート登録
  ```java
  // server/src/main/java/com/report/server/ApiRoutes.java
  private static void registerSchemaLibraryRoutes(Javalin app, AppWiring w) {
      app.get("/api/v2/schema-library", w.schemaLibraryCtrl::list);
      app.post("/api/v2/schema-library", w.schemaLibraryCtrl::create);
      app.get("/api/v2/schema-library/{id}", w.schemaLibraryCtrl::get);
      app.put("/api/v2/schema-library/{id}", w.schemaLibraryCtrl::put);
      app.delete("/api/v2/schema-library/{id}", w.schemaLibraryCtrl::delete);
  }
  ```

### Phase 2: フロントエンド — API クライアント

- [ ] `src/api/reportApi.ts` にスキーマライブラリAPI関数を追加
  ```typescript
  // src/api/reportApi.ts
  export interface SchemaLibraryItem {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    visibility: 'private' | 'shared'
  }
  export interface SchemaLibraryDefinition {
    schema: SchemaDefinition
    dataSources: DataSourceDefinition[]
  }
  export async function listSchemaLibrary(): Promise<SchemaLibraryItem[]>
  export async function getSchemaLibrary(id: string): Promise<SchemaLibraryDefinition>
  export async function saveToSchemaLibrary(name: string, definition: SchemaLibraryDefinition, visibility: 'private' | 'shared'): Promise<{id: string}>
  export async function updateSchemaLibrary(id: string, name: string, definition: SchemaLibraryDefinition, visibility: 'private' | 'shared'): Promise<void>
  export async function deleteSchemaLibrary(id: string): Promise<void>
  ```

### Phase 3: フロントエンド — スキーマライブラリUI

- [ ] `src/components/modals/SchemaLibraryModal.tsx` を新規作成
  - スキーマ一覧（自分の + shared）
  - 各スキーマの名前・グループ数・フィールド数・visibility バッジ
  - 「適用」ボタン → テンプレートの `schema` と `dataSources` をコピーで置換
  - 「削除」ボタン（所有者のみ）

- [ ] バインドタブに「スキーマライブラリ」アクションを追加
  - `BindingEditor.tsx` のヘッダーに2つのボタン:
    - 「ライブラリに保存」→ 名前入力ダイアログ → `saveToSchemaLibrary()`
    - 「ライブラリから適用」→ `SchemaLibraryModal` を表示 → 選択 → `setSchema()` で schema を置換（dataSources は store の既存 setter を確認し、なければ追加）

- [ ] データ設定モーダル（`DataBindingModal.tsx`）にもスキーマライブラリへのリンクを追加

### Phase 4: ビルトインテンプレートのバックエンド管理（別PR推奨）

> **Note:** Phase 1-3（スキーマライブラリ）とは独立した機能。別PRに分離してもよい。

- [ ] `V2TemplateController` に `created_by = '__system__'` のビルトインテンプレート対応を追加
  - `list()`: `__system__` のテンプレートは全ユーザーに表示
  - `put()`: admin ロールのみ `__system__` テンプレートを更新可能
  - `delete()`: admin ロールのみ削除可能

- [ ] `AppWiring` に `ensureBuiltinTemplates()` メソッドを追加
  - 起動時にビルトインテンプレートが `v2_definitions` に存在するか確認
  - 存在しなければシードデータとして投入
  - 既存ならスキップ（上書きしない）

- [ ] フロントエンドの `builtinTemplates.ts` からバックエンド保存へ移行パスを用意
  - Phase 1 では `builtinTemplates.ts` は残す（フォールバック）
  - バックエンドにビルトインが保存されていればそちらを優先

### Phase 5: ビルド検証 + テスト

- [ ] バックエンド: `npm run test:backend` でエラーなし
- [ ] フロントエンド: `npm run build` でエラーなし
- [ ] 手動検証:
  - スキーマをライブラリに保存できる
  - ライブラリからスキーマをテンプレートに適用できる
  - 適用後にテンプレートのスキーマを変更してもライブラリは変わらない
  - shared スキーマが他ユーザーに表示される
  - ビルトインテンプレートが全ユーザーに表示される

## Acceptance Criteria

### バックエンド
- [ ] `schema_library` テーブルが起動時に自動作成される
- [ ] CRUD API (5エンドポイント) が動作する
- [ ] list は自分の + shared を返す（他ユーザーの private は非表示）
- [ ] 所有者チェックで 404 を返す（403 ではなく）
- [ ] ビルトインテンプレート (`__system__`) が全ユーザーに表示される
- [ ] ビルトインの編集は admin ロールのみ

### フロントエンド
- [ ] バインドタブに「ライブラリに保存」「ライブラリから適用」ボタンが表示される
- [ ] スキーマライブラリモーダルで一覧・適用・削除ができる
- [ ] 適用時はコピーオンライト（テンプレートのスキーマが置換される）
- [ ] visibility の切り替え（private/shared）ができる

## Technical Considerations

### 既存パターンとの整合性

| 項目 | 既存パターン (V2TemplateController) | 新実装 (SchemaLibraryController) |
|------|-------------------------------------|----------------------------------|
| テーブル | `v2_definitions` | `schema_library` |
| リポジトリ | `JsonBlobRepository` | 同じ `JsonBlobRepository` |
| エンベロープ | `{id, name, created_at, updated_at, created_by, definition}` | `{id, name, created_at, updated_at, created_by, visibility, definition}` |
| 所有者チェック | `isOwner()` | 同パターン + `visibility='shared'` で読み取り許可 |
| ID | UUID | UUID |
| タイムスタンプ | `System.currentTimeMillis()` | 同じ |

### visibility の list フィルタロジック

```java
// SchemaLibraryController.list()
List<String> all = repo.list();
String userId = getPrincipalUserId(ctx);
return all.stream()
    .filter(json -> {
        var node = mapper.readTree(json);
        String createdBy = node.path("created_by").asText("");
        String visibility = node.path("visibility").asText("private");
        return createdBy.equals(userId) || "shared".equals(visibility);
    })
    .collect(toList());
```

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| ScalarDB テーブルスキャンの遅さ | スキーマライブラリは件数が少ない（数十件）ため許容。将来 `group_key` インデックスで最適化可能 |
| ビルトインテンプレートのシードデータ破損 | `ensureBuiltinTemplates()` は既存チェック後にのみ挿入。上書きしない |
| 共有スキーマの乱立 | UI上で `visibility` の切り替えを明確にし、shared はデフォルトOFF |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-16-template-save-architecture-brainstorm.md](docs/brainstorms/2026-04-16-template-save-architecture-brainstorm.md) — Key decisions: コピーオンライト方式, v2_schema_library新設, visibility制御, ビルトイン=__system__

### Internal References

- V2TemplateController: `server/src/main/java/com/report/server/V2TemplateController.java`
- JsonBlobRepository: `server/src/main/java/com/report/server/JsonBlobRepository.java`
- AppWiring: `server/src/main/java/com/report/server/AppWiring.java`
- ApiRoutes: `server/src/main/java/com/report/server/ApiRoutes.java`
- GenericJsonController (V1パターン): `server/src/main/java/com/report/server/GenericJsonController.java`
- フロントエンドAPI: `src/api/reportApi.ts`
- バインドエディタ: `src/components/bindingEditor/BindingEditor.tsx`
