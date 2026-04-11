---
title: ScalarDB Schema Binding — Phase 1 (既存テーブルへのバインド基盤)
type: feat
status: completed
date: 2026-04-10
completed: 2026-04-10
origin: docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md
deepened: 2026-04-10
---

# ScalarDB Schema Binding — Phase 1 (既存テーブルへのバインド基盤)

## Enhancement Summary

**Deepened on:** 2026-04-10
**Sections enhanced:** Architecture, Type Extensions, Frontend Components, Backend Components, Technical Considerations, System-Wide Impact, Risks
**Research agents used:** ScalarDB 3.14 admin API verification (Context7 + web), project convention audit (Javalin/React/Zod), v1 DBPanel port analysis

### Key Improvements

1. **ScalarDB admin API risk eliminated.** `getNamespaceNames()` / `getNamespaceTableNames(String)` / `getTableMetadata(String, String)` all verified present in ScalarDB 3.14 via official docs. `DistributedTransactionAdmin` confirmed `AutoCloseable`. Exception classes and error semantics documented.
2. ~~`TIMESTAMP` added to `ScalarDBColumnType` enum~~ **CORRECTED during implementation (2026-04-10):** ScalarDB 3.14.4's `com.scalar.db.io.DataType` enum actually contains only `BOOLEAN/INT/BIGINT/FLOAT/DOUBLE/TEXT/BLOB` (verified by inspecting the jar at `~/.gradle/caches/.../scalardb-3.14.4.jar`). The research agent's claim that TIMESTAMP was present was wrong. The final `ScalarDbColumnType` union matches the 7-value `DataType` enum exactly.
3. **Critical caveat surfaced:** `getNamespaceNames()` returns ONLY namespaces that contain tables. Empty namespaces do not appear. UI must show a helpful empty state rather than implying "ScalarDB has no namespaces at all".
4. **Controller/test skeletons switched to match existing project conventions** — the project uses inline `Map.of(...)` / `ObjectNode` responses rather than typed record DTOs, and hand-rolled Mockito `Context` mocks rather than `JavalinTest`. Plan updated to match.
5. **Exact file:line insertion points identified** for `ApiRoutes.java`, `AppWiring.java`, and `DataBindingModal.tsx`. Zero-guess implementation.
6. **v1 UX anti-patterns explicitly avoided.** v1 uses drag-drop (less discoverable) and parses `"namespace.table"` from one text input (error-prone). v2 uses separate dropdowns.
7. **Concrete edge cases added** — schema field bound to removed DB column, bound field later deleted from schema, empty namespace, connection failure mid-session.
8. **ScalarDB version pin** — require ≥ 3.14.4 to get the JDBC connection-leak fix.

### New Considerations Discovered

- Auto-focus the namespace `<Select>` on tab open for keyboard-first users.
- Controlled `<select>` must preserve a stale `dbColumnName` via a synthetic `<option disabled>` so that reloading a bound group whose referenced column was renamed externally does not silently reset the field (prevents data loss).

## Technical Review Revisions (2026-04-10)

After `/technical_review` (4 reviewers: TypeScript/Kieran, Simplicity, Architecture, Pattern Recognition), the following structural simplifications were applied. Earlier sections of the plan have been rewritten in place; this block is the audit trail.

### Naming cascade (Pattern Review)
- `ScalarDB` → `ScalarDb` throughout TS and Java — matches the project's `Pdf`/`Csv`/`Xml`-as-word convention (`V2PdfController`, `CsvDataSource`, `EtaxXmlValidator`). Verified via grep against existing source
- Frontend component `DbBindingPanel.tsx` → **`DbConnectionTab.tsx`** — siblings are `CalculationTab.tsx`, `ValidationTab.tsx` (the `Tab` suffix, not `Panel`, is the convention for `DataBindingModal` tab content)
- `TabId 'db-connection'` → **`'dbconnection'`** — existing tab ids are single lowercase words (`'datasource'`, `'calculation'`, `'validation'`)
- Backend controller `V2ScalarDBController` → **`V2ScalarDbCatalogController`** — "Catalog" names the capability (admin/metadata), not the technology, preserving a clean boundary against Phase 2's future `V2EvaluateController`
- AppWiring field `v2ScalarDBCtrl` → **`v2ScalarDbCatalogCtrl`**
- Zod schemas drop the `Response` infix (majority convention in `reportApi.ts`): `ScalarDbCatalogSchema` instead of `…ResponseSchema`

### Simplifications (Simplicity + Kieran reviews)
- **Dropped `ScalarDbTableStatus` enum** — `tableMeta === undefined` already encodes "unlinked". The enum existed only to "leave room for Phase 1.5" (textbook premature extensibility)
- **Dropped stored `scalarType` and `keyType` on SchemaField** — only `dbColumnName` is persisted. At render time (Phase 2) these are re-derivable from the catalog fetch, so storing them is caching for a phase that doesn't exist
- **Collapsed 3 GET endpoints into 1**: `GET /api/v2/scalardb/catalog` returns `{ namespaces: [{ name, tables: [{ name, columns: [...] }] }] }`. Fewer files, fewer tests, one round-trip. If large-deployment performance becomes an issue, add filtering in Phase 1.5
- **Dropped type-compat matrix + warning chips + "already mapped" dot + "PK 未選択" chip** — all Phase 2 concerns. Phase 1's only user value is "bind and persist"; non-blocking warnings add complexity without value
- **Single "解除" button** replacing the Unlink/Reset split — the "keep hint memory on rebind" use case was speculative

### Type-safety hardening (Kieran review)
- **Zod is now the source of truth** for the ScalarDb enums: `type ScalarDbColumnType = z.infer<typeof ScalarDbColumnTypeSchema>`. Prevents drift between the TS union and the Zod validator
- **`ScalarDbKeyType` no longer includes `'column'`** — a plain column is the *absence* of a key role. The response encodes it as `keyType: 'partition' | 'clustering' | 'index' | undefined`
- **Dropped `.passthrough()`** from the new schemas in favour of the Zod default (`.strip()`). Although existing sibling schemas use `.passthrough()`, they feed pass-through envelopes; the new schemas feed typed store state where untyped leak is a real hazard. This intentional divergence is documented in Technical Considerations
- **Dedicated store action** `bindGroupToTable(groupId, tableMeta: ScalarDbTableMeta | undefined)` replaces a loose `updateSchemaGroup({ tableMeta })` call. Keeps the `tableMeta` object atomic (cannot land with `namespace` but no `tableName`)

