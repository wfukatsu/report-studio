#!/usr/bin/env node
/**
 * report-studio CLI — drive the Report Studio backend from the terminal (#165).
 *
 * A thin, dependency-free wrapper over the REST API so every product goal
 * (template management, single/batch PDF output, schema/DB operations, job
 * status) is scriptable — not just clickable.
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
 * Auth: prefer a PAT ($REPORT_STUDIO_TOKEN or `login --token`). The CLI sends no
 * Origin header, and the server's CSRF filter only exempts a missing Origin on
 * /api/v1/auth/* and /api/v1/public/* — so a *cookie* session can log in but is
 * rejected (403) on every other write. A Bearer PAT bypasses the CSRF check
 * outright (ApiRoutes.csrfRejectReason) and is the supported headless path.
 *
 * Design notes:
 *   - No npm dependencies — uses global fetch (Node 18+) and node:fs/os only.
 *   - The cookie jar lives at ~/.report-studio/cookies (override: $REPORT_STUDIO_HOME).
 *   - Shared HTTP / projection / ops layers live in ./lib (reusable by an MCP server).
 *   - Batch/job commands poll to completion and stream the ZIP/PDF to disk.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { Readable } from 'node:stream'

import { parseArgs, createConfig, flagValue } from './lib/config.mjs'
import { out, err, die, printJson, pad, sleep } from './lib/output.mjs'
import { createClient } from './lib/http.mjs'
import {
  unwrapEnvelope, buildSummary, formatSummary, buildOutline, formatOutline,
} from './lib/projection.mjs'
import { saveHandles, resolveElementRef, pruneHandles } from './lib/handles.mjs'
import { applyOps, checkInvariants, OpsError } from './lib/ops.mjs'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const { positionals, flags } = parseArgs(process.argv.slice(2))
const command = positionals[0]
const config = createConfig(flags)
const { baseUrl: BASE_URL, jsonOut: JSON_OUT, cookieJar: COOKIE_JAR, tokenFile: TOKEN_FILE } = config
const { api, saveToken } = createClient(config)

/** Full-template output guard: above this, `templates get` demands --force. */
const FULL_OUTPUT_LIMIT_BYTES = 40 * 1024

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdLogin() {
  // Token-based login (#195): save a PAT and verify it against an authenticated endpoint.
  if (flags.token && flags.token !== true) {
    saveToken(String(flags.token))
    // Verify by hitting an auth-required endpoint (Bearer works everywhere except /api/v1/auth/*).
    const res = await api('GET', '/api/v2/templates', { raw: true })
    if (!res.ok) die('トークンが無効です。管理画面「APIトークン」で発行した値を確認してください。')
    if (JSON_OUT) return printJson({ ok: true, tokenFile: TOKEN_FILE })
    out(`✓ トークンを保存しました → ${TOKEN_FILE}`)
    out('  以降のコマンドは Bearer 認証で実行されます（$REPORT_STUDIO_TOKEN でも指定可）。')
    return
  }
  const userId = flags.user || 'admin'
  const password = flags.password || 'changeme'
  const res = await api('POST', '/api/v1/auth/login', { body: { userId, password } })
  if (JSON_OUT) return printJson(res)
  out(`✓ ログインしました: ${res.userId} (${(res.roles || []).join(', ')})`)
  out(`  セッションを ${COOKIE_JAR} に保存しました`)
}

// ── Personal Access Tokens (#195) ────────────────────────────────────────────

async function cmdTokensList() {
  const res = await api('GET', '/api/v1/auth/tokens')
  const tokens = res.tokens || []
  if (JSON_OUT) return printJson(tokens)
  if (tokens.length === 0) return out('APIトークンがありません。')
  out(pad('ID', 20) + pad('ラベル', 20) + pad('プレビュー', 16) + '最終利用')
  for (const t of tokens) {
    out(pad((t.id || '').slice(0, 18), 20) + pad(t.label ?? '', 20) + pad(t.preview ?? '', 16)
      + (t.lastUsedAt ? new Date(t.lastUsedAt).toISOString() : '未使用'))
  }
}

