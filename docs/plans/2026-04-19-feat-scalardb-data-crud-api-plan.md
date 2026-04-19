---
title: "feat: ScalarDB データ CRUD API + データブラウザ編集 UI"
type: feat
status: active
date: 2026-04-19
origin: docs/brainstorms/2026-04-19-scalardb-data-crud-api-brainstorm.md
---

# feat: ScalarDB データ CRUD API + データブラウザ編集 UI

## Enhancement Summary

**Deepened on:** 2026-04-19
**Research agents used:** ScalarDB CRUD パターン, データブラウザ UI, セキュリティレビュー, パフォーマンスレビュー

### Key Improvements (from research)
1. 名前空間保護をデナイリスト→アローリスト方式に変更（`scalardb`, `coordinator` 内部名前空間も保護）
2. TableMetadata キャッシュ導入（毎リクエストの admin 接続を排除）
3. insert 後の read-back を廃止（Put は決定的、エコー返却で十分）
4. レート制限を 10→60 req/min に引き上げ（ローカル開発ツールの UX 優先）
5. UI 側でセル編集をデバウンスし、API コール数を削減
6. エラーメッセージからカラム名・テーブル構造を除去（情報漏洩防止）

## Overview

ScalarDB テーブルの行データを挿入・更新・削除するための汎用 REST API を追加し、既存のデータブラウザ UI にインライン編集 + モーダル詳細編集機能を実装する。

(see brainstorm: docs/brainstorms/2026-04-19-scalardb-data-crud-api-brainstorm.md)

## Problem Statement / Motivation

現状、ScalarDB テーブルへの書き込みはシードスクリプト (`SeedData.java`) か直接の Java コードでしか行えない。データブラウザは読み取り専用で、ユーザーがサンプルデータの追加・修正・削除をするたびに開発者の介入が必要。テンプレート設計のフィードバックループが遅い。

## Proposed Solution

既存の `V2ScalarDbScanController` と同じ `{ns}/{table}` パスパラメータパターンで、汎用的な行 CRUD エンドポイントを追加する。`TableMetadata` から動的にカラム名・型を検証するため、新テーブル追加時にバックエンド変更不要。

## Implementation Phases

### Phase 1: バックエンド API (Java)

#### 1.1 V2ScalarDbRowController.java を新規作成

**ファイル:** `server/src/main/java/com/report/server/V2ScalarDbRowController.java`

既存 `V2ScalarDbScanController` と同じ構造で作成:

```java
public final class V2ScalarDbRowController {
    private static final Logger log = LoggerFactory.getLogger(V2ScalarDbRowController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_BODY_BYTES = 65_536;  // 64KB

    /** Namespaces that allow writes. Others are rejected with 403. */
    private static final Set<String> SYSTEM_NAMESPACES = Set.of(
        "report_studio", "scalardb", "coordinator"
    );

    private final TransactionFactory factory;
    private final RateLimiter rateLimiter;  // 60 req/min per user
    private final ConcurrentHashMap<String, TableMetadata> metadataCache = new ConcurrentHashMap<>();

    public V2ScalarDbRowController(TransactionFactory factory) {
        this(factory, new RateLimiter(60, 60_000L));
    }

    // 3 public methods: insertRow, updateRow, deleteRow
}
```

#### Research Insights: TableMetadata キャッシュ

毎リクエストで `DistributedTransactionAdmin` を開いて `getTableMetadata()` を呼ぶのは不要なオーバーヘッド。テーブルスキーマはランタイム中に変化しないため、`ConcurrentHashMap` でキャッシュし、テーブル作成時に invalidate する。

```java
private TableMetadata getMetadata(String ns, String table) throws ExecutionException {
    String key = ns + "." + table;
    TableMetadata cached = metadataCache.get(key);
    if (cached != null) return cached;

    try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
        TableMetadata meta = admin.getTableMetadata(ns, table);
        if (meta != null) metadataCache.put(key, meta);
        return meta;
    }
}

/** Called by V2ScalarDbTableController after createTable succeeds. */
public void invalidateMetadataCache(String ns, String table) {
    metadataCache.remove(ns + "." + table);
}
```

