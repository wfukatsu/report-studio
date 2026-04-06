---
title: "feat: P1 式評価・計算 — Expression Evaluation & Calculation"
type: feat
status: completed
date: 2026-04-06
origin: docs/plans/2026-04-06-feat-v1-backend-v2-integration-plan.md
---

# P1 式評価・計算 — Expression Evaluation & Calculation

## Overview

V1 Java バックエンドの `ExpressionEngine`（JEXL ベース）を V2 フロントエンドから呼び出し、
`CalculationRule` の式評価結果を `computedValues` ストアに格納する。
各 Element は `data` に `computedValues` をマージして受け取り、
`{{変数名}}` 置換・`fieldKey` 解決でそのまま表示できるようにする。

**依存**: P0 完了済み（`computedSlice`、`reportApi.ts` CRUD、`useAutoSave`、接続基盤）

---

## 背景・動機

現状の `ElementRenderer` は `data` prop（`Record<string, unknown>`）のみ参照する。
`CalculationRule` で定義された計算式（`subtotal = qty * unitPrice` など）は
バックエンドで評価される設計だが、V2 にはまだ呼び出し口がなく、
計算結果が画面に反映されない。

P1 では以下を実現する:
- API `POST /api/v2/templates/{id}/evaluate` の型付き呼び出し
- 800ms デバウンス + AbortController による無駄なリクエスト抑制
- 結果を `computedSlice`（`computedValues` / `computedErrors`）に書き込み
- `ElementRenderer` が `{ ...data, ...computedValues }` でマージして既存 Renderer に渡す

**P1 スコープ外（P2 に延期）**:
- `evaluateValidate` の自動呼び出し（P2 で「バリデートボタン」実装時に追加）
- `invalidateComputed()` の自動トリガー（`calculationRules`/`testData` 変更で自動再評価されるため不要）
- `dataBinding.ts` の `computedValues` オーバーレイ（`ElementRenderer` レベルで解決済み）
- `ElementRenderer` の `computedValues` 購読をキャンバス親コンポーネントに移動して N サブスクリプションを 1 に削減（P2 最適化タスク）

---

## Proposed Solution

```
useEvaluator (global hook, app level)
  ├── React selector: calculationRules + testData (subscribeWithSelector 不使用)
  ├── useEffect dep → debounces 800ms
  ├── local AbortController キャプチャ でインフライトキャンセル
  ├── guarded finally: abort 済みのみスキップ、unmount cleanup で明示クリア
  ├── evaluateCalculations(templateId, definition, testData, signal)
  └── setComputedResults / setComputedLoading (finally が単一責務)

ElementRenderer
  ├── useShallow selector → computedValues (参照変化しても内容同一ならスキップ)
  └── mergedData = { ...data, ...computedValues }
      └── 渡す to all child Renderer
```

---

## Acceptance Criteria

- [x] `evaluateCalculations(templateId, definition, testData, signal?)` — `reportApi.ts` に追加（`signal` を `apiFetch` に転送、`@/store` インポートなし）
- [x] `evaluateValidate(templateId, definition, testData)` — `reportApi.ts` に追加（P2 用スタブ定義のみ、`useEvaluator` からは呼ばない）
- [x] `useEvaluator` hook — 800ms debounce、AbortController（ローカルキャプチャ）
- [x] `useEvaluator` — `subscribeWithSelector` 不使用。React `useEffect` + selector deps パターン（`useAutoSave` と同構造）
- [x] `useEvaluator` — `finally` は abort 済みの場合スキップ（後続リクエストが in-flight 中のローディングを誤クリアしない）
- [x] `useEvaluator` — アンマウント cleanup で `abort()` + `setComputedLoading(false)` を明示的に呼ぶ
- [x] `computedSlice.ts` — `setComputedResults` から `s.computedLoading = false` を削除（loading はフックの責務）
- [x] `ElementRenderer` — `computedValues` を `useShallow` で購読し `data` にマージ
- [x] テスト: `useEvaluator.test.ts` — abort ローカルキャプチャ、loading 状態、unmount cleanup
- [x] テスト: `ElementRenderer.test.tsx` — computedValues がマージされることを確認

