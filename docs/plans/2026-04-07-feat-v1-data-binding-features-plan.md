---
title: "feat: V1データバインディング機能をV2に取り込む"
type: feat
status: completed
date: 2026-04-07
origin: docs/brainstorms/2026-04-07-v1-data-binding-reference-design-brainstorm.md
deepened: 2026-04-07
---

# feat: V1データバインディング機能をV2に取り込む

## Enhancement Summary

**Deepened on:** 2026-04-07  
**Agents used:** kieran-typescript-reviewer, architecture-strategist, performance-oracle, security-sentinel, julik-frontend-races-reviewer, code-simplicity-reviewer, best-practices-researcher, Zustand best practices, store-type-safety learnings, rerender learnings, XSS/prototype-pollution learnings, sidebar UI learnings

### 実装前に必ず対処すること（Breaking Fixes）

1. **`DisplayCondition` を discriminated union に変更** — `value` フィールドを nullary/valued で分離
2. **`MaskingRule` は既にプランが `z.discriminatedUnion` — TypeScript 型側も一致させる**
3. **`OutputVariant` 名前衝突** — 既存 `type OutputVariant = Record<string, unknown>` を削除してから interface を宣言
4. **`hiddenElementIds` vs `MaskingRule { type: 'hidden' }` の二重管理を廃止** — `hiddenElementIds` のみに統一（`type:'hidden'` の MaskingRule は使わない）
5. **プロトタイプ汚染ガード** — `conditionEvaluator.ts` の全ブラケットアクセスに `FORBIDDEN_KEYS` チェック必須
6. **`SchemaField.key` バリデーション** — Zod 正規表現ホワイトリスト（ドット禁止: `^[a-zA-Z_][a-zA-Z0-9_]*$`）。ドットは `resolveFieldValue` のパス分割と衝突する
7. **`applyVariant` シグネチャ** — 引数は `ReportElement[]` ではなく `PageDef[]` にする（ページ全体を処理するため）
8. **ダブルエクスポートレース** — `isExporting = true` フラグを最初の `await` より**前**に立てる
9. **Undo タイマー漏れ** — `historySlice` の `_historyTimer` を `undo`/`redo` 時にもクリアする
10. **`useSchemaFieldOptions` の detail キー** — `g.id` ではなく `g.dataKey`（SchemaGroup に新フィールド追加）を使う。`g.id` はデータオブジェクトのキーと一致しない
11. **`ConditionRow` の operator 変更ハンドラ** — ternary ではなく `if/else` でブロック分割し TypeScript が `op` を各 union arm に narrowing できるようにする
12. **`DisplayConditionSchema`** — `z.discriminatedUnion` ではなく `z.union` を使い、`DisplayCondition` 型を `z.infer` から派生させる（Zod の discriminatedUnion は enum arm を1リテラルとして要求するため）
13. **`cleanupVariantRefsForElement` は `set` ブロックの外で呼ぶ** — `layoutSlice.removeElement` の `set(() => {...})` の後に `get().cleanupVariantRefsForElement(id)` を配置すること（内部ではない）
14. **`updateMaskingRule` を `replaceMaskingRule` に変更** — `Partial<MaskingRule>` は union 型に対して安全でない。フル置換に統一する

### 主要追加事項

- `createDefaultDefinition()` に `schema: undefined` を明示追加
- `migration.ts` に `visibilityRule → conditionalDisplay` エントリ追加
- `FieldKeyInput` の `<datalist>` ID に `useId()` を使用（複数インスタンス衝突防止）
- `ConditionalDisplayEditor` に ARIA `role="radiogroup"` + `fieldset` パターン適用
- `VariantsModal` の variants 配列に `useShallow` 適用
- `layoutSlice.removeElement` で `hiddenElementIds` のクリーンアップ追加

---

## Overview

V1（report-design-studio）のデータバインディング機能を参考に、V2（report-design-studio-v2）に4つの機能を追加する。V1の直接移植ではなく、V2のアーキテクチャ（Vite+React SPA / Zustand+Immer / バックエンドなし）に合わせた再設計で実装する。

**追加する機能（優先順）:**
1. **Phase 1**: 条件表示 AND/ORエディタ（`visibilityRule` → `conditionalDisplay` 置き換え）
2. **Phase 2**: スキーマエディタ（フィールド定義・グループ管理、左サイドバー新タブ）
3. **Phase 3**: バインディングエディタUI（プロパティパネル内フィールドドロップダウン + オートコンプリート）
4. **Phase 4**: 出力バリアント（ツールバーボタン → モーダル、PDF エクスポート時選択）

(see brainstorm: docs/brainstorms/2026-04-07-v1-data-binding-reference-design-brainstorm.md)

---

## Problem Statement

現在のV2は:
- `visibilityRule?: string` — JEXL自由記述で要素の表示条件を指定するが、**クライアント側でまったく評価されていない**（`ElementRenderer` は `element.visible` のみチェック）
- データフィールドのキー入力が自由記述で、補完なし
- スキーマ（フィールド型・グループ構造）の定義機能がない
- 出力バリアント（対象者別PDF）の機能がない

---

## Technical Findings (Research)

### 重要な発見

1. **`visibilityRule` はクライアント未評価** — `src/components/canvas/ElementRenderer.tsx:46` は `element.visible` のみチェック。`visibilityRule` 文字列はストアに保存されるが実行時に読まれない。Phase 1 では `conditionalDisplay` の評価ロジックを `ElementRenderer` に追加する必要がある。

2. **`outputVariants` が既に存在** — `src/types/index.ts:473` に `OutputVariant = Record<string, unknown>` として定義済み。`ReportDefinition.outputVariants` は初期化されている (`[]`)。Phase 4 で型付けして実装する。**注意: 既存の型エイリアスと新 interface が名前衝突するため、エイリアスを先に削除する必要がある。**

3. **スライスパターン** — `src/store/rulesSlice.ts` が最もクリーンな参考実装。`StateCreator<StoreState, [['zustand/immer', never]], [], SliceType>` 形式を踏襲する。

4. **フィールドオートコンプリートの先例** — `src/elements/dataField/PropertiesPanel.tsx:5-13` に `flattenKeys()` + `<datalist>` パターンが既に存在。Phase 3 はこれを再利用。

5. **タブ登録パターン** — `src/App.tsx:19-26` の `LEFT_TABS` 配列と `App.tsx:310-314` のレンダリング分岐。スキーマタブの追加は2箇所の編集のみ。

6. **PDF エクスポートダイアログ未存在** — `src/components/toolbar/Toolbar.tsx:144-161` の `handleExportPdf` は直接ダウンロードを起動する。Phase 4 でダイアログを挟む。

