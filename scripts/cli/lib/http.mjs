/**
 * HTTP layer — session/token persistence, the unified error contract, and
 * rate-limit backoff.
 *
 * Auth: the server tries the session cookie first, then a Bearer PAT (#195).
 * Agents should use a PAT ($REPORT_STUDIO_TOKEN): per ApiRoutes.csrfRejectReason
 * a Bearer request bypasses the CSRF Origin check entirely, so no Origin dance
 * is needed. Note we deliberately send NO Origin header — the CSRF filter only
 * rejects a *present, mismatched* Origin, and sending the backend's own origin
 * would trip a CORS 400.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { die, err, sleep } from './output.mjs'

/**
 * Recovery hints per server error code (#267 unified `{error, code, correlationId}`).
 * The human-readable `error` is ja-fixed (#412), so we pass it through and append
 * the "what do I do now" half that the server does not carry.
 */
export const ERROR_HINTS = {
  NOT_FOUND:
    '所有者以外には 404 を返す仕様です（ID 列挙防止）。テンプレートの所有者・可視性を確認してください。',
  VALIDATION_ERROR: '`templates validate <id>` で保存前に検証できます。',
  VERSION_CONFLICT:
    '`templates outline <id>` で updatedAt を取り直し、--expect-updated-at を更新して再実行してください。',
  PAYLOAD_TOO_LARGE:
    'stateless PDF は 512KB 上限です。テンプレートIDを指定する経路に切り替えてください。',
  RATE_LIMITED:
    'サーバー側のレート制限です（evaluate: 10req/10s/IP、resolve-bindings: 3req/10s/user）。',
  FORBIDDEN: 'このトークンのロールでは実行できません。',
}

/** 429 backoff schedule — the server's windows are 10s, so this covers one window. */
const RETRY_DELAYS_MS = [1000, 2000, 4000]

export function createClient(config) {
  function loadCookie() {
    try {
      return readFileSync(config.cookieJar, 'utf8').trim()
    } catch {
      return ''
    }
  }

  function saveCookie(setCookieHeader) {
    if (!setCookieHeader) return
    // Keep only the name=value part of each Set-Cookie entry.
    const cookie = setCookieHeader
      .split(/,(?=[^ ;]+=)/)
      .map((c) => c.split(';')[0].trim())
      .join('; ')
    if (!existsSync(config.home)) mkdirSync(config.home, { recursive: true })
    writeFileSync(config.cookieJar, cookie, { mode: 0o600 })
  }

  /** $REPORT_STUDIO_TOKEN takes precedence over a token saved via `login --token`. */
  function loadToken() {
    if (process.env.REPORT_STUDIO_TOKEN) return process.env.REPORT_STUDIO_TOKEN.trim()
    try {
      return readFileSync(config.tokenFile, 'utf8').trim()
    } catch {
      return ''
    }
  }

  function saveToken(token) {
    if (!existsSync(config.home)) mkdirSync(config.home, { recursive: true })
    writeFileSync(config.tokenFile, token, { mode: 0o600 })
  }

  async function api(method, path, { body, raw = false, formData } = {}) {
    const headers = {}
    const cookie = loadCookie()
    if (cookie) headers.Cookie = cookie
    const token = loadToken()
    if (token) headers.Authorization = `Bearer ${token}`
    let payload
    if (formData) {
      payload = formData
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }

    let res
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${config.baseUrl}${path}`, { method, headers, body: payload })
      } catch (e) {
        die(
          `バックエンドに接続できません (${config.baseUrl}): ${e.message}. サーバー起動と --url を確認してください。`,
        )
      }
      // Rate limiting is expected on the CPU-intensive endpoints; retry quietly
      // rather than making the caller (or an agent) handle it.
      if (res.status !== 429 || attempt >= RETRY_DELAYS_MS.length) break
      const waitMs = RETRY_DELAYS_MS[attempt]
      err(`… レート制限 (429)。${waitMs / 1000}s 待って再試行します (${attempt + 1}/${RETRY_DELAYS_MS.length})`)
      await sleep(waitMs)
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
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    if (!res.ok) {
      const isObj = json && typeof json === 'object'
      const detail = isObj && json.error ? json.error : text
      const code = isObj ? json.code : undefined
      const correlationId = isObj ? json.correlationId : undefined
      let msg = code ? `[${code}] ${detail}` : `${method} ${path} → HTTP ${res.status}: ${detail || '(no body)'}`
      if (correlationId) msg += ` (correlationId=${correlationId})`
      const hint = code ? ERROR_HINTS[code] : undefined
      if (hint) msg += `\n  → ${hint}`
      die(msg)
    }
    return json
  }

  return { api, loadToken, saveToken, loadCookie }
}
