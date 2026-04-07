# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend
```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Type-check + build to dist/
npm run lint         # ESLint
npm test             # Run tests (watch mode)
npm test -- --run    # Run tests once
npm run test:coverage  # Coverage report (80% threshold)
```

Run a single test file:
```bash
npx vitest run src/lib/dataBinding.test.ts
```

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
- **Framework**: Javalin 6 (Java 21)
- **DB**: ScalarDB 3.14 + SQLite (dev) / any JDBC (prod)
- **Config**: `server/scalardb.properties` (gitignored; copy from `.example`)
- **API routes**: `/api/v2/*` (templates, evaluate, validate, versions), `/api/v1/auth/*`
- **Key engines**: `ExpressionEngine` (JEXL sandbox), `CalculationEngine`, `ValidationEngine`

## Architecture

**Vite + React + TypeScript** SPA + **Java/Javalin** backend.

### State management (`src/store/reportStore.ts`)

Single Zustand store holds the entire `Report` (pages, elements, settings, data source) plus selection state and undo/redo history. Mutations use **immer** `produce` for immutable updates. History is an array of page snapshots; `pushHistory` is called inside mutating actions after the change is applied.

Key selectors exported from the store:
- `selectActivePage` — returns the currently selected page
- `selectSelectedElements` — returns selected elements on the active page

### Data flow

```
DataSourcePanel → store.setDataSource(dataSource)
                         ↓
ReportCanvas → passes data={dataSource.fields} to each CanvasElement
                         ↓
ElementRenderer → interpolate() / resolveField() for text/dataField elements
```

Data binding uses `{{fieldKey}}` tokens in text content and dot-notation field keys in `dataField` elements (e.g. `customer.name`).

### Canvas editing

`ReportCanvas` wraps elements in `@dnd-kit/core`'s `DndContext`. `CanvasElement` is both draggable (via `useDraggable`) and resizable (custom pointer-event logic for 8 resize handles). When `readonly=true` (preview mode), drag and resize are disabled.

### Export

`src/lib/exportUtils.ts` renders canvas DOM nodes via `html2canvas` then either saves as PNG or assembles a `jsPDF` PDF from all pages.

### Types (`src/types/index.ts`)

`ReportElement` is a discriminated union on `type`. Add a new element type by:
1. Defining the interface extending `ElementBase`
2. Adding to the `ReportElement` union
3. Handling the new `type` in `ElementRenderer.tsx`
4. Adding a palette item in `ElementPalette.tsx`

### Templates (`src/templates/builtinTemplates.ts`)

Static array of `Template` objects. `TemplateGallery` loads them into the store via `loadReport`.

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
