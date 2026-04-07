---
title: "refactor: Page.elements フィールド廃止と PageDef への統一"
type: refactor
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-page-elements-migration-brainstorm.md
---

# refactor: Page.elements フィールド廃止と PageDef への統一

## Overview

`Page` 型（`src/types/index.ts`）の `elements: ReportElement[]` フィールドを廃止し、
全テンプレートを `sections[].elements` に統一する。

テンプレート作者が `page.elements` と `section.elements` の二重設定というサイレントバグを
踏まないよう、型レベルで防止することが目的。

(see brainstorm: docs/brainstorms/2026-04-08-page-elements-migration-brainstorm.md)

## Problem Statement

`Page` 型は `elements: ReportElement[]`（レガシー）と `sections: Section[]`（現行）を
両方持っているが、レンダラー・ストア操作はすべて `section.elements` のみを参照する。
`page.elements` は完全に無視される。

これにより次の 2 種のサイレントバグが存在する:

1. **fuyouKojoTemplate** (`src/templates/fuyouKojoTemplate.ts:655,664`) —
   `elements` 配列を `page.elements` と `sections[0].elements` の両方に同一参照で代入。
   正常に動作しているように見えるが、意図しない共有状態。

2. **simple-report テンプレート** (`src/templates/builtinTemplates.ts:48,107`) —
   `page.elements` に要素を定義し、後から可変ミューテーション（`simpleReportPage.sections = ...`）
   で `section.elements` に代入。`page.elements` が `undefined` になると
   `section.elements = undefined` というランタイムバグになる。

## Proposed Solution

### スコープ（今回やること）

1. `Page.elements` を **optional + `@deprecated`** にする（型定義変更）
2. `builtinTemplates.ts` の `simple-report` を宣言的に書き直し、
   後付けミューテーション（lines 100-109）を削除する
3. `fuyouKojoTemplate.ts` の `page.elements` 代入（line 655）を削除する
4. `migration.ts` の `page.elements ?? []` ガードが引き続き動作することを確認
5. migration パスのユニットテストを追加（現状カバレッジが 0）
6. CLAUDE.md に規約を追記する

### スコープ外（次フェーズ）

- `Template.pages: Page[]` → `PageDef[]` への型変更（`applyTemplate` の書き直しが伴う）
- `Page` 型の完全削除（`Template`・`Report` 旧型が依存しているため）
- localStorage の自動マイグレーション（破棄的変更 OK のため不要）

## Technical Approach

### Phase 1: migration テストの追加（安全網 — 先に書く）

`migration.ts` の既存ロジックに対してユニットテストを追加し、
型変更・テンプレート修正前に回帰安全網を確立する（TDD RED→GREEN）。

```typescript
// src/lib/migration.test.ts に追加
describe('migrateSections — legacy page.elements フォールバック', () => {
  it('page.sections が空で page.elements に要素がある場合、body section に移動する')
  it('page.sections と page.elements の両方がある場合、sections が優先される')
  it('page.elements が undefined の場合、空の body section が生成される')
})
```

テストが PASS したら次フェーズへ（既存ロジックの確認）。

### Phase 2: 型定義の変更（`src/types/index.ts`）

```typescript
// src/types/index.ts (line ~672)
/** @deprecated Use PageDef instead. elements is not rendered — use sections[].elements. */
export interface Page {
  id: string
  name: string
  /** @deprecated Use sections[0].elements (or appropriate section). This field is ignored by the renderer. */
  elements?: ReportElement[]    // required → optional に変更
  background: string
  width: number
  height: number
  sections: Section[]
}
```

`elements` を `optional` にすることで:
- `migration.ts:49` の `page.elements ?? []` は引き続き動作（`undefined` の場合 `[]` にフォールバック）
- `Template.pages: Page[]` 型は変更不要（`Page` 自体は残る）
- テンプレートから `elements:` フィールドを省略しても TypeScript エラーにならない

### Phase 3: `builtinTemplates.ts` の書き直し

**Before（現状の問題コード）:**

```typescript
// src/templates/builtinTemplates.ts

// pages[0] (blank) — Line 19
pages: [{
  id: uuidv4(),
  elements: [],              // ← page レベルに elements (無意味)
  ...
  sections: [{ id: uuidv4(), sectionType: 'body', height: A4_HEIGHT, elements: [] }],
}]

// pages[1] (simple-report) — Lines 48, 100-109
// ページレベルに elements を定義
elements: [/* 全要素 */],
// 後付けミューテーション（module-level constant を破壊的変更！）
const simpleReportPage = BUILTIN_TEMPLATES[1].pages[0]
simpleReportPage.sections = [{
  id: uuidv4(),
  sectionType: 'body',
  height: A4_HEIGHT,
  elements: simpleReportPage.elements,   // ← elements が undefined になるとバグ
}]
```

**After（修正後）:**

