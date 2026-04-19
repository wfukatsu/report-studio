---
title: "feat: Schema CRUD API & Frontend Integration"
type: feat
status: completed
date: 2026-04-19
origin: docs/brainstorms/2026-04-19-schema-crud-api-integration-brainstorm.md
---

## Enhancement Summary

**Deepened on:** 2026-04-19
**Sections enhanced:** 7
**Research agents used:** architecture-review, security-review, zustand-patterns, javalin-patterns, learnings-check

### Key Improvements
1. **楽観的ロック追加**: `updated_at` ベースのバージョンチェック + 409 Conflict レスポンス
2. **POST-in-flight ガード**: 新規作成中の二重PUT防止メカニズム
3. **GET レスポンス修正**: definition だけでなくフルエンベロープ（name, visibility, updatedAt）を返す
4. **バックエンド定義バリデーション**: フロントZodだけでなくサーバー側でもサイズ・構造検証
5. **productSlice パターン採用**: tenantSlice ではなく、productSlice の stale-fetch guard + error state パターンを採用

### New Considerations Discovered
- GET /{id} にも認可チェックが必要（private スキーマの IDOR 防止）
- `listByGroupKey` で一覧取得パフォーマンス改善
- `sonner` トーストは store ではなく UI hook 層で呼び出す
- route 移行時のリダイレクトシム必要

---

# feat: Schema CRUD API & Frontend Integration

## Overview

フロントエンドの `schemaSlice`（Zustand）とバックエンドのスキーマAPIを接続し、スキーマのグループ・フィールドをフルCRUD（作成・読み取り・更新・削除）でAPI経由で永続化する。既存の2つのスキーマAPI（`/api/v1/schemas` と `/api/v2/schema-library`）を統合し、`/api/v2/schemas` に一本化する。

(see brainstorm: docs/brainstorms/2026-04-19-schema-crud-api-integration-brainstorm.md)

## Problem Statement / Motivation

現在の `schemaSlice` はフロントエンドのローカル状態のみで動作しており、ページリロードやセッション終了でスキーマ定義が失われる。バックエンドには2つのスキーマAPI（v1とv2）が存在するが、フロントエンドとは未接続。これを統合し、スキーマの永続化・共有を実現する。

## Proposed Solution

### API設計: 全体更新方式（Whole-Document PUT）

バックエンドの `JsonBlobRepository` はフラットKV形式のため、グループ・フィールド単位のサブリソースエンドポイントではなく、スキーマ定義全体をPUTで更新する方式を採用する。これにより:

- バックエンドの実装が既存パターン（`SchemaLibraryController`）とほぼ同一
- フロントエンドは `schemaSlice` の状態全体をシリアライズしてPUTするだけ
- 部分更新の競合問題を回避

```
GET    /api/v2/schemas              — 一覧（own + shared）
POST   /api/v2/schemas              — 新規作成 → 201 {id, name}
GET    /api/v2/schemas/{id}         — 取得（フルエンベロープ + definition）
PUT    /api/v2/schemas/{id}         — 全体更新（updated_at 楽観的ロック）
DELETE /api/v2/schemas/{id}         — 削除 → 204
```

> ブレストではネストリソース（`/schemas/{id}/groups/{groupId}/fields`）も検討したが、`JsonBlobRepository` の制約上、全体更新方式のほうがシンプルで整合性が高い。

### Research Insights: API設計

**GET レスポンス形式の修正:**

現在の `SchemaLibraryController.get()` は `definition` ノードだけを返す（エンベロープを剥がす）。新APIでは **フルエンベロープ** を返す必要がある:

```json
{
  "id": "sch-abc123",
  "name": "顧客マスタスキーマ",
  "visibility": "private",
  "createdBy": "user-001",
  "createdAt": 1713500000000,
  "updatedAt": 1713500100000,
  "definition": { "groups": [...] }
}
```

理由: フロントエンドが `name`, `visibility`, `updatedAt` をUI表示・楽観的ロックに使用するため。definition だけでは2回目のリクエストが必要になる。

**楽観的ロック（Optimistic Locking）:**

