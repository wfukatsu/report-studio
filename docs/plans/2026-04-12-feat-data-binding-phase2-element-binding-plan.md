---
title: データバインディング Phase 2 - 要素バインド + 実データ解決
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md
deepened: 2026-04-12
reviewed: 2026-04-12
---

# データバインディング Phase 2 - 要素バインド + 実データ解決

## Enhancement Summary

**Deepened on:** 2026-04-12  
**Reviewed on:** 2026-04-12  
**Research agents used:** architecture-strategist, security-sentinel, performance-oracle, data-integrity-guardian, code-simplicity-reviewer, best-practices-researcher, framework-docs-researcher, learnings-researcher

### Key Improvements (Deepening)

1. **設計変更**: `ReportDefinition.bindings[]` を廃止し、要素ごとの `element.schemaBinding?: { fieldId }` パターンに変更
2. **スライス削減**: `bindingSlice` は不要 (`schemaSlice` に統合)、`scalardbCatalogSlice` は不要 (`DataBindingModal` の `useState` で十分)
3. **セキュリティ**: テンプレート所有権検証、識別子バリデーション、列存在確認、User ID ベースレートリミットを必須化
4. **バックエンド**: `TransactionAdmin` でなく `TransactionManager` を使用、グループごとに独立トランザクション（部分成功）
5. **パフォーマンス**: `usePreviewData()` フックを canvas で使用、`buildFlatDataFromResolved` を `useMemo` でラップ

### P1 Review Findings Applied (2026-04-12)

| 番号 | 修正内容 |
|------|---------|
| #200 | `dataBinding`/`ElementDataBinding` → `schemaBinding`/`ElementSchemaBinding` にリネーム（`TableElement.dataBinding?: string` との命名衝突を回避） |
| #201 | `removeSchemaField` / `removeSchemaGroup` の cleanup 仕様を追記（同一 `set()` 内、Set パターン） |
| #202 | `livePreviewData` 型を `Record<string, ComputedValue>` に修正、Zod スキーマに `satisfies z.ZodType<T>` 追加 |
| #203 | Step 4 にエクスポートフロー更新（`doExportPdf` が `livePreviewData ?? testData` を渡す）を追記 |
| #204 | `schemaBinding.fieldId → fieldKey → value` の解決パス（`selectSchemaFieldKeyById` セレクター）を追記 |

---

## Overview

Phase 1/1.5 で ScalarDB テーブルとのメタデータバインド（スキーマグループ ↔ テーブル名/カラム名）が実装済み。
Phase 2 では **実際に ScalarDB からデータを取得**し、プレビュー/エクスポート時に要素へ値を解決できるようにする。

**Deliverable**: プレビュースイッチ時に実 DB データがキャンバス要素に表示される。

### 現状 (Phase 1 完了後)

```
ReportDefinition.schema.groups[].tableMeta  → DB テーブル名が保存される（使われない）
ReportDefinition.schema.groups[].fields[].dbColumnName → カラム名が保存される（使われない）
プレビュー         → dataSources[0].fields のサンプル JSON のみ使用
```

### Phase 2 完了後

```
element.schemaBinding?.fieldId → SchemaField.id を指す（要素ごとのバインド）
POST /api/v2/templates/{id}/resolve-bindings → ScalarDB Get で実データを取得
プレビュー → 実データを livePreviewData として dataOverride 経由でキャンバスに注入
```

---

## Problem Statement / Motivation

Phase 1 はスキーマとテーブルの「メタデータ接続」のみで、実際に DB からデータを取得する仕組みがない。
デザイナーはサンプル JSON しか見られず、実データに近いプレビューができない。
Phase 2 で実データ解決を実装することで、デザイン → データ確認のサイクルを繋ぐ。

---

## Proposed Solution

### 1. per-element バインド型追加（`element.schemaBinding`）

#### 設計の決定 — なぜ `schemaBinding` という名前か

