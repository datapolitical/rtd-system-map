// The Classic renderer is a regression fixture, outside the deployed public/ tree.
// Frozen builds and classic-archive keep their original public/js layout.
import fs from 'node:fs';
import path from 'node:path';

export function classicScript(root, name) {
  const fixture = path.join(root, 'qa', 'classic', 'js', name);
  return fs.existsSync(fixture) ? fixture : path.join(root, 'public', 'js', name);
}
