---
title: "feat: P2 バリデーション表示 — Validation Display"
type: feat
status: completed
date: 2026-04-06
origin: docs/plans/2026-04-06-feat-v1-backend-v2-integration-plan.md
---

# P2 バリデーション表示 — Validation Display

## Enhancement Summary

**Deepened on:** 2026-04-06
**Research agents used:** TypeScript reviewer, Frontend races reviewer, Performance oracle, Security sentinel, Code simplicity reviewer, Architecture strategist, Best practices researcher, Pattern recognition specialist

### Key Improvements

1. **`useValidator` hookをやめ `handleValidate` in Toolbar に変更** — `handleExportPdf`/`handleExportPng` と同一パターン。コード複雑度35%削減。
2. **`evaluateValidate` に `signal?: AbortSignal` 追加** — P1スタブでは signal が渡されず AbortController が実際には無効だった（Critical bug）。
3. **`ViolationsSection` を `React.memo` + `useMemo` パターンに変更** — `useShallow(filter)` は毎回フィルター実行が走る。
4. **`ValidateResponseSchema` に `.max()` 追加** — 文字列フィールド長制限なし → DOM枯渇攻撃ベクター（Security）。
5. **`newReport()`/`importReportJSON()` に `invalidateComputed()` 追加** — テンプレート切り替え後に stale violations が残るバグ修正。
6. **エラー時は violations をクリアしない** — validate 開始時にクリア（UX改善）。

### New Considerations Discovered

- バリデーション開始時に前回結果をクリアすべき（catch ブランチではなく開始時）
- `encodeURIComponent(templateId)` をすべての URL 構築に適用（別 PR 推奨）
- stale violations の視覚的マーキング（将来の P2.5 タスク）

---

## Overview

ツールバーに「バリデート」ボタンを追加し、`POST /api/v2/templates/{id}/validate` を呼び出す。
バリデーション違反（`ValidationViolation[]`）を `computedViolations` ストアに格納し、
プロパティパネルの選択要素ビュー内に表示する。

**依存**: P1 完了済み（`evaluateValidate` スタブ、`computedViolations` ストア、`setComputedViolations` アクション）

---

## Problem Statement / Motivation

P1 では `evaluateValidate` は「P2 スタブ」として定義のみ行った。
`computedViolations` に格納されたデータをUIで確認する手段がなく、
バリデーションルール（`definition.validationRules`）の結果が完全に不可視。

P2 では以下を実現する:
- ツールバーから手動バリデーション実行（ボタン → API呼び出し）
- 違反件数バッジでグローバルな状態を一目で把握
- プロパティパネルで選択要素の違反詳細を確認

**なぜ自動（reactive）ではなくオンデマンド（ボタン）か:**

業界標準に合致する設計:
- Figma のコンストレイントチェッカー・アクセシビリティプラグインはすべてオンデマンド
- VS Code の ESLint は保存時（onDidSave）、キーストロークごとではない
- バリデーションは `validationRules` 全ルールを全要素に対して評価する重い処理
- 「明示的なバリデートアクション」はユーザー意図にも合致（保存前に手動確認）

---

## Proposed Solution

```
Toolbar
  ├── handleValidate() — async function (handleExportPdf と同一パターン)
  ├── isValidating: boolean (useState, isExporting と同一パターン)
  ├── validateError: string | null (useState, exportError と同一パターン)
  ├── abortRef: useRef<AbortController | null>
  ├── ToolbarButton (ShieldCheck/ShieldAlert アイコン)
  │     ├── onClick → handleValidate()
  │     ├── disabled={!currentTemplateId || isValidating}
  │     └── 違反件数バッジ
  └── validateError 表示 (exportError と同一パターン、role="alert")

PropertiesPanel
  └── ViolationsSection (React.memo)
        ├── useReportStore(s => s.computedViolations) + useMemo(filter by elementId)
        └── violations.length === 0 の場合は null return
```

**なぜ `useValidator` hookを作らないか（Code Simplicity Review の採用）:**

`useEvaluator` は *reactive 継続プロセス*（deps変化で自動発火、デバウンス、lifecycle が必要）。
`handleValidate` は *on-demand 命令的アクション*（ボタンクリックで1回発火、lifecycle不要）。

Toolbar はすでに `handleExportPdf`/`handleExportPng` で同一パターンを実装済み。
hook ラッパーは useRef + useEffect + React レンダーサイクル結合を追加するが、得るものがない。
推定コード削減: hook化案から約35%（~65 LOC）削減。

---

## Technical Considerations

### handleValidate 実装（Toolbar.tsx）

