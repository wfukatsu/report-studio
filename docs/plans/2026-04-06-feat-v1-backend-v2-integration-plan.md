---
title: "feat: V1バックエンド × V2フロントエンド統合"
type: feat
status: completed
date: 2026-04-06
origin: docs/brainstorms/2026-04-06-v1-backend-integration-brainstorm.md
deepened: 2026-04-06
---

# feat: V1バックエンド × V2フロントエンド統合

---

## Enhancement Summary

**Deepened on:** 2026-04-06  
**Research agents used:** architecture-strategist, security-sentinel, julik-frontend-races-reviewer, performance-oracle, kieran-typescript-reviewer, data-integrity-guardian, best-practices-researcher, framework-docs-researcher, code-simplicity-reviewer, deployment-verification-agent

### Critical Discoveries

1. ~~**サービスレイヤー必須**: `reportService.ts` が必要~~ → **採用撤回 (DHH)**: `loadFromBackend` は `reportApi.ts` に直接置く。Java的3層設計は不要
2. **Zod 検証必須**: `apiFetch<T>` は型の嘘。APIレスポンスに Zod スキーマ検証がなければ store corruption が起きる
3. **JEXL インジェクション (CRITICAL)**: V1 の JexlSandbox が未設定の場合、JVM 任意コード実行が可能。サンドボックス設定が先決
4. **Puppeteer SSRF (CRITICAL)**: templateId を URL に埋め込む設計は SSRF 攻撃の入口。URL allowlist + request interception 必須
5. **auto-save のクロージャバグ**: `debounce(async () => get().definition)` はファイア時点の store を読むため、他テンプレート読込後の誤保存が起きる
6. **concurrent load レース**: `loadFromBackend` の並行呼び出しは先着順でなく遅着順で確定する。generation counter 必須
7. **独立 PDF リポジトリは YAGNI**: 現状の `html2canvas` 出力で足りる。Puppeteer は既存バックエンドに endpoint として追加するまで不要
8. ~~**全文 PUT はスケール不可**: JSON Patch で 2500× 削減可能~~ → **採用撤回 (DHH)**: シングルユーザー用途で差分配信のコストを払う必要はない。full PUT のみ
9. **データ損失リスク**: save timeout 後のセッション終了で未保存データが消える。`localStorage` キャッシュ + `sendBeacon` 必須

### Plan Changes from Deepening

- `src/api/` を 5 ファイル → `client.ts` + `reportApi.ts` (2 ファイル) にシンプル化
- `saveToBackend` を store から `useAutoSave` hook に移動
- ~~JSON Patch (fast-json-patch) を auto-save に採用~~ → DHH Simplicity Review で廃止、full PUT のみ
- 式評価 debounce を `useEffect` + `setTimeout` + `canceled` フラグに変更 (debounce-in-useEffect パターンの廃止)
- 独立 PDF リポジトリを Phase 2 から除外し「必要になったら」に延期
- V1 Java の 4 Controller クラスを統合
- セキュリティ要件を Acceptance Criteria に追加
- デプロイ前チェックリストを追加

### Plan Changes from Technical Review (CRITICAL 修正)

- **[TS-1]** `_loadGeneration` モジュール変数を `useReportStore` 内の `loadGeneration: number` に移動
- **[TS-2]** `useEvaluator` cleanup の `setLoading(false)` を削除（unmounted component への state 更新）
- **[TS-3]** `AbortController` を `useEffect` スコープに移動し cleanup で `abort()` を呼ぶ
- **[Security C-1]** `isSafeImageSrc` 本番コードを修正（SVG禁止・HTTP禁止・空文字は false）+ テスト更新
- **[Security C-2]** JEXL Sandbox を `visibilityRule` 全パスに適用すること明記
- **[Security C-3]** `importFromJSON` の Zod スキーマ検証に深さ・数量制限を追加（`migration.ts:155` TODO 解消）
- `src/config/constants.ts` を追加（`AUTOSAVE_DEBOUNCE_MS`, `EVAL_DEBOUNCE_MS` の magic number 解消）

### Plan Changes from DHH Simplicity Review (採用)

- **JSON Patch 廃止**: `fast-json-patch` 依存削除、full PUT のみ。`PATCH /api/v2/templates/{id}` エンドポイント削除
- **`src/services/reportService.ts` 廃止**: `loadFromBackend` は `reportApi.ts` に直接追加。3層設計を排除
- **`computedStore` を main store スライスに統合**: `create<ComputedState>()` の別インスタンスを廃止し `computedSlice.ts` として `useReportStore` に組み込む。undo 後のステール問題を根本解決
- **`ComputedValue = number|string|boolean|null`**: Java の null を許容する型に修正

---

## Overview

V2（React SPA）をインメモリ専用ツールから永続化・式評価・高品質PDFを備えた本格的なレポートデザインスタジオに進化させる。

V1（Java/Javalin + ScalarDB）のエンジン群（JEXL式評価・CalculationEngine・ValidationEngine）をそのまま維持しながら、APIのI/FをV2型定義に合わせて刷新する。

```
V2 Frontend (React SPA, port 5173)
    │
    ├─ Template API ──────────────► V1 Java API (port 8080)   ← /api/v2/ を新設
    │  (CRUD, バージョン管理)          ├── ScalarDB (SQLite)
    │                                 ├── ExpressionEngine (JEXL) — 維持
    ├─ 計算・バリデーション API ──────► ├── CalculationEngine — 維持
    │                                 └── ValidationEngine — 維持
    │
    └─ PDF生成（Phase 2以降）────────► V1 Java または専用 endpoint
                                        └── Puppeteer（必要になったら追加）
```

