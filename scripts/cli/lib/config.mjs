/**
 * Argument parsing and path/URL resolution.
 *
 * Every filesystem location the CLI touches is derived here so tests can
 * redirect the whole lot with $REPORT_STUDIO_HOME.
 */
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Tiny `--flag value` / `--bool` parser. Positionals keep their order. */
export function parseArgs(argv) {
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

/** Read a flag that must carry a value (`--foo bar`), else undefined. */
export function flagValue(flags, name) {
  const v = flags[name]
  return v === undefined || v === true ? undefined : String(v)
}

export function createConfig(flags = {}) {
  const home = process.env.REPORT_STUDIO_HOME || join(homedir(), '.report-studio')
  return {
    home,
    cookieJar: join(home, 'cookies'),
    tokenFile: join(home, 'token'),
    handleDir: join(home, 'handles'),
    baseUrl: (flagValue(flags, 'url') || process.env.REPORT_STUDIO_URL || 'http://localhost:8080')
      .replace(/\/$/, ''),
    jsonOut: Boolean(flags.json),
    artifactDir: process.env.REPORT_STUDIO_ARTIFACT_DIR || '.rs-artifacts',
  }
}
