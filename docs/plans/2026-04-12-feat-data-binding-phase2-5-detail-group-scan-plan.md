---
title: データバインディング Phase 2.5 — detail グループ Scan 対応（配列データ解決）
type: feat
status: completed
date: 2026-04-12
origin: docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md
---

# データバインディング Phase 2.5 — detail グループ Scan 対応

## Overview

Phase 2 で実装した `resolve-bindings` エンドポイントは `master` グループ（単行 Get）のみをサポートし、
`detail` グループに対しては `"detail groups are not supported in Phase 2"` エラーを返していた。

Phase 2.5 では `detail` グループへの対応を追加する。
ScalarDB の `Scan.newBuilder().partitionKey(fk).limit(N)` を使って
FK 値（= detail テーブルのパーティションキー）に対応する複数行を取得し、
配列として `livePreviewData` に保持する。

**Deliverable**: `RepeatingBandElement` / `repeatingList` などの配列要素に実 DB データが表示される。

### 現状 (Phase 2 完了後)

```
detail グループへの resolve-bindings → errors["grp_X"] = "not supported in Phase 2"
livePreviewData[group.dataKey]      → 存在しない（detail のデータは空）
RepeatingBandRenderer               → records=undefined → デザインプレビュー表示
```

### Phase 2.5 完了後

```
detail グループへの resolve-bindings → Scan → 配列取得
livePreviewData[group.dataKey]      → Array<Record<string, ComputedValue>>
RepeatingBandRenderer               → records=array → 実データを行ごとに描画
```

---

## Problem Statement / Motivation

帳票の明細行（繰り返しバンド、リスト）は `detail` グループとして定義される。
Phase 2 ではサンプル JSON のみが使われていたため、実際のデータ行数と内容を
デザイン段階で確認できなかった。Phase 2.5 で実データ確認のサイクルが完成する。

---

## Proposed Solution

### アーキテクチャの重要な決定

**partition key の指定方式**: master グループと同じ UI を使用する。
ユーザーは `LivePreviewSection` の partition key 入力フォームに、
detail テーブルのパーティションキー（FK 値）を直接入力する。
例: detail テーブルが `order_id` でパーティション分割されており、
`order_id = "ORD-001"` の行を取得したい場合、そのまま入力する。

これにより **`SchemaGroup` 型への新フィールド追加は不要**。
`partitionKeys[groupId]` の仕組みがそのまま使える。

master からの自動 FK 解決（master の解決結果を detail の scan key に転用）は
実装複雑度が高いため **Phase 3 以降に延期**。

---

## Technical Approach

### 1. バックエンド: `resolveDetailGroup()` 追加

**ファイル**: `server/src/main/java/com/report/server/V2BindingResolveController.java`

```java
// 追加インポート
import com.scalar.db.api.Scan;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.List;

// 定数追加
private static final int MAX_DETAIL_ROWS = 500;

// detail グループの skip を解除し resolveDetailGroup() にルーティング
String role = group.path("role").asText("master");
if ("detail".equals(role)) {
    resolveDetailGroup(groupId, namespace, tableName, colToFieldKey, pkNode,
                       MAX_DETAIL_ROWS, resolved, errors, correlationId, userId);
    continue;  // ← "not supported" エラーを返すのをやめ、実解決に切り替え
}
```

```java
private void resolveDetailGroup(
        String groupId, String namespace, String tableName,
        Map<String, String> colToFieldKey, JsonNode pkNode, int maxRows,
        ObjectNode resolved, ObjectNode errors, String correlationId, String userId
) {
    DistributedTransactionManager mgr = factory.getTransactionManager();
    DistributedTransaction tx = null;
    try {
        TableMetadata meta;
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            meta = admin.getTableMetadata(namespace, tableName);
        }
        if (meta == null) {
            errors.put(groupId, "Schema table was removed since binding; please re-bind");
            return;
        }
        // カラム存在確認
        Set<String> actualColumns = new HashSet<>(meta.getColumnNames());
        for (String dbCol : colToFieldKey.keySet()) {
            if (!actualColumns.contains(dbCol)) {
                errors.put(groupId, "Column not found: " + sanitize(dbCol));
                return;
            }
        }
        // FK パーティションキーを構築（master と同じ buildPartitionKey() を再利用）
        Key partitionKey = buildPartitionKey(pkNode, meta);
        if (partitionKey == null) {
            errors.put(groupId, "Could not build partition key");
            return;
        }
        // Scan（master の Get とは異なり limit 付き）
        Scan scan = Scan.newBuilder()
                .namespace(namespace)
                .table(tableName)
                .partitionKey(partitionKey)
                .limit(maxRows)          // ← Get にはない制限
                .build();

        tx = mgr.start();
        List<Result> rows = tx.scan(scan);  // ← tx.get() でなく tx.scan()
        tx.commit();

        // 空の場合は空配列を返す（Optional.empty() パターンではない）
        ArrayNode arrayNode = MAPPER.createArrayNode();
        for (Result row : rows) {
            ObjectNode rowNode = MAPPER.createObjectNode();
            for (Map.Entry<String, String> entry : colToFieldKey.entrySet()) {
                String col = entry.getKey();
                String key = entry.getValue();
                if (!actualColumns.contains(col)) continue;
                if (row.isNull(col)) rowNode.putNull(key);
                else putTypedValue(rowNode, key, col, row, meta);  // 既存ヘルパーを再利用
            }
            arrayNode.add(rowNode);
        }
        resolved.set(groupId, arrayNode);
        errors.putNull(groupId);

    } catch (Exception e) {
        abortQuietly(tx);
        log.warn("resolve-bindings detail groupId={} correlationId={} failed",
                groupId, correlationId, e);
        errors.put(groupId, "Query failed");
    }
}
```

