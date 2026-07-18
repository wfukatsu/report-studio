#!/usr/bin/env node
/**
 * seed-demo-scalardb.mjs
 *
 * Creates the `demo` ScalarDB tables and seed rows that the six business
 * built-in templates bind to (see setup-template-db-bindings.mjs, which emits
 * scripts/demo-db-seed.json). Talks to the running backend over HTTP so rows go
 * through ScalarDB's transactional layer (raw SQLite writes would miss the tx
 * metadata columns).
 *
 * Idempotent: create-table is a no-op if the table already exists, and each row
 * is DELETE-then-INSERT so re-running refreshes the data cleanly.
 *
 * Usage:
 *   npm run dev:backend            # backend must be up on :8080
 *   node scripts/seed-demo-scalardb.mjs
 *
 * Env: API_BASE (default http://localhost:8080),
 *      ADMIN_USER (admin), ADMIN_PASSWORD (changeme)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.API_BASE ?? 'http://localhost:8080'
const USER = process.env.ADMIN_USER ?? 'admin'
const PASS = process.env.ADMIN_PASSWORD ?? 'changeme'

const spec = JSON.parse(readFileSync(join(__dirname, 'demo-db-seed.json'), 'utf8'))

let cookie = ''
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, text, setCookie: res.headers.get('set-cookie') }
}

async function login() {
  const r = await api('POST', '/api/v1/auth/login', { userId: USER, password: PASS })
  if (r.status !== 200) throw new Error(`login failed [${r.status}]: ${r.text}`)
  const sc = r.setCookie
  if (!sc) throw new Error('login returned no session cookie')
  cookie = sc.split(';')[0]
  console.log(`✓ logged in as ${USER}`)
}

async function createTable(t) {
  const r = await api('POST', '/api/v2/scalardb/tables', {
    namespace: t.namespace, tableName: t.tableName,
    columns: t.columns, partitionKeys: t.partitionKeys,
    clusteringKeys: t.clusteringKeys, secondaryIndexes: t.secondaryIndexes,
  })
  if (r.status === 201) return 'created'
  if (/exist/i.test(r.text)) return 'exists'
  throw new Error(`create ${t.namespace}.${t.tableName} failed [${r.status}]: ${r.text}`)
}

async function upsertRow(t, row) {
  const keys = {}
  for (const k of [...t.partitionKeys, ...t.clusteringKeys]) keys[k] = row[k]
  await api('DELETE', `/api/v2/scalardb/tables/${t.namespace}/${t.tableName}/rows`, { keys })
  const r = await api('POST', `/api/v2/scalardb/tables/${t.namespace}/${t.tableName}/rows`, { values: row })
  if (r.status !== 201) throw new Error(`insert into ${t.tableName} failed [${r.status}]: ${r.text}`)
}

async function main() {
  await login()
  for (const t of spec.tables) {
    const state = await createTable(t)
    for (const row of t.rows) await upsertRow(t, row)
    console.log(`✓ ${t.namespace}.${t.tableName.padEnd(18)} ${state.padEnd(7)} + ${t.rows.length} rows`)
  }
  console.log(`\n✓ seeded ${spec.tables.length} tables in namespace "${spec.namespace}"`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
