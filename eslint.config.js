import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
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
)
