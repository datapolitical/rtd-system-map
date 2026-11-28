// The sheets page offline (DESIGN.md, "Quality floor", Offline; issue #14). After one visit the
// page opens with no connection: its own files from the last time they were fetched, and the
// tiles (each sheet's and the ground's) of the places looked at.
//
// Everything goes to the network first and to this cache only when the network fails, so a new
// deploy reaches everyone online on their next load and nobody is held on an old version. The
// tiles are kept apart, so there is a limit to how many. Anything else, the Live relay among it,
// is never touched here.

// v1 also held each sheet's whole drawing, which the page no longer reads: a new name lets it go.
const PAGE = 'sheets-page-v2';
// v1 held OpenFreeMap's tiles, before the site served its own: a new name lets it go.
const TILES = 'sheets-tiles-v2';
const TILE_CAP = 3000; // about 30 MB at the most; the oldest go first
const NETWORK_WAIT_MS = 2500;

// The sheets page and what it fetches. Other pages (the classic map) are left to the network.
const OWN = /^\/(?:|index\.html|js\/.+|vendor\/.+|data\/(?:meta\.json|sheets\.json|directory\.json|programs\.json|facilities\.geojson|stops\.geojson|departures\/[\w-]+\.json)|poster\/.+)$/;
const TILE = /^\/tiles\/[\w-]+\/\d+\/\d+\/\d+\.pbf$/;

const kind = (url) => {
  if (url.origin !== location.origin) return null;
  return TILE.test(url.pathname) ? 'tile' : OWN.test(url.pathname) ? 'own' : null;
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // A cache this version doesn't name is an old one's.
    for (const name of await caches.keys()) if (name.startsWith('sheets-') && ![PAGE, TILES].includes(name)) await caches.delete(name);
    // The page's request leaves at once instead of waiting for this worker to start.
    await self.registration.navigationPreload?.enable();
    await self.clients.claim();
  })());
});

let puts = 0;
async function keep(cacheName, request, response) {
  // A redirected answer can't be given to a page's own request later; an opaque one can't be checked.
  if (!response || response.status !== 200 || response.redirected || !['basic', 'cors', 'default'].includes(response.type)) return;
  // Not the front page the host answers a tile it doesn't have with, which comes with the tiles'
  // own type (_headers): it is known by its "<".
  if (cacheName === TILES && new Uint8Array(await response.clone().arrayBuffer())[0] === 0x3c) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (cacheName === TILES && ++puts % 100 === 0) {
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - TILE_CAP))) await cache.delete(old);
  }
}

async function networkFirst(event, key, cacheName = PAGE) {
  const refresh = (async () => {
    const response = (await event.preloadResponse) ?? (await fetch(event.request));
    if (response.ok) await keep(cacheName, key, response.clone());
    return response;
  })();
  // If the saved copy wins, a slow but successful response still updates it for next time.
  event.waitUntil(refresh.then(() => {}, () => {}));
  let timer;
  try {
    const response = await Promise.race([refresh, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Network did not answer in time')), NETWORK_WAIT_MS);
    })]);
    if (!response.ok) {
      const cached = await caches.match(key, { ignoreSearch: event.request.mode === 'navigate' });
      if (cached) return cached;
    }
    return response;
  } catch (error) {
    const cached = await caches.match(key, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    return refresh; // without a saved copy, a slow first visit still gets its answer
  } finally { clearTimeout(timer); }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  const k = kind(url);
  if (!k) return;
  // The page is kept under its plain address: the theme a link forces is read by the page itself.
  if (request.mode === 'navigate') event.respondWith(networkFirst(event, new Request(url.origin + url.pathname)));
  else event.respondWith(networkFirst(event, request, k === 'tile' ? TILES : PAGE));
});

// The files the first visit fetched before this worker was there to keep them: the page lists
// them once it has drawn (js/sheets/main.js), and they are kept here, mostly from the browser's
// own cache.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'keep' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    for (const href of event.data.urls) {
      let url;
      try { url = new URL(href, location.origin); } catch { continue; }
      const k = kind(url);
      if (!k) continue;
      url.hash = '';
      const request = new Request(url.href, { mode: 'cors', credentials: 'omit' });
      if (await caches.match(request)) continue;
      try { await keep(k === 'tile' ? TILES : PAGE, request, await fetch(request)); } catch { /* offline again: the next visit keeps it */ }
    }
  })());
});