**重要**: `tx.scan()` は `Optional<Result>` でなく `List<Result>` を返す。
行が存在しない場合は `empty list`（例外ではない）— これは master の `Optional.empty()` とは異なる。

### 2. フロントエンド: レスポンス型の拡張

#### `src/api/reportApi.ts`

```typescript
// 変更前
export interface ResolveBindingsResponse {
  resolved: Record<string, Record<string, ComputedValue>>
  errors: Record<string, string>
  requestId?: string
}

// 変更後
export interface ResolveBindingsResponse {
  /**
   * master グループ: Record<fieldKey, value>（単行）
   * detail グループ: Array<Record<fieldKey, value>>（複数行）
   */
  resolved: Record<string, Record<string, ComputedValue> | Array<Record<string, ComputedValue>>>
  errors: Record<string, string>
  requestId?: string
}

// Zod スキーマの更新
const ResolvedGroupValueSchema = z.union([
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
])

const ResolveBindingsResponseSchema = z.object({
  resolved: z.record(z.string(), ResolvedGroupValueSchema),
  errors: z.record(z.string(), z.string()),
  requestId: z.string().optional(),
}) satisfies z.ZodType<ResolveBindingsResponse>
```

#### `src/store/types.ts`

```typescript
// 変更前
export type LivePreviewData = Record<string, Record<string, ComputedValue>>

// 変更後
// master → flat object, detail → array of flat objects
export type LivePreviewData = Record<string, Record<string, ComputedValue> | Array<Record<string, ComputedValue>>>
```

#### `src/lib/previewDataTransform.ts`

```typescript
// 変更前: input と output が同じ型（両方とも flat object のみ）
export function buildFlatDataFromResolved(
  resolved: Record<string, Record<string, ComputedValue>>,
  schema: SchemaDefinition | undefined,
): Record<string, Record<string, ComputedValue>>

// 変更後: detail グループは配列をそのまま通す
export function buildFlatDataFromResolved(
  resolved: Record<string, Record<string, ComputedValue> | Array<Record<string, ComputedValue>>>,
  schema: SchemaDefinition | undefined,
): Record<string, unknown> {
  if (!schema) return {}
  const result: Record<string, unknown> = {}
  for (const [groupId, values] of Object.entries(resolved)) {
    const group = schema.groups.find((g) => g.id === groupId)
    if (!group) { console.warn(`resolve-bindings: unknown groupId "${groupId}"`); continue }
    if (!group.dataKey) { console.warn(`resolve-bindings: empty dataKey for group "${groupId}"`); continue }
    // master も detail も同じく dataKey に格納する
    // detail は配列がそのまま入るので RepeatingBandRenderer が使える
    result[group.dataKey] = values
  }
  return result
}
```

`RepeatingBandRenderer` は既に `mergedData[element.dataSource]` を `Record<string, unknown>[]` としてキャストするため、**変更不要**。

### 3. UI: 変更なし

`DataBindingOverviewPanel.tsx` の `LivePreviewSection` は
`dbColumnName` のあるフィールドを partition key 入力として表示しており、
detail グループも同様に動作する。UI の追加変更は不要。

---

## System-Wide Impact

- **Interaction graph**: "プレビュー更新" ボタン → `resolveBindings()` → `resolve-bindings` API → master: Get、detail: Scan → `livePreviewData` 更新 → `buildFlatDataFromResolved` → `stableLiveData` → `ReportCanvas` → `RepeatingBandRenderer.records=array` → 実データ行描画
- **Error propagation**: Scan 失敗時は `errors[groupId]` に記録。detail データなしでも master は表示される（部分成功）
- **State lifecycle risks**: `livePreviewData` の型が broadened される。既存のスキーマ変更による `setLivePreviewData(null)` の仕組みは変更なし
- **API surface parity**: Zod スキーマの `satisfies z.ZodType<T>` パターンにより型ドリフトを防止
- **Integration test scenarios**:
  - detail グループの Scan が空配列を返す場合、`errors` は null で `resolved` は空配列
  - MAX_DETAIL_ROWS (500) を超える行がある場合、最大 500 行を返す
  - カラム順序をシャッフルしても同一の解決結果（名前ベースマッピングの検証）
  - master + detail 混在リクエストで部分成功（master 解決成功、detail 失敗）