**重要**: `dataBinding` という名前は **使用不可**。
`src/types/index.ts` lines 288/296 に `TableElement.dataBinding?: string` および `ChartElement.dataBinding?: string` が存在し、これは raw データキー（例: `"customer.name"`）を保持する別フィールド。
同名のフィールドを `ElementBase` に追加すると型衝突が起き、既存コードがサイレントに破損する。

Phase 2 の新フィールドは `schemaBinding` とする（schema field ID を指すという意味が明確）。

```typescript
// src/types/index.ts への追加
export interface ElementSchemaBinding {
  /** SchemaGroup.fields[x].id を指す（UUID） */
  fieldId: string
}

// ElementBase に追加（全要素型が継承）
interface ElementBase {
  // ...既存フィールド...
  schemaBinding?: ElementSchemaBinding  // Phase 2 新規
}
```

Zod スキーマ（`reportApi.ts` にインライン定義 — 別ファイル不要）:
```typescript
// src/api/reportApi.ts 内
const ElementSchemaBindingSchema = z.object({
  fieldId: z.string().min(1),
})
```

- 既存の `{{fieldKey}}` トークン方式と**共存** (legacy 維持)
- `element.schemaBinding` が存在しない場合は従来のサンプル JSON フローを使用
- 永続化: 既存の `PUT /api/v2/templates/{id}` にそのまま含める

#### バインドアクション（`schemaSlice` に統合）

```typescript
// src/store/schemaSlice.ts への追加
setElementSchemaBinding: (pageId: string, elementId: string, fieldId: string | undefined) => void
// ※ fieldId === undefined でバインド解除（undefined 統一、null 不使用）
```

#### cleanup アクション（`removeSchemaField` / `removeSchemaGroup` に追加）

**重要**: `removeSchemaField` 削除時に要素の `schemaBinding.fieldId` を同一 `set()` 内でクリアする。
`removeSchemaGroup` はグループの全フィールド ID を先に `Set<string>` に収集してから1パスで走査する。

```typescript
// src/store/schemaSlice.ts — removeSchemaField を拡張
removeSchemaField: (groupId, fieldId) =>
  set((s) => {
    // 1. スキーマからフィールドを削除
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    group.fields = group.fields.filter((f) => f.id !== fieldId)
    // 2. 要素の schemaBinding をクリア（同一 set() 内で原子的に実行）
    for (const page of s.definition.pages) {
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (el.schemaBinding?.fieldId === fieldId) {
            el.schemaBinding = undefined
          }
        }
      }
    }
    // 3. livePreviewData を無効化
    s.livePreviewData = null
  }),

// src/store/schemaSlice.ts — removeSchemaGroup を拡張
removeSchemaGroup: (groupId) =>
  set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    // immer 外で Set を事前構築（O(n) 防止）
    const removedFieldIds = new Set(group.fields.map((f) => f.id))
    s.definition.schema!.groups = s.definition.schema!.groups.filter((g) => g.id !== groupId)
    // 要素の schemaBinding をクリア（1パス）
    for (const page of s.definition.pages) {
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (el.schemaBinding && removedFieldIds.has(el.schemaBinding.fieldId)) {
            el.schemaBinding = undefined
          }
        }
      }
    }
    s.livePreviewData = null
  }),
```

### 2. カタログ状態管理（DataBindingModal に引き上げ）

当初計画の `scalardbCatalogSlice`（新規 Zustand スライス）を **廃止**。

```tsx
// DataBindingModal.tsx に lift-up
const [catalog, setCatalog] = useState<ScalarDbCatalog | null>(null)
const [catalogLoading, setCatalogLoading] = useState(false)
const [catalogError, setCatalogError] = useState<string | null>(null)
const abortRef = useRef<AbortController | null>(null)

const fetchCatalog = useCallback(async () => {
  abortRef.current?.abort()
  const controller = new AbortController()
  abortRef.current = controller
  setCatalogLoading(true)
  setCatalogError(null)
  try {
    const result = await fetchScalarDbCatalog(controller.signal)
    if (!controller.signal.aborted) setCatalog(result)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    setCatalogError(e instanceof Error ? e.message : 'カタログ取得に失敗しました')
  } finally {
    if (!controller.signal.aborted) setCatalogLoading(false)
  }
}, [])

useEffect(() => {
  fetchCatalog()
  return () => abortRef.current?.abort()
}, [fetchCatalog])
```