---

## Technical Approach

### 1. API 追加 — `src/api/reportApi.ts`

既存の `jsonBody()` ヘルパーを使って一貫したスタイルで追加する。

> **レイヤー制約（重要）**: `evaluateCalculations` と `evaluateValidate` は
> `@/store` を **インポートしない**。純粋な async 関数として実装すること。
> ストアとの全インタラクションは `useEvaluator` hook が担う。
> `reportApi.ts` は既に `loadFromBackend` でストアを参照しているが、
> これは既存の設計上の制約であり、P1 で拡張しない。

```typescript
// reportApi.ts に追加するインポート
import {
  EvaluateResponseSchema,
  ValidateResponseSchema,
  type EvaluateResponse,
  type ValidateResponse,
} from '@/lib/schemas/evaluateResponse'

// P1: useEvaluator から呼ぶ。signal を渡して HTTP abort を有効化。
// 注: signal?: AbortSignal は RequestInit に含まれるため、apiFetch の変更は不要。
export async function evaluateCalculations(
  templateId: string,
  definition: ReportDefinitionInput,
  testData: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<EvaluateResponse> {
  return apiFetch(
    `/api/v2/templates/${templateId}/evaluate`,
    EvaluateResponseSchema,
    { ...jsonBody({ definition, testData }), signal },
  )
}

// P2 用スタブ。P1 では呼ばない。
export async function evaluateValidate(
  templateId: string,
  definition: ReportDefinitionInput,
  testData: Record<string, unknown>,
): Promise<ValidateResponse> {
  return apiFetch(
    `/api/v2/templates/${templateId}/validate`,
    ValidateResponseSchema,
    jsonBody({ definition, testData }),
  )
}
```

---

### 1b. スキーマ + 型定義 — `src/lib/schemas/evaluateResponse.ts`

> **循環インポート防止**: `EvaluateResponse` / `ValidateResponse` インターフェースは
> このスキーマファイルで定義する。依存方向は一方向:
> `reportApi.ts` → `evaluateResponse.ts` → `@/store/types` / `@/lib/schemas/reportDefinition`
>
> `evaluateResponse.ts` → `@/api/reportApi` のバックインポートは作らない。

```typescript
import { z } from 'zod'
import type { ReportDefinitionInput } from '@/lib/schemas/reportDefinition'
import type { ComputedValue, ValidationViolation } from '@/store/types'

// --- 型定義 ---
export interface EvaluateResponse {
  results: Record<string, ComputedValue>
  errors: Record<string, string>
}

export interface ValidateResponse {
  violations: ValidationViolation[]
}

// --- Zod スキーマ（satisfies で ComputedValue 型との乖離を静的検出）---
export const EvaluateResponseSchema = z.object({
  results: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  errors: z.record(z.string(), z.string()),
}) satisfies z.ZodType<EvaluateResponse>

export const ValidateResponseSchema = z.object({
  violations: z.array(z.object({
    ruleKey: z.string(),
    message: z.string(),
    elementId: z.string().optional(),
  })),
}) satisfies z.ZodType<ValidateResponse>
```

**なぜ `EvaluateRequest` インターフェースを定義しないか**:
`evaluateCalculations` は positional 引数を使う。`EvaluateRequest` 型は呼び出し側では不要で、
定義するとコードベースに未使用の型が増える（YAGNI）。

---

### 2. `useEvaluator` hook — `src/hooks/useEvaluator.ts`

**設計方針**:
- グローバル hook（1 インスタンス、app レベルで呼ぶ）
- `subscribeWithSelector` ミドルウェア **不使用**（ストアに組み込まれていない）
- `useReportStore(selector)` + `useEffect` deps の React 標準パターン（`useAutoSave` と同構造）
- AbortController は **ローカル変数** にキャプチャ — `abortRef.current` は次リクエスト開始時に上書きされるため

