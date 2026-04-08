/**
 * 見積書テンプレート（値引対応・インボイス対応）
 *
 * 基本版に「値引」列と「値引合計」行を追加した見積書。
 * 品目テーブルが5列（品番・品名 / 数量 / 単価 / 値引 / 金額）になる。
 */
import { v4 as uuidv4 } from 'uuid'
import type { Template, ReportElement, TextStyle, CalculationFormat } from '@/types'

// ─── 寸法定数 ─────────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const ML = 10
const MT = 8
const MR = 8

const TABLE_R = A4_W - MR            // 202
const CONTENT_W = TABLE_R - ML       // 192
const LEFT_W = 106
const RIGHT_X = 120
const RIGHT_W = TABLE_R - RIGHT_X    // 82

// 品目テーブル列（5列: 品番・品名/数量/単価/値引/金額）
const COL_NAME_X     = ML
const COL_NAME_W     = 86
const COL_QTY_X      = ML + 86
const COL_QTY_W      = 16
const COL_PRICE_X    = ML + 102
const COL_PRICE_W    = 26
const COL_DISCOUNT_X = ML + 128
const COL_DISCOUNT_W = 26
const COL_AMOUNT_X   = ML + 154
const COL_AMOUNT_W   = 38   // 86+16+26+26+38 = 192 ✓

// 集計列（単価+値引列→ラベル / 金額列→値）
const SUMM_LABEL_X = COL_DISCOUNT_X           // 138
const SUMM_LABEL_W = COL_DISCOUNT_W           // 26
const SUMM_AMT_X   = COL_AMOUNT_X             // 164
const SUMM_AMT_W   = COL_AMOUNT_W             // 38

// 税率内訳テーブル
const TAX_X       = ML
const TAX_LABEL_W = 22
const TAX_AMT_W   = 46
const TAX_TOTAL_W = TAX_LABEL_W + TAX_AMT_W  // 68

// 行高さ
const COND_ROW_H  = 8
const TABLE_HDR_H = 8
const TABLE_ROW_H = 8
const TABLE_ROWS  = 10
const TABLE_H     = TABLE_HDR_H + TABLE_ROWS * TABLE_ROW_H  // 88
const SUMM_ROW_H  = 8

// Y 座標（基本版と同一）
const Y_TITLE         = MT
const Y_RIGHT_INFO    = MT + 13
const INFO_ROW        = 5.5
const Y_CUST_NAME     = MT + 21
const Y_CUST_UNDER    = MT + 31
const Y_CUST_ZIP      = MT + 33
const Y_CUST_ADDR     = MT + 39
const Y_CUST_MSG      = MT + 48
const Y_SENDER_LOGO   = MT + 37
const Y_SENDER_ADDR   = MT + 54
const Y_SENDER_TEL    = MT + 61
const Y_SENDER_MAIL   = MT + 67
const Y_SENDER_CONT   = MT + 73
const Y_AMOUNT        = MT + 55
const Y_AMOUNT_UNDER  = MT + 66
const Y_COND          = MT + 69
const Y_TABLE         = MT + 97
const Y_BODY          = Y_TABLE + TABLE_HDR_H
const Y_SUBTOTAL      = Y_TABLE + TABLE_H            // 193
const Y_DISC_TOTAL    = Y_SUBTOTAL + SUMM_ROW_H      // 201 (値引合計行)
const Y_TAX10         = Y_DISC_TOTAL + SUMM_ROW_H    // 209
const Y_TAX8          = Y_TAX10 + SUMM_ROW_H         // 217
const Y_TOTAL         = Y_TAX8 + SUMM_ROW_H          // 225
const Y_TAXBREAK_HDR  = Y_TAX10                       // 209
const Y_TAXBREAK_10   = Y_TAX8                        // 217
const Y_TAXBREAK_8    = Y_TOTAL                       // 225
const Y_NOTES         = Y_TOTAL + SUMM_ROW_H + 4     // 237
const NOTES_HDR_H     = 7
const NOTES_BODY_H    = 46  // 237+7+46=290 < 297 ✓

// ─── ヘルパー関数 ──────────────────────────────────────────

const JPY_FMT: CalculationFormat = { type: 'currency_jpy' }
const COMMA_FMT: CalculationFormat = { type: 'comma' }