> **PDF サーバーについて (YAGNI):** 独立リポジトリは作らない。まず `html2canvas` の既存パスで本番稼働させ、フォント/レイアウト品質が実際のユーザー問題として報告されてから、V1 Java に Puppeteer subprocess endpoint を追加する。

---

## Problem Statement

現在のV2は：
- **保存できない** — ページリロードですべてのデータが消える
- **式評価がない** — `{{sum(items, 'price')}}` のような集計式が機能しない
- **PDF品質が低い** — html2canvas は印刷用に精度が不十分（ただし後回し）
- **テンプレート管理がない** — 一覧・バージョン管理・共有が存在しない

---

## Proposed Solution

3フェーズで段階的に統合する（PDF は Phase 3 以降の別案件）：

| Phase | 内容 | 優先度 |
|-------|------|--------|
| P0 | 基盤接続：Vite proxy, `src/api/` 層, V1 `/api/v2/` ルート, 認証 | Critical |
| P1 | データバインディング強化：式評価・計算・バリデーション, computedSlice | High |
| P2 | テンプレート管理：バージョンUI・スキーマ管理 | Medium |

---

## Technical Approach

### Key Decisions (ブレインストームから引継ぎ)

1. **V2型定義が唯一の正 (OQ-1解決)**  
   `src/types/index.ts` の `ReportDefinition` がAPI I/Fの正源。V1側は変換レイヤーなしでV2 JSON をそのまま受け取る。`projectionConverter` は廃止。  
   *(see brainstorm: docs/brainstorms/2026-04-06-v1-backend-integration-brainstorm.md)*

2. **V1 Java を専用バックエンドとして維持**  
   JEXL / CalculationEngine / ValidationEngine は再実装しない。ScalarDB (SQLite) も維持。

3. **オフライン時は SPA フォールバック (OQ-2解決)**  
   V1未起動時は保存なし・式評価なしで動作継続。UIにオフラインバッジ表示。

4. **非同期の配置ルール (Architecture Review + DHH)**  
   store は同期ミューテーションのみ。`saveToBackend` は `useAutoSave` hook に配置。`loadFromBackend` は `reportApi.ts` に直接追加（services/ レイヤーなし）。

5. **自動保存：2秒デバウンス + full PUT (DHH Simplicity Reviewで簡素化)**  
   JSON Patch (RFC 6902) は YAGNI。`ReportDefinition` は最大でも数百KB — シングルユーザー用途で差分配信のコストを払う必要はない。`fast-json-patch` 依存なし、full PUT のみ。

6. **独立 PDF リポジトリは YAGNI (Simplicity Reviewで削除)**  
   V1 Java に Puppeteer endpoint を追加するのは実際にユーザーから品質問題が報告されてから。

---

### Architecture Details (Deepened)

#### V2 フロントエンド新規ファイル（シンプル化後）

```
src/
  api/
    client.ts          # fetch ラッパー（Zod検証・ApiError・NetworkError・オフライン検知）
    reportApi.ts       # 全API関数（CRUD / evaluate / versions / auth）+ loadFromBackend も含む
  hooks/
    useAutoSave.ts     # 2秒デバウンス自動保存 + sendBeacon on pagehide
    useEvaluator.ts    # 800ms評価、canceled フラグ、AbortController
    useConnectionState.ts # navigator.onLine + 30s HEAD probe
  store/
    computedSlice.ts   # 計算結果スライス（main store に統合、undo/redo 対象外）
  lib/
    schemas/
      reportDefinition.ts  # Zod スキーマ（ReportDefinition の完全検証）
  config/
    constants.ts       # AUTOSAVE_DEBOUNCE_MS, EVAL_DEBOUNCE_MS
```

> **`src/services/reportService.ts` は作らない (DHH):** `loadFromBackend` のような async 操作は `reportApi.ts` に直接追加する。frontend で `api/` と `services/` の2層を分けることは Java 的3層設計の持ち込みであり、実質的に1対1の委譲ラッパーしか生まれない。

> **`computedStore` は別 `create()` で作らない (DHH):** 2つの Zustand ストアは暗黙的な依存関係を生み、undo 後に stale 値が残る。`computedSlice.ts` として main store のスライスに統合し、`history` の対象外フィールドとして扱う。

**`src/api/client.ts` の設計（Zod + 型安全版）：**

```typescript
import { z, ZodSchema } from 'zod'

class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message); this.name = 'ApiError'
  }
}
class NetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'NetworkError'
  }
}

// Zod スキーマを必須引数にすることで型の嘘を排除
async function apiFetch<T>(path: string, schema: ZodSchema<T>, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'include', ...init })
  } catch (cause) {
    throw new NetworkError('Network request failed', { cause })
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body, res.statusText)
  }
  if (res.status === 204) return schema.parse(undefined)
  return schema.parse(await res.json())
}

const ApiErrorBodySchema = z.object({ message: z.string().optional(), code: z.string().optional() })
export function isApiError(e: unknown): e is ApiError { return e instanceof ApiError }
export function isNetworkError(e: unknown): e is NetworkError { return e instanceof NetworkError }
export function parseApiErrorBody(err: ApiError) { return ApiErrorBodySchema.safeParse(err.body).data ?? null }
```

**`src/hooks/useAutoSave.ts` の設計（race condition 対策済み）：**