### Deferred architecture decisions (documented, not coded)
- **Persistence split-brain risk** (Architecture H2): Phase 1 piggybacks on `PUT /api/v2/templates/{id}`, Phase 2 will introduce `/api/v2/templates/{id}/projection`. A migration step **must** be added to the Phase 2 plan; flag logged in the Risks table
- **Phase 3 BindingMapper home** (Architecture M3): the drag-connect canvas cannot live as a modal tab and will need a full-screen route. The `DB接続` tab may become a vestigial quick-config view or be deprecated. Decision deferred to Phase 3, noted in the Risks table
- **Types file structure** (Architecture M2): `src/types/index.ts` will grow significantly across phases. Splitting rule: when `src/types/index.ts` crosses 1000 LOC, split along feature axes (`types/schema.ts`, `types/binding.ts`, `types/computed.ts`). Documented here; no Phase 1 action
- **Phase 2 shared catalog cache** (Architecture 2nd-round N2/Phase 2 readiness): Phase 2's evaluate flow will need `scalarType` / `keyType` at render time, and since Phase 1 stopped storing them on `SchemaField`, Phase 2 must cache the catalog at the store layer (single fetch, reused across evaluate + UI). The Phase 2 plan must explicitly include a shared `scalardbCatalogSlice` or equivalent. Otherwise every field resolution re-walks the nested response tree and triggers redundant fetches


## Overview

v2 の `SchemaDefinition`（master/detail グループ + fields）を、ScalarDB の
**既存**テーブルに紐付けできるようにする。本プランは 4 フェーズ計画のうち
Phase 1 のみを対象とし、スコープを以下 3 点に限定する：

1. **型拡張**: SchemaGroup に `tableMeta`、SchemaField に `dbColumnName`
2. **バックエンド API**: ScalarDB の既存 namespace / table / column を 1 本の GET エンドポイント (`/api/v2/scalardb/catalog`) でネスト構造として返す
3. **フロントエンド UI**: `DataBindingModal` に「DB接続」タブ (`DbConnectionTab`) を新設し、グループごとに namespace/table を選択、フィールド ↔ カラムをマッピング

**Phase 1 ではテーブル新規作成・実データ取得・要素バインド・計算フィールドは扱わない** (各 Phase 1.5 / 2 / 3 で実装)。
Phase 1 単体では紐付け情報が保存されるだけで、プレビューは引き続きサンプル JSON を使う。

## Problem Statement / Motivation

- v2 は現状、`SchemaDefinition` を持っているが **データの実体が JSON サンプルのみ**
- 本番帳票としては ScalarDB の実データを出力したいが、スキーマとテーブルの対応付けが手動 / 属人化している
- v1 (`report-design-studio`) には既に `BindingEditorPage` + `DBPanel` の完動実装がある (ただし DDL 発行主体で複雑)
- Phase 1 では **既存テーブルへの紐付けのみ**に限定して最小の UI と最小の API で基盤を作り、Phase 1.5 以降で段階的に肉付けする

(詳細背景は brainstorm を参照: `docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md`)

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Zustand + Immer)                         │
│                                                             │
│  DataBindingModal                                           │
│    ├── DataSource tab    (既存)                              │
│    ├── 式・計算 tab       (既存)                              │
│    ├── Validation tab    (既存)                              │
│    └── DB接続 tab         ← NEW (DbConnectionTab)            │
│         │                                                   │
│         └→ per SchemaGroup:                                 │
│             • namespace <Select>  (fetched)                 │
│             • tableName <Select>  (fetched, depends on ns)  │
│             • FieldColumnMapTable  (field ↔ column)         │
│                                                             │
│  Store: schemaSlice.bindGroupToTable (NEW atomic action)    │
│         + updateSchemaField for per-field dbColumnName      │
│                                                             │
│  Persistence: piggybacks on PUT /api/v2/templates/{id}      │
│               via useAutoSave (existing flow)               │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ apiFetch (Zod-validated)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Javalin 6 + ScalarDB 3.14)                        │
│                                                             │
│  ApiRoutes.register                                         │
│    └── V2ScalarDbCatalogController  ← NEW                   │
│         GET /api/v2/scalardb/catalog                        │
│         (single endpoint — nested namespaces→tables→columns)│
│                                                             │
│  AppWiring  ← instantiates V2ScalarDbCatalogController      │
│                                                             │
│  ScalarDB: factory.getTransactionAdmin()                    │
│    - getNamespaceNames()                                    │
│    - getNamespaceTableNames(ns)                             │
│    - getTableMetadata(ns, table)                            │
└─────────────────────────────────────────────────────────────┘
```

### Type Extensions

Current types (`src/types/index.ts:135-161`):

```ts
export type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'image'

export interface SchemaField {
  id: string
  key: string
  label: string
  type: SchemaFieldType
  itemType?: SchemaFieldType
}

export interface SchemaGroup {
  id: string
  label: string
  role: 'master' | 'detail'
  dataKey: string
  fields: SchemaField[]
}
```

Proposed (additive, all new fields optional — no migration of existing definitions required):

New types live in a new file **`src/types/scalardb.ts`** so that Zod and TypeScript share a single source of truth without circular imports. `src/types/index.ts` re-exports them.

```ts
// src/types/scalardb.ts — NEW
import { z } from 'zod'

// Verified against ScalarDB 3.14 DataType (Context7 + official javadocs, 2026-04-10).
// Note: TIMESTAMP is present in 3.14 — missing from v1's enum; included here.
export const ScalarDbColumnTypeSchema = z.enum([
  'INT', 'BIGINT', 'FLOAT', 'DOUBLE', 'TEXT', 'BOOLEAN', 'BLOB', 'TIMESTAMP',
])
export type ScalarDbColumnType = z.infer<typeof ScalarDbColumnTypeSchema>

// Plain columns are encoded as `undefined`, NOT 'column'. Keeps the union semantically clean.
export const ScalarDbKeyTypeSchema = z.enum(['partition', 'clustering', 'index'])
export type ScalarDbKeyType = z.infer<typeof ScalarDbKeyTypeSchema>

export interface ScalarDbTableMeta {
  namespace: string
  tableName: string
}
```

```ts
// src/types/index.ts — MODIFY (additive, all-optional)
import type { ScalarDbTableMeta } from './scalardb'
export type { ScalarDbColumnType, ScalarDbKeyType, ScalarDbTableMeta } from './scalardb'