### 3. プレビューデータ（`uiSlice` に `livePreviewData` のみ追加）

`livePreviewLoading` と `livePreviewError` はコンポーネントローカルな `useState` で管理（uiSlice には不要）。
エクスポートフローで参照が必要な `livePreviewData` のみ `uiSlice` に追加する。

```typescript
// src/store/uiSlice.ts への追加（最小限）
livePreviewData: LivePreviewData | null  // エクスポートで参照するためストアに
setLivePreviewData: (data: LivePreviewData | null) => void
```

**型定義**（既存 `ComputedValue` を再利用）:
```typescript
// src/store/types.ts への追加
// ComputedValue = number | string | boolean | null (既存)
type LivePreviewData = Record<string, Record<string, ComputedValue>>
```

**スキーマ変更時の無効化**: `setSchema`, `removeSchemaField`, `bindGroupToTable`, `bindGroupToTableWithColumns`, `removeSchemaGroup` のすべてで `setLivePreviewData(null)` を呼び出す。

**プレビューパネルのローカル状態**:
```typescript
// DataBindingOverviewPanel.tsx
const [previewState, setPreviewState] = useState<
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }
>({ status: 'idle' })
```

### 4. バックエンド: resolve-bindings エンドポイント

```
POST /api/v2/templates/{id}/resolve-bindings
```

#### リクエスト形式

```json
{
  "schema": {
    "groups": [
      {
        "id": "grp_1",
        "role": "master",
        "tableMeta": { "namespace": "default", "tableName": "customers" },
        "fields": [
          { "id": "fld_1", "key": "name", "dbColumnName": "customer_name" },
          { "id": "fld_2", "key": "amount", "dbColumnName": "total_amount" }
        ]
      }
    ]
  },
  "partitionKeys": {
    "grp_1": { "customer_id": "C001" }
  }
}
```

#### レスポンス形式（フラット構造）

```json
{
  "resolved": {
    "grp_1": { "name": "山田太郎", "amount": 12000 }
  },
  "errors": {
    "grp_1": null
  }
}
```

HTTP 207（部分成功）を使用。

#### Zod スキーマ（`reportApi.ts` にインライン定義）

```typescript
// src/api/reportApi.ts
interface ResolveBindingsResponse {
  resolved: Record<string, Record<string, ComputedValue>>
  errors: Record<string, string>  // key absent = no error; null 不使用
}

const ResolveBindingsResponseSchema = z.object({
  resolved: z.record(z.string(), z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  )),
  errors: z.record(z.string(), z.string()),  // .nullable() 不使用（既存 EvaluateResponseSchema と統一）
}) satisfies z.ZodType<ResolveBindingsResponse>
```

#### 実装の重要点（バックエンド）

