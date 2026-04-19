/**
 * Scalar 見積書テンプレート
 *
 * ScalarDB / ScalarDL 製品のサブスクリプションライセンス見積書。
 * 対象システムごとに製品・Pod数・契約期間を入力し、
 * システムごとの小計、全体の小計、割引、消費税、合計を算出する。
 */
import { v4 as uuidv4 } from 'uuid'
import type {
  Template,
  ReportElement,
  TextStyle,
  CalculationFormat,
  SchemaDefinition,
  DataSourceDefinition,
} from '@/types'

// ─── 寸法定数 ─────────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const ML = 5   // 左余白
const MR = 5   // 右余白
const MT = 5   // 上余白

const CONTENT_W = A4_W - ML - MR          // 200
const RIGHT_BLOCK_X = 125
const RIGHT_BLOCK_W = A4_W - MR - RIGHT_BLOCK_X  // 80
const LEFT_BLOCK_W = 110

// 品目テーブル列幅 (合計 = CONTENT_W = 200)
const COL_SYSTEM_W = 42
const COL_PRODUCT_W = 68
const COL_PODS_W = 16
const COL_MONTHS_W = 16
const COL_UNIT_W = 26
const COL_SUBTOTAL_W = CONTENT_W - COL_SYSTEM_W - COL_PRODUCT_W - COL_PODS_W - COL_MONTHS_W - COL_UNIT_W  // 32

// テーブル行高さ
const TABLE_HDR_H = 7
const TABLE_ROW_H = 6.5
const TABLE_ROWS = 12
const TABLE_H = TABLE_HDR_H + TABLE_ROWS * TABLE_ROW_H  // 85

// 集計行
const SUMM_ROW_H = 7
const SUMM_LABEL_W = 40
const SUMM_AMT_W = 40
const SUMM_X = ML + CONTENT_W - SUMM_LABEL_W - SUMM_AMT_W

// 支払条件（集計エリア左側）
const COND_LABEL_W = 22
const COND_W = 110
const COND_ROW_H = 7

// Y 座標
const Y_TITLE = MT
const Y_INFO = MT + 14
const INFO_ROW = 5.5
const Y_CUSTOMER = MT + 14
const Y_CONTRACT = MT + 60              // 見積金額下線(62) + 3mm ブレスルーム
const Y_TABLE = MT + 76                 // 挨拶文終了(79) + 2mm
const Y_SUMM = Y_TABLE + TABLE_H + 3    // テーブル下端 + 3mm
const Y_NOTES = Y_SUMM + SUMM_ROW_H * 6 + 4

// ─── フォーマット定数 ──────────────────────────────────────
const JPY_FMT: CalculationFormat = { type: 'currency_jpy' }
const COMMA_FMT: CalculationFormat = { type: 'comma' }
const PERCENT_FMT: CalculationFormat = { type: 'percent' }

// ─── ヘルパー関数 ──────────────────────────────────────────

function createZCounter() {
  let value = 1
  return () => value++
}
const nextZ = createZCounter()

function lbl(
  text: string, x: number, y: number, w: number, h: number,
  style?: Partial<TextStyle>,
): ReportElement {
  return {
    id: uuidv4(), type: 'label',
    position: { x, y }, size: { width: w, height: h },
    zIndex: nextZ(), locked: true, visible: true, text,
    style: { fontSize: 8.5, textAlign: 'left', verticalAlign: 'middle', color: '#000000', ...style },
  }
}

function df(
  fieldKey: string, x: number, y: number, w: number, h: number,
  style?: Partial<TextStyle>,
  format?: CalculationFormat,
  fallbackText?: string,
): ReportElement {
  return {
    id: uuidv4(), type: 'dataField',
    position: { x, y }, size: { width: w, height: h },
    zIndex: nextZ(), locked: false, visible: true,
    fieldKey, label: undefined,
    style: { fontSize: 8.5, textAlign: 'left', verticalAlign: 'middle', color: '#000000', ...style },
    format, fallbackText,
  }
}

function hline(x: number, y: number, w: number, opts?: { strokeWidth?: number; color?: string }): ReportElement {
  return {
    id: uuidv4(), type: 'divider',
    position: { x, y }, size: { width: w, height: 0 },
    zIndex: nextZ(), locked: true, visible: true,
    direction: 'horizontal',
    color: opts?.color ?? '#000000',
    thickness: opts?.strokeWidth ?? 0.3,
    dashStyle: 'solid',
  }
}

