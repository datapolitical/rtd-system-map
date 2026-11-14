// The sheets page offline (DESIGN.md, "Quality floor", Offline; issue #14). After one visit the
// page opens with no connection: its own files from the last time they were fetched, and the
// basemap tiles of the places looked at.
//
// The page's own files go to the network first and to this cache only when the network fails, so
// a new deploy reaches everyone online on their next load and nobody is held on an old version.
// The basemap's tiles go to this cache first: their addresses name the tile build they belong to
// (the tile index at /planet, fetched network-first, names the current one), so a cached tile is
// never out of date. Anything else, the Live relay among it, is never touched here.

const PAGE = 'sheets-page-v1';
const TILES = 'sheets-tiles-v1';
const TILE_CAP = 3000; // about 100 MB at the most; the oldest go first

// The sheets page and what it fetches. Other pages (the classic map) are left to the network.
const OWN = /^\/(?:|index\.html|js\/.+|vendor\/.+|data\/(?:meta\.json|sheets\.json|sheet-\d+\.geojson)|poster\/.+)$/;
const TILE_HOST = 'tiles.openfreemap.org';
const TILE = /^\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf$/;

const kind = (url) => {
  if (url.origin === location.origin) return OWN.test(url.pathname) ? 'own' : null;
  if (url.hostname !== TILE_HOST) return null;
  return TILE.test(url.pathname) ? 'tile' : url.pathname === '/planet' ? 'own' : null;
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // A cache this version doesn't name is an old one's.
    for (const name of await caches.keys()) if (![PAGE, TILES].includes(name)) await caches.delete(name);
    // The page's request leaves at once instead of waiting for this worker to start.
    await self.registration.navigationPreload?.enable();
    await self.clients.claim();
  })());
});

let puts = 0;
async function keep(cacheName, request, response) {
  // A redirected answer can't be given to a page's own request later; an opaque one can't be checked.
  if (!response || response.status !== 200 || response.redirected || !['basic', 'cors', 'default'].includes(response.type)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (cacheName === TILES && ++puts % 100 === 0) {
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - TILE_CAP))) await cache.delete(old);
  }
}

async function networkFirst(event, key) {
  try {
    const response = (await event.preloadResponse) ?? (await fetch(event.request));
    if (response.ok) event.waitUntil(keep(PAGE, key, response.clone()));
    return response;
  } catch (error) {
    const cached = await caches.match(key, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  event.waitUntil(keep(TILES, event.request, response.clone()));
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  const k = kind(url);
  if (!k) return;
  // The page is kept under its plain address: the theme a link forces is read by the page itself.
  if (request.mode === 'navigate') event.respondWith(networkFirst(event, new Request(url.origin + url.pathname)));
  else event.respondWith(k === 'tile' ? cacheFirst(event) : networkFirst(event, request));
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
