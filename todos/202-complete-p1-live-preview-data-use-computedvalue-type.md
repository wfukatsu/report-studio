---
status: complete
priority: p1
issue_id: "202"
tags: [code-review, typescript, type-safety, data-binding-phase2, zustand]
dependencies: []
---

# `livePreviewData` の型を `Record<string, unknown>` から `ComputedValue` ベースに変更 + Zod `satisfies` ガード必須

## Problem Statement

計画では `livePreviewData: Record<string, unknown> | null` を `uiSlice` に追加する。
しかし `src/store/types.ts` には既に `ComputedValue = number | string | boolean | null` が定義されており、
`ResolveBindingsResponse` の resolved 値の型 (`z.union([string, number, boolean, null])`) と同一。
`unknown` を使うと既存の型契約を破り、`satisfies z.ZodType<T>` パターンも適用できなくなる。

また Zod スキーマの `errors` フィールドで `.nullable()` を使っているが、
既存の `EvaluateResponseSchema` では `z.record(z.string(), z.string())` を使用しており、不一致。

## Findings

**File:** `src/lib/schemas/evaluateResponse.ts` — 既存の `satisfies z.ZodType<EvaluateResponse>` パターン

```typescript
// 既存の正しいパターン
export const EvaluateResponseSchema = z.object({
  results: z.record(z.string(), z.union([...])),
  errors: z.record(z.string(), z.string()),  // ← nullable() なし
}) satisfies z.ZodType<EvaluateResponse>
```

**計画の問題点 (新規 Zod スキーマ):**
```typescript
// 計画中（問題あり）
const ResolveBindingsResponseSchema = z.object({
  resolved: z.record(z.string(), z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  )),
  errors: z.record(z.string(), z.string().nullable()),  // ← .nullable() は不要
})
// satisfies z.ZodType<ResolveBindingsResponse> が抜けている！
```

**影響:** `unknown` 型では `useDataResolver` に渡す際に型アサーションが必要になり、型安全性が失われる。

## Proposed Solutions

### Option A: `ComputedValue` を再利用 + `satisfies` 追加（推奨）

```typescript
// src/store/types.ts への追加
type LivePreviewGroupData = Record<string, ComputedValue>
type LivePreviewData = Record<string, LivePreviewGroupData>

// StoreState / UISlice への追加
livePreviewData: LivePreviewData | null

// src/lib/schemas/resolveBindingsResponse.ts (reportApi.ts にインライン化を推奨)
export interface ResolveBindingsResponse {
  resolved: Record<string, Record<string, ComputedValue>>
  errors: Record<string, string>  // null は使わない（key absent = no error）
}

export const ResolveBindingsResponseSchema = z.object({
  resolved: z.record(z.string(), z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  )),
  errors: z.record(z.string(), z.string()),  // .nullable() 削除
}) satisfies z.ZodType<ResolveBindingsResponse>
```

**Pros:** 既存の `ComputedValue` と整合、`satisfies` ガードで型ドリフト防止
**Cons:** なし
**Effort:** Small
**Risk:** Low

### Option B: `unknown` のまま + 型アサーション

**Pros:** 実装が手っ取り早い
**Cons:** 型安全性ゼロ、将来のリグレッション源
**Effort:** Small（短期）
**Risk:** High（長期）

## Recommended Action

**Option A** を採用。`reportApi.ts` にインライン定義する（別ファイルは YAGNI）。

## Technical Details

**Affected files (planned, not yet implemented):**
- `src/store/types.ts` — `livePreviewData` の型を `LivePreviewData | null` に
- `src/api/reportApi.ts` — `ResolveBindingsResponseSchema` をインラインで定義 + `satisfies` ガード付き
- `docs/plans/2026-04-12-feat-data-binding-phase2-element-binding-plan.md` — 型記述を更新

## Acceptance Criteria

- [ ] `livePreviewData` の型が `Record<string, Record<string, ComputedValue>> | null`
- [ ] `ResolveBindingsResponseSchema` が `satisfies z.ZodType<ResolveBindingsResponse>` を持つ
- [ ] `errors` フィールドが `z.record(z.string(), z.string())` (nullable なし)
- [ ] TypeScript の型チェックがパス

## Work Log

- 2026-04-12: Discovered by TypeScript reviewer
