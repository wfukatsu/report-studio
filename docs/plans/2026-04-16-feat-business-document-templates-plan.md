---
title: "feat: 見積書・注文書・請求書ビルトインテンプレート（モダンデザイン）"
type: feat
status: completed
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-business-document-templates-brainstorm.md
---

# feat: 見積書・注文書・請求書ビルトインテンプレート（モダンデザイン）

## Overview

モダン・クリーンデザインで統一された3種類のビルトインテンプレート（見積書・注文書・請求書）を新規作成する。全テンプレートがインボイス制度（適格請求書）に対応し、SchemaDefinition + サンプルデータを持つ。

## Problem Statement / Motivation

- 既存テンプレートは見積書のみ4種（#2c3e50ダークヘッダー）で、注文書・請求書がない
- 商取引の一連の流れ（見積→注文→請求）をカバーするテンプレートセットが必要
- 既存テンプレートにはSchemaDefinitionがない（scalarQuotation除く）ため、データバインディング活用の参考にならない

## Proposed Solution

`src/templates/` に3ファイルを新規作成し、`builtinTemplates.ts` に登録する。各テンプレートは独立したSchemaDefinition + DataSourceDefinition（サンプルデータ）を持ち、テンプレート選択直後からプレビュー可能とする。

### Design Decisions (from brainstorm)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| スコープ | 3テンプレート新規、既存維持 | 別デザインセットとして共存 |
| デザイン | モダン・クリーン | 余白活用、#f5f5f5ヘッダー、#3b82f6アクセント |
| インボイス | 全テンプレート対応 | 登録番号・税率別内訳 |
| 明細カラム | 6列（品番・品名・数量・単位・単価・金額） | 幅: 28+72+18+14+28+30=190mm |
| スキーマ | 各テンプレート独立 | テンプレート間データ連携は想定外 |
| 自社情報 | テナント要素 | tenantCompanyName等で自動反映 |

(see brainstorm: docs/brainstorms/2026-04-16-business-document-templates-brainstorm.md)

### SpecFlow Gap Resolutions

リサーチで発見されたギャップへの対応方針:

| Gap | Resolution |
|-----|-----------|
| CONTENT_W 190mm vs 既存192mm | マージン左右10mmで CONTENT_W=190mm。ブレインストームで決定済み |
| 登録番号の配置 | `dataField`（文書ごとに異なり得る）。テナント要素ではなくスキーマフィールド |
| 請求書の振込先口座 | スキーマの「振込先」マスターグループの`dataField`で構成 |
| maxItems超過時 | `maxItems: 10`, `showEmptyRowLines: true`。単一ページ。超過時は明細が途切れるがv1では許容 |
| 税額計算 | データソースからの事前計算値。JEXL computed fieldは使わない（バックエンドが計算責務を持つ）。`amount` 含む全集計値はデータ側で計算済み |
| 条件欄 | `dataField`（スキーマバインド）。`manualEntry`は使わない |
| 備考欄 | `dataField`（`fieldKey: 'document.notes'`）。スキーマの文書情報グループに `notes` (string) フィールドを追加 |
| アクセントカラー適用箇所 | タイトル下の水平線のみ `#3b82f6`。テーブルヘッダーは `#f5f5f5` グレー |
| 印鑑 | モダンデザインのため不要 |
| サンプルデータ | 全テンプレートに `dataSources` を含める |

## Technical Approach

### ファイル構成

```
src/templates/
├── quotationModernTemplate.ts    ← 新規: 見積書（モダン）
├── purchaseOrderTemplate.ts      ← 新規: 注文書
├── invoiceTemplate.ts            ← 新規: 請求書
├── businessTemplateHelpers.ts    ← 新規: 共通ヘルパー
├── builtinTemplates.ts           ← 変更: 3テンプレート追加
├── quotationTemplate.ts          (既存: 変更なし)
├── quotationDiscountTemplate.ts  (既存: 変更なし)
├── quotationEnglishTemplate.ts   (既存: 変更なし)
├── scalarQuotationTemplate.ts    (既存: 変更なし)
└── ...
```

### 共通ヘルパーモジュール (`businessTemplateHelpers.ts`)

3テンプレートで重複するヘルパー関数を共通化:

