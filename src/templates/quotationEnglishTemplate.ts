/**
 * Quotation Template (English / Invoice-compatible)
 *
 * English-layout quotation with company info top-left, "Quotation" title top-right.
 * Columns: QUANTITY / DESCRIPTION / UNIT PRICE / AMOUNT.
 * Tax breakdown: SUB TOTAL / TAX (10%) / TAX (8%) / TOTAL.
 * Notes and Terms & Conditions sections.
 */
import { v4 as uuidv4 } from 'uuid'
import type { Template, ReportElement, TextStyle, CalculationFormat } from '@/types'

// ─── Dimensions ─────────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const ML = 12
const MT = 12
const MR = 12

const TABLE_R = A4_W - MR            // 198
const CONTENT_W = TABLE_R - ML       // 186

// Column layout (4 columns)
const COL_QTY_X    = ML
const COL_QTY_W    = 22
const COL_DESC_X   = ML + 22
const COL_DESC_W   = 98
const COL_PRICE_X  = ML + 120
const COL_PRICE_W  = 34
const COL_AMT_X    = ML + 154
const COL_AMT_W    = 44   // 22+98+34+44 = 198-12 = 186 ✓

// Summary (right-aligned, uses last 2 columns)
const SUMM_LABEL_X = COL_PRICE_X   // 132
const SUMM_LABEL_W = COL_PRICE_W   // 34
const SUMM_AMT_X   = COL_AMT_X     // 166
const SUMM_AMT_W   = COL_AMT_W     // 44

// Row heights
const TABLE_HDR_H = 8
const TABLE_ROW_H = 8
const TABLE_ROWS  = 12
const TABLE_H     = TABLE_HDR_H + TABLE_ROWS * TABLE_ROW_H  // 104
const SUMM_ROW_H  = 8

// Y coordinates
const Y_COMPANY     = MT              // 12
const Y_TITLE       = MT              // 12 (right side)
const Y_INFO        = MT + 12         // 24
const INFO_ROW      = 5
const Y_CUSTOMER    = MT + 32         // 44
const Y_VALID       = MT + 32         // 44 (right side, red)
const Y_TABLE       = MT + 58         // 70
const Y_BODY        = Y_TABLE + TABLE_HDR_H  // 78
const Y_SUBTOTAL    = Y_TABLE + TABLE_H      // 174
const Y_TAX10       = Y_SUBTOTAL + SUMM_ROW_H  // 182
const Y_TAX8        = Y_TAX10 + SUMM_ROW_H     // 190
const Y_TOTAL       = Y_TAX8 + SUMM_ROW_H      // 198
const Y_NOTES       = Y_TOTAL + SUMM_ROW_H + 6  // 212
const Y_TERMS       = Y_NOTES + 30               // 242

// ─── Formats ──────────────────────────────────────────────

const USD_FMT: CalculationFormat = { type: 'currency_usd' }
const COMMA_FMT: CalculationFormat = { type: 'comma' }

// ─── Helpers ──────────────────────────────────────────────

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

