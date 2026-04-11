---
title: ScalarDB Schema Binding — Phase 1.5 (UI からのテーブル新規作成)
type: feat
status: completed
date: 2026-04-10
deepened: 2026-04-10
origin: docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md
depends_on: docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md
---

# ScalarDB Schema Binding — Phase 1.5 (UI からのテーブル新規作成)

## Enhancement Summary

**Deepened on:** 2026-04-10
**Research agents used:** ScalarDB 3.14.4 write-path jar inspection, v1 `ScalarDBGroupSetup.tsx` deep dive, v2 POST controller convention audit
**Sections enhanced:** Proposed Solution, Technical Considerations, System-Wide Impact → Error table, Acceptance Criteria, File Change Inventory

### Key improvements from research

1. **3-way exception taxonomy verified, not 2-way.** The jar inspection revealed `RetriableExecutionException` as a subclass of `ExecutionException` specifically for transient failures, plus `ExecutionException.isAuthenticationError()` / `isAuthorizationError()` for auth failures. Phase 1.5 can now cleanly return 503 (retriable), 401/403 (auth), 500 (DDL rejection) instead of the coarse "catch Exception → 503" I had initially.
2. **Error body language corrected from Japanese to English.** Every existing v2 controller emits `{"error": "..."}` in English. Japanese UI strings live only in the React component. My first draft leaked Japanese into the JSON error bodies — corrected in the updated error table and acceptance criteria.
3. **`ifNotExists` overloads exist but are NOT used.** Phase 1.5 requires an explicit 409 on pre-existence to trigger the client-side recovery flow ("代わりに既存テーブルにバインドする"). Using `ifNotExists=true` would silently succeed and hide the duplication — exactly the wrong behavior. Keep the `tableExists` check-then-create pattern. Documented as an intentional choice, not an oversight.
4. **v1 patterns documented with file:line citations.** Port Enter/Escape shortcuts (`ScalarDBFieldForm.tsx:43-45`), key-role-per-group-role restrictions (`ScalarDBGroupSetup.tsx:37-42`), inline validation message list. Reject v1's auto-injection of system fields (`fieldDefaults.ts:11-72`), JS-specific reserved-word list (`bindingValidator.ts:22-33`), and the persist-status-on-domain bug that leaves the UI stuck at "作成中..." after a mid-creation refresh.
5. **v2 POST body-parsing convention documented.** `ctx.body()` + null/blank check + `MAPPER.readTree()` + inline error send. No `bodyAsClass`. No typed records. 1 MB size cap (matches `V2SchemaInferController`). Applied to `V2ScalarDbTableController` skeleton.
6. **Frontend request body: no Zod.** The v2 convention is typed TypeScript parameters passed into `jsonBody({...})`; Zod validates only the response. My initial implication of a `CreateTableRequestSchema` has been dropped. Intentional consistency with existing code.
7. **ScalarDB 3.14.4 `TIMESTAMP` absence reconfirmed.** Already caught in Phase 1; the Phase 1.5 form must not offer `TIMESTAMP` in the column-type dropdown.
8. **`Scan.Ordering.Order` enum discovered** — if Phase 1.5 wants to support ASC/DESC on clustering keys in a future iteration, the import is `com.scalar.db.api.Scan$Ordering$Order`. Phase 1.5 defers this (simpler to just pass `addClusteringKey(String)` without an order argument), but flags it for Phase 2 or beyond.

### New considerations discovered