```typescript
export function useAutoSave(): void {
  const pages   = useReportStore(s => s.definition.pages)
  const rules   = useReportStore(s => s.definition.calculationRules)
  const meta    = useReportStore(s => s.definition.metadata)
  const id      = useReportStore(s => s.currentTemplateId)
  const setSave = useReportStore(s => s.setSaveState)

  // lastSavedDefinition を ref に持ち、fire 時点のスナップショットで保存
  const pendingRef = useRef<ReportDefinition | null>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const definition = useReportStore(s => s.definition)

  useEffect(() => {
    if (!id) return
    pendingRef.current = definition
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const snap = pendingRef.current
      if (!snap) return
      setSave('saving')
      try {
        await saveReport(id, snap)   // full PUT（JSON Patch は YAGNI）
        setSave('saved')
      } catch (err) {
        setSave('error')
        if (isApiError(err)) console.error('Auto-save failed:', err.status)
        else console.error('Auto-save unexpected error:', err)
      }
    }, AUTOSAVE_DEBOUNCE_MS)   // src/config/constants.ts で定義（2000ms）
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [pages, rules, meta, id])   // structural deps only — not ui/selection state

  // Tab close: sendBeacon が唯一の確実な配送手段
  useEffect(() => {
    const handlePageHide = () => {
      const snap = pendingRef.current
      if (snap && id) navigator.sendBeacon(`/api/v2/templates/${id}`, JSON.stringify(snap))
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [id])
}
```

> **なぜ `debounce(async fn)` でなく `setTimeout` か?** Lodash の `debounce` が async 関数をラップすると戻り値は `void` になりエラーが無音で消える。さらにデバウンスが `get()` を fire 時点で呼ぶため、別テンプレートをロード済みの状態で旧テンプレートの内容を誤保存する「ゴーストセーブ」バグが発生する。

**`src/hooks/useEvaluator.ts` の設計（out-of-order レース対策）：**

> **CRITICAL 修正 (TypeScript Review):**
> 1. `AbortController` を `useEffect` スコープに移動（`setTimeout` 内では cleanup から到達不能）
> 2. cleanup で `setLoading(false)` を呼ばない（unmounted component への state 更新）
> 3. cleanup で `abortCtrl.abort()` を呼んでリクエストをキャンセル

```typescript
export function useEvaluator(element: ReportElement): EvaluatorResult {
  const rules    = useReportStore(s => s.definition.calculationRules)
  const testData = useReportStore(s => s.testData)

  useEffect(() => {
    let canceled = false
    const abortCtrl = new AbortController()   // ← useEffect スコープに移動（cleanup から到達可能）
    const timer = setTimeout(async () => {
      useReportStore.getState().setComputedLoading(true)   // computedSlice の専用アクション
      try {
        const result = await evaluateCalculations(rules, testData, abortCtrl.signal)
        if (!canceled) {
          useReportStore.getState().setComputedResults(result)  // loading も false にリセット
        }
      } catch (err) {
        if (!canceled && !abortCtrl.signal.aborted) {
          useReportStore.getState().setComputedLoading(false)
          if (isNetworkError(err)) useReportStore.getState().setBackendConnected(false)
        }
      }
    }, EVAL_DEBOUNCE_MS)   // src/config/constants.ts で定義（800ms）

    return () => {
      canceled = true
      clearTimeout(timer)
      abortCtrl.abort()    // ← リクエストをネットワーク層でキャンセル
      // NOTE: setComputedLoading は呼ばない。unmounted component への state 更新を避けるため。
    }
  }, [rules, testData])

  // main store から per-key で購読（fan-out 防止）
  return useReportStore(useShallow(s => ({
    value:      s.computedValues[element.id] ?? null,
    errors:     s.computedErrors,
    loading:    s.computedLoading,
    violations: s.computedViolations,
  })))
}
```

**`src/store/computedSlice.ts` — main store スライスとして統合：**

> **DHH の推奨:** 別 `create()` インスタンスは不要。`ComputedSlice` を main store の一部として定義し、
> `Pick<StoreState, 'computedValues' | 'computedErrors' | 'computedViolations' | 'computedLoading' | ...>` で管理する。
> `historySlice` は `pages` のみをスナップショットするため、computed フィールドは自動的に undo/redo の対象外になる。

```typescript
// src/store/computedSlice.ts
// ComputedValue = number | string | boolean | null
// null を含む（Java の null は JS の null にデシリアライズされるため）
export type ComputedValue = number | string | boolean | null

export type ComputedSlice = Pick<StoreState,
  | 'computedValues'      // Record<string, ComputedValue>
  | 'computedErrors'      // Record<string, string>
  | 'computedViolations'  // ValidationViolation[]
  | 'computedLoading'     // boolean
  | 'setComputedResults'
  | 'setComputedLoading'
  | 'setComputedViolations'
  | 'invalidateComputed'
>

export const createComputedSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  ComputedSlice
> = (set) => ({
  computedValues: {},
  computedErrors: {},
  computedViolations: [],
  computedLoading: false,
  setComputedResults: ({ results, errors }) => set((s) => {
    s.computedValues = results
    s.computedErrors = errors
    s.computedLoading = false   // 評価完了でローディング解除
  }),
  setComputedLoading: (loading) => set((s) => { s.computedLoading = loading }),
  setComputedViolations: (violations) => set((s) => { s.computedViolations = violations }),
  invalidateComputed: () => set((s) => {
    s.computedValues = {}
    s.computedErrors = {}
    s.computedViolations = []
    s.computedLoading = false
  }),
})
```

> **invalidation トリガー:** `addElement`, `removeElement`, `duplicateElement`, `updateElement`（expression 変更時）の後に `get().invalidateComputed()` を呼ぶ。`moveElement` / `resizeElement` は不要。

**concurrent load 対策（generation counter — ストア内 state として管理）：**

> **CRITICAL 修正 (TypeScript Review):** `let _loadGeneration = 0` はモジュールスコープのミュータブル変数。
> テスト間で状態が漏れ、devtools で観察不能。`loadGeneration: number` を `StoreState` に追加し、
> `useReportStore` 内で管理する。

