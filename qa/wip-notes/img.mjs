import { openModel } from '../drawn/model.mjs';
import path from 'node:path';
const root = path.resolve('qa/recall/fixtures/3e38acb');
const m = await openModel({ root, theme: 'dark' });
for (const id of ['shield-us-interstate-2','shield-us-interstate-3','shield-us-highway-2','shield-us-highway-3','clear','bullet-A']) {
  try { console.log(id, JSON.stringify(m.icons.size(id))); } catch (e) { console.log(id, 'ERR', e.message); }
}
