// Has RTD changed anything since the live site was built? (DESIGN.md, "Zero
// maintenance", Rule 2.) The live site's meta.json records the version of
// every source its build used; this asks RTD for each one's current version
// and reports what differs. Pure: the fetching is passed in, so it runs in
// the refresh Worker and in tests alike.

const itemUrl = (portal, id) => `${portal.replace(/\/$/, '')}/sharing/rest/content/items/${id}?f=json`;

/**
 * `meta` is the live site's meta.json. `getJson(url)` fetches JSON and
 * `sha256(url)` downloads a file and returns its SHA-256 hex. Returns the
 * reasons to rebuild, in plain words, empty if nothing changed. A source that
 * can't be read counts as unchanged: a rebuild would fail on it too.
 */
export async function whatChanged(meta, { getJson, sha256, portal = 'https://www.arcgis.com' }) {
  const reasons = [];
  const quietly = async (what, check) => {
    try {
      const reason = await check();
      if (reason) reasons.push(`${what}: ${reason}`);
    } catch (err) {
      reasons.push(`${what}: could not check (${err.message ?? err})`);
    }
  };
  const { experience, webmap, layers, gtfs } = meta.sources;
  await Promise.all([
    quietly('experience', async () => {
      const now = await getJson(itemUrl(portal, experience.id));
      return now.modified !== experience.modified ? `modified ${when(experience.modified)} -> ${when(now.modified)}` : null;
    }),
    quietly('web map', async () => {
      const now = await getJson(itemUrl(portal, webmap.id));
      return now.modified !== webmap.modified ? `modified ${when(webmap.modified)} -> ${when(now.modified)}` : null;
    }),
    ...Object.entries(layers).map(([role, layer]) =>
      quietly(`${role} layer`, async () => {
        const now = await getJson(`${layer.url}?f=json`);
        const edited = now.editingInfo?.lastEditDate ?? null;
        return edited !== layer.lastEditDate ? `edited ${when(layer.lastEditDate)} -> ${when(edited)}` : null;
      }),
    ),
    quietly('GTFS', async () => {
      const hash = await sha256(gtfs.url);
      return hash !== gtfs.sha256 ? `new file (${hash.slice(0, 12)}…, was ${gtfs.sha256.slice(0, 12)}…)` : null;
    }),
  ]);
  // Reading problems alone are not a reason to rebuild.
  const changes = reasons.filter((r) => !r.includes('could not check'));
  return { changes, problems: reasons.filter((r) => r.includes('could not check')) };
}

const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : 'none');