7. **履歴スコープ** — Undo/Redo は `definition.pages` のみ（`src/store/historySlice.ts:33`）。スキーマ・バリアントは Undoなし（既存設計と同じ）。

### V1参考実装

- **条件評価ロジック**: `app/src/lib/conditionEvaluator.ts` — AND/OR、10演算子、`group[].field` 記法で detail 行へのアクセス
- **コンポーネント構成**: `ConditionGroupEditor` → `ConditionEditor` の2層構造。nullary 演算子（empty/not_empty）は値入力欄なし
- **バリアント型**: `FlatOutputVariant { visibilityOverrides: Record<elementId, boolean>, maskingRules[] }` — V2用に簡略化

---

## Implementation Plan

### Phase 1: 条件表示 AND/ORエディタ

**目標**: `visibilityRule: string` を削除し、構造化 `conditionalDisplay` エディタを実装。レンダリング時にクライアント側で評価する。

#### 1-1. 型定義の変更 (`src/types/index.ts`)

> **Research insight (kieran-typescript-reviewer):** `DisplayCondition.value` を `value?: string | number` のまま残すと、`empty`/`not_empty` 演算子のときに `value` が存在することが型レベルで禁止されない。discriminated union で分離すること。

```typescript
// 追加
export type NullaryOperator = 'empty' | 'not_empty'
export type ValuedOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'less_than'
  | 'contains' | 'not_contains'
export type ConditionOperator = NullaryOperator | ValuedOperator

interface DisplayConditionBase {
  id: string
  fieldPath: string
}

export interface NullaryDisplayCondition extends DisplayConditionBase {
  operator: NullaryOperator
}

export interface ValuedDisplayCondition extends DisplayConditionBase {
  operator: ValuedOperator
  value: string | number
}

export type DisplayCondition = NullaryDisplayCondition | ValuedDisplayCondition

export interface ConditionalDisplay {
  logic: 'and' | 'or'
  conditions: DisplayCondition[]
}

// ElementBase の変更
// Before: visibilityRule?: string
// After:  conditionalDisplay?: ConditionalDisplay
```

**影響ファイル:**
- `src/types/index.ts` — ElementBase.visibilityRule → conditionalDisplay
- `src/lib/schemas/reportDefinition.ts` — Zod スキーマの更新（ElementBaseSchema の `visibilityRule` 削除 + `conditionalDisplay` 追加）

#### 1-2. 評価ロジック (`src/lib/conditionEvaluator.ts` — 新規作成)

> **Research insight (security-sentinel — CRITICAL):** `resolveFieldValue` でブラケット記法 `data[key]` を使う際、`key` が `__proto__`・`constructor`・`prototype` だとプロトタイプ汚染になる。必ず `FORBIDDEN_KEYS` でガードすること。

> **Research insight (architecture-strategist):** `rowIndex` の由来（detail コンテナの何行目か）は呼び出し元コンテキストによって決まる。`ElementRenderer` が `rowIndex` を持つようにするか、評価関数のシグネチャで `context: { rowIndex?: number }` に分離するとテスタビリティが上がる。

```typescript
// src/lib/conditionEvaluator.ts

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function resolveFieldValue(
  data: Record<string, unknown>,
  fieldPath: string,
  rowIndex?: number,
): unknown {
  // "group[].field" 記法 — detail 行アクセス
  const detailMatch = fieldPath.match(/^(.+)\[\]\.(.+)$/)
  if (detailMatch) {
    const [, groupKey, fieldKey] = detailMatch
    if (FORBIDDEN_KEYS.has(groupKey) || FORBIDDEN_KEYS.has(fieldKey)) return undefined
    const group = data[groupKey]
    if (!Array.isArray(group) || rowIndex === undefined) return undefined
    const row = group[rowIndex]
    if (typeof row !== 'object' || row === null) return undefined
    return FORBIDDEN_KEYS.has(fieldKey) ? undefined : (row as Record<string, unknown>)[fieldKey]
  }
  // フラットアクセス
  const parts = fieldPath.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return undefined
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function evaluateConditionalDisplay(
  cd: ConditionalDisplay,
  data: Record<string, unknown>,
  rowIndex?: number,
): boolean {
  if (cd.conditions.length === 0) return true
  const results = cd.conditions.map((c) => evaluateSingleCondition(c, data, rowIndex))
  return cd.logic === 'and' ? results.every(Boolean) : results.some(Boolean)
}

function evaluateSingleCondition(
  condition: DisplayCondition,
  data: Record<string, unknown>,
  rowIndex?: number,
): boolean {
  const raw = resolveFieldValue(data, condition.fieldPath, rowIndex)

  // Nullary 演算子（型ガードで value なし確定）
  if (condition.operator === 'empty') return raw == null || raw === ''
  if (condition.operator === 'not_empty') return raw != null && raw !== ''

  // Valued 演算子（型ガードで value あり確定）
  const { value } = condition
  const str = String(raw ?? '')
  switch (condition.operator) {
    case 'equals': return String(value) === str
    case 'not_equals': return String(value) !== str
    case 'contains': return str.includes(String(value))
    case 'not_contains': return !str.includes(String(value))
    case 'greater_than': return Number(raw) > Number(value)
    case 'less_than': return Number(raw) < Number(value)
    default: {
      // exhaustive check
      const _: never = condition
      return false
    }
  }
}
```

#### 1-3. ElementRenderer への統合 (`src/components/canvas/ElementRenderer.tsx`)

> **Research insight (performance-oracle):** `evaluateConditionalDisplay` は同期的な純粋関数なので `useMemo` でメモ化してよい。`data` と `element.conditionalDisplay` が変わらない限り再評価しない。

> **Research insight (architecture-strategist):** `computedValues` の subscription を `ElementRenderer` 内ではなく上位コンテナ（`ReportCanvas`）で行い、`data` prop として渡す設計にすると、各要素インスタンスが個別にストアを subscribe するコストを削減できる。

```typescript
// ElementRenderer.tsx 内

const isVisible = useMemo(() => {
  if (!element.conditionalDisplay) return true
  if (element.conditionalDisplay.conditions.length === 0) return true
  return evaluateConditionalDisplay(element.conditionalDisplay, data, rowIndex)
}, [element.conditionalDisplay, data, rowIndex])

if (!element.visible || !isVisible) return null
```

#### 1-4. UIコンポーネント

> **Research insight (best-practices-researcher + sidebar UI learning):** 条件エディタは ARIA `role="radiogroup"` で AND/OR トグルを、条件リストは `<fieldset>` + `<legend>` でグループ化する。nullary 演算子（empty/not_empty）が選択されたとき値入力欄を DOM から除去（`display:none` ではなく条件レンダリング）。

