// The Live relay: one Durable Object that fetches RTD's GTFS-realtime feeds
// while anyone has Live on, and pushes each change to every open page over a
// WebSocket. RTD sees one request per feed per poll, however many people are
// watching, and nobody's browser has to talk to RTD (which allows no
// cross-site requests). See DESIGN.md, "Live data".
//
// Pages reaches this object through its binding (wrangler.toml at the
// repository root); the WebSocket route itself is functions/live/stream.js.
// Deploy from the repository root:
//   npx wrangler deploy --config live/wrangler.toml

import { DurableObject } from 'cloudflare:workers';
import { POLL_MS, emptyState, message, refresh, tick } from '../../public/js/realtime.js';
import { decodeFeed } from './gtfsrt.mjs';

// Where RTD publishes the feeds, unless the Worker's FEEDS var says otherwise.
const RTD_FEEDS = 'https://open-data.rtd-denver.com/files/gtfs-rt/rtd/';
const STATE_KEY = 'state';
const FETCH_TIMEOUT_MS = 10_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export class LiveRoom extends DurableObject {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/stream' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return this.connect();
    if (pathname === '/state') return json(message(await this.state(), 'snapshot'));
    return json({ error: 'Not found' }, 404);
  }

  async state() {
    return (await this.ctx.storage.get(STATE_KEY)) ?? emptyState();
  }

  // A new viewer: accept the socket (hibernatable, so an idle object costs
  // nothing between polls), send what we have, and make sure polling is on.
  async connect() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, ['viewer']);
    const state = await this.state();
    server.send(JSON.stringify(message(state, 'snapshot')));
    // Polling stops when the last viewer leaves (see alarm). It restarts here,
    // now, so the first viewer isn't shown minutes-old positions for long.
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || Date.now() - state.at > POLL_MS) await this.ctx.storage.setAlarm(Date.now());
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    // Nobody watching: stop. The next viewer's connect() starts it again.
    if (!this.ctx.getWebSockets('viewer').length) return;
    const state = await this.state();
    const next = await refresh(state, { fetchBytes: (name) => this.fetchFeed(name), decode: decodeFeed });
    // Stored before anyone sees it, so a viewer connecting now can't get a
    // snapshot older than the update everyone else just got.
    await this.ctx.storage.put(STATE_KEY, next);
    const text = JSON.stringify(next.seq !== state.seq ? message(next, 'update') : tick(next));
    for (const socket of this.ctx.getWebSockets('viewer')) {
      try {
        socket.send(text);
      } catch {
        try {
          socket.close(1011, 'Delivery failed');
        } catch {
          /* already gone */
        }
      }
    }
    await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
  }

  async fetchFeed(name) {
    const base = this.env.FEEDS || RTD_FEEDS;
    const res = await fetch(base + name, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Viewers only listen. Anything they send is ignored.
  webSocketMessage() {}

  webSocketClose(socket, code, reason) {
    try {
      socket.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  webSocketError(socket) {
    try {
      socket.close(1011, 'WebSocket error');
    } catch {
      /* already gone */
    }
  }
}

// The Worker only owns the object. Viewers come in through the Pages site,
// where the same-origin check lives; there is no second public hostname.
export default {
  fetch() {
    return json({ error: 'Use the site' }, 404);
  },
};
