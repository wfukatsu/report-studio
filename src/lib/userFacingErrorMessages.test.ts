import { describe, it, expect } from 'vitest'
import { ERROR_MESSAGES_JA, getErrorCopy } from './userFacingErrorMessages'

describe('userFacingErrorMessages', () => {
  it('provides a title and hint for every error code', () => {
    for (const [code, copy] of Object.entries(ERROR_MESSAGES_JA)) {
      expect(copy.title.length, `${code} title`).toBeGreaterThan(0)
      expect(copy.hint.length,  `${code} hint`).toBeGreaterThan(0)
    }
  })

  it('returns localized copy via getErrorCopy', () => {
    expect(getErrorCopy('unreachable').title).toBe('バックエンドに接続できません')
    expect(getErrorCopy('server_error').title).toBe('一時的なエラーが発生しました')
  })

  it('does not include raw HTTP status numbers in titles or hints', () => {
    for (const copy of Object.values(ERROR_MESSAGES_JA)) {
      expect(copy.title).not.toMatch(/HTTP|\b[45]\d{2}\b/i)
      expect(copy.hint).not.toMatch(/HTTP|\b[45]\d{2}\b/i)
    }
  })
})
