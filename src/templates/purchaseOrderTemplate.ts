/**
 * 御注文書テンプレート（モダンデザイン・インボイス対応）
 *
 * モダン・クリーンデザインの注文書。インボイス制度（適格請求書）対応。
 * 6カラム明細テーブル（品番・品名・数量・単位・単価・金額）、
 * 税率別消費税内訳（10%/8%）、納品情報セクション。
 *
 * データスキーマ:
 * - document: { documentNo, issueDate, registrationNo, paymentTerms, notes }
 * - customer: { customerName, postalCode, address, contactPerson }
 * - items[]: { itemCode, itemName, quantity, unit, unitPrice, amount }
 * - summary: { subtotal, tax10Base, tax10Amount, tax8Base, tax8Amount, totalIncTax }
 * - delivery: { deliveryDate, deliveryAddress, deliveryContact }
 */
import { v4 as uuidv4 } from 'uuid'
import type { Template, ReportElement, SchemaDefinition, DataSourceDefinition } from '@/types'
import {
  A4_W, A4_H, ML, MT, MR, CONTENT_W,
  TABLE_ROW_H, TABLE_HDR_H, TABLE_ROWS,
  COL_CODE_W, COL_NAME_W, COL_QTY_W, COL_UNIT_W, COL_PRICE_W, COL_AMOUNT_W,
  RIGHT_BLOCK_X, RIGHT_BLOCK_W,
  SUMM_LABEL_W, SUMM_AMT_W, SUMM_ROW_H, SUMM_X,
  COLORS, FONT, JPY_FMT, COMMA_FMT,
  lbl, df, rect, hline, summaryRow,
} from './businessTemplateHelpers'

// ─── Y座標計算 ────────────────────────────────────────────────
const Y_TITLE = MT
const Y_ACCENT_LINE = Y_TITLE + 9
const Y_TENANT_NAME = Y_ACCENT_LINE + 1
const Y_TENANT_ADDR = Y_TENANT_NAME + 5
const Y_DOC_NO = Y_TENANT_ADDR + 4
const Y_ISSUE_DATE = Y_DOC_NO + 5
const Y_REG_NO = Y_ISSUE_DATE + 5

const Y_CUSTOMER = Y_REG_NO + 7
const Y_CUSTOMER_ZIP = Y_CUSTOMER + 6
const Y_CUSTOMER_ADDR = Y_CUSTOMER_ZIP + 5
const Y_CUSTOMER_CONTACT = Y_CUSTOMER_ADDR + 5

const Y_TOTAL_BOX = Y_CUSTOMER_CONTACT + 7
const TOTAL_BOX_H = 10

const Y_TABLE = Y_TOTAL_BOX + TOTAL_BOX_H + 4
const TABLE_H = TABLE_HDR_H + TABLE_ROWS * TABLE_ROW_H
const Y_TABLE_END = Y_TABLE + TABLE_H

const Y_SUMM = Y_TABLE_END + 3
const SUMM_ROWS_COUNT = 6
const Y_SUMM_END = Y_SUMM + SUMM_ROWS_COUNT * SUMM_ROW_H

const Y_DELIVERY = Y_SUMM_END + 5
const DELIVERY_ROW_H = 6
const DELIVERY_LABEL_W = 28
const DELIVERY_VALUE_W = 80

const Y_PAYMENT = Y_DELIVERY + DELIVERY_ROW_H * 3 + 3
const PAYMENT_ROW_H = 6

const Y_NOTES = Y_PAYMENT + PAYMENT_ROW_H + 5
const NOTES_H = 25

// ─── 要素生成 ─────────────────────────────────────────────────
const elements: ReportElement[] = []

// 1. タイトル
elements.push(
  lbl('御 注 文 書', ML, Y_TITLE, 100, 9, {
    fontSize: FONT.title, fontWeight: 'bold', color: COLORS.text,
  }),
  hline(ML, Y_ACCENT_LINE, 80, { color: COLORS.accent, strokeWidth: 0.5 }),
)

