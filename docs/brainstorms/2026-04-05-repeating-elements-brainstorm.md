---
date: 2026-04-05
topic: repeating-elements-design
---

# 繰り返し要素（RepeatingBand / RepeatingList）— 設計ブレインストーム

## What We're Designing

帳票データソース（コレクション）を繰り返しレンダリングする2つの要素型の詳細設計。

- **`repeatingBand`** — Detail Band。コレクションを行として縦に繰り返す表形式要素
- **`repeatingList`** — Card List。コレクションをカードとして縦・横・グリッドに繰り返す要素

Phase 1 で型定義・UIモック・ElementRenderer プレビューを先行実装済み。
Phase 2 で実データバインディングを含む完全実装を行う。

---

## ユースケース分析

### repeatingBand が適する場面

| 帳票種別 | データ例 | 備考 |
|---|---|---|
| 請求書 / 見積書 | 商品明細（品目・数量・単価・金額）| 合計行が必須 |
| 給与明細 | 支給/控除内訳 | 小計・合計が必要 |
| 勤怠表 | 日別打刻ログ（日付・出勤・退勤・時間）| 集計行（月合計）が必須 |
| 注文確認書 | 注文品リスト | |
| 源泉徴収票 | 収入・控除項目 | |
| 経費精算書 | 経費明細 | 通貨フォーマット必須 |

### repeatingList が適する場面

| 帳票種別 | データ例 | 備考 |
|---|---|---|
| 社員名簿 | 氏名・役職・部署・顔写真 | 写真フィールド含む |
| 参加者一覧 | 氏名・所属・QRコード | QRコードを各カード内に配置 |
| 商品カタログ | 商品名・画像・価格・コード | grid 3〜4列 |
| IDカード印刷 | 氏名・番号・写真・バーコード | A4 に複数面付け |
| 座席表 | 氏名・部署 | grid 配置 |
| 組織図カード | 部署名・担当者一覧 | horizontal / vertical |

---

## 型定義（確定版）

### 共通型

```ts
/** フィールドフォーマット定義（band・list 両方で使用）*/
export interface RepeatingFieldFormat {
  type:
    | 'comma'          // カンマ区切り数値
    | 'currency_jpy'   // ¥ 付きカンマ区切り
    | 'percent'        // % 表示
    | 'integer'        // 整数
    | 'decimal'        // 小数
    | 'yyyy/MM/dd'
    | 'yyyy年MM月dd日'
    | 'wareki_full'    // 令和〇年〇月〇日
    | 'wareki_short'   // R00.00.00
    | 'kanji_numeral'  // 大字（壱、弐...）
    | 'custom'
  decimalPlaces?: number
  customPattern?: string
}
```

### RepeatingBandField（列定義）

```ts
export interface RepeatingBandField {
  key: string
  label: string
  width: number                    // mm
  align: 'left' | 'center' | 'right'
  format?: RepeatingFieldFormat
  /** この列だけを非表示にする条件式 */
  visibilityRule?: string
  /** この列のセル結合数（Phase 2.2）*/
  colSpan?: number
}
```

### RepeatingBandTotal（集計行）

```ts
export interface RepeatingBandTotal {
  fieldKey: string
  formula: 'sum' | 'avg' | 'count' | 'max' | 'min'
  /** フッター行の最左カラムに表示するラベル（空は非表示）*/
  label: string
  format?: RepeatingFieldFormat
}
```

### RepeatingBandElement

```ts
export interface RepeatingBandElement extends ElementBase {
  type: 'repeatingBand'

  // ─ データ ─────────────────────────────────
  /** バインドするコレクションキー（例: "items", "details"）*/
  dataSource: string
  /** 列定義（配列の順序 = 表示順）*/
  fields: RepeatingBandField[]

  // ─ レイアウト ─────────────────────────────
  /** 1データ行の高さ（mm）*/
  itemHeight: number
  /** ヘッダー行を表示するか */
  showHeader: boolean
  /** フッター集計行を表示するか */
  showFooter: boolean
  /** 集計行定義（showFooter=true 時に有効）*/
  totals: RepeatingBandTotal[]

  // ─ 外観 ────────────────────────────────────
  /** 奇数行の背景色（1-indexed）*/
  oddRowColor: string              // デフォルト: '#ffffff'
  /** 偶数行の背景色 */
  evenRowColor: string             // デフォルト: '#f9fafb'
  /** セル境界線色 */
  borderColor: string              // デフォルト: '#000000'
  /** セル境界線幅（mm）*/
  borderWidth: number              // デフォルト: 0.3
  /** データ行のテキストスタイル */
  style?: Partial<TextStyle>
  /** ヘッダー行のテキストスタイル */
  headerStyle?: Partial<TextStyle>

  // ─ ソート ──────────────────────────────────
  /** ソート対象フィールドキー（未指定 = データ順）*/
  sortBy?: string
  sortOrder?: 'asc' | 'desc'

  // ─ グループ化（Phase 2.2）─────────────────
  /**
   * グループ化するフィールドキー。
   * 指定すると groupBy の値でレコードをグループ分けし、
   * グループヘッダー行・グループフッター行を挿入する。
   */
  groupBy?: string

  // ─ ページング ──────────────────────────────
  /** 最大表示件数（0 = 無制限）*/
  maxItems: number
  /** 改ページ制御 */
  pageBreak: 'none' | 'before' | 'after'
}
```

