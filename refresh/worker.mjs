// The refresh Worker (DESIGN.md, "Zero maintenance", Rule 2). Every hour it
// reads the live site's meta.json, asks RTD whether any source has changed
// since that build, and if so calls the Pages deploy hook, which rebuilds
// the site from RTD's current data. The build's own checks decide whether
// the result goes live (Rule 3). Deploy with
// `npx wrangler deploy --config refresh/wrangler.toml`; the hook URL is the
// Worker's DEPLOY_HOOK secret.

import { whatChanged } from './check.mjs';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env));
  },
  // No pages of its own: visiting the Worker only says what it is for.
  async fetch() {
    return new Response('RTD system map refresh: checks RTD for changes once an hour.', { status: 200 });
  },
};

async function refresh(env) {
  const site = env.SITE.replace(/\/$/, '');
  const res = await fetch(`${site}/data/meta.json`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) {
    console.log(`no meta.json on ${site} (${res.status}); nothing to compare, not rebuilding`);
    return;
  }
  const meta = await res.json();
  const { changes, problems } = await whatChanged(meta, { getJson, sha256 });
  for (const p of problems) console.log(p);
  if (!changes.length) {
    console.log(`unchanged since ${meta.built}`);
    return;
  }
  console.log(`rebuilding: ${changes.join('; ')}`);
  const hook = await fetch(env.DEPLOY_HOOK, { method: 'POST' });
  console.log(`deploy hook: ${hook.status}`);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'ArcGIS error');
  return json;
}

async function sha256(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const digest = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
