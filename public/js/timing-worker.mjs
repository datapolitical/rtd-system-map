// ?timing only (timing.js, main.js): MapLibre's worker with a stopwatch. The clock goes in first
// (timing-worker-clock.mjs); then each job the page sends the worker (read the style's layers, cut a
// tile, ...) is timed, and so is each wait for the page (a tile's bytes, letters, icons).
import { now, send, files } from './timing-worker-clock.mjs';
import '../vendor/maplibre-gl-worker.mjs';

send({ kind: 'ready', at: now(), files: files() });
const actor = self.worker?.actor;
if (actor) {
  const time = (type, fn) => function (mapId, p) {
    const s = now();
    const r = fn.call(this, mapId, p);
    const sync = now() - s;
    const z = p?.tileID?.canonical?.z ?? p?.tileID?.overscaledZ;
    const done = () => send({ kind: 'job', type, source: p?.source, z, s, sync, e: now() });
    Promise.resolve(r).then(done, done);
    return r;
  };
  for (const [type, fn] of Object.entries(actor.messageHandlers)) actor.messageHandlers[type] = time(type, fn);
  const register = actor.registerMessageHandler.bind(actor);
  actor.registerMessageHandler = (type, fn) => register(type, time(type, fn));
  const ask = actor.sendAsync.bind(actor);
  actor.sendAsync = (message, ...rest) => {
    const s = now();
    const p = ask(message, ...rest);
    const done = () => send({ kind: 'wait', type: message?.type, s, e: now() });
    p.then(done, done);
    return p;
  };
}