function rect(
  x: number, y: number, w: number, h: number,
  opts?: { fill?: string; stroke?: string; strokeWidth?: number },
): ReportElement {
  return {
    id: uuidv4(), type: 'shape',
    position: { x, y }, size: { width: w, height: h },
    zIndex: nextZ(), locked: true, visible: true,
    shape: 'rectangle',
    fill: opts?.fill ?? 'transparent',
    stroke: opts?.stroke ?? '#000000',
    strokeWidth: opts?.strokeWidth ?? 0.3,
  }
}

function vline(x: number, y: number, h: number): ReportElement {
  return {
    id: uuidv4(), type: 'divider',
    position: { x, y }, size: { width: 0, height: h },
    zIndex: nextZ(), locked: true, visible: true,
    direction: 'vertical',
    color: '#000000',
    thickness: 0.3,
    dashStyle: 'solid',
  }
}

const SECTION_HDR_FILL = '#2c3e50'

// ─── 要素構築 ──────────────────────────────────────────────

const elements: ReportElement[] = []

// =====================================================================
// 1. タイトル
// =====================================================================
const TITLE_UNDERLINE_W = 80
const TITLE_UNDERLINE_X = ML + (CONTENT_W - TITLE_UNDERLINE_W) / 2
elements.push(
  lbl('御 見 積 書', ML, Y_TITLE, CONTENT_W, 12, {
    fontSize: 22.5, fontWeight: 'bold', textAlign: 'center', color: '#1a1a1a',
  }),
  hline(TITLE_UNDERLINE_X, Y_TITLE + 12, TITLE_UNDERLINE_W, { strokeWidth: 0.5 }),
)

// =====================================================================
// 2. 右上情報ブロック（発行日・見積番号・有効期限）
// =====================================================================
const INFO_LABEL_W = 22
elements.push(
  lbl('発行日：', RIGHT_BLOCK_X, Y_INFO, INFO_LABEL_W, INFO_ROW, { fontSize: 8, textAlign: 'right' }),
  df('issue_date', RIGHT_BLOCK_X + INFO_LABEL_W, Y_INFO, RIGHT_BLOCK_W - INFO_LABEL_W, INFO_ROW,
    { fontSize: 8 }, undefined, '2026年4月10日'),

  lbl('見積番号：', RIGHT_BLOCK_X, Y_INFO + INFO_ROW, INFO_LABEL_W, INFO_ROW, { fontSize: 8, textAlign: 'right' }),
  df('quotation_number', RIGHT_BLOCK_X + INFO_LABEL_W, Y_INFO + INFO_ROW, RIGHT_BLOCK_W - INFO_LABEL_W, INFO_ROW,
    { fontSize: 8 }, undefined, 'Q-2026-0001'),

  lbl('有効期限：', RIGHT_BLOCK_X, Y_INFO + INFO_ROW * 2, INFO_LABEL_W, INFO_ROW, { fontSize: 8, textAlign: 'right' }),
  df('expiry_date', RIGHT_BLOCK_X + INFO_LABEL_W, Y_INFO + INFO_ROW * 2, RIGHT_BLOCK_W - INFO_LABEL_W, INFO_ROW,
    { fontSize: 8 }, undefined, '2026年5月10日'),
)

// =====================================================================
// 3. 顧客情報（左側）
// =====================================================================
elements.push(
  df('customer_name', ML, Y_CUSTOMER, 60, 10,
    { fontSize: 14, fontWeight: 'bold' }, undefined, '株式会社サンプル'),
  lbl('御中', ML + 60, Y_CUSTOMER, 12, 10,
    { fontSize: 14, fontWeight: 'bold' }),
  hline(ML, Y_CUSTOMER + 11, LEFT_BLOCK_W, { strokeWidth: 0.4 }),

  lbl('〒', ML, Y_CUSTOMER + 13, 5, 5, { fontSize: 8 }),
  df('customer_postal_code', ML + 5, Y_CUSTOMER + 13, LEFT_BLOCK_W - 5, 5,
    { fontSize: 8 }, undefined, '100-0001'),
  df('customer_address', ML, Y_CUSTOMER + 18, LEFT_BLOCK_W, 8,
    { fontSize: 8, verticalAlign: 'top' }, undefined, '東京都千代田区丸の内1-1-1'),
  df('customer_contact', ML, Y_CUSTOMER + 26, LEFT_BLOCK_W, 5,
    { fontSize: 8 }, undefined, 'ご担当者様'),
)

