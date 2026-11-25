// Taps on + and - while a step waits for its sheet (#210). Since #205 a step waits until the next
// sheet's tiles are made, and in the first seconds of a visit that takes a moment. A tap made
// during the wait used to ask for the same sheet again and was lost: two taps gave one step.
// Each test taps as soon as the map is drawn, when the wait is longest; one that finds no wait
// on its first tap is skipped, since it would prove nothing about taps during a wait.
import { SHEETS, OPENING } from '../../public/js/sheets/style.js';
import { test, expect } from './sheets-fixture.mjs';

const LAST = SHEETS.length - 1;

// Opened, drawn, and nothing else waited for: the next sheet is not ready yet.
async function opened(sheetPage) {
  const { page, theme } = sheetPage;
  await page.goto(`/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.sheetsReady && window.sheetsMap && !window.sheetsMap.isMoving(), null, { timeout: 90_000 });
  expect(await shown(page)).toBe(OPENING);
}
// The sheet the dots name (0-based).
const shown = async (page) => Number(/Sheet (\d+) of/.exec(await page.locator('#sheets').getAttribute('aria-label'))[1]) - 1;
// Whether a step waits for its sheet. A build from before #210 has no sheetsHeld; there the
// "Loading…" line says so, shown 120 ms into a wait (a key's wait began after MapLibre's own zoom).
const held = (page) => page.evaluate(() => ('sheetsHeld' in window ? window.sheetsHeld
  : new Promise((done) => setTimeout(() => done(!document.querySelector('#wait').hidden), 700))));
// No step waits, the map is at rest on a sheet, and its tiles are drawn.
async function stepped(page) {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => {
    const map = window.sheetsMap;
    const waits = 'sheetsHeld' in window ? window.sheetsHeld : !document.querySelector('#wait').hidden;
    return !waits && !map.isMoving() && map.areTilesLoaded();
  }, null, { timeout: 90_000 });
}
const atRest = (page, i) => page.evaluate((i) => Math.abs(window.sheetsMap.getZoom() - window.sheetsZooms.rests[i]) < 0.01, i);
// Taps on a button 80 ms apart. Forced: a button on the last or first sheet is disabled, and a
// tap on it does nothing, as on a phone.
async function taps(page, button, n) {
  let first = false;
  for (let i = 0; i < n; i++) {
    await page.locator(button).click({ force: true });
    if (i === 0) first = await held(page);
    else await page.waitForTimeout(80);
  }
  return first;
}

// Frames drawn while the map moves with no tile of the sheet in view (bare ground, black in the
// dark theme), counted as js/steptest.js counts them.
const countBare = (page) => page.evaluate(() => {
  const map = window.sheetsMap;
  const { zooms, ids } = window.sheetsZooms;
  const band = (z) => zooms.findLastIndex((zz, i) => !i || (zooms[i - 1] + zz) / 2 <= z);
  window.bareFrames = { frames: 0, bare: 0 };
  map.on('render', () => {
    if (!map.isMoving()) return;
    window.bareFrames.frames++;
    if (!map.style?.tileManagers?.[`sheet-${ids[band(map.getZoom())]}`]?.getRenderableIds().length) window.bareFrames.bare++;
  });
});

test('two quick taps on + go two sheets on', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await opened(sheetPage);
  test.skip(!(await taps(page, '#in', 2)), 'the next sheet was ready at once: no wait to tap through');
  await stepped(page);
  expect(await shown(page)).toBe(OPENING + 2);
  expect(await atRest(page, OPENING + 2)).toBe(true);
});

// The steps a wait gathers are taken one sheet at a time: a move of several sheets at once
// drew bare ground on the way, in the first try at #210.
test('three quick taps on + go three sheets on, with no bare frame on the way', async ({ sheetPage }) => {
  const { page } = sheetPage;
  const to = Math.min(LAST, OPENING + 3);
  await opened(sheetPage);
  await countBare(page);
  test.skip(!(await taps(page, '#in', to - OPENING)), 'the next sheet was ready at once: no wait to tap through');
  await stepped(page);
  expect(await shown(page)).toBe(to);
  expect(await atRest(page, to)).toBe(true);
  const { frames, bare } = await page.evaluate(() => window.bareFrames);
  expect(frames).toBeGreaterThan(0);
  expect(bare, `${bare} of ${frames} frames drew no part of the sheet`).toBe(0);
});

test('the + key pressed twice during a wait goes two sheets on, as the button does', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await opened(sheetPage);
  await page.locator('.maplibregl-canvas').focus();
  await page.keyboard.press('+');
  test.skip(!(await held(page)), 'the next sheet was ready at once: no wait to tap through');
  await page.keyboard.press('+');
  await stepped(page);
  expect(await shown(page)).toBe(OPENING + 2);
  expect(await atRest(page, OPENING + 2)).toBe(true);
});

test('a tap on - during a wait for + cancels the step', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await opened(sheetPage);
  await page.locator('#in').click();
  test.skip(!(await held(page)), 'the next sheet was ready at once: no wait to cancel');
  await page.locator('#out').click();
  await stepped(page);
  // Long enough for a wait that went on to end in a step (HOLD_MS is 8 s).
  await page.waitForTimeout(9000);
  expect(await shown(page)).toBe(OPENING);
  expect(await atRest(page, OPENING)).toBe(true);
  await expect(page.locator('#wait')).toBeHidden();
});

test('taps during a wait stop at the last sheet, and at the first', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await opened(sheetPage);
  test.skip(!(await taps(page, '#in', LAST - OPENING + 3)), 'the next sheet was ready at once: no wait to tap through');
  await stepped(page);
  expect(await shown(page)).toBe(LAST);
  expect(await atRest(page, LAST)).toBe(true);
  await expect(page.locator('#in')).toBeDisabled();
  await taps(page, '#out', LAST + 3);
  await stepped(page);
  expect(await shown(page)).toBe(0);
  expect(await atRest(page, 0)).toBe(true);
  await expect(page.locator('#out')).toBeDisabled();
});
