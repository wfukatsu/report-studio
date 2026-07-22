import { describe, it, expect } from 'vitest'
import i18n, { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, resources } from './config'

/** Flatten a nested resource object into dot-notation key paths. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  )
}

describe('i18n resources', () => {
  it('every language exposes the same namespaces', () => {
    const nsByLang = SUPPORTED_LANGUAGES.map((lng) => Object.keys(resources[lng]).sort())
    for (const ns of nsByLang) expect(ns).toEqual(Object.keys(resources.ja).sort())
  })

  // The core CI guard: any key added to one language but not another — or a typo
  // on rename — fails here before it can render a raw key string in the UI.
  it('non-default languages have exactly the same key set as the source (ja)', () => {
    const source = keyPaths(resources[DEFAULT_LANGUAGE].common).sort()
    for (const lng of SUPPORTED_LANGUAGES) {
      if (lng === DEFAULT_LANGUAGE) continue
      const target = keyPaths(resources[lng].common).sort()
      const missing = source.filter((k) => !target.includes(k))
      const extra = target.filter((k) => !source.includes(k))
      expect(missing, `keys missing from "${lng}"`).toEqual([])
      expect(extra, `keys in "${lng}" absent from source`).toEqual([])
    }
  })

  it('has no empty translation values in any language', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      const entries = keyPaths(resources[lng].common)
      // keyPaths returns leaf paths; re-resolve each to assert non-empty string.
      for (const path of entries) {
        const value = path
          .split('.')
          .reduce<unknown>((acc, seg) => (acc as Record<string, unknown>)?.[seg], resources[lng].common)
        expect(typeof value, `${lng}:${path}`).toBe('string')
        expect((value as string).length, `${lng}:${path} is empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe('i18n config', () => {
  it('defaults to Japanese under test (deterministic assertions)', () => {
    expect(i18n.resolvedLanguage).toBe('ja')
  })

  it('resolves keys and falls back to ja for untranslated keys', () => {
    expect(i18n.t('nav.design')).toBe('デザイン')
    expect(i18n.getFixedT('en')('nav.design')).toBe('Design')
  })

  it('keeps document.documentElement.lang in sync with the active language', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
    await i18n.changeLanguage('ja')
    expect(document.documentElement.lang).toBe('ja')
  })

  it('throws on an unknown key under test (missing-key guard)', () => {
    // @ts-expect-error intentionally-unknown key to exercise the guard
    expect(() => i18n.t('nav.__does_not_exist__')).toThrow(/Missing i18n key/)
  })
})