### RepeatingListField（カード内フィールド）

```ts
export interface RepeatingListField {
  key: string
  /** デザインツール上での表示ラベル */
  label: string
  /** カード内の相対 X 座標（mm）*/
  x: number
  /** カード内の相対 Y 座標（mm）*/
  y: number
  width: number                    // mm
  height: number                   // mm
  style?: Partial<TextStyle>
  format?: RepeatingFieldFormat
  /** 将来: image / barcode などの特殊フィールドタイプ */
  fieldType?: 'text' | 'image' | 'barcode'
}
```

### RepeatingListElement

```ts
export interface RepeatingListElement extends ElementBase {
  type: 'repeatingList'

  // ─ データ ─────────────────────────────────
  dataSource: string
  fields: RepeatingListField[]

  // ─ レイアウト ─────────────────────────────
  /** 繰り返し方向 */
  layout: 'vertical' | 'horizontal' | 'grid'
  /** layout='grid' 時の列数 */
  gridColumns: number
  /** カード幅（mm）*/
  itemWidth: number
  /** カード高さ（mm）*/
  itemHeight: number
  /** カード間の余白（mm）*/
  gap: number

  // ─ カード外観 ──────────────────────────────
  itemBackground?: string          // デフォルト: '#ffffff'
  borderColor?: string             // デフォルト: '#d1d5db'
  borderWidth?: number             // mm, デフォルト: 0.3
  borderRadius?: number            // mm, デフォルト: 1

  // ─ ページング ──────────────────────────────
  maxItems: number                 // 0 = 無制限
  pageBreak: 'none' | 'before' | 'after'
}
```

---

## ファクトリー関数（デフォルト値）

### createRepeatingBandElement

```ts
// デフォルト列定義（請求書明細を想定）
const DEFAULT_BAND_FIELDS: RepeatingBandField[] = [
  { key: 'no',        label: 'No.',  width: 12, align: 'center' },
  { key: 'name',      label: '品目', width: 55, align: 'left' },
  { key: 'quantity',  label: '数量', width: 18, align: 'right' },
  { key: 'unit',      label: '単位', width: 14, align: 'center' },
  { key: 'unitPrice', label: '単価', width: 22, align: 'right', format: { type: 'comma' } },
  { key: 'amount',    label: '金額', width: 25, align: 'right', format: { type: 'comma' } },
]

export function createRepeatingBandElement(overrides?: Partial<RepeatingBandElement>): RepeatingBandElement {
  return {
    id: uuidv4(),
    type: 'repeatingBand',
    position: { x: 13, y: 13 },
    size: { width: 175, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,

    dataSource: 'items',
    fields: DEFAULT_BAND_FIELDS,
    itemHeight: 8,

    showHeader: true,
    showFooter: true,
    totals: [{ fieldKey: 'amount', formula: 'sum', label: '合計' }],

    oddRowColor: '#ffffff',
    evenRowColor: '#f9fafb',
    borderColor: '#000000',
    borderWidth: 0.3,
    sortOrder: 'asc',

    style: { fontSize: 3.5, color: '#000000' },
    headerStyle: { fontSize: 3.5, fontWeight: 'bold', color: '#374151', backgroundColor: '#f3f4f6' },

    pageBreak: 'none',
    maxItems: 0,

    ...overrides,
  }
}
```

### createRepeatingListElement

```ts
// デフォルトフィールド定義（社員名簿を想定）
const DEFAULT_LIST_FIELDS: RepeatingListField[] = [
  { key: 'name',  label: '名前', x: 2, y: 2,  width: 36, height: 5, style: { fontSize: 4, fontWeight: 'bold' } },
  { key: 'title', label: '役職', x: 2, y: 8,  width: 36, height: 4, style: { fontSize: 3, color: '#6b7280' } },
  { key: 'dept',  label: '部署', x: 2, y: 13, width: 36, height: 4, style: { fontSize: 3, color: '#6b7280' } },
]

export function createRepeatingListElement(overrides?: Partial<RepeatingListElement>): RepeatingListElement {
  return {
    id: uuidv4(),
    type: 'repeatingList',
    position: { x: 13, y: 13 },
    size: { width: 175, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,

    dataSource: 'items',
    layout: 'grid',
    gridColumns: 3,
    itemWidth: 55,
    itemHeight: 20,
    gap: 2,
    fields: DEFAULT_LIST_FIELDS,

    maxItems: 0,
    borderColor: '#d1d5db',
    borderWidth: 0.3,
    itemBackground: '#ffffff',
    borderRadius: 1,
    pageBreak: 'none',

    ...overrides,
  }
}
```

