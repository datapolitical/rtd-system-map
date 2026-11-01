// Fetch with a few retries, so one dropped request doesn't fail a build.
export async function fetchWithRetry(url, { tries = 4 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'rtd-system-map build' } });
      if (res.ok) return res;
      lastError = new Error(`${res.status} ${res.statusText} for ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function getJson(url) {
  const body = await (await fetchWithRetry(url)).json();
  // ArcGIS reports errors inside a 200 response.
  if (body?.error) throw new Error(`${url}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body;
}

export async function getBytes(url) {
  return new Uint8Array(await (await fetchWithRetry(url)).arrayBuffer());
}
