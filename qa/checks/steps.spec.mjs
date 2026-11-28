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

// Quick taps as Safari on the iPhone delivers them (Chris, 2026-11-25: "I have to wait a second
// between taps for it to register"). Safari makes no click of a tap that comes within about
// 300 ms of the last one: it takes the two as a double tap (WebKit bug 202917; on the home
// screen, any tap). Chromium makes a click of every tap, so the checks above, which click, never
// saw it. Here the page drops the click of every second tap in a quick burst, as Safari does.
// The burst is marked by the check rather than timed in the page: a busy headless page receives
// the taps late, which stretched the gap past Safari's window on a slow frame.
async function likeSafari(page) {
  await page.addInitScript(() => {
    let n = 0, drop = false;
    window.safariBurst = false;
    window.safariDropped = 0;
    addEventListener('touchend', () => { if (window.safariBurst) drop = ++n % 2 === 0; }, true);
    addEventListener('click', (e) => { if (!drop) return; drop = false; window.safariDropped++; e.stopImmediatePropagation(); e.preventDefault(); }, true);
  });
}
async function touchTaps(page, button, n, apart = 60) {
  const box = await page.locator(button).boundingBox();
  await page.evaluate(() => { window.safariBurst = true; });
  for (let i = 0; i < n; i++) {
    if (i) await page.waitForTimeout(apart);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
}

test('two quick taps on +, as Safari delivers them, go two sheets on', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await likeSafari(page);
  await opened(sheetPage);
  await stepped(page);
  await touchTaps(page, '#in', 2);
  expect(await page.evaluate(() => window.safariDropped), 'Safari\'s click of the second tap was dropped').toBe(1);
  await stepped(page);
  expect(await shown(page)).toBe(OPENING + 2);
  expect(await atRest(page, OPENING + 2)).toBe(true);
});

test('two quick taps on -, as Safari delivers them, go two sheets back', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await likeSafari(page);
  await opened(sheetPage);
  for (let i = 0; i < 2; i++) { // two sheets on, one at a time, to have two to come back
    await stepped(page);
    await page.locator('#in').click();
  }
  await stepped(page);
  expect(await shown(page)).toBe(OPENING + 2);
  await touchTaps(page, '#out', 2);
  expect(await page.evaluate(() => window.safariDropped), 'Safari\'s click of the second tap was dropped').toBe(1);
  await stepped(page);
  expect(await shown(page)).toBe(OPENING);
  expect(await atRest(page, OPENING)).toBe(true);
});

// A tap is counted once: on the finger lifting, and not again on the click a browser makes of it.
test('one tap on + goes one sheet on, not two', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await opened(sheetPage);
  await stepped(page);
  await touchTaps(page, '#in', 1);
  await stepped(page);
  await page.waitForTimeout(1000);
  await stepped(page);
  expect(await shown(page)).toBe(OPENING + 1);
  expect(await atRest(page, OPENING + 1)).toBe(true);
});

// A double tap on the map still goes one sheet closer, about the point tapped: the buttons step
// on the finger lifting, and the map's own double tap is MapLibre's, from its touches.
test('a double tap on the map, as Safari delivers it, goes one sheet on', async ({ sheetPage }) => {
  const { page } = sheetPage;
  await likeSafari(page);
  await opened(sheetPage);
  await stepped(page);
  // On bare ground: a tap on a line, station or stop opens its card instead (as on a phone).
  const at = await page.evaluate(() => {
    const map = window.sheetsMap, { clientWidth: w, clientHeight: h } = map.getContainer();
    // Clear by 16 px: the page looks 9 px about a tap for what is under it.
    for (let y = 0.1; y <= 0.7; y += 0.025) for (let x = 0.1; x <= 0.9; x += 0.025) {
      const p = [x * w, y * h];
      const near = map.queryRenderedFeatures([[p[0] - 16, p[1] - 16], [p[0] + 16, p[1] + 16]])
        .filter((f) => /^(rail|letter|station|name|group-stop|pick-letter|stop-letter|bus|stop)-\d+$/.test(f.layer.id)); // what a tap opens (main.js)
      if (!near.length) return p;
    }
    return null;
  });
  expect(at, 'a spot of bare ground near the middle of the map').not.toBeNull();
  // Timestamp the native touch events at the source. Waiting for touchscreen.tap() to
  // return before sending the second tap can stretch the gesture past MapLibre's window
  // when the renderer is busy (#259).
  await page.evaluate(() => { window.safariBurst = true; });
  const session = await page.context().newCDPSession(page);
  const [x, y] = at;
  const start = Date.now() / 1000 - 0.08;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], timestamp: start });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: start + 0.02 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], timestamp: start + 0.06 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: start + 0.08 });
  await session.detach();
  await stepped(page);
  await page.waitForTimeout(1000);
  await stepped(page);
  expect(await shown(page)).toBe(OPENING + 1);
  expect(await atRest(page, OPENING + 1)).toBe(true);
});