async function cmdTokenCreate() {
  const label = flags.label && flags.label !== true ? String(flags.label) : ''
  const res = await api('POST', '/api/v1/auth/tokens', { body: { label } })
  if (JSON_OUT) return printJson(res)
  out(`✓ トークンを発行しました（この値は再表示されません）:`)
  out(`  ${res.token}`)
  out(`  保存例: report-studio login --token ${res.token}`)
}

async function cmdTokenRevoke(id) {
  if (!id) die('トークンIDを指定してください: tokens revoke <id>（IDは tokens list で確認）')
  await api('DELETE', `/api/v1/auth/tokens/${encodeURIComponent(id)}`, { raw: true })
  out(`✓ トークンを失効しました: ${id}`)
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

/** Fetch a template and split it into {definition, meta}. */
async function fetchTemplate(id) {
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}`)
  return { raw: res, ...unwrapEnvelope(res) }
}

async function cmdTemplateGet(id) {
  if (!id) die('テンプレートIDを指定してください: templates get <id> [--force] [--out file.json]')
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}`)
  const text = JSON.stringify(res, null, 2)

  const outFile = flagValue(flags, 'out')
  if (outFile) {
    writeFileEnsured(outFile, text)
    return out(`✓ 定義を書き出しました → ${outFile} (${text.length} bytes)`)
  }
  // Guard: a real template is 25-65 KB of JSON (~18-20k tokens). Dumping it to
  // stdout by reflex is the single easiest way to blow an agent's context, so
  // require an explicit --force and point at the cheap views first.
  if (text.length > FULL_OUTPUT_LIMIT_BYTES && !flags.force) {
    die(
      `定義が大きすぎます (${text.length} bytes > ${FULL_OUTPUT_LIMIT_BYTES})。\n` +
        `  → 概要は \`templates summary ${id}\`、要素一覧は \`templates outline ${id}\` を使ってください。\n` +
        '  → 全文が必要なら --force、ファイルに落とすなら --out <file> を付けてください。',
    )
  }
  printJson(res)
}

async function cmdTemplateSummary(id) {
  if (!id) die('テンプレートIDを指定してください: templates summary <id>')
  const { raw } = await fetchTemplate(id)
  const summary = buildSummary(unwrapEnvelope(raw))
  if (JSON_OUT) return printJson(summary)
  out(formatSummary(summary))
}

async function cmdTemplateOutline(id) {
  if (!id) die('テンプレートIDを指定してください: templates outline <id> [--page N]')
  const { definition, meta } = await fetchTemplate(id)
  const pageArg = flagValue(flags, 'page')
  const outline = buildOutline(definition, {
    pageFilter: pageArg === undefined ? undefined : Number(pageArg),
  })
  // Persist the handle map so `templates edit --ops` can accept e1/e2/… later.
  const handleFile = saveHandles(config, id, meta.updatedAt, outline.map)
  pruneHandles(config)
  if (JSON_OUT) return printJson({ meta, ...outline, handleFile })
  out(formatOutline({ ...meta, pageCount: (definition.pages ?? []).length }, outline, handleFile))
}

async function cmdTemplateCreate(name) {
  if (!name) die('名前を指定してください: templates create <name> [--from <id>] [--import <file>]')
  const importFile = flagValue(flags, 'import')
  const fromId = flagValue(flags, 'from')

  if (importFile) {
    const parsed = JSON.parse(readFileSync(importFile, 'utf8'))
    // The import endpoint requires the canonical envelope; wrap a bare definition.
    const envelope = parsed.formatVersion ? parsed : { formatVersion: 2, definition: parsed }
    const res = await api('POST', '/api/v2/templates/import', { body: envelope })
    // The endpoint answers {id, name}; never echo a whole definition back.
    const summary = { id: res.id, name: res.name }
    if (JSON_OUT) return printJson(summary)
    return out(`✓ インポートしました: ${summary.name} (${summary.id})`)
  }
  if (fromId) {
    const res = await api('POST', `/api/v2/templates/${encodeURIComponent(fromId)}/duplicate`, {
      body: { name },
    })
    if (JSON_OUT) return printJson(res)
    return out(`✓ 複製しました: ${res.name ?? name} (${res.id})`)
  }
  const res = await api('POST', '/api/v2/templates', { body: { name } })
  if (JSON_OUT) return printJson(res)
  out(`✓ 作成しました: ${res.name ?? name} (${res.id})`)
}