// 2. テナント情報（右上）
elements.push(
  {
    id: uuidv4(), type: 'tenantLogo',
    position: { x: A4_W - MR - 25, y: MT },
    size: { width: 25, height: 15 },
    zIndex: 3, locked: false, visible: true, objectFit: 'contain',
  } as ReportElement,
  {
    id: uuidv4(), type: 'tenantCompanyName',
    position: { x: RIGHT_BLOCK_X, y: Y_TENANT_NAME },
    size: { width: RIGHT_BLOCK_W - 30, height: 5 },
    zIndex: 3, locked: false, visible: true,
    style: { fontSize: FONT.section, fontWeight: 'bold', color: COLORS.text },
  } as ReportElement,
  {
    id: uuidv4(), type: 'tenantAddress',
    position: { x: RIGHT_BLOCK_X, y: Y_TENANT_ADDR },
    size: { width: RIGHT_BLOCK_W, height: 4 },
    zIndex: 3, locked: false, visible: true,
    style: { fontSize: FONT.small, color: COLORS.label },
  } as ReportElement,
  {
    id: uuidv4(), type: 'tenantPhone',
    position: { x: RIGHT_BLOCK_X, y: Y_TENANT_ADDR + 4 },
    size: { width: RIGHT_BLOCK_W, height: 4 },
    zIndex: 3, locked: false, visible: true,
    style: { fontSize: FONT.small, color: COLORS.label },
  } as ReportElement,
)

// 3. 文書情報
elements.push(
  lbl('注文番号:', ML, Y_DOC_NO, 20, 5, { fontSize: FONT.table, color: COLORS.label }),
  df('document.documentNo', ML + 20, Y_DOC_NO, 60, 5, { fontSize: FONT.table }, undefined, 'PO-2026-0001'),
  lbl('発行日:', ML, Y_ISSUE_DATE, 20, 5, { fontSize: FONT.table, color: COLORS.label }),
  df('document.issueDate', ML + 20, Y_ISSUE_DATE, 60, 5, { fontSize: FONT.table }, undefined, '2026年4月16日'),
  lbl('登録番号:', ML, Y_REG_NO, 20, 5, { fontSize: FONT.table, color: COLORS.label }),
  df('document.registrationNo', ML + 20, Y_REG_NO, 60, 5, { fontSize: FONT.table }, undefined, 'T1234567890123'),
)

// 4. 顧客情報
elements.push(
  df('customer.customerName', ML, Y_CUSTOMER, 100, 6, {
    fontSize: FONT.section, fontWeight: 'bold',
  }, undefined, '株式会社サンプル商事'),
  lbl('御中', ML + 100, Y_CUSTOMER, 10, 6, { fontSize: FONT.section }),
  hline(ML, Y_CUSTOMER + 6, 110, { color: COLORS.text, strokeWidth: 0.3 }),
  lbl('〒', ML, Y_CUSTOMER_ZIP, 5, 5, { fontSize: FONT.small, color: COLORS.label }),
  df('customer.postalCode', ML + 5, Y_CUSTOMER_ZIP, 30, 5, { fontSize: FONT.small }, undefined, '100-0001'),
  df('customer.address', ML, Y_CUSTOMER_ADDR, 110, 5, { fontSize: FONT.small }, undefined, '東京都千代田区千代田1-1-1'),
  lbl('ご担当:', ML, Y_CUSTOMER_CONTACT, 15, 5, { fontSize: FONT.small, color: COLORS.label }),
  df('customer.contactPerson', ML + 15, Y_CUSTOMER_CONTACT, 50, 5, { fontSize: FONT.small }, undefined, '山田太郎'),
  lbl('様', ML + 65, Y_CUSTOMER_CONTACT, 8, 5, { fontSize: FONT.small }),
)

// 5. 合計金額ボックス
elements.push(
  rect(ML, Y_TOTAL_BOX, CONTENT_W, TOTAL_BOX_H, {
    fill: COLORS.totalBoxBg, stroke: COLORS.accent, strokeWidth: 0.3, borderRadius: 2,
  }),
  lbl('合計金額（税込）', ML + 4, Y_TOTAL_BOX, 40, TOTAL_BOX_H, {
    fontSize: FONT.body, fontWeight: 'bold', color: COLORS.accent,
  }),
  df('summary.totalIncTax', ML + 44, Y_TOTAL_BOX, CONTENT_W - 48, TOTAL_BOX_H, {
    fontSize: 5, fontWeight: 'bold', textAlign: 'right', color: COLORS.text,
  }, JPY_FMT, '¥154,000'),
)

// 6. 明細テーブル
elements.push({
  id: uuidv4(),
  type: 'repeatingBand',
  position: { x: ML, y: Y_TABLE },
  size: { width: CONTENT_W, height: TABLE_H },
  zIndex: 2, locked: false, visible: true,
  dataSource: 'items',
  itemHeight: TABLE_ROW_H,
  showHeader: true, showFooter: false,
  maxItems: TABLE_ROWS, showEmptyRowLines: true, pageBreak: 'none', totals: [],
  oddRowColor: COLORS.oddRow, evenRowColor: COLORS.evenRow,
  borderColor: COLORS.border, borderWidth: 0.2,
  headerStyle: { fontSize: FONT.table, fontWeight: 'bold', color: COLORS.headerText, backgroundColor: COLORS.headerBg },
  style: { fontSize: FONT.table, color: COLORS.text },
  fields: [
    { key: 'itemCode', label: '品番', width: COL_CODE_W, align: 'left' },
    { key: 'itemName', label: '品名', width: COL_NAME_W, align: 'left' },
    { key: 'quantity', label: '数量', width: COL_QTY_W, align: 'right', format: COMMA_FMT },
    { key: 'unit', label: '単位', width: COL_UNIT_W, align: 'center' },
    { key: 'unitPrice', label: '単価', width: COL_PRICE_W, align: 'right', format: JPY_FMT },
    { key: 'amount', label: '金額', width: COL_AMOUNT_W, align: 'right', format: JPY_FMT },
  ],
} as ReportElement)

