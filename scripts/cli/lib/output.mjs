/**
 * Terminal output primitives shared by every CLI command.
 *
 * Extracted from report-studio.mjs so the HTTP / projection / ops layers can be
 * reused by a future MCP server without dragging the whole CLI along
 * (docs/plans/2026-07-27-feat-agent-cli-interface-plan.md, step 0-a).
 */

export function out(msg) {
  process.stdout.write(msg + '\n')
}

export function err(msg) {
  process.stderr.write(msg + '\n')
}

/** Print a friendly error and exit. Never leaks a stack trace. */
export function die(msg, code = 1) {
  err(`✗ ${msg}`)
  process.exit(code)
}

export function printJson(obj) {
  out(JSON.stringify(obj, null, 2))
}

/** Fixed-width left-pad for the table-ish listings. */
export function pad(s, n) {
  s = String(s ?? '')
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length)
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
