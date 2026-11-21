// Legacy browser tools must explicitly find Classic; never silently check the sheet map.
const found = new Map();
export function mapPath(base) {
  if (!found.has(base)) {
    const read = (path) => fetch(base + path).then((response) => response.ok ? response.text() : null, () => null);
    const classic = (html) => /\bsrc=["'](?:\.{1,2}\/|\/)?js\/main\.js["']/.test(html ?? '');
    found.set(base, Promise.all([read('/classic/'), read('/')]).then(([page, home]) => {
      if (page !== home && classic(page)) return '/classic/';
      if (classic(home)) return '/';
      throw new Error(`No Classic map at ${base}. Select a classic-archive server with CHECK_URL; use npm run check for the current sheet map.`);
    }));
  }
  return found.get(base);
}