**共通処理 (各メソッドの冒頭):**
1. 認証チェック (`ctx.attribute("principal")`)
2. レート制限 (`rateLimiter.isAllowed(userId)`)
3. パスパラメータのバリデーション (`isValidIdentifier()` + 最大64文字)
4. **名前空間保護**: `SYSTEM_NAMESPACES` に含まれる名前空間への書き込みは 403 で拒否
5. リクエストボディの解析 (`MAPPER.readTree()`, 最大 64KB)
6. `getMetadata()` でキャッシュ付き TableMetadata 取得
7. `CorrelationId.generate()` でリクエスト追跡

#### Research Insights: セキュリティ強化

- **エラーメッセージ**: カラム名・テーブル構造を含めない。`"Invalid request"` + `correlationId` のみ返却。詳細はサーバーサイドログに記録
- **JSON ネスト制限**: Jackson の `StreamReadConstraints` で最大ネスト深度を 10 に制限
- **BLOB 型**: Base64 エンコードを要求し、デコード後のサイズを 1MB に制限

**insertRow (POST):**
- リクエスト: `{ "values": { "col1": "val1", ... } }`
- `values` の全キーが `TableMetadata` に存在するか検証
- パーティションキー + クラスタリングキーが全て含まれているか検証
- 型変換: `parseTypedValue(JsonNode value, DataType type)` で JSON → ScalarDB 型
- `Put.newBuilder()` でキーと値を構築（SeedData.java と同じパターン）
- トランザクション内で `tx.put(put)` → `tx.commit()`
- `AuditLog.op("insert_row", ...)` で監査記録
- リクエスト値をそのままエコー返却 → 201 Created（read-back 不要: Put は決定的）

```java
// Key construction pattern (from V2BindingResolveController)
private Key buildKey(JsonNode values, LinkedHashSet<String> keyColumns, TableMetadata meta) {
    if (keyColumns.size() == 1) {
        String col = keyColumns.iterator().next();
        return buildSingleKey(col, values.path(col), meta.getColumnDataType(col));
    }
    Key.Builder builder = Key.newBuilder();
    for (String col : keyColumns) {
        addToKeyBuilder(builder, col, values.path(col), meta.getColumnDataType(col));
    }
    return builder.build();
}
```

**updateRow (PUT):**
- リクエスト: `{ "values": { "key_col": "id1", "col2": "new_val", ... } }`
- パーティションキー + クラスタリングキーは必須（行の特定に使用）
- 残りのカラムは更新値（部分更新: 渡されたカラムのみ上書き）
- `Put.newBuilder()` で upsert 構築
- `AuditLog.op("update_row", ...)` で監査記録
- 更新値をエコー返却 → 200 OK

**deleteRow (DELETE):**
- リクエスト: `{ "keys": { "partition_key": "val", ... } }`
- パーティションキー + クラスタリングキーのみ受け付け
- `Delete.newBuilder()` でキーを構築
- ScalarDB の Delete は冪等（存在しない行の削除もエラーにならない）
- `AuditLog.op("delete_row", ...)` で監査記録
- 204 No Content

**型変換ヘルパー:**

```java
private static void addTypedValue(Put.Builder builder, String col, JsonNode value, DataType type) {
    if (value.isNull()) return;  // Skip null values
    switch (type) {
        case INT     -> builder.intValue(col, value.asInt());
        case BIGINT  -> builder.bigIntValue(col, value.asLong());
        case FLOAT   -> builder.floatValue(col, (float) value.asDouble());
        case DOUBLE  -> builder.doubleValue(col, value.asDouble());
        case BOOLEAN -> builder.booleanValue(col, value.asBoolean());
        default      -> builder.textValue(col, value.asText());  // TEXT, BLOB
    }
}
```

**エラーハンドリング:** 既存 `V2ScalarDbTableController` のパターンに準拠:
- `CommitConflictException` → 409 Conflict（OCC 競合）
- `RetriableExecutionException` → 503
- `ExecutionException.isAuthenticationError()` → 401
- `ExecutionException.isAuthorizationError()` → 403
- 全エラーに `correlationId` 含む

#### 1.2 AppWiring.java に配線追加

```java
// フィールド追加
final V2ScalarDbRowController v2ScalarDbRowCtrl;

// コンストラクタ内
v2ScalarDbRowCtrl = new V2ScalarDbRowController(factory);
```

#### 1.3 ApiRoutes.java にルート登録