---

## ElementRenderer プレビュー仕様

### repeatingBand プレビュー

Phase 1 の ElementRenderer は実データを持たないため、以下のプレビュー表現で「繰り返しの意図」を伝える:

```
┌─────┬───────────────┬────┬────┬──────┬────────┐  headerStyle で描画
│ No. │ 品目          │数量│単位│ 単価 │  金額  │
├─────┼───────────────┼────┼────┼──────┼────────┤
│  1  │ {name}        │ 12 │ 月 │250,000│3,000,000│  opacity: 1.0
├─────┼───────────────┼────┼────┼──────┼────────┤
│  2  │ {name}        │ 12 │ 月 │ 30,000│ 360,000│  opacity: 0.7
├─────┼───────────────┼────┼────┼──────┼────────┤
│  3  │ {name}        │ 12 │ 月 │ 20,000│ 240,000│  opacity: 0.4
├─────┼───────────────┼────┼────┼──────┼────────┤
│ ↻ items レコード数分 繰り返し              │  繰り返しインジケーター
├─────┼───────────────┼────┼────┼──────┼────────┤
│     │ 合計          │    │    │      │3,600,000│  headerStyle で描画
└─────┴───────────────┴────┴────┴──────┴────────┘
```

右上に青バッジ「繰り返しバンド」を表示。

### repeatingList プレビュー

```
┌──────────┐ ┌──────────┐ ┌──────────┐   opacity:1.0, 0.85, 0.7
│ 山田 太郎│ │ 鈴木 花子│ │ 田中 一郎│
│ 部長     │ │ 課長     │ │ 係長     │
│ 営業部   │ │ 経理部   │ │ 総務部   │
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐                opacity:0.5, 0.3
│ 佐藤 次郎│ │ 高橋 三郎│
│ 主任     │ │ 担当     │
└──────────┘ └──────────┘
  ↻ items レコード数分 繰り返し (grid · 3列)
```

右上に紫バッジ「繰り返しリスト」を表示。

---

## PropertiesPanel 仕様

### RepeatingBandSection（4タブ）

#### タブ1: データ

| プロパティ | UI部品 | 説明 |
|---|---|---|
| `dataSource` | テキスト入力（バインドドロップ対応）| コレクションキー |
| `itemHeight` | 数値入力 + mm | 1行の高さ |
| `maxItems` | 数値入力（0=無制限）| 最大件数 |
| `showHeader` | チェックボックス | ヘッダー行 |
| `showFooter` | チェックボックス | 集計フッター行 |
| `pageBreak` | セレクト | なし/前/後 |

#### タブ2: 列定義

ドラッグ可能な行テーブルで列を管理。

| 列 | 内容 |
|---|---|
| ⠿（ドラッグ）| 並び替え |
| キー | `fields[i].key` |
| 見出し | `fields[i].label` |
| 幅(mm) | `fields[i].width` |
| 配置 | left/center/right |
| フォーマット | comma/currency_jpy/... |
| × | 削除 |

「+ 追加」ボタンで空行を末尾に追加。

#### タブ3: ソート・集計

**ソート:**
- ソートキー（フィールドキーのセレクト）
- 順序（昇順/降順）

**グループ化（Phase 2.2）:**
- グループキー（フィールドキーのセレクト）

**集計行:**
ドラッグ可能な集計行テーブル。

| 列 | 内容 |
|---|---|
| フィールド | `totals[i].fieldKey` |
| 集計関数 | sum/avg/count/max/min |
| ラベル | `totals[i].label` |
| × | 削除 |

「+ 集計行を追加」ボタン。

#### タブ4: 外観

| プロパティ | UI部品 |
|---|---|
| 奇数行背景色 | カラースウォッチ + 16進入力 |
| 偶数行背景色 | カラースウォッチ + 16進入力 |
| 枠線色 | カラースウォッチ + 16進入力 |
| 枠線幅(mm) | 数値入力 |
| ヘッダー背景色 | カラースウォッチ + 16進入力 |
| ヘッダーテキスト色 | カラースウォッチ + 16進入力 |
| フォント | セレクト + サイズ(mm) + テキスト色 |

---

### RepeatingListSection（4タブ）

#### タブ1: データ

