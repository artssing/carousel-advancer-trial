import { defineConfig, devices } from '@playwright/test';

/**
 * Browser lane for the QA regression system (docs/qa/README.md).
 *
 * Targets the UAT deployment over the public tunnel — this machine is the
 * server box and must not run dev servers (CLAUDE.md), and the containers are
 * what we actually want to verify anyway.
 */
export default defineConfig({
  testDir: './tests',
  // Flaky results are worse than no results — a founder who learns that red can
  // be ignored stops trusting the whole suite. One retry absorbs tunnel
  // hiccups; anything flakier than that should be fixed or skipped.
  retries: 1,
  workers: 2,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.QA_BASE_URL ?? 'https://uat.certifinehk.com',
    ignoreHTTPSErrors: true,
    // Kept on failure only — artefacts are for diagnosing a red run, not for
    // filling the disk on green ones.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Mobile-only specs must not also run under desktop — a mobile-viewport
    // assertion (hamburger visible) is false by design on a wide screen.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*mobile.*\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['iPhone 13'] }, testMatch: /.*mobile.*\.spec\.ts/ },
  ],
});
