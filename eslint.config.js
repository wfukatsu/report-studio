import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'storybook-static'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      // Honour the underscore-prefix convention for intentionally unused vars/args/catch vars
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Staged adoption (#251): eslint-plugin-react-hooks 7 (React Compiler rules)
      // and ESLint 10 core added these as errors. They were surfaced as warnings
      // first so the upgrade landed without a 62-finding code churn.
      // Promoted to error in #263: immutability, preserve-caught-error,
      // no-useless-assignment, react-refresh/only-export-components (above).
      // Promoted to error in #264: refs, set-state-in-effect,
      // preserve-manual-memoization, exhaustive-deps (all findings resolved).
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Vite entry point — has no exports and is never hot-refreshed as a
    // component boundary, so the react-refresh rule does not apply.
    files: ['src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // i18n regression guard (#329): flag NEW hardcoded Japanese so it can't creep
    // back in after the Phase 1-6 migration. Scoped to app source (not tests /
    // stories, which legitimately assert Japanese copy). The `ignore` regex
    // matches any literal with NO Japanese characters, so only Japanese-containing
    // literals are flagged — this sidesteps the usual no-literal-string noise
    // (className, role, English text, format tokens). Intentional non-translatable
    // Japanese DATA (seed defaults, era tables, enum values, placeholder names) is
    // annotated with `// eslint-disable-next-line i18next/no-literal-string`.
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.tsx', '**/*.spec.tsx', '**/*.stories.tsx', 'src/test/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', {
        mode: 'all',
        // Exclude any literal with NO Japanese character, so only Japanese-
        // containing strings are flagged (skips className, English text, symbols,
        // format tokens — the usual no-literal-string noise). The second pattern
        // exempts the "・" (U+30FB) list separator, which is punctuation, not copy.
        words: { exclude: ['^[^\\u3040-\\u30ff\\u4e00-\\u9faf]*$', '^[・\\s]*$'] },
      }],
    },
  },
)