**`finally` ガードの設計**:
```
問題: 未ガード finally の場合の競合
  T=0: Request A 開始、loading=true
  T=0.3: Request B 開始（A abort）、loading=true（重複セットだが無害）
  T=0.5: A の fetch 完了/失敗 → finally(未ガード) → loading=false ← バグ: B がまだ in-flight!
  T=1.2: B の fetch 完了 → finally → loading=false（正しいがタイミングが遅れる）

修正: guarded finally + unmount cleanup での明示クリア
  T=0.5: A の finally: controller_A.aborted=true → スキップ（Bのloadingを守る）
  T=1.2: B の finally: controller_B.aborted=false → setComputedLoading(false) ✓
  アンマウント: cleanup で abort() + setComputedLoading(false) を明示的に呼ぶ
```

```typescript
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store'
import { evaluateCalculations } from '@/api/reportApi'
import { EVAL_DEBOUNCE_MS } from '@/config/constants'

export function useEvaluator(): void {
  // useShallow を両 selector に適用:
  // loadReport/importReportJSON は definition を丸ごと置換するため、
  // calculationRules の中身が変わっていなくても新しい配列参照が生成される。
  // useShallow は要素の【参照】を比較する（深い値比較ではない）。
  // immer は変更した要素のみ新参照を生成するため、useShallow での参照比較で十分。
  const calculationRules = useReportStore(useShallow((s) => s.definition.calculationRules))
  const testData = useReportStore(useShallow((s) => s.testData))

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      // fire 時に最新状態を読む（useAutoSave の pendingRef パターンと異なる点）:
      // 評価は常に現在の最新値で行うべき。auto-save は「送信時点の内容を正確に記録」が目的
      // なので snapshot at schedule time が必要だが、式評価は常に最新状態が正しい。
      const { definition, testData: currentTestData, currentTemplateId } =
        useReportStore.getState()
      if (!currentTemplateId || definition.calculationRules.length === 0) return

      // 前のリクエストを HTTP レベルでキャンセル
      abortRef.current?.abort()
      const controller = new AbortController()   // ← ローカル変数にキャプチャ（重要）
      abortRef.current = controller              //   await 後も controller を参照するため

      useReportStore.getState().setComputedLoading(true)
      try {
        const result = await evaluateCalculations(
          currentTemplateId,
          definition,
          currentTestData,
          controller.signal,   // signal を転送して fetch を実際にキャンセル
        )
        if (controller.signal.aborted) return   // ローカル変数を参照（ref は既に次世代に更新済みの可能性）
        useReportStore.getState().setComputedResults(result)
      } catch (err) {
        if (controller.signal.aborted) return   // AbortError は無視
        useReportStore.getState().setComputedResults({
          results: {},
          errors: { _global: String(err) },
        })
      } finally {
        // abort 済み（= 後続リクエストが in-flight 中）の場合はクリアしない。
        // クリアすると後続リクエストの loading=true が消えてしまう。
        // アンマウント時の abort は下の cleanup useEffect が明示的にクリアする。
        if (!controller.signal.aborted) {
          useReportStore.getState().setComputedLoading(false)
        }
      }
    }, EVAL_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [calculationRules, testData])  // deps が変わるたびにタイマーリセット

  // アンマウント時: abort + ローディングクリアを明示的に行う。
  // guarded finally は aborted 時にクリアしないため、このクリーンアップが必要。
  // Zustand ストアアクションはコンポーネントのライフサイクル外から安全に呼べる。
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      useReportStore.getState().setComputedLoading(false)
    }
  }, [])
}
```

**`useAutoSave` との対比**:
| | `useAutoSave` | `useEvaluator` |
|---|---|---|
| 変更検知 | `useReportStore(selector)` + `useEffect` | 同じ |
| デバウンス | `setTimeout` + ref | 同じ |
| タイマーキャンセル | deps 変化時 cleanup | 同じ |
| abort | なし（PUT は冪等） | AbortController（ローカルキャプチャ）|
| state read timing | schedule 時スナップショット（ghost-save 防止） | fire 時（常に最新が正しい） |
| cleanup loading clear | 不要（save state は別管理） | unmount cleanup で明示クリア |

---

### 3. `computedSlice` 修正 — `src/store/computedSlice.ts`