export interface SchemaField {
  id: string
  key: string
  label: string
  type: SchemaFieldType
  itemType?: SchemaFieldType
  // NEW — only the column name is persisted. Type + key role are re-derived
  // from the fresh catalog fetch at render time (Phase 2).
  dbColumnName?: string
}

export interface SchemaGroup {
  id: string
  label: string
  role: 'master' | 'detail'
  dataKey: string
  fields: SchemaField[]
  // NEW — DB table linkage. `undefined` means "unlinked". No `status` enum.
  tableMeta?: ScalarDbTableMeta
}
```

**Store action addition** (in `src/store/schemaSlice.ts`):

```ts
// NEW — dedicated typed action that keeps tableMeta atomic
bindGroupToTable: (groupId: string, tableMeta: ScalarDbTableMeta | undefined) =>
  set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return

    if (tableMeta === undefined) {
      // "解除" — drop tableMeta AND clear dbColumnName on every field in the group
      delete group.tableMeta
      group.fields.forEach((f) => { delete f.dbColumnName })
      return
    }

    // Rebind to a DIFFERENT (namespace, tableName) → clear all field column hints
    // because none of them can refer to the new table. Prevents the hostile UX
    // where every row immediately shows "(列が存在しません)" after rebind.
    const isRebindToDifferentTable =
      group.tableMeta !== undefined &&
      (group.tableMeta.namespace !== tableMeta.namespace ||
       group.tableMeta.tableName !== tableMeta.tableName)
    if (isRebindToDifferentTable) {
      group.fields.forEach((f) => { delete f.dbColumnName })
    }
    // Same-table rebind (or first bind) → preserve field hints
    group.tableMeta = tableMeta
  })
