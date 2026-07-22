/**
 * i18n foundation (Phase 1, #329).
 *
 * Introduces react-i18next as the i18n framework. `ja` is the **source of
 * truth** (fallback language); `en` is the first target language. Later phases
 * key-ize the rest of the UI directory-by-directory against these namespaces.
 *
 * Design notes:
 * - Resources are imported inline (small at this stage). The library supports
 *   lazy-loaded namespaces via an http backend; that optimization is deferred
 *   until the bundle grows enough to justify it.
 * - `document.documentElement.lang` is kept in sync with the active language so
 *   `index.html`'s static `lang` no longer lies to screen readers / translators.
 * - In test mode we force `lng: 'ja'` (bypassing browser detection, which in
 *   jsdom reports en-US) so the ~874 Japanese-text assertions stay deterministic,
 *   and turn missing keys into thrown errors so a keying regression fails CI.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import jaCommon from './locales/ja/common.json'
import enCommon from './locales/en/common.json'

export const SUPPORTED_LANGUAGES = ['ja', 'en'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** Fallback + source-of-truth language. Every key must exist here. */
export const DEFAULT_LANGUAGE: AppLanguage = 'ja'
export const DEFAULT_NS = 'common'

/** localStorage key holding the user's explicit language choice. */
export const LANGUAGE_STORAGE_KEY = 'reportStudioLang'

export const resources = {
  ja: { common: jaCommon },
  en: { common: enCommon },
} as const

// Vitest sets MODE === 'test'. Guard the access so non-Vite consumers (e.g. the
// i18next-parser sandbox) don't choke on `import.meta.env`.
const isTest = import.meta.env?.MODE === 'test'

function syncDocumentLang(lng: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // In tests, pin to Japanese so existing assertions and browser-detection in
    // jsdom don't fight. In the app, `lng` is undefined → the detector decides.
    lng: isTest ? DEFAULT_LANGUAGE : undefined,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    // Map region variants (en-US → en) onto our language-only resource keys.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    ns: [DEFAULT_NS],
    defaultNS: DEFAULT_NS,
    interpolation: {
      // React already escapes; double-escaping would mangle output.
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnNull: false,
    // Turn an unknown key into a hard failure under test so a missing/renamed
    // key surfaces in CI instead of rendering the raw key string in the UI.
    saveMissing: isTest,
    missingKeyHandler: isTest
      ? (_lngs, ns, key) => {
          throw new Error(`Missing i18n key: ${ns}:${key}`)
        }
      : undefined,
    react: {
      // Resources are bundled synchronously, so no Suspense boundary is needed.
      useSuspense: false,
    },
  })

i18n.on('languageChanged', syncDocumentLang)
syncDocumentLang(i18n.language || DEFAULT_LANGUAGE)

export default i18n
