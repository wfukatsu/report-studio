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
  const namespaces = Object.keys(resources[DEFAULT_LANGUAGE]) as Array<
    keyof (typeof resources)[typeof DEFAULT_LANGUAGE]
  >

  it('every language exposes the same namespaces', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      expect(Object.keys(resources[lng]).sort()).toEqual(Object.keys(resources.ja).sort())
    }
  })

  // The core CI guard: any key added to one language but not another — or a typo
  // on rename — fails here before it can render a raw key string in the UI.
  // Runs per namespace so a drift in any namespace is pinpointed.
  it('non-default languages have exactly the same key set as the source (ja) in every namespace', () => {
    for (const ns of namespaces) {
      const source = keyPaths(resources[DEFAULT_LANGUAGE][ns]).sort()
      for (const lng of SUPPORTED_LANGUAGES) {
        if (lng === DEFAULT_LANGUAGE) continue
        const target = keyPaths(resources[lng][ns]).sort()
        const missing = source.filter((k) => !target.includes(k))
        const extra = target.filter((k) => !source.includes(k))
        expect(missing, `keys missing from "${lng}:${ns}"`).toEqual([])
        expect(extra, `keys in "${lng}:${ns}" absent from source`).toEqual([])
      }
    }
  })

  it('has no empty translation values in any language/namespace', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      for (const ns of namespaces) {
        for (const path of keyPaths(resources[lng][ns])) {
          const value = path
            .split('.')
            .reduce<unknown>((acc, seg) => (acc as Record<string, unknown>)?.[seg], resources[lng][ns])
          expect(typeof value, `${lng}:${ns}:${path}`).toBe('string')
          expect((value as string).length, `${lng}:${ns}:${path} is empty`).toBeGreaterThan(0)
        }
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
