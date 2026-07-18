#!/usr/bin/env node
/**
 * report-studio CLI — drive the Report Studio backend from the terminal (#165).
 *
 * A thin, dependency-free wrapper over the REST API so every product goal
 * (template management, single/batch PDF output, schema/DB operations, job
 * status) is scriptable — not just clickable. Auth is the same session-cookie
 * flow the browser uses; the cookie is persisted to a jar file so subsequent
 * commands don't re-login.
 *
 * Usage:
 *   node scripts/cli/report-studio.mjs <command> [options]
 *   npm run cli -- <command> [options]
 *
 * Run `... help` for the full command list. Global options:
 *   --url <base>     Backend base URL (default $REPORT_STUDIO_URL or http://localhost:8080)
 *   --json           Machine-readable JSON output where applicable
 *   --user/--password  Credentials for `login` (default admin/changeme for dev)
 *
 * Design notes:
 *   - No npm dependencies — uses global fetch (Node 18+) and node:fs/os only.
 *   - The cookie jar lives at ~/.report-studio/cookies (override: $REPORT_STUDIO_HOME).
 *   - State-changing requests send an Origin header to satisfy the server's CSRF check.
 *   - Batch/job commands poll to completion and stream the ZIP/PDF to disk.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Readable } from 'node:stream'

// ---------------------------------------------------------------------------
// Config & tiny arg parser
// ---------------------------------------------------------------------------

const HOME = process.env.REPORT_STUDIO_HOME || join(homedir(), '.report-studio')
const COOKIE_JAR = join(HOME, 'cookies')

function parseArgs(argv) {
  const positionals = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      positionals.push(a)
    }
  }
  return { positionals, flags }
}

const { positionals, flags } = parseArgs(process.argv.slice(2))
const command = positionals[0]
const BASE_URL = (flags.url || process.env.REPORT_STUDIO_URL || 'http://localhost:8080').replace(/\/$/, '')
const JSON_OUT = Boolean(flags.json)

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function out(msg) { process.stdout.write(msg + '\n') }
function err(msg) { process.stderr.write(msg + '\n') }
function die(msg, code = 1) { err(`✗ ${msg}`); process.exit(code) }
function printJson(obj) { out(JSON.stringify(obj, null, 2)) }

// ---------------------------------------------------------------------------
// Cookie jar (persisted session)
// ---------------------------------------------------------------------------

function loadCookie() {
  try { return readFileSync(COOKIE_JAR, 'utf8').trim() } catch { return '' }
}

function saveCookie(setCookieHeader) {
  if (!setCookieHeader) return
  // Keep only the name=value part of each Set-Cookie entry.
  const cookie = setCookieHeader.split(/,(?=[^ ;]+=)/).map((c) => c.split(';')[0].trim()).join('; ')
  if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true })
  writeFileSync(COOKIE_JAR, cookie, { mode: 0o600 })
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function api(method, path, { body, raw = false, formData } = {}) {
  // Deliberately send NO Origin header: the server's CSRF filter only rejects a
  // *present, mismatched* Origin, so non-browser clients (curl, this CLI) pass by
  // omitting it. Sending the backend's own origin trips a CORS 400.
  const headers = {}
  const cookie = loadCookie()
  if (cookie) headers.Cookie = cookie
  let payload
  if (formData) {
    payload = formData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload })
  } catch (e) {
    die(`バックエンドに接続できません (${BASE_URL}): ${e.message}. サーバー起動と --url を確認してください。`)
  }
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) saveCookie(setCookie)
  // Friendly auth errors instead of a raw HTTP dump (#174). 401 on `login`
  // itself means bad credentials, not a missing session.
  if (res.status === 401 && path !== '/api/v1/auth/login') {
    die('ログインしていません。`report-studio login` を実行してください（セッション切れの可能性もあります）。')
  }
  if (res.status === 403) {
    die('権限がありません。この操作には別の権限（管理者など）が必要です。')
  }
  if (raw) return res
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  if (!res.ok) {
    const detail = json && typeof json === 'object' && json.error ? json.error : text
    die(`${method} ${path} → HTTP ${res.status}: ${detail || '(no body)'}`)
  }
  return json
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdLogin() {
  const userId = flags.user || 'admin'
  const password = flags.password || 'changeme'
  const res = await api('POST', '/api/v1/auth/login', { body: { userId, password } })
  if (JSON_OUT) return printJson(res)
  out(`✓ ログインしました: ${res.userId} (${(res.roles || []).join(', ')})`)
  out(`  セッションを ${COOKIE_JAR} に保存しました`)
}

async function cmdWhoami() {
  const res = await api('GET', '/api/v1/auth/me')
  if (JSON_OUT) return printJson(res)
  if (res.anonymous) return out('未ログインです。`login` を実行してください。')
  out(`${res.userId} — ${res.displayName || ''} [${(res.roles || []).join(', ')}]`)
}

function templateItems(res) {
  return Array.isArray(res) ? res : (res.items || res.templates || [])
}

async function cmdTemplatesList() {
  const res = await api('GET', '/api/v2/templates')
  const items = templateItems(res)
  if (JSON_OUT) return printJson(items)
  if (items.length === 0) return out('テンプレートがありません。')
  out(pad('ID', 38) + pad('名前', 20) + pad('公開範囲', 10) + '更新')
  for (const t of items) {
    out(pad(t.id, 38) + pad(t.name ?? '', 20) + pad(t.visibility ?? '', 10) + (t.updatedAt ?? ''))
  }
}

async function cmdTemplateGet(id) {
  if (!id) die('テンプレートIDを指定してください: templates get <id>')
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}`)
  printJson(res)
}

async function cmdTemplateExport(id) {
  if (!id) die('テンプレートIDを指定してください: templates export <id> [--out file.json]')
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}/export`)
  const file = flags.out || `${id}.rds2.json`
  writeFileSync(file, JSON.stringify(res, null, 2))
  out(`✓ エクスポートしました → ${file}`)
}

async function cmdTemplateImport(file) {
  if (!file) die('ファイルを指定してください: templates import <file.json>')
  const content = readFileSync(file, 'utf8')
  const res = await api('POST', '/api/v2/templates/import', { body: JSON.parse(content) })
  if (JSON_OUT) return printJson(res)
  out(`✓ インポートしました: ${res.name} (${res.id})`)
}

async function cmdTemplateDelete(id) {
  if (!id) die('テンプレートIDを指定してください: templates delete <id>')
  await api('DELETE', `/api/v2/templates/${encodeURIComponent(id)}`, { raw: true })
  out(`✓ 削除しました: ${id}`)
}

async function streamToFile(res, file) {
  const stream = createWriteStream(file)
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(stream).on('finish', resolve).on('error', reject)
  })
}

async function cmdPdf(id) {
  if (!id) die('テンプレートIDを指定してください: pdf <templateId> [--data data.json] [--out file.pdf]')
  let body = {}
  if (flags.data) {
    const testData = JSON.parse(readFileSync(flags.data, 'utf8'))
    body = { testData }
  }
  const res = await api('POST', `/api/v2/templates/${encodeURIComponent(id)}/pdf`, { body, raw: true })
  if (!res.ok) die(`PDF生成に失敗しました (HTTP ${res.status})`)
  const file = flags.out || `${id}.pdf`
  await streamToFile(res, file)
  out(`✓ PDFを生成しました → ${file}`)
}

async function cmdBatch(id) {
  if (!id) die('テンプレートIDを指定してください: batch <templateId> --csv rows.csv [--out dir/]')
  if (!flags.csv) die('CSVファイルを指定してください: batch <templateId> --csv rows.csv')
  const rows = parseCsv(readFileSync(flags.csv, 'utf8'))
  if (rows.length === 0) die('CSVに行がありません。')
  const outDir = flags.out || `${id}-batch`
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  // Render each row through the reliable per-template PDF endpoint (the V1 CSV job
  // path relies on legacy projections that V2 templates don't have). Header row
  // keys use dot-notation (e.g. customer.customerName) → nested testData.
  out(`… ${rows.length} 行をレンダリングします...`)
  let ok = 0
  for (let i = 0; i < rows.length; i++) {
    const testData = expandDotKeys(rows[i])
    const res = await api('POST', `/api/v2/templates/${encodeURIComponent(id)}/pdf`, { body: { testData }, raw: true })
    if (!res.ok) { err(`  行 ${i + 1}: 失敗 (HTTP ${res.status})`); continue }
    const nameCol = flags.name && rows[i][flags.name] ? sanitizeFilename(rows[i][flags.name]) : String(i + 1).padStart(4, '0')
    const file = join(outDir, `${nameCol}.pdf`)
    await streamToFile(res, file)
    ok++
  }
  out(`✓ 一括PDF (${ok}/${rows.length} 成功) → ${outDir}/`)
}

/** Minimal RFC-4180-ish CSV parser: header row + quoted-field support. */
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const parseLine = (line) => {
    const cells = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') inQ = false
        else cur += c
      } else if (c === '"') inQ = true
      else if (c === ',') { cells.push(cur); cur = '' }
      else cur += c
    }
    cells.push(cur)
    return cells
  }
  const header = parseLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = parseLine(line)
    const row = {}
    header.forEach((h, idx) => { row[h] = cells[idx] ?? '' })
    return row
  })
}

