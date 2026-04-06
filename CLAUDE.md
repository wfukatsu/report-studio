# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

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

## Architecture

**Vite + React + TypeScript** SPA — no backend, all state is in-memory.

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
