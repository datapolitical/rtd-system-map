// Live: the page's WebSocket to the relay (live/src/worker.mjs). One Durable
// Object serves every viewer, so it's always the same one here.

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required' }, 426, { Upgrade: 'websocket' });
  // Browsers send Origin on a WebSocket handshake. Another site can't quietly
  // stream through this one's relay.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed' }, 403);
  if (!env.LIVE_ROOM) return json({ error: 'The live relay is not set up' }, 503);
  const room = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName('rtd'));
  return room.fetch(new Request('https://live-room.internal/stream', request));
}