`setComputedResults` から `s.computedLoading = false` を削除する。
ローディングのクリア責務を `useEvaluator` の `finally` と unmount cleanup に一本化する。

```typescript
// Before:
setComputedResults: ({ results, errors }) => set((s) => {
  s.computedValues = results
  s.computedErrors = errors
  s.computedLoading = false   // ← 削除
}),

// After:
setComputedResults: ({ results, errors }) => set((s) => {
  s.computedValues = results
  s.computedErrors = errors
  // loading は呼び出し側（useEvaluator の finally）が管理する
}),
```

---

### 4. `ElementRenderer` 修正 — `src/components/canvas/ElementRenderer.tsx`

> **P2 注記**: `ElementRenderer` は `memo()` でラップされているが、
> 内部にストア購読を追加すると `memo` は props 変化に対してのみ効果を持つ。
> 要素数が多い（最大 300/section）場合、computedValues 変化時に N 回の
> `useShallow` 比較が発生する。P2 で購読をキャンバス親コンポーネントに移動して
> N サブスクリプション → 1 サブスクリプションに削減することを検討。
> P1 では `computedValues` キーは `calculationRules` 数（通常 < 20）に比例するため許容範囲。

```typescript
import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store'

export function ElementRenderer({ element, data, ...rest }) {
  // computedValues を購読（参照変化しても内容同一なら再レンダリングしない）
  const computedValues = useReportStore(useShallow((s) => s.computedValues))

  // testData + computedValues をマージ（computedValues が優先）
  const mergedData: Record<string, unknown> = { ...data, ...computedValues }

  // 以降は mergedData を使って既存の type 分岐に渡す
}
```

---

### 5. `layoutSlice` — `_historyTimer` バグ修正（別コミット）

> **注意**: このバグ修正は P1 機能と無関係のため、**別コミット**として実施する。

`updateElement` は `_historyTimer` で 300ms debounce して `pushHistory()` を呼ぶ。
以下の関数は `updateElement` の debounce が残ったまま `pushHistory()` を直接呼ぶため、
タイマーが後から発火すると履歴が二重プッシュされる。

**修正対象: 以下9関数の先頭に `_historyTimer` キャンセルを追加**:
```
addElement, removeElement, duplicateElement,
setMasterHeader, setMasterFooter,
cutElements, pasteElements, alignElements, setZOrder
```

修正パターン（各関数の先頭、`set(...)` より前）:
```typescript
// updateElement の debounce タイマーを先にキャンセル（二重履歴プッシュ防止）
if (_historyTimer !== null) {
  clearTimeout(_historyTimer)
  _historyTimer = null
}
```

`loadReport` と `newReport` は既にキャンセル済み（既存コード 171, 194 行）。
`pushHistory()` 自体は変更しない（timer キャンセルは呼び出し側の責務）。

---

## Test Plan

### `src/hooks/useEvaluator.test.ts`

```typescript
describe('useEvaluator', () => {
  it('calls evaluateCalculations after 800ms debounce when calculationRules change')
  it('does nothing when currentTemplateId is null')
  it('does nothing when calculationRules is empty')
  it('sets computedLoading true before fetch')
  it('clears computedLoading false after successful fetch (finally: not aborted)')
  it('clears computedLoading false after failed fetch (finally: not aborted)')
  it('does NOT clear computedLoading when request is aborted mid-flight (guarded finally)')
  it('clears computedLoading on unmount even if request was aborted (cleanup effect)')
  it('sets computedResults on success')
  it('sets computedErrors._global on failure')
  it('does not write to store when aborted (local controller capture)')
  it('cancels previous in-flight request (HTTP level) when deps change rapidly')
})
```

### `src/store/computedSlice.test.ts`（修正）

`setComputedResults` から `s.computedLoading = false` を削除するため、
既存のテスト `'stores results and clears loading'` の `computedLoading` アサーションを変更:

```typescript
// Before:
it('stores results and clears loading', () => {
  useReportStore.getState().setComputedLoading(true)
  useReportStore.getState().setComputedResults({ results: {...}, errors: {} })
  expect(s.computedLoading).toBe(false)   // ← このアサーションを削除
})

// After (setComputedResults は loading を変更しないことを明示):
it('stores results without changing loading state', () => {
  useReportStore.getState().setComputedLoading(true)
  useReportStore.getState().setComputedResults({ results: { subtotal: 5000, total: 5500 }, errors: {} })

  const s = useReportStore.getState()
  expect(s.computedValues).toEqual({ subtotal: 5000, total: 5500 })
  expect(s.computedErrors).toEqual({})
  expect(s.computedLoading).toBe(true)   // ← setComputedResults は loading を変更しない
})
```

### `src/components/canvas/ElementRenderer.test.tsx`（追加）

```typescript
describe('ElementRenderer — computedValues merge', () => {
  it('passes merged data (testData + computedValues) to child renderer')
  it('computedValues overrides testData on key conflict')
  it('renders correctly when computedValues is empty')
})
```

### `src/api/reportApi.test.ts`（追加）

```typescript
it('evaluateCalculations sends POST with definition and testData')
it('evaluateCalculations forwards AbortSignal to apiFetch')
it('evaluateValidate sends POST and returns violations')
```

---

## Implementation Checklist

### API Layer
- [x] `src/lib/schemas/evaluateResponse.ts` — `EvaluateResponse`/`ValidateResponse` 型 + Zod スキーマ（`EvaluateRequest` 型は不要、循環防止のため型もここで定義）
- [x] `src/api/reportApi.ts` — `evaluateCalculations`（`signal` 付き）、`evaluateValidate`（P2 スタブ）追加。`@/store` インポートなし。

### Store + Hook（アトミックに実施すること）

> **順序制約**: `computedSlice.ts` の変更と `useEvaluator.ts` の作成は同一コミットで行う。
> `computedSlice.ts` の変更前に `useEvaluator` を動かすと `setComputedResults` が
> loading をクリアし続け、guarded finally の不変条件が暗黙的に成立してしまう。
> `computedSlice.ts` の変更後かつ `useEvaluator` なしでテストすると loading が
> 永久に `true` になる。どちらか片方だけ適用するとテストが壊れる。

- [x] `src/store/computedSlice.ts` — `setComputedResults` から `s.computedLoading = false` を削除
- [x] `src/hooks/useEvaluator.ts` — 新規作成（React deps パターン、両 selector に `useShallow`、ローカル AbortController キャプチャ、guarded finally + unmount cleanup）

### Component
- [x] `src/components/canvas/ElementRenderer.tsx` — `computedValues` マージ（`zustand/shallow` から `useShallow` インポート）

### Separate Commit (Bug Fix)
- [x] `src/store/layoutSlice.ts` — `_historyTimer` バグ修正（9関数: addElement/removeElement/duplicateElement/setMasterHeader/setMasterFooter/cutElements/pasteElements/alignElements/setZOrder の先頭でキャンセル）

### Tests
- [x] `src/hooks/useEvaluator.test.ts` — 新規（12ケース。guarded finally + unmount cleanup の組み合わせテストを含む）
- [x] `src/store/computedSlice.test.ts` — `'stores results and clears loading'` テストを `'stores results without changing loading state'` に修正（`computedLoading` は `true` のまま）
- [x] `src/components/canvas/ElementRenderer.test.tsx` — computedValues マージテスト追加
- [x] `src/api/reportApi.test.ts` — evaluate 関数テスト追加

---

## System-Wide Impact

### Interaction Graph

```
testData または calculationRules 変更
  → useEvaluator deps 変化 → 前タイマーキャンセル → 新タイマー 800ms
  → evaluateCalculations(signal) (POST)
  → setComputedResults(result)  [loading は finally が管理]
  → finally: !aborted → setComputedLoading(false)
  → ElementRenderer 再レンダリング（useShallow で参照変化のみトリガー）
  → mergedData で TextRenderer / DataFieldRenderer が値を表示

新しいリクエスト到達（800ms 内に2回変更）:
  → 2回目の deps 変化 → controller_A.abort() → controller_B 作成
  → controller_A の catch: controller_A.aborted=true → return（stale 書き込み防止）
  → controller_A の finally: controller_A.aborted=true → スキップ（B の loading を守る）
  → controller_B の fetch 完了 → setComputedResults → finally: !aborted → setComputedLoading(false)

アンマウント:
  → cleanup: abortRef.current.abort() + setComputedLoading(false) 明示クリア
  → in-flight リクエストの finally は aborted=true なのでスキップ → 二重クリアなし
```

