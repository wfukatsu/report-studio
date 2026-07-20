/**
 * CLI smoke tests (#268) — spawn the real CLI as a child process.
 *
 * Network-free by design: command dispatch (`help`, unknown command/subcommand)
 * never touches fetch, and the connectivity test points at a closed local port
 * so it fails fast with the CLI's own error handling. REPORT_STUDIO_HOME is
 * redirected to a temp dir so the tests never read or write the real
 * ~/.report-studio cookie jar / token file.
 */
import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)
// vitest serves modules from a non-file URL, so resolve from the project root
// (vitest's cwd) instead of import.meta.url.
const CLI = join(process.cwd(), 'scripts/cli/report-studio.mjs')

const ENV = {
  ...process.env,
  REPORT_STUDIO_HOME: mkdtempSync(join(tmpdir(), 'report-studio-cli-test-')),
  REPORT_STUDIO_TOKEN: '',
  REPORT_STUDIO_URL: '',
}

/** Run the CLI; resolves with {code, stdout, stderr} instead of throwing. */
async function runCli(...args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { env: ENV })
    return { code: 0, stdout, stderr }
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

describe('report-studio CLI — dispatch (network-free)', () => {
  it('help exits 0 and lists the main commands', async () => {
    const { code, stdout } = await runCli('help')
    expect(code).toBe(0)
    for (const cmd of ['login', 'templates', 'pdf', 'batch', 'jobs', 'tokens', 'db']) {
      expect(stdout).toContain(cmd)
    }
  })

  it('running without a command prints help (exit 0)', async () => {
    const { code, stdout } = await runCli()
    expect(code).toBe(0)
    expect(stdout).toContain('templates')
  })

  it('an unknown command dies with a friendly Japanese error (exit 1)', async () => {
    const { code, stderr } = await runCli('frobnicate')
    expect(code).toBe(1)
    expect(stderr).toContain('✗')
    expect(stderr).toContain('不明なコマンド')
  })

  it('an unknown subcommand dies before touching the network', async () => {
    const { code, stderr } = await runCli('templates', 'frobnicate')
    expect(code).toBe(1)
    expect(stderr).toContain('不明なサブコマンド')
  })
})

describe('report-studio CLI — unreachable server', () => {
  it('fails with the CLI error prefix, not a raw stack trace', async () => {
    // Port 9 (discard) is never listening locally — fetch fails fast.
    const { code, stderr } = await runCli('whoami', '--url', 'http://127.0.0.1:9')
    expect(code).toBe(1)
    expect(stderr).toContain('✗')
    expect(stderr).not.toContain('at async') // no stack trace leakage
  })
})