// ── versions (undo for `templates edit`) ─────────────────────────────────────

async function cmdVersionsList(id) {
  if (!id) die('テンプレートIDを指定してください: templates versions list <id>')
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}/versions`)
  const items = Array.isArray(res) ? res : (res.items ?? [])
  if (JSON_OUT) return printJson(items)
  if (items.length === 0) return out('バージョンがありません。')
  out(pad('VERSION ID', 38) + pad('作成', 26) + '作成者')
  for (const v of items) out(pad(v.id, 38) + pad(v.createdAt ?? '', 26) + (v.createdBy ?? ''))
}

/** Snapshot whatever is currently stored. Returns the new version item. */
async function snapshotVersion(id) {
  return api('POST', `/api/v2/templates/${encodeURIComponent(id)}/versions`, { body: {} })
}

async function cmdVersionsSnapshot(id) {
  if (!id) die('テンプレートIDを指定してください: templates versions snapshot <id>')
  const v = await snapshotVersion(id)
  if (JSON_OUT) return printJson(v)
  out(`✓ スナップショットを作成しました: ${v.id} (${v.createdAt})`)
}

async function cmdVersionsRestore(id, versionId) {
  if (!id || !versionId) die('使い方: templates versions restore <id> <versionId>')
  // The restore endpoint only *returns* the archived definition — the frontend
  // saves it back. Do the same here, otherwise "restore" would change nothing.
  const archived = await api(
    'POST',
    `/api/v2/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
  )
  const definition = archived?.definition
  if (!definition) die('復元対象の定義を取得できませんでした。')

  // Snapshot the state we are about to overwrite, so restore is itself undoable.
  if (!flags['no-snapshot']) {
    const v = await snapshotVersion(id)
    out(`  復元前の状態を ${v.id} として保存しました`)
  }
  const saved = await api('PUT', `/api/v2/templates/${encodeURIComponent(id)}`, {
    body: { formatVersion: 2, definition },
  })
  const meta = unwrapEnvelope(saved).meta
  saveHandles(config, id, meta.updatedAt, {})
  if (JSON_OUT) return printJson({ id, restoredFrom: versionId, updatedAt: meta.updatedAt })
  out(`✓ ${versionId} から復元しました → ${id} (updatedAt=${meta.updatedAt})`)
  out(`  ハンドルは無効化されました。\`templates outline ${id}\` を実行してください。`)
}

async function cmdTemplateEdit(id) {
  if (!id) die('使い方: templates edit <id> --ops ops.json [--expect-updated-at <iso>] [--dry-run]')
  const opsFile = flagValue(flags, 'ops')
  if (!opsFile) die('--ops <file.json> を指定してください（{"ops":[…]} 形式）。')

  let parsed
  try {
    parsed = JSON.parse(readFileSync(opsFile, 'utf8'))
  } catch (e) {
    die(`ops ファイルを読めません (${opsFile}): ${e.message}`)
  }
  const ops = Array.isArray(parsed) ? parsed : parsed.ops

  const { definition, meta } = await fetchTemplate(id)
  const expected = flagValue(flags, 'expect-updated-at')
  if (expected && expected !== meta.updatedAt) {
    die(
      `[VERSION_CONFLICT] テンプレートは更新されています（期待 ${expected} / 現在 ${meta.updatedAt}）。\n` +
        `  → \`templates outline ${id}\` で取り直して再実行してください。`,
    )
  }

  let result
  try {
    result = applyOps(definition, ops, (ref) => resolveElementRef(config, id, ref, meta.updatedAt))
  } catch (e) {
    if (e instanceof OpsError) die(`ops の適用に失敗しました:\n  ${e.errors.join('\n  ')}`)
    throw e
  }

  for (const line of result.diff) out(`  ${line}`)
  for (const w of result.warnings) err(`  ⚠ ${w}`)

  if (flags['dry-run']) {
    return out(`✓ dry-run: ${result.diff.length} 件の変更を検証しました（保存していません）`)
  }

  // Snapshot BEFORE the PUT — `templates edit` overwrites in place and the server
  // has no undo. Opt-out rather than opt-in: the failure mode we are guarding
  // against is precisely forgetting to snapshot, and a safety net you have to
  // remember is not a safety net.
  if (!flags['no-snapshot']) {
    const v = await snapshotVersion(id)
    out(`  変更前の状態を ${v.id} として保存しました（復元: templates versions restore ${id} ${v.id}）`)
  }

  const saved = await api('PUT', `/api/v2/templates/${encodeURIComponent(id)}`, {
    body: { formatVersion: 2, definition },
  })
  const newMeta = unwrapEnvelope(saved).meta
  // Element IDs may have changed; the stale handle map must not be reused.
  saveHandles(config, id, newMeta.updatedAt, {})
  if (JSON_OUT) return printJson({ id, updatedAt: newMeta.updatedAt, diff: result.diff, warnings: result.warnings })
  out(`✓ ${result.diff.length} ops 適用 → ${id} (updatedAt=${newMeta.updatedAt})`)
  out(`  ハンドルは無効化されました。再編集の前に \`templates outline ${id}\` を実行してください。`)
}