/** Expand dot-notation keys ({"a.b": 1}) into nested objects ({a:{b:1}}). */
function expandDotKeys(flat) {
  const nested = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let node = nested
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = value
  }
  return nested
}

function sanitizeFilename(s) { return String(s).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) }

async function pollJob(jobId, { intervalMs = 1000, maxTries = 300 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const job = await api('GET', `/api/v1/jobs/${jobId}`)
    if (job.terminal || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return job
    await sleep(intervalMs)
  }
  die(`ジョブがタイムアウトしました: ${jobId}`)
}

async function cmdResponsesList(templateId) {
  if (!templateId) die('テンプレートIDを指定してください: responses list <templateId>')
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(templateId)}/responses`)
  const items = res.items || []
  if (JSON_OUT) return printJson(items)
  if (items.length === 0) return out('回答がありません。')
  out(pad('RESPONSE ID', 38) + pad('状態', 10) + pad('提出者', 12) + '概要')
  for (const r of items) {
    out(pad(r.id, 38) + pad(r.status ?? '', 10) + pad(r.submittedBy ?? '', 12) + (r.summary || []).join(' / '))
  }
}

async function cmdResponseStatus(templateId, responseId, status) {
  if (!templateId || !responseId || !status) {
    die('使い方: responses status <templateId> <responseId> <draft|issued|sent|void>')
  }
  const res = await api('PATCH',
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}/status`,
    { body: { status } })
  if (JSON_OUT) return printJson(res)
  out(`✓ ステータスを更新しました: ${res.id} → ${res.status}`)
}