// =====================================================================
// 4. 発行者情報（右側） — ロゴ + 社名 + 住所 + 印鑑
// =====================================================================
const Y_SENDER = Y_INFO + INFO_ROW * 3 + 2  // 日付ブロック直下

// ロゴプレースホルダー
elements.push({
  id: uuidv4(), type: 'image',
  position: { x: RIGHT_BLOCK_X, y: Y_SENDER }, size: { width: RIGHT_BLOCK_W, height: 10 },
  zIndex: nextZ(), locked: false, visible: true, src: '', alt: '会社ロゴ', objectFit: 'contain',
} as ReportElement)

const Y_SENDER_NAME = Y_SENDER + 11
elements.push(
  lbl('株式会社Scalar', RIGHT_BLOCK_X, Y_SENDER_NAME, RIGHT_BLOCK_W - 16, 6,
    { fontSize: 10, fontWeight: 'bold' }),
  lbl('〒162-0828', RIGHT_BLOCK_X, Y_SENDER_NAME + 6, RIGHT_BLOCK_W, 4.5, { fontSize: 8 }),
  lbl('東京都新宿区袋町5-1', RIGHT_BLOCK_X, Y_SENDER_NAME + 10.5, RIGHT_BLOCK_W, 4.5, { fontSize: 8 }),
  lbl('faro神楽坂 209号室', RIGHT_BLOCK_X, Y_SENDER_NAME + 15, RIGHT_BLOCK_W, 4.5, { fontSize: 8 }),
  lbl('backoffice@scalar-labs.com', RIGHT_BLOCK_X, Y_SENDER_NAME + 19.5, RIGHT_BLOCK_W, 4.5, { fontSize: 8 }),
)

// 印鑑（社名の右横）
elements.push({
  id: uuidv4(), type: 'hanko',
  position: { x: RIGHT_BLOCK_X + RIGHT_BLOCK_W - 14, y: Y_SENDER_NAME - 1 },
  size: { width: 12, height: 12 },
  zIndex: nextZ(), locked: false, visible: true,
  text: 'Scalar', shape: 'circle',
  borderColor: '#cc0000', textColor: '#cc0000', fontSize: 8.5,
  writingMode: 'horizontal-tb', doubleBorder: false,
} as ReportElement)

// =====================================================================
// 5. お見積金額（税込）
// =====================================================================
elements.push(
  lbl('お見積金額（税込）', ML, Y_CUSTOMER + 32, 42, 10, { fontSize: 10 }),
  df('total_amount_inc_tax', ML + 42, Y_CUSTOMER + 32, LEFT_BLOCK_W - 42, 10,
    { fontSize: 18.5, fontWeight: 'bold', textAlign: 'right' }, JPY_FMT, '¥0'),
  hline(ML, Y_CUSTOMER + 43, LEFT_BLOCK_W, { strokeWidth: 0.4 }),
)

// =====================================================================
// 6. 契約期間情報
// =====================================================================
elements.push(
  lbl('契約開始日：', ML, Y_CONTRACT, 24, 6, { fontSize: 8, textAlign: 'right' }),
  df('contract_start_date', ML + 24, Y_CONTRACT, 40, 6,
    { fontSize: 8 }, undefined, '2026年5月1日'),

  lbl('契約終了日：', ML + 70, Y_CONTRACT, 24, 6, { fontSize: 8, textAlign: 'right' }),
  df('contract_end_date', ML + 94, Y_CONTRACT, 40, 6,
    { fontSize: 8 }, undefined, '2027年4月30日'),

  lbl('下記のとおり、サブスクリプションライセンスのお見積りを申し上げます。', ML, Y_CONTRACT + 8, CONTENT_W, 6,
    { fontSize: 8.5 }),
)

// =====================================================================
// 7. 品目テーブル（繰り返しバンドのヘッダー行を使用）
// =====================================================================