function lbl(
  text: string, x: number, y: number, w: number, h: number,
  style?: Partial<TextStyle>,
): ReportElement {
  return {
    id: uuidv4(), type: 'label',
    position: { x, y }, size: { width: w, height: h },
    zIndex: 3, locked: true, visible: true, text,
    style: { fontSize: 3.0, textAlign: 'left', verticalAlign: 'middle', color: '#000000', ...style },
  }
}

function df(
  fieldKey: string, x: number, y: number, w: number, h: number,
  style?: Partial<TextStyle>, format?: CalculationFormat, placeholder?: string,
): ReportElement {
  return {
    id: uuidv4(), type: 'dataField',
    position: { x, y }, size: { width: w, height: h },
    zIndex: 3, locked: false, visible: true, fieldKey, format,
    fallbackText: placeholder ?? ' ',
    label: placeholder ?? fieldKey.split('.').pop() ?? fieldKey,
    style: { fontSize: 3.0, textAlign: 'left', verticalAlign: 'middle', color: '#000000', ...style },
  }
}

function rect(
  x: number, y: number, w: number, h: number,
  opts?: { fill?: string; stroke?: string; strokeWidth?: number },
): ReportElement {
  return {
    id: uuidv4(), type: 'shape',
    position: { x, y }, size: { width: w, height: h },
    zIndex: 1, locked: true, visible: true, shape: 'rectangle',
    fill: opts?.fill ?? 'transparent', stroke: opts?.stroke ?? '#000000',
    strokeWidth: opts?.strokeWidth ?? 0.25,
  }
}

function hline(x: number, y: number, w: number, opts?: { strokeWidth?: number; color?: string }): ReportElement {
  return {
    id: uuidv4(), type: 'shape',
    position: { x, y }, size: { width: w, height: 0.1 },
    zIndex: 1, locked: true, visible: true, shape: 'line',
    stroke: opts?.color ?? '#000000', strokeWidth: opts?.strokeWidth ?? 0.25,
  }
}

function vline(x: number, y: number, h: number): ReportElement {
  return {
    id: uuidv4(), type: 'shape',
    position: { x, y }, size: { width: 0.1, height: h },
    zIndex: 1, locked: true, visible: true, shape: 'line',
    stroke: '#000000', strokeWidth: 0.25,
  }
}

function input(x: number, y: number, w: number, h: number, opts?: { fontSize?: number }): ReportElement {
  return {
    id: uuidv4(), type: 'manualEntry',
    position: { x, y }, size: { width: w, height: h },
    zIndex: 4, locked: false, visible: true,
    label: '', labelPosition: 'none', displayMode: 'none', lineColor: '#555555',
    style: { fontSize: opts?.fontSize ?? 3.0, verticalAlign: 'middle', color: '#1a1a1a' },
  }
}

// ─── 要素生成 ─────────────────────────────────────────────
const elements: ReportElement[] = []

// 1. タイトル
elements.push(
  lbl('見 積 書', ML, Y_TITLE, CONTENT_W, 15, { fontSize: 9, textAlign: 'center', fontWeight: 'bold' }),
)

// 2. 右上情報ブロック
elements.push(
  lbl('発行日：',   RIGHT_X, Y_RIGHT_INFO,                24, INFO_ROW, { fontSize: 2.8, textAlign: 'right' }),
  df('quotation.issueDate', RIGHT_X + 24, Y_RIGHT_INFO,   RIGHT_W - 24, INFO_ROW, { fontSize: 2.8 }, undefined, '20XX年XX月XX日'),
  lbl('見積書No：', RIGHT_X, Y_RIGHT_INFO + INFO_ROW,     24, INFO_ROW, { fontSize: 2.8, textAlign: 'right' }),
  df('quotation.number',    RIGHT_X + 24, Y_RIGHT_INFO + INFO_ROW, RIGHT_W - 24, INFO_ROW, { fontSize: 2.8 }, undefined, 'M-12345678'),
  lbl('登録番号：', RIGHT_X, Y_RIGHT_INFO + INFO_ROW * 2, 24, INFO_ROW, { fontSize: 2.8, textAlign: 'right' }),
  df('quotation.registrationNo', RIGHT_X + 24, Y_RIGHT_INFO + INFO_ROW * 2, RIGHT_W - 24, INFO_ROW, { fontSize: 2.8 }, undefined, 'TXXXXXXXXXXXXX'),
)

