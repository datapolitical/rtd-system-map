// usage: node near.mjs <build> <lat> <lon> <radiusM>
import fs from 'node:fs';
const [build, lat0, lon0, R] = [process.argv[2], +process.argv[3], +process.argv[4], +(process.argv[5] ?? 150)];
const root = `qa/recall/fixtures/${build}/public/data/`;
const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
const xy = ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky];
const near = (coords) => coords.some((c) => { const p = xy(c); return Math.hypot(p[0], p[1]) <= R; });
for (const n of ['streets', 'stops', 'terminals', 'routes', 'facilities', 'stations']) {
  const j = JSON.parse(fs.readFileSync(root + n + '.geojson'));
  console.log('==', n);
  j.features.forEach((f, i) => {
    const g = f.geometry;
    const cs = g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiLineString' ? g.coordinates.flat() : [];
    if (!near(cs)) return;
    const p = { ...f.properties };
    delete p.fees;
    const pts = cs.length > 12 ? [cs[0], cs[1], cs.at(-2), cs.at(-1)] : cs;
    console.log(i, g.type, cs.length, JSON.stringify(p), pts.map((c) => xy(c).map((v) => Math.round(v)).join(',')).join(' '));
  });
}
