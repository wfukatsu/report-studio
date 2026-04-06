# アーキテクチャ設計決定 ブレインストーム

**日付:** 2026-04-05  
**スコープ:** ストア分割 / 型システム / エクスポートパイプライン / 繰り返し要素レンダリング

---

## What We're Building

report-design-studio-v2 の Phase 1 実装に向けた、コアアーキテクチャの設計決定。  
現状は 739 行の単一 `reportStore.ts` と分散した型/ファクトリ/レンダラーを持つプロトタイプ状態。  
これを本格実装に向けて整理し、可読性・拡張性・undo 安全性を高める。

---

## Why This Approach

- **YAGNI 優先**: 過剰な抽象化を避け、実装コストと得られる保守性のバランスをとる
- **Zustand + immer**: 現行の技術スタック（Zustand v5 / immer）を継続採用
- **要素ファイル集約**: 新要素タイプ追加時の変更点を 1 ディレクトリに限定し、見落としを防ぐ

---

## Key Decisions

### 1. ストア分割 — 3 スライス構成

```
src/store/
  layoutSlice.ts    // pages, sections, elements
  rulesSlice.ts     // calculationRules, templateVariables
  uiSlice.ts        // selection, zoom, grid, clipboard, history (undo/redo)
  index.ts          // combine(...) → useStore
  selectors.ts      // クロススライスセレクター
```

```typescript
// store/index.ts
export const useStore = create<LayoutSlice & RulesSlice & UISlice>()(
  immer(
    combine(
      createLayoutSlice,
      createRulesSlice,
      createUISlice,
    )
  )
)
```

**セレクター移行:**
```typescript
// store/selectors.ts
export const selectActivePage = (s: StoreState) =>
  s.report.pages.find(p => p.id === s.activePageId) ?? null

export const selectSelectedElements = (s: StoreState) => {
  const page = selectActivePage(s)
  return page ? flattenPageElements(page).filter(e => s.selectedElementIds.includes(e.id)) : []
}
```

---

### 2. Undo/Redo — layout + rules をアトミックにスナップショット

`uiSlice` 内で `HistoryEntry` に layout と rules 両方を保持。  
スライスをまたいでも単一の `pushHistory()` 呼び出しで整合性を保つ。

```typescript
// uiSlice.ts
interface HistoryEntry {
  pages: Page[]
  calculationRules: CalculationRule[]
  templateVariables: TemplateVariable[]
}

// pushHistory は layoutSlice / rulesSlice が変更を加えた後に呼ぶ
pushHistory: () => set(draft => {
  const entry: HistoryEntry = {
    pages: JSON.parse(JSON.stringify(draft.report.pages)),
    calculationRules: JSON.parse(JSON.stringify(draft.report.calculationRules ?? [])),
    templateVariables: JSON.parse(JSON.stringify(draft.report.templateVariables ?? [])),
  }
  draft.history = draft.history.slice(0, draft.historyIndex + 1)
  draft.history.push(entry)
  if (draft.history.length > 50) draft.history.shift()
  else draft.historyIndex += 1
})
```

**スコープ外（意図的に undo 対象外）:**
- `dataSource` (実行時データ、テンプレートには含まれない)
- `previewMode`, `zoom`, `showGrid` などの UI 設定

---

### 3. 型システム — 要素ファイル集約パターン

新規要素タイプを追加するとき、変更点を 1 ディレクトリに限定する。

```
src/elements/
  _base/
    index.ts          // ElementBase, Position, Size, TextStyle 等の共通型
    allowedKeys.ts    // BASE_ALLOWED_KEYS (全型共通キー)
  text/
    index.ts          // TextElement 型定義 + TEXT_ALLOWED_KEYS
    factory.ts        // createTextElement()
    Renderer.tsx      // TextRenderer コンポーネント
    PropertiesPanel.tsx
  label/
    ...
  dataField/
    ...
  repeatingBand/
    index.ts          // RepeatingBandElement, RepeatingBandField, ...
    factory.ts        // createRepeatingBandElement()
    Renderer.tsx      // RepeatingBandRenderer (Phase 1: デザインプレビュー)
    PropertiesPanel.tsx
  repeatingList/
    ...
  (その他 14 型)
```

