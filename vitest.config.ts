import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Unit/component tests live under src/. Scope the glob there so the default
    // `**/*.spec.ts` pattern does NOT sweep up the Playwright E2E specs in e2e/
    // (they import @playwright/test and must run via `playwright test`, #221).
    // scripts/cli tests spawn the CLI as a child process (#268) — still vitest,
    // still no Playwright.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/cli/**/*.test.mjs'],
    // Default 5s is too tight under load: coverage instrumentation and busy CI
    // runners slow jsdom+RTL tests ~4x, turning healthy tests into timeout
    // flakes. This is a ceiling, not a delay — fast tests stay fast.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Storybook demo files — not production code
        '**/*.stories.tsx',
        // Type-only files — no executable statements
        'src/types/index.ts',
        'src/store/types.ts',
        // App entrypoint and Storybook config
        'src/main.tsx',
        'src/preview.ts',
        // Test setup
        'src/test/**',
        // App shell — integration-level, not unit-testable in isolation
        'src/App.tsx',
        // Canvas components requiring DnD/pointer-event infrastructure
        'src/components/canvas/ReportCanvas.tsx',
        'src/components/canvas/CanvasElement.tsx',
        'src/components/canvas/SectionContainer.tsx',
        // Template files — static element-array builders, not unit-testable in
        // isolation (builtinTemplates.ts itself stays covered)
        'src/templates/*Template.ts',
        'src/templates/businessTemplateHelpers.ts',
      ],
      // Ratchet thresholds: set just below the current measured floor so the
      // gate fails on regression instead of being permanently red. Raise these
      // as coverage grows — never lower them to admit a regression.
      //
      // Re-baselined 2026-07-21 for @vitest/coverage-v8 v4, which switched to
      // AST-aware branch remapping (counts optional chaining / nullish / default
      // params as branches). This is a measurement change, not a code regression.
      // (v3 floor was: lines 73.68 / functions 70.11 / branches 85.42.)
      //
      // Ratcheted 2026-07-21 (#268) after adding tenant-renderer / store-util /
      // hook / CLI tests. Measured floor: stmts 66.44 / branches 60.63 /
      // funcs 66.00 / lines 67.99. Thresholds sit ~0.2-0.3pt below the floor —
      // enough to catch regressions without flaking on test-unrelated refactors
      // (the previous stmts gap of +0.12pt was too tight).
      thresholds: {
        lines: 67.7,
        functions: 65.7,
        branches: 60.4,
        statements: 66.2,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