- The `build()` call on `TableMetadata.Builder` throws when no partition key is defined, but the exact exception class is not documented in the jar. Client-side validation prevents this from ever being hit, so Phase 1.5 treats it as belt-and-braces: validate before `build()`, catch `Exception` at `build()` as a last-resort internal-error.
- v1's `canCreate` logic at `ScalarDBGroupSetup.tsx:82-90` matches Phase 1.5's validation rules (≥1 PK for master, ≥1 PK and ≥1 CK for detail, namespace+tableName both filled). Directly reusable as a validation-rule reference.
- v1 auto-injects a `document_id` PK for every master/detail group — Phase 1.5 explicitly rejects this (the form should present the user's actual fields, not silently add columns). But Phase 1.5 SHOULD warn the user if their group has zero fields, because the form will be empty and invalid.
- **No 409 usage exists in v2 yet.** Phase 1.5 establishes the precedent for 409 Conflict error bodies. Follow the `{"error": "Table already exists: <ns>.<table>"}` shape from the updated error table.

## Technical Review Revisions (2026-04-10, after deepen + review)

Five-reviewer technical review round (Kieran TS / Simplicity / Architecture / Pattern Recognition / Security) produced the following load-bearing corrections. Each is documented in full where it belongs; this block is the audit trail.

### Blocking correction
- **`ScalarDbCatalogTableSchema` does not exist** (Pattern #7). The plan originally claimed to reuse "Phase 1's `ScalarDbCatalogTableSchema`". In fact the Phase 1 code at `src/api/reportApi.ts:470` defines it as a **module-private** `const ScalarDbTableEntrySchema = z.object({...})`, and only the **type** `ScalarDbCatalogTable` is exported. Phase 1.5 must **export `ScalarDbTableEntrySchema` from `reportApi.ts`** so the new `createScalarDbTable()` function can reuse it. Minimal-diff fix; no rename. Captured in the File Change Inventory as a Phase 1 file modification.

### Security hardening (merged into the Error table, Technical Considerations, and Acceptance Criteria)
1. **No `e.getMessage()` in public error bodies.** JDBC driver exception messages leak connection URLs, hostnames, credentials, schema names. All backend 401/403/500/503 error bodies emit a generic English message plus a correlation ID; the full `e.getMessage()` is logged server-side at WARN/ERROR via SLF4J. (Security #4)
2. **Array-length caps** — columns ≤ 200 (matches `V2SchemaInferController`), partitionKeys ≤ 16, clusteringKeys ≤ 16, secondaryIndexes ≤ 32. Reject duplicates in the key lists with 400. (Security #6)
3. **Audit logging** — log every table-creation attempt at INFO on success and WARN on failure, including `principal.userId()`, namespace, tableName, outcome. (Security #5)
4. **Authentication is inherited** from the global `before("/api/*")` filter at `ApiRoutes.java:92-106`. Documented explicitly; test case added asserting 401 when unauthenticated. (Security #1)
5. **Authorization is deferred** — any authenticated principal can create tables in Phase 1.5. Production multi-user deployments must add an `admin`/`schema_editor` role gate before shipping. Documented as a Phase 1.5 non-goal. (Security #2)
6. **TOCTOU recovery** — after `ExecutionException` from `createTable`, re-check `admin.tableExists`. If true, convert the failure to 409 instead of 500. Handles the concurrent-create race. Three extra lines. (Security #8)

### Correctness + atomicity
7. **New atomic store action `bindGroupToTableWithColumns(groupId, tableMeta, fieldColumns)`** (with `fieldColumns: ReadonlyArray<{fieldId, dbColumnName}>` per Round 2 Kieran #2) replaces the `bindGroupToTable` + N × `updateSchemaField` sequence that Step 9 of the interaction graph originally prescribed. One immer draft, one atomic transition. **Does NOT call `pushHistory`** — matches the existing `bindGroupToTable` convention (the schema slice is outside the history system in Phase 1; verified at `schemaSlice.ts:73-99`). Fixes the N+1 re-render storm Kieran flagged and avoids the de-facto "create-then-bind" contract Architecture warned about by making the operation an explicit single domain action. (Kieran R1 #1 + Architecture R1 #2; corrected Round 2 Kieran #1 + R3 cleanup #1.)
8. **Explicit non-contract note for Phase 2:** the "create-then-bind" sequence is a single atomic store action now, not an implicit sequence. Phase 2 plans must still independently re-validate `dbColumnName` presence on every `SchemaField` (the atomicity gives a happy-path guarantee, but Phase 2 should not assume bindings created via this action are distinguishable from bindings created via Phase 1's `bindGroupToTable`). (Architecture #2)
9. **Shared identifier regex** in `src/lib/scalardbIdentifier.ts` (TypeScript); the Java server duplicates the literal with a matching test to prevent drift. (Kieran #3)
10. **Type-map lives in `src/types/scalardb.ts`** alongside the `ScalarDbColumnType` enum it projects from. Round 1 considered inlining at the top of `CreateTableForm.tsx` (Simplicity argument: premature extraction), but round 2 reversed the decision: this is a domain projection (`SchemaFieldType → ScalarDbColumnType`), not a UI lookup table, and Phase 2's evaluate path will need the same default mapping when materializing values from the catalog. Co-locating the projection with the type definition prevents Phase 2 from duplicating it. Concretely: add `export const SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE: Readonly<Record<Exclude<SchemaFieldType, 'array'>, ScalarDbColumnType>> = { ... }` to `src/types/scalardb.ts`. **`Exclude<..., 'array'>` is intentional** (Round 3 Kieran HIGH): `array` fields cannot map to a single ScalarDB column (detail groups bind to whole tables, not single columns), so the type-map must NOT lie about a default for `array`. The form excludes `array` fields from the column-row list independently. The `Exclude<>` declaration also gives a compile-time error if `SchemaFieldType` ever gains a new case.
11. **Error-classification helper extracted** to `src/components/modals/dbConnection/classifyCreateTableError.ts` — a pure function mapping an `ApiError` / `NetworkError` / status code to `{code, showRetry, showRecovery, correlationId?}`. **The helper does NOT carry locale strings**; the form maps `code → Japanese message` at render time. Enables unit testing of the classification independently of the form render and keeps the helper i18n-ready. (Kieran #7 R1 + Kieran R2 #3 — decoupled presentation from classification.)
12. **`CreateTableForm` LOC target raised** from 280 to 400 hard ceiling (with a 350 soft trigger to extract `ColumnRowEditor.tsx`). Kieran's count of the component's responsibilities projected 350-450 LOC, and the original 280 was optimistic. (Kieran #2)
13. **New backend test case**: "`columns: 'not-an-array'` → 400 with helpful error, not 500 ClassCastException." Covers JSON-shape type confusion that the existing 12 cases don't explicitly test. Backend test count: 12 → 13. (Kieran "new test")

### Documentation-only precedents
14. **409 body shape precedent** — 409 error bodies must include enough information to identify the conflicting resource (not just a human-readable string). The `{"error": "Table already exists: <ns>.<tableName>"}` shape satisfies this; future 409 endpoints in Phase 2/3 must follow. (Architecture #4)
15. **New `src/components/modals/` subdirectory convention** — Phase 1.5 introduces the first per-feature subdirectory (`dbConnection/`, lowercase) under `src/components/modals/`. **Lowercase, not PascalCase**, because this is a *feature folder* containing multiple peer components (`GroupBindingSection`, `FieldColumnMap`, `CreateTableForm`, `classifyCreateTableError`), not a per-component folder. The lowercase name communicates "peers within the dbConnection feature" rather than "helpers of `DbConnectionTab`". Matches the lowercase feature-folder convention used in `src/elements/*/`. All future modal sub-component extractions should follow this pattern. (Pattern #5; Kieran R2 carryover from Round 1 issue #2.)
16. **New `*Request` type naming convention — scoped narrowly.** `CreateScalarDbTableRequest` is the first `*Request`-suffixed TypeScript type in `src/api/reportApi.ts`. Future POST endpoints with complex multi-field bodies should follow. **Scope: HTTP request bodies in `reportApi.ts` ONLY.** Do NOT use `*Request` for store action arguments, hook parameters, or React component props — those have their own conventions (typed positional args, prop interfaces). The OpenAPI/HTTP convention `*Request` is reserved for the wire format. (Pattern #11; Kieran R2 #6.)

### Round 2 additions (after the second technical review)

17. **`useReportStore` selector footgun documented.** Phase 1 had an infinite-loop bug from `useReportStore((s) => s.definition.schema?.groups ?? [])` returning a fresh `[]` per call, which `useSyncExternalStore` interpreted as a new snapshot. Fixed in Phase 1 by selecting the stable `schema` reference first. Phase 1.5's new `CreateTableForm` is a fresh consumer of the same slice. **Implementation order step 8 will explicitly require: select `s.definition.schema` (stable reference), then derive `groups` outside the selector. Do NOT use `?? []` inline.** (Kieran R2 #7.)

18. **`CorrelationId` helper extracted, not inlined.** Phase 1.5's exception handlers generate a correlation ID per failure (`UUID.randomUUID().toString().substring(0, 8)`). Inlining this in `V2ScalarDbTableController` works for one controller but creates copy-paste debt the moment Phase 2's evaluate endpoint adopts the same pattern. **Phase 1.5 extracts `com.report.server.CorrelationId` with a single static `generate()` method**, plus a sibling `AuditLog.op(operation, principal, namespace, tableName, outcome, correlationId)` SLF4J helper for the audit log line shape. The generic `op(operation, ...)` signature (Round 3 Architecture #1) lets Phase 2 reuse the same method by passing `"evaluate"` / `"projection_write"` as the operation argument, avoiding per-operation method sprawl. Phase 2 evaluate inherits both. (Architecture R2-2; refined Round 3 Architecture #1.)

19. **Array length caps live as named constants.** The 200/16/16/32 caps are not magic numbers. **Phase 1.5 adds `com.report.server.ScalarDbLimits` Java constants** (`MAX_COLUMNS_PER_TABLE = 200; MAX_PARTITION_KEYS = 16; MAX_CLUSTERING_KEYS = 16; MAX_SECONDARY_INDEXES = 32`) and **mirrors them in `src/lib/scalardbLimits.ts`** so the frontend client-side validator and the backend server-side validator agree. The 200 column cap matches `V2SchemaInferController.MAX_FIELDS` from Phase 1; the rest are net-new with these specific values chosen because PK+CK rarely exceed 16 in practice and secondary indexes rarely exceed 32. (Architecture R2-3.)

20. **Status-machine-is-local-only deferred-decision flag added.** The decision to keep the creation status machine in component-local `useState` is correct for synchronous DDL but will need re-litigation if Phase 2+ ever introduces long-running async DDL operations (e.g., ScalarDB on Cassandra/DynamoDB with multi-second create latency). **Listed in the "Deferred Decisions" subsection at the end of the Brainstorm cross-check** so it's not lost. (Architecture R2-4.)

21. **Phase 2 inheritance checklist consolidated.** The 3-way exception taxonomy, the 409 body shape requirement, the create-then-bind non-contract, the dual-controller cap, and the status-machine deferred-decision are all "Phase 2 must..." notes scattered through this plan's audit trail. **Consolidated into a single "Phase 2 Inheritance Checklist" subsection** in the Brainstorm cross-check, cited so the Phase 2 plan author cannot miss them. (Architecture R2-5.)

### Simplicity cuts rejected (documented for future reviewers)
- **Keep the 3-way exception taxonomy** (Architecture + Security agreed). Simplicity argued for "catch Exception → 500", but the storage backend IS an independent auth plane from the app, and the taxonomy is the right precedent for Phase 2's evaluate endpoint.
- **Keep the 409 recovery flow** (Kieran + Architecture agreed). Simplicity argued for "just show an error and let the user pick from the dropdown", but the recovery path turns a dead end into one extra click.
- **Keep auto-populate on create success** — but make it atomic per finding #7 above. Simplicity argued for removal, but this IS the Phase 1.5 feature.
- **Keep the extraction commit** (Kieran + Pattern agreed). Simplicity argued for "let DbConnectionTab.tsx grow to ~700 LOC", but that leaves a mega-file that Phase 2+ will have to slice under time pressure.
- **Compressed** (not cut) the "Research Insights — v1 port list" and "v2 POST conventions" sections from ~180 lines total to ~50. The content is load-bearing for the implementer; aggressive cuts would lose it. Partial acceptance of Simplicity #4.

## Overview

Phase 1 shipped the ability to bind an existing ScalarDB table to a `SchemaGroup`.
Phase 1.5 adds the missing flow: **create the ScalarDB table from the designer UI**,
pre-populated from the group's `SchemaField` definitions, and automatically bind the
group to the freshly created table. This eliminates the "open `cqlsh` in a separate
window" ceremony and lets a user take a group from "defined" to "bound to a real
table" in one uninterrupted flow inside `DbConnectionTab`.

Phase 1.5 is deliberately **narrow**. It does not touch the binding code path, the
catalog endpoint, or any `SchemaField` semantics. It adds:

1. One new backend endpoint (`POST /api/v2/scalardb/tables`) that calls
   `admin.createTable` and returns the resulting metadata
2. A local, inline "新規作成" form inside `DbConnectionTab` that submits the POST,
   auto-binds the group on success, and refreshes the catalog
3. A minimal status-machine (pure component-local state — NOT persisted to
   `SchemaGroup.tableMeta`) for the transient draft/submitting/error phases

(Phase 2 remains the next item after 1.5: `BindingConnection[]`, element rendering
with real data, and the persistence-migration step flagged in the Phase 1 plan.)

## Problem Statement / Motivation

### Why the split between Phase 1 and Phase 1.5?

The Phase 1 technical review (Kieran Simplicity + Architecture) explicitly **removed**
table creation from Phase 1's scope. Rationale (see brainstorm):

> Phase 1 は「既存テーブルへのバインドのみ」。UI からのテーブル新規作成 (DDL 発行 + status マシン) は Phase 1.5 に分離

That was the right call — Phase 1 shipped in a single session with a tight test
suite precisely because it stayed selection-only. Now that Phase 1 is green, Phase
1.5 can add the creation path on top without destabilising anything.

### What problem does Phase 1.5 solve for the user?

Currently, a user who defines a `SchemaGroup` with 5 fields and wants to store
actual data in ScalarDB must:

1. Leave the designer
2. Translate each `SchemaField` into ScalarDB column definitions (type + key role)
3. Write + run the DDL by hand (`admin.createTable(...)` via a script, or `cqlsh`, or
   a raw JDBC client)
4. Come back to the designer, open `DbConnectionTab`, rediscover the table in the
   catalog dropdown, pick it, map fields to columns

Steps 2–3 are mechanical but error-prone: the type mapping is non-obvious for `date`
and `image`, the column-name ↔ field-key alignment must match whatever the UI later
expects, and any typo means the binding step fails silently.

Phase 1.5 compresses steps 1–4 into one button click: **"このスキーマからテーブルを作成"**.

## Proposed Solution

### High-level flow

1. In `DbConnectionTab`, next to each unbound group, render a secondary button
   **"このスキーマからテーブルを作成"** (visible only when `tableMeta === undefined`)
2. Clicking the button expands an inline form **pre-populated from the group's fields**
3. The form shows, per field: `name` (defaults to `field.key`), `type` (defaults to the
   mapped `ScalarDbColumnType`), and `key role` (partition / clustering / index / none).
   At least one partition key is required
4. User picks a namespace (dropdown of existing namespaces **plus** an "(新規作成...)"
   option), and enters a table name
5. Submit → `POST /api/v2/scalardb/tables { namespace, tableName, columns[], partitionKeys[], clusteringKeys[], secondaryIndexes[] }`
6. On success (201):
   - Call `bindGroupToTable(groupId, { namespace, tableName })`
   - Call the existing `refetch` to reload the catalog (so the new table appears in
     the regular namespace/table dropdowns)
   - Auto-populate each field's `dbColumnName` to the column name the user just
     created (by iterating the submitted `columns[]` in order and dispatching
     `updateSchemaField` for each corresponding `SchemaField`)
   - Collapse the form
7. On failure (409 duplicate / 400 validation / 500 DDL error / 503 unreachable):
   surface the message inline, keep the form open with the user's input intact,
   offer a retry

### What is NOT in scope for Phase 1.5

- **Altering existing tables** (add/remove column, rename). Out of scope for the
  whole 4-phase plan; if someone needs schema evolution they use ScalarDB tooling
  directly
- **Dropping tables** from the UI. Dangerous + low value; same rationale as altering
- **Persisting the draft form across modal close/reopen**. The form is transient
  component state; if the user closes the modal mid-edit, they lose the partially
  filled form but keep all their schema definitions. Acceptable trade-off for
  Phase 1.5 simplicity
- **Multi-table bulk creation** (e.g. "create tables for all unbound groups"). Would
  need a separate confirmation flow and batch error handling; defer until real
  demand surfaces

## Technical Considerations

### Avoid polluting `SchemaGroup.tableMeta` with workflow state

The brainstorm's original wording suggested a `ScalarDbTableStatus` discriminated
union (`draft → creating → created → error`) living on `SchemaGroup`. **Phase 1.5
should NOT take that path.** Kieran's Phase 1 review explicitly argued against
workflow state living on a persistent domain object:

> `ScalarDBTableStatus` is a pointless discriminant — `tableMeta === undefined`
> already encodes "unlinked" … [If Phase 1.5 needs states, add them in Phase 1.5] as
> a proper discriminated union

But "as a proper discriminated union" **on the `SchemaGroup`**? No. The draft /
submitting / error phases are purely UI lifecycle: they live in a React `useState`
inside the creation form component, they never persist, and they never round-trip
through the backend. The instant the POST succeeds, the store is updated with a
plain `{ namespace, tableName }` — the same shape Phase 1 uses for "linked". The
binding contract doesn't care whether the table was created-via-UI or bound-to-
pre-existing. Once a table exists in ScalarDB, it's just a table.

So Phase 1.5 keeps `ScalarDbTableMeta = { namespace, tableName }` unchanged, and
adds NO new persistent state. The status machine lives in the component.

### Type mapping: SchemaFieldType → ScalarDbColumnType

Auto-populate the form, then let the user override if they know better:

| `SchemaFieldType` | Default `ScalarDbColumnType` | Notes |
|---|---|---|
| `string` | `TEXT` | Only reasonable choice |
| `number` | `DOUBLE` | Default to fractional; user can pick `INT`/`BIGINT`/`FLOAT` if they know it's integer-only |
| `boolean` | `BOOLEAN` | Only reasonable choice |
| `date` | `BIGINT` | Epoch millis — aligns with how v2 already serializes dates in the JSON data source |
| `image` | `TEXT` | Assume URL. `BLOB` is available as an override for true inline storage |
| `array` | *excluded from the form* | Detail groups bind to a whole table; individual `array` fields at the master level cannot become a single column. Show an explanation and exclude |

The form renders each field as a row with its type preselected. User can change the
type via a dropdown constrained to the 7 valid `ScalarDbColumnType` values.

### Partition key + clustering key defaults

ScalarDB requires **at least one partition key** per table. Defaults:
- **Master groups**: auto-select the first field as partition key. If the group has
  a field named `id` / `key` / `code`, prefer that. Otherwise the first field.
- **Detail groups**: auto-select the first field as partition key AND a second field
  as clustering key. If no second field exists, surface a validation error
  ("明細グループは最低 2 フィールド必要です (partition + clustering)")

User can override any of these in the form. Enforce at submit: ≥ 1 partition key
required; detail groups additionally require ≥ 1 clustering key.

### File size: extract `GroupBindingSection` first

`DbConnectionTab.tsx` is currently 469 LOC, already past the plan's 400 LOC ceiling
after the Phase 1 refactor. Adding a creation form inline would push it to ~700+.

**Prerequisite step for Phase 1.5**: extract `GroupBindingSection` into its own file
`src/components/modals/dbConnection/GroupBindingSection.tsx` and move `FieldColumnMap`
+ `FieldColumnRow` to `src/components/modals/dbConnection/FieldColumnMap.tsx`. The
new `CreateTableForm.tsx` sibling lives in the same subdirectory. After extraction:

```
src/components/modals/
  DbConnectionTab.tsx              (~140 LOC — orchestrator only)
  dbConnection/
    GroupBindingSection.tsx        (~220 LOC — binding UI)
    FieldColumnMap.tsx             (~80 LOC — field ↔ column rows)
    CreateTableForm.tsx            (~240 LOC — NEW in Phase 1.5)
    types.ts                       (~20 LOC — shared prop types if needed)
```

### Backend controller: new file, not a rename

Per Simplicity: renaming existing code just because a new operation category arrives
is premature. Keep `V2ScalarDbCatalogController` as the read-only catalog endpoint
(what it does today). Add a **new** `V2ScalarDbTableController.java` for Phase 1.5's
single POST. This gives us two small, focused controllers rather than one sprawling
`V2ScalarDbAdminController` that mixes reads and writes.

**Controller cap (Architecture round 1 + round 2 alignment):** the ScalarDb-specific
controller pair stops at two: `V2ScalarDbCatalogController` (read) and
`V2ScalarDbTableController` (write). **Future endpoints in Phase 2 / 3 — including
template-scoped data evaluation, computed-field evaluation, and projection-based
binding endpoints — belong on TEMPLATE-scoped controllers** (`V2TemplateController`,
`V2EvaluateController`, etc.), NOT on a third ScalarDb controller. The partition
axis is "is this endpoint a generic ScalarDb admin operation that any caller might
issue?" → ScalarDb controllers, vs "is this endpoint scoped to a specific report
template?" → template-scoped controllers. Phase 2's `/api/v2/templates/{id}/projection`
fits the latter and must NOT land on `V2ScalarDbCatalogController` or
`V2ScalarDbTableController`. (The earlier draft of this section invited "PUT/DELETE
into V2ScalarDbTableController" — that was wrong and is corrected here. PUT/DELETE
on tables, if they ever land, would still go on V2ScalarDbTableController because
they remain ScalarDb-scoped, not template-scoped — but Phase 1.5 explicitly
considers PUT/DELETE out of scope for the entire 4-phase plan.)

### CSRF + write-path middleware

Phase 1's `GET /api/v2/scalardb/catalog` is a safe read that skips CSRF verification
(per `ApiRoutes.java:79-85` middleware: "verify Origin header on state-changing
requests"). The new `POST /api/v2/scalardb/tables` is state-changing and **will**
go through that Origin-check middleware automatically. No new middleware needed,
but the test plan must include a case verifying the endpoint is reachable from
the same-origin dev server (the existing Origin check already handles this).

### ScalarDB 3.14.4 write API — verified signatures (jar inspection)

**Source:** `~/.gradle/caches/modules-2/files-2.1/com.scalar-labs/scalardb/3.14.4/.../scalardb-3.14.4.jar`, verified via `javap` during deepen research.

**`DistributedTransactionAdmin` write methods** (inherited from `com.scalar.db.api.Admin`):

| Method | Return | Notes |
|---|---|---|
| `createNamespace(String ns)` | `void` | Throws `ExecutionException` on pre-existence |
| `createNamespace(String ns, boolean ifNotExists)` | `void` | Idempotent when `ifNotExists=true` — **NOT used here** |
| `createTable(String ns, String t, TableMetadata m)` | `void` | Throws `ExecutionException` on pre-existence |
| `createTable(String ns, String t, TableMetadata m, boolean ifNotExists)` | `void` | Idempotent when `ifNotExists=true` — **NOT used here** |
| `tableExists(String ns, String t)` | `boolean` | Used for pre-flight check + 409 path |
| `namespaceExists(String ns)` | `boolean` | Used for auto-create-namespace |

**Why we skip the `ifNotExists` overloads:** Phase 1.5 specifically needs a 409 Conflict response when the user tries to create a table that already exists, because the client has a recovery flow ("代わりに既存テーブルにバインドする") that turns the duplicate into a plain bind. `ifNotExists=true` would silently succeed and skip that recovery path. So the code stays with the explicit `tableExists` → 409 guard.

**Exception hierarchy** (verified from `com.scalar.db.exception.storage.*`):

```
ExecutionException (checked)
├── RetriableExecutionException   ← transient failures (JDBC connection timeout, unreachable)
└── NoMutationException            ← not relevant to DDL
```

`ExecutionException` exposes the following methods for classifying non-retriable failures:
- `isAuthenticationError()` → auth credentials wrong → map to HTTP 401
- `isAuthorizationError()` → user lacks privilege (e.g. no CREATE TABLE permission) → map to HTTP 403
- `isSuperuserRequired()` → privilege escalation needed → map to HTTP 403
- `getRequiredPrivilege()` → optional detail for error message

**Revised 3-way error taxonomy:**

```java
try (DistributedTransactionAdmin admin = factory.getTransactionAdmin()) {
    // ... happy path ...
} catch (RetriableExecutionException e) {
    // Transient: JDBC unreachable, connection timeout. Client should retry.
    throw new ServiceUnavailableResponse("ScalarDb unreachable: " + e.getMessage());
} catch (ExecutionException e) {
    if (e.isAuthenticationError()) {
        throw new UnauthorizedResponse("ScalarDb authentication failed");
    }
    if (e.isAuthorizationError() || e.isSuperuserRequired()) {
        throw new ForbiddenResponse("ScalarDb permission denied: " + e.getMessage());
    }
    // All other non-retriable failures: DDL rejection (reserved word, invalid type, etc.)
    // These are NOT retriable and are NOT the client's fault at the request-shape level
    // (our client-side validator already ran). Map to 500 — the server couldn't complete
    // the request despite well-formed input.
    throw new InternalServerErrorResponse("ScalarDb DDL rejected: " + e.getMessage());
}
```

This upgrades the original "catch Exception → 503" approach into a precise 4-class mapping (503 / 401 / 403 / 500 for backend failures; 400 / 409 stay in the pre-flight validation phase).

### `TableMetadata.Builder` API — confirmed

Full builder surface verified:

- `TableMetadata.newBuilder()` — empty builder
- `TableMetadata.newBuilder(TableMetadata existing)` — copy-on-write from existing (not needed here)
- `addColumn(String name, DataType type)` — add a column
- `addColumn(String name, DataType type, boolean encrypted)` — encrypted overload, not needed for Phase 1.5
- `addPartitionKey(String columnName)` — partition key (≥1 required; `build()` throws if absent)
- `addClusteringKey(String columnName)` — clustering key with default ordering
- `addClusteringKey(String columnName, Scan.Ordering.Order order)` — with `ASC` / `DESC` (deferred to future)
- `addSecondaryIndex(String columnName)` — secondary index
- `removeColumn(String)` / `removePartitionKey(String)` / etc. — only useful with `newBuilder(existing)`
- `build()` — throws on missing partition key; the exact exception class is undocumented in the javadoc bundled with the jar. Phase 1.5 treats `build()` as last-resort defensive: all real validation happens client-side + server-side before this call.

**`DataType` enum (reconfirmed from jar):** `BOOLEAN`, `INT`, `BIGINT`, `FLOAT`, `DOUBLE`, `TEXT`, `BLOB`. **No `TIMESTAMP`.** The type-mapping table below must use `BIGINT` for `date` (epoch millis).

## Research Insights — v1 + v2 Convention Checklist

Compressed reference lists from the deepen research. For full cited paths, see the Sources appendix at the end of this plan.

### v1 creation form — port list (file:line references in Sources appendix)

**Port as-is:**
- Enter/Escape keyboard shortcuts on column-row editor (v1 `ScalarDBFieldForm.tsx:43-45`)
- Inline validation message list rendering (v1 `ScalarDBGroupSetup.tsx:197-202`)
- Key-role-per-group-role restrictions: master disables clustering-key selection, detail disables secondary-partition-key selection (v1 `ScalarDBGroupSetup.tsx:37-42`)
- `canCreate` gate: `hasPK && (role !== 'detail' || hasCK) && Boolean(namespace) && Boolean(tableName)` (v1 `ScalarDBGroupSetup.tsx:82-90`)

**Port with modification:**
- Status machine → component-local `useState` instead of persisted on `SchemaGroup.tableMeta` (avoids the "stuck at 作成中" refresh bug)
- Error display → parse the JSON error body and surface the mapped Japanese UI message, instead of v1's generic "テーブル作成エラー"
- Namespace/tableName → two separate inputs with independent regex validation, not one combined `"ns.table"` input
- Endpoint → `POST /api/v2/scalardb/tables` with full table definition, not v1's minimal `PUT /schemas/{id}` status update
- Auto-bind → atomic `bindGroupToTableWithColumns` on success, not v1's "user clicks bind as a separate step"

**Do NOT port (known v1 bugs / anti-patterns):**
- `status` persisted on the domain object (page refresh mid-creation → stuck UI)
- `document_id` auto-injected as PK for every group (`fieldDefaults.ts:11-72`)
- JS-reserved-word blocklist applied to field names (`bindingValidator.ts:22-33`)
- Combined `"namespace.table_name"` parsing (v1 `ScalarDBGroupSetup.tsx:52-66`)
- Throwaway error messages discarding the server response body (v1 `schemaApi.ts:66`)
- No idempotency check before `createTable` on the backend

### v2 POST controller conventions

1. **Body parsing**: `ctx.body()` → null/blank check → size check (1 MB cap) → `MAPPER.readTree()` inside try/catch → inline 400 on parse failure. Canonical: `V2FormResponseController.java:89-118`, `V2SchemaInferController.java:34-50`. No `bodyAsClass`, no typed records.
2. **Validation**: `JsonNode` trees throughout. `req.path("x").asText()`, `.isArray()`, `.size()` etc. Error returns via inline `ctx.status(400).json(Map.of("error", "..."))`. No `BadRequestResponse` exception, no envelope class.
3. **Error body shape**: `Map.of("error", message)` in ENGLISH. No error codes, no structured fields (except the new `correlationId` added by Phase 1.5 for exception paths per Security #4).
4. **201 Created**: `ctx.status(HttpStatus.CREATED); ctx.json(body);`. Canonical: `V2FormResponseController.java:140`.
5. **Test pattern**: hand-rolled Mockito `Context` mocks (NO `JavalinTest`); capture JSON via `doAnswer`; verify status via `verify(ctx).status(...)`. Canonical: `V2SchemaInferControllerTest.java:15-36`.
6. **No 409 precedent**: Phase 1.5 establishes it. Shape: `{"error": "Table already exists: <ns>.<tableName>"}` — 409 bodies MUST carry enough info to identify the conflicting resource (Architecture #4).
7. **No rate limiting** for admin/designer-tool write endpoints (only `V2FormResponseController` uses rate limiting, which is appropriate for user-submission endpoints).
8. **Frontend POST**: request body is a TypeScript-typed object passed to `jsonBody({...})`; response is Zod-validated. No Zod for the request. Canonical: `createReport`, `submitResponse` in `reportApi.ts`.

## System-Wide Impact

### Interaction graph

1. User opens `DataBindingModal` → `DB接続` tab → `DbConnectionTab` mounts
2. Catalog fetch fires (Phase 1 behaviour, unchanged)
3. For an unbound group, user clicks **"このスキーマからテーブルを作成"**
4. `CreateTableForm` mounts inline, pre-populates column list from `group.fields`,
   auto-selects partition key defaults
5. User fills in namespace + tableName + tweaks column types/roles
6. Click Submit → component-local state moves to `submitting`, button disabled
7. `createScalarDbTable(request, signal)` → `POST /api/v2/scalardb/tables`
8. Backend: `V2ScalarDbTableController.createTable` →
   - Validates request body (namespace / table name format; ≥ 1 PK; column refs exist)
   - Opens `factory.getTransactionAdmin()` via try-with-resources
   - `admin.namespaceExists(ns)` → if not, `admin.createNamespace(ns)`
   - `admin.tableExists(ns, tableName)` → if yes, throw `ConflictResponse` (409)
   - Builds `TableMetadata` from the column list using the
     `TableMetadata.Builder` pattern already used in `JsonBlobRepository.java:51-63`
   - Calls `admin.createTable(ns, tableName, metadata)`
   - Returns 201 with the full TableMetadata reflecting the reality on disk
     (re-reads via `getTableMetadata` to confirm round-trip)
9. Client on success:
   - Dispatches `bindGroupToTable(groupId, { namespace, tableName })`
   - For each column the user just created, dispatches `updateSchemaField(groupId, fieldId, { dbColumnName })`
   - Dispatches `refetch` (already exposed by `DbConnectionTab` via the `再取得`
     button handler) → the new namespace/table appear in the catalog dropdowns
   - Collapses the form
10. Client on failure:
    - Keeps the form open with user input intact
    - Shows the error message + a Retry button
    - No store writes happen on failure

### Error & failure propagation

**Error body language:** English in the JSON (matches `V2FormResponseController`,
`V2SchemaInferController`, `V2TemplateController` — every existing v2 controller
emits English error messages). Japanese copy lives only in the React UI layer,
which maps codes to localized strings at render time. **Do not emit Japanese in
the JSON error body.**

**No raw `e.getMessage()` in public bodies.** JDBC driver exception messages
commonly include the full connection URL, hostname/port, embedded credentials,
database version, native error codes, and schema/user names. Leaking these to
the browser gives any authenticated user (or an XSS payload running in the
designer) fingerprinting information on the backend store. Every error path
that would otherwise interpolate `e.getMessage()` instead:

1. Generates a correlation ID (`UUID.randomUUID().toString().substring(0, 8)`)
2. Logs the full message at WARN/ERROR via SLF4J with the correlation ID,
   `principal.userId()`, namespace, tableName, and an `outcome=<code>` marker
3. Returns a generic English public message plus `"correlationId": "<id>"` in
   the JSON body so a developer can cross-reference the server logs

| Failure | HTTP | Backend JSON | Client UI (Japanese) |
|---|---|---|---|
| Missing body / invalid JSON | 400 | `{"error": "Invalid JSON body"}` | 「リクエストボディが不正です」 |
| Missing required field | 400 | `{"error": "Field 'X' is required"}` | 「必須項目 X が未入力です」 |
| Identifier regex violation | 400 | `{"error": "Invalid identifier: '<value>'"}` | 「識別子が不正です: <value>」 |
| No partition keys | 400 | `{"error": "At least one partition key is required"}` | 「パーティションキーを 1 つ以上選択してください」 |
| Detail group missing clustering key | 400 | `{"error": "Detail group requires at least one clustering key"}` | 「明細グループにはクラスタリングキーが必要です」 |
| Key references unknown column | 400 | `{"error": "Key column '<name>' not found in columns list"}` | 「キー列 <name> が列一覧にありません」 |
| Duplicate column names | 400 | `{"error": "Duplicate column name: '<name>'"}` | 「列名が重複しています: <name>」 |
| Duplicate partition/clustering/index key entries | 400 | `{"error": "Duplicate key column: '<name>'"}` | 「キー列が重複しています: <name>」 |
| Array length caps (columns>200, PK>16, CK>16, index>32) | 400 | `{"error": "Too many <columns/keys> (max N)"}` | 「<列/キー>が多すぎます」 |
| `columns` is not an array / shape-type-confusion | 400 | `{"error": "Field 'columns' must be an array of objects"}` | 「列の形式が不正です」 |
| Namespace+table already exists | 409 | `{"error": "Table already exists: <ns>.<tableName>"}` | 「テーブルは既に存在します」 + 「代わりに既存テーブルにバインドする」ボタン |
| `RetriableExecutionException` (connection, timeout) | 503 | `{"error": "ScalarDb unreachable", "correlationId": "<id>"}` | 「ScalarDB に接続できません」 + retry |
| `ExecutionException.isAuthenticationError()` | 401 | `{"error": "ScalarDb authentication failed", "correlationId": "<id>"}` | 「ScalarDB 認証に失敗しました」 |
| `ExecutionException.isAuthorizationError()` / `isSuperuserRequired()` | 403 | `{"error": "ScalarDb permission denied", "correlationId": "<id>"}` | 「ScalarDB 権限が足りません」 |
| `ExecutionException` (other — DDL rejection, reserved word, invalid type). **Before returning 500, re-check `tableExists` and convert to 409 if the table now exists (TOCTOU recovery).** | 500 | `{"error": "ScalarDb DDL rejected", "correlationId": "<id>"}` | 「テーブル作成に失敗しました」 |
| Request body exceeds 1 MB | 413 | `{"error": "Request body too large (max 1 MB)"}` | 「リクエストが大きすぎます」 |
| Unauthenticated request (no session cookie) | 401 | `{"error": "Authentication required"}` (from global `before` filter, not this controller) | (handled upstream) |

Key distinctions:
- **503 vs 500**: `RetriableExecutionException` → retry may succeed. Plain `ExecutionException` → DDL rejected; retry will fail the same way. Only 503 gets a retry button in the UI.
- **401 vs 403**: auth (wrong creds) vs authz (right creds, insufficient privilege).
- **409 vs 400**: request is valid but target already exists (triggers "bind to existing" recovery) vs request is malformed (inline validation).
- **TOCTOU recovery**: after catching `ExecutionException` that would map to 500, call `admin.tableExists(ns, tableName)` once more. If now `true`, return 409 instead — a concurrent request won the race. Three extra lines in the catch block.

### State lifecycle risks

**Partial failure after createTable but before the client-side auto-bind:**

If `admin.createTable` succeeds but the response never reaches the client (network
drop, browser crash), the table exists in ScalarDB but the `SchemaGroup` has no
`tableMeta`. The user retries, gets a 409 "already exists". The error handling in
step 9 above includes a **"代わりに既存テーブルにバインドする"** action that closes
the form and pre-selects the table in the main namespace/table dropdowns — user
completes the binding in one extra click.

**Orphaned namespace:**

If `createNamespace` succeeds but `createTable` throws, we've created an empty
namespace that will be invisible to `getNamespaceNames()` (which only lists
populated namespaces — verified in Phase 1). The user's retry will succeed. No
cleanup needed; ScalarDB tolerates empty namespaces, and the client never sees
them anyway.

**Non-idempotent state on retry:**

The backend handler must check `tableExists` BEFORE `createTable` to avoid
accidentally clobbering a table on retry. Include this as an explicit test case.

### API surface parity

`POST /api/v2/scalardb/tables` is a new endpoint; no existing equivalent to
update. `/api/v1/schemas` in the legacy `SchemaController.java` handles a
different concept (JSON blob schema storage) — do not touch or confuse it.

### Integration test scenarios

1. **Happy path end-to-end:** form submit → POST → table created in an in-memory
   SQLite-backed ScalarDB → `getCatalog` now returns the new namespace + table →
   store reflects binding + field column names. Assert via a separate Gradle test
   that hits the real `DistributedTransactionAdmin` against the dev `scalardb.properties`
2. **Retry after 409:** user creates `app.users`, then tries again with the same
   name → backend returns 409 → client flow offers "代わりにバインドする" → state
   is updated to the existing table without creating anything new
3. **Missing partition key:** form submits a column list with no PK → backend
   returns 400 → form shows the message, keeps input
4. **Namespace auto-created:** form submits `{namespace: 'brand_new', tableName: 'x'}`
   → backend creates the namespace first, then the table → subsequent `GET /catalog`
   returns `brand_new` in the list
5. **Form + binding race:** user clicks Submit twice rapidly → only one POST fires
   (Submit button disables on `submitting`). Assert via RTL `fireEvent.click` twice
   and counting the `fetchMock` calls

## Acceptance Criteria

### Functional requirements

- [x] `GroupBindingSection`, `FieldColumnMap`, `FieldColumnRow` extracted from
      `DbConnectionTab.tsx` into `src/components/modals/dbConnection/` subdirectory.
      `DbConnectionTab.tsx` ≤ 180 LOC after extraction
- [ ] New file `src/components/modals/dbConnection/CreateTableForm.tsx` containing
      the inline creation form
- [ ] New backend controller `V2ScalarDbTableController.java` exposing
      `POST /api/v2/scalardb/tables`
- [ ] Wired into `AppWiring.java` as a new field and instantiated with
      `new V2ScalarDbTableController(factory)`
- [ ] Route registered in `ApiRoutes.registerV2Routes` (right next to the Phase 1
      `GET /api/v2/scalardb/catalog` line)
- [ ] Backend request shape (parsed from `ctx.body()` as `JsonNode` — no typed record DTO, matching the `V2FormResponseController` / `V2SchemaInferController` convention):
      ```json
      {
        "namespace": "string",
        "tableName": "string",
        "columns": [{ "name": "string", "type": "BOOLEAN|INT|BIGINT|FLOAT|DOUBLE|TEXT|BLOB" }],
        "partitionKeys": ["string"],
        "clusteringKeys": ["string"],
        "secondaryIndexes": ["string"]
      }
      ```
- [ ] Body parsing follows the v2 convention: `String body = ctx.body(); if (body == null || body.isBlank()) return 400; JsonNode node = MAPPER.readTree(body);` with try/catch on the parse and explicit 400 on malformed JSON
- [ ] Body size cap: 1 MB (matches `V2SchemaInferController.MAX_BODY_BYTES`)
- [ ] Backend validates: at least 1 column, at least 1 partition key, detail groups have ≥1 clustering key, every partitionKey/clusteringKey/secondaryIndex entry refers to a defined column, no duplicate column names, namespace/tableName/columnName match `^[a-zA-Z_][a-zA-Z0-9_]*$` (ASCII only — the v1 Japanese-inclusive regex does NOT apply to SQL identifiers)
- [ ] Backend idempotency guard: check `admin.tableExists` before `createTable` and return 409 if the table already exists. **Do NOT use the `createTable(..., ifNotExists=true)` overload** — Phase 1.5 specifically needs the 409 to trigger the client recovery flow
- [ ] Backend creates namespace if absent via `admin.createNamespace` (using `namespaceExists` guard, NOT the `ifNotExists` overload, so the exception taxonomy stays uniform)
- [ ] Backend exception mapping — **3-way taxonomy verified from `scalardb-3.14.4.jar`:**
  - `RetriableExecutionException` → `ServiceUnavailableResponse` (503)
  - `ExecutionException.isAuthenticationError()` → `UnauthorizedResponse` (401)
  - `ExecutionException.isAuthorizationError()` or `isSuperuserRequired()` → `ForbiddenResponse` (403)
  - Other `ExecutionException` → `InternalServerErrorResponse` (500) — DDL rejection, the request was well-formed but the store refused
- [ ] Backend error body is **English** (matches every existing v2 controller); Japanese strings live only in the React component (see the updated Error table for the exact English text per code)
- [ ] Backend returns 201 with the actual `TableMetadata` re-read via `admin.getTableMetadata` (so the client sees reality on disk, not the request echo). Response shape reuses Phase 1's `ScalarDbCatalogTable` schema
- [ ] Frontend `createScalarDbTable(request, signal?)` function added to `src/api/reportApi.ts`:
  - Request typed as an explicit TypeScript interface (`CreateScalarDbTableRequest`) — **NOT** a Zod schema (matches the `createReport`, `submitResponse` convention where request is typed but response is Zod-validated). **This is the first `*Request` type in `reportApi.ts`**; acknowledge as a new convention
  - Response validated via the existing Phase 1 `ScalarDbTableEntrySchema` — **Phase 1.5 must export this schema** (currently module-private at `reportApi.ts:470`). Do NOT create a duplicate schema
  - Uses `jsonBody({...})` helper from `reportApi.ts`
  - Accepts optional `AbortSignal` for cancellation on unmount
- [ ] Phase 1 file modification: **export `ScalarDbTableEntrySchema`** from `src/api/reportApi.ts` (currently module-private). Trivial `const` → `export const` change; no rename. Enables the response-schema reuse above

### Security requirements

- [ ] Endpoint **requires an authenticated principal** (inherited automatically from the global `before("/api/*")` filter at `server/src/main/java/com/report/server/ApiRoutes.java:92-106`). Add a test case asserting the endpoint returns 401 when no session cookie is present (or document that this is covered by existing `ApiRoutes` middleware tests)
- [ ] **Authorization is intentionally deferred**: any authenticated principal can create tables in Phase 1.5. Production multi-user deployments must add an `admin`/`schema_editor` role gate before shipping. Documented as a Phase 1.5 non-goal in the "What is NOT in scope" section
- [ ] **No raw `e.getMessage()` in public error bodies.** For every path that catches `ExecutionException` / `RetriableExecutionException` / any other `Exception`:
  - Generate a correlation ID (`UUID.randomUUID().toString().substring(0, 8)`)
  - Log at WARN level via SLF4J with: correlation ID, `principal.userId()`, namespace, tableName, the full exception including message + class name
  - Return a GENERIC English public message per the updated Error table, plus `"correlationId": "<id>"` in the JSON body
- [ ] **Audit logging on every attempt** (success or failure) via the new `AuditLog.op(...)` helper. INFO on success, WARN on failure. Call shape: `AuditLog.op("create_table", principal, namespace, tableName, outcome, correlationId)` where `outcome` is one of `created`, `conflict`, `validation_error`, `unreachable`, `authz_denied`, `ddl_rejected`. The helper itself emits the canonical SLF4J line shape so future Phase 2 controllers calling `AuditLog.op("evaluate", ...)` produce identically-shaped lines.
- [ ] **Array length caps** (matches `V2SchemaInferController` precedent):
  - `columns.length ≤ 200`
  - `partitionKeys.length ≤ 16`
  - `clusteringKeys.length ≤ 16`
  - `secondaryIndexes.length ≤ 32`
  - Reject with 400 and a specific English error message naming which array exceeded the cap
- [ ] **Duplicate rejection in key lists**: `partitionKeys`, `clusteringKeys`, `secondaryIndexes` all reject duplicates with 400 (a self-duplicated key list is meaningless and produces unclear ScalarDB errors downstream)
- [ ] **TOCTOU recovery in the exception handler**: inside the `catch (ExecutionException e)` block that maps to 500, call `admin.tableExists(namespace, tableName)` one more time. If `true`, return 409 instead (a concurrent request won the race). Test case required

### Store action + atomicity

- [ ] **New atomic store action `bindGroupToTableWithColumns(groupId, tableMeta, fieldColumns)`** added to `schemaSlice.ts` + declared in `store/types.ts`
  - Signature: `bindGroupToTableWithColumns(groupId: string, tableMeta: ScalarDbTableMeta, fieldColumns: ReadonlyArray<{ fieldId: string; dbColumnName: string }>): void`
  - **Why `ReadonlyArray<{fieldId, dbColumnName}>` and not `Record<string, string>`**: explicit pairing prevents key/value swap mistakes; `ReadonlyArray` preserves the user's column order from the form; cannot accidentally pass an empty `dbColumnName` and have it be silently dropped (the array entry must include both)
  - Single immer draft: sets `group.tableMeta` AND iterates `fieldColumns`, assigning `dbColumnName` on each matching `SchemaField` in one pass
  - **Does NOT call `pushHistory`** — the existing `bindGroupToTable`, `updateSchemaField`, and other schema-slice mutators are deliberately outside the history system (verified at `src/store/schemaSlice.ts:60-99`). The new action matches that convention. Re-entering schema mutations into the undo stack is a Phase 2 question, not a Phase 1.5 question
  - `CreateTableForm`'s success handler calls this action once instead of sequencing `bindGroupToTable` + N × `updateSchemaField`
  - Prevents N+1 re-renders that the N-dispatch sequence would cause
- [ ] **The "create-then-bind" atomicity is NOT a Phase 2 contract.** Phase 2's evaluate code must independently re-validate `dbColumnName` presence on every `SchemaField`; it must not assume bindings created via this action are distinguishable from bindings created via Phase 1's `bindGroupToTable` alone. Document this in the Brainstorm cross-check + flag for inclusion in the Phase 2 plan
- [ ] `CreateTableForm` is shown inline inside `GroupBindingSection` ONLY when
      `group.tableMeta === undefined`, via a toggle button
      "このスキーマからテーブルを作成"
- [ ] Form is pre-populated from `group.fields` using the type-mapping table
      documented above
- [ ] Fields of type `array` are excluded from the form with an explanatory note
- [ ] Master groups: first field (prefer `id`/`key`/`code` by name) is
      auto-selected as partition key
- [ ] Detail groups: first field is auto-selected as partition key AND second
      field as clustering key; validation error if fewer than 2 fields
- [ ] Each column row in the form lets the user change: name, type (dropdown),
      key role (none / partition / clustering / index)
- [ ] Submit flow handles 200/409/400/503/500 per the error table above
- [ ] 409 error offers a "代わりに既存テーブルにバインドする" recovery action
- [ ] On 201 success: form dispatches `bindGroupToTable` + per-field
      `updateSchemaField({ dbColumnName })` + refetches the catalog + collapses
- [ ] Submit button is disabled during the in-flight POST (prevents double-submit)
- [ ] Form preserves user input on error so a fix-then-retry works

### Non-functional requirements

- [ ] `npm run lint` passes with zero new warnings on new files
- [ ] `npm test -- --run` full suite passes (currently 1511; expect ~1535 after
      this plan: +6 backend tests, +12 frontend component tests, +6 API client
      tests)
- [ ] New backend controller has unit tests (mocked `DistributedTransactionAdmin`)
      covering: happy path, 409 duplicate, 400 validation, 503 ExecutionException,
      auto-namespace-create, re-read round-trip
- [ ] `CreateTableForm` RTL tests cover: default pre-population, form submit
      success, 409 recovery path, 503 error state, submit button disabled on
      in-flight, array fields excluded, partition key default for master
- [ ] `DbConnectionTab.tsx` ≤ 180 LOC after extraction; `CreateTableForm.tsx` ≤
      300 LOC; `V2ScalarDbTableController.java` ≤ 200 LOC

### Quality gates

- [ ] No mutation of store state outside immer drafts
- [ ] No hardcoded secrets; ScalarDB config continues to come from
      `scalardb.properties` / env vars
- [ ] `bindGroupToTable` is called exactly once on success (not twice due to an
      intermediate empty state)
- [ ] Post-implementation `code-reviewer` / Kieran pass with no HIGH findings

## Success Metrics

- Phase 1.5 unblocks Phase 2: no workflow state contamination on `SchemaGroup`
  means Phase 2 can add `BindingConnection[]` without first untangling a status
  enum that shouldn't exist
- Time to go from "SchemaGroup exists" to "bound to a real ScalarDB table" drops
  from "leave the designer + hand-write DDL + come back" to "one form submission"
- Zero regressions in the Phase 1 binding flow (all 17 `DbConnectionTab` tests
  and all 27 `schemaSlice` tests still pass)

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extraction of `GroupBindingSection` into its own file introduces a subtle regression in Phase 1 binding behaviour | Medium | High | Do the extraction as **the first commit**, run the full test suite, commit, then layer the new CreateTableForm work on top. The tests that already exist are the safety net |
| `admin.createTable` signature in ScalarDB 3.14.4 differs from assumptions | Low | Medium | `JsonBlobRepository.java:51-63` already uses it — copy that pattern exactly |
| User creates an invalid DDL (reserved word for table name, column name conflicts with partition key syntax) and the backend returns a confusing error | Medium | Low | Client-side validation rejects `^[a-zA-Z_][a-zA-Z0-9_]*$` violations before POST; anything that slips through gets the backend's error surfaced verbatim |
| Auto-populating `dbColumnName` from the submitted columns list relies on positional ordering being stable across the request / response | Low | Medium | Explicitly key the auto-bind loop by column name, not position. The submitted payload and the response both include explicit column names |
| The type mapping (`number → DOUBLE` by default) produces surprise when users expected integer columns | Medium | Low | Surface the default prominently with an inline "integer instead?" hint next to `number` rows. User can still override |
| Empty-namespace invisibility (Phase 1 caveat) means a user creates `brand_new.x` but later drops `x` externally — `brand_new` disappears from the catalog, even though ScalarDB still has it | Low | Low | Acknowledged in Phase 1 plan's Risks table; no new work needed here |
| `DistributedTransactionAdmin.createTable` is not atomic across namespace creation + table creation | Low | Low | Namespace creation is idempotent; the retry path (409 fallback) covers the realistic failure modes |

## Alternative approaches considered

### 1. Generate DDL server-side from a `SchemaGroup` reference instead of explicit column list

**Rejected.** Would tightly couple the backend to the frontend `SchemaGroup` shape,
and the backend would need to re-implement the type mapping + key-role heuristics
that the form already shows to the user. Explicit column list is simpler and lets
the user intervene.

### 2. Put the creation form in a nested modal on top of `DataBindingModal`

**Rejected.** Already got flagged by the Phase 1 architecture review (M3) that
adding another modal layer compounds the "where does binding config live" problem.
Inline expansion inside `GroupBindingSection` keeps the user in place and the focus
within the existing modal.

### 3. Persist a `ScalarDbTableStatus` discriminated union on `SchemaGroup`

**Rejected.** Addressed in Technical Considerations → "Avoid polluting tableMeta with
workflow state". The status machine is purely transient UI lifecycle; it never
round-trips through auto-save.

### 4. Share a single `V2ScalarDbAdminController` combining the Phase 1 catalog read and the Phase 1.5 table create

**Rejected.** Renaming the Phase 1 controller is churn with no current payoff, and
mixing read and write endpoints in one file trends toward the "admin junk drawer"
anti-pattern. Keep two focused controllers — `V2ScalarDbCatalogController` for
reads, `V2ScalarDbTableController` for writes — and let future endpoints pick
whichever matches their semantics.

## File change inventory

### Frontend

| File | Change | LOC (est.) |
|---|---|---|
| `src/components/modals/DbConnectionTab.tsx` | Slim down — extract subcomponents; add `showCreateFormForGroup` state + toggle button | −300 / +30 → ~180 total |
| `src/components/modals/dbConnection/GroupBindingSection.tsx` | **NEW** (extracted from DbConnectionTab, plus the "このスキーマからテーブルを作成" toggle + CreateTableForm mount) | ~230 |
| `src/components/modals/dbConnection/FieldColumnMap.tsx` | **NEW** (extracted FieldColumnMap + FieldColumnRow) | ~80 |
| `src/components/modals/dbConnection/CreateTableForm.tsx` | **NEW**. Imports `SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE` from `src/types/scalardb.ts` (round 2 reversal: NOT inlined). Soft target ≤ 350 LOC; hard ceiling 400 LOC. If it crosses 350 during implementation, extract `ColumnRowEditor.tsx` | ~380 |
| `src/components/modals/dbConnection/CreateTableForm.test.tsx` | **NEW** — 14 RTL cases: pre-population from group fields, master/detail PK/CK defaults, identifier validation inline, submit disabled during in-flight, happy path 201 auto-calls `bindGroupToTableWithColumns`, 409 recovery action, 503 retry, 401/403 error rendering with correlation ID visible, Enter/Escape shortcuts, `array` fields excluded from form, stale `tableMeta` preserved on error | ~260 |
| `src/components/modals/dbConnection/classifyCreateTableError.ts` | **NEW** — pure function mapping an `ApiError`/`NetworkError`/status code to `{code: 'invalid_request' \| 'conflict' \| 'unauth' \| 'forbidden' \| 'unreachable' \| 'server_error' \| 'network', showRetry: boolean, showRecovery: boolean, correlationId?: string}`. **No localized strings inside** — the helper is pure classification; the form maps `code → Japanese message` at render time so adding English/i18n later doesn't touch the helper. **`correlationId` extraction MUST use a narrowed type guard** (not `as any`): `body !== null && typeof body === 'object' && 'correlationId' in body && typeof (body as { correlationId: unknown }).correlationId === 'string' ? body.correlationId : undefined`. (Round 2: Kieran R2 #3 — decouple presentation from classification. Round 3 Kieran MEDIUM: explicit narrowing to prevent `any` slip.) | ~50 |
| `src/components/modals/dbConnection/classifyCreateTableError.test.ts` | **NEW** (6 cases: 400 → invalid_request, 409 → conflict + showRecovery, 401 → unauth, 403 → forbidden, 500 → server_error + showRetry false, 503 → unreachable + showRetry true) | ~60 |
| `src/components/modals/DbConnectionTab.test.tsx` | Existing tests still pass after extraction; no changes needed beyond imports if testing subcomponents in isolation | 0–20 |
| `src/api/reportApi.ts` | (1) **Export `ScalarDbTableEntrySchema`** at `reportApi.ts:470` (trivial `const` → `export const`, required for response validation reuse); (2) add `CreateScalarDbTableRequest` TypeScript interface; (3) add `createScalarDbTable()` function that validates the response via the now-exported `ScalarDbTableEntrySchema` | +60 |
| `src/api/reportApi.test.ts` | Add 8 cases: happy path 201, 400 validation error, 409 conflict with parseable resource identifier in body, 503 retry path with correlationId in body, 401 auth, 403 authz, 500 generic DDL rejection, `AbortSignal` propagation | +160 |
| `src/lib/scalardbIdentifier.ts` | **NEW** — exports `SCALARDB_IDENTIFIER_REGEX` and `validateScalarDbIdentifier(value: string): { valid: true } \| { valid: false; error: string }` (discriminated union — TypeScript narrows it for free; no inverted-boolean footgun). Single source of truth for identifier validation; used by `CreateTableForm` for inline feedback and by `createScalarDbTable` for early rejection. (Round 2 Kieran #4 — fix the inverted-boolean ergonomics.) | ~30 |
| `src/lib/scalardbIdentifier.test.ts` | **NEW** (5 cases: valid, empty, leading-digit, hyphen, Japanese chars) | ~40 |
| `src/lib/scalardbLimits.ts` | **NEW** — TypeScript mirror of `ScalarDbLimits.java`: `MAX_COLUMNS_PER_TABLE`, `MAX_PARTITION_KEYS`, `MAX_CLUSTERING_KEYS`, `MAX_SECONDARY_INDEXES`. Used by `CreateTableForm` for client-side validation so the user sees the cap before submitting. (Architecture R2-3) | ~10 |
| `src/types/scalardb.ts` | **MODIFY** — add `export const SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE: Readonly<Record<SchemaFieldType, ScalarDbColumnType>>` co-located with the `ScalarDbColumnType` enum. Phase 2's evaluate path will reuse it. (Round 2 reversed the round 1 decision to inline this in the form.) | +20 |
| `src/store/schemaSlice.ts` | Add `bindGroupToTableWithColumns(groupId, tableMeta, fieldColumns)` atomic action where `fieldColumns: ReadonlyArray<{fieldId, dbColumnName}>`. One immer draft. **Does NOT call `pushHistory`** — matches the existing `bindGroupToTable` convention (the schema slice is outside the history system). Writes both `tableMeta` and per-field `dbColumnName` in one pass | +30 |
| `src/store/schemaSlice.test.ts` | Add 4 cases: (1) happy path — tableMeta + all `fieldColumns` `dbColumnName` values set after one call, in-order; (2) nonexistent `groupId` is a no-op; (3) partial `fieldColumns` leaves unlisted fields untouched (does NOT clear them); (4) `fieldColumns` entries referencing nonexistent `fieldId` are silently ignored (defensive — same as `updateSchemaField` semantics) | +80 |
| `src/store/types.ts` | Add `bindGroupToTableWithColumns` to the `SchemaSlice` Pick + declare the signature in `StoreState` | +5 |

### Backend

| File | Change | LOC (est.) |
|---|---|---|
| `server/src/main/java/com/report/server/V2ScalarDbTableController.java` | **NEW** — body parsing + identifier validation + tableExists guard + TableMetadata builder + 3-way exception mapping. Uses the new `CorrelationId`, `AuditLog`, `ScalarDbLimits` helpers below | ~200 |
| `server/src/main/java/com/report/server/CorrelationId.java` | **NEW** — single static `generate()` method returning the first 8 chars of a UUID. Reused by Phase 2's evaluate controller. (Architecture R2-2) | ~20 |
| `server/src/main/java/com/report/server/AuditLog.java` | **NEW** — `op(operation, principal, namespace, tableName, outcome, correlationId)` SLF4J helper that emits the canonical audit log line shape. The `operation` parameter (e.g. `"create_table"`, `"evaluate"`, `"projection_write"`) generalizes the helper so Phase 2 doesn't need to add new methods. (Round 3 Architecture #1: prevent method sprawl across phases.) Reused by Phase 2 for any ScalarDb operation needing an audit trail. | ~25 |
| `server/src/main/java/com/report/server/ScalarDbLimits.java` | **NEW** — Java constants `MAX_COLUMNS_PER_TABLE = 200`, `MAX_PARTITION_KEYS = 16`, `MAX_CLUSTERING_KEYS = 16`, `MAX_SECONDARY_INDEXES = 32`. Single source of truth; mirrored on the frontend. (Architecture R2-3) | ~15 |
| `server/src/test/java/com/report/server/CorrelationIdTest.java` | **NEW** (3 cases: format is hex, length is 8, two calls produce different IDs) | ~25 |
| `server/src/test/java/com/report/server/AuditLogTest.java` | **NEW** (uses an SLF4J test appender to verify the log line shape; 2 cases: success and failure) | ~50 |
| `server/src/test/java/com/report/server/V2ScalarDbTableControllerTest.java` | **NEW** — 17 cases matching the `V2SchemaInferControllerTest` pattern: (1) happy path 201, (2) missing body 400, (3) invalid JSON 400, (4) missing namespace 400, (5) invalid identifier 400, (6) missing PK 400, (7) detail group missing CK 400, (8) duplicate column names 400, (9) unknown column in PK list 400, (10) `columns` is not an array → 400 with helpful message (type-confusion defense), (11) array length caps (columns > 200) → 400, (12) duplicate entries in `partitionKeys` → 400, (13) `tableExists` true → 409, (14) `RetriableExecutionException` → 503 with correlation ID in body, (15) `ExecutionException.isAuthorizationError()` → 403 with correlation ID in body, (16) generic `ExecutionException` → 500 with correlation ID in body, (17) TOCTOU: tableExists returns false initially, createTable throws, second tableExists returns true → 409 instead of 500 | ~360 |
| `server/src/main/java/com/report/server/AppWiring.java` | Add `v2ScalarDbTableCtrl` field + init | +3 |
| `server/src/main/java/com/report/server/ApiRoutes.java` | Register `POST /api/v2/scalardb/tables` right under the Phase 1 catalog route | +2 |

**Total estimated: ~1,800 LOC including tests** (up from the first-draft ~1,500 because rounds 1+2 of technical review added: the atomic store action + 4 tests, the `scalardbIdentifier.ts` helper + tests, the `classifyCreateTableError.ts` helper + tests, the `scalardbLimits.ts` mirror, the `CorrelationId.java` / `AuditLog.java` / `ScalarDbLimits.java` helpers + their tests, 5 more backend test cases for the expanded exception taxonomy + TOCTOU + array caps, 1 new frontend test case for correlation-ID rendering, the `ScalarDbTableEntrySchema` export, and the `SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE` constant in `src/types/scalardb.ts`). Of this, ~400 LOC is code-moves from the extraction step (not new code), ~1,400 LOC is net new. The bulk of the round-2 additions (~250 LOC) are reusable helpers (`CorrelationId`, `AuditLog`, `ScalarDbLimits`, `scalardbLimits.ts`) that Phase 2's evaluate endpoint will inherit — not duplicated work, infrastructure with multi-phase ROI.

## Implementation order (TDD)

0. **Environment verification** (2 min): confirm the Phase 1 branch is still
   green (`npx vitest run && ./gradlew test` in `server/`). Branch from HEAD
   (`feat/scalardb-schema-binding-phase1` is still current) or rebase on `main`
   once Phase 1 merges.

1. **Refactor commit: extract Phase 1 subcomponents** — move
   `GroupBindingSection`, `FieldColumnMap`, `FieldColumnRow`, `formatFetchError`
   into `src/components/modals/dbConnection/`. Zero behavioural changes. Run the
   full suite; all Phase 1 tests must still pass. Commit as
   `refactor(ui): extract DbConnectionTab subcomponents for Phase 1.5`.

2. **Export `ScalarDbTableEntrySchema`** from `src/api/reportApi.ts:470` (trivial
   `const` → `export const`). Run `npx tsc --noEmit` to confirm no one was
   accidentally depending on it being module-private. Commit as part of the
   refactor or as a separate pre-commit if the timing matters.

3. **Pure helpers: identifier validator + limits constants** (tests first).
   - `src/lib/scalardbIdentifier.ts` exports `SCALARDB_IDENTIFIER_REGEX` and
     `validateScalarDbIdentifier(value)` returning a discriminated union
     `{valid: true} | {valid: false, error: string}` (no `null = valid` footgun).
   - `src/lib/scalardbLimits.ts` mirrors the Java constants below.
   - Server side: `ScalarDbLimits.java` (constants), `CorrelationId.java` (single
     `generate()` returning 8-char hex from a UUID), `AuditLog.java` (SLF4J helper
     emitting the canonical audit-log line). All three are reused by Phase 2.
   - Add the type-map constant `SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE` to
     `src/types/scalardb.ts` co-located with the type. NOT a new file.

4. **Atomic store action** (tests first). Add `bindGroupToTableWithColumns(groupId, tableMeta, fieldColumns)` to
   `schemaSlice.ts` + type in `store/types.ts`. Signature uses
   `ReadonlyArray<{fieldId, dbColumnName}>`, NOT `Record<string, string>`.
   **Does NOT call `pushHistory`** — matches the existing `bindGroupToTable`
   convention (verified at `src/store/schemaSlice.ts:73-99`; the schema slice is
   outside the history system in Phase 1). Test cases per the inventory: happy
   path, nonexistent groupId no-op, partial fieldColumns leaves unlisted fields
   untouched, fieldColumns entries with unknown fieldId silently ignored.

5. **Backend controller (tests first)** — write `V2ScalarDbTableControllerTest`
   with all 17 cases listed in the File Change Inventory. The four exception
   cases (503 retriable, 403 authz, 401 auth, 500 DDL rejection) each need a
   distinct `Mockito.when(admin.createTable(...)).thenThrow(...)` setup with the
   right subclass of `ExecutionException`. The TOCTOU case needs a two-step
   `when(admin.tableExists(...)).thenReturn(false).thenReturn(true)` stub plus a
   `createTable` throw in between. The correlation-ID cases verify the
   `doAnswer`-captured map contains a `correlationId` key of the expected length.
   Verify status via `verify(ctx).status(...)`.
   Implement `V2ScalarDbTableController.java` until green. Include audit
   logging via SLF4J and the array-length caps. Wire into AppWiring
   (add `v2ScalarDbTableCtrl` field next to `v2ScalarDbCatalogCtrl` from Phase 1)
   and ApiRoutes (add the POST route next to the GET catalog route). Smoke test with
   `curl -X POST http://localhost:8080/api/v2/scalardb/tables -H 'Content-Type: application/json' -d '{"namespace":"smoke","tableName":"t","columns":[{"name":"id","type":"BIGINT"}],"partitionKeys":["id"],"clusteringKeys":[],"secondaryIndexes":[]}'` — expect 201 on first run, 409 on second run with the same input.

6. **Frontend API client** — add `CreateScalarDbTableRequest` TypeScript
   interface + `createScalarDbTable()` function + 8 test cases. Reuses the
   now-exported `ScalarDbTableEntrySchema` for response validation.

7. **Frontend error-classification helper** (tests first).
   `classifyCreateTableError.ts` + its 6-case test file. Pure function over an
   input shape like `{ status: number, body?: unknown }`; returns
   `{ code, showRetry, showRecovery, correlationId? }`. **No locale strings in
   the helper** — the form maps `code → message` at render time.

8. **Frontend form (tests first)** — write `CreateTableForm.test.tsx` covering
   the 14 RTL cases. Implement `CreateTableForm.tsx` until green. Use the type-map
   constant from `src/types/scalardb.ts` (NOT inlined; reversed from round 1).
   Use the identifier validator + limits from step 3. Use the
   `classifyCreateTableError` helper from step 7 — but render the Japanese
   message inside the form via `code → message` mapping (the helper does NOT
   carry locale strings). On success, call the single atomic
   `bindGroupToTableWithColumns` action from step 4.
   **Selector pattern (Phase 1 footgun mitigation)**: when the form reads
   schema groups via `useReportStore`, select `s.definition.schema` as a stable
   reference first, then derive `groups` outside the selector. Do NOT use
   `?? []` inline inside the selector — Phase 1's `DbConnectionTab` hit an
   infinite-loop bug from this pattern. (Kieran R2 #7.)
   Soft target ≤ 350 LOC; if it exceeds 350, extract `ColumnRowEditor.tsx` as
   the only permitted intra-Phase-1.5 split.

9. **Wire the form into `GroupBindingSection`** — add the toggle button and
   the conditional inline mount. `CreateTableForm` calls `refetch()` on success
   so the new table appears in the catalog immediately.

10. **Full stack validation** — `npx tsc --noEmit`, `npm run lint`, `npx vitest run`,
    `./gradlew test`, manual smoke in `npm run dev:full` (if the user wants).
    Check that `npm run lint` still shows zero new warnings on the new files
    (pre-existing dirty-state errors in `CalculationTab.tsx` / `scalarQuotationTemplate.ts`
    are unchanged from Phase 1).

11. **Post-implementation `code-reviewer`** — focused on `CreateTableForm.tsx`,
    `V2ScalarDbTableController.java`, the new store action, and the error
    helper. Address CRITICAL + HIGH findings before committing.

## Brainstorm cross-check

| Brainstorm decision | Addressed in this plan |
|---|---|
| "Phase 1.5 — UI からのテーブル新規作成" as a separate phase | ✅ This plan is exactly that phase |
| `POST/PUT /schemas` + DDL generation | ✅ `POST /api/v2/scalardb/tables` — `PUT` (alter) explicitly deferred |
| `draft → creating → created/error` status machine | ✅ Implemented as transient *component-local* state, NOT persisted. See Technical Considerations for the rationale |
| "デザイナー画面からテーブルを作成できる" as the deliverable | ✅ Inline form in `GroupBindingSection` with auto-populated columns from the SchemaGroup |
| Scope exclusions carried over (no alter, no drop, no multi-table bulk) | ✅ Documented in "What is NOT in scope for Phase 1.5" |
| 4-phase split preserved | ✅ Phase 2 still follows; this plan doesn't drift into BindingConnection / evaluate territory |

## Phase 2 Inheritance Checklist

Items the Phase 2 plan author MUST check, with the source of each requirement. (Round 2 Architecture R2-5 — consolidates the scattered "Phase 2 must..." notes from this plan's audit trail into a single list.)

- [ ] **3-way exception taxonomy** (Architecture R1 #3): Phase 2's `V2EvaluateController` and any other endpoint that calls `factory.getTransactionAdmin()` or queries via ScalarDB MUST map `RetriableExecutionException` → 503, `ExecutionException.isAuthenticationError()` → 401, `isAuthorizationError() || isSuperuserRequired()` → 403, other `ExecutionException` → 500. Bit-identical to this plan's Error table or the client-side error-handling diverges.
- [ ] **409 body shape** (Architecture R1 #4): any future endpoint returning 409 Conflict MUST include parseable resource-identifier information in the JSON body, not just a human-readable string. The Phase 1.5 shape `{"error": "Table already exists: <ns>.<tableName>"}` is the canonical pattern.
- [ ] **Create-then-bind atomicity is NOT a contract** (Architecture R1 #2): Phase 2's evaluate code MUST independently re-validate `dbColumnName` presence on every `SchemaField`. It MUST NOT assume bindings created via `bindGroupToTableWithColumns` are distinguishable from bindings created via Phase 1's `bindGroupToTable` alone. Treat all bindings as provenance-unknown.
- [ ] **ScalarDb controller cap** (Architecture R1 #1, R2-1): the ScalarDb-specific controller pair stops at two — `V2ScalarDbCatalogController` (read) and `V2ScalarDbTableController` (write). Phase 2 endpoints that operate at the template scope (`/api/v2/templates/{id}/projection`, evaluate, etc.) belong on `V2TemplateController` / `V2EvaluateController`, NOT on a third ScalarDb controller.
- [ ] **Persistence migration step** (carried from Phase 1's H2): Phase 2 introduces `/api/v2/templates/{id}/projection` as a sibling to the existing template blob. Phase 2 plan MUST include an explicit migration step: read existing `tableMeta` + `dbColumnName` from the template blob, write to projection, delete from blob.
- [ ] **Shared catalog cache at the store layer** (carried from Phase 1's "Phase 2 readiness"): because Phase 1 stopped storing `scalarType`/`keyType` on `SchemaField`, Phase 2 must cache the catalog at the store layer. Otherwise every field resolution re-walks the nested structure.
- [ ] **Reuse `CorrelationId` + `AuditLog` helpers** introduced in Phase 1.5 (Architecture R2-2). Do NOT inline correlation-ID generation into every controller; do NOT invent a different audit-log line shape.
- [ ] **Reuse `ScalarDbLimits` constants** introduced in Phase 1.5 (Architecture R2-3) for any new endpoint that accepts column lists, key lists, or table dimensions in its request.
- [ ] **Reuse `scalardbIdentifier.ts` validator** for any new endpoint that accepts ScalarDB identifiers (namespace, table, column names) from the client.
- [ ] **Reuse the type-map `SCHEMA_FIELD_TYPE_TO_SCALARDB_COLUMN_TYPE`** in `src/types/scalardb.ts` (Round 2 reversal of inline). Phase 2's evaluate path needs the same default mapping when materializing values from the catalog.
- [ ] **Phase 2 must define the REVERSE projection** `ScalarDbColumnType → SchemaFieldType` for materializing fetched ScalarDB values back into the React render path. **The reverse is NOT derivable** from the forward map: `TEXT` could correspond to `string` OR `image` (URL form), `BIGINT` could correspond to `number` OR `date` (epoch millis form). Phase 2 must inspect the bound `SchemaField.type` to disambiguate. Add this as an explicit Phase 2 plan item — do not assume the round-2 forward map "covers" both directions. (Round 3 Architecture #3.)

## Deferred Decisions

Decisions intentionally NOT made in Phase 1.5 that will need to be revisited later. Listed here so they aren't lost.

- **Status machine: component-local vs server-tracked** (Architecture R2-4). Phase 1.5 keeps the creation form's status machine purely in `useState`. Correct for synchronous DDL; will need re-litigation if Phase 2+ ever introduces long-running async DDL operations (multi-second `createTable` latency, ALTER, etc.).
- **`CorrelationId` request-header echoing** (Round 2 partial). Phase 1.5 generates a correlation ID per backend exception and surfaces it in the response body. Phase 1.5 does NOT yet propagate a client-supplied correlation ID via an `X-Request-Id` header. Cheap to add later if a frontend instrumentation pass arrives.
- **Identifier regex Unicode support** (Phase 1.5 explicitly excludes Japanese chars). ScalarDB on some backends may accept Unicode identifiers; Phase 1.5 conservatively rejects. Re-open if a real user requests it.
- **Schema evolution (ALTER, DROP)** — out of scope for the entire 4-phase plan. If a real user need arises, design as a separate phase or use ScalarDB tooling directly.
- **`*Request` type proliferation outside `reportApi.ts`** — Phase 1.5 establishes `*Request` for HTTP request bodies in `reportApi.ts` only. If later phases find a legitimate need for the suffix elsewhere (store actions, hook params), re-open the convention scope.
- **`scalardbLimits.ts` ↔ `ScalarDbLimits.java` drift mitigation** (Round 3 Architecture #2). Phase 1.5 ships the constants in two languages with no enforced parity check. Plan accepts the drift risk for now — both files carry a top-of-file comment "MUST stay in sync with the sibling file in the other language; no automated check yet." If Phase 2 bumps any constant, the Phase 2 plan must update both. Phase 2 hardening option: add a Gradle task or `prebuild` script that reads both files and asserts parity. Documented as a Phase 1.5 → Phase 2 hardening opportunity, not blocking implementation.
- **`CorrelationId` 8-char entropy** (Round 3 Kieran LOW). 8 hex chars = ~4.3 billion possibilities; birthday collision at ~65k requests. For a single-developer designer tool over the lifetime of the product this is fine. Re-evaluate if the server ever handles > 10k table-creation attempts per day (collision-likely range) or moves to a multi-tenant deployment. Documented in `CorrelationId.java`'s javadoc.
- **Audit log retention policy** (Round 3 Kieran LOW). Phase 1.5 logs `principal.userId()` on every attempt with no rotation/retention policy specified. Acceptable for a designer tool; re-open if the tool is deployed to a multi-tenant environment with GDPR-adjacent obligations.
- **`AuditLog.op` method-naming generalization** (Round 3 Architecture #1). Already addressed in this plan via the generic `op(operation, principal, namespace, tableName, outcome, correlationId)` signature so Phase 2 doesn't add per-operation methods. No further deferred decision needed.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md](../brainstorms/2026-04-10-schema-database-binding-brainstorm.md)
  - Key decisions carried forward: keep Phase 1.5 strictly for DDL + status machine; don't pollute Phase 2; ScalarDB only; reuse the existing `DataBindingModal` tab
- **Phase 1 plan (dependency):** [docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md](./2026-04-10-feat-scalardb-schema-binding-phase1-plan.md)
  - Key decisions inherited: `tableMeta: { namespace, tableName }` shape; `bindGroupToTable` atomic action; inline fetch (no separate hook); `DbConnectionTab` lives in `DataBindingModal`

### Internal References

- `src/components/modals/DbConnectionTab.tsx` — existing Phase 1 component (469 LOC, to be slimmed)
- `src/store/schemaSlice.ts` — `bindGroupToTable` action (reused as-is in Phase 1.5)
- `src/api/reportApi.ts` — Phase 1 `fetchScalarDbCatalog` (pattern to mirror); `ScalarDbCatalogTable` schema reused for the POST response
- `src/types/scalardb.ts` — `ScalarDbColumnType`, `ScalarDbKeyType`, `ScalarDbTableMeta` (reused without changes)
- `server/src/main/java/com/report/server/JsonBlobRepository.java:51-63` — existing `TableMetadata.Builder` pattern to copy for the new DDL code
- `server/src/main/java/com/report/server/V2ScalarDbCatalogController.java` — Phase 1 controller (stays as-is; do NOT merge write operations into it)
- `server/src/main/java/com/report/server/ApiRoutes.java:79-85` — CSRF Origin-check middleware (automatically covers the new POST)
- `server/src/test/java/com/report/server/V2SchemaInferControllerTest.java:15-36` — test pattern to follow for the new controller test

### Related Work

- `docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md` — Phase 1 (completed 2026-04-10). Phase 1.5 builds directly on it.
- Future: Phase 2 plan will introduce `BindingConnection[]`, `/api/v2/templates/{id}/projection`, and the explicit persistence-migration step flagged in the Phase 1 Risks table. Phase 1.5 does NOT touch any of that.

### Deepening research sources (added 2026-04-10)

**ScalarDB 3.14.4 jar inspection:**
- jar path: `~/.gradle/caches/modules-2/files-2.1/com.scalar-labs/scalardb/3.14.4/5232ebb62271ff656ceac0571dfe68d1c2b43ca9/scalardb-3.14.4.jar`
- Verified via `javap -p com.scalar.db.api.DistributedTransactionAdmin`, `javap -p 'com.scalar.db.api.TableMetadata$Builder'`, `javap com.scalar.db.io.DataType`, `unzip -l | grep exception/storage`
- Exception hierarchy: `com.scalar.db.exception.storage.ExecutionException` (checked), with `RetriableExecutionException` as a subclass for transient failures and `NoMutationException` as a subclass for no-op writes (not relevant to DDL)
- Auth/authz classification methods on `ExecutionException`: `isAuthenticationError()`, `isAuthorizationError()`, `isSuperuserRequired()`, `getRequiredPrivilege()`
- Clustering-key ordering enum: `com.scalar.db.api.Scan$Ordering$Order` with `ASC` / `DESC` (deferred to future phase)
- Official docs: <https://scalardb.scalar-labs.com/docs/3.14/api-guide/>

**v1 reference implementation (paths are read-only — DO NOT modify):**
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/internals/ScalarDBGroupSetup.tsx` — main creation form
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/internals/ScalarDBFieldForm.tsx` — per-field editor (keyboard shortcuts pattern at lines 43-45)
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/useBindingState.ts:430-498` — v1 status mutation callbacks (explicitly NOT ported)
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/BindingEditorPage.tsx:112-125` — v1 `handleCreateTable` orchestrator
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/api/schemaApi.ts:56-71` — v1 API call (PUT, not POST — explicitly redesigned)
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/types/schema.ts:17-21` — v1 `ScalarDBTableMeta` with `status` field (rejected by Phase 1.5)
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/lib/bindingValidator.ts:22-33` — v1 field-name regex (JS-reserved-word blocklist not applicable to ScalarDB)
- `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/internals/fieldDefaults.ts:11-72` — v1 system-field auto-injection (NOT ported)

**v2 POST controller convention audit:**
- `server/src/main/java/com/report/server/V2FormResponseController.java:89-142` — canonical POST body parsing + 201 response
- `server/src/main/java/com/report/server/V2SchemaInferController.java:34-50` — canonical JSON parsing + 413 body-size handling (1 MB cap)
- `server/src/main/java/com/report/server/V2TemplateController.java` — POST create endpoint with auth check + timestamp handling
- `server/src/main/java/com/report/server/V2VersionController.java:105` — `ctx.status(HttpStatus.CREATED)` + body response pattern
- `server/src/main/java/com/report/server/ApiRoutes.java:48-57` — global exception handler that converts `HttpResponseException` to JSON
- `server/src/test/java/com/report/server/V2SchemaInferControllerTest.java:15-36` — hand-rolled Mockito `Context` test pattern
- `src/api/reportApi.ts` — `jsonBody()` helper + `createReport` / `submitResponse` as the canonical "typed request + Zod response" pattern
