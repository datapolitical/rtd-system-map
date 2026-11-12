// Cloudflare Pages injects its Web Analytics beacon into every deployment,
// previews included. On a preview host the beacon's report is refused by
// CORS, which logs console errors and a failed request that have nothing to
// do with the map (#107). Every check page answers the beacon and its report
// with nothing, which also keeps check runs out of the site's analytics.
export async function stubAnalytics(page) {
  await page.route(/^https:\/\/static\.cloudflareinsights\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route(/^https:\/\/cloudflareinsights\.com\//, (route) =>
    route.fulfill({ status: 204, body: '' }));
}