async function cmdTemplateValidate(id) {
  if (!id) die('テンプレートIDを指定してください: templates validate <id> [--data data.json]')
  const { definition } = await fetchTemplate(id)

  // Local invariants first — these are the ones the server cannot see.
  const local = checkInvariants(definition)
  const testData = flagValue(flags, 'data')
    ? JSON.parse(readFileSync(flagValue(flags, 'data'), 'utf8'))
    : {}
  const server = await api('POST', `/api/v2/templates/${encodeURIComponent(id)}/validate`, {
    body: { definition, testData },
  })

  if (JSON_OUT) return printJson({ local, server })
  if (local.errors.length === 0 && local.warnings.length === 0) {
    out('✓ ローカル検査: 問題なし（要素格納先・スキーマ階層・要素型・Zod strip）')
  }
  for (const e of local.errors) err(`✗ ${e}`)
  for (const w of local.warnings) err(`⚠ ${w}`)

  const violations = server?.violations ?? []
  if (violations.length === 0) out('✓ 検証ルール: 違反なし')
  else {
    out(`検証ルール違反 (${violations.length}):`)
    for (const v of violations) out(`  - ${v.message ?? JSON.stringify(v)}`)
  }
  if (local.errors.length > 0) process.exit(1)
}

async function cmdTemplateThumbnail(id) {
  if (!id) die('テンプレートIDを指定してください: templates thumbnail <id> [--out file.jpg]')
  const res = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}/thumbnail`, { raw: true })
  if (!res.ok) die(`サムネイル取得に失敗しました (HTTP ${res.status})`)
  const file = flagValue(flags, 'out') || join(config.artifactDir, `${id}.jpg`)
  const dir = dirname(file)
  if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  await streamToFile(res, file)
  out(`✓ サムネイル → ${file}`)
}

// ── expression / binding diagnostics ─────────────────────────────────────────

async function cmdEvaluate(id) {
  if (!id) die('使い方: evaluate <templateId> --data data.json')
  const dataFile = flagValue(flags, 'data')
  const testData = dataFile ? JSON.parse(readFileSync(dataFile, 'utf8')) : {}
  const { definition } = await fetchTemplate(id)
  const res = await api('POST', `/api/v2/templates/${encodeURIComponent(id)}/evaluate`, {
    body: { definition, testData },
  })
  if (JSON_OUT) return printJson(res)
  const results = res?.results ?? {}
  const errors = res?.errors ?? {}
  if (Object.keys(results).length === 0 && Object.keys(errors).length === 0) {
    return out('計算ルールがありません。')
  }
  out(pad('KEY', 30) + '結果')
  for (const [k, v] of Object.entries(results)) out(pad(k, 30) + JSON.stringify(v))
  for (const [k, v] of Object.entries(errors)) err(`✗ ${pad(k, 28)} ${v}`)
}

async function cmdBindingsResolve(id) {
  if (!id) die('使い方: bindings resolve <templateId> [--keys keys.json]')
  const { definition } = await fetchTemplate(id)
  const keysFile = flagValue(flags, 'keys')
  const partitionKeys = keysFile ? JSON.parse(readFileSync(keysFile, 'utf8')) : {}
  const res = await api('POST', `/api/v2/templates/${encodeURIComponent(id)}/resolve-bindings`, {
    body: { schema: definition.schema ?? { groups: [] }, partitionKeys },
  })
  if (JSON_OUT) return printJson(res)
  // HTTP 207: `resolved` and `errors` are both objects keyed by schema group id.
  for (const [groupId, row] of Object.entries(res?.resolved ?? {})) {
    const cells = Object.entries(row ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    out(`✓ ${groupId}: ${cells.join(' ') || '(空)'}`)
  }
  for (const [groupId, message] of Object.entries(res?.errors ?? {})) {
    err(`✗ ${groupId}: ${message}`)
  }
  if (res?.requestId) out(`requestId=${res.requestId}`)
}

async function cmdSchemaInfer() {
  const dataFile = flagValue(flags, 'data')
  if (!dataFile) die('使い方: schema infer --data sample.json')
  const parsed = JSON.parse(readFileSync(dataFile, 'utf8'))
  // The endpoint wants {sample: {...}}; accept a bare record and wrap it.
  const body = parsed && typeof parsed === 'object' && parsed.sample ? parsed : { sample: parsed }
  const res = await api('POST', '/api/v2/schemas/infer', { body })
  printJson(res)
}

async function cmdSchemaList() {
  const res = await api('GET', '/api/v2/schemas')
  const items = Array.isArray(res) ? res : (res.items ?? [])
  if (JSON_OUT) return printJson(items)
  if (items.length === 0) return out('スキーマがありません。')
  out(pad('ID', 38) + pad('名前', 24) + '更新')
  for (const s of items) out(pad(s.id, 38) + pad(s.name ?? '', 24) + (s.updatedAt ?? ''))
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
  if (!id) die('テンプレートIDを指定してください: templates delete <id> --yes')
  // Deletion is a hard delete server-side (definitionsRepo.delete — no soft
  // delete, no restore path), and callers now routinely hold IDs copied out of
  // `outline`/`summary` output. Require the intent to be stated explicitly.
  // Checked before any request so a mistake costs nothing.
  if (!flags.yes) {
    die(
      `削除は取り消せません（サーバー側で完全削除されます）。実行するには --yes を付けてください:\n` +
        `  templates delete ${id} --yes\n` +
        `  → 中身を確認するなら先に \`templates summary ${id}\`、` +
        `退避するなら \`templates export ${id} --out backup.json\``,
    )
  }
  // Name the thing being destroyed — a confirmation that shows nothing confirms nothing.
  let name = ''
  const probe = await api('GET', `/api/v2/templates/${encodeURIComponent(id)}`, { raw: true })
  if (probe.ok) {
    try {
      name = unwrapEnvelope(await probe.json()).meta.name
    } catch {
      // Non-fatal: proceed with the delete even if the probe body is unreadable.
    }
  }
  await api('DELETE', `/api/v2/templates/${encodeURIComponent(id)}`, { raw: true })
  out(`✓ 削除しました: ${name ? `${name} (${id})` : id}`)
}