> **Research insight (rerender learning):** `ConditionalDisplayEditor` と `ConditionRow` は `React.memo` でラップ。`conditions` 配列は `useShallow` でサブスクライブする。

**新規ファイル:**
- `src/components/sidebar/ConditionalDisplayEditor.tsx` — メインエディタ (AND/OR ラジオグループ + 条件リスト)
- `src/components/sidebar/ConditionRow.tsx` — 1条件の行 (fieldPath / operator / value / 削除ボタン)

```typescript
// ConditionalDisplayEditor.tsx の骨格
export const ConditionalDisplayEditor = React.memo(function ConditionalDisplayEditor({
  value,
  onChange,
}: {
  value: ConditionalDisplay | undefined
  onChange: (cd: ConditionalDisplay | undefined) => void
}) {
  const cd = value ?? { logic: 'and', conditions: [] }
  const fieldOptions = useSchemaFieldOptions()

  return (
    <fieldset>
      <legend>表示条件</legend>
      {/* AND/OR ラジオグループ */}
      <div role="radiogroup" aria-label="条件結合ロジック">
        <label>
          <input type="radio" value="and" checked={cd.logic === 'and'}
            onChange={() => onChange({ ...cd, logic: 'and' })} />
          AND（すべて）
        </label>
        <label>
          <input type="radio" value="or" checked={cd.logic === 'or'}
            onChange={() => onChange({ ...cd, logic: 'or' })} />
          OR（いずれか）
        </label>
      </div>
      {/* 条件リスト */}
      {cd.conditions.map((c) => (
        <ConditionRow
          key={c.id}
          condition={c}
          fieldOptions={fieldOptions}
          onChange={(updated) => onChange({
            ...cd,
            conditions: cd.conditions.map((x) => x.id === c.id ? updated : x),
          })}
          onRemove={() => onChange({
            ...cd,
            conditions: cd.conditions.filter((x) => x.id !== c.id),
          })}
        />
      ))}
      <button type="button" onClick={() => onChange({
        ...cd,
        conditions: [...cd.conditions, { id: nanoid(), fieldPath: '', operator: 'equals', value: '' }],
      })}>
        + 条件追加
      </button>
    </fieldset>
  )
})
```

```typescript
// ConditionRow.tsx — nullary 演算子で value 入力欄を非表示
export const ConditionRow = React.memo(function ConditionRow({ condition, onChange, onRemove, fieldOptions }) {
  const isNullary = condition.operator === 'empty' || condition.operator === 'not_empty'
  return (
    <div role="group" aria-label="条件行">
      {/* fieldPath: スキーマあり → select、なし → text */}
      {fieldOptions.length > 0
        ? <select value={condition.fieldPath} onChange={(e) => onChange({ ...condition, fieldPath: e.target.value })}>
            {fieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        : <input type="text" value={condition.fieldPath} onChange={(e) => onChange({ ...condition, fieldPath: e.target.value })} />
      }
      {/* operator */}
      <select value={condition.operator} onChange={(e) => {
        const op = e.target.value as ConditionOperator
        const isNewNullary = op === 'empty' || op === 'not_empty'
        onChange(isNewNullary
          ? { id: condition.id, fieldPath: condition.fieldPath, operator: op }
          : { id: condition.id, fieldPath: condition.fieldPath, operator: op, value: '' })
      }}>
        {OPERATOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {/* value — nullary のとき DOM から除去 */}
      {!isNullary && (
        <input
          type="text"
          value={'value' in condition ? String(condition.value) : ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          aria-label="比較値"
        />
      )}
      <button type="button" onClick={onRemove} aria-label="条件を削除">✕</button>
    </div>
  )
})
```

**更新ファイル:**
- `src/components/sidebar/PropertiesPanel.tsx` — `ElementCommonSection` の `visibilityRule` テキスト入力を `ConditionalDisplayEditor` に置き換え

#### 1-5. ストア更新

`updateElement` action は既存のまま使用（`Partial<typeof el>` でパッチ）。`visibilityRule` を使用しているストアコードがあれば削除。

> **Research insight (architecture-strategist):** `createDefaultDefinition()` の戻り値に `schema: undefined` を明示的に追加しておく（型推論が `schema` フィールドを省略しないよう）。

#### 1-6. マイグレーション (`src/lib/migration.ts`)

> **Research insight (architecture-strategist):** `.rds.json` インポート時に `visibilityRule` が残っているデータを変換するエントリを追加する。

```typescript
// migration.ts に追加
{
  version: /* 次のバージョン番号 */,
  migrate(def: ReportDefinition): ReportDefinition {
    const pages = def.pages.map((page) => ({
      ...page,
      elements: page.elements.map((el) => {
        if (!('visibilityRule' in el)) return el
        const { visibilityRule, ...rest } = el as ElementBase & { visibilityRule?: string }
        // visibilityRule はクライアント未評価だったので変換せず削除のみ
        return rest
      }),
    }))
    return { ...def, pages }
  },
}
```

#### 1-7. Zod スキーマ更新 (`src/lib/schemas/reportDefinition.ts`)

```typescript
const NullaryConditionSchema = z.object({
  id: z.string(),
  fieldPath: z.string().max(256),
  operator: z.enum(['empty', 'not_empty']),
})

const ValuedConditionSchema = z.object({
  id: z.string(),
  fieldPath: z.string().max(256),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains']),
  value: z.union([z.string().max(500), z.number()]),
})

// z.union を使う（z.discriminatedUnion は enum arm を1リテラルとして要求するため不適）
// DisplayCondition 型は z.infer から派生させて Zod スキーマと TypeScript 型を同期する
const DisplayConditionSchema = z.union([NullaryConditionSchema, ValuedConditionSchema])
export type DisplayCondition = z.infer<typeof DisplayConditionSchema>
// 注意: TypeScript 側の NullaryDisplayCondition / ValuedDisplayCondition は手動定義せず
// z.infer から得た DisplayCondition 型をそのまま使う

const ConditionalDisplaySchema = z.object({
  logic: z.enum(['and', 'or']),
  conditions: z.array(DisplayConditionSchema).max(20),
})

// ElementBaseSchema の更新:
// visibilityRule: z.string().optional() → 削除
// conditionalDisplay: ConditionalDisplaySchema.optional() → 追加
```

#### 1-8. テスト (`src/lib/conditionEvaluator.test.ts` — 新規作成)

