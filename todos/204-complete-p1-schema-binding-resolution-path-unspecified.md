---
status: complete
priority: p1
issue_id: "204"
tags: [code-review, architecture, data-binding-phase2, canvas, resolution]
dependencies: ["200"]
---

# `schemaBinding.fieldId → fieldKey → value` の解決パスが計画に未定義

## Problem Statement

Phase 2 では `element.schemaBinding?.fieldId` (SchemaField の UUID) から実際の表示値を解決する必要があるが、
計画にその解決パス（誰がどこで fieldId を fieldKey に変換するか）が記述されていない。

`useDataResolver` は現在 `fieldKey: string` を受け取り `data` オブジェクトを走査する。
`fieldId` (UUID) を `fieldKey` (例: `"customer.name"`) に変換するロジックが不在。

開発者がそれぞれ異なる場所に実装するリスクがある（レンダラー内、`useDataResolver` 内、新規セレクター等）。

## Findings

**File:** `src/elements/_blocks/hooks/useDataResolver.ts` — 現在のインターフェース

```typescript
// 現状のシグネチャ
function useDataResolver(
  fieldKey: string,         // ← 人間可読キー（例: "customer.name"）
  data: Record<string, unknown>,
  options?: ResolverOptions
)
```

**問題**: `element.schemaBinding?.fieldId` は UUID (例: `"fld_abc123"`)。
これを `fieldKey` に変換するには `definition.schema` の参照が必要。
`useDataResolver` は現在 schema を知らない。

**アーキテクチャ上の選択肢**: 3つ存在するが計画で選ばれていない。

## Proposed Solutions

### Option A: 新セレクター `selectFieldKeyById(fieldId)` でレンダラー上流で変換（推奨）

```typescript
// src/store/selectors.ts
export const selectFieldKeyById = (fieldId: string) =>
  (state: StoreState): string | undefined =>
    state.definition.schema?.groups
      .flatMap((g) => g.fields)
      .find((f) => f.id === fieldId)?.key

// 各 DataField 要素レンダラー
const schemaFieldKey = useReportStore(selectFieldKeyById(element.schemaBinding?.fieldId ?? ''))
const resolverKey = schemaFieldKey ?? element.fieldKey  // fallback to legacy fieldKey
```

**Pros:** `useDataResolver` 変更なし、セレクターは純粋で再利用可能、レンダラーは既存 API を使い続ける
**Cons:** 要素レンダラーがストアに依存（現在も一部依存しているが追加の依存）
**Effort:** Small
**Risk:** Low

### Option B: `useDataResolver` に schema パラメータを追加

```typescript
// useDataResolver シグネチャ変更
function useDataResolver(
  fieldKeyOrId: string,
  data: Record<string, unknown>,
  options?: ResolverOptions & { schema?: SchemaDefinition }
)
```

**Pros:** 解決ロジックが1箇所に集中
**Cons:** シグネチャ変更で既存の全呼び出し箇所に影響、過剰な責務追加
**Effort:** Medium
**Risk:** High（既存機能のリグレッションリスク）

### Option C: `buildFlatDataFromResolved` の中で変換（`fieldId → fieldKey → value` を事前解決）

```typescript
// livePreviewData を canvas に渡す前に fieldKey ベースのオブジェクトを構築
// element.schemaBinding 参照不要 — canvas は既存の fieldKey で値を引ける
function buildFlatDataFromResolved(
  resolved: ResolveBindingsResponse['resolved'],
  schema: SchemaDefinition,
  bindings: Array<{ elementId: string; fieldId: string }>,  // element-level bindings
): Record<string, unknown> {
  // fieldId → fieldKey のマップを構築
  const fieldIdToKey = new Map(
    schema.groups.flatMap(g => g.fields.map(f => [f.id, f.key]))
  )
  // resolved グループデータを dataKey ベースに変換
  // 各フィールドの key を使って既存の resolveField パスで引けるようにする
}
```

**Pros:** canvas・レンダラー完全無変更、既存の fieldKey ベース解決を再利用
**Cons:** `buildFlatDataFromResolved` がより複雑になる
**Effort:** Medium
**Risk:** Low

## Recommended Action

**Option A** を採用。計画ドキュメントに以下を明記する:
1. `selectFieldKeyById(fieldId)` セレクターを `src/store/selectors.ts` に追加
2. `DataFieldElement` レンダラーが `element.schemaBinding?.fieldId` を持つ場合はこのセレクターを使用
3. `useDataResolver` は変更しない

## Technical Details

**Affected files (planned):**
- `src/store/selectors.ts` — `selectFieldKeyById` セレクター追加
- `src/elements/dataField/Renderer.tsx` — セレクター使用
- `docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md` — 解決パスを明記

## Acceptance Criteria

- [ ] 計画ドキュメントが `fieldId → fieldKey` 変換パスを明記している
- [ ] `selectFieldKeyById(fieldId)` セレクターが実装されている（テスト先行）
- [ ] `DataFieldElement` レンダラーが `schemaBinding.fieldId` を使って値を解決できる
- [ ] `useDataResolver` のシグネチャが変更されていない

## Work Log

- 2026-04-12: Discovered by Architecture reviewer (unspecified owner of fieldId→fieldKey resolution)
