#!/usr/bin/env node
/**
 * seed.mjs — サンプル帳票をバックエンドに投入
 *
 * 1. db-seed.json の ScalarDB テーブルを作成し、サンプル行を upsert
 *    （ScalarDB のトランザクション層を通すため HTTP 経由。生 SQLite 書込は不可）
 * 2. templates/*.json を v2_definitions に admin所有の public テンプレートとして保存
 *    （これで currentTemplateId が付き、ライブプレビューが機能する）
 *
 * 冪等: create-table は存在すれば no-op、行は DELETE→INSERT、テンプレ id は
 * server/data/sample-form-ids.json（gitignore）に記憶して再実行で更新。
 *
 * 前提: バックエンドが :8080 で稼働（npm run dev:backend）
 * 実行: npm run seed:samples
 * Env:  API_BASE(http://localhost:8080) / ADMIN_USER(admin) / ADMIN_PASSWORD(changeme)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const TPL = join(DIR, 'templates')
const ID_MAP_PATH = join(DIR, '..', '..', 'server', 'data', 'sample-form-ids.json')
const BASE = process.env.API_BASE ?? 'http://localhost:8080'
const USER = process.env.ADMIN_USER ?? 'admin'
const PASS = process.env.ADMIN_PASSWORD ?? 'changeme'

// テンプレート表示順（ファイル名 → 表示名は metadata.name）
const TEMPLATE_ORDER = ['invoice', 'quotation', 'purchase-order', 'delivery-note', 'receipt']

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

async function createTable(t) {
  const r = await api('POST', '/api/v2/scalardb/tables', {
    namespace: t.namespace, tableName: t.tableName, columns: t.columns,
    partitionKeys: t.partitionKeys, clusteringKeys: t.clusteringKeys ?? [],
    secondaryIndexes: t.secondaryIndexes ?? [],
  })
  if (r.status === 201) return 'created'
  if (/exist/i.test(r.text)) return 'exists'
  throw new Error(`create ${t.namespace}.${t.tableName} failed [${r.status}]: ${r.text}`)
}

async function upsertRow(t, row) {
  const keys = {}
  for (const k of [...t.partitionKeys, ...(t.clusteringKeys ?? [])]) keys[k] = row[k]
  await api('DELETE', `/api/v2/scalardb/tables/${t.namespace}/${t.tableName}/rows`, { keys })
  const r = await api('POST', `/api/v2/scalardb/tables/${t.namespace}/${t.tableName}/rows`, { values: row })
  if (r.status !== 201) throw new Error(`insert into ${t.tableName} failed [${r.status}]: ${r.text}`)
}

async function ensureTemplate(fileId, idMap, def) {
  let id = idMap[fileId]
  if (id) {
    const got = await api('GET', `/api/v2/templates/${id}`)
    if (got.status !== 200) id = null // 消えている（fresh DB） → 作り直し
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

  // 1) テーブル＋行
  const spec = JSON.parse(readFileSync(join(DIR, 'db-seed.json'), 'utf8'))
  for (const t of spec.tables) {
    const state = await createTable(t)
    for (const row of t.rows) await upsertRow(t, row)
    console.log(`✓ ${t.namespace}.${t.tableName.padEnd(16)} ${state.padEnd(7)} + ${t.rows.length} rows`)
  }

  // 2) テンプレート（public 保存）
  const files = readdirSync(TPL).filter((f) => f.endsWith('.json'))
  const ordered = [...TEMPLATE_ORDER.map((n) => `${n}.json`).filter((f) => files.includes(f)),
                   ...files.filter((f) => !TEMPLATE_ORDER.map((n) => `${n}.json`).includes(f))]
  const idMap = existsSync(ID_MAP_PATH) ? JSON.parse(readFileSync(ID_MAP_PATH, 'utf8')) : {}
  for (const f of ordered) {
    const fileId = f.replace(/\.json$/, '')
    const def = JSON.parse(readFileSync(join(TPL, f), 'utf8')).definition
    const id = await ensureTemplate(fileId, idMap, def)
    idMap[fileId] = id
    console.log(`✓ ${(def.metadata?.name ?? fileId).padEnd(10)} ${fileId.padEnd(16)} → ${id}  (public)`)
  }
  writeFileSync(ID_MAP_PATH, JSON.stringify(idMap, null, 2) + '\n')

  console.log(`\n✓ ${spec.tables.length} tables + ${ordered.length} templates seeded.`)
  console.log('  テンプレート modal → 公開テンプレート から読み込み、ライブプレビューで実データ取得できます。')
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