```typescript
describe('evaluateConditionalDisplay', () => {
  it('条件なしは常にtrue')
  it('AND: 全条件trueのとき表示')
  it('AND: 1条件でもfalseのとき非表示')
  it('OR: 1件でもtrueのとき表示')
  it('OR: 全条件falseのとき非表示')
  it('equals / not_equals')
  it('greater_than / less_than — 数値変換')
  it('contains / not_contains')
  it('empty: null, undefined, "" を true')
  it('not_empty: 値があるとき true')
  it('group[].field 記法で detail 行アクセス')
  it('FORBIDDEN_KEYS アクセスは undefined を返す')
  it('ネストしたパス (a.b.c) のアクセス')
})
```

---

### Phase 2: スキーマエディタ

**目標**: master/detail グループ + フィールド定義を管理するスキーマエディタを左サイドバーに追加。

#### 2-1. 型定義の追加 (`src/types/index.ts`)

> **Research insight (security-sentinel — MEDIUM):** `SchemaField.key` は任意文字列を許容すると、`conditionEvaluator` の `fieldPath` やデータバインディング式で XSS/インジェクションのリスクがある。識別子文字のみに制限すること。

> **Research insight (architecture-strategist):** `SchemaField` は Undo 対象外だが、要素の `conditionalDisplay.fieldPath` や `fieldKey` は Schema の `key` を参照する。スキーマ変更時に要素が使用するフィールドが消えた場合の検出は、バリデーション層（インポート時 Zod）ではなく UI 警告で対処するのが現実的（強制削除はしない）。

```typescript
export type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'image'

export interface SchemaField {
  id: string
  key: string       // バインディングキー (例: "customer_name") — 識別子文字のみ
  label: string     // 表示名
  type: SchemaFieldType
  itemType?: SchemaFieldType  // array の場合の要素型
}

export interface SchemaGroup {
  id: string
  label: string
  role: 'master' | 'detail'
  dataKey: string   // データオブジェクト上のキー名 (例: "items")。detail の bindingPath で使用
  fields: SchemaField[]
}

export interface SchemaDefinition {
  groups: SchemaGroup[]
}

// ReportDefinition に追加
// schema?: SchemaDefinition
```

#### 2-2. スライス作成 (`src/store/schemaSlice.ts` — 新規作成)

> **Research insight (store-type-safety learning):** 他スライスから直接インポートするとバンドル上で循環依存になりやすい。`schemaSlice` は `layoutSlice` の actions に依存しないよう設計する。

> **Research insight (Zustand best practices):** Immer スライスの `set` コールバック内でローカル変数への参照は `s.definition.schema` 経由にする（Proxy 外への参照を避ける）。

```typescript
// src/store/schemaSlice.ts

export type SchemaSlice = {
  addSchemaGroup: (role: 'master' | 'detail') => void
  removeSchemaGroup: (groupId: string) => void
  updateSchemaGroup: (groupId: string, patch: Partial<Pick<SchemaGroup, 'label' | 'role'>>) => void
  addSchemaField: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  removeSchemaField: (groupId: string, fieldId: string) => void
  updateSchemaField: (groupId: string, fieldId: string, patch: Partial<Omit<SchemaField, 'id'>>) => void
}

export const createSchemaSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  SchemaSlice
> = (set) => ({
  addSchemaGroup: (role) => set((s) => {
    if (!s.definition.schema) s.definition.schema = { groups: [] }
    s.definition.schema.groups.push({ id: nanoid(), label: '', role, fields: [] })
  }),

  removeSchemaGroup: (groupId) => set((s) => {
    if (!s.definition.schema) return
    s.definition.schema.groups = s.definition.schema.groups.filter((g) => g.id !== groupId)
  }),

  updateSchemaGroup: (groupId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    Object.assign(group, patch)
  }),

  addSchemaField: (groupId, field) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    group.fields.push({ ...field, id: nanoid() })
  }),

  removeSchemaField: (groupId, fieldId) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    group.fields = group.fields.filter((f) => f.id !== fieldId)
  }),

  updateSchemaField: (groupId, fieldId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    const field = group?.fields.find((f) => f.id === fieldId)
    if (!field) return
    Object.assign(field, patch)
  }),
})
```

**`src/store/types.ts` 追加:** SchemaSlice actions を StoreState に追加  
**`src/store/index.ts` 更新:** `createSchemaSlice` をスプレッド追加

#### 2-3. Zod スキーマ更新 (`src/lib/schemas/reportDefinition.ts`)

> **Research insight (security-sentinel — MEDIUM):** `SchemaField.key` は `^[a-zA-Z_][a-zA-Z0-9_.]*$` 正規表現でホワイトリスト制限すること（max 128 も維持）。

```typescript
const SchemaFieldSchema = z.object({
  id: z.string(),
  key: z.string()
    .max(128)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, '識別子文字（英数字・_）のみ使用できます（ドット不可）'),
    // ドットを許可すると resolveFieldValue がネストパスとして解釈してしまうため禁止
  label: z.string().max(200),
  type: z.enum(['string', 'number', 'date', 'boolean', 'array', 'image']),
  itemType: z.enum(['string', 'number', 'date', 'boolean', 'array', 'image']).optional(),
})

const SchemaGroupSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  role: z.enum(['master', 'detail']),
  fields: z.array(SchemaFieldSchema).max(200),
})

const SchemaDefinitionSchema = z.object({
  groups: z.array(SchemaGroupSchema).max(20),
})

// ReportDefinitionSchema に追加:
// schema: SchemaDefinitionSchema.optional()
```

#### 2-4. UIコンポーネント (`src/components/sidebar/SchemaPanel.tsx` — 新規作成)

> **Research insight (rerender learning):** `SchemaPanel` 全体を `React.memo` でラップ。フィールドの inline 編集中は `updateSchemaField` を毎 keystroke 呼ばず、`useState` でローカルステートを持ち、`onBlur` 時にストアへコミットする。

> **Research insight (sidebar UI learning):** モーダル状態（インライン編集の開閉など）は `uiSlice` に置くのが V2 の慣習だが、SchemaPanel のような一過性の編集状態は `useState` でよい（undo 対象外かつ他コンポーネントから読まない）。

```
左パネル「スキーマ」タブ
┌────────────────────────────┐
│ [+ master グループ追加]      │
│ [+ detail グループ追加]      │
│                            │
│ ▼ master（単票）             │
│   customer_name  string    │  [✕]
│   invoice_date   date      │  [✕]
│   [+ フィールド追加]          │
│                            │
│ ▼ detail（明細）             │
│   item_name      string    │  [✕]
│   quantity       number    │  [✕]
│   [+ フィールド追加]          │
└────────────────────────────┘
```

- グループ折り畳み（`useState` でローカル管理）
- フィールド行: key / label / type インライン編集（`onBlur` でストアコミット）
- フィールド削除ボタン（ゴミ箱アイコン）

