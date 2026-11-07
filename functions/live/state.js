// Live: the relay's latest state as JSON, for checking it by hand (the page
// itself uses the WebSocket at /live/stream).

export async function onRequestGet({ env }) {
  if (!env.LIVE_ROOM) return new Response(JSON.stringify({ error: 'The live relay is not set up' }), { status: 503, headers: { 'content-type': 'application/json' } });
  const room = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName('rtd'));
  return room.fetch('https://live-room.internal/state');
}
