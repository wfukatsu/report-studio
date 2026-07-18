#!/usr/bin/env node
/**
 * seed-demo-products.mjs
 *
 * Seeds the shared product master (report_studio$products, via ProductController)
 * with the demo catalogue that the coded line items reference by product_code.
 * This is what makes the model "proper": products live once in the master, and
 * documents reference them by code (snapshotting name/price for history).
 *
 * Idempotent: a product whose code already exists is skipped (the backend
 * enforces code uniqueness via a sentinel and returns 409).
 *
 * Usage: node scripts/seed-demo-products.mjs   (backend must be up)
 */
const BASE = process.env.API_BASE ?? 'http://localhost:8080'
const USER = process.env.ADMIN_USER ?? 'admin'
const PASS = process.env.ADMIN_PASSWORD ?? 'changeme'

// The catalogue referenced by the three "modern" templates' coded line items.
const PRODUCTS = [
  { code: 'W-001', name: 'ウィジェットA', unitPrice: 5000, unit: '個', taxType: 'standard', category: '製品' },
  { code: 'W-002', name: 'ウィジェットB', unitPrice: 8000, unit: '個', taxType: 'standard', category: '製品' },
  { code: 'S-001', name: '設置作業費', unitPrice: 30000, unit: '式', taxType: 'standard', category: '役務' },
  { code: 'M-001', name: '保守サポート（年間）', unitPrice: 20000, unit: '式', taxType: 'standard', category: '役務' },
]

let cookie = ''
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, text: await res.text(), setCookie: res.headers.get('set-cookie') }
}

async function main() {
  const login = await api('POST', '/api/v1/auth/login', { userId: USER, password: PASS })
  if (login.status !== 200 || !login.setCookie) throw new Error(`login failed [${login.status}]: ${login.text}`)
  cookie = login.setCookie.split(';')[0]
  console.log(`✓ logged in as ${USER}`)

  for (const p of PRODUCTS) {
    const r = await api('POST', '/api/v1/products', p)
    if (r.status === 201) console.log(`✓ ${p.code.padEnd(6)} ${p.name} — created`)
    else if (r.status === 409 || /exist|conflict|duplicate/i.test(r.text)) console.log(`= ${p.code.padEnd(6)} ${p.name} — exists`)
    else throw new Error(`create ${p.code} failed [${r.status}]: ${r.text}`)
  }
  console.log(`\n✓ product master seeded (${PRODUCTS.length} items)`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
