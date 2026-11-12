// A page opened the way the checks' fixture opens one, for scripts outside
// Playwright Test (the sweep, probes): headless Chromium with software GL
// (never WebKit: see qa/playwright.config.mjs), an iPhone 14 viewport, the
// map exposed as window.__map, Live off, the detectors' helpers installed.
import { chromium, devices } from '@playwright/test';
import { install } from './detect.mjs';
import { stubAnalytics } from './analytics.mjs';
import { mapPath } from './where.mjs';

export const BASE = (process.env.CHECK_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
const phone = { ...devices['iPhone 14'] };
delete phone.defaultBrowserType;

export const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

export async function open(browser, theme, v, { base = BASE } = {}) {
  const context = await browser.newContext({ ...phone, colorScheme: theme, baseURL: base });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubAnalytics(page);
  await page.route('**/js/main.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('loadWhenNeeded(map);', 'window.__map=map;loadWhenNeeded(map);');
    await route.fulfill({ response: res, body });
  });
  await page.addInitScript(() => localStorage.setItem('live', 'off'));
  await page.goto(`${await mapPath(base)}#${v.zoom}/${v.lat}/${v.lon}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__map, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__map.loaded(), null, { timeout: 60_000 }).catch(() => {});
  await install(page);
  return { context, page, errors };
}
