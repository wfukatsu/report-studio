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

  it('an unknown versions action is rejected with the valid actions', async () => {
    const { code, stderr } = await runCli('templates', 'versions', 'frobnicate', 'abc')
    expect(code).toBe(1)
    expect(stderr).toContain('list|snapshot|restore')
  })

  it('help documents the new agent-facing commands', async () => {
    const { stdout } = await runCli('help')
    for (const cmd of ['summary', 'outline', 'edit', 'validate', 'thumbnail', 'versions', 'evaluate', 'bindings']) {
      expect(stdout).toContain(cmd)
    }
  })
})

describe('report-studio CLI — destructive guards (network-free)', () => {
  // The guard must trip before any request: a mistyped ID should cost nothing.
  // --url points at a closed port, so reaching the network would surface as the
  // connection error instead of the guard message.
  const CLOSED = ['--url', 'http://127.0.0.1:9']

  it('templates delete refuses without --yes and names the safer alternatives', async () => {
    const { code, stderr } = await runCli('templates', 'delete', 'some-id', ...CLOSED)
    expect(code).toBe(1)
    expect(stderr).toContain('--yes')
    expect(stderr).toContain('取り消せません')
    expect(stderr).toContain('templates export')
    // Proof the guard ran before the request, not after a failed one.
    expect(stderr).not.toContain('バックエンドに接続できません')
  })

  it('templates delete without an id explains the required form', async () => {
    const { code, stderr } = await runCli('templates', 'delete', ...CLOSED)
    expect(code).toBe(1)
    expect(stderr).toContain('templates delete <id> --yes')
  })

  it('templates edit requires --ops before contacting the server', async () => {
    const { code, stderr } = await runCli('templates', 'edit', 'some-id', ...CLOSED)
    expect(code).toBe(1)
    expect(stderr).toContain('--ops')
    expect(stderr).not.toContain('バックエンドに接続できません')
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