async function cmdResponsesSetStatus(templateId, status) {
  if (!templateId || !status) die('使い方: responses set-status <templateId> <status> --ids id1,id2,...  または --status-from <old>')
  if (!flags.ids && !flags['status-from']) die('--ids <カンマ区切り> か --status-from <既存ステータス> を指定してください')
  let ids
  if (flags.ids) {
    ids = String(flags.ids).split(',').map((s) => s.trim()).filter(Boolean)
  } else {
    const res = await api('GET', `/api/v2/templates/${encodeURIComponent(templateId)}/responses?status=${encodeURIComponent(flags['status-from'])}`)
    ids = (res.items || []).map((r) => r.id)
  }
  if (ids.length === 0) die('対象の回答がありません。')
  let ok = 0
  for (const id of ids) {
    const r = await api('PATCH', `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(id)}/status`, { body: { status } })
    if (r?.status === status) ok++
  }
  out(`✓ ${ok}/${ids.length} 件を ${status} に変更しました`)
}

async function cmdJobsList() {
  const res = await api('GET', '/api/v1/jobs')
  const jobs = Array.isArray(res) ? res : (res.jobs || [])
  if (JSON_OUT) return printJson(jobs)
  if (jobs.length === 0) return out('ジョブがありません。')
  out(pad('JOB ID', 40) + pad('種別', 10) + pad('状態', 12) + '進捗')
  for (const j of jobs) {
    out(pad(j.jobId, 40) + pad(j.jobType ?? '', 10) + pad(j.status ?? '', 12) + `${j.processedItems ?? 0}/${j.totalItems ?? 0}`)
  }
}

