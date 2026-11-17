import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function worker(cached = new Response('saved')) {
  const network = deferred();
  const events = new Map();
  const timers = new Map();
  const background = [];
  const writes = [];
  let timerId = 0;
  const context = vm.createContext({
    URL, Request, location: { origin: 'https://map.test' },
    self: { addEventListener: (name, fn) => events.set(name, fn) },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    fetch: () => network.promise,
    caches: { match: async () => cached?.clone(), open: async () => ({ put: async (_, response) => writes.push(await response.text()) }) },
  });
  vm.runInContext(source, context);
  return {
    network, writes, timers, background,
    request(path = '/') {
      let answer;
      events.get('fetch')({ request: new Request(`https://map.test${path}`), preloadResponse: Promise.resolve(undefined),
        respondWith: (p) => { answer = p; }, waitUntil: (p) => background.push(p) });
      return answer;
    },
    timeout() { for (const t of timers.values()) { assert.ok(t.ms <= 3000); t.fn(); } },
  };
}

test('a stalled connection uses the saved copy within a few seconds and later refreshes it', async () => {
  const w = worker();
  const answer = w.request();
  w.timeout();
  assert.equal(await (await answer).text(), 'saved');
  w.network.resolve(new Response('new deploy'));
  await Promise.all(w.background);
  assert.deepEqual(w.writes, ['new deploy']);
});

test('a quick new deploy wins over the saved copy and refreshes the offline copy', async () => {
  const w = worker();
  const answer = w.request('/js/sheets/main.js');
  w.network.resolve(new Response('new deploy'));
  assert.equal(await (await answer).text(), 'new deploy');
  await Promise.all(w.background);
  assert.deepEqual(w.writes, ['new deploy']);
  assert.equal(w.timers.size, 0);
});

test('a slow first visit without a saved copy still waits for its network answer', async () => {
  const w = worker(null);
  const answer = w.request();
  w.timeout();
  w.network.resolve(new Response('first visit'));
  assert.equal(await (await answer).text(), 'first visit');
});

test('network failures and temporary server errors use the saved copy', async () => {
  for (const fail of [true, false]) {
    const w = worker();
    const answer = w.request();
    if (fail) w.network.reject(new Error('offline'));
    else w.network.resolve(new Response('unavailable', { status: 503 }));
    assert.equal(await (await answer).text(), 'saved');
  }
});

test('the route directory is available offline; unrelated pages are left alone', async () => {
  const w = worker();
  const answer = w.request('/data/directory.json');
  w.timeout();
  assert.equal(await (await answer).text(), 'saved');
  assert.equal(w.request('/classic/'), undefined);
});