```typescript
// src/store/types.ts に追加
loadGeneration: number          // concurrent load 用カウンター（undo/redo 対象外）

// src/store/uiSlice.ts に追加
incrementLoadGeneration: () => void   // loadGeneration を +1 する

// src/api/reportApi.ts — loadFromBackend もここに置く（services/ レイヤー不要）
export async function loadFromBackend(id: string): Promise<void> {
  useReportStore.getState().incrementLoadGeneration()
  const generation = useReportStore.getState().loadGeneration
  useReportStore.getState().setLoadState('loading')
  try {
    const raw = await getReport(id)
    const parsed = ReportDefinitionSchema.parse(raw)          // Zod 検証
    if (generation !== useReportStore.getState().loadGeneration) return  // 後着に負けたら捨てる
    useReportStore.getState().loadReport(parsed)
    useReportStore.getState().setCurrentTemplateId(id)
    useReportStore.getState().setBackendConnected(true)
    useReportStore.getState().invalidateComputed()  // main store スライスの action
  } catch (err) {
    if (generation !== useReportStore.getState().loadGeneration) return
    if (isNetworkError(err)) useReportStore.getState().setBackendConnected(false)
    useReportStore.getState().setLoadState('error')
  }
}
```

#### V1 Java バックエンド変更（シンプル化後）

4つの Controller クラスを作らず、既存ルーターを拡張：

```
# /api/v2/ ルート（新規追加、既存 /api/v1/ は维持）
GET    /api/v2/templates              → { items, total }
POST   /api/v2/templates              → TemplateListItem
GET    /api/v2/templates/{id}         → ReportDefinition (V2 JSON, Zod検証済み)
PUT    /api/v2/templates/{id}         → ReportDefinition（full PUT のみ、JSON Patch なし）
DELETE /api/v2/templates/{id}         → 204

GET    /api/v2/templates/{id}/versions       → VersionListItem[]
POST   /api/v2/templates/{id}/versions       → VersionListItem（フルスナップショット必須）
POST   /api/v2/templates/{id}/versions/{vid}/restore → ReportDefinition

POST   /api/v2/evaluate/calculations  → { results, errors }
POST   /api/v2/evaluate/validate      → { violations }

GET    /api/v2/health                 → 204（Puppeteer-like probe 用）
```

**V1 DB スキーマ変更：**

```sql
-- additive only, nullable
ALTER TABLE templates ADD COLUMN v2_definition_json TEXT;
ALTER TABLE templates ADD COLUMN v2_updated_at INTEGER;  -- 別カラムでV1 updated_atと分離

-- Version snapshots table (full copy, NOT diff)
CREATE TABLE template_versions_v2 (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  version_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,    -- フルコピー（diff は不可）
  created_at INTEGER NOT NULL,
  created_by TEXT
);
```

> **なぜ `lastSavedAt` フィールドを JSON 内に持つか:** `v2_updated_at` カラムとは別に、`ReportDefinition.metadata` に `savedAt: string` を埋め込む。クライアントは PUT 時にこのフィールドをリクエストに含め、サーバー側で「提出された `savedAt` が DB の値と一致するか」を確認する楽観的排他制御として利用する。不一致 → HTTP 409。

---

### Security Requirements (Security Review から必須追加)

**JEXL Sandbox (CRITICAL — 実装前に設計必須):**

> **CRITICAL (Security Review C-2):** JexlSandbox は `calculationRules[*].expression` だけでなく、
> `ReportElement.visibilityRule`（`ElementBase` の全サブタイプに存在）の評価にも必ず適用すること。
> V1 の evaluator がこれら全てのパスをカバーしているか実装前に確認が必要。
> また、500ms タイムアウトが per-evaluation-call で適用されることを確認
>（1リクエストに複数evaluation が含まれる場合、合計時間でなく個別に適用）。

```java
// V1 ExpressionEngine.java に追加必須
JexlSandbox sandbox = new JexlSandbox(false);  // false = デフォルト拒否
// 明示的に許可する演算子と関数のみ登録
// class, forName, getMethod, invoke, Runtime, Process は絶対に禁止
JexlEngine jexl = new JexlBuilder()
    .sandbox(sandbox)
    .permissions(JexlPermissions.RESTRICTED)  // JEXL 3.3+
    .create();

// ⚠️ 適用必須のパス:
// 1. CalculationRule.expression (calculationRules[*].expression)
// 2. ElementBase.visibilityRule (全 ReportElement サブタイプ)
// 上記いずれかのパスで JexlEngine を再生成する場合も同じ sandbox 設定を使うこと
```

**Puppeteer URL allowlist (CRITICAL — PDF機能追加時に必須):**

```typescript
// report-pdf-server (将来追加時)
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'https://app.example.com'])

function assertSafeUrl(url: string): void {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocol not allowed')
  if (!ALLOWED_ORIGINS.has(parsed.origin)) throw new Error('Origin not allowed')
}

// Puppeteer request interception
await page.setRequestInterception(true)
page.on('request', req => {
  const u = new URL(req.url())
  if (!ALLOWED_ORIGINS.has(u.origin)) req.abort('blockedbyresponse')
  else req.continue()
})
```

**Vite proxy は `/api/v2` のみに限定:**

```typescript
// vite.config.ts — 全/apiを公開するのでなく/api/v2のみ
server: {
  proxy: {
    '/api/v2': { target: `http://localhost:${process.env.VITE_API_PORT ?? 8080}`, changeOrigin: true }
  }
}
```

**セッション Cookie 属性（V1 Javalin 側で確認必須）:**
```
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/api/v2; Max-Age=28800
```

**`isSafeImageSrc` の修正（既存バグ・CRITICAL）:**

> **CRITICAL (Security Review C-1):** 実際の `exportUtils.ts` は `http://` と `data:image/svg+xml` を
> 許可している。本番コードがプランと乖離している。SVG は `<script>` を含められるため XSS ベクターになる。
> この修正は V1 統合の前に実施必須。あわせて `exportUtils.test.ts` の期待値も更新すること
> （現在のテストは `http://` を `true` として期待している）。