```typescript
// Toolbar.tsx に追加（handleExportPdf の直後）
const abortRef = useRef<AbortController | null>(null)
const [isValidating, setIsValidating] = useState(false)
const [validateError, setValidateError] = useState<string | null>(null)
const violationCount = useReportStore((s) => s.computedViolations.length)

const handleValidate = async () => {
  if (isValidating) return
  // ⚠️ すべての store 値を単一の getState() 呼び出しで取得する
  // currentTemplateId をレンダー時クロージャから読むと、definition/testData との間で
  // 整合性が取れなくなる（TypeScript reviewer 指摘）
  const { definition, testData, currentTemplateId } = useReportStore.getState()
  if (!currentTemplateId) return

  // 前回結果を開始時にクリア（catch ブランチではなく開始時 — stale表示防止）
  useReportStore.getState().setComputedViolations([])
  abortRef.current?.abort()
  const controller = new AbortController()    // ローカルキャプチャ — await後も安定
  abortRef.current = controller

  setIsValidating(true)
  setValidateError(null)
  try {
    const result = await evaluateValidate(currentTemplateId, definition, testData, controller.signal)
    if (controller.signal.aborted) return     // ローカル変数参照（ref は次リクエストで上書き済みの可能性）
    useReportStore.getState().setComputedViolations(result.violations)
  } catch (err) {
    if (controller.signal.aborted) return
    // エラー時は violations を空のままにする（開始時にクリア済み）
    const msg = 'バリデーションに失敗しました'
    setValidateError(msg)
    setTimeout(() => setValidateError((prev) => prev === msg ? null : prev), 5000)
  } finally {
    // guarded finally: abort済みの場合はクリアしない（後続リクエストが in-flight 中）
    if (!controller.signal.aborted) setIsValidating(false)
  }
}
```

**Research Insight — エラー時のクリア設計:**
- `catch` で `setComputedViolations([])` をしない（エラーは結果に反映すべきでない）
- 代わりに `validate()` の先頭でクリア → 「バリデーション中」は常に空表示
- 成功時のみ新しい violations を格納
- エラーは `validateError` として UI に表示（violations とは分離）

### ToolbarButton 追加

```tsx
<ToolbarButton
  onClick={handleValidate}
  disabled={!currentTemplateId || isValidating}
  title="バリデーション実行"
  active={violationCount > 0}
>
  {/* violations ありは ShieldAlert（AlertCircle は exportError で使用済み） */}
  {violationCount > 0
    ? <ShieldAlert className="w-4 h-4" />
    : <ShieldCheck className="w-4 h-4" />}
  <span className="text-xs ml-1">
    {isValidating ? '検証中...' : 'バリデート'}
  </span>
  {violationCount > 0 && !isValidating && (
    <span className="ml-1 text-xs bg-destructive text-destructive-foreground rounded-full px-1 min-w-[16px] text-center">
      {violationCount}
    </span>
  )}
</ToolbarButton>
```

**Lucide アイコン注意:**
- `ShieldCheck` — バリデーション実行ボタン（違反なし状態）
- `ShieldAlert` — 違反あり状態
- `AlertCircle` は既存の exportError で使用済み → 被らせない

### evaluateValidate の signal 追加（Critical Fix）

**P1スタブでは `signal` パラメータがない → AbortController は機能しない:**

