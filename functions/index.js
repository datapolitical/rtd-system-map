// The root of a branch preview named after one of the site's pages opens on that page:
// sheets.<project>.pages.dev goes to /sheets/. Every other address, the live site
// included, serves the main map as before.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const [alias, ...rest] = url.hostname.split('.');
  // <branch>.<project>.pages.dev: a preview. <project>.pages.dev and custom domains are not.
  const preview = url.hostname.endsWith('.pages.dev') && rest.length === 3;
  if (preview && url.pathname === '/' && /^[a-z0-9-]+$/.test(alias)) {
    // The site has no 404 page, so every path answers with the main map: a page of the
    // preview's name is one that answers with something else. (Each build also has an
    // address of its own, <hash>.<project>.pages.dev, which must stay the main map.)
    const [page, home] = await Promise.all([`/${alias}/`, '/'].map((path) => env.ASSETS.fetch(new URL(path, url))));
    if (page.ok && (await page.text()) !== (await home.text())) return Response.redirect(new URL(`/${alias}/${url.search}`, url).href, 302);
  }
  return next();
}
