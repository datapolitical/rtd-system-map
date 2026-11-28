// A stand-in for RTD's GTFS-realtime folder, for checking live predictions (qa/live-predictions.mjs).
// The local relay is pointed at it (wrangler dev --var FEEDS:http://127.0.0.1:PORT/), and the
// check tells it what to serve:
//   GET /set?mode=live|stale|fail&times=STOP:TRIP:SECONDS:ROUTE,...&skip=STOP:TRIP,...
//   GET /TripUpdate.pb          the feed in that mode: fresh, ten minutes old, or HTTP 503
//   GET /VehiclePosition.pb, /Alerts.pb   empty feeds
//   GET /count                  how many times TripUpdate.pb has been asked for
// node qa/lib/fake-feed.mjs [port, default 8831]
import http from 'node:http';

const varint = (n) => { const out = []; let v = BigInt(n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return out; };
const key = (field, type) => varint(field * 8 + type);
const str = (field, s) => { const b = [...Buffer.from(String(s))]; return [...key(field, 2), ...varint(b.length), ...b]; };
const int = (field, n) => [...key(field, 0), ...varint(n)];
const msg = (field, parts) => { const b = parts.flat(); return [...key(field, 2), ...varint(b.length), ...b]; };

/** A TripUpdate feed: `times` are [stop, trip, seconds, route], `skip` [stop, trip], `at` the feed's own time. */
export function tripUpdates({ times = [], skip = [], at }) {
  const byTrip = new Map();
  for (const [stop, trip, time, route] of times) (byTrip.get(trip) ?? byTrip.set(trip, { route, calls: [] }).get(trip)).calls.push(msg(2, [str(4, stop), msg(3, [int(2, time)])]));
  for (const [stop, trip] of skip) (byTrip.get(trip) ?? byTrip.set(trip, { route: '', calls: [] }).get(trip)).calls.push(msg(2, [str(4, stop), int(5, 1)]));
  const entities = [...byTrip].map(([trip, { route, calls }]) => msg(2, [str(1, trip), msg(3, [msg(1, [str(1, trip), str(5, route ?? '')]), ...calls, int(4, at)])]));
  return Uint8Array.from([...msg(1, [str(1, '2.0'), int(2, 0), int(3, at)]), ...entities.flat()]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const state = { mode: 'live', times: [], skip: [], count: 0 };
  const list = (text) => String(text ?? '').split(',').filter(Boolean).map((item) => item.split(':'));
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const now = Math.floor(Date.now() / 1000);
    if (url.pathname === '/set') {
      state.mode = url.searchParams.get('mode') ?? state.mode;
      if (url.searchParams.has('times')) state.times = list(url.searchParams.get('times')).map(([stop, trip, time, route]) => [stop, trip, Number(time), route ?? '']);
      if (url.searchParams.has('skip')) state.skip = list(url.searchParams.get('skip'));
      res.end(JSON.stringify(state));
    } else if (url.pathname === '/count') res.end(String(state.count));
    else if (url.pathname === '/TripUpdate.pb') {
      state.count++;
      if (state.mode === 'fail') { res.statusCode = 503; res.end('down'); return; }
      res.end(tripUpdates({ times: state.times, skip: state.skip, at: state.mode === 'stale' ? now - 600 : now }));
    } else if (url.pathname.endsWith('.pb')) res.end(tripUpdates({ at: now }));
    else { res.statusCode = 404; res.end(); }
  }).listen(Number(process.argv[2] ?? 8831), '127.0.0.1');
}