#### 2-5. タブ登録 (`src/App.tsx`)

```typescript
// 追加
type LeftTab = 'elements' | 'pages' | 'layers' | 'schema'
const LEFT_TABS: { id: LeftTab; label: string }[] = [
  ...,
  { id: 'schema', label: 'スキーマ' },
]

// レンダリング追加
{leftTab === 'schema' && <SchemaPanel />}
```

#### 2-6. カスタムフック (`src/hooks/useSchemaFieldOptions.ts` — 新規作成)

> **Research insight (performance-oracle):** `useReportStore((s) => s.definition.schema)` は plain selector（オブジェクト参照）でよい（`useShallow` 不要 — schema オブジェクト自体が immer で新しい参照を生成するため）。`useMemo` 内で groups を flatMap するのは正しい。

```typescript
export interface FieldOption {
  value: string    // バインディングキー
  label: string    // "顧客名 (master)"
  type: SchemaFieldType
  groupRole: 'master' | 'detail'
}

export function useSchemaFieldOptions(): FieldOption[] {
  const schema = useReportStore((s) => s.definition.schema)
  return useMemo(() => {
    if (!schema) return []
    return schema.groups.flatMap((g) =>
      g.fields.map((f) => ({
        value: g.role === 'detail' ? `${g.dataKey}[].${f.key}` : f.key,
        label: `${f.label || f.key} (${g.label || g.role})`,
        type: f.type,
        groupRole: g.role,
      }))
    )
  }, [schema])
}
```

#### 2-7. テスト

- `src/store/schemaSlice.test.ts` — CRUD アクションのテスト（追加/更新/削除の各パス）
- `src/hooks/useSchemaFieldOptions.test.ts` — master/detail のキー生成ロジック、schema=undefined のフォールバック
- `src/components/sidebar/SchemaPanel.test.tsx` — フィールド追加/削除UI、onBlur コミット

---

### Phase 3: バインディングエディタUI

**目標**: スキーマ定義があるときプロパティパネルのフィールド入力欄に候補補完を提供。

#### 3-1. 共通コンポーネント (`src/components/common/FieldKeyInput.tsx` — 新規作成)

> **Research insight (architecture-strategist):** 複数の `FieldKeyInput` インスタンスが同一ページに表示されるとき `<datalist id>` が衝突する。`useId()` (React 18+) で一意IDを生成すること。

> **Research insight (security-sentinel — MEDIUM LOW):** `<datalist>` は XSS リスクがない（テキストとして表示されるため）が、`value` に HTML 文字が入るとオプション表示が崩れる可能性がある。`option` テキストは `textContent` で設定するよう React の JSX 記法を維持すること。

```typescript
// src/components/common/FieldKeyInput.tsx

interface FieldKeyInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function FieldKeyInput({ value, onChange, placeholder, className }: FieldKeyInputProps) {
  const listId = useId()
  const options = useSchemaFieldOptions()

  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={options.length > 0 ? listId : undefined}
        placeholder={placeholder}
        className={className}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </datalist>
      )}
    </>
  )
}
```

#### 3-2. 各要素 PropertiesPanel の更新

スキーマが定義されているとき `fieldKey` 入力欄を `FieldKeyInput` に変更する:
- `src/elements/dataField/PropertiesPanel.tsx` — `flattenKeys` + `datalist` を `FieldKeyInput` で置換
- `src/elements/text/PropertiesPanel.tsx` — `content` 入力欄に `{{` トリガーでフィールド候補を表示

#### 3-3. テキストトークン補完

テキスト要素の content 入力（`<textarea>`）に `{{` 入力トリガーの補完を追加:

