// Playwright Test config for the headless checks in qa/checks/.
// Run with `npm run check`. The dev server (npm run dev, port 8788) is reused
// if it is already running; `live.spec.mjs` also needs the relay (npm run
// dev:live, port 8789).
import { defineConfig, devices } from '@playwright/test';

const baseURL = (process.env.CHECK_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');

// The iPhone 14 profile defaults to WebKit, which ignores the software-GL
// flags below and draws the map on the GPU: on 2026-11-07 its GPU process
// reached 8.4 GB in 90 seconds and the 16 GB Mac ran out of memory. So the
// engine is named here, after the profile.
const phone = { ...devices['iPhone 14'], browserName: 'chromium' };

export default defineConfig({
  testDir: 'checks',
  outputDir: 'checks/out',
  fullyParallel: false,
  workers: 1, // each check drives one heavy map
  timeout: 120_000,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Software GL so the map renders with no GPU.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'phone-light', use: { ...phone, colorScheme: 'light' } },
    { name: 'phone-dark', use: { ...phone, colorScheme: 'dark' } },
  ],
  // No webServer: the checks run against a dev server you already have up
  // (`npm run dev`, and `npm run dev:live` for live.spec.mjs). Starting one
  // from here would hide a server that had died mid-run.
});