```ts
// businessTemplateHelpers.ts

// ─── 寸法定数 ─────────────────────────────────────────────
export const A4_W = 210
export const A4_H = 297
export const ML = 10   // 左マージン
export const MT = 10   // 上マージン
export const MR = 10   // 右マージン
export const MB = 10   // 下マージン
export const CONTENT_W = A4_W - ML - MR  // 190mm

// テーブル
export const TABLE_ROW_H = 7    // mm per row
export const TABLE_HDR_H = 7    // header row height
export const TABLE_ROWS = 10    // 明細行数

// 6カラム幅（合計 = CONTENT_W = 190mm）
export const COL_CODE_W = 28
export const COL_NAME_W = 72
export const COL_QTY_W = 18
export const COL_UNIT_W = 14
export const COL_PRICE_W = 28
export const COL_AMOUNT_W = 30
// 28+72+18+14+28+30 = 190 ✓

// カラーパレット
export const COLORS = {
  accent: '#3b82f6',
  headerBg: '#f5f5f5',
  headerText: '#333333',
  oddRow: '#ffffff',
  evenRow: '#fafafa',
  border: '#e0e0e0',
  totalBoxBg: '#f0f7ff',
  text: '#1a1a1a',
  label: '#666666',
} as const

// フォントサイズ (mm)
export const FONT = {
  title: 7,
  section: 4,
  body: 3,
  table: 2.8,
  small: 2.5,
} as const

// ─── ヘルパー関数 ───────────────────────────────────────────
export function lbl(text, x, y, w, h, style?) → ReportElement  // type: 'text'
export function df(fieldKey, x, y, w, h, style?, format?, placeholder?) → ReportElement  // type: 'dataField'
export function rect(x, y, w, h, opts?) → ReportElement  // type: 'shape', shape: 'rectangle'
export function hline(x, y, w, opts?) → ReportElement  // type: 'shape', shape: 'line'
export function vline(x, y, h) → ReportElement  // type: 'shape', shape: 'line' vertical
```

パターン参考: `quotationTemplate.ts:103-237` の既存ヘルパー関数群

**`fieldKey` 命名規則:** `dataField` の `fieldKey` はスキーマの `dataKey.fieldKey` のドット記法で解決される。例: `df('document.issueDate', ...)`, `df('customer.customerName', ...)`, `df('summary.totalIncTax', ...)`

### テンプレートID・カテゴリ

| テンプレート | id | name | description | category | tags |
|-------------|------|------|-------------|----------|------|
| 見積書（モダン） | `quotation-modern` | `御見積書` | `モダンデザイン・インボイス対応` | `business` | `['modern', 'invoice']` |
| 注文書 | `purchase-order-modern` | `御注文書` | `モダンデザイン・インボイス対応` | `business` | `['modern', 'invoice']` |
| 請求書 | `invoice-modern` | `御請求書` | `モダンデザイン・インボイス対応` | `business` | `['modern', 'invoice']` |

### 共通レイアウト座標（Y座標マップ）

```
Y=10   タイトル（左）+ テナントロゴ（右上）
Y=18   アクセント線 + tenantCompanyName
Y=22   tenantAddress
Y=26   文書番号 + tenantPhone
Y=31   発行日
Y=36   登録番号
Y=44   宛先（顧客名 + 御中）
Y=49   顧客郵便番号・住所
Y=54   ご担当
Y=62   合計金額ボックス（shape角丸 + dataField）
Y=72   明細テーブルヘッダー（repeatingBand, showHeader: true）
Y=79   明細データ行（10行 × 7mm = 70mm）
Y=149  集計エリア（右寄せ dataField × 6行）
Y=195  備考 / テンプレート固有セクション
```

### スキーマ定義

#### 見積書 (`quotation-modern`)

**スキーマID命名規則:** テンプレート間のID衝突を避けるため、`{prefix}-{group}-{field}` 形式を使用。見積書=`qm-`, 注文書=`po-`, 請求書=`inv-`。