**ELEMENT_ALLOWED_KEYS の合成:**
```typescript
// store/uiSlice.ts (or store/filterPatch.ts)
import { TEXT_ALLOWED_KEYS } from '@/elements/text'
import { LABEL_ALLOWED_KEYS } from '@/elements/label'
// ...

export const ELEMENT_ALLOWED_KEYS: Record<ElementType, Set<string>> = {
  text: TEXT_ALLOWED_KEYS,
  label: LABEL_ALLOWED_KEYS,
  // ...
}
```

**新規要素タイプ追加手順 (CHECKLIST):**
1. `src/elements/{type}/` ディレクトリを作成
2. `index.ts` に型と `ALLOWED_KEYS` を定義
3. `factory.ts` にファクトリ関数を実装
4. `Renderer.tsx` にキャンバスレンダラーを実装
5. `PropertiesPanel.tsx` にプロパティパネルを実装
6. `src/types/index.ts` の `ElementType` union に追加
7. `store/uiSlice.ts` の `ELEMENT_ALLOWED_KEYS` に追加
8. `ElementPalette.tsx` にパレットアイテムを追加

---

### 4. エクスポートパイプライン

**優先順位: JSON > PDF > Print**

#### 4-a. JSON エクスポート (`$schema` + 現行 `Report` 型)

```typescript
// lib/exportUtils.ts
export interface ReportDefinition extends Report {
  $schema: 'report-definition/v1'
  exportedAt: string
}

export function exportToJSON(report: Report): string {
  const def: ReportDefinition = {
    $schema: 'report-definition/v1',
    exportedAt: new Date().toISOString(),
    ...JSON.parse(JSON.stringify(report)),
  }
  return JSON.stringify(def, null, 2)
}

export function importFromJSON(json: string): { ok: true; report: Report } | { ok: false; error: string } {
  try {
    const def = JSON.parse(json)
    // $schema バリデーション
    if (def.$schema !== 'report-definition/v1') {
      return { ok: false, error: '非対応のスキーマバージョンです' }
    }
    // 最低限の構造バリデーション
    if (!def.pages || !Array.isArray(def.pages)) {
      return { ok: false, error: 'pages フィールドが不正です' }
    }
    return { ok: true, report: def as Report }
  } catch (e) {
    return { ok: false, error: `JSON パースエラー: ${String(e)}` }
  }
}
```

**スキーマバージョン戦略:** v1 固定で開始。破壊的変更が生じたときに v2 を検討（YAGNI）。

#### 4-b. PDF エクスポート (html2canvas + jsPDF)

現行の `exportUtils.ts` を拡張。主要課題:

| 課題 | 対応方針 |
|------|---------|
| mm → pt 変換 | `mm * 2.8346` を定数化して一元管理 |
| SVG 要素 (shape/barcode) | html2canvas の SVG レンダリングを検証。問題があれば `foreignObject` で回避 |
| 複数ページ | `jsPDF.addPage()` で結合 |
| 繰り返し要素 (Phase 2 以降) | 実データバインド前はデザインプレビューをそのまま pdf 化 |

#### 4-c. Print (window.print)

CSS `@media print` による印刷ダイアログ。  
実装は最薄: キャンバスを `printable` クラスで囲み、非 UI 要素を `@media print { display: none }` にするだけ。

---

### 5. 繰り返し要素のレンダリングアーキテクチャ (Phase 2 設計方針)

Phase 1 ではデザインタイムプレビュー（フェードアウトモック行）のみ。  
Phase 2 の実データレンダリングに向けた設計制約を今から埋め込む:

```typescript
// lib/repeatRenderer.ts (Phase 2 新規作成)
export interface RepeatContext {
  /** バインドされた配列データ */
  records: Record<string, unknown>[]
  /** ページサイズ (mm) */
  pageHeight: number
  /** 残りページ高さ (mm) */
  remainingHeight: number
}

export interface SplitResult {
  /** 現ページに収まる行インデックス群 */
  currentPage: number[]
  /** 次ページに溢れた行インデックス群 */
  overflow: number[]
}

export function splitByPage(
  element: RepeatingBandElement,
  context: RepeatContext
): SplitResult {
  // Phase 2 で実装
  throw new Error('Not implemented')
}
```