---

## Acceptance Criteria

### 機能要件

- [x] `resolve-bindings` で detail グループに対して Scan が実行される
- [x] `resolved[groupId]` が master は `Record<string, ComputedValue>`、detail は `Array<Record<string, ComputedValue>>`
- [x] Scan 結果が 0 行の場合は空配列 `[]` が返り、errors には null が入る
- [x] Scan 結果が MAX_DETAIL_ROWS (500) を超える場合は最初の 500 行を返す
- [x] `livePreviewData[group.dataKey]` に配列が格納される
- [x] `RepeatingBandElement` の `records` prop に配列が渡り、実データで行が描画される
- [x] `buildFlatDataFromResolved` が master（flat）と detail（array）の両方を正しく処理する

### 非機能要件

- [x] カラム順序が変わっても正しいフィールドに解決される（名前ベースマッピング）
- [x] ScalarDB 接続不可時でもデザイナー画面がクラッシュしない
- [x] エラーメッセージにバックエンド内部情報が含まれない

### テスト要件

- [x] `V2BindingResolveControllerTest.java` — detail グループの Scan テスト追加
  - [x] 複数行を正しく返すテスト
  - [x] 空結果（0行）テスト
  - [x] limit超過テスト（行数 > MAX_DETAIL_ROWS のモック）
  - [x] カラムシャッフルテスト（名前ベースマッピング検証）
  - [x] master + detail 混在の部分成功テスト
- [x] `previewDataTransform.test.ts` — detail グループ（配列）の変換テスト追加
- [x] `ResolveBindingsResponse` Zod スキーマが配列値をバリデーションするテスト

---

## Implementation Phases

### Step 1: 型拡張（フロントエンド）

**ファイル**:
- `src/store/types.ts` — `LivePreviewData` 型を broadened に
- `src/api/reportApi.ts` — `ResolveBindingsResponse` + Zod スキーマ更新
- `src/lib/previewDataTransform.ts` — `buildFlatDataFromResolved` 型と実装更新

**テスト先行**:
```
src/lib/previewDataTransform.test.ts — detail グループ（配列入力）テスト追加
```

### Step 2: バックエンド Scan 実装

**ファイル**:
- `server/.../V2BindingResolveController.java` — `resolveDetailGroup()` 追加、detail skip を解除

**テスト先行**:
```
server/.../V2BindingResolveControllerTest.java — detail Scan テスト追加
```

### Step 3: 全テスト確認 + PR

---

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| detail テーブルの行数が非常に多い | MAX_DETAIL_ROWS = 500 で上限を設定 |
| `tx.scan()` の戻り値が `Optional` と混同 | テストで明示的に検証（`Optional.empty()` != `empty list`） |
| `LivePreviewData` 型変更による既存コード破壊 | TypeScript コンパイルチェックで確認 |
| `buildFlatDataFromResolved` の出力型変更 | `Record<string, unknown>` → 既存の canvas の `data` 型と互換 |
| master からの FK 自動解決 | Phase 3 に延期。Phase 2.5 では手動入力のみ |

---

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md](../brainstorms/2026-04-10-schema-database-binding-brainstorm.md)
  - Open question 解決: detail は手動 FK 入力方式を採用（自動 FK 解決は Phase 3）
  - Phase 3 は computed fields + Visual mapper として分離

### Internal References

- Phase 2 計画 (完了済み): [docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md](./2026-04-12-feat-data-binding-phase2-element-binding-plan.md)
- **ScalarDB Scan パターン**: `server/.../JsonBlobRepository.java:135-156` — `Scan.newBuilder().indexKey().build()` + `tx.scan()` + `List<Result>`
- **RepeatingBandRenderer**: `src/elements/repeatingBand/Renderer.tsx` — `records?: Record<string, unknown>[]` で配列を受け取る（変更不要）
- **既存 Get パターン**: `server/.../V2BindingResolveController.java` — `resolveGroup()` の全ヘルパー（`buildPartitionKey`, `putTypedValue`, `abortQuietly`）を再利用
- ScalarDB 3.14.4 Scan API: `Scan.newBuilder().namespace().table().partitionKey(Key).limit(int).build()` → `tx.scan(Scan)` → `List<Result>`
- 空行の扱い: `List.isEmpty()` が行不在のシグナル（master の `Optional.empty()` とは異なる）