function hline(x: number, y: number, w: number, opts?: { strokeWidth?: number }): ReportElement {
  return {
    id: uuidv4(), type: 'shape',
    position: { x, y }, size: { width: w, height: 0.1 },
    zIndex: 1, locked: true, visible: true, shape: 'line',
    stroke: '#000000', strokeWidth: opts?.strokeWidth ?? 0.25,
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

function input(x: number, y: number, w: number, h: number): ReportElement {
  return {
    id: uuidv4(), type: 'manualEntry',
    position: { x, y }, size: { width: w, height: h },
    zIndex: 4, locked: false, visible: true,
    label: '', labelPosition: 'none', displayMode: 'none', lineColor: '#555555',
    style: { fontSize: 3.0, verticalAlign: 'top', color: '#1a1a1a' },
  }
}

// ─── Elements ─────────────────────────────────────────────
const elements: ReportElement[] = []

// ════════════════════════════════════════════════════════
// 1. Company info (top-left) + Title (top-right)
// ════════════════════════════════════════════════════════
// Company name (bold)
elements.push(
  df('quotation.sender.name', ML, Y_COMPANY, 80, 7,
    { fontSize: 4.5, fontWeight: 'bold' }, undefined, '●●● Co., Ltd.'),
  df('quotation.sender.address', ML, Y_COMPANY + 7, 80, 5, { fontSize: 2.8 },
    undefined, '1-2-3 △△△△, ●●-ku, Tokyo, Japan'),
  lbl('Phone: ', ML, Y_COMPANY + 12, 12, 5, { fontSize: 2.8 }),
  df('quotation.sender.tel', ML + 12, Y_COMPANY + 12, 40, 5, { fontSize: 2.8 },
    undefined, '00-0000-0000'),
  lbl('Email：', ML, Y_COMPANY + 17, 12, 5, { fontSize: 2.8 }),
  df('quotation.sender.email', ML + 12, Y_COMPANY + 17, 60, 5, { fontSize: 2.8 },
    undefined, '●●●@example.com'),
)

// Title "Quotation" (top-right, large)
elements.push(
  lbl('Quotation', TABLE_R - 60, Y_TITLE, 60, 12,
    { fontSize: 8, fontWeight: 'bold', textAlign: 'right' }),
)

// Right info block
elements.push(
  lbl('Date of Issue:', TABLE_R - 60, Y_INFO,             30, INFO_ROW, { fontSize: 2.5, textAlign: 'right' }),
  df('quotation.issueDate', TABLE_R - 30, Y_INFO,         30, INFO_ROW, { fontSize: 2.5, textAlign: 'right' },
    undefined, '4/1/2025'),
  lbl('Quotation #:', TABLE_R - 60, Y_INFO + INFO_ROW,    30, INFO_ROW, { fontSize: 2.5, textAlign: 'right' }),
  df('quotation.number', TABLE_R - 30, Y_INFO + INFO_ROW, 30, INFO_ROW, { fontSize: 2.5, textAlign: 'right' },
    undefined, 'M-12345678'),
  lbl('Registration #:', TABLE_R - 60, Y_INFO + INFO_ROW * 2, 30, INFO_ROW, { fontSize: 2.5, textAlign: 'right' }),
  df('quotation.registrationNo', TABLE_R - 30, Y_INFO + INFO_ROW * 2, 30, INFO_ROW, { fontSize: 2.5, textAlign: 'right' },
    undefined, 'TXXXXXXXXXXXXX'),
)

// ════════════════════════════════════════════════════════
// 2. Quotation To (left) + Valid until / Prepared by (right, red)
// ════════════════════════════════════════════════════════
elements.push(
  lbl('Quotation To:', ML, Y_CUSTOMER, 30, 6, { fontSize: 3.2, fontWeight: 'bold' }),
  df('quotation.customer.name', ML, Y_CUSTOMER + 6, 80, 6,
    { fontSize: 3.0 }, undefined, '△△△△ Co., Ltd.'),
  df('quotation.customer.address', ML, Y_CUSTOMER + 12, 80, 10,
    { fontSize: 2.8, verticalAlign: 'top' },
    undefined, 'Gate City Ohsaki East Tower, 1-11-2 Osaki, Shinagawa-ku, Tokyo, Japan'),
)

// Red text: valid until + prepared by
elements.push(
  lbl('Quotation valid until:', TABLE_R - 60, Y_VALID, 30, 6,
    { fontSize: 2.8, textAlign: 'right', color: '#cc0000' }),
  df('quotation.validUntil', TABLE_R - 30, Y_VALID, 30, 6,
    { fontSize: 2.8, textAlign: 'right', color: '#cc0000' }, undefined, '5/31/2025'),
  lbl('Prepared by:', TABLE_R - 60, Y_VALID + 7, 30, 6,
    { fontSize: 2.8, textAlign: 'right', color: '#333333' }),
  df('quotation.sender.contact', TABLE_R - 30, Y_VALID + 7, 30, 6,
    { fontSize: 2.8, textAlign: 'right' }, undefined, 'Taro Adobe'),
)

// ════════════════════════════════════════════════════════
// 3. Items table (QUANTITY / DESCRIPTION / UNIT PRICE / AMOUNT)
// ════════════════════════════════════════════════════════
elements.push(rect(ML, Y_TABLE, CONTENT_W, TABLE_H))

// Header row
elements.push(
  rect(ML, Y_TABLE, CONTENT_W, TABLE_HDR_H, { fill: '#333333' }),
  lbl('QUANTITY',   COL_QTY_X + 1,   Y_TABLE, COL_QTY_W - 2,   TABLE_HDR_H, { fontSize: 2.8, textAlign: 'center', color: '#ffffff', fontWeight: 'bold' }),
  vline(COL_DESC_X,  Y_TABLE, TABLE_H),
  lbl('DESCRIPTION', COL_DESC_X + 1, Y_TABLE, COL_DESC_W - 2,  TABLE_HDR_H, { fontSize: 2.8, textAlign: 'center', color: '#ffffff', fontWeight: 'bold' }),
  vline(COL_PRICE_X, Y_TABLE, TABLE_H),
  lbl('UNIT PRICE', COL_PRICE_X + 1, Y_TABLE, COL_PRICE_W - 2, TABLE_HDR_H, { fontSize: 2.8, textAlign: 'center', color: '#ffffff', fontWeight: 'bold' }),
  vline(COL_AMT_X,   Y_TABLE, TABLE_H),
  lbl('AMOUNT',     COL_AMT_X + 1,   Y_TABLE, COL_AMT_W - 2,   TABLE_HDR_H, { fontSize: 2.8, textAlign: 'center', color: '#ffffff', fontWeight: 'bold' }),
)

// Repeating band (with empty row lines)
elements.push({
  id: uuidv4(), type: 'repeatingBand',
  position: { x: ML, y: Y_BODY },
  size: { width: CONTENT_W, height: TABLE_ROWS * TABLE_ROW_H },
  zIndex: 3, locked: false, visible: true,
  dataSource: 'items', itemHeight: TABLE_ROW_H,
  showHeader: false, showFooter: false, totals: [],
  pageBreak: 'none', maxItems: TABLE_ROWS, showEmptyRowLines: true,
  oddRowColor: '#ffffff', evenRowColor: '#f5f5f5',
  borderColor: '#cccccc', borderWidth: 0.25,
  fields: [
    { key: 'quantity',    label: 'QUANTITY',   width: COL_QTY_W,   align: 'center', format: COMMA_FMT },
    { key: 'description', label: 'DESCRIPTION', width: COL_DESC_W, align: 'left'   },
    { key: 'unitPrice',   label: 'UNIT PRICE', width: COL_PRICE_W, align: 'right', format: USD_FMT },
    { key: 'amount',      label: 'AMOUNT',     width: COL_AMT_W,   align: 'right', format: USD_FMT },
  ],
  style: { fontSize: 2.8, color: '#1a1a1a' },
  headerStyle: { fontSize: 2.8, fontWeight: 'bold', color: '#ffffff' },
} as ReportElement)

// ════════════════════════════════════════════════════════
// 4. Summary (SUB TOTAL / TAX 10% / TAX 8% / TOTAL)
// ════════════════════════════════════════════════════════
elements.push(
  rect(SUMM_LABEL_X, Y_SUBTOTAL, SUMM_LABEL_W + SUMM_AMT_W, SUMM_ROW_H * 4),
  vline(SUMM_AMT_X, Y_SUBTOTAL, SUMM_ROW_H * 4),
)

const summRows = [
  { label: 'SUB TOTAL',  key: 'quotation.subtotal',     y: Y_SUBTOTAL, bold: false },
  { label: 'TAX (10%)',  key: 'quotation.tax10Amount',  y: Y_TAX10,    bold: false },
  { label: 'TAX (8%)',   key: 'quotation.tax8Amount',   y: Y_TAX8,     bold: false },
  { label: 'TOTAL',      key: 'quotation.total',        y: Y_TOTAL,    bold: true  },
]

summRows.forEach(({ label, key, y, bold }, i) => {
  if (i > 0) elements.push(hline(SUMM_LABEL_X, y, SUMM_LABEL_W + SUMM_AMT_W))
  elements.push(
    lbl(label, SUMM_LABEL_X + 1, y, SUMM_LABEL_W - 2, SUMM_ROW_H,
      { fontSize: 2.8, textAlign: 'right', fontWeight: bold ? 'bold' : 'normal' }),
    df(key, SUMM_AMT_X + 1, y, SUMM_AMT_W - 2, SUMM_ROW_H,
      { fontSize: 2.8, textAlign: 'right', fontWeight: bold ? 'bold' : 'normal' },
      USD_FMT, '$0.00'),
  )
})

// ════════════════════════════════════════════════════════
// 5. Notes + Terms & Conditions
// ════════════════════════════════════════════════════════
elements.push(
  lbl('Notes', ML, Y_NOTES, 30, 6, { fontSize: 3.5, fontWeight: 'bold' }),
  input(ML, Y_NOTES + 7, CONTENT_W, 20),
  lbl('Terms & Conditions', ML, Y_TERMS, 50, 6, { fontSize: 3.5, fontWeight: 'bold' }),
  input(ML, Y_TERMS + 7, CONTENT_W, 40),
)

// ─── Template definition ──────────────────────────────────
export const QUOTATION_ENGLISH_TEMPLATE: Template = {
  id: 'quotation-english',
  name: 'Quotation (English)',
  description: 'English-layout quotation template. Invoice-compatible with tax breakdown (10%/8%).',
  category: '請求・見積',
  tags: ['A4', '英語'],
  pages: [
    {
      id: uuidv4(),
      name: 'Quotation',
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
    margin: { top: 12, right: 12, bottom: 12, left: 12 },
    unit: 'mm',
  },
}