// 7. 集計エリア
elements.push(
  rect(SUMM_X, Y_SUMM, SUMM_LABEL_W + SUMM_AMT_W, SUMM_ROWS_COUNT * SUMM_ROW_H, { stroke: COLORS.border }),
)
const summItems = [
  { label: '小計', key: 'summary.subtotal', bold: false },
  { label: '10%対象', key: 'summary.tax10Base', bold: false },
  { label: '消費税（10%）', key: 'summary.tax10Amount', bold: false },
  { label: '8%対象', key: 'summary.tax8Base', bold: false },
  { label: '消費税（8%）', key: 'summary.tax8Amount', bold: false },
  { label: '合計（税込）', key: 'summary.totalIncTax', bold: true, highlight: true },
]
summItems.forEach(({ label, key, bold, highlight }, i) => {
  const y = Y_SUMM + i * SUMM_ROW_H
  if (i > 0) elements.push(hline(SUMM_X, y, SUMM_LABEL_W + SUMM_AMT_W))
  elements.push(...summaryRow(label, key, y, { bold, highlight }))
})

// 8. 納品情報セクション
const deliveryItems = [
  { label: '納期:', key: 'delivery.deliveryDate', placeholder: '2026年5月1日' },
  { label: '納品先住所:', key: 'delivery.deliveryAddress', placeholder: '東京都千代田区千代田1-1-1' },
  { label: '納品先担当:', key: 'delivery.deliveryContact', placeholder: '鈴木一郎' },
]
elements.push(
  lbl('納品情報', ML, Y_DELIVERY - 1, 30, 5, {
    fontSize: FONT.table, fontWeight: 'bold', color: COLORS.accent,
  }),
  hline(ML, Y_DELIVERY + 4, 100, { color: COLORS.accent, strokeWidth: 0.3 }),
)
deliveryItems.forEach(({ label, key, placeholder }, i) => {
  const y = Y_DELIVERY + 5 + i * DELIVERY_ROW_H
  elements.push(
    lbl(label, ML, y, DELIVERY_LABEL_W, DELIVERY_ROW_H, { fontSize: FONT.table, color: COLORS.label }),
    df(key, ML + DELIVERY_LABEL_W, y, DELIVERY_VALUE_W, DELIVERY_ROW_H, { fontSize: FONT.table }, undefined, placeholder),
  )
})

// 9. 支払条件
elements.push(
  lbl('支払条件:', ML, Y_PAYMENT, 24, PAYMENT_ROW_H, { fontSize: FONT.table, color: COLORS.label }),
  df('document.paymentTerms', ML + 24, Y_PAYMENT, 70, PAYMENT_ROW_H, { fontSize: FONT.table }, undefined, '月末締め翌月末払い'),
)

// 10. 備考欄
elements.push(
  rect(ML, Y_NOTES, CONTENT_W, NOTES_H, { stroke: COLORS.border }),
  lbl('備考', ML + 2, Y_NOTES, 20, 6, { fontSize: FONT.table, fontWeight: 'bold', color: COLORS.label }),
  df('document.notes', ML + 2, Y_NOTES + 6, CONTENT_W - 4, NOTES_H - 8, {
    fontSize: FONT.small, verticalAlign: 'top',
  }, undefined, ''),
)

// ─── スキーマ定義 ─────────────────────────────────────────────

