#!/usr/bin/env node
/**
 * build.mjs — サンプル帳票テンプレート＆DBシード生成
 *
 * 出力（すべて GUI で後から編集できるフラットな構造）:
 *   templates/invoice.json         御請求書      （git履歴の modern 版を土台・クリーン済み）
 *   templates/quotation.json       御見積書      （同上）
 *   templates/purchase-order.json  御注文書      （同上）
 *   templates/delivery-note.json   納品書        ← 請求書から機械変換して生成
 *   templates/receipt.json         領収書        ← 新規構築（明細なし）
 *   db-seed.json                   5フォーム分の ScalarDB テーブル定義＋サンプル行
 *
 * 冪等: 決定的 id を使うため何度実行しても同じ出力。
 * Run:  node scripts/sample-forms/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

const DIR = dirname(fileURLToPath(import.meta.url))
const TPL = join(DIR, 'templates')
const NS = 'demo'

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n')
const clone = (o) => JSON.parse(JSON.stringify(o))
// 決定的 uuid 風 id（seed から安定生成）
const sid = (seed) => {
  const h = createHash('sha1').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// ---------------------------------------------------------------------------
// 納品書 — 請求書テンプレートから機械変換
// ---------------------------------------------------------------------------
function buildDeliveryNote() {
  const env = clone(read(join(TPL, 'invoice.json')))
  const def = env.definition
  def.id = sid('sample-forms/delivery-note')
  // Override BOTH documentName (canonical, drives the server-side list name) and
  // name — spreading the invoice metadata would otherwise inherit its stale
  // documentName='御請求書' and mislabel this template (#155).
  def.metadata = { ...(def.metadata || {}), documentName: '納品書', name: '納品書', description: '納品書（明細・数量・金額）。demo.delivery_* にライブバインド。' }

  const els = def.pages[0].sections[0].elements

  // 1) 振込先口座・支払期限ブロック（y=210〜259未満）を丸ごと除去
  let kept = els.filter((e) => {
    const y = e.position?.y ?? 0
    const inBank = y >= 210 && y < 259
    const isBankField = typeof e.fieldKey === 'string' && e.fieldKey.startsWith('bankAccount.')
    return !inBank && !isBankField
  })

  // 2) 備考ブロック（y>=259）を上に繰り上げて余白を詰める
  const SHIFT = -46
  kept = kept.map((e) => {
    if ((e.position?.y ?? 0) >= 259) e.position = { ...e.position, y: e.position.y + SHIFT }
    return e
  })

  // 3) ラベル・タイトルの改称
  for (const e of kept) {
    if (e.type === 'text' && typeof e.content === 'string') {
      if (e.content.includes('請 求')) { e.content = '納 品 書'; e.name = '納 品 書' }
      else if (e.content === '請求番号:') e.content = '納品番号:'
      else if (e.content === '登録番号:') { e.content = '納品日:'; e.name = '納品日:' }
      else if (e.content.includes('ご請求金額')) e.content = '納品金額合計（税込）'
    }
    // 登録番号フィールド → 納品日フィールドへ転用
    if (e.fieldKey === 'document.registrationNo') {
      e.fieldKey = 'document.deliveryDate'; e.name = '納品日'; e.fallbackText = '2026年4月18日'; e.label = '2026年4月18日'
    }
  }
  def.pages[0].sections[0].elements = kept

  // 4) スキーマを delivery_* に再結線（振込先グループ除去、登録番号→納品日）
  let schema = def.schema
  schema.relations = []
  schema.groups = schema.groups
    .filter((g) => g.dataKey !== 'bankAccount')
    .map((g) => {
      const ng = clone(g)
      if (ng.tableMeta?.tableName) ng.tableMeta.tableName = ng.tableMeta.tableName.replace(/^invmod_/, 'delivery_')
      ng.id = ng.id.replace(/^inv-grp/, 'dlv-grp')
      if (ng.linkedMasterGroupId) ng.linkedMasterGroupId = ng.linkedMasterGroupId.replace(/^inv-grp/, 'dlv-grp')
      if (ng.dataKey === 'document') {
        ng.fields = ng.fields
          .filter((f) => f.key !== 'paymentTerms')
          .map((f) =>
            f.key === 'registrationNo'
              ? { ...f, id: 'dlv-f-delivery-date', key: 'deliveryDate', label: '納品日', type: 'date', dbColumnName: 'doc_delivery_date' }
              : f,
          )
      }
      return ng
    })

  // 5) デザイン時プレビュー用サンプルデータも納品書向けに整える
  for (const ds of def.dataSources || []) {
    if (!ds.fields) continue
    delete ds.fields.bankAccount
    if (ds.fields.document) {
      const d = ds.fields.document
      d.deliveryDate = '2026年4月20日'
      d.documentNo = 'DLV-2026-0021'
      d.notes = '御照査の上、ご査収ください。'
      delete d.registrationNo
      delete d.paymentTerms
    }
    if (ds.name) ds.name = '納品書サンプルデータ'
  }
  return env
}

// ---------------------------------------------------------------------------
// 領収書 — 新規構築（明細なし・ヘッダのみ）
// ---------------------------------------------------------------------------
function el(type, seed, position, size, extra = {}) {
  return { id: sid('receipt/' + seed), type, position, size, zIndex: 2, locked: false, visible: true, ...extra }
}
const txt = (seed, content, position, size, style = {}, name) =>
  el('text', seed, position, size, { content, name: name ?? content, style: { fontSize: 9, color: '#1a1a1a', ...style } })
const fld = (seed, fieldKey, fallbackText, position, size, style = {}, name) =>
  el('dataField', seed, position, size, { fieldKey, fallbackText, label: fallbackText, name: name ?? fieldKey, style: { fontSize: 9, color: '#1a1a1a', ...style } })
// 通貨（¥・カンマ区切り）表示の dataField
const yen = (seed, fieldKey, fallbackText, position, size, style = {}, name) =>
  ({ ...fld(seed, fieldKey, fallbackText, position, size, style, name), format: { type: 'currency_jpy' } })
// shape 要素は請求書テンプレと同じスキーマ（shape/stroke/strokeWidth/fill/borderRadius）
const line = (seed, position, size, stroke = '#888888', strokeWidth = 0.3, name = '区切り線') =>
  el('shape', seed, position, size, { shape: 'line', stroke, strokeWidth, zIndex: 1, locked: true, name })
const rect = (seed, position, size, { fill, stroke = '#cccccc', strokeWidth = 0.3, borderRadius = 0 } = {}, name = '枠線') =>
  el('shape', seed, position, size, { shape: 'rectangle', fill, stroke, strokeWidth, borderRadius, zIndex: 1, locked: true, name })

function buildReceipt() {
  const elements = [
    // タイトル
    txt('title', '領 収 書', { x: 55, y: 14 }, { width: 100, height: 12 }, { fontSize: 22, fontWeight: 'bold', textAlign: 'center', letterSpacing: 4 }, '領 収 書'),
    line('title-rule', { x: 60, y: 27 }, { width: 90, height: 0.4 }, '#333333', 0.4),
    // 右上: 領収番号・発行日
    txt('no-label', '領収番号:', { x: 130, y: 34 }, { width: 22, height: 5 }, { fontSize: 8, textAlign: 'left' }),
    fld('no', 'document.documentNo', 'RCP-2026-0007', { x: 152, y: 34 }, { width: 48, height: 5 }, { fontSize: 8 }, '領収番号'),
    txt('date-label', '発行日:', { x: 130, y: 39 }, { width: 22, height: 5 }, { fontSize: 8, textAlign: 'left' }),
    fld('date', 'document.issueDate', '2026年4月20日', { x: 152, y: 39 }, { width: 48, height: 5 }, { fontSize: 8 }, '発行日'),
    // 宛名
    fld('to', 'customer.customerName', '株式会社サンプル商事', { x: 12, y: 40 }, { width: 95, height: 8 }, { fontSize: 14, fontWeight: 'bold' }, '宛名'),
    txt('to-suffix', '様', { x: 108, y: 42 }, { width: 10, height: 7 }, { fontSize: 12 }),
    line('to-rule', { x: 12, y: 49 }, { width: 106, height: 0.3 }, '#888888', 0.3),
    // 金額ボックス（大）
    rect('amount-box', { x: 12, y: 58 }, { width: 186, height: 16 }, { fill: '#f5f7fa', stroke: '#333333', strokeWidth: 0.4, borderRadius: 1 }, '金額ボックス'),
    txt('amount-label', '金 額', { x: 16, y: 58 }, { width: 30, height: 16 }, { fontSize: 12, fontWeight: 'bold', verticalAlign: 'middle' }),
    yen('amount', 'summary.totalIncTax', '¥154,000', { x: 46, y: 58 }, { width: 150, height: 16 }, { fontSize: 20, fontWeight: 'bold', textAlign: 'right', verticalAlign: 'middle' }, '領収金額（税込）'),
    // 但し書き
    txt('proviso-label', '但し', { x: 12, y: 80 }, { width: 12, height: 6 }, { fontSize: 9 }),
    fld('proviso', 'document.proviso', 'システム開発費用として', { x: 24, y: 80 }, { width: 120, height: 6 }, { fontSize: 9 }, '但し書き'),
    txt('receipt-note', '上記正に領収いたしました。', { x: 12, y: 88 }, { width: 120, height: 6 }, { fontSize: 9 }),
    // 内訳ボックス（税抜・消費税）
    rect('breakdown-box', { x: 12, y: 100 }, { width: 90, height: 20 }, { stroke: '#cccccc', strokeWidth: 0.3 }, '内訳ボックス'),
    txt('bd-title', '内訳', { x: 14, y: 101 }, { width: 30, height: 6 }, { fontSize: 8, fontWeight: 'bold' }),
    txt('bd-sub-label', '税抜金額', { x: 16, y: 108 }, { width: 40, height: 5 }, { fontSize: 8 }),
    yen('bd-sub', 'summary.subtotal', '¥140,000', { x: 60, y: 108 }, { width: 38, height: 5 }, { fontSize: 8, textAlign: 'right' }, '税抜金額'),
    txt('bd-tax-label', '消費税', { x: 16, y: 113 }, { width: 40, height: 5 }, { fontSize: 8 }),
    yen('bd-tax', 'summary.taxAmount', '¥14,000', { x: 60, y: 113 }, { width: 38, height: 5 }, { fontSize: 8, textAlign: 'right' }, '消費税額'),
    // 収入印紙欄
    rect('stamp-box', { x: 150, y: 100 }, { width: 30, height: 30 }, { stroke: '#bbbbbb', strokeWidth: 0.3 }, '収入印紙欄'),
    txt('stamp-label', '収入印紙', { x: 150, y: 112 }, { width: 30, height: 6 }, { fontSize: 7, textAlign: 'center', color: '#999999' }),
    // 発行元
    line('issuer-rule', { x: 120, y: 140 }, { width: 78, height: 0.3 }, '#888888', 0.3),
    el('tenantLogo', 'logo', { x: 173, y: 142 }, { width: 25, height: 15 }, { name: '自社ロゴ' }),
    el('tenantCompanyName', 'company', { x: 118, y: 143 }, { width: 52, height: 5 }, { name: '自社名', style: { fontSize: 10, fontWeight: 'bold' } }),
    el('tenantAddress', 'address', { x: 118, y: 148 }, { width: 80, height: 4 }, { name: '自社住所', style: { fontSize: 7 } }),
    el('tenantPhone', 'phone', { x: 118, y: 152 }, { width: 80, height: 4 }, { name: '自社電話', style: { fontSize: 7 } }),
    txt('reg-label', '登録番号:', { x: 118, y: 158 }, { width: 20, height: 4 }, { fontSize: 7 }),
    fld('reg', 'document.registrationNo', 'T1234567890123', { x: 138, y: 158 }, { width: 50, height: 4 }, { fontSize: 7 }, '登録番号'),
  ]

  const definition = {
    id: sid('sample-forms/receipt'),
    metadata: {
      documentName: '領収書', name: '領収書', version: '1.0', reportType: 'general',
      sourceTemplateId: 'receipt', description: '領収書（宛名・金額・但し書き・内訳・収入印紙欄）。demo.receipt_* にライブバインド。',
    },
    pageSettings: { paperSize: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 }, unit: 'mm' },
    defaultTextStyle: {},
    pages: [
      {
        id: sid('receipt/page1'),
        name: 'ページ 1',
        background: '#ffffff',
        width: 210,
        height: 297,
        sections: [{ id: sid('receipt/sec1'), sectionType: 'body', height: 297, elements }],
      },
    ],
    schema: {
      relations: [],
      groups: [
        {
          id: 'rcp-grp-doc', dataKey: 'document', label: '書類情報', role: 'master',
          tableMeta: { namespace: NS, tableName: 'receipt_header' },
          fields: [
            { id: 'rcp-f-report-id', key: 'reportId', label: '帳票ID', type: 'string', dbColumnName: 'report_id' },
            { id: 'rcp-f-doc-no', key: 'documentNo', label: '領収番号', type: 'string', dbColumnName: 'doc_no' },
            { id: 'rcp-f-issue-date', key: 'issueDate', label: '発行日', type: 'date', dbColumnName: 'doc_issue_date' },
            { id: 'rcp-f-proviso', key: 'proviso', label: '但し書き', type: 'string', dbColumnName: 'doc_proviso' },
            { id: 'rcp-f-reg-no', key: 'registrationNo', label: '登録番号', type: 'string', dbColumnName: 'doc_registration_no' },
          ],
        },
        {
          id: 'rcp-grp-cust', dataKey: 'customer', label: '顧客情報', role: 'master',
          tableMeta: { namespace: NS, tableName: 'receipt_header' }, linkedMasterGroupId: 'rcp-grp-doc',
          fields: [{ id: 'rcp-f-cust-name', key: 'customerName', label: '宛名', type: 'string', dbColumnName: 'cust_customer_name' }],
        },
        {
          id: 'rcp-grp-sum', dataKey: 'summary', label: '集計情報', role: 'master',
          tableMeta: { namespace: NS, tableName: 'receipt_header' }, linkedMasterGroupId: 'rcp-grp-doc',
          fields: [
            { id: 'rcp-f-subtotal', key: 'subtotal', label: '税抜金額', type: 'number', dbColumnName: 'sum_subtotal' },
            { id: 'rcp-f-tax', key: 'taxAmount', label: '消費税額', type: 'number', dbColumnName: 'sum_tax_amount' },
            { id: 'rcp-f-total', key: 'totalIncTax', label: '合計(税込)', type: 'number', dbColumnName: 'sum_total_inc_tax' },
          ],
        },
      ],
    },
    dataSources: [
      {
        id: sid('receipt/sample'),
        name: '領収書サンプルデータ',
        type: null,
        fields: {
          document: { reportId: RID.receipt, documentNo: 'RCP-2026-0007', issueDate: '2026年4月20日', proviso: 'システム開発費用として', registrationNo: 'T1234567890123' },
          customer: { customerName: '株式会社サンプル商事' },
          summary: { subtotal: 140000, taxAmount: 14000, totalIncTax: 154000 },
        },
      },
    ],
    calculationRules: [],
    validationRules: [],
    outputVariants: [],
    templateVariables: [],
    submissionModels: [],
  }
  return { formatVersion: 2, definition }
}

// ---------------------------------------------------------------------------
// DBシード — 5フォーム分のテーブル＋サンプル行
// ---------------------------------------------------------------------------
const RID = {
  delivery: sid('row/delivery-0001'),
  receipt: sid('row/receipt-0007'),
}

function deliveryTables() {
  // delivery_header: invmod_header から bank_* 除去・doc_registration_no→doc_delivery_date
  const header = {
    namespace: NS, tableName: 'delivery_header', partitionKeys: ['report_id'], clusteringKeys: [], secondaryIndexes: ['doc_no'],
    columns: [
      { name: 'report_id', type: 'TEXT' }, { name: 'doc_no', type: 'TEXT' },
      { name: 'doc_issue_date', type: 'TEXT' }, { name: 'doc_delivery_date', type: 'TEXT' }, { name: 'doc_notes', type: 'TEXT' },
      { name: 'cust_customer_name', type: 'TEXT' }, { name: 'cust_postal_code', type: 'TEXT' },
      { name: 'cust_address', type: 'TEXT' }, { name: 'cust_contact_person', type: 'TEXT' },
      { name: 'sum_subtotal', type: 'DOUBLE' }, { name: 'sum_tax10_base', type: 'DOUBLE' }, { name: 'sum_tax10_amount', type: 'DOUBLE' },
      { name: 'sum_tax8_base', type: 'DOUBLE' }, { name: 'sum_tax8_amount', type: 'DOUBLE' }, { name: 'sum_total_inc_tax', type: 'DOUBLE' },
    ],
    rows: [{
      report_id: RID.delivery, doc_no: 'DLV-2026-0021', doc_issue_date: '2026年4月18日', doc_delivery_date: '2026年4月20日',
      doc_notes: '御照査の上、ご査収ください。', cust_customer_name: '株式会社サンプル商事', cust_postal_code: '100-0001',
      cust_address: '東京都千代田区千代田1-1-1 サンプルビル3F', cust_contact_person: '山田太郎',
      sum_subtotal: 140000, sum_tax10_base: 140000, sum_tax10_amount: 14000, sum_tax8_base: 0, sum_tax8_amount: 0, sum_total_inc_tax: 154000,
    }],
  }
  const items = {
    namespace: NS, tableName: 'delivery_items', partitionKeys: ['report_id'], clusteringKeys: ['line_no'], secondaryIndexes: [],
    columns: [
      { name: 'report_id', type: 'TEXT' }, { name: 'line_no', type: 'INT' }, { name: 'product_code', type: 'TEXT' },
      { name: 'item_item_name', type: 'TEXT' }, { name: 'item_quantity', type: 'DOUBLE' },
      { name: 'item_unit', type: 'TEXT' }, { name: 'item_unit_price', type: 'DOUBLE' }, { name: 'item_amount', type: 'DOUBLE' },
    ],
    rows: [
      { report_id: RID.delivery, line_no: 1, product_code: 'W-001', item_item_name: 'ウィジェットA', item_quantity: 10, item_unit: '個', item_unit_price: 5000, item_amount: 50000 },
      { report_id: RID.delivery, line_no: 2, product_code: 'W-002', item_item_name: 'ウィジェットB', item_quantity: 5, item_unit: '個', item_unit_price: 8000, item_amount: 40000 },
      { report_id: RID.delivery, line_no: 3, product_code: 'S-001', item_item_name: '設置作業費', item_quantity: 1, item_unit: '式', item_unit_price: 30000, item_amount: 30000 },
      { report_id: RID.delivery, line_no: 4, product_code: 'M-001', item_item_name: '保守サポート（年間）', item_quantity: 1, item_unit: '式', item_unit_price: 20000, item_amount: 20000 },
    ],
  }
  return [header, items]
}

function receiptTables() {
  const header = {
    namespace: NS, tableName: 'receipt_header', partitionKeys: ['report_id'], clusteringKeys: [], secondaryIndexes: ['doc_no'],
    columns: [
      { name: 'report_id', type: 'TEXT' }, { name: 'doc_no', type: 'TEXT' }, { name: 'doc_issue_date', type: 'TEXT' },
      { name: 'doc_proviso', type: 'TEXT' }, { name: 'doc_registration_no', type: 'TEXT' },
      { name: 'cust_customer_name', type: 'TEXT' },
      { name: 'sum_subtotal', type: 'DOUBLE' }, { name: 'sum_tax_amount', type: 'DOUBLE' }, { name: 'sum_total_inc_tax', type: 'DOUBLE' },
    ],
    rows: [{
      report_id: RID.receipt, doc_no: 'RCP-2026-0007', doc_issue_date: '2026年4月20日',
      doc_proviso: 'システム開発費用として', doc_registration_no: 'T1234567890123',
      cust_customer_name: '株式会社サンプル商事', sum_subtotal: 140000, sum_tax_amount: 14000, sum_total_inc_tax: 154000,
    }],
  }
  return [header]
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
const delivery = buildDeliveryNote()
write(join(TPL, 'delivery-note.json'), delivery)
const receipt = buildReceipt()
write(join(TPL, 'receipt.json'), receipt)

const base = read(join(DIR, '_base-seed.json'))
const seed = { namespace: NS, tables: [...base.tables, ...deliveryTables(), ...receiptTables()] }
write(join(DIR, 'db-seed.json'), seed)

console.log('✓ generated templates/delivery-note.json (%d elements)', delivery.definition.pages[0].sections[0].elements.length)
console.log('✓ generated templates/receipt.json (%d elements)', receipt.definition.pages[0].sections[0].elements.length)
console.log('✓ generated db-seed.json (%d tables)', seed.tables.length)
