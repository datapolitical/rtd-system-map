// Which code built the committed data (DESIGN.md, "Zero maintenance", Rule 2).
// The data in public/data is built on a machine of ours and committed;
// Cloudflare only publishes it. So the publish step must know whether the
// data was built by the code being published: each build records a hash of
// the modules that made it, and scripts/publish-check.mjs recomputes it.
//
// A hash covers a script and every module it imports, followed through
// relative imports. `stopAt` leaves out a module and what only it imports:
// the data build's own hash stops at the sheets, which have their own, so
// redrawing the sheets doesn't call for downloading RTD's data again.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
// `import … from './x.mjs'`, `export … from './x.mjs'`, `import './x.mjs'`, `import('./x.mjs')`.
const IMPORT = /\b(?:import|export)\b[^'";]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

// Comments, which may quote an import; a `//` after a colon or inside a quote is a URL, not a comment.
const COMMENT = /\/\*[\s\S]*?\*\/|(?<![:'"`\w])\/\/.*$/gm;

export const DATA_ENTRY = 'scripts/build-data.mjs';
export const SHEETS_ENTRY = 'scripts/sheets.mjs';

/** The SHA-256 of `entry` (relative to the repository) and every module it imports, but not `stopAt`'s. */
export async function codeFingerprint(entry, { stopAt = [] } = {}) {
  const skip = new Set(stopAt.map((f) => path.resolve(ROOT, f)));
  const seen = new Map();
  const visit = async (file) => {
    if (seen.has(file) || skip.has(file)) return;
    const text = await readFile(file, 'utf8');
    seen.set(file, text);
    for (const m of text.replace(COMMENT, '').matchAll(IMPORT)) await visit(path.resolve(path.dirname(file), m[1] ?? m[2]));
  };
  await visit(path.resolve(ROOT, entry));
  const hash = createHash('sha256');
  const files = [...seen.keys()].sort();
  for (const file of files) hash.update(path.relative(ROOT, file)).update('\0').update(seen.get(file)).update('\0');
  return hash.digest('hex');
}

export const dataCode = () => codeFingerprint(DATA_ENTRY, { stopAt: [SHEETS_ENTRY] });
export const sheetsCode = () => codeFingerprint(SHEETS_ENTRY);