// 3. 顧客情報ブロック
elements.push(
  df('quotation.customer.name', ML, Y_CUST_NAME, LEFT_W - 18, 12,
    { fontSize: 5.5, fontWeight: 'bold' }, undefined, '株式会社△△△△'),
  lbl('御中', ML + LEFT_W - 18, Y_CUST_NAME, 18, 12, { fontSize: 5.5, fontWeight: 'bold' }),
  hline(ML, Y_CUST_UNDER + 2, LEFT_W, { strokeWidth: 0.4 }),
  lbl('〒', ML, Y_CUST_ZIP + 2, 5, 5, { fontSize: 2.8 }),
  df('quotation.customer.postalCode', ML + 5, Y_CUST_ZIP + 2, LEFT_W - 5, 5, { fontSize: 2.8 }, undefined, '000-0000'),
  df('quotation.customer.address', ML, Y_CUST_ADDR + 2, LEFT_W, 8, { fontSize: 2.8, verticalAlign: 'top' },
    undefined, '東京都品川区大崎1-11-2ゲートシティ大崎イーストタワー'),
  lbl('下記のとおり、お見積申し上げます。', ML, Y_CUST_MSG + 2, LEFT_W, 7, { fontSize: 3.2 }),
)

// 4. 発行者情報ブロック
elements.push({
  id: uuidv4(), type: 'image',
  position: { x: RIGHT_X, y: Y_SENDER_LOGO }, size: { width: RIGHT_W, height: 12 },
  zIndex: 2, locked: false, visible: true, src: '', alt: '会社ロゴ', objectFit: 'contain',
} as ReportElement)

elements.push(
  df('quotation.sender.name', RIGHT_X, Y_SENDER_LOGO + 13, RIGHT_W, 8,
    { fontSize: 4.0, fontWeight: 'bold' }, undefined, '株式会社●●●'),
)

elements.push({
  id: uuidv4(), type: 'hanko',
  position: { x: TABLE_R - 15, y: Y_SENDER_LOGO + 14 }, size: { width: 12, height: 12 },
  zIndex: 5, locked: false, visible: true, text: '印', shape: 'circle',
  borderColor: '#cc0000', textColor: '#cc0000', fontSize: 5,
  writingMode: 'horizontal-tb', doubleBorder: false,
} as ReportElement)

elements.push(
  df('quotation.sender.address', RIGHT_X, Y_SENDER_ADDR + 8, RIGHT_W, 6, { fontSize: 2.8 }, undefined, '東京都●●区△△△△'),
  lbl('Tel：',  RIGHT_X, Y_SENDER_TEL + 8,  9,  6, { fontSize: 2.8 }),
  df('quotation.sender.tel',     RIGHT_X + 9,  Y_SENDER_TEL + 8,  RIGHT_W - 9,  6, { fontSize: 2.8 }, undefined, '00-0000-0000'),
  lbl('Mail：', RIGHT_X, Y_SENDER_MAIL + 8, 12, 6, { fontSize: 2.8 }),
  df('quotation.sender.email',   RIGHT_X + 12, Y_SENDER_MAIL + 8, RIGHT_W - 12, 6, { fontSize: 2.8 }, undefined, '●●●@example.com'),
  lbl('担当：', RIGHT_X, Y_SENDER_CONT + 8, 12, 6, { fontSize: 2.8 }),
  df('quotation.sender.contact', RIGHT_X + 12, Y_SENDER_CONT + 8, RIGHT_W - 12, 6, { fontSize: 2.8 }, undefined, 'アドビ太郎'),
)

// 5. お見積金額（税込）
elements.push(
  lbl('お見積金額（税込）', ML, Y_AMOUNT, 42, 12, { fontSize: 3.5 }),
  df('quotation.totalAmountIncTax', ML + 42, Y_AMOUNT, LEFT_W - 42, 12,
    { fontSize: 7.0, fontWeight: 'bold', textAlign: 'right' }, JPY_FMT, '¥0'),
  hline(ML, Y_AMOUNT_UNDER, LEFT_W, { strokeWidth: 0.4 }),
)

// 6. 条件テーブル
const COND_LABEL_W = 18
const condLabels = ['納期', '支払条件', '有効期限']
elements.push(rect(ML, Y_COND, LEFT_W, COND_ROW_H * 3))
condLabels.forEach((label, i) => {
  const rowY = Y_COND + i * COND_ROW_H
  elements.push(
    rect(ML, rowY, COND_LABEL_W, COND_ROW_H, { fill: '#f0f0f0' }),
    lbl(label, ML + 1, rowY, COND_LABEL_W - 2, COND_ROW_H, { fontSize: 2.8, textAlign: 'center' }),
    vline(ML + COND_LABEL_W, rowY, COND_ROW_H),
    input(ML + COND_LABEL_W + 1, rowY + 1, LEFT_W - COND_LABEL_W - 2, COND_ROW_H - 2),
  )
  if (i > 0) elements.push(hline(ML, rowY, LEFT_W))
})

