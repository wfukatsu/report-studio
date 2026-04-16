# Brainstorm: 見積書・注文書・請求書ビルトインテンプレート

**Date:** 2026-04-16
**Status:** Approved

## What We're Building

見積書（Quotation）、注文書（Purchase Order）、請求書（Invoice）の3種類のビルトインテンプレートを、モダン・クリーンなデザインで統一的に新規作成する。全テンプレートがインボイス制度（適格請求書）に対応する。

## Why This Approach

- 既存の見積書テンプレート（4種）は別スタイル（#2c3e50ヘッダー）で既に存在するが、今回はモダン・クリーンな統一デザインセットとして独立して追加
- 見積書→注文書→請求書は商取引の一連の流れだが、スキーマは各テンプレートで独立（テンプレート間のデータ連携は想定しない）
- テナント要素（tenantCompanyName等）を使用し、自社情報はテナント設定から自動反映

## Key Decisions

### 1. スコープ: 3テンプレート新規作成
- 見積書（モダン版）
- 注文書
- 請求書
- 既存の見積書テンプレート（基本・値引・英語・Scalar）はそのまま維持

### 2. デザインスタイル: モダン・クリーン
- 余白を活かしたミニマルデザイン
- カラーパレット:
  - テーブルヘッダー背景: `#f5f5f5`（ライトグレー）
  - テーブルヘッダー文字: `#333333`
  - 偶数行背景: `#fafafa`、奇数行: `#ffffff`
  - アクセント線（タイトル下）: `#3b82f6`（ブルー）、幅 0.5mm
  - 罫線: `#e0e0e0`、幅 0.2mm
  - 合計金額ボックス背景: `#f0f7ff`（薄いブルー）
- フォントサイズ: タイトル 7mm、セクション見出し 4mm、本文 3mm、テーブル 2.8mm
- 罫線は最小限、セル背景色で区分

### 3. インボイス制度（適格請求書）対応
全テンプレートに以下を含む:
- 登録番号（T+13桁）
- 税率ごとの消費税額内訳（10%/8%）
- 適用税率の区分表示

### 4. 明細テーブル構成: 6カラム（総幅 190mm = 210 - 10 - 10）
| カラム | key | width (mm) | align | format |
|--------|-----|-----------|-------|--------|
| 品番 | itemCode | 28 | left | - |
| 品名 | itemName | 72 | left | - |
| 数量 | quantity | 18 | right | comma |
| 単位 | unit | 14 | center | - |
| 単価 | unitPrice | 28 | right | currency_jpy |
| 金額 | amount | 30 | right | currency_jpy |

合計: 28+72+18+14+28+30 = 190mm = CONTENT_W

### 5. スキーマ: 各テンプレート独立
各テンプレートが独自のSchemaDefinitionを持つ。

**共通スキーマグループ（3テンプレート共通）:**

| グループ | role | dataKey | フィールド |
|---------|------|---------|-----------|
| 文書情報 | master | document | documentNo (string), issueDate (date), registrationNo (string) |
| 顧客情報 | master | customer | customerName (string), postalCode (string), address (string), contactPerson (string) |
| 明細 | detail | items | itemCode (string), itemName (string), quantity (number), unit (string), unitPrice (number), amount (number/computed: `quantity * unitPrice`) |
| 集計情報 | master | summary | subtotal (number), tax10Base (number), tax10Amount (number), tax8Base (number), tax8Amount (number), totalIncTax (number) |

**テンプレート固有フィールド:**

- 見積書 → 文書情報グループに追加: validUntil (date), deliveryTerms (string), paymentTerms (string)
- 注文書 → 納品情報グループ (master, delivery): deliveryDate (date), deliveryAddress (string), deliveryContact (string), paymentTerms (string)
- 請求書 → 振込先グループ (master, bankAccount): bankName (string), branchName (string), accountType (string), accountNumber (string), accountHolder (string), paymentDueDate (date)

### 6. 自社情報: テナント要素を使用
- `tenantCompanyName`, `tenantAddress`, `tenantPhone`, `tenantLogo` 等の専用要素を配置
- テナント設定から自動反映されるため、テンプレートごとの編集不要

## レイアウト概要

### 共通レイアウト（A4縦 210×297mm）

```
+--------------------------------------------------+  Y (mm)
|                                                   |  10
| 《 見積書 》              [tenantLogo]            |  10  タイトル(左) + ロゴ(右上)
| ───────── (accent line)   [tenantCompanyName]     |  18  アクセント線 + 自社名
|                           [tenantAddress]         |  22  自社住所
| 文書番号: xxxxxxx         [tenantPhone]           |  26  文書番号 + 電話
| 日付: yyyy/mm/dd                                  |  31
| 登録番号: T0000000000000                          |  36
|                                                   |
| 株式会社○○ 御中                                  |  44  宛先（顧客名 + 御中）
| 〒000-0000 住所...                                |  49  顧客住所
| ご担当: ○○様                                     |  54  担当者
|                                                   |
| ┌─ 合計金額（税込）─────── ¥XXX,XXX ─┐           |  62  合計ボックス
| └─────────────────────────────────────┘           |
|                                                   |
| 品番 | 品名     | 数量 | 単位 | 単価  | 金額     |  72  テーブルヘッダー
| -----|----------|------|------|-------|------     |
| ...  | ...      | ...  | ...  | ...   | ...      |      10行 × 7mm = 70mm
|                                                   |
|                         小計  ¥xxx,xxx            | 150  集計エリア
|               消費税(10%)対象  ¥xxx,xxx            |
|                  消費税(10%)  ¥xx,xxx              |
|               消費税( 8%)対象  ¥xxx,xxx            |
|                  消費税( 8%)  ¥xx,xxx              |
|                         合計  ¥xxx,xxx            |
|                                                   |
| 備考:                                             | 195  備考/固有セクション
| ・テンプレート固有の情報                          |
+--------------------------------------------------+
```

### テンプレート固有セクション

**見積書:**
- 有効期限
- 見積条件（納品方法、支払条件など）

**注文書:**
- 納期
- 納品先（住所・担当者）
- 支払条件

**請求書:**
- 支払期限
- 振込先口座情報（銀行名・支店名・口座種別・口座番号・口座名義）

## 技術的な実装方針

- 各テンプレートは `src/templates/` に独立ファイルとして作成
  - `quotationModernTemplate.ts`
  - `purchaseOrderTemplate.ts`
  - `invoiceTemplate.ts`
- `builtinTemplates.ts` の配列に追加
- `category: 'business'`, `tags: ['modern']` を付与して分類
- 明細テーブルは `repeatingBand` 要素（`showHeader: true`）を使用
- ヘッダースタイル: `backgroundColor: '#f5f5f5'`, `color: '#333333'`, `fontWeight: 'bold'`
- 10行の明細行、空行罫線表示あり
- 集計エリアは明細テーブルの右下に `dataField` 要素5行で構成（小計・10%対象・10%税額・8%対象・8%税額・合計）
- 合計金額ボックス（タイトル下）は `shape`（角丸背景）+ `dataField`（金額表示）で構成
- マージン: `top: 10, right: 10, bottom: 10, left: 10`（既存テンプレートより余裕を持たせる）

## Open Questions

（なし — 全て対話で解決済み）