```java
// V2BindingResolveController.java (新規)

// ① ハンドラー先頭で correlationId を生成（成功/失敗両方でログ）
String correlationId = CorrelationId.generate();

// ② テンプレート所有権検証（CRITICAL）
Optional<String> stored = definitionsRepo.get(templateId);
if (stored.isEmpty()) { ctx.status(404)... return; }
Principal principal = ctx.attribute("principal");
JsonNode envelope = MAPPER.readTree(stored.get());
String owner = envelope.path("created_by").asText("");
if (!owner.isEmpty() && !owner.equals(principal.userId())) {
    ctx.status(404)... return;  // 403 でなく 404（列挙防止）
}

// ③ 要求 namespace/tableName がテンプレートの schema に含まれているか検証
Set<String> allowedTables = extractAllowedTables(envelope);
for each group: if (!allowedTables.contains(ns + "." + tbl)) return 403

// ④ 識別子バリデーション（ScalarDbLimits + IDENTIFIER パターン）
// ⑤ Rate limiting by userId（not IP）: RateLimiter(3, 10_000L)

// ⑥ TransactionManager を使用（TransactionAdmin ではない）
DistributedTransactionManager mgr = factory.getTransactionManager();

// ⑦ グループごとに独立したトランザクション（部分成功のため）
for each group:
  DistributedTransaction tx = null;
  try {
    tx = mgr.start();

    // ⑧ detail グループは Phase 2 では処理しない
    if ("detail".equals(group.role)) {
      errors.put(groupId, "detail groups are not supported in Phase 2");
      tx.abort();
      continue;
    }

    // ⑨ TableMetadata で partition key 型を確認（TOCTOU guard）
    try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
      TableMetadata meta = admin.getTableMetadata(namespace, table);
      if (meta == null) {
        errors.put(groupId, "Schema table was removed since binding");
        AuditLog.op("resolve_bindings", correlationId, userId, "schema_removed", ...);
        continue;
      }
      // Key.of<Type> を meta.getColumnDataType() で選択
    }

    // ⑩ 行取得（Get）
    Optional<Result> result = tx.get(get);
    tx.commit();

    // ⑪ Optional.empty() = 行不在（例外でない）
    if (result.isEmpty()) {
      errors.put(groupId, "Row not found");
      continue;
    }

    // ⑫ 名前ベースマッピング（位置ベース禁止）
    for (field in group.fields) {
      String col = field.dbColumnName;
      if (result.get().isNull(col)) data.putNull(field.key);
      else data.put(field.key, extractTypedValue(result.get(), col, meta));
    }
    resolved.set(groupId, data);
    
  } catch (Exception e) {
    abortQuietly(tx);
    log.warn("resolve-bindings correlationId={} groupId={}", correlationId, groupId, e);
    errors.put(groupId, "Query failed");  // e.getMessage() をレスポンスに含めない
  }

// ⑬ AuditLog
AuditLog.op("resolve_bindings", correlationId, userId, "success/partial", ...);

// ⑭ レスポンスに requestId を含める
response.put("requestId", correlationId);
```

#### AppWiring / ApiRoutes への追加

```java
// AppWiring.java
final V2BindingResolveController v2BindingResolveCtrl;
// constructor: v2BindingResolveCtrl = new V2BindingResolveController(factory);

// ApiRoutes.java (registerV2Routes)
app.post("/api/v2/templates/{id}/resolve-bindings", w.v2BindingResolveCtrl::resolve);
```

### 5. `schemaBinding.fieldId → fieldKey → value` の解決パス

**重要**: `element.schemaBinding?.fieldId` は UUID。canvas での値解決には `fieldId → fieldKey` 変換が必要。
`useDataResolver` のシグネチャは変更しない。上流で変換する。

```typescript
// src/store/selectors.ts への追加
export const selectSchemaFieldKeyById = (fieldId: string) =>
  (state: StoreState): string | undefined =>
    state.definition.schema?.groups
      .flatMap((g) => g.fields)
      .find((f) => f.id === fieldId)?.key

// DataFieldElement レンダラー（例）
const schemaFieldKey = useReportStore(
  useCallback(selectSchemaFieldKeyById(element.schemaBinding?.fieldId ?? ''), [element.schemaBinding?.fieldId])
)
// schemaFieldKey があれば schemaBinding 経由、なければ既存の element.fieldKey にフォールバック
const resolverKey = schemaFieldKey ?? element.fieldKey ?? ''
```

### 6. プレビューフロー統合

#### ReportCanvas の修正

```typescript
// src/components/canvas/ReportCanvas.tsx
const mergedSampleData = usePreviewData()  // 既存フック（スプリアス再レンダリング防止）
const livePreviewData = useReportStore((s) => s.livePreviewData)
const stableLiveData = useMemo(
  () => livePreviewData
    ? buildFlatDataFromResolved(livePreviewData, definition.schema)
    : null,
  [livePreviewData, definition.schema]
)
// 優先順位: dataOverride > livePreviewData（変換済み）> sampleData
const data = dataOverride ?? stableLiveData ?? mergedSampleData
```

#### `buildFlatDataFromResolved` （純粋関数）