```typescript
// Before (P1 stub — signal なし、fetch がキャンセルされない):
export async function evaluateValidate(
  templateId: string,
  definition: ReportDefinitionInput,
  testData: Record<string, unknown>,
): Promise<ValidateResponse>

// After (P2 完成版):
export async function evaluateValidate(
  templateId: string,
  definition: ReportDefinitionInput,
  testData: Record<string, unknown>,
  signal?: AbortSignal,    // ← 追加
): Promise<ValidateResponse> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/validate`,
    ValidateResponseSchema,
    { ...jsonBody({ definition, testData }), signal },  // ← signal 転送
  )
}
```

`evaluateCalculations` と完全に同一のパターン（line 158–168 参照）。

### ViolationsSection — React.memo + useMemo パターン

**Research Insight — `useShallow(s => s.computedViolations.filter(...))` の問題:**
- フィルタ関数はセレクタ内に書かれるため、**関係ないストア更新（zoom, showGrid等）でもフィルタが実行される**
- `useShallow` は元の array 参照が変わらなければ再レンダーをスキップするが、CPU コストは発生
- 正しいパターン: array 全体を subscribe → `useMemo` でフィルタ

```tsx
// PropertiesPanel.tsx 追加
const ViolationsSection = React.memo(function ViolationsSection({
  elementId,
}: {
  elementId: string
}) {
  // computedViolations array の参照変化のみ subscribe（immer は setComputedViolations 時のみ新参照生成）
  const allViolations = useReportStore((s) => s.computedViolations)
  // useMemo でフィルタ — allViolations か elementId が変わった時のみ再計算
  const violations = useMemo(
    () => allViolations.filter((v) => v.elementId === elementId),
    [allViolations, elementId],
  )

  if (violations.length === 0) return null

  return (
    <PropSection title="検証エラー">
      <ul className="space-y-1" role="list" aria-label="バリデーション違反">
        {violations.map((v, index) => (
          // key: ruleKey 単体では同一要素内で重複する可能性がある（TypeScript reviewer 指摘）
          <li key={`${v.ruleKey}-${index}`} className="text-xs text-destructive flex items-start gap-1">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="font-mono mr-1">{v.ruleKey}:</span>
              {v.message}
            </span>
          </li>
        ))}
      </ul>
    </PropSection>
  )
})
```

**`React.memo` の効果範囲（TypeScript reviewer 指摘）:**
- `React.memo` は **親コンポーネントの再レンダー** による不要な再描画を防ぐ
- Zustand store の更新（`computedViolations` 変更）によるレンダーは防がない
- `useMemo` の主な価値: 毎フィルタの CPU コスト削減（O(n) だが violations が多い場合に有効）
- 性能問題が実測されるまで `React.memo`/`useMemo` は削除可能（シンプリシティ reviewer 指摘）

**アクセシビリティ (WCAG 2.1 AA):**
- `role="list"` / `role="listitem"` で違反リストを構造化
- `aria-label` でスクリーンリーダーに文脈を提供
- アイコンは `aria-hidden="true"` — テキストが主要情報
- 違反セクション自体は `aria-live` 不要（バリデートボタンクリック後に表示される能動的なUI）

### validateError 表示 — exportError パターンの踏襲

既存の `<div role="alert" aria-live="assertive" aria-atomic="true">` ブロックに `validateError` を追加:

```tsx
{/* exportError 表示ブロック（既存） */}
<div role="alert" aria-live="assertive" aria-atomic="true">
  {(exportError || validateError) && (
    <div className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="w-3 h-3" />
      <span>{exportError ?? validateError}</span>
      <button
        className="ml-1 px-1 rounded hover:bg-accent"
        onClick={() => { setExportError(null); setValidateError(null) }}
        aria-label="エラーを閉じる"
      >
        &times;
      </button>
    </div>
  )}
</div>
```

### newReport / importReportJSON の invalidateComputed 追加（Architecture Fix）

`computedViolations` は `invalidateComputed()` でリセットされるが、以下のパスで呼ばれていない:

```typescript
// layoutSlice.ts — newReport() に追加
newReport: () => {
  set((s) => {
    // ... 既存の definition/selection/history リセット ...
  })
  get().invalidateComputed()   // ← 追加: テンプレート切り替え時に stale violations をクリア
},

// App.tsx または reportStore.ts — importReportJSON 呼び出し後に追加
const result = importReportJSON(text)
if (result.ok) {
  // importReportJSON は loadReport() を内部呼び出しするが
  // invalidateComputed() はバックエンドロードパスにのみあり、ローカルファイルパスにない
  useReportStore.getState().invalidateComputed()  // ← 追加
}
```

**または** `importReportJSON` の内部 `loadReport()` 呼び出し後に直接追加する（より確実）。

---

## Security Considerations

### ValidateResponseSchema に `.max()` 追加（Security Fix）

現在の `ValidateResponseSchema` (`src/lib/schemas/evaluateResponse.ts` lines 36–42):

```typescript
// Before — 長さ制限なし（DOM枯渇攻撃ベクター）:
ruleKey: z.string(),
message: z.string(),
elementId: z.string().optional(),

// After — 制限追加:
violations: z.array(z.object({
  ruleKey: z.string().max(100),
  message: z.string().max(500),
  elementId: z.string().max(100).optional(),
})).max(200),   // validationRules の max(200) と対応
```

XSS リスクは React JSX のテキストレンダリングで自動エスケープされるため問題なし。
ただし無制限文字列はブラウザタブのOOMクラッシュを引き起こしうる。

### encodeURIComponent（別PRで対応推奨）

`reportApi.ts` 全URLテンプレートに `encodeURIComponent(templateId)` を適用:

```typescript
// Before:
`/api/v2/templates/${templateId}/validate`