**Phase 1 → Phase 2 境界の設計ポリシー:**
- `Renderer.tsx` はプロパティで `records?: unknown[]` を受け取るが、`undefined` のときはデザインプレビューを表示
- `records` が渡されたときのみ実データレンダリングに切り替え
- これにより Phase 1 / Phase 2 のコードを同一コンポーネント内で段階的に移行できる

---

## Open Questions

なし（すべて解決済み）

---

## Resolved Questions

| 質問 | 決定 | 理由 |
|------|------|------|
| dataSource の扱い | `Report` 型から分離し実行時専用の `ExecutionContext` で渡す | テンプレート定義と実行時データを混在させると JSON エクスポートが汚染される |
| Section 実装スコープ | Phase 1 で header/body/footer 本格実装 | RepeatingBand の splitByPage にも必要で、後回しにするとやり直しが大きい |
| calculationRules / templateVariables | `ReportDefinition` のトップレベルに既存 (`calculationRules`, `templateVariables`) — `settings` へのネストは不要 | `ReportDefinition` への完全移行で自然に解決 |
| ストアの型移行 | Phase 1 で `Report` (deprecated) → `ReportDefinition` に完全移行 | `@deprecated` タグが既についており、技術的負債を初期に清算する |
| ストア分割粒度 | 3 スライス (layout / rules / ui) | Zustand combine で合成しやすく、責務が明確 |
| Undo スコープ | layout + rules をアトミックにスナップショット | 計算式変更も undo できないと UX が壊れる |
| 型拡張プロセス | `src/elements/{type}/` に 4 ファイル集約 | 追加手順が 1 ディレクトリに完結し、見落としが起きにくい |
| ELEMENT_ALLOWED_KEYS | 各 `index.ts` でエクスポート、store で合成 | 型情報と許可キーを同じファイルで管理し、乖離を防ぐ |
| JSON 形式 | 現行 `Report` 型そのまま + `$schema` フィールド | 変換コストゼロで import/export の往復が保証される |
| エクスポート優先 | JSON > PDF > Print (PNG は優先度外) | JSON が最重要（バックアップ/移行）、PDF は印刷用途 |
| 繰り返し実データレンダリング | **Phase 1 に前倒し** (Live Preview のため) | sortBy/totals/maxItems まで Phase 1。splitByPage/groupBy は Phase 2 のまま |
| Live Preview 方式 | 別プレビューペイン (ツールバートグル) | 編集キャンバスとプレビューを同時に見られる。既存 previewMode と概念分離 |
| Live Preview データ入力 | バインドタブ内フィールドごとインライン入力 (配列は JSON textarea 展開) | 最も文脈に合ったUX |
| テストデータ永続化 | `DataSourceDefinition.fields` に保存 | JSON エクスポートにサンプルデータが含まれ、デバッグ情報として配布可能 |
| プレビュー更新タイミング | 300ms デバウンス | UX とパフォーマンスのバランス |
| Section 構成 | 3固定 (header/body/footer) | カスタム追加は YAGNI — 帳票は99%この構成で足りる |
| header/footer の共有 | `ReportDefinition.masterHeader/masterFooter` として全ページ共通 | 全ページ同一で管理コスト最小化 |
| Section リサイズ | ドラッグハンドル (pointer イベント) | CanvasElement のリサイズと同パターン、実装コスト低い |
| 要素座標系 | Section 相対座標 | 現行コードが既にこのモデル、変更不要 |

---

## 6. Live Preview アーキテクチャ

テンプレートにテストデータを注入し、バインドタブでフィールドを編集しながらリアルタイムで帳票を確認できる機能。

### 全体レイアウト

```
┌──────────────┬──────────────────────────┬──────────────────────────┐
│ 左パネル     │ 編集キャンバス            │ プレビューペイン          │
│ (バインド/   │ (デザインタイム表示)      │ (ライブデータ表示)        │
│  レイヤー)   │                           │ ← ツールバー[プレビュー]  │
│              │                           │    ボタンで ON/OFF        │
└──────────────┴──────────────────────────┴──────────────────────────┘
```

- プレビューペインはツールバーの **「プレビュー」トグルボタン** で表示/非表示を切り替え
- 既存の `previewMode`（読み取り専用モード）とは別の概念
- プレビューペインは `readonly=true` + 実データ注入で描画