```typescript
// src/lib/previewDataTransform.ts (新規 — export する純粋関数)
/**
 * resolve-bindings のレスポンス（groupId → fieldKey → value）を
 * dataKey ベースのネスト構造に変換する。
 *
 * 例: resolved.grp_1 = { name: "山田" }, schema.groups[0].dataKey = "customer"
 *   → { customer: { name: "山田" } }
 *
 * @param orphanedGroupId - schema に存在しない groupId → skip (console.warn)
 * @param emptyDataKey - dataKey が '' のグループ → skip (console.warn)
 */
export function buildFlatDataFromResolved(
  resolved: Record<string, Record<string, ComputedValue>>,
  schema: SchemaDefinition | undefined,
): Record<string, Record<string, ComputedValue>> {
  if (!schema) return {}
  const result: Record<string, Record<string, ComputedValue>> = {}
  for (const [groupId, values] of Object.entries(resolved)) {
    const group = schema.groups.find((g) => g.id === groupId)
    if (!group) { console.warn(`resolve-bindings: unknown groupId ${groupId}`); continue }
    if (!group.dataKey) { console.warn(`resolve-bindings: empty dataKey for group ${groupId}`); continue }
    result[group.dataKey] = values
  }
  return result
}
```

#### プレビュー更新フロー（AbortController — 世代カウンターは不要）

```typescript
// DataBindingOverviewPanel.tsx
const abortRef = useRef<AbortController | null>(null)

async function handleRefreshPreview() {
  abortRef.current?.abort()  // 前のリクエストをキャンセル
  const controller = new AbortController()
  abortRef.current = controller
  setPreviewState({ status: 'loading' })

  try {
    const response = await resolveBindings(templateId, {
      schema: definition.schema,
      partitionKeys: previewParams,
    }, controller.signal)
    if (controller.signal.aborted) return

    const flatData = buildFlatDataFromResolved(response.resolved, definition.schema)
    store.setLivePreviewData(flatData)
    setPreviewState({ status: 'ready' })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    setPreviewState({ status: 'error', message: e instanceof Error ? e.message : 'エラーが発生しました' })
  }
}
```

### 7. エクスポートフロー統合

**重要**: `doExportPdf` / `handleBackendPdf` が `livePreviewData` を `testData` より優先して渡す。
これを実装しないと、プレビューで実データが見えているのにエクスポートがサンプルデータで生成される無音失敗が起きる。

```typescript
// Toolbar.tsx (または相当するエクスポートトリガーコンポーネント)
const testData = useReportStore((s) => s.testData)
const livePreviewData = useReportStore((s) => s.livePreviewData)

// livePreviewData が存在する場合はそれを優先
const exportData = livePreviewData ?? testData
await exportToServerPdf(definition, exportData)
// generateTemplatePdf (バックエンドテンプレート PDF) も同様に更新
```

---

## Technical Considerations

### バックエンド: V2TemplateController.put() にバインド整合性パージ追加

```java
// PUT /api/v2/templates/{id} の保存処理に追加
// element.schemaBinding.fieldId が schema の有効な fieldId を指しているか確認
Set<String> validFieldIds = collectFieldIds(definition);
// 各 element.schemaBinding.fieldId が validFieldIds に存在しなければクリア
purgeStaleSchemaBindings(definition, validFieldIds);
```

### ScalarDB Get のエラー処理

```java
// Optional.empty() は例外でなく "行不在" → errors に記録
if (result.isEmpty()) { errors.put(groupId, "Row not found"); }

// result.isNull(columnName) を必ず確認してから型付きゲッター呼び出し
if (result.get().isNull(colName)) data.putNull(fieldKey);
else data.put(fieldKey, extractTypedValue(result.get(), colName, meta));

// 接続失敗: RetriableExecutionException / TransactionException → errors.put + ログ
// ※ e.getMessage() は絶対にレスポンスに含めない（情報漏洩防止）
```

**参照**: `docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md`

### 既存ストアパターンへの準拠