```typescript
// src/templates/builtinTemplates.ts — 全テンプレートで sections に直接定義

// blank template
pages: [{
  id: uuidv4(),
  // elements: [] を削除
  background: '#ffffff',
  width: A4_WIDTH, height: A4_HEIGHT, name: 'ページ 1',
  sections: [{ id: uuidv4(), sectionType: 'body', height: A4_HEIGHT, elements: [] }],
}]

// simple-report template — elements を sections 内に直接定義
const simpleReportElements: ReportElement[] = [/* 全要素 */]
const SIMPLE_REPORT_TEMPLATE: Template = {
  ...
  pages: [{
    id: uuidv4(),
    // elements: フィールドを完全に省略
    background: '#ffffff',
    width: A4_WIDTH, height: A4_HEIGHT, name: 'ページ 1',
    sections: [{ id: uuidv4(), sectionType: 'body', height: A4_HEIGHT, elements: simpleReportElements }],
  }],
}
// lines 100-109 のミューテーションブロックを削除
```

### Phase 4: `fuyouKojoTemplate.ts` の修正

```typescript
// src/templates/fuyouKojoTemplate.ts

// Before (line 655 と 664)
pages: [{
  id: uuidv4(),
  elements,          // ← 削除する（page レベルの代入）
  ...
  sections: [{ ..., elements }],   // ← こちらだけ残す
}]

// After
pages: [{
  id: uuidv4(),
  // elements: フィールドを省略
  ...
  sections: [{ ..., elements }],
}]
```

### Phase 5: CLAUDE.md 規約の追記

```markdown
## テンプレート作成規約

### 要素の格納先
- 要素は必ず `page.sections[N].elements` に格納する
- `Page.elements`（トップレベル）は `@deprecated` であり使用禁止
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
  id: uuidv4(), elements: [...],   ← ここに書いても画面に表示されない
  sections: [],
}
\```
```

## System-Wide Impact

- **Interaction Graph**: `Page.elements` を読むコードは `migration.ts:49` のみ。
  Optional 化後も `?? []` フォールバックで動作継続。レンダラー・ストアは影響なし。
- **State Lifecycle Risks**: `builtinTemplates.ts` のミューテーションブロック削除により、
  module-level constant の破壊的変更が解消される。
- **API Surface Parity**: `Template.pages: Page[]` は今回変更しない（次フェーズ）。
  `applyTemplate` / `migrateReport` パスへの影響なし。
- **Integration Test Scenarios**:
  1. ブランクテンプレートを読み込んでキャンバスに要素が表示されること
  2. simple-report テンプレートを読み込んで全要素がセクション内に存在すること
  3. fuyouKojoTemplate を読み込んで要素が二重表示されないこと
  4. 旧 `Report` 形式（`page.elements` 有り）の JSON ファイルを import して
     要素が body section に正しく格納されること

## Acceptance Criteria

- [x] `Page.elements` が `optional` かつ `@deprecated` JSDoc 付きになっている
- [x] `builtinTemplates.ts` に `elements:` のページレベル代入が存在しない
- [x] `builtinTemplates.ts` のミューテーションブロック（旧 lines 100-109）が削除されている
- [x] `fuyouKojoTemplate.ts` の `page.elements` 代入（旧 line 655）が削除されている
- [x] `migration.ts` の `page.elements ?? []` が引き続き動作する（テストで確認）
- [x] migration の 3 ケースのユニットテストが追加され全件グリーン
- [x] `npm test -- --run` で全テスト通過
- [x] `npx tsc -p tsconfig.app.json --noEmit` で新規エラーなし
- [x] CLAUDE.md にテンプレート規約が追記されている

## Dependencies & Risks

| リスク | 確率 | 影響 | 対策 |
|-------|------|------|------|
| `migration.ts` が `elements` optional 化で壊れる | 低 | 中 | `?? []` ガードが既存; テストで確認 |
| `builtinTemplates.ts` 書き直し後に simple-report の要素が消える | 中 | 高 | migration テスト + 手動確認 |
| TypeScript が `Page.elements` optional で既存テストを通さない | 低 | 低 | `?? []` or `!` assertion で対処 |

## Sources & References

### Origin
- **Brainstorm document:** [docs/brainstorms/2026-04-08-page-elements-migration-brainstorm.md](docs/brainstorms/2026-04-08-page-elements-migration-brainstorm.md)
  Key decisions: Page.elements を optional 化、テンプレートを sections 形式に移行、破棄的変更 OK

### Internal References
- `Page` / `PageDef` 型定義: `src/types/index.ts:571-580, 669-677`
- migration ロジック: `src/lib/migration.ts:49`
- builtinTemplates ミューテーションブロック: `src/templates/builtinTemplates.ts:100-109`
- fuyouKojoTemplate 二重代入: `src/templates/fuyouKojoTemplate.ts:655,664`
- flattenPageElements (変更不要): `src/store/selectors.ts:16-21`