```typescript
// src/lib/exportUtils.ts の修正
const SAFE_DATA_PREFIXES = ['data:image/png', 'data:image/jpeg', 'data:image/gif', 'data:image/webp']
// data:image/svg+xml は禁止（<script> 埋め込み可能）
// http:// は禁止（https:// のみ許可）
// 空文字は false を返す（empty src で自ページへのリクエストが飛ぶのを防ぐ）
export function isSafeImageSrc(src: string): boolean {
  if (!src) return false   // ← 空文字は false（以前は true だったが変更）
  const lower = src.toLowerCase().trim()
  if (lower.startsWith('data:')) return src.length <= 2*1024*1024 && SAFE_DATA_PREFIXES.some(p => lower.startsWith(p))
  return lower.startsWith('https://')
}
```

> **テスト更新:** `exportUtils.test.ts` の `http://example.com/img.png` が `true` を期待している箇所を
> `false` に変更すること。`isSafeImageSrc('')` も `false` に変更。

---

### Implementation Phases

#### Phase 0: 基盤接続（P0）

**目標:** V2フロントエンドからV1のCRUD APIを呼べる状態にする

**タスク：**

**Frontend:**
- [x] `vite.config.ts` に `/api/v2` プロキシ設定を追加（`VITE_API_PORT=8080`、全/apiでなく/api/v2のみ）
- [x] `.env.example` を作成（`VITE_API_PORT=8080`）
- [x] `src/lib/exportUtils.ts` — `isSafeImageSrc` の修正（SVG禁止・HTTP→HTTPS・空文字は false）**[CRITICAL C-1]**
- [x] `src/lib/exportUtils.test.ts` — `http://` と `''` の期待値を `false` に更新
- [x] `src/lib/schemas/reportDefinition.ts` — Zod スキーマ（pages/sections/elements の数量上限・深さ制限含む）**[CRITICAL C-3]**
- [x] `src/lib/migration.ts` — `isReportDefinition` を廃止し Zod スキーマ検証に置換（L155 TODO 解消）**[CRITICAL C-3]**
- [x] `src/config/constants.ts` — `AUTOSAVE_DEBOUNCE_MS = 2000`, `EVAL_DEBOUNCE_MS = 800` を定義
- [x] `src/api/client.ts` — Zod スキーマ必須の apiFetch, ApiError, NetworkError, isApiError, parseApiErrorBody
- [x] `src/api/reportApi.ts` — list/get/saveReport/create/delete/auth + `loadFromBackend` 全関数（`services/` レイヤーなし）
- [x] `src/store/types.ts` — `backendConnected`, `currentTemplateId`, `loadState`, `saveState`, `loadGeneration`, `testData: Record<string, unknown>`, computed フィールド群（`computedValues`, `computedErrors`, `computedViolations`, `computedLoading`）を追加**[CRITICAL TS-1]**
- [x] `src/store/uiSlice.ts` — `setBackendConnected`, `setCurrentTemplateId`, `setSaveState`, `setLoadState`, `incrementLoadGeneration`
- [x] `src/store/computedSlice.ts` — `ComputedValue = number|string|boolean|null`、main store スライスとして追加（別 `create()` なし）
- [x] `src/hooks/useAutoSave.ts` — 2秒デバウンス + sendBeacon on pagehide
- [x] `src/hooks/useConnectionState.ts` — navigator.onLine + 30秒 HEAD probe
- [x] `src/components/common/ConnectionBadge.tsx` — オフラインバッジ
- [x] `src/components/common/SaveStatusIndicator.tsx` — 保存状態インジケーター

**V1 Java Backend:**
- [x] V1 `ExpressionEngine.java` — `JexlSandbox` + `JexlPermissions.RESTRICTED` 設定（**CRITICAL C-2**）。`calculationRules[*].expression` と `elements[*].visibilityRule` の両パスに適用されること
- [x] V1 `ApiV2Routes.java` 追加（既存 ApiRoutes と同一クラスに追加 or 新 Route クラス）
- [x] V1 DB: `templates` テーブルに `v2_definition_json TEXT`, `v2_updated_at INTEGER` カラム追加
- [x] V1 DB: `template_versions_v2` テーブル作成
- [x] V1 `TemplateV2Controller.java` (or 既存に追加) — CRUD 5エンドポイント、payload 最大 16MB 制限
- [x] V1 `GET /api/v2/health` — 204レスポンス（DB接続確認込み）
- [x] V1 グローバル例外ハンドラー — stack trace を返さない `{ code, message }` のみ
- [x] V1 CORS — production ドメインを環境変数で設定
- [x] V1 `/api/v2/evaluate/calculations` の rate limit（10req/10s per session）

**Tests:**
- [x] `src/lib/exportUtils.test.ts` — `isSafeImageSrc` の `http://` / SVG / `''` が `false` を返すことを確認
- [x] `src/lib/migration.test.ts` — 悪意あるネスト構造 JSON が Zod スキーマで reject されることを確認
- [x] `src/api/client.test.ts`（fetch mock、Zod validation エラー）
- [x] `src/api/reportApi.test.ts`（CRUD + `loadFromBackend` の concurrent load / generation counter テスト）
- [x] `src/hooks/useAutoSave.test.ts`（debounce、sendBeacon、ghost-save 防止）
- [x] `src/hooks/useConnectionState.test.ts`
- [x] `src/hooks/useEvaluator.test.ts` — cleanup 時に AbortController.abort() が呼ばれること。unmount 後に setComputedLoading が呼ばれないこと（P1で実装）