### データ入力 UI

右パネルの **バインドタブ** にフィールドごとのテスト値入力欄を追加:

```
┌─────────────────────────────────────┐
│ バインド設定                         │
├──────────────┬──────────────────────┤
│ フィールドキー│ テスト値              │
├──────────────┼──────────────────────┤
│ customer.name│ [山田 太郎           ]│
│ invoice.total│ [123,456             ]│
│ items        │ [配列データ入力 ▼    ]│
└──────────────┴──────────────────────┘
```

- 単一値フィールド: テキスト入力で即座にプレビュー更新
- 配列フィールド (RepeatingBand / RepeatingList 用): JSON 配列入力エリアを展開

### テストデータの入力 UI 詳細

```
右パネル > バインドタブ
┌────────────────────────────────────────────┐
│ フィールドキー  │ テスト値                   │
├────────────────┼────────────────────────────┤
│ customer.name  │ [山田 太郎              ]   │  ← テキスト入力 (onChange → 300ms debounce)
│ invoice.total  │ [123456                 ]   │
│ items          │ [配列データを展開 ▼      ]   │  ← クリックで JSON textarea 展開
└────────────────┴────────────────────────────┘
  展開時 ↓
  [                                            ]
  [  [                                         ]
  [    {"name": "商品A", "qty": 2, ...},        ]
  [    ...                                     ]
  [  ]                                         ]
  [                                            ]
  構文エラー時はリアルタイムでエラー表示
```

### テストデータの永続化

テストデータは `DataSourceDefinition.fields` に保存（`DataSource.fields` の既存モデルを活用）。  
JSON エクスポートにサンプルデータが含まれるため、テンプレート配布時にデバッグ情報としても活用できる。

```typescript
// store/layoutSlice.ts
updateTestData: (dataSourceId: string, fields: Record<string, unknown>) =>
  set(draft => {
    const ds = draft.definition.dataSources.find(d => d.id === dataSourceId)
    if (ds) ds.fields = fields
  })
```

### ExecutionContext の設計

```typescript
// src/hooks/usePreview.ts
export function usePreviewData(): Record<string, unknown> {
  const dataSources = useStore(s => s.definition.dataSources)
  // 複数データソースをマージしてフラットな Record に変換
  return useMemo(() =>
    dataSources.reduce((acc, ds) => ({ ...acc, ...ds.fields }), {}),
    [dataSources]
  )
}

// src/components/canvas/PreviewPane.tsx
export function PreviewPane() {
  const definition = useStore(s => s.definition)
  const activePage = useStore(selectActivePage)
  const previewData = usePreviewData()

  return (
    <ReportCanvas
      page={activePage}
      data={previewData}   // ← 実テストデータ
      readonly={true}
    />
  )
}
```

### パフォーマンス設計

- テスト値の変更 → 300ms デバウンス → `updateTestData` アクション → プレビューキャンバス再レンダリング
- 配列データの JSON parse は debounce 後に実行（タイプ中の構文エラーで毎回 parse しない）
- プレビューペインは `React.memo` でラップし、`previewData` が変わらない限り再レンダリングしない

### 繰り返し要素のリアルタイムレンダリング (Phase 1 前倒し)

Live Preview 対応のため、Phase 2 に予定していた繰り返し要素の実データレンダリングを **Phase 1 に前倒し**。

```typescript
// src/elements/repeatingBand/Renderer.tsx
interface RepeatingBandRendererProps {
  element: RepeatingBandElement
  /** 実データ配列。undefined の場合はデザインプレビュー (フェードモック) を表示 */
  records?: Record<string, unknown>[]
}

export function RepeatingBandRenderer({ element, records }: RepeatingBandRendererProps) {
  if (!records) {
    return <RepeatingBandDesignPreview element={element} />  // 既存のフェードプレビュー
  }
  return <RepeatingBandLiveRenderer element={element} records={records} />
}
```

**Phase 1 対象 (今回前倒し):**
- 配列データを列定義に沿って行としてレンダリング
- sortBy / sortOrder の適用
- totals (sum/count/avg) の計算と表示
- maxItems による件数制限

**Phase 2 のまま維持:**
- `splitByPage` (ページまたぎ分割)
- `groupBy` (グループヘッダー/フッター行)
- カードテンプレートエディタ (RepeatingList)

