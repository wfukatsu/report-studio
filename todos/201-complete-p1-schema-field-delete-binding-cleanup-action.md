---
status: complete
priority: p1
issue_id: "201"
tags: [code-review, typescript, store, data-binding-phase2, referential-integrity]
dependencies: ["200"]
---

# `removeSchemaField` が要素の `schemaBinding.fieldId` をクリアする cleanup アクションが必要

## Problem Statement

`schemaSlice.removeSchemaField` は現在 `definition.schema.groups[].fields` を更新するだけで、
`definition.pages[*].sections[*].elements[*].schemaBinding.fieldId` を参照する要素をクリアしない。
Phase 2 実装後にフィールドを削除すると、要素が削除済みの `fieldId` を指し続ける参照崩壊が起きる。

同様に `removeSchemaGroup` もグループ内の全フィールドに対して同じ cleanup が必要。

## Findings

**File:** `src/store/schemaSlice.ts:61-65` (既存の `removeSchemaField` 実装)

```typescript
// 現状: schema からのみ削除、要素への cascade なし
removeSchemaField: (groupId, fieldId) =>
  set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    group.fields = group.fields.filter((f) => f.id !== fieldId)
  }),
```

**既存の正しいパターン**: `variantsSlice.ts` の `cleanupVariantRefsForElement(elementId)` が同様の cross-entity cleanup を行っており、`layoutSlice.removeElement` から呼ばれる。

**計画の問題点**: Phase 2 の計画では cleanup を `removeSchemaField` 内のインラインループで行うことを提案しているが、`targetFieldId` 変数が未定義のままコードが書かれており、変数名も `fieldId` と衝突する可能性がある。

## Proposed Solutions

### Option A: 専用 cleanup アクションを `schemaSlice` に追加（推奨）

```typescript
// src/store/schemaSlice.ts への追加
cleanupSchemaBindingForField: (fieldId: string) =>
  set((s) => {
    // immer に入る前に Set 構築（O(n^2) 防止）
    const targetFieldId = fieldId  // closure capture

    for (const page of s.definition.pages) {
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (el.schemaBinding?.fieldId === targetFieldId) {
            el.schemaBinding = undefined
          }
        }
      }
    }
  }),

// removeSchemaField を拡張
removeSchemaField: (groupId, fieldId) =>
  set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    group.fields = group.fields.filter((f) => f.id !== fieldId)
    // 要素の schemaBinding をクリア（同一 set() 内で原子的に実行）
    for (const page of s.definition.pages) {
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (el.schemaBinding?.fieldId === fieldId) {
            el.schemaBinding = undefined
          }
        }
      }
    }
  }),
```

**Pros:** 原子的（同一 `set()` 内）、`variantsSlice` パターンに準拠
**Cons:** `removeSchemaGroup` でも同じ処理が必要（全フィールドIDを先に収集して1パスで処理）
**Effort:** Small
**Risk:** Low

### Option B: 別の Zustand アクション + 呼び出し側で組み合わせ

```typescript
// removeSchemaField の後に別途呼び出す
removeSchemaField(groupId, fieldId)
cleanupSchemaBindingForField(fieldId)
```

**Pros:** 関心の分離が明確
**Cons:** 2つのアクション呼び出し = 2つの Zustand 通知（スプリアス再レンダリング）
**Effort:** Small
**Risk:** Medium（呼び出し漏れリスク）

## Recommended Action

**Option A**: `removeSchemaField` と `removeSchemaGroup` の中で同一 `set()` 内に cleanup を含める。
`removeSchemaGroup` では先にグループの全 fieldId を `Set<string>` で収集してから要素を1パスでスキャン。

## Technical Details

**Affected files:**
- `src/store/schemaSlice.ts:61-65` — `removeSchemaField` を拡張
- `src/store/schemaSlice.ts:44-45` — `removeSchemaGroup` を拡張

**`removeSchemaGroup` のパターン:**
```typescript
removeSchemaGroup: (groupId) =>
  set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    // 先に fieldId Set を収集（immer 外で安全）
    const removedFieldIds = new Set(group.fields.map((f) => f.id))
    s.definition.schema!.groups = s.definition.schema!.groups.filter((g) => g.id !== groupId)
    // 要素の schemaBinding をクリア（1パス）
    for (const page of s.definition.pages) {
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (el.schemaBinding && removedFieldIds.has(el.schemaBinding.fieldId)) {
            el.schemaBinding = undefined
          }
        }
      }
    }
  }),
```

## Acceptance Criteria

- [ ] `removeSchemaField` を呼んだ後、そのフィールドを参照する要素の `schemaBinding` が `undefined` になる
- [ ] `removeSchemaGroup` を呼んだ後、グループ内の全フィールドを参照する要素の `schemaBinding` が `undefined` になる
- [ ] 同一の `set()` 内で原子的に実行（複数の Zustand 通知なし）
- [ ] ストアテストが追加されている（テスト先行）

## Work Log

- 2026-04-12: Discovered by TypeScript reviewer and Learnings researcher (cross-entity cleanup pattern)