```ts
schema: {
  groups: [
    {
      id: 'qm-grp-doc', label: '見積情報', role: 'master', dataKey: 'document',
      fields: [
        { id: 'qm-f-doc-no', key: 'documentNo', label: '見積番号', type: 'string' },
        { id: 'qm-f-issue-date', key: 'issueDate', label: '発行日', type: 'date' },
        { id: 'qm-f-reg-no', key: 'registrationNo', label: '登録番号', type: 'string' },
        { id: 'qm-f-valid-until', key: 'validUntil', label: '有効期限', type: 'date' },
        { id: 'qm-f-delivery-terms', key: 'deliveryTerms', label: '納品条件', type: 'string' },
        { id: 'qm-f-payment-terms', key: 'paymentTerms', label: '支払条件', type: 'string' },
        { id: 'qm-f-notes', key: 'notes', label: '備考', type: 'string' },
      ],
    },
    {
      id: 'qm-grp-customer', label: '顧客情報', role: 'master', dataKey: 'customer',
      fields: [
        { id: 'qm-f-cust-name', key: 'customerName', label: '顧客名', type: 'string' },
        { id: 'qm-f-postal', key: 'postalCode', label: '郵便番号', type: 'string' },
        { id: 'qm-f-address', key: 'address', label: '住所', type: 'string' },
        { id: 'qm-f-contact', key: 'contactPerson', label: '担当者', type: 'string' },
      ],
    },
    {
      id: 'qm-grp-items', label: '明細', role: 'detail', dataKey: 'items',
      fields: [
        { id: 'qm-f-code', key: 'itemCode', label: '品番', type: 'string' },
        { id: 'qm-f-name', key: 'itemName', label: '品名', type: 'string' },
        { id: 'qm-f-qty', key: 'quantity', label: '数量', type: 'number' },
        { id: 'qm-f-unit', key: 'unit', label: '単位', type: 'string' },
        { id: 'qm-f-price', key: 'unitPrice', label: '単価', type: 'number' },
        { id: 'qm-f-amount', key: 'amount', label: '金額', type: 'number' },  // バックエンドで事前計算
      ],
    },
    {
      id: 'qm-grp-summary', label: '集計情報', role: 'master', dataKey: 'summary',
      fields: [
        { id: 'qm-f-subtotal', key: 'subtotal', label: '小計', type: 'number' },
        { id: 'qm-f-tax10-base', key: 'tax10Base', label: '10%対象', type: 'number' },
        { id: 'qm-f-tax10-amt', key: 'tax10Amount', label: '消費税(10%)', type: 'number' },
        { id: 'qm-f-tax8-base', key: 'tax8Base', label: '8%対象', type: 'number' },
        { id: 'qm-f-tax8-amt', key: 'tax8Amount', label: '消費税(8%)', type: 'number' },
        { id: 'qm-f-total', key: 'totalIncTax', label: '合計(税込)', type: 'number' },
      ],
    },
  ],
}
```

#### 注文書 (`purchase-order-modern`)

上記 + `grp-doc` フィールド変更（`validUntil` → なし、`deliveryTerms`/`paymentTerms` → `paymentTerms`のみ）+ 追加グループ:

```ts
{
  id: 'po-grp-delivery', label: '納品情報', role: 'master', dataKey: 'delivery',
  fields: [
    { id: 'po-f-del-date', key: 'deliveryDate', label: '納期', type: 'date' },
    { id: 'po-f-del-addr', key: 'deliveryAddress', label: '納品先住所', type: 'string' },
    { id: 'po-f-del-contact', key: 'deliveryContact', label: '納品先担当者', type: 'string' },
  ],
}
```

#### 請求書 (`invoice-modern`)

上記 + `grp-doc` フィールド変更（`validUntil`/`deliveryTerms` → なし）+ 追加グループ:

```ts
{
  id: 'inv-grp-bank', label: '振込先', role: 'master', dataKey: 'bankAccount',
  fields: [
    { id: 'inv-f-bank-name', key: 'bankName', label: '銀行名', type: 'string' },
    { id: 'inv-f-branch', key: 'branchName', label: '支店名', type: 'string' },
    { id: 'inv-f-acc-type', key: 'accountType', label: '口座種別', type: 'string' },
    { id: 'inv-f-acc-no', key: 'accountNumber', label: '口座番号', type: 'string' },
    { id: 'inv-f-acc-holder', key: 'accountHolder', label: '口座名義', type: 'string' },
    { id: 'inv-f-due-date', key: 'paymentDueDate', label: '支払期限', type: 'date' },
  ],
}
```

### repeatingBand 設定