---

## 7. Section 実装設計

### データモデル

```typescript
// 現行 Section 型 (src/types/index.ts:409) — 変更不要
export interface Section {
  id: string
  sectionType: 'header' | 'body' | 'footer' | 'custom'
  height: number        // mm (ドラッグリサイズで変更)
  elements: ReportElement[]  // 全要素の position は Section 相対座標
}

// ReportDefinition に masterHeader / masterFooter を追加
export interface ReportDefinition {
  ...
  masterHeader?: Section   // undefined = ヘッダーなし
  masterFooter?: Section   // undefined = フッターなし
  pages: PageDef[]
}
```

### ページ構成

```
Page
  ├─ Section (header)   ← masterHeader の内容と連動 (全ページ共通)
  ├─ Section (body)     ← ページ固有のコンテンツ
  └─ Section (footer)   ← masterFooter の内容と連動 (全ページ共通)
```

- 各 `PageDef.sections` は `[header, body, footer]` の 3 要素を必ず持つ
- header / footer の変更は `definition.masterHeader / masterFooter` を更新 → 全ページに伝播
- body のみ各ページ独立して編集可能

### SectionContainer UI

```typescript
// src/components/canvas/SectionContainer.tsx
interface SectionContainerProps {
  section: Section
  pageId: string
  /** body以外は readonly で編集不可 (header/footer はマスター経由で編集) */
  editable?: boolean
}
```

**ドラッグリサイズ:**
- Section 下端に `cursor: row-resize` のリサイズハンドル帯（高さ 4px）
- `pointerdown` → `pointermove` でドラッグ量 (dy) を mm 換算して `section.height` を更新
- 最小高さ制約: 10mm
- 既存 `CanvasElement` のリサイズと同じ pointer イベントパターン

**キャンバス上の表示:**
```
┌────────────────────────────────────────────┐
│ [HEADER]  高さ: 30mm                        │  ← 薄いグレー背景
│  Logo  ・ タイトル                          │
│──────────────────────── ← リサイズハンドル ─│
│ [BODY]   高さ: 220mm                        │
│  (編集可能エリア)                           │
│──────────────────────── ← リサイズハンドル ─│
│ [FOOTER]  高さ: 15mm                        │  ← 薄いグレー背景
│  ページ番号  ・  日付                       │
└────────────────────────────────────────────┘
```

- header / footer のラベル表示 (`[HEADER]`) はデザインタイムのみ（プレビュー/PDF では非表示）
- header / footer をクリックしたとき「マスターヘッダーを編集」通知または マスター編集モードに遷移

---

## ReportDefinition 移行時のデータモデル変化

```
Before (Report — deprecated):
  report.dataSource: DataSource | null  ← 実値を保持
  report.settings: ReportSettings       ← calculationRules なし

After (ReportDefinition):
  definition.dataSources[].fields       ← サンプルデータ（デザインタイム用）
  definition.calculationRules[]         ← テンプレートと一体
  definition.templateVariables[]
  ← 本番実行時は別途 ExecutionContext からデータ注入 (Phase 2)
```

**`DataSourceDefinition` と実行時の分離ポリシー:**
- `DataSourceDefinition.fields` にはデザインタイム表示用のサンプルデータを保存
- 実行時の本番データは store 外で管理（`useExecutionContext` hook 等）
- この分離により JSON エクスポートは「テンプレート定義のみ」として意味が明確になる

---

## 次のステップ

`/workflows:plan` でこのドキュメントをもとに実装計画を作成する。  
推奨実装順序:

1. `src/types/index.ts` — `Report` → `ReportDefinition` へのストア型移行
2. `src/store/` — 3 スライス分割 (layout / rules / ui) + history スコープ拡大
3. `src/elements/{type}/` — 14 型のファイル集約リファクタリング
4. `src/components/canvas/SectionContainer.tsx` — header/body/footer セクション実装
5. **繰り返し要素実データレンダリング** — RepeatingBandLiveRenderer / RepeatingListLiveRenderer (Phase 1 前倒し)
6. **Live Preview** — バインドタブインライン入力 + プレビューペイントグル
7. `src/lib/exportUtils.ts` — JSON エクスポート完全実装 + PDF/Print 整備