```typescript
// バッチ削除でも単一の set() で完結させる
// フィールド削除では immer 外で Set を先に構築してから走査
removeSchemaField: (groupId, fieldId) => set((s) => {
  // targetFieldId を閉じ込める（closure capture）
  const targetFieldId = fieldId
  for (const page of s.definition.pages)
    for (const section of page.sections ?? [])
      for (const el of section.elements)
        if (el.schemaBinding?.fieldId === targetFieldId) el.schemaBinding = undefined
  // 既存のフィールド削除処理...
})
```

---

## System-Wide Impact

- **Interaction graph**: "プレビュー更新" ボタン → `resolve-bindings` API → ScalarDB Get（グループごと独立 TX）→ `livePreviewData` Zustand 更新 → `ReportCanvas` 再レンダリング（`stableLiveData` useMemo でガード）→ 全要素の `useDataResolver` 再評価
- **Error propagation**: バックエンドエラーは `errors` フィールドで返却。エラーグループの要素はサンプル JSON にフォールバック。エラーはパネルのインライン表示（コンソールのみはダメ）
- **State lifecycle risks**: `livePreviewData` はスキーマ変更で自動クリア。エクスポート時は `livePreviewData ?? testData` でフォールバック
- **API surface parity**: 既存 `POST /api/v2/templates/{id}/evaluate` (計算ルール) とは別エンドポイント
- **Integration test scenarios**:
  - ScalarDB に行が存在する場合、正しいフィールド値が返ること
  - partition key が存在しない場合、`errors` フィールドに情報が入り `resolved` は空であること
  - カラム順序をシャッフルしても同一の解決結果が得られること（既知の落とし穴のテスト）
  - `element.schemaBinding` が未設定の場合はサンプル JSON にフォールバックすること
  - 所有者でないユーザーが resolve-bindings を呼んだ場合 404 を返すこと
  - detail グループを含むリクエストの場合そのグループは errors に入ること
  - テーブルが削除された場合（TOCTOU）、そのグループが errors に入ること

---

## Acceptance Criteria

### 機能要件

- [ ] `ElementBase.schemaBinding?: ElementSchemaBinding` が `src/types/index.ts` に追加されている
  - [ ] `ElementSchemaBinding = { fieldId: string }` として定義
  - [ ] 既存の `TableElement.dataBinding?: string` と `ChartElement.dataBinding?: string` は変更なし
- [ ] `setElementSchemaBinding(pageId, elementId, fieldId | undefined)` アクションが実装されている
- [ ] `removeSchemaField` が同一 `set()` 内でそのフィールドを参照する要素の `schemaBinding` をクリアする
- [ ] `removeSchemaGroup` がグループ内の全フィールドについて上記を適用する
- [ ] `selectSchemaFieldKeyById(fieldId)` セレクターが `src/store/selectors.ts` に追加されている
- [ ] `buildFlatDataFromResolved` が `src/lib/previewDataTransform.ts` の export された純粋関数として実装されている
- [ ] `POST /api/v2/templates/{id}/resolve-bindings` エンドポイントが実装されている
  - [ ] `TransactionManager`（非 Admin）を使用してデータ行を取得する
  - [ ] グループごとに独立したトランザクションで部分成功を実現する
  - [ ] カラム名→フィールドキーのマッピングが**名前ベース**で行われる
  - [ ] `Optional.empty()` → `errors.grp_X = "Row not found"` として扱う
  - [ ] detail グループは `errors` に記録してスキップする
  - [ ] テンプレート所有権を検証し、未認証アクセスに 404 を返す
  - [ ] リクエストの namespace/tableName がテンプレートの schema に登録済みか検証する
  - [ ] 識別子を正規表現とサイズで検証する
  - [ ] Rate limiting を User ID ベースで適用する（3 req/10s）
  - [ ] ハンドラー先頭で correlationId を生成し、レスポンスの `requestId` に含める
  - [ ] TableMetadata が null の場合（TOCTOU）、errors に記録して次グループへ継続する