```

`dbColumnName` updates on individual fields continue to use the existing `updateSchemaField(groupId, fieldId, patch)` action (only one optional field, so the `Partial<SchemaField>` widening concern is minimal).

### Frontend Components

- **`src/components/modals/DbConnectionTab.tsx`** (NEW, ≤ 300 LOC target — inline; extract only if it exceeds 400 LOC)
  - Pure React component, no props. Reads from the store via selectors
  - **Inline catalog fetch** (no separate hook): a single `useEffect` on mount calls `fetchScalarDbCatalog(signal)` via a local `AbortController`, storing the result in `useState`. On unmount, `controller.abort()`. Exposes a local `refetch` function reachable by a **"再取得"** button next to the namespace select (see Retry/Refresh below)
  - **Per-mount re-fetch is expected.** `DataBindingModal` conditionally renders tab content (`{activeTab === 'dbconnection' && <DbConnectionTab />}`) so every tab click unmounts and re-fetches. For Phase 1 dev workloads this is acceptable; Phase 1.5 (when a catalog cache becomes worthwhile) will introduce a store-level cache if needed. Documented as a deliberate choice, not an oversight
  - Auto-focus the first namespace `<select>` on mount
  - Renders, for each `SchemaGroup` in `definition.schema.groups`:
    - Group heading (label + role badge)
    - `<NamespaceSelect>`: single `<select>` populated from `catalog.namespaces.map(n => n.name)`
    - `<TableSelect>`: single `<select>` populated from `catalog.namespaces.find(ns => ns.name === selectedNs)?.tables.map(t => t.name)`. Disabled until namespace picked. On change, dispatches `bindGroupToTable(groupId, { namespace, tableName })`
    - `<FieldColumnMapRows>`: one row per `SchemaField`, showing `[フィールド名 | DB カラム <select>]`
      - `<select>` is fully controlled off `field.dbColumnName ?? ''`
      - Empty option `<option value="">未選択</option>` (placeholder)
      - Options populated from `catalog.namespaces.find(...).tables.find(...).columns.map(c => c.name)`
      - **Stale-column defense:** if `field.dbColumnName` is non-empty AND not present in the fetched column list, inject a synthetic `<option disabled value={field.dbColumnName}>{columnName} (列が存在しません)</option>` so the controlled value round-trips and the user can re-map without data loss
      - `onChange` dispatches `updateSchemaField(groupId, fieldId, { dbColumnName: e.target.value || undefined })`
    - `<UnbindButton>`: single button labelled **解除**. On click, calls `bindGroupToTable(groupId, undefined)` — the store action atomically clears `tableMeta` AND every field's `dbColumnName` in the group
  - **"再取得" refresh button**: visible at the panel header, always enabled when `catalog !== null`. Calls the local `refetch` function to re-run `fetchScalarDbCatalog`. This gives users a visible affordance after external schema changes without forcing them to close-and-reopen the modal (Architecture N2)
  - **Loading / error states:**
    - While loading: show a skeleton or "ScalarDB カタログを取得中..."
    - On error:
      - 503 (`ServiceUnavailableResponse` / `ScalarDb unreachable`) → show "ScalarDB に接続できません" with a retry button calling `refetch()`; keep existing `tableMeta`/`dbColumnName` values intact so the user loses nothing
      - Other errors → show the error message inline
    - Empty `catalog.namespaces` (ScalarDB has no populated namespaces) → show "テーブルを含むネームスペースが見つかりません" (explicit wording — `getNamespaceNames()` returns only namespaces containing tables, so this is NOT the same as "ScalarDB has no namespaces")

### Edge Cases & Accessibility (condensed)

v1 anti-patterns to AVOID: drag-and-drop mapping, single-input `"namespace.table"` parsing, status-machine UI, bulk field-creation bar. Phase 1's only borrowed idea is the group role badge.

Edge cases handled by the panel:
- No populated namespaces → "テーブルを含むネームスペースが見つかりません"
- Bound field deleted from schema → the store naturally drops the connection
- DB column renamed/removed externally → synthetic disabled `<option>` preserves the stale value
- ScalarDB connection lost mid-session → 503 UI + 再取得 button, no data loss
- Rebind to different table → atomic clear of field `dbColumnName` values (see store action)
- Auto-save firing mid-edit → `useAutoSave` handles via `pendingRef` (2026-04-06 learning)

Accessibility: `DataBindingModal` already wires tab infrastructure at `DataBindingModal.tsx:56-86` (`role`, `aria-selected`, `aria-controls`, keyboard nav). The new `DbConnectionTab` only needs: `role="tabpanel"` on the root (from existing wrapper), per-group `<h3>` landmarks, and visible `<label>` on every `<select>`.

- **`src/components/modals/DataBindingModal.tsx`** (MODIFY — add 4th tab)
  - Exact insertion points (verified by reading the file):
    1. **Line 8-14**: extend `TabId` union with `'dbconnection'` and add `{ id: 'dbconnection', label: 'DB接続' }` to the `TABS` array (single lowercase word, matching existing `'datasource'`)
    2. **Line ~112**: add `{activeTab === 'dbconnection' && <DbConnectionTab />}` to the tab-content switch
    3. **Top of file**: `import { DbConnectionTab } from './DbConnectionTab'`
  - No new ARIA wiring needed — existing tab machinery at `DataBindingModal.tsx:56-86` covers `role=tab` / `aria-selected` / `aria-controls` / keyboard nav

- **`src/api/reportApi.ts`** (MODIFY — add 1 new function + 1 catalog schema)
  - `fetchScalarDbCatalog(signal?: AbortSignal): Promise<ScalarDbCatalog>` — single GET to `/api/v2/scalardb/catalog`
  - Uses the existing `apiFetch<T>(path, zodSchema, init?)` helper. Pattern matches `reportApi.ts:167-178`
  - Passes `signal` through for clean cancellation on unmount

- **Zod schema** (inline at top of `reportApi.ts`):
  ```ts
  import { ScalarDbColumnTypeSchema, ScalarDbKeyTypeSchema } from '@/types/scalardb'

  const ScalarDbColumnSchema = z.object({
    name: z.string(),
    type: ScalarDbColumnTypeSchema,
    keyType: ScalarDbKeyTypeSchema.optional(), // undefined = plain column
  })

  const ScalarDbTableEntrySchema = z.object({
    name: z.string(),
    columns: z.array(ScalarDbColumnSchema),
  })

  const ScalarDbNamespaceEntrySchema = z.object({
    name: z.string(),
    tables: z.array(ScalarDbTableEntrySchema),
  })

  export const ScalarDbCatalogSchema = z.object({
    namespaces: z.array(ScalarDbNamespaceEntrySchema),
  })

  export type ScalarDbCatalog = z.infer<typeof ScalarDbCatalogSchema>
  ```
  **Intentional divergence from existing schemas:** the new schemas use the Zod default (`.strip()`), not `.passthrough()`. Rationale: these feed typed store state where untyped drift is dangerous. Existing pass-through envelopes in `reportApi.ts` are safer because they never flow into typed store state.

### Backend Components

- **`server/src/main/java/com/report/server/V2ScalarDbCatalogController.java`** (NEW, ~100 LOC)
  - Constructor takes `TransactionFactory factory`
  - Single handler method, matching **existing project convention** (`public void foo(Context ctx) throws Exception`, responses via `ctx.json(Map.of(...))` — NOT typed record DTOs; acronym "Db" treated as a word per `V2Pdf…` / `CsvDataSource` naming):
    ```java
    public void getCatalog(Context ctx) throws Exception {
        try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
            List<Map<String, Object>> namespaces = new ArrayList<>();
            for (String ns : admin.getNamespaceNames()) {
                List<Map<String, Object>> tables = new ArrayList<>();
                for (String tableName : admin.getNamespaceTableNames(ns)) {
                    TableMetadata meta = admin.getTableMetadata(ns, tableName);
                    Set<String> pks = meta.getPartitionKeyNames();
                    Set<String> cks = meta.getClusteringKeyNames();
                    Set<String> idx = meta.getSecondaryIndexNames();

                    List<Map<String, Object>> columns = new ArrayList<>();
                    for (String col : meta.getColumnNames()) {
                        Map<String, Object> colInfo = new LinkedHashMap<>();
                        colInfo.put("name", col);
                        colInfo.put("type", meta.getColumnDataType(col).name()); // DataType enum → uppercase name
                        if (pks.contains(col)) colInfo.put("keyType", "partition");
                        else if (cks.contains(col)) colInfo.put("keyType", "clustering");
                        else if (idx.contains(col)) colInfo.put("keyType", "index");
                        // plain columns: keyType absent (null / missing in JSON)
                        columns.add(colInfo);
                    }
                    tables.add(Map.of("name", tableName, "columns", columns));
                }
                namespaces.add(Map.of("name", ns, "tables", tables));
            }
            ctx.json(Map.of("namespaces", namespaces));
        } catch (ExecutionException e) {
            throw new ServiceUnavailableResponse("ScalarDb unreachable: " + e.getMessage());
        }
    }
    ```
  - try-with-resources around `factory.getTransactionAdmin()` mirrors `JsonBlobRepository.java:47`
  - Error handling: `ExecutionException` → `ServiceUnavailableResponse` (503). The global exception handler at `ApiRoutes.java:48-57` converts it to JSON

- **`server/src/main/java/com/report/server/AppWiring.java`** (MODIFY)
  - **Line ~50** (after existing controller field declarations): `final V2ScalarDbCatalogController v2ScalarDbCatalogCtrl;`
  - **Line ~147** (after existing controller instantiation): `v2ScalarDbCatalogCtrl = new V2ScalarDbCatalogController(factory);`

- **`server/src/main/java/com/report/server/ApiRoutes.java`** (MODIFY)
  - **Inside `register()` around line 50**, after `registerV2Routes(app, w);`:
    ```java
    registerScalarDbRoutes(app, w);
    ```
  - **Near the end of the file (~line 227)**, add the new method:
    ```java
    private static void registerScalarDbRoutes(Javalin app, AppWiring w) {
        app.get("/api/v2/scalardb/catalog", w.v2ScalarDbCatalogCtrl::getCatalog);
    }
    ```
  - Route slug `scalardb` stays as one lowercase word — matches vendor package `com.scalar.db`, `server/scalardb.properties`, and Pattern Review's audit of existing `/api/v2/*` routes

### Research Insights — ScalarDB 3.14 Admin API

**All methods verified** (Context7 + official ScalarDB docs @ scalardb.scalar-labs.com/docs/3.14, 2026-04-10):

| Method | Signature | Notes |
|---|---|---|
| List namespaces | `admin.getNamespaceNames()` | Returns `Set<String>`. **Caveat:** only namespaces containing at least one table are returned. Empty namespaces are invisible. |
| List tables | `admin.getNamespaceTableNames(String namespace)` | Returns `Set<String>`. |
| Get table metadata | `admin.getTableMetadata(String namespace, String table)` | Returns `TableMetadata`. |

**`TableMetadata` API** used for composing the response:
- `metadata.getColumnNames()` → `Set<String>` (all columns)
- `metadata.getColumnDataType(columnName)` → `DataType` (one of `INT | BIGINT | FLOAT | DOUBLE | TEXT | BOOLEAN | BLOB | TIMESTAMP`)
- `metadata.getPartitionKeyNames()` → `Set<String>`
- `metadata.getClusteringKeyNames()` → `Set<String>` (also `getClusteringOrder(columnName)` for ASC/DESC)
- `metadata.getSecondaryIndexNames()` → `Set<String>`

`DistributedTransactionAdmin` **is `AutoCloseable`** (verified). Always use try-with-resources.

**Exception semantics:**
- `ExecutionException` — underlying storage failure (connection, permission, IO). Map to **503** via `ServiceUnavailableResponse`.
- `IllegalArgumentException` — bad input (null/blank namespace, malformed name). Map to **400** via `BadRequestResponse`.
- Missing namespace/table does **not** throw by default — you must guard with `namespaceExists` / `tableExists` to return a clean 404.

(Controller skeleton has been inlined into the "Backend Components" section above, since there is now only one endpoint.)

**Version pin:** require ScalarDB **≥ 3.14.4** — 3.14.4 contains a fix for a JDBC storage connection leak that would otherwise surface under our listing workload. Confirm in `server/build.gradle.kts`.

**Backend test skeleton:** follow the existing hand-rolled Mockito `Context` pattern from `server/src/test/java/com/report/server/V2SchemaInferControllerTest.java:15-36`. Mock `TransactionFactory` → `DistributedTransactionAdmin` → `TableMetadata`, capture `ctx.json(...)` via `doAnswer`.

Required test cases for `V2ScalarDbCatalogControllerTest`:
1. **Empty ScalarDB** — `getNamespaceNames()` returns empty set → response `{ namespaces: [] }`
2. **Happy path with full classification** — one namespace, one table with columns `id: BIGINT` (partition), `ts: TIMESTAMP` (clustering), `email: TEXT` (secondary index), `age: INT` (plain). Assert the nested response correctly maps each column's `keyType` AND that the plain column's map does NOT contain the `keyType` key
3. **Multiple namespaces / tables** — verify nesting order is deterministic (or explicitly NOT asserted)
4. **`ExecutionException` → `ServiceUnavailableResponse`** — assert via `assertThrows`
5. **DataType enum → uppercase string** — verify `DataType.BIGINT` serializes to `"BIGINT"` in the response, not `"bigint"` or `"Bigint"`

## Technical Considerations

- **Immutability**: All store updates go through immer drafts. The new `bindGroupToTable` action mutates `s.definition.schema` via immer's proxy-draft mechanism. The per-field `dbColumnName` goes through the existing `updateSchemaField` patch. No direct mutation of elements in components. (Per `CLAUDE.md` project rules and `~/.claude/rules/coding-style.md`.)
- **Zod validation at the boundary**: The new catalog response passes through `apiFetch<T>(path, schema)` using `ScalarDbCatalogSchema`. `TS` types are derived from the Zod schema via `z.infer` (single source of truth — no drift possible). Failures surface as `ApiError` with `.cause: ZodError`; the hook's `error` state shows a friendly message.
- **Strip, not passthrough**: New schemas use the Zod default (`.strip()`), NOT `.passthrough()`. Intentional divergence from existing pass-through envelopes elsewhere in `reportApi.ts`, because the catalog flows into typed store state where untyped drift is dangerous. Pattern reviewers explicitly flagged this — documented here as a conscious choice.
- **Auto-save piggybacking**: `useAutoSave` already watches `definition` and debounces saves to 2 seconds (per the 2026-04-06 databinding modal learning). `tableMeta` + per-field `dbColumnName` live under `definition.schema` which is part of the watched shape. **No changes to save flow required.**
- **File size**: Target ≤ 300 LOC for `DbConnectionTab.tsx` (fetch + render + store dispatches inline). If it grows past 400 LOC, extract the per-group section into `DbConnectionGroupSection.tsx`. The catalog fetch is NOT extracted into a separate hook (premature for a single-fetch-on-mount).
- **Type compatibility (informational only — not enforced in Phase 1):** Phase 1 neither warns nor blocks on `SchemaFieldType` vs `ScalarDbColumnType` mismatch. The matrix lives in the Phase 2 evaluation controller, not in the client. Rationale: Phase 1 only persists bindings; no evaluation occurs, so there is no runtime mismatch to surface.
- **ScalarDB admin API availability**: Verified against ScalarDB 3.14 official docs + Context7 index (2026-04-10). See Research Insights → ScalarDB 3.14 Admin API. No fallback needed.

## System-Wide Impact

- **Interaction graph**:
  1. User opens Toolbar → Database button → `DataBindingModal` opens
  2. User clicks `DB接続` tab → `<DbConnectionTab />` mounts
  3. On mount, `DbConnectionTab`'s `useEffect` calls `fetchScalarDbCatalog(signal)` **once** via a local `AbortController`, storing the result in `useState`
  4. User picks namespace on a group → local state updates (no store write yet, just UI focus)
  5. User picks table → store dispatch `bindGroupToTable(groupId, { namespace, tableName })`
  6. User picks a column for a field → store dispatch `updateSchemaField(groupId, fieldId, { dbColumnName: '...' })`
  7. Each store mutation triggers the existing Zustand subscription in `useAutoSave` which debounces a `PUT /api/v2/templates/{id}` after 2 seconds
  8. Clicking 解除 dispatches `bindGroupToTable(groupId, undefined)` which atomically clears `tableMeta` + every field's `dbColumnName` in the group

- **Error propagation**: `apiFetch` throws `ApiError` (HTTP status + message) or `NetworkError`. `DbConnectionTab`'s inline fetch effect catches these into an `error` state and renders an inline error message + retry button; existing `tableMeta` / `dbColumnName` values are left untouched so nothing is lost.

- **State lifecycle risks**:
  - 解除 on a group atomically clears both `tableMeta` and all field `dbColumnName` values in one action (the `bindGroupToTable(groupId, undefined)` store action). Cannot leak orphaned `dbColumnName` hints.
  - If the target table is altered externally (column renamed/removed), the stale `dbColumnName` on a field is preserved in state via a synthetic `<option disabled>(列が存在しません)</option>` so the user can re-map without data loss.

- **API surface parity**: The single new endpoint is read-only. No equivalent routes exist elsewhere. `/api/v1/*` is out of scope.

- **Integration test scenarios** (to write during implementation):
  1. Empty ScalarDB (zero populated namespaces) → panel shows "テーブルを含むネームスペースが見つかりません"
  2. Binding a group, then 解除 → persists `tableMeta: undefined` AND clears all `dbColumnName` values for the group's fields
  3. Concurrent two-panel edits → auto-save serializes through debounce without data loss
  4. ScalarDB down → catalog endpoint returns 503; panel shows connection error and does not corrupt any existing `tableMeta`
  5. Stale column (field has `dbColumnName = 'foo'` but DB schema no longer contains `foo`) → renders synthetic disabled option, preserves value, user can re-select

## Acceptance Criteria

### Functional Requirements

- [x] `src/types/scalardb.ts` declares `ScalarDbColumnTypeSchema`, `ScalarDbKeyTypeSchema`, `ScalarDbTableMeta` with TS types derived via `z.infer`
- [x] `src/types/index.ts` extends `SchemaField` with optional `dbColumnName` and `SchemaGroup` with optional `tableMeta`
- [x] `src/store/schemaSlice.ts` gains a `bindGroupToTable(groupId, tableMeta | undefined)` action with the atomic-clear semantics documented above
- [x] Type changes do not break any existing tests (`npm test -- --run`) nor type check (`npm run build`)
- [x] New `V2ScalarDbCatalogController` exposes `GET /api/v2/scalardb/catalog` with the documented response shape
- [x] Plain columns (neither PK/CK/index) OMIT the `keyType` key in the response — do NOT emit `"keyType": "column"`
- [x] New controller is wired via `AppWiring` and registered in `ApiRoutes`
- [x] `DataBindingModal` has a 4th tab `DB接続` (tab id `'dbconnection'`) rendering `DbConnectionTab`
- [x] `DbConnectionTab` lets the user: pick namespace → pick table → map each field to a column → persist all choices via existing auto-save
- [x] 解除 button clears `tableMeta` AND every field's `dbColumnName` in the group atomically
- [x] **Rebind to a different table clears all field `dbColumnName` values** for the group; rebind to the same table preserves them
- [x] **再取得 button** in the panel header re-runs the catalog fetch without requiring the user to close-and-reopen the modal
- [x] Stale `dbColumnName` (column no longer in fetched schema, e.g. after an external column rename) is preserved via a synthetic disabled `<option>` — no data loss
- [x] Loading a previously-bound report correctly rehydrates the UI state from `definition.schema`

### Non-Functional Requirements

- [x] `npm run lint` passes with zero new warnings
- [x] `npm test -- --run` passes with ≥80% coverage on new modules (per `~/.claude/rules/testing.md`)
- [x] `V2ScalarDbCatalogControllerTest` covers: empty ScalarDB, happy path with PK/CK/index classification, plain column omits `keyType`, `ExecutionException` → 503
- [x] `DbConnectionTab` RTL tests cover fetch lifecycle directly: aborts on unmount, surfaces `refetch` via 再取得 button, re-mounting after tab switch re-fetches
- [x] `DbConnectionTab` RTL tests cover: render empty state, bind group, 解除 clears atomically, stale column preserved, 503 error state
- [x] Tab ARIA wiring uses the existing `DataBindingModal` infrastructure (no custom tabs)
- [x] ScalarDB version pinned to **≥ 3.14.4** in `server/build.gradle.kts`
- [x] File size: `DbConnectionTab.tsx` ≤ 400 LOC (target ≤ 300); `V2ScalarDbCatalogController.java` ≤ 150 LOC

### Quality Gates

- [x] All acceptance criteria checked
- [x] No mutation of store state outside immer drafts
- [x] No hardcoded secrets; ScalarDB config continues to come from `scalardb.properties` / env vars
- [x] Code review by the `code-reviewer` agent after implementation (per `~/.claude/rules/development-workflow.md`)

## Success Metrics

- Phase 1 unblocks Phase 2: after merging, Phase 2 can start by adding BindingConnection + evaluate endpoint *without* touching types or UI scaffolding
- Time to bind a 10-field master SchemaGroup to an existing ScalarDB table: under 30 seconds for a user familiar with the data model
- Zero regressions in existing DataBindingModal tabs (DataSource / 式・計算 / Validation)

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ~~ScalarDB 3.14 admin API methods not available~~ | ✅ ELIMINATED | — | Verified via Context7 + official docs; signatures confirmed for `getNamespaceNames`, `getNamespaceTableNames`, `getTableMetadata`. See Research Insights → ScalarDB 3.14 Admin API |
| `getNamespaceNames()` filters out empty namespaces — user may think no namespaces exist | Certain | Low | UI copy explicitly says "テーブルを含むネームスペースが見つかりません"; do NOT say "ScalarDB has no namespaces" |
| ScalarDB < 3.14.4 has a JDBC connection leak that would surface under our listing workload | Low if pinned | Medium | Pin `build.gradle.kts` to `3.14.4` or newer; verify in Phase 1 setup |
| Catalog endpoint payload grows too large for databases with many tables or wide schemas | Low in current dev environment | Medium | Phase 1 ships the fat endpoint. **Quantified trip-wire:** if the catalog response exceeds ~500 KB or the dev database exceeds ~200 tables in aggregate across all namespaces, promote Phase 1.5 (add `?namespace=X` filter + lazy per-table schema fetch) BEFORE starting Phase 2. Measure the response size in the manual smoke test as a sanity check |
| Placing DB binding UI in `DataBindingModal` deviates from the brainstorm's "SchemaPanel tab" decision | Certain (known change) | Medium | Documented in brainstorm cross-check; aligned with the 2026-04-06 sidebar-cleanup institutional learning |
| Phase 3's `BindingMapper` (full-screen drag-connect) cannot live as a modal tab — the `DB接続` tab may become vestigial | Uncertain (Phase 3) | Low | Decision deferred to Phase 3. Options: (a) keep tab as quick-config alongside BindingMapper, (b) deprecate tab when BindingMapper ships. Documented in Enhancement Summary → Deferred architecture decisions |
| Auto-save debounce loses writes on quick unmount of the modal | Low | Medium | `useAutoSave` already handles this via `pendingRef` (confirmed in 2026-04-06 learning) |
| Phase 2 persistence split-brain when `/api/v2/templates/{id}/projection` is introduced | Medium | High if unaddressed | **Phase 2 plan MUST include a migration step** (read bindings from template blob, write to projection, delete from template blob). Flagged by Architecture review H2 |
| ScalarDB cluster unreachable during use | Medium | Medium | `ServiceUnavailableResponse` (503) + retry button + inline error message; other tabs remain usable |
| DB column renamed/removed externally, stale `dbColumnName` on reload | Medium | Low (no data loss) | Synthetic disabled `<option>` preserves the stale value and labels it `(列が存在しません)` — user can re-map without the controlled select resetting silently |

## File Change Inventory

### Frontend

| File | Change | LOC (est.) |
|---|---|---|
| `src/types/scalardb.ts` | **NEW** — Zod-derived `ScalarDbColumnType` / `ScalarDbKeyType` / `ScalarDbTableMeta` | ~30 |
| `src/types/index.ts` | Re-export types; extend `SchemaField` with `dbColumnName?`; extend `SchemaGroup` with `tableMeta?` | +10 |
| `src/store/schemaSlice.ts` | Add `bindGroupToTable(groupId, tableMeta \| undefined)` action | +20 |
| `src/store/types.ts` | Add `bindGroupToTable` to `StoreState` type | +2 |
| `src/api/reportApi.ts` | Add `ScalarDbCatalogSchema`, `ScalarDbCatalog` type, `fetchScalarDbCatalog()` function | +50 |
| `src/components/modals/DbConnectionTab.tsx` | **NEW** (fetch inlined; no separate hook file) | ~300 |
| `src/components/modals/DbConnectionTab.test.tsx` | **NEW** | ~180 |
| `src/components/modals/DataBindingModal.tsx` | Add 4th tab `'dbconnection'` + `DbConnectionTab` import | +6 |
| `src/components/modals/DataBindingModal.test.tsx` | Cover new tab switch | +20 |

### Backend

| File | Change | LOC (est.) |
|---|---|---|
| `server/src/main/java/com/report/server/V2ScalarDbCatalogController.java` | **NEW** | ~100 |
| `server/src/test/java/com/report/server/V2ScalarDbCatalogControllerTest.java` | **NEW** (unit tests w/ mocked admin) | ~180 |
| `server/src/main/java/com/report/server/AppWiring.java` | Instantiate new controller | +3 |
| `server/src/main/java/com/report/server/ApiRoutes.java` | Register 1 new route | +5 |
| `server/build.gradle.kts` | Pin ScalarDB ≥ 3.14.4 (if not already) | 0–1 |

**Total estimated: ~870 LOC including tests.** Down from ~1,300 LOC in the pre-review plan, after collapsing 3 endpoints to 1, dropping the compat matrix, dropping scalarType/keyType storage, consolidating Unlink/Reset into a single 解除 action, and inlining the catalog fetch into `DbConnectionTab` instead of a separate hook.

## Implementation Order (TDD)

0. **Environment verification** (5 min, before any code)
   - Confirm `server/build.gradle.kts` pins ScalarDB ≥ 3.14.4 — bump if lower
   - Confirm `server/scalardb.properties` points at a dev database with at least one namespace and one table (the backend tests need something to list)
   - Run `npm run dev:backend` + `npm run dev` to confirm both start cleanly

1. **Backend controller (tests first, matching hand-rolled Mockito pattern)**
   - Write `V2ScalarDbCatalogControllerTest.java` using the mocked-`Context` pattern from `V2SchemaInferControllerTest.java`
   - Cases: empty ScalarDB → empty namespaces list; happy path with nested namespaces/tables/columns (verify PK/CK/index classification); plain column omits `keyType`; `ExecutionException` → `ServiceUnavailableResponse`
   - Implement `V2ScalarDbCatalogController.java` until all tests green
   - Wire via `AppWiring.java` (field at ~L50, init at ~L147), register in `ApiRoutes.java` (`registerScalarDbRoutes` helper)
   - Smoke test: `curl http://localhost:8080/api/v2/scalardb/catalog` returns nested JSON

2. **Frontend Zod schemas + types** — create `src/types/scalardb.ts` (Zod-first, TS via `z.infer`), re-export from `src/types/index.ts`, extend `SchemaField` + `SchemaGroup`. Run `npm run build` to confirm no regressions.

3. **Frontend store action** — add `bindGroupToTable` to `schemaSlice.ts` + its type in `store/types.ts`. Write the schemaSlice test covering:
   - First bind → `tableMeta` set, fields untouched
   - **Rebind to SAME table** → `tableMeta` unchanged structurally; `dbColumnName` values preserved
   - **Rebind to DIFFERENT table** (different namespace OR different tableName) → new `tableMeta` set AND every field's `dbColumnName` cleared (prevents the hostile "(列が存在しません)" UX)
   - Unbind (`undefined`) → `tableMeta` cleared AND every field's `dbColumnName` cleared atomically

4. **Frontend API client + catalog schema** — add `ScalarDbCatalogSchema` + `fetchScalarDbCatalog` in `src/api/reportApi.ts`. Vitest tests (mocked `fetch`):
   - Correct URL construction
   - Zod validation rejects malformed responses (assert `.cause` is `ZodError` with the right path)
   - `AbortSignal` is propagated
   - Errors surface as `ApiError` / `NetworkError`

5. **Frontend `DbConnectionTab` component (tests first)** — RTL tests covering:
   - Empty state: no schema groups
   - Empty state: `catalog.namespaces` empty → "テーブルを含むネームスペースが見つかりません"
   - Happy path: pick namespace → pick table → map 2 fields → store receives `bindGroupToTable` + `updateSchemaField` dispatches
   - Rebind to different table → field column selects reset to placeholder
   - Stale column: pre-populated `dbColumnName` that isn't in the fetched schema → synthetic disabled `<option>` present with `(列が存在しません)` label, value preserved
   - 解除 click → `bindGroupToTable(groupId, undefined)` dispatched; UI reflects cleared state
   - 503 error: error message shown, retry button calls local `refetch`, existing `tableMeta` values unchanged
   - 再取得 button: triggers a fresh fetch and updates the catalog state
   - Fetch is aborted on unmount (no setState-after-unmount warning)
   - Then implement the component until tests green (target ≤ 300 LOC; hard ceiling 400)

6. **DataBindingModal wiring** — insert the new tab. Update `DataBindingModal.test.tsx` to exercise tab switch into `'dbconnection'` and confirm `DbConnectionTab` renders.

7. **Manual end-to-end smoke test**
   - Open the app, create a fresh report, add a master SchemaGroup with 3 fields
   - Open DataBindingModal → DB接続 tab
   - Bind to a real namespace/table, map at least 2 fields
   - Confirm auto-save fires (network tab shows `PUT /api/v2/templates/{id}`)
   - Reload the page, confirm the bindings rehydrate from `definition.schema`
   - Kill the backend process, refresh the panel → confirm the 503 error UI + retry
   - Restart the backend, click retry → confirm recovery without data loss
   - Click 解除 → confirm table/field bindings all clear atomically in the UI and in persisted state

8. **Run `code-reviewer` agent** (per `~/.claude/rules/development-workflow.md`) and address CRITICAL + HIGH findings before committing

## Brainstorm Cross-Check

| Brainstorm decision | Addressed in this plan | Notes |
|---|---|---|
| ScalarDB only (no generic JDBC) | ✅ | Only `V2ScalarDbCatalogController`; JDBC abstraction deferred |
| 4-phase split (1 / 1.5 / 2 / 3) | ✅ | This plan covers Phase 1 only |
| Phase 1 = existing-table binding only | ✅ | No DDL, no status machine |
| Table creation in Phase 1.5 | ✅ | Out of scope; `ScalarDbTableStatus` enum removed entirely — will be reintroduced as a proper discriminated union in Phase 1.5 if needed |
| Data fetched at Preview/Export time | ✅ | Phase 2 responsibility; Phase 1 doesn't touch the render path |
| SchemaGroup.tableMeta added | ✅ | `{ namespace, tableName }` (no `status` field) |
| SchemaField extended with columnName / scalarType / keyType | ⚠️ Narrowed to `dbColumnName` only | Per technical review: `scalarType` + `keyType` are re-derivable from the catalog at render time (Phase 2). Storing them was caching for a phase that doesn't exist |
| Persist via independent projection API | ⚠️ Deferred to Phase 2 (with migration obligation) | Phase 1 piggybacks on existing template save. **Phase 2 plan MUST include a migration step** (read bindings from template blob, write to projection, delete from template blob). See Risks table |
| DBPanel UI inside SchemaPanel tab | ❌ Deviation — placed in `DataBindingModal` as `DbConnectionTab` | Justified by 2026-04-06 sidebar-cleanup institutional learning: "data configuration lives in DataBindingModal, not sidebar". See Risks table |
| Visual mapper / computed fields / text fallback editor | N/A | Phase 3. **Re-litigation flag:** BindingMapper cannot live as a modal tab — see Risks table for the Phase 3 decision point |
| Open question: master↔detail 1:N join method | N/A in Phase 1 | Phase 2 plan responsibility |
| Open question: master row selection at preview | N/A in Phase 1 | Phase 2 plan responsibility |

## Sources & References

### Origin

- **Brainstorm document**: [docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md](../brainstorms/2026-04-10-schema-database-binding-brainstorm.md)
  - Decisions carried forward: ScalarDB-only scope, 4-phase split, Phase 1 = existing-table binding only, additive type extensions, no DDL/status machine in Phase 1

### Internal References

- v1 reference implementation: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/internals/DBPanel.tsx` (creation-focused; v2 Phase 1 is selection-focused and will be simpler)
- v1 types for ScalarDB column/key enums: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/types/schema.ts:11-21`
- Current v2 types: `src/types/index.ts:135-161`
- Store slice to extend (patch-based, no new actions needed): `src/store/schemaSlice.ts:46-70`
- Modal to extend: `src/components/modals/DataBindingModal.tsx` (tab pattern at ~lines 54-107)
- API client pattern: `src/api/client.ts` (`apiFetch<T>` + `ApiError`) and `src/api/reportApi.ts` (Zod validation examples)
- Auto-save piggyback source: `src/hooks/useAutoSave.ts`
- Backend app entry: `server/src/main/java/com/report/server/App.java`
- Backend wiring: `server/src/main/java/com/report/server/AppWiring.java`
- Backend route registration: `server/src/main/java/com/report/server/ApiRoutes.java` (see `registerV2Routes`)
- Existing ScalarDB admin usage pattern to mirror: `server/src/main/java/com/report/server/JsonBlobRepository.java:47` (try-with-resources around `factory.getTransactionAdmin()`)
- CLAUDE.md project rules: file organization, immutability, template construction rules (page.sections[N].elements)

### Institutional Learnings

- **docs/solutions/feature-implementation/sidebar-ui-reorganization-databinding-modal-templates.md** (2026-04-06): "DataSource + Bindings moved out of sidebar to DataBindingModal". **This is the direct justification for placing the new DB binding UI in DataBindingModal rather than SchemaPanel** — it overrides the brainstorm's original "SchemaPanel tab" suggestion.

### Related Work

- Existing plan `docs/plans/2026-04-07-feat-v1-data-binding-features-plan.md` — earlier data binding work; confirm no overlap during implementation
- Existing plan `docs/plans/2026-04-06-feat-sidebar-databinding-template-modal-plan.md` — origin of DataBindingModal

### Deepening Research Sources (added 2026-04-10)

**ScalarDB 3.14 Admin API verification:**
- ScalarDB Official 3.14 API Guide: https://scalardb.scalar-labs.com/docs/3.14/api-guide/
- ScalarDB 3.14 Release Notes: https://scalardb.scalar-labs.com/docs/3.14/releases/release-notes/
- ScalarDB Context7 indexed documentation: https://context7.com/scalar-labs/scalardb
- ScalarDB Exception Handling Guide: https://scalardb.scalar-labs.com/docs/3.5/how-to-handle-exceptions/
- Connection leak fix: 3.14.4 release notes
- Local verification: `server/src/main/java/com/report/server/JsonBlobRepository.java:47` (existing try-with-resources pattern)

**Project convention audit:**
- Javalin controller convention: `server/src/main/java/com/report/server/V2SchemaInferController.java:37-50`
- Route registration: `server/src/main/java/com/report/server/ApiRoutes.java` (global exception handler at L48-57; `register()` dispatch)
- AppWiring pattern: `server/src/main/java/com/report/server/AppWiring.java:50` (field declaration) and `:147` (instantiation)
- Backend test pattern: `server/src/test/java/com/report/server/V2SchemaInferControllerTest.java:15-36`
- Frontend tab pattern: `src/components/modals/DataBindingModal.tsx:8-14` (TAB array), `:56-86` (ARIA tablist), `:112` (panel switch)
- Frontend API client pattern: `src/api/client.ts` (`apiFetch`, `ApiError`, `NetworkError`) and `src/api/reportApi.ts:167-178` (function + Zod schema example)

**v1 DBPanel port analysis:**
- v1 main panel: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/internals/DBPanel.tsx`
- v1 creation component to AVOID: `.../internals/ScalarDBGroupSetup.tsx`
- v1 read-only column display to PARTIALLY PORT: `.../internals/DBTableBlock.tsx:93,97` (key badge + already-mapped dot)
- v1 drag-drop mapping convention to AVOID: `DropZone` usage in `DBTableBlock.tsx`
- v1 types reference: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/types/schema.ts:11-21`
