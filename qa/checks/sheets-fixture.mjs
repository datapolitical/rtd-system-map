import { test as base, expect } from '@playwright/test';
import { stubAnalytics } from '../lib/analytics.mjs';

export const test = base.extend({
  sheetPage: async ({ page }, use, testInfo) => {
    const errors = [], consoleLog = [], preloadTiming = [], failed = [], consoleTasks = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // Chromium's preload timing advisory depends on software-renderer speed.
      // Keep it in the report, separate from actual map warnings and errors.
      if (/^The resource .* was preloaded using link preload but not used within a few seconds/.test(message.text())) {
        preloadTiming.push(message.text());
        return;
      }
      if (['error', 'warning'].includes(message.type()) && !/GL Driver Message/.test(message.text())) {
        consoleTasks.push(Promise.all(message.args().map((arg) => arg.evaluate((value) => value?.stack || value?.message || String(value)).catch(() => '')))
          .then((args) => consoleLog.push(args.filter(Boolean).join(' ') || message.text())));
      }
    });
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') failed.push(`${request.url()}: ${request.failure()?.errorText}`);
    });
    page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()}: ${response.url()}`); });
    await stubAnalytics(page);
    const theme = testInfo.project.name.endsWith('dark') ? 'dark' : 'light';
    const settled = () => page.waitForFunction(() => {
      const map = window.sheetsMap;
      return window.sheetsReady && map && !map.isMoving() && map.isStyleLoaded() && map.areTilesLoaded();
    }, null, { timeout: 90_000 });
    const goto = async (hash = '') => {
      await page.goto(`/?theme=${theme}${hash}`, { waitUntil: 'domcontentloaded' });
      await settled();
    };
    await use({ page, theme, goto, settled, errors, consoleLog, preloadTiming, failed, flushConsole: () => Promise.all(consoleTasks) });
    expect(errors, 'page errors').toEqual([]);
  },
});

export { expect };
