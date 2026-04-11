---
status: complete
priority: p1
issue_id: "200"
tags: [code-review, typescript, type-safety, data-binding-phase2]
dependencies: []
---

# `dataBinding` 命名衝突 — `ElementBase.dataBinding` は `schemaBinding` にリネームが必要

## Problem Statement

Phase 2 の計画では `ElementBase.dataBinding?: { fieldId: string }` を追加する予定だが、
`TableElement.dataBinding?: string` と `ChartElement.dataBinding?: string` がすでに `src/types/index.ts` (lines 288, 296) に存在する。
同名フィールドを型交差で追加すると TypeScript は `string | { fieldId: string } | undefined` に暗黙的に拡大するが、
既存コードが `el.dataBinding` を `string` として扱う箇所が `[object Object]` を出力するなど、コンパイルエラーなしにランタイム破損が発生する。

## Findings

**Files:**
- `src/types/index.ts:288` — `TableElement.dataBinding?: string`
- `src/types/index.ts:296` — `ChartElement.dataBinding?: string`
- Phase 2 plan: `ElementBase.dataBinding?: ElementDataBinding` (planned, not yet implemented)

```typescript
// 既存（変更しない）
interface TableElement extends ElementBase {
  dataBinding?: string  // raw data key
}

// 計画中（名前衝突）
interface ElementBase {
  dataBinding?: { fieldId: string }  // ← これが TableElement.dataBinding を上書きしてしまう
}
```

**発見者**: TypeScript reviewer, Architecture reviewer, Agent-native reviewer の3エージェントが独立して同じ問題を発見。

## Proposed Solutions

### Option A: 新フィールド名を `schemaBinding` にする（推奨）

```typescript
// src/types/index.ts
interface ElementSchemaBinding {
  fieldId: string
}

interface ElementBase {
  // ...既存フィールド...
  schemaBinding?: ElementSchemaBinding  // Phase 2 新規（名前衝突なし）
}
```

**Pros:** 既存の `dataBinding` に影響なし、意味が明確（schema への binding）
**Cons:** 計画ドキュメント全体の名称を更新する必要がある
**Effort:** Small
**Risk:** Low

### Option B: 既存 `TableElement.dataBinding`/`ChartElement.dataBinding` をリネーム

```typescript
// 既存のフィールドを dataKey にリネーム
interface TableElement extends ElementBase {
  dataKey?: string  // renamed from dataBinding
}
// ElementBase.dataBinding を新設
```

**Pros:** 新フィールド名が計画通り `dataBinding` を使える
**Cons:** 既存要素への破壊的変更。テンプレートの JSON 移行が必要
**Effort:** Medium
**Risk:** High（保存済みテンプレートの後方互換性を破壊）

## Recommended Action

**Option A** を採用。`schemaBinding` というフィールド名を使用する。
計画ドキュメント (`docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md`) の `dataBinding` 参照箇所を `schemaBinding` に更新する。

## Technical Details

**Affected files (all in Phase 2 plan, not yet implemented):**
- `src/types/index.ts` — `ElementBase` への追加フィールド名を `schemaBinding` に
- `src/store/schemaSlice.ts` — `setElementBinding` → `setSchemaBinding` にリネーム
- `src/components/sidebar/DataBindingOverviewPanel.tsx` — UI 上の参照
- `docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md` — 計画文書の更新

## Acceptance Criteria

- [ ] `src/types/index.ts` の新フィールドが `schemaBinding?: { fieldId: string }` という名前
- [ ] `TableElement.dataBinding?: string` および `ChartElement.dataBinding?: string` は変更なし
- [ ] TypeScript の型チェックがパス (`npm run build`)
- [ ] 計画ドキュメントが更新済み

## Work Log

- 2026-04-12: Discovered by multi-agent review (TypeScript + Architecture + Agent-native reviewers independently)
