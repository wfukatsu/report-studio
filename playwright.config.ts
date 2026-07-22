import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E config (#221).
 *
 * Boots the real stack — Java/Javalin backend on :8080 and the Vite dev server
 * on :5173 (which proxies /api → :8080) — then drives the browser through the
 * happy path that unit/component tests can't reach (DnD, canvas, PDF download).
 *
 * Locally: `npm run test:e2e` reuses already-running dev servers if present.
 * In CI: both servers are started fresh (see the e2e job in ci.yml). The backend
 * needs server/scalardb.properties (copied from the example) and a JDK 21.
 */
export default defineConfig({
  testDir: './e2e',
  // The editor is stateful (shared backend template store) — keep it serial.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    // Pin the browser locale so the i18n language detector (navigator) resolves to
    // Japanese (#329). Without this, CI runners report en-US and the app renders in
    // English, breaking the suite's Japanese-text queries. The E2E flows assert the
    // Japanese UI, so ja-JP is the deterministic language for them.
    locale: 'ja-JP',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Cross-browser policy (#261): chromium-only, workers: 1 for now.
  // The suite drives pointer-heavy flows (@dnd-kit drags, custom resize
  // handles, HTML5 palette DnD) against a stateful shared backend; running a
  // single engine serially keeps signal high while these flows stabilize.
  // firefox/webkit projects are deliberately deferred — revisit once the
  // chromium suite has been flake-free in CI for a while.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:8080/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