// 繰り返しバンド（ヘッダー行 + 明細行）
elements.push({
  id: uuidv4(), type: 'repeatingBand',
  position: { x: ML, y: Y_TABLE },
  size: { width: CONTENT_W, height: TABLE_H },
  zIndex: nextZ(), locked: false, visible: true,
  dataSource: 'items', itemHeight: TABLE_ROW_H,
  showHeader: true, showFooter: false,
  totals: [
    { fieldKey: 'line_subtotal', formula: 'sum', label: '小計' },
  ],
  pageBreak: 'none', maxItems: TABLE_ROWS, showEmptyRowLines: true,
  oddRowColor: '#ffffff', evenRowColor: '#f8f9fa',
  borderColor: '#dee2e6', borderWidth: 0.2,
  groupBy: 'system_name',
  showGroupSubtotals: true,
  groupStyle: { backgroundColor: '#edf2f7', fontWeight: 'bold', fontSize: 8 },
  fields: [
    { key: 'system_name', label: '対象システム', width: COL_SYSTEM_W, align: 'left' },
    { key: 'product_name', label: '製品名', width: COL_PRODUCT_W, align: 'left' },
    { key: 'pods', label: 'Pod数', width: COL_PODS_W, align: 'center', format: COMMA_FMT },
    { key: 'months', label: '期間(月)', width: COL_MONTHS_W, align: 'center', format: COMMA_FMT },
    { key: 'unit_price', label: '単価(月額)', width: COL_UNIT_W, align: 'right', format: JPY_FMT },
    { key: 'line_subtotal', label: '小計', width: COL_SUBTOTAL_W, align: 'right', format: JPY_FMT },
  ],
  style: { fontSize: 8, color: '#1a1a1a' },
  headerStyle: { fontSize: 8, fontWeight: 'bold', color: '#ffffff', backgroundColor: SECTION_HDR_FILL },
} as ReportElement)

// =====================================================================
// 8. 支払条件テーブル（集計エリア左側）
// =====================================================================
elements.push(
  rect(ML, Y_SUMM, COND_W, COND_ROW_H * 3),
)

const condLabels = ['納期', '支払条件', '有効期限']
condLabels.forEach((label, i) => {
  const rowY = Y_SUMM + i * COND_ROW_H
  elements.push(
    rect(ML, rowY, COND_LABEL_W, COND_ROW_H, { fill: '#f0f0f0' }),
    lbl(label, ML + 1, rowY, COND_LABEL_W - 2, COND_ROW_H, { fontSize: 8, textAlign: 'center' }),
    vline(ML + COND_LABEL_W, rowY, COND_ROW_H),
  )
  if (i > 0) elements.push(hline(ML, rowY, COND_W))
})

// 条件値（データフィールド）
elements.push(
  df('delivery_term', ML + COND_LABEL_W + 2, Y_SUMM, COND_W - COND_LABEL_W - 4, COND_ROW_H,
    { fontSize: 8 }, undefined, 'ご発注後、即日ライセンス発行'),
  df('payment_term', ML + COND_LABEL_W + 2, Y_SUMM + COND_ROW_H, COND_W - COND_LABEL_W - 4, COND_ROW_H,
    { fontSize: 8 }, undefined, '月末締め翌月末払い'),
  df('validity_term', ML + COND_LABEL_W + 2, Y_SUMM + COND_ROW_H * 2, COND_W - COND_LABEL_W - 4, COND_ROW_H,
    { fontSize: 8 }, undefined, '発行日より30日間'),
)

// =====================================================================
// 9. 集計エリア（右側6行）
// =====================================================================
const SUMM_ROWS = 6
elements.push(
  rect(SUMM_X, Y_SUMM, SUMM_LABEL_W + SUMM_AMT_W, SUMM_ROW_H * SUMM_ROWS),
  vline(SUMM_X + SUMM_LABEL_W, Y_SUMM, SUMM_ROW_H * SUMM_ROWS),
)

const summaryItems: Array<{
  label: string
  key: string
  y: number
  bold: boolean
  format: CalculationFormat
  fallback: string
  highlight?: boolean
}> = [
  { label: '小計（税抜）', key: 'subtotal', y: Y_SUMM, bold: false, format: JPY_FMT, fallback: '¥0' },
  { label: '割引率', key: 'discount_rate', y: Y_SUMM + SUMM_ROW_H, bold: false, format: PERCENT_FMT, fallback: '0%' },
  { label: '割引額', key: 'discount_amount', y: Y_SUMM + SUMM_ROW_H * 2, bold: false, format: JPY_FMT, fallback: '¥0' },
  { label: '割引後金額', key: 'discounted_total', y: Y_SUMM + SUMM_ROW_H * 3, bold: false, format: JPY_FMT, fallback: '¥0' },
  { label: '消費税（10%）', key: 'tax_amount', y: Y_SUMM + SUMM_ROW_H * 4, bold: false, format: JPY_FMT, fallback: '¥0' },
  { label: '合計（税込）', key: 'total_amount_inc_tax', y: Y_SUMM + SUMM_ROW_H * 5, bold: true, format: JPY_FMT, fallback: '¥0', highlight: true },
]

