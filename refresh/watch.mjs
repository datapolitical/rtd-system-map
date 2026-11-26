// The hourly check (DESIGN.md, "Zero maintenance", Rule 2). It asks RTD
// whether any source has changed since the live site's data was built. The
// basemap is the site's own (scripts/basemap.mjs), refreshed by hand, so a new
// tile build elsewhere changes nothing here. It rebuilds nothing: a change sends one phone alert, and we rebuild
// on our own machine with `npm run build:data`, check the result, and commit.
// The same change alerts once; a further change alerts again.
//
//   node refresh/watch.mjs            check, alert on something new
//   node refresh/watch.mjs --dry-run  check and print; no alert, nothing saved
//
// It runs from a systemd user timer (refresh/systemd/). The Pushover keys come
// from the environment (PUSHOVER_USER_KEY, PUSHOVER_APP_TOKEN); without them it
// only prints. Where it remembers what it sent: RTD_WATCH_STATE, or
// ~/.local/state/rtd-map-watch/sent.json.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { whatChanged } from './check.mjs';

const SITE = (process.env.RTD_SITE_URL ?? 'https://rtd-system-map.pages.dev').replace(/\/$/, '');
const STATE = process.env.RTD_WATCH_STATE ?? path.join(homedir(), '.local', 'state', 'rtd-map-watch', 'sent.json');
const dryRun = process.argv.includes('--dry-run');

const fresh = { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(60_000) };

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'ArcGIS error');
  return json;
}

async function sha256(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
}

async function alert(title, message) {
  const { PUSHOVER_USER_KEY: user, PUSHOVER_APP_TOKEN: token } = process.env;
  if (!user || !token) {
    console.log('no Pushover keys in the environment; not sent');
    return false;
  }
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body: new URLSearchParams({ token, user, title, message, url: SITE, url_title: 'The live map' }),
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`alert: ${res.status}`);
  return res.ok;
}

const res = await fetch(`${SITE}/data/meta.json`, fresh);
if (!res.ok) {
  console.log(`no meta.json on ${SITE} (${res.status}); nothing to compare`);
  process.exit(0);
}
const meta = await res.json();
const { changes, problems } = await whatChanged(meta, { getJson, sha256 });
for (const p of problems) console.log(p);
if (!changes.length) {
  console.log(`unchanged since ${meta.built}`);
  process.exit(0);
}

const key = createHash('sha256').update(changes.join('\n')).digest('hex');
const sent = JSON.parse(await readFile(STATE, 'utf8').catch(() => 'null'));
console.log(`changed since ${meta.built}:\n  ${changes.join('\n  ')}`);
if (dryRun) process.exit(0);
if (sent?.key === key) {
  console.log(`already alerted ${sent.at}`);
  process.exit(0);
}

const message = [`RTD changed its data since the map was built (${meta.built.slice(0, 10)}):`, ...changes.map((c) => `• ${c}`), '', 'Nothing was rebuilt. When ready: npm run build:data, check it, commit.'].join('\n');
if (await alert('RTD map: new RTD data', message)) {
  await mkdir(path.dirname(STATE), { recursive: true });
  await writeFile(`${STATE}.next`, JSON.stringify({ key, at: new Date().toISOString(), built: meta.built, changes }, null, 2));
  await rename(`${STATE}.next`, STATE);
}
