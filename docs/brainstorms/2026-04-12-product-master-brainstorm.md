# Brainstorm: 商品マスター機能

**Date:** 2026-04-12  
**Status:** Draft  
**Feature:** 商品マスター登録・管理・帳票参照機能

---

## What We're Building

テナント単位で商品マスターを管理し、帳票テンプレートから参照できる機能。
- 0件以上の商品を登録・編集・削除できる管理UI（テナント設定モーダル内）
- 帳票デザイン時に商品データを参照できる2つの方式（単品ルックアップ + 一覧表示）
- フィールドは基本セット＋カスタムフィールドで柔軟に拡張可能
- サブスクリプション対応の価格単位（期間×単価）もサポート

---

## Key Decisions

### 1. データモデル

**商品 (Product) フィールド:**

| フィールド | 型 | 備考 |
|-----------|-----|------|
| id | string (UUID) | システム生成 |
| code | string | 商品コード（ユニーク） |
| name | string | 商品名 |
| unitPrice | number | 単価 |
| category | string | カテゴリ |
| description | string | 説明文 |
| stockCount | number | 在庫数量 |
| taxType | enum | 非課税/標準税率/軽減税率 |
| unit | string | 単位（個/本/kg 等） |
| manufacturer | string | メーカー名 |
| subscriptionPeriod | string | サブスクリプション期間（月/年 等） |
| subscriptionPriceUnit | string | 価格単位の表記 |
| customFields | Record<string, unknown> | カスタムフィールド（管理者が定義） |
| priceHistory | `{price: number, effectiveFrom: string}[]` | 単価変更履歴 |
| deletedAt | string \| null | 論理削除タイムスタンプ（null = 有効） |
| createdAt | string | 作成日時 |
| updatedAt | string | 更新日時 |

**カスタムフィールド定義 (ProductCustomFieldDef):**
- key: string
- label: string
- type: "text" | "number" | "date" | "boolean"

**テナントレベルで保持する型:**
```ts
interface ProductMasterDefinition {
  customFieldDefs: ProductCustomFieldDef[];
  products: Product[];
}
```

### 2. ストレージ方針

- **場所:** テナント単位（TenantInfo と同じバックエンド構造を踏襲）
- **APIエンドポイント (新規):**
  - `GET    /api/v1/products`         — 全商品一覧取得
  - `POST   /api/v1/products`         — 商品追加
  - `PUT    /api/v1/products/{id}`    — 商品更新
  - `DELETE /api/v1/products/{id}`    — 商品削除
  - `GET    /api/v1/products/fields`  — カスタムフィールド定義取得
  - `PUT    /api/v1/products/fields`  — カスタムフィールド定義更新
- **バックエンド:** ScalarDB テーブル `product_master`（tenant_id, id, data JSON）
- **フロントエンド state:** `productSlice.ts`（TenantInfo スライスと同構造）

### 3. 管理UI

- **場所:** テナント設定モーダル内の新タブ「商品マスター」（TenantInfoTab の隣）
- **構成:**
  - カスタムフィールド定義セクション（フィールド名・型の追加/削除）
  - 商品一覧テーブル（検索・ソート・ページネーション）
  - 商品追加/編集フォーム（サブモーダル形式 — 一覧上で[追加]/[編集]クリック→ダイアログで全フィールド入力）

### 4. 帳票参照方式

**方式A: 単品ルックアップ（コード検索）**
- 帳票デザイン時に「商品コード」をデータソースフィールドで指定
- 実行時にそのコードで商品を検索し、フィールドバインドで各値を展開
- 用途: 見積書・納品書の特定商品情報表示

**方式B: 全商品リスト表示**
- `formTable` または `table` 要素のデータソースに `product_master` を指定可能
- 商品一覧をループして明細行を自動生成
- 用途: 商品カタログ・価格表・請求書明細

**実装方針:**
- `SchemaDefinition` にシステム予約グループ `__productMaster__` を追加
- 既存の `resolve-bindings` API を拡張してプロダクトマスターを解決元として対応

---

## Why This Approach

1. **TenantInfo パターンの再利用:** バックエンド・フロントエンド共に既存の tenantSlice 構造に倣うため、新規アーキテクチャ設計が不要。
2. **SchemaDefinition との統合:** 既存のフィールドバインド機構（`fieldId` 参照）をそのまま活用できるため、帳票デザイナー側の変更を最小化できる。
3. **テナントスコープ:** 既存の認証・テナント識別フローが流用できる。

---

## Resolved Questions

1. ~~商品マスターのスコープ~~ → テナント全体で共有
2. ~~CSV インポートは必須 vs 後回し？~~ → 後回し（フェーズ2以降）
3. ~~商品の論理削除 vs 物理削除？~~ → 論理削除（`deletedAt` フラグで非表示）
4. ~~商品バージョン管理は必要か？~~ → **必要**。`priceHistory[]` で管理。帳票生成時は発行日付で適用単価を解決し、管理UIで単価変更時に自動追記
5. ~~編集UIの形式~~ → サブモーダル（ダイアログ）形式

## Open Questions

（なし）

---

## Out of Scope (YAGNI)

- 商品画像のアップロード
- 商品間の親子関係（バリエーション管理）
- 複数通貨対応
- 外部ECシステムとの同期
