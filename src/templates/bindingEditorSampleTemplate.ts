/**
 * バインドエディタ検証用サンプル帳票
 *
 * バインドエディタの一通りの機能を検証するためのテンプレート:
 * - マスター/明細のスキーマグループ（計算フィールド含む）
 * - 複数ページにまたがるバインド可能要素
 * - 一部要素にschemaBindingを設定済み（接続線の確認用）
 * - サンプルデータ付き
 */
import { v4 as uuidv4 } from 'uuid'
import type {
  Template,
  ReportElement,
  SchemaDefinition,
  DataSourceDefinition,
} from '@/types'

// ─── 寸法定数 ─────────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const ML = 15
const MT = 15

// ─── 安定ID（schemaBindingで参照するため固定） ───────────────

// スキーマグループID
const GRP_COMPANY = 'be-grp-company-00000000'
const GRP_ITEMS = 'be-grp-items-00000000'
const GRP_SUMMARY = 'be-grp-summary-00000000'

// フィールドID
const F_COMPANY_NAME = 'be-f-company-name-00000000'
const F_COMPANY_ADDR = 'be-f-company-addr-00000000'
const F_COMPANY_TEL = 'be-f-company-tel-00000000'
const F_COMPANY_REP = 'be-f-company-rep-00000000'
const F_DOC_NUMBER = 'be-f-doc-number-00000000'
const F_ISSUE_DATE = 'be-f-issue-date-00000000'

const F_ITEM_NAME = 'be-f-item-name-00000000'
const F_ITEM_QTY = 'be-f-item-qty-00000000'
const F_ITEM_PRICE = 'be-f-item-price-00000000'
const F_ITEM_AMOUNT = 'be-f-item-amount-00000000'

const F_SUBTOTAL = 'be-f-subtotal-00000000'
const F_TAX = 'be-f-tax-00000000'
const F_TOTAL = 'be-f-total-00000000'
const F_TAX_CALC = 'be-f-tax-calc-00000000'

// 要素ID
const EL_COMPANY_NAME = 'be-el-company-name-00000000'
const EL_COMPANY_ADDR = 'be-el-company-addr-00000000'
const EL_COMPANY_TEL = 'be-el-company-tel-00000000'
const EL_DOC_NUMBER = 'be-el-doc-number-00000000'
const EL_ISSUE_DATE = 'be-el-issue-date-00000000'
const EL_ITEM_NAME = 'be-el-item-name-00000000'
const EL_ITEM_QTY = 'be-el-item-qty-00000000'
const EL_ITEM_PRICE = 'be-el-item-price-00000000'
const EL_ITEM_AMOUNT = 'be-el-item-amount-00000000'
const EL_SUBTOTAL = 'be-el-subtotal-00000000'
const EL_TAX = 'be-el-tax-00000000'
const EL_TOTAL = 'be-el-total-00000000'
const EL_NOTES = 'be-el-notes-00000000'
const EL_UNBOUND_1 = 'be-el-unbound1-00000000'
const EL_UNBOUND_2 = 'be-el-unbound2-00000000'
const EL_CHECKBOX = 'be-el-checkbox-00000000'

// ─── ヘルパー ────────────────────────────────────────────

function txt(
  id: string, name: string,
  x: number, y: number, w: number, h: number,
  content: string,
  binding?: string,
): ReportElement {
  return {
    id,
    type: 'text',
    name,
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 1,
    locked: false,
    visible: true,
    content,
    style: { fontSize: 3.5, fontWeight: 'normal', color: '#333333' },
    ...(binding ? { schemaBinding: { fieldId: binding } } : {}),
  } as ReportElement
}

function df(
  id: string, name: string,
  x: number, y: number, w: number, h: number,
  binding?: string,
): ReportElement {
  return {
    id,
    type: 'dataField',
    name,
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 1,
    locked: false,
    visible: true,
    fieldKey: '',
    style: { fontSize: 3.5, color: '#333333' },
    ...(binding ? { schemaBinding: { fieldId: binding } } : {}),
  } as ReportElement
}

function lbl(
  content: string,
  x: number, y: number, w: number, h: number,
  opts?: { fontSize?: number; fontWeight?: string; color?: string; textAlign?: string },
): ReportElement {
  return {
    id: uuidv4(),
    type: 'text',
    position: { x, y },
    size: { width: w, height: h },
    zIndex: 2,
    locked: true,
    visible: true,
    content,
    style: {
      fontSize: opts?.fontSize ?? 3.5,
      fontWeight: opts?.fontWeight ?? 'normal',
      color: opts?.color ?? '#333333',
      textAlign: opts?.textAlign,
    },
  } as ReportElement
}

