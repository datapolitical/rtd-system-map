// Where on a site the map the checks read is: /classic/ since the sheets took
// the front page (DESIGN.md, decision log, 2026-11-12), the root on a build
// from before. A site with no page there answers with its front page
// (Cloudflare Pages) or with nothing, so the page must be one of its own.
const found = new Map();
export function mapPath(base) {
  if (!found.has(base)) {
    const read = (path) => fetch(base + path).then((r) => (r.ok ? r.text() : null), () => null);
    found.set(base, Promise.all([read('/classic/'), read('/')]).then(([page, home]) => (page !== null && page !== home ? '/classic/' : '/')));
  }
  return found.get(base);
}