**成功基準:**
- V2でテンプレートを保存し、ページリロード後も復元できる
- V1未起動時に「オフライン」バッジが表示され、SPA動作が継続する
- 別テンプレートをロード中に保存が発動しても旧テンプレートの内容で保存されない（ghost-save テスト）
- `isSafeImageSrc('http://...')` と `isSafeImageSrc('data:image/svg+xml,...')` が `false` を返す
- 深さ 10 のネスト JSON を importFromJSON に渡すと ZodError がスローされる
- useEvaluator が rules 変更後に前の in-flight リクエストを abort することを確認
- 自動保存の PUT ボディが full JSON（パッチではない）であること

---

#### Phase 1: データバインディング強化（P1）

**目標:** 式評価・集計関数・バリデーションをプレビューで動作させる

**タスク：**

**Frontend:**
- [x] `src/api/reportApi.ts` — `evaluateCalculations`, `evaluateValidate` を追加
- [x] `src/hooks/useEvaluator.ts` — 800ms debounce + AbortController + guarded finally（main store の computed フィールドを更新）
- [x] `src/lib/dataBinding.ts` — 変更不要（`ElementRenderer` が `{ ...data, ...computedValues }` でマージ済み。P1計画参照）
- [x] `src/components/canvas/ElementRenderer.tsx` — `useShallow` で `computedValues` 購読、`mergedData` を各 Renderer に渡す
- [x] `layoutSlice.ts` — element 操作への `invalidateComputed()` 追加は意図的にスキップ（視覚的フラッシュのみで正確性改善なし。P1計画参照）
- [x] `layoutSlice.ts` — `pushHistory()` 直前に `_historyTimer` をキャンセル（9関数に修正済み）

**追加実装（P1.5 バリデーション表示）:**
- [x] `src/api/reportApi.ts` — `evaluateValidate` に `signal?: AbortSignal` 追加（P2で修正）
- [x] `src/components/toolbar/Toolbar.tsx` — `handleValidate` + バリデートボタン + 違反件数バッジ
- [x] `src/components/sidebar/PropertiesPanel.tsx` — `ViolationsSection`（React.memo + useMemo）追加
- [x] `src/lib/schemas/evaluateResponse.ts` — `ValidateResponseSchema` に `.max()` 制約追加（セキュリティ）
- [x] `src/store/layoutSlice.ts` — `newReport()` に `invalidateComputed()` 追加

**V1 Java Backend:**
- [x] V1 `EvaluateV2Controller.java` — `POST /api/v2/evaluate/calculations` 実装
  - `CalculationEngine.java` を V2 `CalculationRule[]` 入力に対応
  - payload 制限: rules max 50, expression max 500 chars, data depth max 5
  - JEXL timeout: `Future.get(500, MILLISECONDS)`（設定フラグでなくJVMレベルで強制）
  - 循環参照検出 → HTTP 422
- [x] V1 `EvaluateV2Controller.java` — `POST /api/v2/evaluate/validate`
- [x] V1 `visibilityRule` expression の character allowlist 検証

**Tests:**
- [x] `src/hooks/useEvaluator.test.ts`（concurrent 評価の out-of-order 防止、main store への結果反映、unmount cleanup）
- [x] `src/store/computedSlice.test.ts`（invalidation、ComputedValue の null 許容確認）
- [x] `src/lib/dataBinding.test.ts`（computed値統合）
- [x] V1 Java: JEXL injection テスト（class.forName 等が拒否されること）

**成功基準:**
- `{{sum(items, 'price')}}` が プレビューで正しく集計される
- CalculationRule の循環参照が検出されエラー表示される
- バリデーション違反がプロパティパネルに表示される
- JEXL 注入テスト（悪意ある expression）が V1 で 400/422 を返す

---

#### Phase 2: テンプレート管理（P2）

**目標:** バージョン履歴の基盤を提供する

**タスク：**

**Frontend:**
- [x] `src/api/reportApi.ts` — `listVersions`, `createVersion`, `restoreVersion` を追加
- [x] `src/components/sidebar/VersionHistoryPanel.tsx` — バージョン一覧・復元UI
- [x] `src/api/reportApi.ts` — `restoreVersion(vid)` （generation counter 経由）
- [x] テンプレートギャラリー (`TemplateGallery.tsx`) に「バックエンドから読み込む」モードを追加
- [x] App.tsx LEFT_TABS に「バージョン」タブを追加して `VersionHistoryPanel` をレンダリング

**V1 Java Backend:**
- [x] V1 `VersionV2Controller.java` — GET/POST/POST-restore エンドポイント
  - スナップショットはフルコピー（diff 不可）
  - version_number はatomic counter（templates行の counter カラムをトランザクションで更新）

**Tests:**
- [x] `src/api/reportApi.test.ts`（version list/create/restore）
- [x] `src/components/sidebar/VersionHistoryPanel.test.tsx`

**成功基準:**
- テンプレートを保存した後にバージョン一覧が表示され、任意のバージョンに復元できる
- 復元後のundo/redo履歴が正しくリセットされる
- 並行バージョン作成が重複したversion_numberを生まない（concurrent snapshot テスト）

---

## System-Wide Impact

### Interaction Graph

```
ユーザー操作 (addElement, updateElement)
  → layoutSlice.ts (immer mutation, synchronous)
  → historySlice.pushHistory() (構造変更の場合, _historyTimer cancel 済み)
  → invalidateComputed() (expression参照要素の場合)
  → useAutoSave のuseEffect が pages/rules/meta の変化を検知
      → debounce 2000ms
      → reportApi.saveReport() → full PUT /api/v2/templates/:id → V1 Java → ScalarDB
      → uiSlice.setSaveState('saved'|'error')

calculationRules or testData 変更
  → useEvaluator useEffect が変化を検知
      → canceled=false, timer 800ms
      → evaluateCalculations() + AbortController → POST /api/v2/evaluate/calculations
      → V1 CalculationEngine (JEXL, topological sort)
      → store.setComputedResults() (computedSlice — main store)
      → ElementRenderer (per-key useShallow selector) → 関係する要素のみ再レンダリング
```

