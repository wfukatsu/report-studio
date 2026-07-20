# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend
```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Type-check (tsc, TS 5.7) + build to dist/
npm run typecheck:native  # TS 7 native compiler (tsgo) type-check — readiness/fast check only (#252)
npm run lint         # ESLint
npm test             # Run tests (watch mode)
npm test -- --run    # Run tests once
npm run test:coverage  # Coverage report (ratchet thresholds — fails on regression)
npm run storybook    # Storybook component explorer (http://localhost:6006)
```

Run a single test file:
```bash
npx vitest run src/lib/dataBinding.test.ts
```

Environment: copy `.env.example` → `.env` if needed (`VITE_API_PORT=8080` is the only variable).

### Backend (Java/Javalin)
```bash
# Initial setup (only once)
cp server/scalardb.properties.example server/scalardb.properties

# Start backend (http://localhost:8080)
npm run dev:backend

# Start frontend + backend together
npm run dev:full

# Run backend tests
npm run test:backend

# Build backend fat-jar
npm run build:backend
```

### Backend architecture
- **Framework**: Javalin 7 (Java 21)
- **DB**: ScalarDB 3.14 + SQLite (dev) / any JDBC (prod)
- **Config**: `server/scalardb.properties` (gitignored; copy from `.example`)
- **API routes** (authoritative registration: `ApiRoutes.java`): the API was migrated to a `/api/v2` stack; the dead v1 duplicate stack (templates/schemas/versions/responses/export/pdf/thumbnail + designer-projection/export-submission) was **removed** along with its controllers, and the surviving controllers dropped their `V2` class-name prefix (e.g. `TemplateController`, `PdfController`). URL paths keep the `/api/v2` version — the version lives in the URL, not the class name. The split is now **by resource, with no duplicated routes**:
  - **v2**: `templates` and everything under it (`evaluate`, `validate`, `versions`, `responses`(+`/{rid}/status`, `/{rid}/audit`), `export`/`import`, `pdf`, `thumbnail`, `duplicate`/`copy`/`visibility`, `resolve-bindings`), `documents` (cross-template issued-documents list, #190), `schemas`(+`infer`, with `schema-library` redirecting to `schemas`), `excel`, `pdf`/`pdf-jobs`(+`batch`; `GET /pdf-jobs` unified list + `DELETE /pdf-jobs/{id}` cancel span all job types, #191), `scalardb`, `tenant`, `health`
  - **v1 (not yet migrated — no v2 equivalent)**: `auth`(+`/tokens` PAT management, #195), `admin`, `products`, `jobs`, `webhooks`, `sequences`, `public/forms`, `binding-trees`, plus public `health`
  - Note: the `V2` prefix marks the newer controller generation, not a stable public contract; `v1`/`v2` here is unrelated to the binding-editor "legacy vs current" UI or template version numbers shown in the UI.
- **Key engines**: `ExpressionEngine` (JEXL sandbox), `CalculationEngine`, `ConditionEvaluator`, `ValidationEngine`
- **PDF export**: `SectionPdfRenderer`, `FormTablePdfRenderer`, `ImagePdfRenderer`, `BarcodePdfRenderer`, `FontProvider`
- **Batch jobs**: `BatchPdfProcessor` via `JobController` / `JobRepository`. The V2 batch endpoint (`BatchPdfController`) accepts either `responseIds` (stored responses) or inline `rows` (DB-row-driven bulk export, #193) plus an optional `filenameTemplate` (`{documentNo}`/`{status}`/`{seq}`/`{date}`/data fields, #194)
- **Document lifecycle (#163)**: responses carry a `status` (draft/issued/sent/void); `SequenceController.nextAndStamp` assigns a document number at submit **or** on the first draft→issued transition; `StatusAuditRepository` persists every transition (who/when/from→to) in `report_studio.status_audit`
- **Auth**: `FormSessionManager` + `RateLimiter` (cookie sessions) + `ApiTokenController` (PAT/Bearer, table `report_studio.api_tokens`, #195); wiring in `AppWiring.java`, Bearer resolved as a fallback in the `ApiRoutes` auth before-filter

## Architecture

**Vite + React + TypeScript** SPA + **Java/Javalin** backend.

### State management (`src/store/`)

Single Zustand store composed from 13 slices via immer middleware. Import via `useReportStore`. A separate `dataBrowserStore` handles the data browser page independently.

| Slice | Responsibility |
|-------|----------------|
| `layoutSlice` | Pages, sections, elements, selection, zoom, grid snapping |
| `clipboardSlice` | Copy / cut / paste of elements and styles |
| `historySlice` | Undo/redo stack (array of page snapshots) |
| `uiSlice` | Panel visibility, preview mode, live preview, auto-save timestamp |
| `schemaSlice` | Data schema — master/detail groups + fields with ScalarDB column bindings |
| `rulesSlice` | Calculation rules and validation rules |
| `variantsSlice` | Output variants (per-audience PDFs with field masking) |
| `responsesSlice` | Form responses cache |
| `tenantSlice` | Tenant metadata (company name, address, phone, logo) |
| `productSlice` | Product master catalog (SKU, price, tax, custom fields) |
| `authSlice` | User login/session state |
| `adminSlice` | Admin user list and server-config state |
| `computedSlice` | Derived selectors only (no state) |

Key selectors exported from the store:
- `selectActivePage` — returns the currently selected page
- `selectSelectedElements` — returns selected elements on the active page

### Schema binding (3 phases)

Schema groups and fields are defined in `schemaSlice`. Fields bind to displayed values through three progressive phases:
1. **Group → ScalarDB table**: Set `group.tableMeta.tableName`
2. **Field → column**: Set `field.dbColumnName`
3. **Computed field**: JEXL expression in `field.expression` (evaluated server-side via `ExpressionEngine`)

Data binding in elements uses `{{fieldKey}}` tokens in text content and dot-notation keys in `dataField` elements (e.g. `customer.name`). `useDataResolver` hook handles field resolution + format application at render time.

**Schema paths are 2-level only** (`dataKey.fieldKey`, both `^[a-zA-Z_][a-zA-Z0-9_]*$`). A 3-level element `fieldKey` like `quotation.customer.name` renders fine from nested sample JSON but is **not** DB-bindable — `buildFlatDataFromResolved` stores each group's resolved row at `data[dataKey]`, so nested paths never reconstruct. Keep template `dataField` keys flat (`customer.name`, not `quotation.customer.name`).

**Important Zod caveat**: `SchemaFieldSchema` / `SchemaGroupSchema` / `ScalarDbTableMetaSchema` in `src/lib/schemas/reportDefinition.ts` explicitly allow `dbColumnName` / `computed` / `expression` / `tableMeta` / `linkedMasterGroupId` (they are *not* `.passthrough()` — the rest of the file is). If you add a new schema-binding field to the store type, add it here too or it is silently **stripped** on template import (built-in load, API round-trip). Run `npm run generate:schema` after any change to keep `schemas/report-definition.schema.json` in sync (a test enforces this).

#### （廃止）同梱テンプレートとデモシード

同梱ビルトインテンプレート（`src/templates/builtin/*.json`）とデモ用シード（`seed:demo*` / `setup:template-bindings` スクリプト、`demo.*` ScalarDB テーブル）は**すべて削除済み**。`BUILTIN_TEMPLATES` は空配列で、テンプレートはサーバに保存されたもの（公開／個人テンプレート）を利用する。上記の surrogate key／商品マスター Lookup／`demo.*` バインドに関する記述は歴史的経緯であり、現在のコードには存在しない。

### Canvas editing

`ReportCanvas` wraps elements in `@dnd-kit/core`'s `DndContext`. `CanvasElement` is both draggable (via `useDraggable`) and resizable (custom pointer-event logic for 8 resize handles). When `readonly=true` (preview mode), drag and resize are disabled.

### Design vs Preview rendering

One flag drives every design-vs-preview difference: **`readonly`** (`false` = design/editor canvas, `true` = live preview pane / preview modal / PDF-PNG export). It is a **prop threaded down the tree** (`ReportCanvas` → `SectionContainer` → `CanvasElement` → `ElementRenderer`), *not* the `uiSlice.previewMode` store boolean. Both modes resolve against the **same** `data` (`useResolvedData`: `dataOverride ?? livePreviewData ?? sampleData`), so per-field *values* are identical — only presentation differs. `ElementRenderer` gates the differences:

- **Empty-binding suppression** (`readonly` only): `isDataEmptyInPreview` (`src/lib/previewUtils.ts`) returns `null` for bound elements that resolve empty (empty `dataField`/`text`, empty `repeatingBand`/`chart` array). In the editor these show placeholders instead; calc-output keys and `fallbackText` fields are never hidden.
- **Repeating containers** — `repeatingBand`, `repeatingList`, **and `formTable`** all take `records` only when `readonly && element.dataSource`. In the editor `records` is `undefined` → each renderer shows its *design preview* (faded mock rows, `{{fieldKey}}` cells, blue `… · <dataSource>` badge); in preview they render live rows. Keep the three in sync — `formTable` was previously ungated (showed live rows in the editor); do not reintroduce that asymmetry.
- **Auto/tenant fields** — `pageNumber`, `currentDate`, and the `tenant*` text elements get `resolveValues={readonly}`: editor shows a literal token/format placeholder (`{{会社名}}`, `yyyy/MM/dd`), preview shows the resolved value (or a `（…未設定）` fallback). `tenantLogo` reads `tenantInfo` in both modes (no `resolveValues`).
- **Design-mode sample hints** (`sampleHint={!readonly}`, editor only, non-destructive — absent from preview/export): `dataField` and data-driven `text` (content contains a `{{token}}`) get a subtle dotted underline; an unbound `chart` showing hardcoded `SAMPLE_DATA` gets a "サンプル" badge. Shared style: `SAMPLE_VALUE_HINT_STYLE` / `SAMPLE_VALUE_HINT_COLOR` in `_blocks/constants.ts`. Empty placeholders (already grey-italic) and static literal text get no hint.

### Export

`src/lib/exportUtils.ts` renders canvas DOM nodes via `html2canvas` then either saves as PNG or assembles a `jsPDF` PDF from all pages.

### Output variants

`variantsSlice` stores `OutputVariant[]`. Each variant can mask specific fields at export time (fullReplace or partial character masking), enabling per-audience PDFs from a single template.

### Types (`src/types/index.ts`)

`ReportElement` is a discriminated union on `type` (24 active types grouped by category; `label` / `table` are deprecated and auto-migrated to `text` / `formTable`):
- **Text**: `text`
- **Data display**: `dataField`, `chart`, `repeatingBand`, `repeatingList`
- **Table**: `formTable`
- **Shapes/Media**: `shape`, `image`, `barcode`
- **Input/Entry**: `manualEntry`, `checkbox`, `eraSelect`
- **Japanese-specific**: `hanko`, `approvalStampRow`, `revenueStamp`
- **Auto-fields**: `pageNumber`, `currentDate`, `divider`
- **Tenant fields**: `tenantCompanyName`, `tenantAddress`, `tenantPhone`, `tenantRepresentative`, `tenantLogo`, `tenantCustom`

Add a new element type by:
1. Defining the interface extending `ElementBase` in `src/types/index.ts`
2. Adding to the `ReportElement` union
3. Creating `src/elements/{type}/Renderer.tsx` — **compose from `_blocks/` building blocks** (TextContent, ElementFrame, GridLines, useDataResolver 等)
4. Creating `src/elements/{type}/PropertiesPanel.tsx` — **compose from `_blocks/panels/`** (TextStyleSection, BorderSection, DataBindingSection, FormatSection 等)
5. Adding the `type` case in `ElementRenderer.tsx` and `PropertiesPanel.tsx` (sidebar)
6. Creating a factory in `elementFactories.ts`
7. Adding a palette item in `ElementPalette.tsx`

### Composition ブロック (`src/elements/_blocks/`)

共通ビルディングブロックで要素を構成するパターン:

```
_blocks/
├── renderers/        ← Renderer 用ブロック
│   ├── ElementFrame     ボーダー/背景/パディング
│   ├── TextContent      テキスト描画（縦書き、ふりがなCSS方式）
│   ├── GridLines        CSS border ベースのグリッド線
│   ├── ChartContent     Recharts wrapper (bar/line/pie/donut)
│   ├── BarcodeContent   QR/CODE128/CODE39/EAN13
│   └── ElementErrorBoundary  要素単位エラーキャッチ
├── hooks/
│   └── useDataResolver  フィールド解決 + フォーマット適用
├── panels/           ← PropertiesPanel 用ブロック
│   ├── TextStyleSection    フォント/サイズ/太字/色/配置/縦書き
│   ├── BorderSection       ボーダー色/幅/スタイル/角丸
│   ├── DataBindingSection  フィールドキー入力
│   ├── FormatSection       書式設定（小数桁数/カスタムパターン）
│   ├── FuriganaSection     ふりがな設定
│   └── ColorSection        色設定
└── constants.ts       MM_TO_PX, DEFAULT_FONT_SIZE 等
```

### FormTable インタラクティブ編集 (`src/elements/formTable/`)

テーブル要素はキャンバス上で Excel 風の直接操作をサポート:

- **テーブル編集モード**: ダブルクリックで進入、Esc/外クリックで解除
- **セル選択**: クリック/Shift+クリック/矢印キー/Tab で選択・移動
- **インライン編集**: セルダブルクリック/Enter でポップオーバー表示（タイプ・テキスト・スタイル）
- **行列操作**: 右クリックメニューで挿入/削除/移動
- **セル結合**: `FormTableCell.colspan`/`rowspan`/`mergedInto` で CSS Grid span を実現
- **リサイズ**: 列/行境界ドラッグで幅・高さ変更（最小 3mm）
- **コピペ**: Ctrl+C/V/X（内部 + Excel TSV 対応）
- **Undo**: テーブル専用 undo stack（モード離脱時に store-level で 1 エントリに統合）

Renderer は CSS Grid ベース（`grid-template-columns`/`grid-template-rows`）。

共有ロジックは `tableOperations.ts`（PropertiesPanel と Editor で共用）。

### 廃止要素

- `label` → `text` に統合済み（ElementRenderer で自動変換）
- `table` → `formTable` に統合済み（旧データは警告表示）

### Templates (`src/templates/builtinTemplates.ts`)

同梱テンプレートは削除済みで `BUILTIN_TEMPLATES` は空配列。テンプレートはサーバ保存分を利用する。

## Key conventions

- Element mutations always go through the store — never mutate `element` objects directly in components.
- `pushHistory` is called at the end of any store action that structurally changes elements (add, update, remove, duplicate). Move and resize do not push history (too noisy during drag).
- `JSON.parse(JSON.stringify(...))` is used for deep cloning inside immer drafts (immer proxies cannot be `structuredClone`d).

## テンプレート作成規約

### 要素の格納先

- 要素は必ず `page.sections[N].elements` に格納する
- `Page.elements`（トップレベル）は `@deprecated` であり **使用禁止**。レンダラーに無視される
- `PageDef` 型には `elements` フィールドが存在しない

### テンプレートページの正しい構造

```ts
// ✅ 正しい
{
  id: uuidv4(), name: 'ページ 1', background: '#ffffff',
  width: A4_W, height: A4_H,
  sections: [{ id: uuidv4(), sectionType: 'body', height: A4_H, elements: [...] }],
}

// ❌ 誤り（page.elements は無視される）
{
  id: uuidv4(), elements: [...],  // ← ここに書いても画面に表示されない
  sections: [],
}
```