```ts
{
  type: 'repeatingBand',
  dataSource: 'items',
  itemHeight: TABLE_ROW_H,  // 7mm
  showHeader: true,
  showFooter: false,
  maxItems: TABLE_ROWS,     // 10
  showEmptyRowLines: true,
  pageBreak: 'none',
  oddRowColor: COLORS.oddRow,
  evenRowColor: COLORS.evenRow,
  borderColor: COLORS.border,
  borderWidth: 0.2,
  headerStyle: {
    fontSize: FONT.table,
    fontWeight: 'bold',
    color: COLORS.headerText,
    backgroundColor: COLORS.headerBg,
  },
  style: {
    fontSize: FONT.table,
    color: COLORS.text,
  },
  fields: [
    { key: 'itemCode',  label: '品番', width: COL_CODE_W,   align: 'left' },
    { key: 'itemName',  label: '品名', width: COL_NAME_W,   align: 'left' },
    { key: 'quantity',  label: '数量', width: COL_QTY_W,    align: 'right', format: { type: 'comma' } },
    { key: 'unit',      label: '単位', width: COL_UNIT_W,   align: 'center' },
    { key: 'unitPrice', label: '単価', width: COL_PRICE_W,  align: 'right', format: { type: 'currency_jpy' } },
    { key: 'amount',    label: '金額', width: COL_AMOUNT_W, align: 'right', format: { type: 'currency_jpy' } },
  ],
  // fields width sum: 28+72+18+14+28+30 = 190 = CONTENT_W ✓
}
```

### サンプルデータ (`dataSources`)

各テンプレートに3-5行のサンプルアイテムを含むデータソースを付与。プレビュー時に即座にレンダリング確認可能にする。

```ts
dataSources: [{
  id: 'sample',
  type: 'static',
  data: {
    document: {
      documentNo: 'Q-2026-0001',
      issueDate: '2026年4月16日',
      registrationNo: 'T1234567890123',
      validUntil: '2026年5月16日',     // 見積書のみ
      paymentTerms: '月末締め翌月末払い',
      notes: '納品後30日以内にお支払いください。',
    },
    customer: {
      customerName: '株式会社サンプル商事',
      postalCode: '100-0001',
      address: '東京都千代田区千代田1-1-1',
      contactPerson: '山田太郎',
    },
    items: [
      { itemCode: 'A-001', itemName: 'ウィジェットA', quantity: 10, unit: '個', unitPrice: 5000, amount: 50000 },
      { itemCode: 'B-002', itemName: 'ウィジェットB（大）', quantity: 5, unit: 'セット', unitPrice: 12000, amount: 60000 },
      { itemCode: 'C-003', itemName: '設置作業費', quantity: 1, unit: '式', unitPrice: 30000, amount: 30000 },
    ],
    summary: {
      subtotal: 140000,
      tax10Base: 140000, tax10Amount: 14000,
      tax8Base: 0, tax8Amount: 0,
      totalIncTax: 154000,
    },
  },
}]
```

## Acceptance Criteria

- [x] 3つのテンプレートがテンプレートギャラリーに表示される
- [x] 各テンプレートが `category: 'business'`, `tags: ['modern', 'invoice']` を持つ
- [x] テンプレート選択後、キャンバスに全要素が正しく配置される
- [x] テナント要素（自社名・住所・電話・ロゴ）が表示される
- [x] 明細テーブル（repeatingBand）が6カラムでヘッダー付きで表示される
- [x] サンプルデータでプレビュー時に値が表示される
- [x] 集計エリア（小計・消費税10%/8%・合計）が正しく表示される
- [x] スキーマパネルに全グループ・フィールドが表示される
- [x] 見積書: 有効期限・見積条件セクションが含まれる
- [x] 注文書: 納期・納品先セクションが含まれる
- [x] 請求書: 支払期限・振込先口座セクションが含まれる
- [x] 既存テンプレート（見積書4種・扶養控除等）が影響を受けない
- [x] `npm run build` が成功する
- [x] `npm test -- --run` が全パスする

## Implementation Phases

### Phase 1: 共通ヘルパー (`businessTemplateHelpers.ts`)

**Files:**
- `src/templates/businessTemplateHelpers.ts` — 新規作成

