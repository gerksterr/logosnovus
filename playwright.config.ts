import { defineConfig } from '@playwright/test';

// Uses the Chromium bundled with this Playwright version (preinstalled in CI images
// via PLAYWRIGHT_BROWSERS_PATH). Tests run against the production build.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 393, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
