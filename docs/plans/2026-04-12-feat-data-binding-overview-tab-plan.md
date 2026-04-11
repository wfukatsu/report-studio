---
title: "feat: データバインディング見通しタブの追加"
type: feat
status: completed
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-data-binding-overview-tab-brainstorm.md
---

# feat: データバインディング見通しタブの追加

## Overview

左サイドバーに **「データ」タブ** を追加し、レポート内のデータバインディング状況（未バインド要素・フィールドマッピング・エラー）を一覧できるパネルを実装する。

現状は要素ごとにプロパティパネルを開かないとバインディング設定が把握できない。新しいタブで全要素のバインディング状況をスキャンし、クリックで即座に対象要素へジャンプできるようにする。

---

## Problem Statement / Motivation

- 要素数が増えると「どの要素がデータ未設定か」を把握するのに、1つずつプロパティパネルを開く必要がある
- 「あるフィールドがレポートのどこで使われているか」を追うことができない
- DataSource に存在しないフィールドキーを参照してもエラー表示がなく、プレビューを開くまで気づかない

(see brainstorm: docs/brainstorms/2026-04-12-data-binding-overview-tab-brainstorm.md)

---

## Proposed Solution

### 新規ファイル

| ファイル | 役割 |
|----------|------|
| `src/hooks/useBindingAnalysis.ts` | バインディング状態を全要素分析するカスタムフック |
| `src/components/sidebar/DataBindingOverviewPanel.tsx` | データタブのメインUI |
| `src/hooks/useBindingAnalysis.test.ts` | フック単体テスト |
| `src/components/sidebar/DataBindingOverviewPanel.test.tsx` | コンポーネントテスト |

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/App.tsx` | `LeftTab` 型と `LEFT_TABS` に `'data'` を追加、タブパネル条件分岐を追加 |
| `src/lib/dataBinding.ts` | `fieldExists()` ヘルパーを追加（空文字との誤判定回避） |

---

## Technical Considerations

### 1. `fieldExists()` ヘルパーの必要性

既存の `resolveField(data, fieldKey)` はフィールドが存在しない場合に `''` を返すが、フィールドの値が空文字の場合も同じ `''` を返す。エラー判定には false negative が発生するため、専用の存在確認関数を追加する。

```ts
// src/lib/dataBinding.ts に追加
export function fieldExists(
  data: Record<string, unknown>,
  fieldKey: string
): boolean {
  const parts = fieldKey.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return false
    if (current == null || typeof current !== 'object') return false
    if (!Object.prototype.hasOwnProperty.call(current, part)) return false
    current = (current as Record<string, unknown>)[part]
  }
  return true
}
```

### 2. バインド対象要素の判定ロジック

```ts
// 未バインドの定義（see brainstorm: 未バインドの定義）
// text 要素: {{}} トークンが1つもない
type === 'text': !/\{\{[^}]+\}\}/.test(element.content ?? '')

// dataField 系: fieldKey が空/未設定
type in ['dataField', 'checkbox', 'eraSelect', 'manualEntry']: !element.fieldKey?.trim()

// formTable セル: type='dataField' のセルで fieldKey 未設定
type === 'formTable': element.rows.flat().filter(c => c.type === 'dataField' && !c.fieldKey)

// エラー要素: fieldKey があるが DataSource に存在しない
fieldKey && dataSource && !fieldExists(dataSource.fields as Record<string, unknown>, fieldKey)
```

### 3. `useBindingAnalysis` フックの設計

```ts
// src/hooks/useBindingAnalysis.ts

interface ElementBinding {
  elementId: string
  elementLabel: string   // label > name > type のフォールバック
  pageId: string
  fieldKey?: string
}

interface BindingAnalysis {
  hasDataSource: boolean
  unboundElements: ElementBinding[]    // 未バインド（fieldKey未設定 or {{}}なし）
  fieldMappings: ElementBinding[]      // バインド済み: fieldKey → 要素名 の対応
  errorElements: ElementBinding[]      // バインド済みだが fieldKey が DataSource に存在しない
}

export function useBindingAnalysis(): BindingAnalysis
```

- `useReportStore(s => s.definition.pages)` と `useReportStore(s => s.definition.dataSources)` を購読
- `useMemo` でメモ化（pages/dataSources が変わった時のみ再計算）
- 全ページ走査: `pages.flatMap(flattenPageElements)` (`src/store/selectors.ts:flattenPageElements`)
- ページIDのルックアップ: 要素IDから逆引きするために `Map<elementId, pageId>` を構築

### 4. `DataBindingOverviewPanel` の UI 構成

```
DataBindingOverviewPanel
├── [DataSource未設定時] EmptyState → "データソースが未設定です" + DataSourcePanel へスクロール
├── DataSourceSection（DataSourcePanel を折りたたみで包む）
├── BindingSection（BindingPanel を折りたたみで包む — フィールド値編集）
├── UnboundSection（unboundElements.length > 0 の時のみ表示）
│   └── ElementRow × n → onClick: selectElement + setActivePage
├── MappingSection（fieldMappings のリスト）
│   └── MappingRow × n: "fieldKey → 要素名" （クリックで要素選択）
└── ErrorSection（errorElements.length > 0 の時のみ表示）
    └── ElementRow × n → onClick: selectElement + setActivePage
```

### 5. 要素選択の実装

```ts
// ページを切り替えてから要素を選択する
const selectElement = useReportStore(s => s.selectElement)
const setActivePage = useReportStore(s => s.setActivePage)