// ─── ページ1: 納品書ヘッダー ─────────────────────────────

const PAGE1_ID = 'be-page1-00000000'
const SEC1_ID = 'be-sec1-00000000'

const page1Elements: ReportElement[] = [
  // タイトル
  lbl('納 品 書', ML, MT, 180, 12, { fontSize: 8, fontWeight: 'bold', textAlign: 'center' }),

  // 文書番号・発行日
  lbl('No.', ML, MT + 16, 10, 6),
  df(EL_DOC_NUMBER, '文書番号', ML + 10, MT + 16, 40, 6, F_DOC_NUMBER),
  lbl('発行日:', ML + 110, MT + 16, 18, 6),
  df(EL_ISSUE_DATE, '発行日', ML + 128, MT + 16, 40, 6, F_ISSUE_DATE),

  // 宛先（会社情報 — バインド済み）
  lbl('宛先', ML, MT + 28, 20, 6, { fontWeight: 'bold' }),
  df(EL_COMPANY_NAME, '会社名', ML, MT + 36, 80, 6, F_COMPANY_NAME),
  txt(EL_COMPANY_ADDR, '会社住所', ML, MT + 44, 80, 6, '{{company_address}}', F_COMPANY_ADDR),
  txt(EL_COMPANY_TEL, '会社電話', ML, MT + 52, 80, 6, '{{company_tel}}', F_COMPANY_TEL),

  // 品目テーブルヘッダー
  lbl('品目', ML, MT + 68, 80, 7, { fontWeight: 'bold', color: '#ffffff' }),
  lbl('数量', ML + 80, MT + 68, 24, 7, { fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }),
  lbl('単価', ML + 104, MT + 68, 30, 7, { fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }),
  lbl('金額', ML + 134, MT + 68, 34, 7, { fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }),

  // 品目行（バインド済み）
  df(EL_ITEM_NAME, '品目名', ML, MT + 76, 80, 7, F_ITEM_NAME),
  df(EL_ITEM_QTY, '数量', ML + 80, MT + 76, 24, 7, F_ITEM_QTY),
  df(EL_ITEM_PRICE, '単価', ML + 104, MT + 76, 30, 7, F_ITEM_PRICE),
  df(EL_ITEM_AMOUNT, '金額', ML + 134, MT + 76, 34, 7, F_ITEM_AMOUNT),

  // 集計行（一部バインド済み、一部未バインド）
  lbl('小計:', ML + 104, MT + 160, 30, 7, { textAlign: 'right' }),
  df(EL_SUBTOTAL, '小計', ML + 134, MT + 160, 34, 7, F_SUBTOTAL),

  lbl('消費税:', ML + 104, MT + 168, 30, 7, { textAlign: 'right' }),
  df(EL_TAX, '消費税', ML + 134, MT + 168, 34, 7, F_TAX),

  lbl('合計:', ML + 104, MT + 176, 30, 7, { fontWeight: 'bold', textAlign: 'right' }),
  df(EL_TOTAL, '合計金額', ML + 134, MT + 176, 34, 7, F_TOTAL),

  // 未バインド要素（検証用）
  txt(EL_UNBOUND_1, '未バインド要素1', ML, MT + 200, 60, 6, '（未バインド）'),
  txt(EL_UNBOUND_2, '未バインド要素2', ML + 70, MT + 200, 60, 6, '（未バインド）'),

  // 備考（テキスト要素、未バインド）
  lbl('備考', ML, MT + 220, 20, 6, { fontWeight: 'bold' }),
  txt(EL_NOTES, '備考欄', ML, MT + 228, 160, 30, ''),
]

// ─── ページ2: 付属情報 ─────────────────────────────────

const PAGE2_ID = 'be-page2-00000000'
const SEC2_ID = 'be-sec2-00000000'

const page2Elements: ReportElement[] = [
  lbl('付属情報', ML, MT, 180, 10, { fontSize: 6, fontWeight: 'bold', textAlign: 'center' }),

  // チェックボックス（バインド可能要素の検証）
  {
    id: EL_CHECKBOX,
    type: 'checkbox',
    name: '確認チェック',
    position: { x: ML, y: MT + 20 },
    size: { width: 6, height: 6 },
    zIndex: 1,
    locked: false,
    visible: true,
    checked: false,
    label: '確認済み',
  } as ReportElement,

  // テキスト要素（ページ2にもバインド可能要素を配置）
  txt(uuidv4(), '担当者名', ML, MT + 35, 60, 6, ''),
  txt(uuidv4(), '承認日', ML + 70, MT + 35, 40, 6, ''),
  txt(uuidv4(), '部署名', ML, MT + 45, 60, 6, ''),
]

