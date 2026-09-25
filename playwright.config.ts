import { dirname } from 'path';

import { defineConfig, devices } from '@playwright/test';
import type { PluginOptions } from '@grafana/plugin-e2e';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * GRAFANA_URL is set only by the Cloud cron workflow (.github/workflows/cron.yml),
 * which runs the suite against a shared Grafana Cloud dev instance.
 */
const isCloudRun = !!process.env.GRAFANA_URL;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig<PluginOptions>({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /*
   * Timeout ceilings are raised for Cloud runs. Each test gets a fresh browser
   * context, so on the shared Cloud instance every test re-downloads the plugin
   * bundle and Monaco assets. When the instance is busy that first paint can
   * exceed Playwright's 5s expect default, which made the query editor rendering
   * tests flake on the nightly cron. These are polling ceilings, not sleeps, so
   * fast runs are unaffected.
   */
  timeout: isCloudRun ? 90_000 : 30_000,
  expect: {
    timeout: isCloudRun ? 30_000 : 5_000,
  },
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.GRAFANA_URL || `http://localhost:${process.env.PORT || 3000}`,

    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    /*
     * Recording video makes fully-parallel local runs CPU-bound enough to cause spurious
     * timeouts, and no workflow keeps the output, so nothing reads it. `retain-on-failure`
     * would not help: it records for every test and only deletes the passing ones, so it
     * costs the same to run. Pass `--video=retain-on-failure` when a failure needs one.
     */
    video: 'off',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'auth',
      testDir: `${dirname(require.resolve('@grafana/plugin-e2e'))}/auth`,
      testMatch: [/.*\.js/],
    },
    {
      name: 'run-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: `playwright/.auth/${process.env.GRAFANA_ADMIN_USER || 'admin'}.json`,
      },
      dependencies: ['auth'],
    },
  ],
});