const handleElementClick = (elementId: string, pageId: string) => {
  setActivePage(pageId)        // src/store/layoutSlice.ts:136
  selectElement(elementId)     // src/store/layoutSlice.ts:433
}
```

---

## System-Wide Impact

- **状態読み取り専用**: `useBindingAnalysis` は store を読み取るだけで書き込まない。副作用なし。
- **既存コンポーネントの再利用**: `DataSourcePanel`・`BindingPanel` はそのまま利用。変更なし。
- **`src/App.tsx` への影響**: `LeftTab` 型と `LEFT_TABS` の変更のみ。既存タブに影響なし。
- **パフォーマンス**: `useMemo` でメモ化するため、タブ切り替え時の再計算コストは無視できる。

---

## Acceptance Criteria

- [ ] 左サイドバーに「データ」タブが表示され、クリックで切り替えできる
- [ ] DataSource 未設定時に空状態メッセージが表示される
- [ ] DataSource 設定済みの場合、3 セクションが表示される
- [ ] 「未バインド要素」セクション: `fieldKey` 未設定の dataField 系要素と `{{}}` トークンのない text 要素が列挙される
- [ ] 「フィールドマッピング」セクション: `fieldKey → 要素名` の対応が全ページ分表示される
- [ ] 「バインディングエラー」セクション: DataSource に存在しない fieldKey を参照する要素が列挙される
- [ ] 未バインド・エラーの件数が 0 の時、そのセクションは非表示になる
- [ ] 各行クリックで対象要素が選択され、対象ページに切り替わる
- [ ] `fieldExists()` 関数: 空文字値のフィールドを正しく「存在する」と判定する
- [ ] テストカバレッジ 80% 以上

---

## Success Metrics

- 未バインド要素・エラーが 0 件の時、タブの見た目がクリーン（セクション非表示）
- 10 ページ・100 要素規模のレポートでパネル切り替えが体感的に遅延なし

---

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| `text` 要素の未バインド判定がノイズになる（固定ラベルも警告される） | 初期実装では仕様通り含める。UX 検証後に除外フラグを検討 |
| `formTable` セルの走査でパフォーマンス劣化 | `useMemo` + `flatMap` で一括処理 |
| `resolveField` の `''` 返却との混同 | `fieldExists()` を追加することで解決済み |

---

## Implementation Checklist

### Step 1: `fieldExists` 追加 + テスト

- [x] `src/lib/dataBinding.ts` に `fieldExists(data, fieldKey): boolean` を追加
- [x] `src/lib/dataBinding.test.ts` に `fieldExists` のテストケースを追加
  - 存在するフィールド（文字列・数値・空文字・null）
  - 存在しないフィールド
  - ネスト（`customer.name`）
  - prototype pollution 防御

### Step 2: `useBindingAnalysis` フック + テスト（TDD）

- [x] `src/hooks/useBindingAnalysis.test.ts` を先に作成（RED）
  - DataSource なし → `hasDataSource: false`
  - 全バインド済み → `unboundElements: []`
  - fieldKey なし要素 → `unboundElements` に含まれる
  - 存在しない fieldKey → `errorElements` に含まれる
  - text 要素で `{{}}` なし → `unboundElements` に含まれる
  - text 要素で `{{}}` あり → `fieldMappings` に含まれる
- [x] `src/hooks/useBindingAnalysis.ts` を実装（GREEN）

### Step 3: `DataBindingOverviewPanel` コンポーネント + テスト（TDD）

- [x] `src/components/sidebar/DataBindingOverviewPanel.test.tsx` を先に作成（RED）
  - DataSource なし時の空状態メッセージ
  - 未バインドセクションの表示/非表示
  - エラーセクションの表示/非表示
  - 行クリックで `selectElement`・`setActivePage` が呼ばれる
- [x] `src/components/sidebar/DataBindingOverviewPanel.tsx` を実装（GREEN）

### Step 4: `App.tsx` にタブを追加

- [x] `LeftTab` 型に `'data'` を追加（`src/App.tsx:22`）
- [x] `LEFT_TABS` に `{ id: 'data', label: 'データ' }` を追加（`src/App.tsx:31`）
- [x] タブパネル条件分岐に追加（`src/App.tsx:316-320`付近）

### Step 5: 動作確認

- [x] `npm run dev` で起動し、「データ」タブの表示を確認
- [x] DataSource を設定し、3 セクションが正しく動作することを確認
- [x] 行クリックで要素選択・ページ切り替えが機能することを確認

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-12-data-binding-overview-tab-brainstorm.md](../brainstorms/2026-04-12-data-binding-overview-tab-brainstorm.md)
  - 決定事項: 左サイドバーへのタブ追加、シンプルリスト形式、3セクション構成
  - 未バインドの定義: text要素（{{}}なし）と dataField系（fieldKey未設定）の両方
  - DataSource未設定時: 空状態メッセージ表示

### Internal References

- 左サイドバータブ構造: `src/App.tsx:22-31`
- 全要素走査: `src/store/selectors.ts:16-21` (`flattenPageElements`)
- バインド対象型定義: `src/types/index.ts` (`DataFieldElement`, `TextElement`, `FormTableElement`)
- DataSource 型: `src/types/index.ts` (`DataSourceDefinition`)
- フィールド解決: `src/lib/dataBinding.ts` (`resolveField`, `interpolate`)
- 要素選択 action: `src/store/layoutSlice.ts:433` (`selectElement`)
- ページ切り替え action: `src/store/layoutSlice.ts:136` (`setActivePage`)
- 既存コンポーネント再利用: `src/components/sidebar/BindingPanel.tsx`, `src/components/sidebar/DataSourcePanel.tsx`
- v1 UI 参照: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/organisms/BindingMapper/BindingMapper.tsx`