### Error Propagation

| レイヤー | エラー種別 | 処理方法 |
|---------|-----------|---------|
| `src/api/client.ts` | HTTP 4xx/5xx | `ApiError` を throw、`parseApiErrorBody` で安全に取得 |
| `src/api/client.ts` | ネットワーク切断 | `NetworkError` を throw → `backendConnected = false` |
| `reportApi.ts` | Zod parse failure | `ZodError` を throw → store corruption 防止 |
| `useAutoSave` | 保存失敗 | `saveState = 'error'` → トースト、SPA継続 |
| `useEvaluator` | 評価失敗 | `computedErrors` に格納、UIにインラインエラー表示 |
| V1 JEXL循環参照 | HTTP 422 | `errors` フィールドにキーを返す |
| V1 JEXL injection | HTTP 400 | character allowlist で事前拒否 |
| V1 rate limit超過 | HTTP 429 | `Retry-After` header、クライアントは exponential backoff |

### State Lifecycle Risks (深化後)

- **ゴーストセーブ**: `get()` をfire時点で読む → 修正: スケジュール時点の snapshot を `pendingRef` に保存
- **out-of-order evaluation**: async評価が新旧逆転 → 修正: `canceled` フラグ + AbortController
- **concurrent load overwrite**: 遅着ロードが最新テンプレートを上書き → 修正: generation counter
- **computed フィールドのステール**: バックエンド切断時に旧計算値が残る → 修正: `setBackendConnected(false)` と同時に `invalidateComputed()`（main store スライスのアクション）
- **history timer と paste の二重history**: `pushHistory` を直接呼ぶアクションで `_historyTimer` をキャンセルしていない → 修正: `pushHistory` 先頭で常に cancel
- **delete-toast timer on unmount**: `App.tsx` の `useEffect` cleanup 漏れ → 修正: `useEffect` cleanup で `clearTimeout`
- **localStorage + sendBeacon でのデータ損失防止**: save timeout + セッション終了 = データ消失 → `localStorage` キャッシュ + `pagehide` での `sendBeacon`

### API Surface Parity

- `ElementRenderer.tsx` — `computedValues` を per-key `useShallow` selector で購読（main store から取得）
- `exportUtils.ts` — `isSafeImageSrc` の SVG/HTTP 修正（既存バグ）
- `PropertiesPanel.tsx` — バリデーション違反を `computedViolations` から取得（main store）
- `src/store/layoutSlice.ts` — `_historyTimer` cancel を全 `pushHistory` 直接呼び出し箇所に追加

### Integration Test Scenarios

1. **保存→リロード復元**: テンプレート保存後にブラウザをリロードし、同じURLでデータが復元される
2. **ゴーストセーブ防止**: テンプレートAの2秒デバウンス発火前にテンプレートBをロードした場合、AのIDでBの内容が保存されないこと
3. **concurrent load**: テンプレートAのロード中にBをクリックした場合、最終的にBのみ表示される
4. **out-of-order evaluation**: ルール変更後800ms以内に別変更した場合、最新の評価結果のみ反映される
5. **JEXL injection拒否**: `class.forName("java.lang.Runtime")` を expression として送ると HTTP 400 が返る
6. **楽観的排他制御**: 同一テンプレートを2タブで開き、タブAで保存後タブBから保存するとHTTP 409 が返る
7. **オフライン→復帰**: V1停止中に編集しV1再起動後、`localStorage` キャッシュから復元プロンプトが出る
8. **循環参照検出**: `A = B + 1, B = A + 1` で HTTP 422 + エラーメッセージ表示

---

## Acceptance Criteria

### Functional Requirements

**P0:**
- [x] テンプレートを保存するとデータがV1 ScalarDBに永続化される
- [x] ページリロード後、同じテンプレートIDで前回の状態が復元される
- [x] V1バックエンド未起動時に「オフライン」バッジが表示され、SPA動作が継続する
- [x] 認証なしでアクセス時に `/login` へリダイレクトされる
- [x] ゴーストセーブが発生しない（concurrent load + debounce テスト）

**P1:**
- [x] `{{sum(items, 'price')}}` が プレビューで正しく集計される
- [x] CalculationRule の依存関係順に評価される
- [x] ValidationRule の違反がプロパティパネルに表示される
- [x] バックエンド評価の間は「計算中...」インジケーターが表示される
- [x] JEXL injection テストが拒否される

**P2:**
- [x] テンプレート編集ごとにバージョンが作成できる
- [x] 任意バージョンに復元できる
- [x] 復元後にundo/redo履歴がリセットされる

### Non-Functional Requirements
- [x] 自動保存が2秒以内に開始される（デバウンス後）
- [x] 自動保存は full PUT（JSON Patch なし、`fast-json-patch` 依存なし）
- [x] 計算評価のUI応答が800ms以内（デバウンス後）
- [x] API通信のテストカバレッジ 80% 以上（ブランチ・行・関数・ステートメント）
- [x] `src/api/` の全関数で Zod スキーマ検証が通ること
- [x] JEXL evaluation endpoint に rate limit (10req/10s per session)
- [x] セッション Cookie に `HttpOnly; Secure; SameSite=Lax` が設定されていること
- [x] `isSafeImageSrc` がSVG data URIを拒否すること

---

## Pre-Deploy Checklist (Deployment Review から追加)

### DB 事前確認

```sql
-- 1. baseline row count（デプロイ前後で一致すること）
SELECT COUNT(*) FROM templates;

-- 2. v2_definition_json カラムが存在しないこと（migration前確認）
PRAGMA table_info(templates);

-- 3. WAL ファイルがないこと（クリーンなDB状態）
-- shell: ls -la <db_path>/*.wal
```

