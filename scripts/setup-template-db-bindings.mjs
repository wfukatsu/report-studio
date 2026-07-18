#!/usr/bin/env node
/**
 * setup-template-db-bindings.mjs
 *
 * Wires the six business built-in templates to real ScalarDB demo tables:
 *   1. Ensures each template has a flat 2-level schema (dataKey → fieldKey).
 *      The three legacy quotation templates (basic / discount / english) use a
 *      3-level nested `quotation.*` shape that the schema-binding model can't
 *      express — this script flattens them (element fieldKeys + sample data +
 *      new schema.groups) into the same document/customer/sender/summary/items
 *      shape the "modern" templates already use.
 *   2. Sets `tableMeta` on every group and `dbColumnName` on every field so the
 *      designer's "ライブプレビュー" panel can fetch live rows from ScalarDB.
 *   3. Emits scripts/demo-db-seed.json — the table DDL + seed rows the companion
 *      seed script (seed-demo-scalardb.mjs) POSTs to the backend.
 *
 * Idempotent: re-running produces the same output (deterministic ids are only
 * generated for synthetic key fields, keyed off the group id).
 *
 * Run from repo root:  node scripts/setup-template-db-bindings.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUILTIN_DIR = join(__dirname, '..', 'src', 'templates', 'builtin')
const NAMESPACE = 'demo'

// Deterministic uuid-ish id from a seed string (stable across runs).
function stableId(seed) {
  const h = createHash('sha1').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

const snake = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase()

// SchemaFieldType → ScalarDB column type. Dates are stored as their pre-formatted
// display strings (TEXT) so live rows render identically to the sample data.
const colType = (fieldType) =>
  fieldType === 'number' ? 'DOUBLE' : fieldType === 'boolean' ? 'BOOLEAN' : 'TEXT'

// Group dataKey → short column prefix used inside the shared *_header table.
const GROUP_PREFIX = {
  document: 'doc',
  quotation: 'doc',
  customer: 'cust',
  sender: 'snd',
  summary: 'sum',
  bankAccount: 'bank',
  delivery: 'dlv',
}
const prefixFor = (dataKey) => GROUP_PREFIX[dataKey] ?? snake(dataKey).slice(0, 6)

// ---------------------------------------------------------------------------
// Per-template configuration
// ---------------------------------------------------------------------------

const CONFIGS = {
  'invoice-modern': { prefix: 'invmod', pkFieldKey: 'documentNo', restructure: false },
  'quotation-modern': { prefix: 'quomod', pkFieldKey: 'documentNo', restructure: false },
  'purchase-order-modern': { prefix: 'pomod', pkFieldKey: 'documentNo', restructure: false },
  'quotation-basic-invoice': { prefix: 'quobasic', pkFieldKey: 'number', restructure: true },
  'quotation-discount-invoice': { prefix: 'quodisc', pkFieldKey: 'number', restructure: true },
  'quotation-english': { prefix: 'quoeng', pkFieldKey: 'number', restructure: true },
}

// When flattening the legacy `quotation.*` shape, these leaf keys belong to the
// document group; every other scalar leaf goes to the summary group.
const DOC_LEAVES = new Set(['number', 'issueDate', 'registrationNo', 'validUntil', 'dueDate', 'orderNo'])

const LABELS = {
  document: '書類情報', customer: '顧客情報', sender: '発行元情報',
  summary: '集計情報', items: '明細', quotation: '書類情報',
}
const FIELD_LABELS = {
  number: '書類番号', issueDate: '発行日', registrationNo: '登録番号', validUntil: '有効期限',
  name: '名称', postalCode: '郵便番号', address: '住所', contact: '担当者', tel: '電話番号', email: 'メール',
  subtotal: '小計', total: '合計', totalAmountIncTax: '税込合計', discountTotal: '値引合計',
  tax10Base: '10%対象', tax10Amount: '10%消費税', tax8Base: '8%対象', tax8Amount: '8%消費税',
  itemName: '品名', description: '品名', quantity: '数量', unitPrice: '単価', amount: '金額',
  discount: '値引', itemCode: '品番', unit: '単位',
}

const inferType = (v) => (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string')

// ---------------------------------------------------------------------------
// Step 1 — restructure legacy quotation templates to the flat 2-level shape
// ---------------------------------------------------------------------------

function collectRepeatingItemKeys(def) {
  const keys = []
  const seen = new Set()
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (o && typeof o === 'object') {
      if (o.type === 'repeatingBand' && Array.isArray(o.fields)) {
        for (const f of o.fields) if (f.key && !seen.has(f.key)) { seen.add(f.key); keys.push(f.key) }
      }
      Object.values(o).forEach(walk)
    }
  }
  walk(def.pages)
  return keys
}

function remapQuotationFieldKey(key) {
  if (!key.startsWith('quotation.')) return key
  const rest = key.slice('quotation.'.length)
  if (rest.startsWith('customer.')) return 'customer.' + rest.slice('customer.'.length)
  if (rest.startsWith('sender.')) return 'sender.' + rest.slice('sender.'.length)
  return (DOC_LEAVES.has(rest) ? 'document.' : 'summary.') + rest
}

function restructureQuotation(def) {
  // Idempotency guard: the flatten is one-way (it consumes the nested
  // `quotation.*` sample object). If a prior run already flattened this
  // template, skip — bindTemplate() below is separately idempotent.
  const alreadyFlat = !def.dataSources?.[0]?.fields?.quotation
  if (alreadyFlat) return

  // 1a. element fieldKeys ---------------------------------------------------
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (o && typeof o === 'object') {
      if (o.type === 'dataField' && typeof o.fieldKey === 'string') o.fieldKey = remapQuotationFieldKey(o.fieldKey)
      Object.values(o).forEach(walk)
    }
  }
  walk(def.pages)

  // 1b. sample data ---------------------------------------------------------
  const ds = def.dataSources?.[0]
  const old = ds?.fields ?? {}
  const q = old.quotation ?? {}
  const nd = { document: {}, customer: {}, sender: {}, summary: {}, items: old.items ?? [] }
  for (const [k, v] of Object.entries(q)) {
    if (k === 'customer') nd.customer = { ...v }
    else if (k === 'sender') nd.sender = { ...v }
    else if (DOC_LEAVES.has(k)) nd.document[k] = v
    else nd.summary[k] = v
  }
  if (ds) ds.fields = nd

  // 1c. build schema.groups from the flattened sample -----------------------
  const masterOrder = ['document', 'customer', 'sender', 'summary']
  const groups = []
  for (const dataKey of masterOrder) {
    const obj = nd[dataKey]
    if (!obj || Object.keys(obj).length === 0) continue
    groups.push({
      id: stableId(`grp-${dataKey}`),
      label: LABELS[dataKey] ?? dataKey,
      role: 'master',
      dataKey,
      fields: Object.entries(obj).map(([key, v]) => ({
        id: stableId(`fld-${dataKey}-${key}`),
        key, label: FIELD_LABELS[key] ?? key, type: inferType(v),
      })),
    })
  }
  // detail (items)
  const itemKeys = collectRepeatingItemKeys(def)
  const sampleItem = nd.items?.[0] ?? {}
  for (const k of Object.keys(sampleItem)) if (!itemKeys.includes(k)) itemKeys.push(k)
  groups.push({
    id: stableId('grp-items'),
    label: LABELS.items, role: 'detail', dataKey: 'items',
    fields: itemKeys.map((key) => ({
      id: stableId(`fld-items-${key}`),
      key, label: FIELD_LABELS[key] ?? key, type: inferType(sampleItem[key]),
    })),
  })
  def.schema = { groups }
}

// ---------------------------------------------------------------------------
// Step 2 — attach tableMeta + dbColumnName, and build the DB spec
// ---------------------------------------------------------------------------

function bindTemplate(id, def) {
  const cfg = CONFIGS[id]
  const headerTable = `${cfg.prefix}_header`
  const itemsTable = `${cfg.prefix}_items`
  const groups = def.schema.groups

  const primary = groups.find((g) => g.role === 'master' && g.fields.some((f) => f.key === cfg.pkFieldKey))
  if (!primary) throw new Error(`${id}: primary group with pk field "${cfg.pkFieldKey}" not found`)

  const headerCols = new Map() // colName → type   (doc_no added first)
  headerCols.set('doc_no', 'TEXT')
  const itemCols = new Map()

  const sample = def.dataSources?.[0]?.fields ?? {}
  const headerRow = { doc_no: String(sample[primary.dataKey]?.[cfg.pkFieldKey] ?? '') }
  const itemRows = []

  for (const g of groups) {
    if (g.role === 'detail') {
      g.tableMeta = { namespace: NAMESPACE, tableName: itemsTable }
      g.linkedMasterGroupId = primary.id
      for (const f of g.fields) {
        const col = `item_${snake(f.key)}`
        f.dbColumnName = col
        itemCols.set(col, colType(f.type))
      }
      const rows = sample[g.dataKey] ?? []
      rows.forEach((r, i) => {
        const row = { doc_no: headerRow.doc_no, line_no: i + 1 }
        for (const f of g.fields) if (r[f.key] !== undefined) row[`item_${snake(f.key)}`] = r[f.key]
        itemRows.push(row)
      })
      continue
    }

    // master group → shared header table
    g.tableMeta = { namespace: NAMESPACE, tableName: headerTable }
    const gp = prefixFor(g.dataKey)
    const isPrimary = g.id === primary.id

    // Aux master groups need a key field so the preview panel can supply doc_no.
    if (!isPrimary && !g.fields.some((f) => f.dbColumnName === 'doc_no')) {
      g.fields.unshift({
        id: stableId(`fld-${g.dataKey}-docNo`),
        key: 'docNo', label: '書類番号（キー）', type: 'string', dbColumnName: 'doc_no',
      })
    }
    for (const f of g.fields) {
      if (f.dbColumnName === 'doc_no') continue // synthetic / already the PK
      const col = isPrimary && f.key === cfg.pkFieldKey ? 'doc_no' : `${gp}_${snake(f.key)}`
      f.dbColumnName = col
      headerCols.set(col, colType(f.type))
      const v = sample[g.dataKey]?.[f.key]
      if (v !== undefined && col !== 'doc_no') headerRow[col] = v
    }
  }

  const tables = [
    {
      namespace: NAMESPACE, tableName: headerTable,
      columns: [...headerCols].map(([name, type]) => ({ name, type })),
      partitionKeys: ['doc_no'], clusteringKeys: [], secondaryIndexes: [],
      rows: [headerRow],
    },
    {
      namespace: NAMESPACE, tableName: itemsTable,
      columns: [
        { name: 'doc_no', type: 'TEXT' }, { name: 'line_no', type: 'INT' },
        ...[...itemCols].map(([name, type]) => ({ name, type })),
      ],
      partitionKeys: ['doc_no'], clusteringKeys: ['line_no'], secondaryIndexes: [],
      rows: itemRows,
    },
  ]
  return tables
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allTables = []
for (const [id, cfg] of Object.entries(CONFIGS)) {
  const file = join(BUILTIN_DIR, `${id}.json`)
  const envelope = JSON.parse(readFileSync(file, 'utf8'))
  const def = envelope.definition
  if (cfg.restructure) restructureQuotation(def)
  if (!def.schema?.groups?.length) throw new Error(`${id}: no schema.groups after prep`)
  const tables = bindTemplate(id, def)
  allTables.push(...tables)
  writeFileSync(file, JSON.stringify(envelope, null, 2) + '\n')
  const cols = tables.reduce((n, t) => n + t.columns.length, 0)
  const rows = tables.reduce((n, t) => n + t.rows.length, 0)
  console.log(`✓ ${id.padEnd(26)} → ${tables[0].tableName} + ${tables[1].tableName}  (${cols} cols, ${rows} rows)`)
}

const seedFile = join(__dirname, 'demo-db-seed.json')
writeFileSync(seedFile, JSON.stringify({ namespace: NAMESPACE, tables: allTables }, null, 2) + '\n')
console.log(`\n✓ wrote ${allTables.length} table specs → scripts/demo-db-seed.json`)
