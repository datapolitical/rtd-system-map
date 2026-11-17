// Build failure drills (qa/BRIEF.md, task 3): load with
// `node --import ./qa/drills/mock-fetch.mjs scripts/build-data.mjs` and pick
// the damage with DRILL. Every other request goes through untouched.
//
//   osm-down       OpenStreetMap's map API fails (HTTP 503) for every box.
//   osm-empty      OpenStreetMap answers 200 with no shapes at all.
//   osm-half       OpenStreetMap answers every other box with no shapes.
//   osm-down-cold  OSM fails, and the published site has no data to fall
//                  back on (its /data/ files answer 404).
const DRILL = process.env.DRILL ?? '';
const real = globalThis.fetch;
let asked = 0;
const osm = (url) => /api\.openstreetmap\.org/.test(url);
const site = (url) => /\/data\/(structures|terminals|meta)\.(geo)?json/.test(url);

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url ?? String(input);
  if (osm(url) && DRILL.startsWith('osm-down')) return new Response('drill', { status: 503, statusText: 'Service Unavailable' });
  if (osm(url) && DRILL === 'osm-half' && (asked++ % 2)) return new Response('<?xml version="1.0"?><osm version="0.6"></osm>', { status: 200 });
  if (osm(url) && DRILL === 'osm-empty') return new Response('<?xml version="1.0"?><osm version="0.6"></osm>', { status: 200 });
  if (site(url) && DRILL === 'osm-down-cold') return new Response('not found', { status: 404, statusText: 'Not Found' });
  return real(input, init);
};
if (DRILL) console.log(`DRILL: ${DRILL}`);
