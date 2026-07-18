#!/usr/bin/env node
/**
 * seed-demo-templates.mjs
 *
 * Persists the six DB-bound business built-in templates into the backend
 * (v2_definitions) as admin-owned **public** templates. This is what makes their
 * bindings "connected": a built-in loaded straight from JSON has no server id, so
 * `currentTemplateId` is null and the designer's ライブプレビュー panel never shows
 * — and resolve-bindings refuses templates it can't find server-side. Loading one
 * of these persisted copies (from the テンプレート modal's 公開 list) sets a real
 * `currentTemplateId`, the panel appears, and live ScalarDB binding works.
 *
 * Idempotent: backend ids are remembered in server/data/demo-template-ids.json
 * (gitignored). Re-running updates the same rows; if the recorded id is gone
 * (fresh DB) it recreates and rewrites the map.
 *
 * Prereq: run scripts/seed-demo-scalardb.mjs first (tables + rows must exist).
 * Usage:  node scripts/seed-demo-templates.mjs
 * Env:    API_BASE, ADMIN_USER, ADMIN_PASSWORD (see seed-demo-scalardb.mjs)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUILTIN_DIR = join(__dirname, '..', 'src', 'templates', 'builtin')
const ID_MAP_PATH = join(__dirname, '..', 'server', 'data', 'demo-template-ids.json')
const BASE = process.env.API_BASE ?? 'http://localhost:8080'
const USER = process.env.ADMIN_USER ?? 'admin'
const PASS = process.env.ADMIN_PASSWORD ?? 'changeme'

// Same six templates the binding generator wires to demo tables.
const TEMPLATE_IDS = [
  'invoice-modern', 'quotation-modern', 'purchase-order-modern',
  'quotation-basic-invoice', 'quotation-discount-invoice', 'quotation-english',
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

async function login() {
  const r = await api('POST', '/api/v1/auth/login', { userId: USER, password: PASS })
  if (r.status !== 200 || !r.setCookie) throw new Error(`login failed [${r.status}]: ${r.text}`)
  cookie = r.setCookie.split(';')[0]
  console.log(`✓ logged in as ${USER}`)
}

const loadMap = () => (existsSync(ID_MAP_PATH) ? JSON.parse(readFileSync(ID_MAP_PATH, 'utf8')) : {})

async function ensureTemplate(builtinId, idMap, def) {
  let id = idMap[builtinId]
  if (id) {
    const got = await api('GET', `/api/v2/templates/${id}`)
    if (got.status !== 200) id = null // stale (fresh DB) — recreate
  }
  if (!id) {
    const c = await api('POST', '/api/v2/templates', {})
    if (c.status !== 201) throw new Error(`create failed [${c.status}]: ${c.text}`)
    id = JSON.parse(c.text).id
  }
  const put = await api('PUT', `/api/v2/templates/${id}`, { formatVersion: 2, definition: def })
  if (put.status !== 200) throw new Error(`put ${id} failed [${put.status}]: ${put.text}`)
  const vis = await api('PUT', `/api/v2/templates/${id}/visibility`, { visibility: 'public' })
  if (vis.status !== 200) throw new Error(`visibility ${id} failed [${vis.status}]: ${vis.text}`)
  return id
}

async function main() {
  await login()
  const idMap = loadMap()
  for (const builtinId of TEMPLATE_IDS) {
    const def = JSON.parse(readFileSync(join(BUILTIN_DIR, `${builtinId}.json`), 'utf8')).definition
    const id = await ensureTemplate(builtinId, idMap, def)
    idMap[builtinId] = id
    console.log(`✓ ${builtinId.padEnd(26)} → ${id}  (public)`)
  }
  writeFileSync(ID_MAP_PATH, JSON.stringify(idMap, null, 2) + '\n')
  console.log(`\n✓ persisted ${TEMPLATE_IDS.length} connected templates. Load them from the`)
  console.log(`  テンプレート modal → 公開テンプレート list, then open the ライブプレビュー panel.`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