async function cmdJobStatus(jobId) {
  if (!jobId) die('ジョブIDを指定してください: jobs status <jobId>')
  const res = await api('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}`)
  printJson(res)
}

async function cmdDbTables() {
  const res = await api('GET', '/api/v2/scalardb/catalog')
  if (JSON_OUT) return printJson(res)
  for (const ns of res.namespaces || []) {
    out(`${ns.name}`)
    for (const t of ns.tables || []) out(`  ${t.name}`)
  }
}

async function cmdDbRows(nsTable) {
  if (!nsTable || !nsTable.includes('.')) die('ネームスペース.テーブル を指定してください: db rows <ns.table>')
  const [ns, table] = nsTable.split('.')
  const res = await api('GET', `/api/v2/scalardb/tables/${encodeURIComponent(ns)}/${encodeURIComponent(table)}/rows`)
  printJson(res)
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function pad(s, n) { s = String(s ?? ''); return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length) }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function printHelp() {
  out(`report-studio CLI — Report Studio backend をコマンドラインから操作

使い方:
  node scripts/cli/report-studio.mjs <command> [options]

認証:
  login                       ログイン（セッションを保存）  --user --password
  whoami                      現在のユーザーを表示

テンプレート:
  templates list              テンプレート一覧
  templates get <id>          テンプレート定義を表示
  templates export <id>       エクスポート  --out file.json
  templates import <file>     インポート
  templates delete <id>       削除

出力:
  pdf <id>                    単票PDF生成  --data data.json --out file.pdf
  batch <id> --csv rows.csv   CSVから一括PDF  --out dir/  --name <col>

回答・ステータス:
  responses list <id>         回答一覧（ステータス付き）
  responses status <id> <rid> <draft|issued|sent|void>   単体ステータス変更
  responses set-status <id> <status> --ids a,b  または --status-from <old>   一括変更

ジョブ:
  jobs list                   ジョブ一覧
  jobs status <jobId>         ジョブ状態

データベース:
  db tables                   ScalarDB テーブル一覧
  db rows <ns.table>          行をスキャン

グローバルオプション:
  --url <base>                バックエンドURL (default: $REPORT_STUDIO_URL or http://localhost:8080)
  --json                      JSON 出力
  --help                      このヘルプ

例:
  node scripts/cli/report-studio.mjs login
  node scripts/cli/report-studio.mjs templates list
  node scripts/cli/report-studio.mjs pdf <id> --out invoice.pdf
  node scripts/cli/report-studio.mjs batch <id> --csv rows.csv --out out/`)
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function main() {
  if (!command || command === 'help' || flags.help) return printHelp()
  const sub = positionals[1]
  switch (command) {
    case 'login': return cmdLogin()
    case 'whoami': return cmdWhoami()
    case 'templates':
      if (sub === 'list') return cmdTemplatesList()
      if (sub === 'get') return cmdTemplateGet(positionals[2])
      if (sub === 'export') return cmdTemplateExport(positionals[2])
      if (sub === 'import') return cmdTemplateImport(positionals[2])
      if (sub === 'delete') return cmdTemplateDelete(positionals[2])
      return die(`不明なサブコマンド: templates ${sub ?? ''}`)
    case 'pdf': return cmdPdf(sub)
    case 'batch': return cmdBatch(sub)
    case 'responses':
      if (sub === 'list') return cmdResponsesList(positionals[2])
      if (sub === 'status') return cmdResponseStatus(positionals[2], positionals[3], positionals[4])
      if (sub === 'set-status') return cmdResponsesSetStatus(positionals[2], positionals[3])
      return die(`不明なサブコマンド: responses ${sub ?? ''}`)
    case 'jobs':
      if (sub === 'list') return cmdJobsList()
      if (sub === 'status') return cmdJobStatus(positionals[2])
      return die(`不明なサブコマンド: jobs ${sub ?? ''}`)
    case 'db':
      if (sub === 'tables') return cmdDbTables()
      if (sub === 'rows') return cmdDbRows(positionals[2])
      return die(`不明なサブコマンド: db ${sub ?? ''}`)
    default:
      return die(`不明なコマンド: ${command}（\`help\` で一覧表示）`)
  }
}

main().catch((e) => die(e?.message || String(e)))