### Go/No-Go チェックリスト

| # | 基準 | 確認 |
|---|------|------|
| G1 | SQLite baseline row count 保存済み | [x] |
| G2 | `v2_definition_json` カラム migration 前に存在しない | [x] |
| G3 | WAL ファイルなし | [x] |
| G4 | `/api/v1/` 全エンドポイント 2xx 確認 | [x] |
| G5 | `/api/v2/` が migration 前 404 であること | [x] |
| G6 | CORS preflight が V2 production origin に対して正しいヘッダーを返す | [x] |
| G7 | Port 8080 以外に競合なし | [x] |
| G8 | JEXL sandbox が設定されていること（`JexlPermissions.RESTRICTED`） | [x] |
| G9 | `isSafeImageSrc` SVG 拒否テスト合格 | [x] |
| G10 | staging で3サービス連携 end-to-end 合格 | [x] |

**いずれか NO = デプロイ中止**

### ロールバック手順

| コンポーネント | ロールバック方法 |
|---|---|
| DB migration | `cp <db>.pre-migration <db>` で sqlite ファイルを復元 |
| V1 Java | 旧 JAR を再デプロイ（DB の新カラムは無視される） |
| V2 SPA | CDN の前バージョンバンドルを再デプロイ |

**ロールバック順序:** SPA → V1 Java → DB（逆順）

---

## Dependencies & Prerequisites

| 依存 | 説明 |
|------|------|
| V1 Java バックエンド | `../report-design-studio/` が起動していること |
| `zod` | `npm i zod` — API レスポンス検証 |
| `VITE_API_PORT=8080` | `.env.local` または環境変数 |
| JEXL sandbox設定 | V1 Java側でP0開始前に設定必須 |

---

## Risk Analysis & Mitigation

| リスク | 影響 | 対策 |
|--------|------|------|
| V1 Java API刷新コストが想定より大きい | P0遅延 | テンプレート1件のGET/PUT PoC → 2日以内に見極め |
| JEXL sandbox 設定漏れ | JVM任意コード実行 | P0開始前に JEXL injection テストを CI に追加 |
| `isReportDefinition` が古くデータ破損検出できない | store corruption | P0で Zod スキーマ実装後、既存の TODO を Close |
| 楽観的排他制御の 409 をユーザーが見る | UX 悪化 | 通常ユース（シングルタブ）ではほぼ起きない。起きた場合は「他デバイスで変更されました。再読み込みしますか？」ダイアログ |
| `localStorage` への大きな JSON が quota 超過 | 保存失敗 | `try/catch` で失敗した場合はサイレントスキップ（保存が最優先） |

---

## Future Considerations

- **PDF 高品質化**: ユーザーから fidelity 問題が報告されたら V1 Java に Puppeteer Node subprocess を追加。Puppeteer は `puppeteer-cluster`, `CONCURRENCY_CONTEXT`, `--disable-dev-shm-usage`, `fonts-noto-cjk` が必須。`window.__PDF_READY__` フラグで React render 完了を待つ。
- **楽観的ロック完全化**: 現在は `savedAt` のみのシンプル比較。協調編集が必要になったら ETag + version カラムに昇格。
- **公開フォーム機能**: `ReportDefinition.submissionModels` フィールドはすでに存在 (OQ-4)。
- **バッチPDF生成**: ジョブキュー追加時は ScalarDB の Job テーブルを活用。
- **インクリメンタル式評価**: クライアントサイドで dependency graph を管理し変更されたルールの下流のみ送信。

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-06-v1-backend-integration-brainstorm.md](../brainstorms/2026-04-06-v1-backend-integration-brainstorm.md)
- Key decisions carried forward:
  1. V2型定義を正とし、V1 `/api/v2/` を刷新（変換レイヤー不要）
  2. オフライン時は現状SPA にフォールバック
  3. Puppeteer PDF は YAGNI: 必要になるまで defer

### Internal References

- V2型定義: `src/types/index.ts` — `ReportDefinition` (L462–478)
- Zod TODO: `src/lib/migration.ts:156` — 「TODO Phase 2: replace isReportDefinition with full Zod schema validation」→ P0 で解消
- V2ストアの注入点: `src/store/layoutSlice.ts` — `loadReport()` (L167)
- 既存 debounce timer (バグ): `src/store/layoutSlice.ts:134` — `_historyTimer`
- 既存 isSafeImageSrc (要修正): `src/lib/exportUtils.ts:30-41`
- V1 APIクライアントパターン: `../report-design-studio/app/src/api/apiClient.ts`
- V1 自動保存パターン: `../report-design-studio/app/src/api/useAutoSave.ts`
- V1 バックエンドルート: `../report-design-studio/server/src/main/java/com/report/server/ApiRoutes.java`
- V1 JEXL エンジン: `../report-design-studio/server/src/main/java/com/report/server/ExpressionEngine.java`
- V1 計算エンジン: `../report-design-studio/server/src/main/java/com/report/server/CalculationEngine.java`

### External References

- JEXL Sandbox: Apache Commons JEXL 3.3+ `JexlPermissions.RESTRICTED`
- sendBeacon: [MDN — Navigator.sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon) (pagehide で唯一確実な配送手段)
- puppeteer-cluster: [thomasdondorf/puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) (PDF 追加時に参照)
- Zustand 5 async: [pmndrs/zustand](https://github.com/pmndrs/zustand) — named `create` export
- OWASP SSRF Prevention: [SSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- Vite proxy: [Vite 6 server options](https://v6.vite.dev/config/server-options)
- GitLab auto-save UX: [Pajamas — Saving and Feedback](https://design.gitlab.com/patterns/saving-and-feedback/)
