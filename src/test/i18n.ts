import i18n from '@/i18n/config'

/**
 * Key-based test-query helper (#329 Phase 6).
 *
 * Resolve an i18n key to its string (ja under test — see `src/i18n/config.ts`,
 * which pins the test language) so tests query by KEY instead of a hard-coded
 * Japanese literal. A later copy edit to a translation then no longer breaks the
 * test, and the missing-key guard turns a wrong/renamed key into a thrown error.
 *
 *   import { tk } from '@/test/i18n'
 *   screen.getByRole('button', { name: tk('toolbar:file.new') })
 *   screen.getByText(tk('components:sidebar.responsesPanel.status.draft'))
 *
 * `key` is a namespace-qualified key ("ns:path.to.key"); `opts` carries
 * interpolation values when the string has {{placeholders}}.
 */
export function tk(key: string, opts?: Record<string, unknown>): string {
  return (i18n.t as (k: string, o?: Record<string, unknown>) => string)(key, opts)
}