```java
// Line 273 (既存 scanRows) の下に追加
app.post("/api/v2/scalardb/tables/{ns}/{table}/rows", w.v2ScalarDbRowCtrl::insertRow);
app.put("/api/v2/scalardb/tables/{ns}/{table}/rows", w.v2ScalarDbRowCtrl::updateRow);
app.delete("/api/v2/scalardb/tables/{ns}/{table}/rows", w.v2ScalarDbRowCtrl::deleteRow);
```

### Phase 2: フロントエンド API クライアント (TypeScript)

#### 2.1 reportApi.ts に API 関数追加

**ファイル:** `src/api/reportApi.ts`

```typescript
// --- Row CRUD ---

export interface ScalarDbRowValues {
  [column: string]: string | number | boolean | null
}

const ScalarDbRowResponseSchema = z.object({
  row: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export async function insertScalarDbRow(
  namespace: string, table: string, values: ScalarDbRowValues,
): Promise<{ row: ScalarDbRowValues }> {
  return apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows`,
    ScalarDbRowResponseSchema,
    jsonBody({ values }),
  )
}

export async function updateScalarDbRow(
  namespace: string, table: string, values: ScalarDbRowValues,
): Promise<{ row: ScalarDbRowValues }> {
  return apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows`,
    ScalarDbRowResponseSchema,
    { ...jsonBody({ values }), method: 'PUT' },
  )
}

export async function deleteScalarDbRow(
  namespace: string, table: string, keys: ScalarDbRowValues,
): Promise<void> {
  await apiFetch(
    `/api/v2/scalardb/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}/rows`,
    z.undefined(),
    { ...jsonBody({ keys }), method: 'DELETE' },
  )
}
```

### Phase 3: データブラウザ UI 編集機能 (React)

#### 3.1 DataGrid.tsx にインライン編集を追加

**ファイル:** `src/components/dataBrowser/DataGrid.tsx`

#### Research Insights: FormTableEditor のパターンを踏襲

既存の `FormTableEditor` のセル編集モデルをベースに、データブラウザ向けに簡略化:

**変更内容:**
- 状態追加: `editingCell: { rowIndex: number; column: string } | null`
- セルのダブルクリックで `editingCell` をセット（FormTableEditor の `START_EDITING` と同等）
- 編集中セルは型別の入力コントロールに切り替え:
  - TEXT/BLOB → `<input type="text">`
  - INT/BIGINT → `<input type="number" step="1">`
  - FLOAT/DOUBLE → `<input type="number" step="any">`
  - BOOLEAN → `<input type="checkbox">`
- キーボードナビゲーション: Enter で確定、Escape でキャンセル、Tab で次セルへ
- **デバウンス**: セル確定後 300ms のデバウンスで `updateScalarDbRow()` を呼び出し（連続編集時の API 負荷軽減）
- キーカラム（partition/clustering）は編集不可（`cursor-not-allowed` + グレー背景）
- `report_studio` 名前空間のテーブルでは編集 UI を非表示

#### 3.2 行追加・削除ボタン

- グリッド上部のツールバーに「行を追加」ボタン追加（ScalarDB テーブルのみ、`report_studio` 以外）
- クリック時に `RowEditModal` を `mode='create'` で開く
- 各行の末尾に削除ボタン (Trash2 アイコン、hover 時のみ表示)
- クリックで `ConfirmDialog`（`variant="danger"`, メッセージ: `"この行を削除してもよろしいですか？"`）
- 確認後に `deleteScalarDbRow()` → データ再フェッチ

#### 3.3 モーダル詳細編集 (RowEditModal.tsx 新規)

**ファイル:** `src/components/dataBrowser/RowEditModal.tsx`

#### Research Insights: ProductEditDialog のパターンを踏襲

既存の `ProductEditDialog` と同じモーダルレイアウト（560px 幅、スクロール可能ボディ、Cancel/Save フッター）を採用:

**Props:**
```typescript
interface Props {
  open: boolean
  mode: 'create' | 'edit'
  namespace: string
  table: string
  columns: ScalarDbColumnMeta[]
  row?: ScalarDbRowValues          // edit mode only
  onSave: () => void               // refresh callback
  onClose: () => void
}
```

