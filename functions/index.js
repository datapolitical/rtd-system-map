// The root of a branch preview named after one of the site's pages opens on that page:
// sheets.<project>.pages.dev goes to /sheets/. Every other address, the live site
// included, serves the main map as before.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const [alias, ...rest] = url.hostname.split('.');
  // <branch>.<project>.pages.dev: a preview. <project>.pages.dev and custom domains are not.
  const preview = url.hostname.endsWith('.pages.dev') && rest.length === 3;
  if (preview && url.pathname === '/' && /^[a-z0-9-]+$/.test(alias)) {
    const page = await env.ASSETS.fetch(new URL(`/${alias}/`, url));
    if (page.ok) return Response.redirect(new URL(`/${alias}/${url.search}`, url).href, 302);
  }
  return next();
}
