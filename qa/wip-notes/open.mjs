// Open the model on a frozen build: node qa/.scratch/open.mjs <build> (library: import { open })
import fs from 'node:fs';
import path from 'node:path';
import { openModel, pageSources } from '../drawn/model.mjs';
export async function open(build, theme = 'dark') {
  const root = path.resolve('qa/recall/fixtures', build);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', name), 'utf8'));
  const data = Object.fromEntries((await pageSources(root)).map((n) => [n, read(`${n}.geojson`)]));
  const meta = read('meta.json');
  return { model: await openModel({ root, theme, data, meta }), data, meta, root };
}
if (process.argv[1].endsWith('open.mjs')) {
  const t = Date.now();
  const { model } = await open(process.argv[2] ?? '3e38acb');
  console.log('opened', Date.now() - t, 'ms');
  for (const z of [14, 16]) {
    const t2 = Date.now();
    const at = model.zoom(z);
    const by = {};
    for (const l of at.lines) by[l.layer] = (by[l.layer] ?? 0) + 1;
    console.log(z, Date.now() - t2, 'ms', JSON.stringify(by), 'marks', at.marks.length, 'areas', at.areas.length);
  }
}