### Error Propagation

| 層 | エラー種別 | 処理 |
|---|---|---|
| `apiFetch` | NetworkError | catch: `computedErrors._global` にセット → finally(guarded): loading クリア |
| `apiFetch` | ApiError (4xx/5xx) | catch: `computedErrors._global` にセット → finally(guarded): loading クリア |
| `useEvaluator` | AbortError | catch: `controller.aborted=true` → return（何も書き込まない） |
| アンマウント abort | — | catch: return → finally: スキップ → **cleanup effect** が loading をクリア |
| バックエンド式評価失敗 | レスポンスの `errors` フィールド | `setComputedResults` が `computedErrors` に key 別格納 → finally: loading クリア |

### State Lifecycle Risks

- **ローディング競合防止**: `finally` は `controller.signal.aborted` を確認してスキップ。
  後続リクエストが in-flight 中に abort されたリクエストが loading=false にしない。
- **アンマウント後の loading 漏れ防止**: unmount cleanup が `setComputedLoading(false)` を明示的に呼ぶ。
  Zustand ストアアクションはコンポーネントのライフサイクル外から呼んでも安全（React state ではない）。
- **`setComputedResults` の責務**: loading の管理は持たない（削除後）。値とエラーのみ書き込む。
- **二重評価防止**: `useEvaluator` は 1 インスタンスのみ（グローバル）。per-element にしないこと。
- **undo 後の stale**: `computedSlice` は履歴外なので undo しても `computedValues` は残る。
  これは意図的（undo は `calculationRules` を戻すため、useShallow が変化を検知して自動再評価される）。
- **`invalidateComputed()` を element 操作に追加しない理由**:
  `computedValues` は `calculationRules.key` をキーとする（要素の存在とは無関係）。
  element 追加/削除で `invalidateComputed()` を呼ぶと値が消えて 800ms 後に復活する
  視覚的フラッシュが発生するが、正確性は改善されない。

---

## Dependencies & Risks

| 依存 | 状態 |
|---|---|
| P0 完了（computedSlice, reportApi CRUD） | ✅ 完了済み |
| V1 バックエンド `POST /evaluate` エンドポイント | ⚠️ 未実装（バックエンド P1 タスク） |
| `jsonBody()` ヘルパー in `reportApi.ts` | ✅ P0 で実装済み |
| Zod v4 `z.record(z.string(), ...)` | ✅ P0 で確認済み |
| `useShallow` from `zustand/shallow` | ✅ コードベース統一パス（App.tsx 他で使用済み） |
| `apiFetch(path, schema, init?)` の `signal` 転送 | ✅ `init` が `RequestInit` のため変更不要 |
| `ComputedValue`、`ValidationViolation` 型 | ✅ `src/store/types.ts` に定義済み（line 57, 59） |

**バックエンド未実装時の対応**: `evaluateCalculations` が 404/500 を返す間は
`computedValues = {}` のままになる。既存の `testData` ベースの表示は影響なし。

---

## Sources & References

- **Origin plan**: [docs/plans/2026-04-06-feat-v1-backend-v2-integration-plan.md](./2026-04-06-feat-v1-backend-v2-integration-plan.md)
- `src/hooks/useAutoSave.ts` — React deps パターン、debounce 構造の参考（`useEvaluator` の手本）
- `src/components/canvas/ElementRenderer.tsx` — `data` prop の現状確認
- `src/lib/dataBinding.ts` — P1 スコープ外（変更なし）
- `src/store/computedSlice.ts` — P0 で実装済み（`s.computedLoading = false` 削除対象）
- `src/store/layoutSlice.ts` — `_historyTimer` バグ修正対象（9関数確認済み）
- `src/config/constants.ts` — `EVAL_DEBOUNCE_MS = 800`
