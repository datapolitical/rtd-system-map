// ?timing only (timing.js): a stopwatch inside the map's worker. timing-worker.mjs loads this before
// MapLibre's worker code, so every message and timer the worker handles passes through it. It
// reports to the page over a BroadcastChannel, in ms since the page's own start.
const origin = performance.timeOrigin;
export const now = () => origin + performance.now();
const id = Math.random().toString(36).slice(2, 6);
const channel = new BroadcastChannel('map-timing');
const later = self.setTimeout.bind(self);
let queue = [];
let flushing = false;
export const send = (record) => {
  queue.push(record);
  if (flushing) return;
  flushing = true;
  later(() => { channel.postMessage({ w: id, list: queue }); queue = []; flushing = false; }, 200);
};
send({ kind: 'start', born: origin, at: now() });

// Busy runs: from a task starting after a quiet moment until the worker's queue is next empty
// (a message posted to itself at the start comes back only after the tasks already waiting).
let run = null;
const marker = new MessageChannel();
marker.port1.onmessage = () => { send({ kind: 'busy', s: run, e: now() }); run = null; };
const mark = () => { if (run === null) { run = now(); marker.port2.postMessage(0); } };
const wrapped = new WeakMap();
const wrap = (fn) => {
  if (typeof fn !== 'function') return fn;
  if (!wrapped.has(fn)) wrapped.set(fn, function (...a) { mark(); return fn.apply(this, a); });
  return wrapped.get(fn);
};
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener = function (type, fn, o) { return add.call(this, type, type === 'message' ? wrap(fn) : fn, o); };
EventTarget.prototype.removeEventListener = function (type, fn, o) { return remove.call(this, type, type === 'message' ? wrap(fn) : fn, o); };
const onmessage = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
Object.defineProperty(MessagePort.prototype, 'onmessage', { ...onmessage, set(fn) { onmessage.set.call(this, wrap(fn)); } });
self.setTimeout = (fn, ms, ...a) => later(wrap(fn), ms, ...a);