- [ ] `DataBindingModal` にカタログ fetch ロジックが lift-up されている
- [ ] DataBinding Overview パネルに partition key 入力 UI が追加されている
- [ ] "プレビュー更新" ボタンで実データがキャンバス要素に反映される（AbortController でキャンセル可能）
- [ ] `element.schemaBinding` が未設定の場合はサンプル JSON にフォールバックする
- [ ] スキーマ変更時に `livePreviewData` が `null` にクリアされる
- [ ] `doExportPdf` が `livePreviewData ?? testData` を渡す
- [ ] `Toolbar.tsx` または相当コンポーネントが `livePreviewData` をエクスポートに使用する

### 非機能要件

- [ ] ScalarDB 接続不可時でもデザイナー画面がクラッシュしない（graceful degradation）
- [ ] カラム順序が変わっても正しいフィールドに解決される（名前ベースマッピング）
- [ ] エラーメッセージにバックエンドの内部情報（例外メッセージ）が含まれない
- [ ] `buildFlatDataFromResolved` が `useMemo` でラップされ、スプリアス再レンダリングが発生しない
- [ ] `resolveBindings` API 結果は Zod バリデーション後にストアへ格納される（`satisfies z.ZodType<T>` 付き）

### テスト要件

- [ ] `ElementSchemaBinding` 型バリデーションのユニットテスト
- [ ] `removeSchemaField` がバインドをクリアするストアテスト
- [ ] `removeSchemaGroup` がグループ内全フィールドのバインドをクリアするストアテスト
- [ ] `selectSchemaFieldKeyById` のユニットテスト
- [ ] `buildFlatDataFromResolved` のユニットテスト（orphaned groupId, empty dataKey のケースを含む）
- [ ] `resolve-bindings` コントローラの統合テスト（モック ScalarDB）
  - [ ] カラムシャッフルテスト（名前ベースマッピング検証）
  - [ ] 行不在テスト（`Optional.empty()` パス）
  - [ ] 接続エラーテスト（部分成功レスポンス）
  - [ ] テンプレート所有権違反テスト（404 返却）
  - [ ] detail グループスキップテスト
  - [ ] 識別子バリデーション違反テスト（400 返却）
  - [ ] TOCTOU（テーブル削除）テスト
- [ ] プレビューフォールバック動作のコンポーネントテスト
- [ ] スキーマ変更で `livePreviewData` がクリアされるテスト

---

## Implementation Phases

### Step 1: 型定義 + Store（フロントエンド基盤）

**ファイル**:
- `src/types/index.ts` — `ElementSchemaBinding` 型追加、`ElementBase.schemaBinding?` 追加（`dataBinding` は変更しない）
- `src/store/schemaSlice.ts` — `setElementSchemaBinding`, `removeSchemaField`/`removeSchemaGroup` cleanup 追加
- `src/store/uiSlice.ts` — `livePreviewData: LivePreviewData | null`, `setLivePreviewData` 追加
- `src/store/types.ts` — `LivePreviewData` 型追加
- `src/store/selectors.ts` — `selectSchemaFieldKeyById` セレクター追加
- `src/lib/previewDataTransform.ts` — `buildFlatDataFromResolved` 純粋関数（新規）
- `src/api/reportApi.ts` — `ResolveBindingsResponse` + Zod スキーマ（`satisfies` 付き）、`resolveBindings()` 関数追加
- `src/components/modals/DataBindingModal.tsx` — カタログ lift-up
- `src/components/canvas/ReportCanvas.tsx` — `usePreviewData()` + `useMemo(buildFlatDataFromResolved)` 統合

**テスト先行**:
```
src/store/schemaSlice.test.ts — setElementSchemaBinding + cleanup テスト追加
src/store/selectors.test.ts — selectSchemaFieldKeyById テスト追加
src/lib/previewDataTransform.test.ts — buildFlatDataFromResolved テスト（新規）
```

### Step 2: バックエンド resolve-bindings エンドポイント

**ファイル**:
- `server/src/main/java/com/report/server/V2BindingResolveController.java` — 新規作成
- `server/src/main/java/com/report/server/ApiRoutes.java` — ルート追加 (registerV2Routes)
- `server/src/main/java/com/report/server/AppWiring.java` — コントローラ追加
- `server/src/main/java/com/report/server/V2TemplateController.java` — PUT にバインド整合性パージ追加