async function streamToFile(res, file) {
  const dir = dirname(file)
  if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stream = createWriteStream(file)
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(stream).on('finish', resolve).on('error', reject)
  })
}

/**
 * Warn on a suspiciously small PDF.
 *
 * A template whose elements never made it into a section renders as a valid but
 * empty document — historically a 534-byte envelope that looks like success.
 * Size is the cheapest signal that nothing was drawn.
 */
const EMPTY_PDF_BYTES = 2000

function warnIfBlankPdf(file) {
  let bytes = 0
  try {
    bytes = statSync(file).size
  } catch {
    return
  }
  if (bytes < EMPTY_PDF_BYTES) {
    err(
      `⚠ PDF が ${bytes} バイトしかありません — 白紙の可能性があります。\n` +
        '  → 要素が sections[].elements にあるか（`templates outline <id>`）、' +
        'バインドが解決しているか（`bindings resolve <id>`）を確認してください。',
    )
  }
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
  const file = flags.out || join(config.artifactDir, `${id}.pdf`)
  await streamToFile(res, file)
  warnIfBlankPdf(file)
  out(`✓ PDFを生成しました → ${file} (${statSync(file).size} bytes)`)
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
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filenameTemplate = flags['filename-template'] && flags['filename-template'] !== true
    ? String(flags['filename-template']) : null
  const usedNames = new Set()

  out(`… ${rows.length} 行をレンダリングします...`)
  let ok = 0
  for (let i = 0; i < rows.length; i++) {
    const testData = expandDotKeys(rows[i])
    const res = await api('POST', `/api/v2/templates/${encodeURIComponent(id)}/pdf`, { body: { testData }, raw: true })
    if (!res.ok) { err(`  行 ${i + 1}: 失敗 (HTTP ${res.status})`); continue }
    const file = join(outDir, uniqueName(usedNames, batchFilename(rows[i], i, dateStr, filenameTemplate)))
    await streamToFile(res, file)
    ok++
  }
  out(`✓ 一括PDF (${ok}/${rows.length} 成功) → ${outDir}/`)
}