**Tasks:**
- [x] 寸法定数（A4, マージン, カラム幅, カラーパレット, フォントサイズ）
- [x] ヘルパー関数（`lbl`, `df`, `rect`, `hline`, `vline`）
- [x] 既存 `quotationTemplate.ts:103-237` のパターンを参考に、カラーパレットを新デザインに変更
- [x] JPY_FMT, COMMA_FMT 等のフォーマット定数

### Phase 2: 見積書テンプレート (`quotationModernTemplate.ts`)

**Files:**
- `src/templates/quotationModernTemplate.ts` — 新規作成

**Tasks:**
- [x] テナント要素ブロック（右上: ロゴ, 社名, 住所, 電話）
- [x] タイトル「御見積書」+ アクセント線
- [x] 文書情報ブロック（見積番号, 発行日, 登録番号）
- [x] 顧客情報ブロック（顧客名+御中, 郵便番号, 住所, 担当者）
- [x] 合計金額ボックス（shape角丸背景 + dataField）
- [x] 明細テーブル（repeatingBand 6カラム, showHeader: true）
- [x] 集計エリア（小計, 10%対象, 10%税額, 8%対象, 8%税額, 合計）
- [x] 条件セクション（有効期限, 納品条件, 支払条件）
- [x] 備考欄
- [x] SchemaDefinition（4グループ: 見積情報, 顧客情報, 明細, 集計情報）
- [x] DataSourceDefinition（サンプルデータ）

### Phase 3: 注文書テンプレート (`purchaseOrderTemplate.ts`)

**Files:**
- `src/templates/purchaseOrderTemplate.ts` — 新規作成

**Tasks:**
- [x] 見積書テンプレートをベースに、タイトル「御注文書」に変更
- [x] 文書情報フィールド調整（有効期限→削除, 納品条件→削除）
- [x] 納品情報セクション追加（納期, 納品先住所, 納品先担当者）
- [x] 支払条件セクション
- [x] SchemaDefinition（5グループ: 注文情報, 顧客情報, 明細, 集計情報, 納品情報）
- [x] DataSourceDefinition（注文書用サンプルデータ）

### Phase 4: 請求書テンプレート (`invoiceTemplate.ts`)

**Files:**
- `src/templates/invoiceTemplate.ts` — 新規作成

**Tasks:**
- [x] 見積書テンプレートをベースに、タイトル「御請求書」に変更
- [x] 文書情報フィールド調整（有効期限→削除, 納品条件→削除）
- [x] 振込先口座セクション追加（銀行名, 支店名, 口座種別, 口座番号, 口座名義）
- [x] 支払期限フィールド追加
- [x] SchemaDefinition（5グループ: 請求情報, 顧客情報, 明細, 集計情報, 振込先）
- [x] DataSourceDefinition（請求書用サンプルデータ）

### Phase 5: 登録・動作確認

**Files:**
- `src/templates/builtinTemplates.ts` — 変更: 3テンプレートimport + 配列追加

**Tasks:**
- [x] `builtinTemplates.ts` に3テンプレートを追加
- [x] `npm run build` 成功確認
- [x] `npm test -- --run` 全パス確認
- [x] dev server起動 → テンプレートギャラリーで3つが表示されること確認
- [x] 各テンプレート選択 → キャンバスにレイアウト表示確認
- [x] プレビューモード → サンプルデータで値表示確認
- [x] スキーマパネル → グループ・フィールド表示確認

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| テナント要素が未設定の場合の表示 | フォールバックテキスト（「未設定」）が既存実装で対応済み |
| 6カラムの幅が狭すぎる場合 | 品名カラム72mmで十分な幅。フォントサイズ2.8mmで対応 |
| 既存テンプレートへの影響 | 新規ファイルのみ。builtinTemplates.tsへの追加は配列pushのみ |

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-16-business-document-templates-brainstorm.md](docs/brainstorms/2026-04-16-business-document-templates-brainstorm.md) — デザイン方針、カラム構成、スキーマ設計、インボイス対応要件
- **Template pattern reference:** `src/templates/quotationTemplate.ts` — ヘルパー関数、レイアウト座標パターン
- **Schema reference:** `src/templates/scalarQuotationTemplate.ts` — SchemaDefinition + DataSourceDefinition のパターン
- **Tenant elements:** `src/lib/elementFactories.ts:438-497` — テナント要素ファクトリ
- **Type definitions:** `src/types/index.ts` — Template(L1035), SchemaDefinition(L210), RepeatingBandElement(L466)
