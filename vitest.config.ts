import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
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
        // Template files — static element-array builders, not unit-testable in isolation
        'src/templates/scalarQuotationTemplate.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