**挙動:**
- `mode='create'`: 全カラムが空のフォーム。保存で `insertScalarDbRow()`
- `mode='edit'`: 既存値がプリセット。キーカラムは readonly。保存で `updateScalarDbRow()`
- フォーム状態: `useState<Record<string, string>>` で全カラム値を文字列管理
- 型に応じた入力コントロール（ProductEditDialog と同様のフィールドレイアウト）
- フィールド単位のエラー表示: `fieldErrors` state でバリデーションエラーを管理
- 保存中は `isSubmitting` フラグでボタン disabled + スピナー
- 成功時: `onSave()` → `onClose()`。エラー時: モーダルを開いたまま上部にエラー表示

## Technical Considerations

- **トランザクション分離**: ScalarDB の SNAPSHOT_ISOLATION により、同時書き込みは楽観的排他制御で自動的にコンフリクト検出される。`CommitConflictException` は 409 で返却
- **名前空間保護**: `report_studio`, `scalardb`, `coordinator` 名前空間へのミューテーションは 403 で拒否。データブラウザ UI 側でもボタンを非表示にする (brainstorm 決定事項 + セキュリティレビュー強化)
- **物理削除**: ソフトデリートではなく ScalarDB Delete を使用。復元不要 (brainstorm 決定事項)
- **ボディサイズ制限**: 64KB (テーブル作成の 1MB より小さく、1行分のデータとして十分)
- **read-back 不要**: ScalarDB の Put は決定的。リクエスト値をそのまま返却（パフォーマンスレビュー推奨）
- **メタデータキャッシュ**: `ConcurrentHashMap` でキャッシュし、テーブル作成時に invalidate（パフォーマンスレビュー推奨）

## Acceptance Criteria

- [x] `POST /api/v2/scalardb/tables/{ns}/{table}/rows` で行を挿入できる
- [x] `PUT /api/v2/scalardb/tables/{ns}/{table}/rows` で行を更新できる (部分更新)
- [x] `DELETE /api/v2/scalardb/tables/{ns}/{table}/rows` で行を削除できる
- [x] `report_studio`, `scalardb`, `coordinator` 名前空間への書き込みが 403 で拒否される
- [x] 不正なカラム名・型ミスマッチが 400 で拒否される（エラーメッセージにカラム名を含まない）
- [x] 全操作が `AuditLog.op()` で記録される
- [x] `CommitConflictException` が 409 Conflict として返却される
- [x] データブラウザでセルをダブルクリックしてインライン編集できる
- [x] データブラウザで「行を追加」ボタンからモーダルで新規行を作成できる
- [x] データブラウザで行を削除できる（確認ダイアログ付き）
- [x] データブラウザで行をクリックしてモーダル詳細編集できる
- [x] パーティションキー / クラスタリングキーは編集不可
- [x] システム名前空間のテーブルでは編集 UI が非表示

## File Change Summary

| ファイル | 操作 | 内容 |
|---|---|---|
| `server/.../V2ScalarDbRowController.java` | 新規 | 行 CRUD コントローラー (insert/update/delete) + メタデータキャッシュ |
| `server/.../AppWiring.java` | 変更 | コントローラーの配線追加 |
| `server/.../ApiRoutes.java` | 変更 | 3 ルート登録 |
| `src/api/reportApi.ts` | 変更 | insert/update/delete API 関数 + Zod スキーマ |
| `src/components/dataBrowser/DataGrid.tsx` | 変更 | インライン編集 + 削除ボタン + 行追加ボタン |
| `src/components/dataBrowser/RowEditModal.tsx` | 新規 | モーダル詳細編集 (create/edit 両対応) |

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-19-scalardb-data-crud-api-brainstorm.md](docs/brainstorms/2026-04-19-scalardb-data-crud-api-brainstorm.md) — 汎用 CRUD 採用、report_studio 名前空間保護、物理削除、インライン + モーダル UI
- 既存パターン: `V2ScalarDbScanController.java` (読み取り), `V2ScalarDbTableController.java` (テーブル作成)
- ScalarDB API: `Put.newBuilder()`, `Delete.newBuilder()`, `Key.newBuilder()` — SeedData.java, JsonBlobRepository.java
- OCC リトライ: `CommitConflictException` — SequenceController.java
- UI パターン: `FormTableEditor.tsx` (インライン編集), `ProductEditDialog.tsx` (モーダルフォーム), `ConfirmDialog.tsx` (削除確認)