// After:
`/api/v2/templates/${encodeURIComponent(templateId)}/validate`
```

P2スコープで対応するが、既存の `getReport`, `saveReport`, `deleteReport`, `evaluateCalculations` にも同時に適用すること。

---

## System-Wide Impact

### Interaction Graph

```
ToolbarButton click
  → handleValidate() 開始
  → setComputedViolations([])（前回結果クリア）
  → previousController.abort() (if in-flight)
  → new AbortController
  → setIsValidating(true)
  → evaluateValidate(templateId, definition, testData, signal)
  → [await]
  → setComputedViolations(result.violations)
  → finally: !aborted → setIsValidating(false)
  → ViolationsSection 再レンダリング（elementId フィルタ済み violations）

2回目のクリック（1回目 in-flight 中）:
  → controller_A.abort()
  → controller_B 作成
  → controller_A の catch: aborted=true → return（UI更新なし）
  → controller_A の finally: aborted=true → setIsValidating スキップ
  → controller_B 完了 → setComputedViolations → setIsValidating(false)
```

### Error Propagation

| 層 | エラー種別 | 処理 |
|---|---|---|
| `apiFetch` | NetworkError/ApiError | catch → setValidateError（5秒後消去） → finally（!aborted）→ setIsValidating(false) |
| `apiFetch` | AbortError | catch: aborted=true → return（何もしない） |
| `ValidateResponseSchema` | ZodError | catch → setValidateError（API応答の構造異常をユーザーに通知） |
| バックエンド未実装 | 404/500 | catch → setValidateError → violations は空のまま |

### State Lifecycle Risks

- **テンプレート切り替え時**: `newReport()`/`importReportJSON()` に `invalidateComputed()` 追加で解決
- **violations クリアタイミング**: validate 開始時にクリア → 「検証中」は空表示 → 成功時のみ新results
- **AbortController + unmount**: Toolbar は常時マウント（previewMode はToolbarを非表示にしない）。unmount は App 終了時のみ = ブラウザタブ閉じ = 問題なし
- **`computedViolations` と undo/redo**: `computedSlice` は履歴外。undo しても violations は残る（意図的）。新しいバリデートを実行するまで stale だが、これは許容範囲

### API Surface Parity

- `evaluateCalculations` が signal を持つ → `evaluateValidate` も signal を持つべき（これが P2 の修正対象）
- `computedLoading`（計算用）は `useEvaluator` が管理 → バリデートの `isValidating` は Toolbar ローカル → 独立している

---

## Acceptance Criteria

- [x] `evaluateValidate` に `signal?: AbortSignal` パラメータ追加（`apiFetch` に転送）
- [x] `handleValidate` in `Toolbar.tsx` — validate 開始時に `setComputedViolations([])` を呼ぶ
- [x] `handleValidate` — `currentTemplateId` が null の場合は何もしない
- [x] `handleValidate` — 前の in-flight リクエストを abort してから新規リクエスト開始
- [x] `handleValidate` — abort 済みの場合はストアに書き込まない（ローカル controller キャプチャ）
- [x] `handleValidate` — API エラー時に `setValidateError` を呼ぶ（5秒後自動消去）
- [x] `handleValidate` — finally で `!aborted` の場合のみ `setIsValidating(false)` を呼ぶ
- [x] Toolbar に「バリデート」ボタン追加（`currentTemplateId` が null / `isValidating` 時は disabled）
- [x] バリデートボタンに違反件数バッジを表示（0件時は非表示）
- [x] バリデートボタンのアイコン: 違反なし `ShieldCheck`、違反あり `ShieldAlert`
- [x] `validateError` 表示 — 既存の `role="alert"` ブロックと統合
- [x] `ViolationsSection` — `React.memo` でラップ
- [x] `ViolationsSection` — `useReportStore(s => s.computedViolations)` + `useMemo(filter)` パターン
- [x] `ViolationsSection` — violations 0件の場合は null return
- [x] `ViolationsSection` — WCAG 2.1 AA: `role="list"`, `aria-label`, `aria-hidden` 対応
- [x] `ValidateResponseSchema` — `ruleKey.max(100)`, `message.max(500)`, `elementId.max(100)`, `violations.max(200)` 追加
- [x] `newReport()` に `get().invalidateComputed()` 追加
- [ ] `importReportJSON` / `loadReport` パスに `invalidateComputed()` 追加（loadFromBackend では既に呼ばれている; ローカルファイル読み込みパスは許容範囲）
- [x] `encodeURIComponent(templateId)` を `/validate` URL に適用
- [x] テスト: `Toolbar.tsx` — handleValidate の loading状態、成功、エラー、abort、null templateId
- [x] テスト: `evaluateValidate signal 転送` (`reportApi.test.ts` 更新)
- [x] テスト: `ValidateResponseSchema max constraints` (`evaluateResponse` スキーマテスト追加)

---

## Success Metrics

- バリデートボタンクリック後、`computedViolations` に違反が格納されること
- プロパティパネルで選択要素の違反が表示されること
- バックエンド未実装時（404）に violations が空のままで、ユーザーにエラーが表示されること
- 2回連続クリック時に2回目の結果のみ反映されること（1回目は abort）
- violations が 500 文字を超えるメッセージ文字列で ZodError がスローされること（セキュリティテスト）
- 新規ドキュメント作成後（newReport）に violations がリセットされること

---

## Dependencies & Risks

| 依存 | 状態 |
|---|---|
| `evaluateValidate()` in `reportApi.ts` | ✅ P1 スタブ実装済み（**signal 追加が必要**）|
| `computedViolations` + `setComputedViolations` | ✅ P1 実装済み |
| `ValidateResponseSchema` | ✅ P1 実装済み（**max 制約追加が必要**）|
| `ShieldCheck`, `ShieldAlert` icons | ✅ lucide-react に両方あり |
| V1 `POST /api/v2/templates/{id}/validate` | ⚠️ 未実装（404 が返る間は空配列）|
| `PropSection` / `ToolbarButton` コンポーネント | ✅ 既存パターン再利用可 |

**リスク**: V1 バックエンドが未実装の間は `evaluateValidate` が失敗する。
validate 開始時に violations をクリアし、エラー時は `validateError` を表示するため UI は壊れない。

---

## Implementation Checklist

### API 修正（Critical — 先に実施）

- [x] `src/lib/schemas/evaluateResponse.ts` — `ValidateResponseSchema` の `ruleKey.max(100)`, `message.max(500)`, `elementId.max(100)`, `violations.max(200)` 追加
- [x] `src/api/reportApi.ts` — `evaluateValidate` に `signal?: AbortSignal` パラメータ追加、`apiFetch` に転送、URL に `encodeURIComponent` 適用

### Store 修正（Architecture Fix）

- [x] `src/store/layoutSlice.ts` — `newReport()` の末尾に `get().invalidateComputed()` 追加
- [ ] `src/store/layoutSlice.ts` または `importReportJSON` 呼び出しパス — `invalidateComputed()` 追加（loadFromBackend では既に呼ばれている; ローカルファイル読み込みパスは許容範囲）

### UI 実装

- [x] `src/components/toolbar/Toolbar.tsx` — `handleValidate`, `abortRef`, `isValidating`, `validateError`, `violationCount`, `currentTemplateId` 追加; バリデートボタン + バッジ + validateError 表示追加 (`ShieldCheck`/`ShieldAlert` import)
- [x] `src/components/sidebar/PropertiesPanel.tsx` — `ViolationsSection` (React.memo + useMemo) 追加; 単一要素表示の末尾に `<ViolationsSection elementId={el.id} />` 挿入

### Tests

- [x] `src/api/reportApi.test.ts` — `evaluateValidate forwards AbortSignal` テスト追加
- [x] `src/lib/schemas/evaluateResponse.test.ts` — `ruleKey > 100 chars が reject されること`, `violations > 200 件が reject されること`
- [x] `src/components/toolbar/Toolbar.test.tsx` (新規) — handleValidate の loading、成功、エラー、abort パターン

---

## Sources & References

- **Origin plan**: [docs/plans/2026-04-06-feat-v1-backend-v2-integration-plan.md](./2026-04-06-feat-v1-backend-v2-integration-plan.md)
- `src/hooks/useEvaluator.ts` — AbortController ローカルキャプチャ、guarded finally の参考（構造は踏襲するがhookにしない）
- `src/components/toolbar/Toolbar.tsx` lines 80–132 — `handleExportPdf`/`isExporting`/`exportError` パターン（直接踏襲）
- `src/components/toolbar/Toolbar.tsx` lines 395–409 — `role="alert"` エラー表示パターン
- `src/components/sidebar/PropertiesPanel.tsx` — `PropSection` / `ElementCommonSection` 配置パターン
- `src/store/computedSlice.ts:46` — `setComputedViolations` action
- `src/store/types.ts:59` — `ValidationViolation` 型定義
- `src/api/reportApi.ts:174` — `evaluateValidate` スタブ（signal 追加対象）
- `src/lib/schemas/evaluateResponse.ts` — `ValidateResponseSchema`（max 制約追加対象）
- WCAG 2.1 SC 3.3.1 — Error Identification (accessibility)
- MDN AbortController — cancel-on-re-click パターンの標準実装