共有スキーマは複数ユーザーが閲覧可能。同一スキーマへの同時PUTで後勝ちにならないよう、`updated_at` ベースのバージョンチェックを導入:

```
PUT /api/v2/schemas/{id}
Body: { name, visibility, definition, updatedAt: 1713500100000 }

→ 200: 更新成功
→ 409: Conflict（stored updated_at ≠ request updated_at）
```

バックエンドは `getWithinTx` + `putWithinTx` を使い、同一トランザクション内で読み取り→比較→書き込みを行う。

**一覧取得の最適化:**

`SchemaLibraryController.list()` は全テーブルスキャンして Java で filtering している。`listByGroupKey(userId)` を使って自分のスキーマを取得し、shared スキーマは別パスで取得する:

```java
// Own schemas (fast - indexed by group_key)
List<String> ownSchemas = repo.listByGroupKey(principal.getUserId());
// Shared schemas (separate scan with visibility filter)
List<String> sharedSchemas = repo.list().stream()
    .filter(s -> "shared".equals(getVisibility(s)))
    .collect(Collectors.toList());
```

### フロントエンド同期パターン

**`productSlice` パターンを採用**（`tenantSlice` ではなく）:

`tenantSlice` はエラーを swallow する（`console.error` のみ）ため、`productSlice` の以下のパターンを採用:

- `schemaLoading: boolean` + `schemaError: string | null` の明示的エラー状態
- `_fetchSeq` カウンターによる stale response ガード
- mutation は `await` 後に state 更新、エラーは caller に throw

```typescript
// schemaSlice 内の非同期アクション
let _fetchSeq = 0

fetchSchemaList: async () => {
  const seq = ++_fetchSeq
  set((s) => { s.schemaLoading = true; s.schemaError = null })
  try {
    const result = await listSchemas()
    if (_fetchSeq !== seq) return  // stale response guard
    set((s) => { s.schemaList = result.items; s.schemaLoading = false })
  } catch (err) {
    if (_fetchSeq !== seq) return
    set((s) => {
      s.schemaLoading = false
      s.schemaError = err instanceof Error ? err.message : 'スキーマの読み込みに失敗しました'
    })
  }
},

saveSchema: async () => {
  const state = get()
  if (state.schemaSaving) return  // prevent concurrent saves
  const definition = state.definition.schema
  set((s) => { s.schemaSaving = true })
  try {
    if (state.schemaId) {
      const res = await updateSchema(state.schemaId, {
        name: state.schemaName,
        visibility: state.schemaVisibility,
        definition,
        updatedAt: state.schemaUpdatedAt,  // optimistic lock
      })
      set((s) => { s.schemaUpdatedAt = res.updatedAt })  // use server timestamp
    } else {
      const res = await createSchema({ name: state.schemaName, definition })
      set((s) => { s.schemaId = res.id; s.schemaUpdatedAt = res.updatedAt })
    }
  } catch (err) {
    if (isApiError(err) && err.status === 409) {
      throw new Error('他のユーザーがこのスキーマを更新しました。再読み込みしてください。')
    }
    throw err  // caller (UI hook) handles toast
  } finally {
    set((s) => { s.schemaSaving = false })
  }
},

loadSchema: async (id: string) => {
  set((s) => { s.schemaLoading = true; s.schemaError = null })
  try {
    const envelope = await getSchema(id)
    set((s) => {
      s.schemaId = envelope.id
      s.schemaName = envelope.name
      s.schemaVisibility = envelope.visibility
      s.schemaUpdatedAt = envelope.updatedAt
      s.definition.schema = envelope.definition
      s.schemaLoading = false
    })
  } catch (err) {
    set((s) => {
      s.schemaLoading = false
      s.schemaError = err instanceof Error ? err.message : 'スキーマの読み込みに失敗しました'
    })
  }
},

deleteSchema: async (id: string) => {
  // UI側で確認ダイアログ表示後に呼び出す
  await deleteSchemaApi(id)
  set((s) => {
    s.schemaList = s.schemaList.filter(item => item.id !== id)
    if (s.schemaId === id) {
      // 現在編集中のスキーマが削除された場合、ローカル状態をクリア
      s.schemaId = null
      s.schemaName = ''
      s.schemaUpdatedAt = null
    }
  })
}
```