```typescript
// src/components/common/TokenInput.tsx — 新規作成
// - textarea の onKeyUp を監視
// - カーソル前の文字列が `{{` で終わる場合、候補ドロップダウンを表示
// - 候補選択で `{{fieldKey}}` を挿入し、`{{` を置き換え
// - Escape / 候補外クリックでドロップダウンを閉じる
// - useSchemaFieldOptions() から候補を取得
// - スキーマなし → 補完なし（通常 textarea のまま）
```

**対象ファイル:**
- `src/elements/text/PropertiesPanel.tsx` — content の `<textarea>` を `TokenInput` に変更

#### 3-4. テスト

- `src/components/common/FieldKeyInput.test.tsx` — datalist 生成、useId によるID一意性
- `src/components/common/TokenInput.test.tsx` — `{{` トリガー、候補表示、挿入ロジック、Escape クリア

---

### Phase 4: 出力バリアント

**目標**: ツールバーに「バリアント」ボタン → モーダル管理UI。PDF エクスポート時にバリアントを選択可能にする。

#### 4-1. 型定義の更新 (`src/types/index.ts`)

> **Research insight (kieran-typescript-reviewer — CRITICAL):** 既存の `export type OutputVariant = Record<string, unknown>` を**先に削除**してから interface を宣言すること（同名 type alias と interface は共存できない）。

> **Research insight (kieran-typescript-reviewer):** `MaskingRule` は discriminated union にする。`type: 'hidden'` のとき `replaceValue`/`keepFirst`/`keepLast` が型上で存在しない形にする。

> **Research insight (architecture-strategist — IMPORTANT):** `hiddenElementIds` と `MaskingRule { type: 'hidden' }` は同じ概念を二重に表現している。`hiddenElementIds` のみに統一し、`MaskingRule.type` は `'fullReplace' | 'partial'` の2種のみにする。

```typescript
// 既存の `export type OutputVariant = Record<string, unknown>` を削除してから追加

export type MaskingRule =
  | { id: string; targetElementId: string; type: 'fullReplace'; replaceValue: string }
  | {
      id: string
      targetElementId: string
      type: 'partial'
      keepFirst?: number
      keepLast?: number
    }

export interface OutputVariant {
  id: string
  name: string
  targetAudience?: string
  hiddenElementIds: string[]    // 非表示要素（MaskingRule type:'hidden' は使わない）
  maskingRules: MaskingRule[]   // fullReplace / partial のみ
}
```

#### 4-2. スライス作成 (`src/store/variantsSlice.ts` — 新規作成)

> **Research insight (architecture-strategist):** 要素削除時（`layoutSlice.removeElement`）に `hiddenElementIds` のクリーンアップが必要。`removeElement` アクション内で全バリアントの `hiddenElementIds` と `maskingRules` から該当 elementId を除去するか、別途 `cleanupVariantRefsForElement` アクションを提供してレイアウトスライスから呼ぶ。

```typescript
export type VariantsSlice = {
  addVariant: (name: string) => void
  removeVariant: (id: string) => void
  updateVariant: (id: string, patch: Partial<Pick<OutputVariant, 'name' | 'targetAudience'>>) => void
  toggleElementHidden: (variantId: string, elementId: string) => void
  addMaskingRule: (variantId: string, rule: Omit<MaskingRule, 'id'>) => void
  removeMaskingRule: (variantId: string, ruleId: string) => void
  replaceMaskingRule: (variantId: string, rule: MaskingRule) => void  // Partial<union型> は型安全でないためフル置換
  cleanupVariantRefsForElement: (elementId: string) => void
}

export const createVariantsSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  VariantsSlice
> = (set) => ({
  // ...
  toggleElementHidden: (variantId, elementId) => set((s) => {
    const variant = s.definition.outputVariants.find((v) => v.id === variantId)
    if (!variant) return
    const idx = variant.hiddenElementIds.indexOf(elementId)
    if (idx === -1) {
      variant.hiddenElementIds.push(elementId)
    } else {
      variant.hiddenElementIds.splice(idx, 1)
    }
  }),

  cleanupVariantRefsForElement: (elementId) => set((s) => {
    for (const variant of s.definition.outputVariants) {
      variant.hiddenElementIds = variant.hiddenElementIds.filter((id) => id !== elementId)
      variant.maskingRules = variant.maskingRules.filter((r) => r.targetElementId !== elementId)
    }
  }),
})
```

**`layoutSlice.removeElement` の更新:**

```typescript
// layoutSlice.removeElement の末尾に追加
get().cleanupVariantRefsForElement(elementId)
```

#### 4-3. バリアント管理モーダル (`src/components/modals/VariantsModal.tsx` — 新規作成)

> **Research insight (rerender learning):** `variants` 配列を `useReportStore` でサブスクライブするとき `useShallow` を使う（配列要素の追加/削除で別参照になるため）。

> **Research insight (code-simplicity-reviewer):** 「バリアントごとの非表示チェックボックス」を `ElementCommonSection` に追加すると、全要素のプロパティパネルに variants を subscribe させることになりコストが高い。代わりに `VariantsModal` を選択中に開いているとき、選択要素の非表示状態をモーダル内で管理する方が局所的。ただし元のプランのUXを優先するため元設計を維持しつつ、将来的にモーダル内に移す余地を残す。

```typescript
// VariantsModal.tsx
const variants = useReportStore(useShallow((s) => s.definition.outputVariants))
```

```
バリアント管理
┌──────────────────────────────────────┐
│ バリアント                  [✕ 閉じる] │
├──────────────────────────────────────┤
│ [+ 新規バリアント作成]                  │
│                                      │
│ 📄 顧客用                      [削除] │
│    対象者: 顧客                        │
│    非表示要素: 3件 / マスキング: 1件      │
│                                      │
│ 📄 社内用                      [削除] │
│    対象者: 内部スタッフ                  │
└──────────────────────────────────────┘
```

- `DataBindingModal` の実装パターン（Toolbar.tsx:686-691）を踏襲

#### 4-4. ツールバーボタン (`src/components/toolbar/Toolbar.tsx`)

> **Research insight (julik-frontend-races-reviewer — HIGH):** `handleExportPdf` で `isExporting` フラグが `await` の後に立てられているリスクがある。ダブルクリックや連続呼び出しによる二重エクスポートを防ぐため、フラグを**最初の await より前**に立てること。

> **Research insight (julik-frontend-races-reviewer — HIGH):** `historySlice` の `_historyTimer` が `undo()`/`redo()` 呼び出し時にクリアされていない場合、タイマーが発火してアンドゥ後の状態を上書きする。`undo`/`redo` アクションの先頭で `clearTimeout(_historyTimer)` を呼ぶこと。（Phase 4 実装前に修正）

```typescript
// Toolbar.tsx: VariantsModal ボタン追加
const [showVariantsModal, setShowVariantsModal] = useState(false)

<ToolbarButton
  icon={<VariantsIcon />}
  label="バリアント"
  onClick={() => setShowVariantsModal(true)}
/>
{showVariantsModal && (
  <VariantsModal onClose={() => setShowVariantsModal(false)} />
)}

// handleExportPdf の修正（ダブルエクスポートレース対応）
const handleExportPdf = useCallback(async () => {
  if (isExporting) return        // ← フラグチェックを最初に
  setIsExporting(true)           // ← await より前にフラグを立てる
  try {
    if (variants.length > 0) {
      setShowExportVariantDialog(true)
    } else {
      await doExportPdf(null)
    }
  } finally {
    setIsExporting(false)
  }
}, [isExporting, variants.length])
```

#### 4-5. プロパティパネルの更新

`ElementCommonSection` に「バリアントで非表示」セクションを追加:

```typescript
// variants の subscribe — useShallow で配列の浅い比較
const variants = useReportStore(useShallow((s) => s.definition.outputVariants))

// アクティブなバリアントリストを表示
// 各バリアントに対してチェックボックス
// ✓ 顧客用で非表示
// □ 社内用で非表示
```

#### 4-6. PDF エクスポートダイアログ (`src/components/modals/ExportVariantDialog.tsx` — 新規作成)

```
PDF エクスポート
┌──────────────────────────────┐
│ 対象バリアント:                 │
│ ○ なし（全要素表示）           │
│ ○ 顧客用                     │
│ ○ 社内用                     │
│                              │
│ [キャンセル]    [エクスポート]  │
└──────────────────────────────┘
```

**Toolbar.tsx の `handleExportPdf` 変更:**

```typescript
// バリアントが存在する場合はダイアログを表示してから呼ぶ
// （上記の isExporting フラグ修正と合わせて実装）
```

#### 4-7. バリアント適用ロジック (`src/lib/variantApplicator.ts` — 新規作成)

> **Research insight (architecture-strategist — IMPORTANT):** `applyVariant` の引数は `ReportElement[]` ではなく `PageDef[]` にする。バリアント適用はページ全体のコピーを生成するため、ページ単位で処理する方が exportReportToPdf の呼び出しパターンに合う。

> **Research insight (architecture-strategist):** `fullReplace` と `partial` のマスキングは Phase 4 の初期スコープとして実装するが、`partial` はマスキング後に元の型（image, text, barcode 等）への対応が必要。Phase 4v1 では `type: 'text'` と `type: 'textCell'` のみ対応し、他の要素型には `replaceValue` 方式にフォールバックする選択肢を検討すること。

```typescript
// src/lib/variantApplicator.ts

export function applyVariant(
  pages: PageDef[],
  variant: OutputVariant | null,
): PageDef[] {
  if (!variant) return pages

  return pages.map((page) => ({
    ...page,
    elements: page.elements
      .filter((el) => !variant.hiddenElementIds.includes(el.id))
      .map((el) => applyMaskingToElement(el, variant.maskingRules)),
  }))
}

function applyMaskingToElement(
  el: ReportElement,
  rules: MaskingRule[],
): ReportElement {
  const rule = rules.find((r) => r.targetElementId === el.id)
  if (!rule) return el

  if (rule.type === 'fullReplace') {
    if (el.type === 'text' || el.type === 'textCell') {
      return { ...el, content: rule.replaceValue }
    }
    return el
  }

  if (rule.type === 'partial') {
    if (el.type !== 'text' && el.type !== 'textCell') return el
    const content = typeof el.content === 'string' ? el.content : ''
    const masked = applyPartialMask(content, rule.keepFirst, rule.keepLast)
    return { ...el, content: masked }
  }

  return el
}

function applyPartialMask(value: string, keepFirst?: number, keepLast?: number): string {
  const len = value.length
  const first = keepFirst ?? 0
  const last = keepLast ?? 0
  if (first + last >= len) return value
  return value.slice(0, first) + '*'.repeat(len - first - last) + value.slice(len - last || len)
}
```

エクスポート直前に `exportReportToPdf` 呼び出し前で適用する:

```typescript
// exportUtils.ts 内
const pagesToExport = applyVariant(definition.pages, selectedVariant)
await exportReportToPdf(pagesToExport, filename)
```

#### 4-8. Zod スキーマ更新 (`src/lib/schemas/reportDefinition.ts`)

> **Research insight (security-sentinel — MEDIUM):** `replaceValue` に長い文字列が入ると PDF生成時にメモリ問題が起きる可能性がある。`z.string().max(500)` を適用すること。

```typescript
const MaskingRuleSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    targetElementId: z.string(),
    type: z.literal('fullReplace'),
    replaceValue: z.string().max(500),
  }),
  z.object({
    id: z.string(),
    targetElementId: z.string(),
    type: z.literal('partial'),
    keepFirst: z.number().int().nonneg().optional(),
    keepLast: z.number().int().nonneg().optional(),
  }),
])

const OutputVariantSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  targetAudience: z.string().max(200).optional(),
  hiddenElementIds: z.array(z.string()).max(500),
  maskingRules: z.array(MaskingRuleSchema),
})

// ReportDefinitionSchema: outputVariants を z.array(OutputVariantSchema).max(50) に更新
```

#### 4-9. テスト

- `src/store/variantsSlice.test.ts` — CRUD、toggleElementHidden、cleanupVariantRefsForElement
- `src/lib/variantApplicator.test.ts` — hidden除外、fullReplace、partial (keepFirst/keepLast)、variant=null のパススルー
- `src/components/modals/VariantsModal.test.tsx`
- `src/components/modals/ExportVariantDialog.test.tsx`

---

## Technical Considerations

### Architecture Impacts

- **ElementBase** の型変更（`visibilityRule` → `conditionalDisplay`）は全要素型に影響するが、optional フィールドのため既存データは壊れない（migration.ts で変換）
- **`OutputVariant` の型変更**（`Record<string, unknown>` → proper interface）— 先に type alias を削除してから interface を宣言
- **新スライスの追加** は `StoreState` interface と `index.ts` の2箇所で登録が必要
- **`ElementRenderer` の変更** は全要素の表示に影響するため慎重にテスト
- **`hiddenElementIds` 統一** — `MaskingRule.type:'hidden'` は使用しない（`hiddenElementIds` のみ）

### Performance

- `evaluateConditionalDisplay` は `useMemo` でメモ化（`[element.conditionalDisplay, data, rowIndex]` 依存）
- `useSchemaFieldOptions` は `useMemo` でメモ化（スキーマ変更時のみ再計算）
- `ConditionalDisplayEditor`, `ConditionRow`, `SchemaPanel` は `React.memo` でラップ
- `VariantsModal` と `ElementCommonSection` のバリアントリストは `useShallow` でサブスクライブ
- `useSchemaFieldOptions` 内のセレクタ（`s.definition.schema`）は plain selector（`useShallow` 不要）
- バリアント適用はエクスポート時のみ（キャンバスレンダリングには影響しない）

### Backward Compatibility

- `visibilityRule: string` を削除するため、`src/lib/migration.ts` に変換処理を追加
- V2 はバックエンドレスで `.rds.json` の strict な後方互換性は不要（brainstorm 決定事項）

### Security

- `conditionEvaluator.ts` の全ブラケットアクセスで `FORBIDDEN_KEYS`（`__proto__`/`constructor`/`prototype`）をガード
- `SchemaField.key` は Zod 正規表現 `^[a-zA-Z_][a-zA-Z0-9_.]*$` でホワイトリスト制限
- `replaceValue` の長さ制限: `z.string().max(500)`
- `evaluateConditionalDisplay` は JEXL を使用しない（純粋な比較ロジック）→ 評価サンドボックス不要

### Race Conditions & Timer Bugs (要修正)

- **ダブルエクスポート**: `handleExportPdf` で `isExporting = true` を最初の `await` より前に設定
- **Undo タイマー漏れ**: `historySlice.undo()` / `historySlice.redo()` の先頭で `clearTimeout(_historyTimer)` を呼ぶ

---

## System-Wide Impact

### Interaction Graph

```
Phase 1:
ElementRenderer.tsx ─reads─► element.conditionalDisplay
                    ─calls─► conditionEvaluator.evaluateConditionalDisplay()
                    ─reads─► data (from ReportCanvas props)
                    ─useMemo─► [conditionalDisplay, data, rowIndex]

Phase 4:
Toolbar.tsx [Export] ─opens─► ExportVariantDialog
ExportVariantDialog ─selects─► OutputVariant
                    ─calls─► variantApplicator.applyVariant(pages, variant)
                    ─passes─► exportReportToPdf(maskedPages, filename)

Phase 4 (element delete):
layoutSlice.removeElement ─calls─► cleanupVariantRefsForElement(elementId)
                          ─updates─► all variants.hiddenElementIds + maskingRules
```

### State Lifecycle Risks

- **Phase 1**: `conditionalDisplay` が不正形式でも評価時に空条件として扱う（早期 `true` リターン）→ 表示崩れはしない
- **Phase 4**: バリアント適用はエクスポート時のみ元データを**コピー**して変換（イミュータブル）→ 元要素は変更されない
- **要素削除**: `cleanupVariantRefsForElement` によって孤立した hiddenElementIds / maskingRules を即座に除去

### API Surface Parity

- `conditionalDisplay` の評価はクライアント側のみ。V1バックエンド連携とは独立

---

## Acceptance Criteria

### Phase 1: 条件表示 AND/ORエディタ

- [x] `ElementBase` から `visibilityRule?: string` が削除され `conditionalDisplay?: ConditionalDisplay` が追加されている
- [x] `DisplayCondition` が discriminated union（nullary / valued）になっている
- [x] プロパティパネルに AND/OR ラジオグループ + 条件行エディタが表示される
- [x] 条件なしの場合、常に表示（既存動作と同じ）
- [x] AND 条件: 全条件が true のとき要素が表示される
- [x] OR 条件: いずれか1条件が true のとき要素が表示される
- [x] 全8演算子が動作する（equals / not_equals / greater_than / less_than / contains / not_contains / empty / not_empty）
- [x] `empty` / `not_empty` は値入力欄が DOM から除去される
- [x] `group[].field` 記法で detail 行データを参照できる
- [x] FORBIDDEN_KEYS によるプロトタイプ汚染防止が実装されている
- [x] `migration.ts` に `visibilityRule` 変換エントリが追加されている
- [x] `conditionEvaluator.test.ts` で 80% 以上のカバレッジ

### Phase 2: スキーマエディタ

- [x] 左サイドバーに「スキーマ」タブが追加されている
- [x] master / detail グループを作成・削除できる
- [x] グループにフィールドを追加（key / label / type）・削除できる
- [x] `SchemaField.key` は識別子文字のみ許可（Zod 正規表現 + UI バリデーション）
- [x] スキーマ定義は `definition.schema` に保存され、テンプレート保存時に含まれる
- [x] スキーマなし（未定義）でも既存の flat key-value バインディングが動作する
- [x] `schemaSlice.test.ts` で全 CRUD アクションがテストされている

### Phase 3: バインディングエディタUI

- [x] スキーマ定義があるとき、`fieldKey` 入力欄にスキーマフィールドの候補が表示される
- [x] スキーマ定義がないとき、自由入力にフォールバックする
- [x] 複数の `FieldKeyInput` が同一画面に表示されても datalist ID が衝突しない（`useId()`）
- [x] テキスト要素のコンテンツ入力で `{{` を入力するとスキーマフィールドの候補が表示される
- [x] 候補を選択すると `{{fieldKey}}` が挿入される
- [x] `FieldKeyInput.test.tsx` でオートコンプリート動作がテストされている

### Phase 4: 出力バリアント

- [x] 既存の `OutputVariant` 型エイリアスが削除され、新 interface が定義されている
- [x] `MaskingRule` が discriminated union（`fullReplace` / `partial`）になっている
- [x] ツールバーに「バリアント」ボタンが存在し、クリックでモーダルが開く
- [x] バリアントを作成・削除できる
- [x] 要素のプロパティパネルで各バリアントの「非表示」チェックボックスが操作できる
- [x] 要素削除時に全バリアントから該当要素の参照がクリーンアップされる
- [x] PDF エクスポートボタンを押したとき、バリアントが1件以上存在する場合はダイアログが表示される
- [x] バリアント選択後、PDF エクスポート時に非表示要素が除外される（`hiddenElementIds` のみで管理）
- [x] `fullReplace` マスキングで元の値が置換値で上書きされる
- [x] `partial` マスキングで keepFirst/keepLast に従ってマスキングされる
- [x] ダブルクリックによる二重エクスポートが発生しない
- [x] `variantApplicator.test.ts` で全マスキングタイプがテストされている

---

## Dependencies & Risks

| リスク | 影響 | 対策 |
|-------|------|------|
| `visibilityRule` の削除による既存テンプレート破損 | 低（V2は `.rds.json` 互換性不要） | `migration.ts` に変換処理を追加して安全に移行 |
| `OutputVariant` 型変更による Zod 検証エラー | 中 | 移行前に `outputVariants: z.array(z.unknown())` で一時的に緩めてからスキーマ追加 |
| `ElementRenderer` 変更による全要素の表示バグ | 高 | `conditionalDisplay` が undefined の場合は必ず `true` を返すよう保護 |
| スキーマが大きい場合の `useSchemaFieldOptions` パフォーマンス | 低 | `useMemo` でメモ化済み |
| `OutputVariant` interface の名前衝突 | 高 | Phase 4 着手前に `type OutputVariant = Record<string, unknown>` を削除してから interface を宣言 |
| `hiddenElementIds` の孤立（要素削除後） | 中 | `layoutSlice.removeElement` で `cleanupVariantRefsForElement` を呼ぶ |
| ダブルエクスポートレース | 中 | `isExporting` フラグを await 前に立てる |
| Undo タイマー汚染 | 中 | `undo`/`redo` で `clearTimeout(_historyTimer)` |

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-07-v1-data-binding-reference-design-brainstorm.md](docs/brainstorms/2026-04-07-v1-data-binding-reference-design-brainstorm.md)
  - Key decisions: SPA完結、V2流再設計、visibilityRule削除→conditionalDisplay置換、出力バリアント全3機能

### Internal References (V2)

- Element types & `ElementBase`: `src/types/index.ts:125-145`
- `visibilityRule` 定義: `src/types/index.ts:138`
- `OutputVariant` 型エイリアス（削除対象）: `src/types/index.ts:473`
- `outputVariants` on `ReportDefinition`: `src/types/index.ts:494`
- Store slice pattern: `src/store/rulesSlice.ts:10-50`
- `StoreState` interface: `src/store/types.ts:70-209`
- Store assembly: `src/store/index.ts:19-41`
- History scope (pages only): `src/store/historySlice.ts:33`
- `ElementRenderer` visibility check: `src/components/canvas/ElementRenderer.tsx:46`
- `ElementCommonSection` (visibilityRule UI): `src/components/sidebar/PropertiesPanel.tsx:52-75`
- `ElementBaseSchema` (Zod): `src/lib/schemas/reportDefinition.ts:45-54`
- LEFT_TABS registration: `src/App.tsx:19-26`
- Render tab branches: `src/App.tsx:310-314`
- `flattenKeys()` + datalist pattern: `src/elements/dataField/PropertiesPanel.tsx:5-13`
- Toolbar export pattern: `src/components/toolbar/Toolbar.tsx:144-161`
- DataBindingModal pattern: `src/components/toolbar/Toolbar.tsx:686-691`

### Internal References (V1)

- 条件評価ロジック: `app/src/lib/conditionEvaluator.ts`
- ConditionGroupEditor: `app/src/components/molecules/ConditionGroupEditor/`
- ConditionEditor: `app/src/components/molecules/ConditionEditor/`
- スキーマ型定義: `app/src/types/schema.ts`
- バリアント型定義: `app/src/store/documentStore/types.ts` (FlatOutputVariant, FlatMaskingRule)