// 7. 品目テーブル（5列ヘッダー + 繰り返しバンド）
elements.push(rect(ML, Y_TABLE, CONTENT_W, TABLE_H))

// ヘッダー行
elements.push(
  rect(ML, Y_TABLE, CONTENT_W, TABLE_HDR_H, { fill: '#e8e8e8' }),
  lbl('品番・品名',   COL_NAME_X + 1,     Y_TABLE, COL_NAME_W - 2,     TABLE_HDR_H, { fontSize: 3.0, textAlign: 'center' }),
  vline(COL_QTY_X,      Y_TABLE, TABLE_H),
  lbl('数量',         COL_QTY_X + 1,      Y_TABLE, COL_QTY_W - 2,      TABLE_HDR_H, { fontSize: 3.0, textAlign: 'center' }),
  vline(COL_PRICE_X,    Y_TABLE, TABLE_H),
  lbl('単価',         COL_PRICE_X + 1,    Y_TABLE, COL_PRICE_W - 2,    TABLE_HDR_H, { fontSize: 3.0, textAlign: 'center' }),
  vline(COL_DISCOUNT_X, Y_TABLE, TABLE_H),
  lbl('値引',         COL_DISCOUNT_X + 1, Y_TABLE, COL_DISCOUNT_W - 2, TABLE_HDR_H, { fontSize: 3.0, textAlign: 'center' }),
  vline(COL_AMOUNT_X,   Y_TABLE, TABLE_H),
  lbl('金額（税抜）', COL_AMOUNT_X + 1,   Y_TABLE, COL_AMOUNT_W - 2,   TABLE_HDR_H, { fontSize: 3.0, textAlign: 'center' }),
)

// 空行罫線
for (let i = 1; i <= TABLE_ROWS; i++) {
  elements.push(hline(ML, Y_BODY + i * TABLE_ROW_H, CONTENT_W))
}

// 繰り返しバンド（5フィールド）
elements.push({
  id: uuidv4(), type: 'repeatingBand',
  position: { x: ML, y: Y_BODY },
  size: { width: CONTENT_W, height: TABLE_ROWS * TABLE_ROW_H },
  zIndex: 3, locked: false, visible: true,
  dataSource: 'items', itemHeight: TABLE_ROW_H,
  showHeader: false, showFooter: false, totals: [],
  pageBreak: 'none', maxItems: TABLE_ROWS,
  oddRowColor: '#ffffff', evenRowColor: '#f9f9f9',
  borderColor: '#cccccc', borderWidth: 0.25,
  fields: [
    { key: 'itemName',  label: '品番・品名', width: COL_NAME_W,     align: 'left'  },
    { key: 'quantity',  label: '数量',      width: COL_QTY_W,      align: 'right', format: COMMA_FMT },
    { key: 'unitPrice', label: '単価',      width: COL_PRICE_W,    align: 'right', format: JPY_FMT   },
    { key: 'discount',  label: '値引',      width: COL_DISCOUNT_W, align: 'right', format: JPY_FMT   },
    { key: 'amount',    label: '金額（税抜）', width: COL_AMOUNT_W, align: 'right', format: JPY_FMT   },
  ],
  style: { fontSize: 3.0, color: '#1a1a1a' },
  headerStyle: { fontSize: 3.0, fontWeight: 'bold' },
} as ReportElement)

// 8. 集計エリア（5行: 小計 / 値引合計 / 消費税10% / 消費税8% / 合計）
const SUMM_TOTAL_ROWS = 5
elements.push(
  rect(SUMM_LABEL_X, Y_SUBTOTAL, SUMM_LABEL_W + SUMM_AMT_W, SUMM_ROW_H * SUMM_TOTAL_ROWS),
  vline(SUMM_AMT_X, Y_SUBTOTAL, SUMM_ROW_H * SUMM_TOTAL_ROWS),
)

