import { viewOf } from './viewof.mjs';
import { sharedTrack, railLooks } from '../drawn/styles.mjs';
import { deltaE, contrast, grey, hex } from '../drawn/colours.mjs';
const [root, theme] = process.argv.slice(2);
const v = await viewOf(root, theme);
const rails = railLooks(v);
for (const { pair: [a, b], vertices } of sharedTrack(v, { shared: 1 })) {
  const ra = rails.get(a), rb = rails.get(b);
  console.log(theme, a, b, 'verts', vertices, 'dE fill', deltaE(ra.fill, rb.fill).toFixed(3), 'dE edge', deltaE(ra.edge, rb.edge).toFixed(3), 'grey fill', contrast(grey(ra.fill), grey(rb.fill)).toFixed(2), 'grey edge', contrast(grey(ra.edge), grey(rb.edge)).toFixed(2), hex(ra.fill), hex(rb.fill));
}