/**
 * Resolve the output filename for one batch row (#194). Precedence:
 * --filename-template "{col}_{date}.pdf" > legacy --name <col> > zero-padded index.
 * Template tokens: {seq}, {date}, and any CSV column name.
 */
function batchFilename(row, index, dateStr, template) {
  const seqStr = String(index + 1).padStart(4, '0')
  if (template) {
    const name = template.replace(/\{([^{}]+)\}/g, (_, key) => {
      const k = key.trim()
      if (k === 'seq') return seqStr
      if (k === 'date') return dateStr
      return sanitizeFilename(row[k] ?? '')
    })
    const cleaned = sanitizeFilename(name.replace(/\.pdf$/i, '')) || seqStr
    return `${cleaned}.pdf`
  }
  if (flags.name && flags.name !== true && row[flags.name]) return `${sanitizeFilename(row[flags.name])}.pdf`
  return `${seqStr}.pdf`
}

/** Ensure filename uniqueness within the output directory. */
function uniqueName(used, name) {
  if (!used.has(name)) { used.add(name); return name }
  const base = name.replace(/\.pdf$/i, '')
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}.pdf`
    if (!used.has(candidate)) { used.add(candidate); return candidate }
  }
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
  // Unified listing across all job types (#191).
  const res = await api('GET', '/api/v2/pdf-jobs')
  const jobs = Array.isArray(res) ? res : (res.jobs || [])
  if (JSON_OUT) return printJson(jobs)
  if (jobs.length === 0) return out('ジョブがありません。')
  out(pad('JOB ID', 40) + pad('種別', 10) + pad('状態', 12) + '進捗')
  for (const j of jobs) {
    const completed = j.completed ?? j.processedItems ?? 0
    const total = j.total ?? j.totalItems ?? 0
    out(pad(j.jobId, 40) + pad(j.jobType ?? '', 10) + pad(j.status ?? '', 12) + `${completed}/${total}`)
  }
}

async function cmdJobStatus(jobId) {
  if (!jobId) die('ジョブIDを指定してください: jobs status <jobId>')
  // V2 single-PDF status; batch jobs live under /api/v2/pdf-jobs/batch/{id}.
  const res = await api('GET', `/api/v2/pdf-jobs/${encodeURIComponent(jobId)}`, { raw: true })
  if (res.ok) return printJson(await res.json())
  // Fall back to the V1 status endpoint for CSV batch jobs.
  const v1 = await api('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}`)
  printJson(v1)
}

async function cmdJobCancel(jobId) {
  if (!jobId) die('ジョブIDを指定してください: jobs cancel <jobId>')
  const res = await api('DELETE', `/api/v2/pdf-jobs/${encodeURIComponent(jobId)}`)
  if (JSON_OUT) return printJson(res)
  out(`✓ ジョブを${res.deleted ? '削除' : 'キャンセル'}しました: ${jobId}`)
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

/** Write a file, creating parent directories as needed. */
function writeFileEnsured(file, content) {
  const dir = dirname(file)
  if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, content)
}