**トースト通知は UI hook 層で呼び出す**（`sonner` ライブラリ）:

```typescript
// useSchemaOperations.ts (UI hook)
import { toast } from 'sonner'

const handleSave = async () => {
  try {
    await store.saveSchema()
    toast.success('スキーマを保存しました')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'スキーマの保存に失敗しました', { duration: 8000 })
  }
}
```

### ID管理戦略

- フロントエンドはスキーマ全体のIDのみバックエンドと同期（`schemaId`）
- グループ・フィールドのIDはフロントエンド生成の `uuidv4()` をそのまま使用（definition内に含まれてPUTされる）
- 新規作成時: POST → サーバーから返されたスキーマIDを `schemaId` に保存

### Research Insights: POST-in-flight ガード

新規作成（POST）の応答を待っている間にユーザーがさらに編集すると、`schemaId` がまだ `null` のため 2つ目のPOSTが発行されてしまう。防止策:

```typescript
// schemaSlice state に追加
schemaPendingCreate: boolean  // POST in-flight flag

saveSchema: async () => {
  const state = get()
  if (state.schemaPendingCreate) return  // POST in-flight, skip
  if (state.schemaSaving) return
  
  if (!state.schemaId) {
    set((s) => { s.schemaPendingCreate = true })
  }
  // ... POST/PUT logic ...
  finally {
    set((s) => { s.schemaSaving = false; s.schemaPendingCreate = false })
  }
}
```

## Technical Considerations

### アーキテクチャ影響

- **Backend**: `SchemaLibraryController` を `/api/v2/schemas` にリネーム & v1のバリデーション（max 50 groups、max 200 fields/group）を移植
- **Frontend**: `schemaSlice` に `schemaId`, `schemaLoading`, `schemaSaving`, `schemaError`, `schemaUpdatedAt`, `schemaPendingCreate` 状態を追加。非同期アクション追加
- **API Client**: `src/api/reportApi.ts` の既存 `listSchemaLibrary` 等を `/api/v2/schemas` に更新

### 重要な制約 (from learnings)