**実装パターン参照**:
- `JsonBlobRepository.java` — `tx = mgr.start()`, `abortQuietly(tx)` パターン
- `V2EvaluateController.java` — JSON パース, partial success レスポンスパターン
- `V2ScalarDbCatalogController.java` — `TransactionAdmin` try-with-resources パターン
- `V2ScalarDbTableController.java` — 識別子バリデーション, 例外マッピング, AuditLog パターン

**テスト先行**:
```
server/src/test/java/com/report/server/V2BindingResolveControllerTest.java (新規)
```

### Step 3: プレビュー UI（DataBinding Overview パネル）

**ファイル**:
- `src/components/sidebar/DataBindingOverviewPanel.tsx` — partition key 入力セクション追加、プレビュー更新ボタン

**テスト先行**:
```
src/components/sidebar/DataBindingOverviewPanel.test.tsx — previewParams UI テスト追加
```

### Step 4: エクスポートフロー + 品質チェック

**ファイル**:
- `src/components/Toolbar.tsx` (または相当) — `livePreviewData ?? testData` をエクスポートに渡す

---

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| `schemaBinding` と legacy `dataBinding`（TableElement/ChartElement）の混同 | フィールド名を明確に区別、型レビューで確認 |
| `TransactionManager` でなく `TransactionAdmin` を誤使用 | `JsonBlobRepository` の実装を参照パターンとして使用 |
| カラム順序非保証 (既知) | 名前ベースマッピングを徹底。シャッフルテストを必須化 |
| `Optional.empty()` を例外と誤認 | 単体テストで明示的に検証 |
| `e.getMessage()` のレスポンス混入 | コードレビューチェックリストに追加 |
| スキーマ変更後に古いプレビューでエクスポート | スキーマ変更アクション全体に `setLivePreviewData(null)` |
| テンプレート所有権を検証し忘れる | Step 2 の最初に実装（todo 205 で V2TemplateController も修正済み） |
| TOCTOU（テーブル削除後のリクエスト） | `TableMetadata == null` を errors に記録して継続 |
| `buildFlatDataFromResolved` のスプリアス再レンダリング | `useMemo` でラップ必須、純粋関数として実装 |

---

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md](../brainstorms/2026-04-10-schema-database-binding-brainstorm.md)

### Internal References

- Phase 1 計画 (完了済み): [docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md](./2026-04-10-feat-scalardb-schema-binding-phase1-plan.md)
- 型定義: `src/types/index.ts:831-849` — `ReportDefinition` 構造
- 既存バインド: `src/types/index.ts:288,296` — `TableElement.dataBinding`, `ChartElement.dataBinding`（変更しない）
- ScalarDB 型: `src/types/scalardb.ts:21-71`
- スキーマ Store: `src/store/schemaSlice.ts:74-115` — `bindGroupToTable` パターン参照
- **ScalarDB Get パターン**: `server/src/main/java/com/report/server/JsonBlobRepository.java` — `tx = mgr.start()`, `abortQuietly(tx)` の正しい実装
- バリアント参照クリーンアップ: `src/store/variantsSlice.ts` — `cleanupVariantRefsForElement` パターン参照
- usePreviewData: `src/hooks/usePreviewData.ts`
- **セキュリティ**: `V2ScalarDbTableController.java` の `IDENTIFIER` パターン, `ScalarDbLimits.java`
- **所有権チェック**: `V2TemplateController.java:202-205` — `duplicate()` の `created_by` チェックパターン
- **監査ログ**: `AuditLog.java`

### Learnings Applied

- `docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md` — 名前ベースマッピング、シャッフルテスト必須
- `docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md` — 単一 `set()` 原則、Set 構築タイミング
- `docs/solutions/performance-issues/react-canvas-rerender-optimization.md` — `usePreviewData()` 使用、`useMemo` でデータ安定化
- `docs/solutions/logic-errors/export-error-handling-json-api.md` — loading state、Result 型パターン
- `docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md` — スライス間の lateral import 禁止、`assertNever` 使用
- `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md` — 受信データの Zod バリデーション必須