function printHelp() {
  out(`report-studio CLI — Report Studio backend をコマンドラインから操作

使い方:
  node scripts/cli/report-studio.mjs <command> [options]

認証:
  login                       ログイン（セッションを保存）  --user --password
  login --token <t>           APIトークンで認証（$REPORT_STUDIO_TOKEN でも可）
  whoami                      現在のユーザーを表示
  tokens list                 APIトークン一覧
  tokens create               APIトークン発行  --label <用途>
  tokens revoke <id>          APIトークン失効

テンプレート:
  templates list              テンプレート一覧
  templates summary <id>      概要（ページ/要素種別/スキーマ/ルール）— まずこれ
  templates outline <id>      要素一覧 TSV + 短縮ハンドル  --page N
  templates get <id>          定義の全文（40KB 超は --force か --out が必要）
  templates create <name>     新規作成  --from <id>（複製） --import <file>
  templates edit <id> --ops ops.json   op ベース部分編集（既定で編集前スナップショット）
                              --dry-run --expect-updated-at <iso> --no-snapshot
  templates validate <id>     保存前検証（ローカル不変条件 + 検証ルール）  --data d.json
  templates thumbnail <id>    サムネイル JPEG を書き出し  --out file.jpg
  templates versions list <id>              バージョン一覧
  templates versions snapshot <id>          手動スナップショット
  templates versions restore <id> <vid>     復元（edit の undo）
  templates export <id>       エクスポート  --out file.json
  templates import <file>     インポート
  templates delete <id> --yes 削除（完全削除・取り消し不可のため --yes 必須）

データ・式の診断:
  evaluate <id> --data d.json 計算ルールを評価（JEXL デバッグ）
  bindings resolve <id>       DB バインドを解決  --keys keys.json
  schema list                 スキーマライブラリ一覧
  schema infer --data s.json  サンプル JSON からスキーマ推論

出力:
  pdf <id>                    単票PDF生成  --data data.json --out file.pdf
  batch <id> --csv rows.csv   CSVから一括PDF  --out dir/
                              ファイル名: --filename-template "{col}_{date}.pdf" または --name <col>

回答・ステータス:
  responses list <id>         回答一覧（ステータス付き）
  responses status <id> <rid> <draft|issued|sent|void>   単体ステータス変更
  responses set-status <id> <status> --ids a,b  または --status-from <old>   一括変更

ジョブ:
  jobs list                   ジョブ一覧（全種別・統一表示）
  jobs status <jobId>         ジョブ状態
  jobs cancel <jobId>         ジョブをキャンセル/削除

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
    case 'tokens':
      if (sub === 'list') return cmdTokensList()
      if (sub === 'create') return cmdTokenCreate()
      if (sub === 'revoke') return cmdTokenRevoke(positionals[2])
      return die(`不明なサブコマンド: tokens ${sub ?? ''}`)
    case 'templates':
      if (sub === 'list') return cmdTemplatesList()
      if (sub === 'get') return cmdTemplateGet(positionals[2])
      if (sub === 'summary') return cmdTemplateSummary(positionals[2])
      if (sub === 'outline') return cmdTemplateOutline(positionals[2])
      if (sub === 'create') return cmdTemplateCreate(positionals[2])
      if (sub === 'edit') return cmdTemplateEdit(positionals[2])
      if (sub === 'validate') return cmdTemplateValidate(positionals[2])
      if (sub === 'thumbnail') return cmdTemplateThumbnail(positionals[2])
      if (sub === 'versions') {
        const action = positionals[2]
        if (action === 'list') return cmdVersionsList(positionals[3])
        if (action === 'snapshot') return cmdVersionsSnapshot(positionals[3])
        if (action === 'restore') return cmdVersionsRestore(positionals[3], positionals[4])
        return die(`不明なサブコマンド: templates versions ${action ?? ''}（list|snapshot|restore）`)
      }
      if (sub === 'export') return cmdTemplateExport(positionals[2])
      if (sub === 'import') return cmdTemplateImport(positionals[2])
      if (sub === 'delete') return cmdTemplateDelete(positionals[2])
      return die(`不明なサブコマンド: templates ${sub ?? ''}`)
    case 'evaluate': return cmdEvaluate(sub)
    case 'bindings':
      if (sub === 'resolve') return cmdBindingsResolve(positionals[2])
      return die(`不明なサブコマンド: bindings ${sub ?? ''}`)
    case 'schema':
      if (sub === 'list') return cmdSchemaList()
      if (sub === 'infer') return cmdSchemaInfer()
      return die(`不明なサブコマンド: schema ${sub ?? ''}`)
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
      if (sub === 'cancel') return cmdJobCancel(positionals[2])
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