| プロパティ | UI部品 |
|---|---|
| `dataSource` | テキスト入力（バインドドロップ対応）|
| `maxItems` | 数値入力（0=無制限）|
| `pageBreak` | セレクト |

#### タブ2: レイアウト

| プロパティ | UI部品 |
|---|---|
| `layout` | セレクト（縦/横/グリッド）|
| `gridColumns` | 数値入力（layout=grid 時のみ有効）|
| `itemWidth` | 数値入力 + mm |
| `itemHeight` | 数値入力 + mm |
| `gap` | 数値入力 + mm |

#### タブ3: フィールド定義

カード内フィールドを行テーブルで管理。

| 列 | 内容 |
|---|---|
| キー | `fields[i].key` |
| ラベル | `fields[i].label` |
| X(mm) | `fields[i].x` |
| Y(mm) | `fields[i].y` |
| 幅(mm) | `fields[i].width` |
| 高さ(mm) | `fields[i].height` |
| × | 削除 |

「+ 追加」ボタン。

> Phase 2 ではカード内の視覚的ドラッグ配置サブエディタ（ミニキャンバス）を追加予定。

#### タブ4: 外観

| プロパティ | UI部品 |
|---|---|
| カード背景色 | カラースウォッチ + 16進入力 |
| 枠線色 | カラースウォッチ + 16進入力 |
| 枠線幅(mm) | 数値入力 |
| 角丸(mm) | 数値入力 |

---

## ELEMENT_ALLOWED_KEYS

```ts
// reportStore.ts の ELEMENT_ALLOWED_KEYS に追加
repeatingBand: new Set([
  // ElementBase 共通
  'id', 'type', 'position', 'size', 'zIndex', 'locked', 'visible', 'name',
  'visibilityRule', 'printable',
  // RepeatingBandElement 固有
  'dataSource', 'fields', 'itemHeight',
  'showHeader', 'showFooter', 'totals',
  'oddRowColor', 'evenRowColor',
  'borderColor', 'borderWidth',
  'style', 'headerStyle',
  'sortBy', 'sortOrder', 'groupBy',
  'maxItems', 'pageBreak',
]),

repeatingList: new Set([
  // ElementBase 共通
  'id', 'type', 'position', 'size', 'zIndex', 'locked', 'visible', 'name',
  'visibilityRule', 'printable',
  // RepeatingListElement 固有
  'dataSource', 'fields',
  'layout', 'gridColumns', 'itemWidth', 'itemHeight', 'gap',
  'itemBackground', 'borderColor', 'borderWidth', 'borderRadius',
  'maxItems', 'pageBreak',
]),
```

---

## Phase 2 完全実装の設計課題

### 1. splitByPage（ページをまたぐ繰り返し）

`repeatingBand` が1ページに収まらない場合の分割処理。

**仕様（案）:**
- レンダリング時にページ残高（mm）を計算
- 残高 < `itemHeight` の時点でページ分割
- 2ページ目以降も `showHeader=true` の場合はヘッダー行を再印字
- 集計フッターは最終ページのみに印字

**実装場所:** `src/lib/repeatRenderer.ts`（新規作成予定）

### 2. カードテンプレートエディタ（repeatingList Phase 2.1）

`RepeatingListField` の配置を視覚的に編集するサブエディタ。

**選択肢:**
1. **独立モーダル**: 別ダイアログでミニキャンバスを開く。PropertiesPanel から「カード編集」ボタンで起動
2. **インライン折りたたみ**: PropertiesPanel 内でカード編集エリアを展開

→ **決定: 独立モーダル**（実装コストが低く、キャンバスと干渉しない）

### 3. groupBy（グループ化 Phase 2.2）

`groupBy` フィールドでレコードをグループ分けし、グループヘッダー行とグループ集計フッター行を挿入する。

**グループヘッダー行のスタイル:** グループキーの値を表示するテキストセル（全列結合）
**グループ集計:** `totals` と同じ関数をグループ単位で計算

---

## 参照

- [アーキテクチャブレスト](./2026-04-05-report-definition-studio-architecture-brainstorm.md#繰り返し要素-詳細設計phase-2)
- [実装計画プラン](../plans/2026-04-05-feat-phase1-report-design-studio-plan.md)
- `src/types/index.ts` — `RepeatingBandElement`, `RepeatingListElement`, `RepeatingBandField`, `RepeatingListField`, `RepeatingBandTotal`
- `src/lib/elementFactories.ts` — `createRepeatingBandElement`, `createRepeatingListElement`
- `src/components/canvas/ElementRenderer.tsx` — `case 'repeatingBand':`, `case 'repeatingList':`
- `src/components/sidebar/PropertiesPanel.tsx` — `RepeatingBandSection`, `RepeatingListSection`