summaryItems.forEach(({ label, key, y, bold, format, fallback, highlight }, i) => {
  if (i > 0) elements.push(hline(SUMM_X, y, SUMM_LABEL_W + SUMM_AMT_W))
  const bgFill = highlight ? SECTION_HDR_FILL : undefined
  const textColor = highlight ? '#ffffff' : '#000000'
  if (bgFill) {
    elements.push(rect(SUMM_X, y, SUMM_LABEL_W + SUMM_AMT_W, SUMM_ROW_H, { fill: bgFill, stroke: bgFill }))
  }
  elements.push(
    lbl(label, SUMM_X + 2, y, SUMM_LABEL_W - 4, SUMM_ROW_H, {
      fontSize: 8, textAlign: 'left', fontWeight: bold ? 'bold' : 'normal', color: textColor,
    }),
    df(key, SUMM_X + SUMM_LABEL_W + 2, y, SUMM_AMT_W - 4, SUMM_ROW_H, {
      fontSize: 8, textAlign: 'right', fontWeight: bold ? 'bold' : 'normal', color: textColor,
    }, format, fallback),
  )
})

// =====================================================================
// 10. 備考
// =====================================================================
const NOTES_H = 40
elements.push(
  rect(ML, Y_NOTES, CONTENT_W, NOTES_H),
  rect(ML, Y_NOTES, CONTENT_W, 7, { fill: SECTION_HDR_FILL, stroke: SECTION_HDR_FILL }),
  lbl('備考', ML, Y_NOTES, CONTENT_W, 7, { fontSize: 8, textAlign: 'center', fontWeight: 'bold', color: '#ffffff' }),
  df('notes', ML + 2, Y_NOTES + 8, CONTENT_W - 4, NOTES_H - 10, {
    fontSize: 8, verticalAlign: 'top',
  }, undefined, '・サブスクリプションライセンスの価格はPod/月単位です。\n・価格は予告なく変更される場合があります。'),
)

// ─── スキーマ定義 ──────────────────────────────────────────

const schema: SchemaDefinition = {
  groups: [
    {
      id: uuidv4(),
      label: '見積情報',
      role: 'master',
      dataKey: 'quotation',
      fields: [
        { id: uuidv4(), key: 'quotation_number', label: '見積番号', type: 'string' },
        { id: uuidv4(), key: 'issue_date', label: '発行日', type: 'string' },
        { id: uuidv4(), key: 'expiry_date', label: '有効期限', type: 'string' },
        { id: uuidv4(), key: 'contract_start_date', label: '契約開始日', type: 'string' },
        { id: uuidv4(), key: 'contract_end_date', label: '契約終了日', type: 'string' },
      ],
    },
    {
      id: uuidv4(),
      label: '顧客情報',
      role: 'master',
      dataKey: 'customer',
      fields: [
        { id: uuidv4(), key: 'customer_name', label: '顧客名', type: 'string' },
        { id: uuidv4(), key: 'customer_postal_code', label: '郵便番号', type: 'string' },
        { id: uuidv4(), key: 'customer_address', label: '住所', type: 'string' },
        { id: uuidv4(), key: 'customer_contact', label: '担当者', type: 'string' },
      ],
    },
    {
      id: uuidv4(),
      label: '見積明細',
      role: 'detail',
      dataKey: 'items',
      fields: [
        { id: uuidv4(), key: 'system_name', label: '対象システム', type: 'string' },
        { id: uuidv4(), key: 'product_name', label: '製品名', type: 'string' },
        { id: uuidv4(), key: 'pods', label: 'Pod数', type: 'number' },
        { id: uuidv4(), key: 'months', label: '期間(月)', type: 'number' },
        { id: uuidv4(), key: 'unit_price', label: '単価(月額)', type: 'number' },
        { id: uuidv4(), key: 'line_subtotal', label: '小計', type: 'number' },
      ],
    },
    {
      id: uuidv4(),
      label: '集計情報',
      role: 'master',
      dataKey: 'summary',
      fields: [
        { id: uuidv4(), key: 'subtotal', label: '小計（税抜）', type: 'number' },
        { id: uuidv4(), key: 'discount_rate', label: '割引率', type: 'number' },
        { id: uuidv4(), key: 'discount_amount', label: '割引額', type: 'number' },
        { id: uuidv4(), key: 'discounted_total', label: '割引後金額', type: 'number' },
        { id: uuidv4(), key: 'tax_amount', label: '消費税', type: 'number' },
        { id: uuidv4(), key: 'total_amount_inc_tax', label: '合計（税込）', type: 'number' },
      ],
    },
    {
      id: uuidv4(),
      label: '条件・備考',
      role: 'master',
      dataKey: 'terms',
      fields: [
        { id: uuidv4(), key: 'delivery_term', label: '納期', type: 'string' },
        { id: uuidv4(), key: 'payment_term', label: '支払条件', type: 'string' },
        { id: uuidv4(), key: 'validity_term', label: '有効期限', type: 'string' },
        { id: uuidv4(), key: 'notes', label: '備考', type: 'string' },
      ],
    },
  ],
}