const schema: SchemaDefinition = {
  groups: [
    {
      id: 'po-grp-doc', label: '注文情報', role: 'master', dataKey: 'document',
      fields: [
        { id: 'po-f-doc-no', key: 'documentNo', label: '注文番号', type: 'string' },
        { id: 'po-f-issue-date', key: 'issueDate', label: '発行日', type: 'date' },
        { id: 'po-f-reg-no', key: 'registrationNo', label: '登録番号', type: 'string' },
        { id: 'po-f-payment-terms', key: 'paymentTerms', label: '支払条件', type: 'string' },
        { id: 'po-f-notes', key: 'notes', label: '備考', type: 'string' },
      ],
    },
    {
      id: 'po-grp-customer', label: '顧客情報', role: 'master', dataKey: 'customer',
      fields: [
        { id: 'po-f-cust-name', key: 'customerName', label: '顧客名', type: 'string' },
        { id: 'po-f-postal', key: 'postalCode', label: '郵便番号', type: 'string' },
        { id: 'po-f-address', key: 'address', label: '住所', type: 'string' },
        { id: 'po-f-contact', key: 'contactPerson', label: '担当者', type: 'string' },
      ],
    },
    {
      id: 'po-grp-items', label: '明細', role: 'detail', dataKey: 'items',
      fields: [
        { id: 'po-f-code', key: 'itemCode', label: '品番', type: 'string' },
        { id: 'po-f-name', key: 'itemName', label: '品名', type: 'string' },
        { id: 'po-f-qty', key: 'quantity', label: '数量', type: 'number' },
        { id: 'po-f-unit', key: 'unit', label: '単位', type: 'string' },
        { id: 'po-f-price', key: 'unitPrice', label: '単価', type: 'number' },
        { id: 'po-f-amount', key: 'amount', label: '金額', type: 'number' },
      ],
    },
    {
      id: 'po-grp-summary', label: '集計情報', role: 'master', dataKey: 'summary',
      fields: [
        { id: 'po-f-subtotal', key: 'subtotal', label: '小計', type: 'number' },
        { id: 'po-f-tax10-base', key: 'tax10Base', label: '10%対象', type: 'number' },
        { id: 'po-f-tax10-amt', key: 'tax10Amount', label: '消費税(10%)', type: 'number' },
        { id: 'po-f-tax8-base', key: 'tax8Base', label: '8%対象', type: 'number' },
        { id: 'po-f-tax8-amt', key: 'tax8Amount', label: '消費税(8%)', type: 'number' },
        { id: 'po-f-total', key: 'totalIncTax', label: '合計(税込)', type: 'number' },
      ],
    },
    {
      id: 'po-grp-delivery', label: '納品情報', role: 'master', dataKey: 'delivery',
      fields: [
        { id: 'po-f-del-date', key: 'deliveryDate', label: '納期', type: 'date' },
        { id: 'po-f-del-addr', key: 'deliveryAddress', label: '納品先住所', type: 'string' },
        { id: 'po-f-del-contact', key: 'deliveryContact', label: '納品先担当者', type: 'string' },
      ],
    },
  ],
}

// ─── サンプルデータ ───────────────────────────────────────────

const sampleDataSources: DataSourceDefinition[] = [
  {
    id: uuidv4(),
    name: '注文書サンプルデータ',
    fields: {
      'document.documentNo': 'PO-2026-0001',
      'document.issueDate': '2026年4月16日',
      'document.registrationNo': 'T1234567890123',
      'document.paymentTerms': '月末締め翌月末払い',
      'document.notes': '指定納期までに納品をお願いいたします。',
      'customer.customerName': '株式会社サンプル商事',
      'customer.postalCode': '100-0001',
      'customer.address': '東京都千代田区千代田1-1-1',
      'customer.contactPerson': '山田太郎',
      'delivery.deliveryDate': '2026年5月1日',
      'delivery.deliveryAddress': '東京都千代田区千代田1-1-1 第2倉庫',
      'delivery.deliveryContact': '鈴木一郎',
      'summary.subtotal': 140000,
      'summary.tax10Base': 140000,
      'summary.tax10Amount': 14000,
      'summary.tax8Base': 0,
      'summary.tax8Amount': 0,
      'summary.totalIncTax': 154000,
      items: [
        { itemCode: 'A-001', itemName: 'ウィジェットA', quantity: 10, unit: '個', unitPrice: 5000, amount: 50000 },
        { itemCode: 'B-002', itemName: 'ウィジェットB（大）', quantity: 5, unit: 'セット', unitPrice: 12000, amount: 60000 },
        { itemCode: 'C-003', itemName: '設置作業費', quantity: 1, unit: '式', unitPrice: 30000, amount: 30000 },
      ],
    },
  },
]

// ─── テンプレート定義 ─────────────────────────────────────────

export const PURCHASE_ORDER_TEMPLATE: Template = {
  id: 'purchase-order-modern',
  name: '御注文書',
  description: 'モダンデザイン・インボイス対応',
  category: 'business',
  tags: ['modern', 'invoice'],
  settings: {
    paperSize: 'A4',
    orientation: 'portrait',
    margin: { top: MT, right: MR, bottom: 10, left: ML },
    unit: 'mm',
  },
  pages: [
    {
      id: uuidv4(),
      name: 'ページ 1',
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
  schema,
  dataSources: sampleDataSources,
}
