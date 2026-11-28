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
import { POLL_MS, emptyState, message, predictionsByStop, refresh, stopsMessage, tick, watchList } from '../../public/js/realtime.js';
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
    if (pathname === '/stream' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return this.connect(new URL(request.url).searchParams.get('for') === 'card');
    if (pathname === '/state') return json(message(await this.state(), 'snapshot'));
    return json({ error: 'Not found' }, 404);
  }

  async state() {
    return (await this.ctx.storage.get(STATE_KEY)) ?? emptyState();
  }

  // A new viewer: accept the socket (hibernatable, so an idle object costs
  // nothing between polls), send what we have, and make sure polling is on.
  // A page with only a card open (`card`) is not sent the vehicles: it says which stops it is
  // showing (webSocketMessage) and gets those stops' predictions.
  async connect(card = false) {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [card ? 'card' : 'viewer']);
    const state = await this.state();
    if (!card) server.send(JSON.stringify(message(state, 'snapshot')));
    // Polling stops when the last viewer leaves (see alarm). It restarts here,
    // now, so the first viewer isn't shown minutes-old positions for long.
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || Date.now() - state.at > POLL_MS) await this.ctx.storage.setAlarm(Date.now());
    return new Response(null, { status: 101, webSocket: client });
  }

  // The stops each card's page is watching, kept on its socket so it survives hibernation.
  watching() {
    return this.ctx.getWebSockets('card').map((socket) => ({ socket, stops: socket.deserializeAttachment()?.stops ?? [] })).filter((w) => w.stops.length);
  }

  // RTD's trip updates, read at most once a poll and only while a card is watching. Null when
  // the feed can't be read: the pages are told, and show the timetable.
  async predictions() {
    if (this.trips && Date.now() - this.trips.read < POLL_MS - 1000) return this.trips.index;
    let index = null;
    try {
      index = predictionsByStop(decodeFeed(await this.fetchFeed('TripUpdate.pb')));
    } catch {
      index = null;
    }
    this.trips = { read: Date.now(), index };
    return index;
  }

  async sendPredictions(watchers) {
    if (!watchers.length) return;
    const index = await this.predictions();
    const now = Date.now();
    for (const { socket, stops } of watchers) {
      try {
        socket.send(JSON.stringify(stopsMessage(index, stops, now)));
      } catch {
        /* gone: its close handler tidies up */
      }
    }
  }

  async alarm() {
    // Nobody watching: stop. The next page's connect() or watch starts it again.
    const viewers = this.ctx.getWebSockets('viewer');
    const watchers = this.watching();
    if (!viewers.length && !watchers.length) return;
    await this.sendPredictions(watchers);
    if (!viewers.length) {
      await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
      return;
    }
    const state = await this.state();
    const next = await refresh(state, { fetchBytes: (name) => this.fetchFeed(name), decode: decodeFeed });
    // Stored before anyone sees it, so a viewer connecting now can't get a
    // snapshot older than the update everyone else just got.
    await this.ctx.storage.put(STATE_KEY, next);
    const text = JSON.stringify(next.seq !== state.seq ? message(next, 'update') : tick(next));
    for (const socket of viewers) {
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

  // A card's page says which stops it is showing; an empty list means its card closed. It is
  // answered at once, and polling is made sure of. Anything else anyone sends is ignored.
  async webSocketMessage(socket, text) {
    if (typeof text !== 'string' || text.length > 2048 || !this.ctx.getTags(socket).includes('card')) return;
    const stops = watchList(text);
    if (!stops) return;
    socket.serializeAttachment({ stops });
    if (!stops.length) return;
    await this.sendPredictions([{ socket, stops }]);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
  }

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