const summRows = [
  { label: '小計',          key: 'quotation.subtotal',       y: Y_SUBTOTAL,   bold: false, red: false },
  { label: '値引合計',       key: 'quotation.discountTotal', y: Y_DISC_TOTAL, bold: false, red: true  },
  { label: '消費税（10％）', key: 'quotation.tax10Amount',   y: Y_TAX10,      bold: false, red: false },
  { label: '消費税（8％）',  key: 'quotation.tax8Amount',    y: Y_TAX8,       bold: false, red: false },
  { label: '合計',          key: 'quotation.total',          y: Y_TOTAL,      bold: true,  red: false },
]

summRows.forEach(({ label, key, y, bold, red }, i) => {
  if (i > 0) elements.push(hline(SUMM_LABEL_X, y, SUMM_LABEL_W + SUMM_AMT_W))
  const color = red ? '#cc0000' : '#000000'
  elements.push(
    lbl(label, SUMM_LABEL_X + 1, y, SUMM_LABEL_W - 2, SUMM_ROW_H,
      { fontSize: 2.8, textAlign: bold ? 'center' : 'left', fontWeight: bold ? 'bold' : 'normal', color }),
    df(key, SUMM_AMT_X + 1, y, SUMM_AMT_W - 2, SUMM_ROW_H,
      { fontSize: 2.8, textAlign: 'right', fontWeight: bold ? 'bold' : 'normal', color },
      JPY_FMT, '¥0'),
  )
})

// 9. 税率内訳テーブル（左側）
elements.push(
  rect(TAX_X, Y_TAXBREAK_HDR, TAX_TOTAL_W, SUMM_ROW_H * 3),
  rect(TAX_X, Y_TAXBREAK_HDR, TAX_TOTAL_W, SUMM_ROW_H, { fill: '#f0f0f0' }),
  lbl('税率内訳', TAX_X + 1, Y_TAXBREAK_HDR, TAX_LABEL_W - 2, SUMM_ROW_H, { fontSize: 2.8, textAlign: 'center' }),
  vline(TAX_X + TAX_LABEL_W, Y_TAXBREAK_HDR, SUMM_ROW_H * 3),
  lbl('小計', TAX_X + TAX_LABEL_W + 1, Y_TAXBREAK_HDR, TAX_AMT_W - 2, SUMM_ROW_H, { fontSize: 2.8, textAlign: 'center' }),
  hline(TAX_X, Y_TAXBREAK_10, TAX_TOTAL_W),
  lbl('10%対象', TAX_X + 1, Y_TAXBREAK_10, TAX_LABEL_W - 2, SUMM_ROW_H, { fontSize: 2.8 }),
  df('quotation.tax10Base', TAX_X + TAX_LABEL_W + 1, Y_TAXBREAK_10, TAX_AMT_W - 2, SUMM_ROW_H,
    { fontSize: 2.8, textAlign: 'right' }, JPY_FMT, '¥0'),
  hline(TAX_X, Y_TAXBREAK_8, TAX_TOTAL_W),
  lbl('8%対象', TAX_X + 1, Y_TAXBREAK_8, TAX_LABEL_W - 2, SUMM_ROW_H, { fontSize: 2.8 }),
  df('quotation.tax8Base', TAX_X + TAX_LABEL_W + 1, Y_TAXBREAK_8, TAX_AMT_W - 2, SUMM_ROW_H,
    { fontSize: 2.8, textAlign: 'right' }, JPY_FMT, '¥0'),
)

// 10. 備考セクション
elements.push(
  rect(ML, Y_NOTES, CONTENT_W, NOTES_HDR_H + NOTES_BODY_H),
  rect(ML, Y_NOTES, CONTENT_W, NOTES_HDR_H, { fill: '#e8e8e8' }),
  lbl('備考', ML, Y_NOTES, CONTENT_W, NOTES_HDR_H, { fontSize: 3.2, textAlign: 'center', fontWeight: 'bold' }),
  input(ML + 2, Y_NOTES + NOTES_HDR_H + 1, CONTENT_W - 4, NOTES_BODY_H - 2),
)

// ─── テンプレート定義 ──────────────────────────────────────
export const QUOTATION_DISCOUNT_TEMPLATE: Template = {
  id: 'quotation-discount-invoice',
  name: '見積書（値引対応・インボイス対応）',
  description: '値引列付きの見積書。品目ごとの値引額と値引合計を表示。インボイス制度対応。',
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
    margin: { top: 8, right: 8, bottom: 8, left: 10 },
    unit: 'mm',
  },
}