1. **ScalarDB列バインディング**: `bindGroupToTableWithColumns` で列をマッピングする際、位置ベースではなく名前ベースの `Map` ルックアップを使用すること。ScalarDB の `getTableMetadata()` は列順序が不定 (see: `docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md`)
2. **一括更新**: 複数のストアアクションをバッチせず、1回の `set()` に統合すること (see: `docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md`)
3. **Zod バリデーション**: API レスポンスは必ず Zod スキーマで検証 (`apiFetch` が強制)
4. **プロトタイプ汚染防止**: JSON import 時に `FORBIDDEN_KEYS` チェック、`as unknown as T` は禁止 (see: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`)
5. **エラーハンドリング**: 非同期操作は try/catch で wrap、ユーザー向けエラーメッセージを throw (see: `docs/solutions/logic-errors/export-error-handling-json-api.md`)

### セキュリティ

- 共有スキーマは非オーナーには**読み取り専用**。書き込みはオーナーのみ（既存の `SchemaLibraryController` と同じ挙動）
- バリデーション制限を維持: max 50 groups, max 200 fields/group
- `apiFetch` が `credentials: 'include'` を使用しているため、認証はセッションCookieで処理

### Research Insights: セキュリティ強化

**GET /{id} の認可チェック（IDOR防止）:**

現在の `SchemaLibraryController.get()` は ID さえ分かればどのスキーマも取得可能。新APIでは:
- private スキーマ: オーナーのみ取得可能（非オーナーは 404）
- shared スキーマ: 全認証ユーザーが取得可能

```java
// GET /{id} に認可チェック追加
JsonNode stored = repo.get(id);
String visibility = stored.path("visibility").asText("private");
String createdBy = stored.path("created_by").asText();
if ("private".equals(visibility) && !isOwner(principal, createdBy)) {
    ctx.status(404).json(Map.of("error", "Not found"));
    return;
}
```

**バックエンド定義バリデーション:**

フロントエンドの Zod バリデーションは curl で迂回可能。バックエンドでも検証が必要:

```java
// RequestValidator に追加
public static boolean validateSchemaDefinition(Context ctx, JsonNode definition) {
    // 1. サイズ制限: 1MB max
    if (ctx.body().length() > 1_048_576) {
        ctx.status(400).json(Map.of("error", "Schema too large (max 1MB)"));
        return false;
    }
    // 2. グループ数制限
    JsonNode groups = definition.path("groups");
    if (groups.size() > 50) { ... }
    // 3. フィールド数制限（グループあたり）
    for (JsonNode group : groups) {
        if (group.path("fields").size() > 200) { ... }
    }
    // 4. ネスト深度制限（既存の validatePdfGenerateRequest パターン踏襲）
    return true;
}
```

**セッションCookieフラグ確認:**

`FormSessionManager` が `HttpOnly`, `Secure`, `SameSite=Lax` を設定していることを確認。CSRF Origin チェックは `ApiRoutes.java:80` に既存。

### パフォーマンス

- スキーマ一覧取得時は `definition` を含めない（メタデータのみ）。既存パターン踏襲
- 保存はデバウンス不要（ユーザーの明示的な保存操作時のみ実行）
- `listByGroupKey` で owned スキーマ取得を高速化

## System-Wide Impact

- **要素バインディングへの影響**: スキーマのグループ・フィールド削除時、`ReportElement` の `dataField` や `{{fieldKey}}` トークンが参照を失う可能性がある。Phase 2 で削除時の参照チェック・警告UIを検討
- **rulesSlice との連携**: 計算ルール・バリデーションルールがスキーマフィールドを参照している場合、フィールド削除時にルールも無効になる。この整合性チェックは Phase 2 で対応
- **テンプレート保存との関係**: テンプレート保存時にスキーマも含まれる場合の重複管理は Out of Scope

### Research Insights: 要素バインディングの安全性

フィールド削除時にキャンバス要素が孤立参照を持つリスク。現状の `removeSchemaField` は参照チェックなし。将来的に:

```typescript
// removeSchemaField の前にチェック
const referencingElements = findElementsReferencingField(fieldKey)
if (referencingElements.length > 0) {
  // 警告ダイアログ表示 — Phase 2 scope
}
```

## Acceptance Criteria

### Phase 1: バックエンド統合

- [x] `SchemaLibraryController` を `/api/v2/schemas` にリネーム (`server/.../SchemaLibraryController.java`)
- [x] v1のバリデーション（max 50 groups、max 200 fields/group）をv2に移植 (`RequestValidator.java`)
- [x] バックエンド定義バリデーション追加: サイズ上限 1MB、ネスト深度、フィールド数
- [x] GET /{id} に認可チェック追加（private スキーマは owner のみ、shared は全員）
- [x] GET /{id} のレスポンスをフルエンベロープに変更（definition + metadata）
- [x] PUT に `updated_at` 楽観的ロック追加（不一致時 409 Conflict）
- [x] PUT で `getWithinTx` + `putWithinTx` を使用しアトミックな read-compare-write
- [x] `ApiRoutes.java` でルート更新
- [x] 旧 `/api/v2/schema-library` パスへのリダイレクトシム（`ctx.redirect("/api/v2/schemas/...")`）
- [x] `listByGroupKey` を使用した一覧取得最適化
- [ ] 既存のバックエンドテストを更新（既存テストはpass、新規テストは未追加）

### Phase 2: フロントエンドAPI接続

- [x] `src/api/reportApi.ts` のスキーマ関連関数を `/api/v2/schemas` に更新
- [x] Zod スキーマ定義を更新: フルエンベロープ対応（`SchemaEnvelopeSchema` 等）
- [x] `schemaSlice` に状態追加: `schemaId`, `schemaLoading`, `schemaSaving`, `schemaError`, `schemaUpdatedAt`, `schemaPendingCreate`, `schemaName`, `schemaVisibility`, `schemaList`
- [x] 非同期アクション追加: `fetchSchemaList`, `loadSchema`, `saveSchema`, `deleteSchema`
- [x] `fetchSchemaList`: `_fetchSeq` stale response ガード付き
- [x] `saveSchema`: POST-in-flight ガード + 409 Conflict ハンドリング
- [x] `saveSchema`: 新規は POST、既存は PUT（`schemaId` の有無で判定）
- [x] 保存成功時の `schemaId` + `schemaUpdatedAt` 同期

### Phase 3: スキーマ一覧UI接続

- [x] スキーマ選択UIからスキーマ一覧を取得（`fetchSchemaList`）
- [x] スキーマ選択時に `loadSchema` を呼び出し、`setSchema` でストアに反映
- [x] 保存ボタンから `saveSchema` を呼び出し（UI hook で `sonner` トースト表示）
- [x] 削除操作から `deleteSchema` を呼び出し
- [x] ローディング状態・エラー状態のUI表示
- [ ] 409 Conflict 時の再読み込み促進UI（将来的に追加）

### テスト要件

- [ ] バックエンドユニットテスト: CRUD エンドポイント、バリデーション、権限チェック、楽観的ロック 409
- [x] フロントエンドユニットテスト: `schemaSlice` 非同期アクション（成功・失敗・stale guard・conflict）
- [ ] API クライアントテスト: `reportApi.ts` のスキーマ関連関数
- [ ] 80%+ テストカバレッジ

## Dependencies & Risks

### Dependencies

- 既存の `SchemaLibraryController` が安定していること
- `JsonBlobRepository` の ScalarDB トランザクション動作（`getWithinTx`/`putWithinTx`）
- `apiFetch` / `reportApi.ts` のAPI クライアント基盤
- `sonner` トーストライブラリ（既に導入済み）

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| v2 schema-library の既存利用箇所がある | パス変更でフロントエンドが壊れる | reportApi.ts のパス一括更新 + 旧パスリダイレクトシム |
| スキーマ定義が大きすぎてPUTが遅い | UX劣化 | definition未含むメタデータ一覧 + 1MB サイズ制限 |
| フィールド削除時に要素バインディングが壊れる | データ表示が不正 | Phase 2 scope で警告UI追加 |
| 楽観的ロック 409 が頻発 | UXが悪い | 実際には single-writer が大半。409 時に再読み込みUIを提供 |
| POST-in-flight 中の編集ロスト | 保存されない変更がある | `schemaPendingCreate` フラグで POST 完了まで次の save をブロック |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-19-schema-crud-api-integration-brainstorm.md](docs/brainstorms/2026-04-19-schema-crud-api-integration-brainstorm.md) — Key decisions: 統合v2 Schema API方式、フルCRUD、visibility維持、楽観的更新

### Internal References

- Backend controller: `server/src/main/java/com/report/server/SchemaLibraryController.java`
- Backend v1: `server/src/main/java/com/report/server/SchemaController.java`
- API routes: `server/src/main/java/com/report/server/ApiRoutes.java:310-314`
- Request validation: `server/src/main/java/com/report/server/RequestValidator.java`
- JSON blob storage: `server/src/main/java/com/report/server/JsonBlobRepository.java`
- App wiring: `server/src/main/java/com/report/server/AppWiring.java:169`
- Frontend store: `src/store/schemaSlice.ts`
- API client: `src/api/reportApi.ts:1149-1184` (既存スキーマライブラリ関数)
- Async pattern reference: `src/store/productSlice.ts:58-97` (stale-fetch guard + error state)
- Toast pattern: `src/components/toolbar/useToolbarFile.ts` (sonner usage)
- API client base: `src/api/client.ts` (`apiFetch`, `ApiError`, `NetworkError`, `isApiError`)

### Institutional Learnings

- ScalarDB列順序の問題: `docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md`
- Zustand一括更新パターン: `docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md`
- JSON import Zod検証: `docs/solutions/logic-errors/export-error-handling-json-api.md`
- プロトタイプ汚染防止: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`
- Store 型安全: `docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md`
