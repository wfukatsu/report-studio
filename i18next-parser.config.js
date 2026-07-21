/**
 * i18next-parser config (#329, Phase 1).
 *
 * Extraction pipeline for keying UI strings during Phase 2. Scans source for
 * `t('...')` / `<Trans>` usages and writes/merges keys into the locale JSON,
 * with `ja` as the source of truth.
 *
 *   npm run i18n:extract        # merge newly-used keys into locale files
 *   npm run i18n:extract:check  # fail if extraction would change anything (CI)
 *
 * `keepRemoved` is on so hand-authored keys are never dropped mid-migration; a
 * separate parity test (src/i18n/i18n.test.ts) enforces ja/en key equality.
 */
export default {
  locales: ['ja', 'en'],
  defaultNamespace: 'common',
  input: ['src/**/*.{ts,tsx}', '!src/**/*.{test,spec}.{ts,tsx}', '!src/**/*.stories.tsx'],
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  keySeparator: '.',
  namespaceSeparator: ':',
  sort: true,
  keepRemoved: true,
  createOldCatalogs: false,
  // New keys land empty in every locale; the developer fills ja (source of
  // truth) and translators fill the rest. Using the key as the ja default would
  // mask untranslated strings, so leave it blank.
  defaultValue: '',
  failOnWarnings: false,
}