// ─── スキーマ定義 ──────────────────────────────────────────

const schema: SchemaDefinition = {
  groups: [
    {
      id: GRP_COMPANY,
      label: '取引先情報',
      role: 'master',
      dataKey: 'company',
      fields: [
        { id: F_COMPANY_NAME, key: 'company_name', label: '会社名', type: 'string' },
        { id: F_COMPANY_ADDR, key: 'company_address', label: '住所', type: 'string' },
        { id: F_COMPANY_TEL, key: 'company_tel', label: '電話番号', type: 'string' },
        { id: F_COMPANY_REP, key: 'company_representative', label: '担当者', type: 'string' },
        { id: F_DOC_NUMBER, key: 'document_number', label: '文書番号', type: 'string' },
        { id: F_ISSUE_DATE, key: 'issue_date', label: '発行日', type: 'date' },
      ],
    },
    {
      id: GRP_ITEMS,
      label: '品目明細',
      role: 'detail',
      dataKey: 'items',
      fields: [
        { id: F_ITEM_NAME, key: 'item_name', label: '品目名', type: 'string' },
        { id: F_ITEM_QTY, key: 'quantity', label: '数量', type: 'number' },
        { id: F_ITEM_PRICE, key: 'unit_price', label: '単価', type: 'number' },
        { id: F_ITEM_AMOUNT, key: 'amount', label: '金額', type: 'number' },
      ],
    },
    {
      id: GRP_SUMMARY,
      label: '集計',
      role: 'master',
      dataKey: 'summary',
      fields: [
        { id: F_SUBTOTAL, key: 'subtotal', label: '小計', type: 'number' },
        { id: F_TAX, key: 'tax', label: '消費税', type: 'number' },
        { id: F_TOTAL, key: 'total', label: '合計', type: 'number' },
        {
          id: F_TAX_CALC,
          key: 'tax_calculated',
          label: '消費税（計算）',
          type: 'number',
          computed: true,
          expression: 'subtotal * 0.1',
        },
      ],
    },
  ],
}

// ─── サンプルデータ ────────────────────────────────────────

const sampleDataSources: DataSourceDefinition[] = [
  {
    id: uuidv4(),
    name: 'バインドエディタ検証データ',
    fields: {
      company_name: '株式会社サンプル商事',
      company_address: '東京都千代田区丸の内1-1-1',
      company_tel: '03-1234-5678',
      company_representative: '田中 太郎',
      document_number: 'D-2026-0042',
      issue_date: '2026年4月15日',

      items: [
        { item_name: 'ScalarDB Enterprise Standard', quantity: 3, unit_price: 100000, amount: 300000 },
        { item_name: 'ScalarDB Enterprise Premium', quantity: 5, unit_price: 200000, amount: 1000000 },
        { item_name: 'ScalarDL Ledger', quantity: 3, unit_price: 100000, amount: 300000 },
      ],

      subtotal: 1600000,
      tax: 160000,
      total: 1760000,

      delivery_term: '受注後3営業日以内',
      payment_term: '月末締め翌月末払い',
      notes: '本帳票はバインドエディタの検証用サンプルです。',
    },
  },
]

// ─── テンプレート定義 ──────────────────────────────────────

export const BINDING_EDITOR_SAMPLE_TEMPLATE: Template = {
  id: 'binding-editor-sample',
  name: 'バインドエディタ検証用納品書',
  description: 'バインドエディタの全機能を検証するためのサンプル帳票。マスター/明細スキーマ、計算フィールド、複数ページ、一部バインド済み要素を含む。',
  category: '検証・サンプル',
  tags: ['A4', 'サンプル', 'バインド検証'],
  pages: [
    {
      id: PAGE1_ID,
      name: '納品書',
      background: '#ffffff',
      width: A4_W,
      height: A4_H,
      sections: [
        {
          id: SEC1_ID,
          sectionType: 'body',
          height: A4_H,
          elements: page1Elements,
        },
      ],
    },
    {
      id: PAGE2_ID,
      name: '付属情報',
      background: '#ffffff',
      width: A4_W,
      height: A4_H,
      sections: [
        {
          id: SEC2_ID,
          sectionType: 'body',
          height: A4_H,
          elements: page2Elements,
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
