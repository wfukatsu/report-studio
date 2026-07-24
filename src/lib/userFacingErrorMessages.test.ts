import { describe, it, expect } from 'vitest'
import { getErrorCopy } from './userFacingErrorMessages'
import i18n, { resources } from '@/i18n/config'

// #329 Phase 3: error copy now lives in the `serverErrors` i18n namespace.
const t = i18n.getFixedT('ja', 'serverErrors')
// The `store` section holds flat author-side error strings (#329 Phase 3 残),
// and the `lib` section holds flat lib-layer error strings (#409) — neither is
// code {title,hint} copy, so exclude both from the copy-shape assertions.
const { store: _store, lib: _lib, ...jaCodes } = resources.ja.serverErrors as Record<string, unknown>
const jaCopy = jaCodes as Record<string, { title: string; hint: string }>

describe('userFacingErrorMessages', () => {
  it('provides a non-empty title and hint for every error code (ja)', () => {
    for (const [code, copy] of Object.entries(jaCopy)) {
      expect(copy.title.length, `${code} title`).toBeGreaterThan(0)
      expect(copy.hint.length, `${code} hint`).toBeGreaterThan(0)
    }
  })

  it('returns localized copy via getErrorCopy', () => {
    expect(getErrorCopy('unreachable', t).title).toBe('バックエンドに接続できません')
    expect(getErrorCopy('server_error', t).title).toBe('一時的なエラーが発生しました')
  })

  it('does not include raw HTTP status numbers in titles or hints', () => {
    for (const copy of Object.values(jaCopy)) {
      expect(copy.title).not.toMatch(/HTTP|\b[45]\d{2}\b/i)
      expect(copy.hint).not.toMatch(/HTTP|\b[45]\d{2}\b/i)
    }
  })

  it('falls back to the unknown copy for an unrecognized code string', () => {
    // e.g. a Node-style error like { code: 'ECONNREFUSED' } slipping past
    // InlineErrorBanner.isClassified must not crash with `undefined.title`.
    expect(getErrorCopy('ECONNREFUSED', t)).toEqual(getErrorCopy('unknown', t))
  })
})