// ─── サンプルデータ ────────────────────────────────────────

const sampleDataSources: DataSourceDefinition[] = [
  {
    id: uuidv4(),
    name: 'Scalar見積サンプルデータ',
    fields: {
      // 見積情報
      quotation_number: 'Q-2026-0001',
      issue_date: '2026年4月10日',
      expiry_date: '2026年5月10日',
      contract_start_date: '2026年5月1日',
      contract_end_date: '2027年4月30日',

      // 顧客情報
      customer_name: '株式会社サンプル',
      customer_postal_code: '100-0001',
      customer_address: '東京都千代田区丸の内1-1-1',
      customer_contact: '山田 太郎 様',

      // 明細行
      items: [
        {
          system_name: '開発/テスト環境',
          product_name: 'ScalarDB Enterprise Edition Standard',
          pods: 3,
          months: 12,
          unit_price: 100000,
          line_subtotal: 3600000,   // 100,000 × 3 × 12
        },
        {
          system_name: 'ステージング環境',
          product_name: 'ScalarDB Enterprise Edition Premium',
          pods: 3,
          months: 12,
          unit_price: 200000,
          line_subtotal: 7200000,   // 200,000 × 3 × 12
        },
        {
          system_name: '本番環境',
          product_name: 'ScalarDB Enterprise Edition Premium',
          pods: 5,
          months: 12,
          unit_price: 200000,
          line_subtotal: 12000000,  // 200,000 × 5 × 12
        },
        {
          system_name: '本番環境',
          product_name: 'ScalarDL Ledger',
          pods: 3,
          months: 12,
          unit_price: 100000,
          line_subtotal: 3600000,   // 100,000 × 3 × 12
        },
        {
          system_name: '本番環境',
          product_name: 'ScalarDL Auditor',
          pods: 3,
          months: 12,
          unit_price: 100000,
          line_subtotal: 3600000,   // 100,000 × 3 × 12
        },
      ],

      // 集計: 3,600,000 + 7,200,000 + 12,000,000 + 3,600,000 + 3,600,000 = 30,000,000
      subtotal: 30000000,
      discount_rate: 0.1,
      discount_amount: 3000000,     // 30,000,000 × 10%
      discounted_total: 27000000,   // 30,000,000 - 3,000,000
      tax_amount: 2700000,          // 27,000,000 × 10%
      total_amount_inc_tax: 29700000, // 27,000,000 + 2,700,000

      // 条件・備考
      delivery_term: 'ご発注後、即日ライセンス発行',
      payment_term: '月末締め翌月末払い',
      validity_term: '発行日より30日間',
      notes: '・サブスクリプションライセンスの価格はPod/月単位です。\n・価格は予告なく変更される場合があります。\n・本見積書の有効期限は発行日より30日間です。',
    },
  },
]

// ─── テンプレート定義 ──────────────────────────────────────

export const SCALAR_QUOTATION_TEMPLATE: Template = {
  id: 'scalar-quotation',
  name: 'Scalar 見積書',
  description: 'ScalarDB/ScalarDL サブスクリプションライセンスの見積書テンプレート。システム別のPod数×期間で算出。',
  category: '請求・見積',
  tags: ['A4', 'Scalar', 'サブスクリプション'],
  pages: [
    {
      id: uuidv4(),
      name: '見積書',
      background: '#ffffff',
      width: A4_W,
      height: A4_H,
      sections: [
        {
          id: uuidv4(),
          sectionType: 'body',
          height: A4_H,
          elements,
        },
      ],
    },
  ],
  settings: {
    paperSize: 'A4',
    orientation: 'portrait',
    margin: { top: 5, right: 5, bottom: 5, left: 5 },
    unit: 'mm',
  },
  schema,
  dataSources: sampleDataSources,
}
