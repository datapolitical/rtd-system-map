// Read-only analysis of retained trial frames. Usage:
// node qa/evaluation/review.mjs qa/.scratch/evaluation/smooth-zoom-verified/report.json
import fs from 'node:fs';
import path from 'node:path';
import { anchorChanges } from './checks.mjs';

const file = process.argv[2];
if (!file) throw new Error('Provide a smooth-zoom report.json.');
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
if (report.profile !== 'smooth-zoom') throw new Error('Anchor continuity applies to the smooth-zoom profile, not discrete sheets.');
const findings = anchorChanges(report.captures);
const out = path.join(path.dirname(file), 'transition-review.json');
fs.writeFileSync(out, `${JSON.stringify({ sourceReport: path.basename(file), findings,
  scope: 'Common rendered station names across consecutive sampled zooms within the same theme/mode/view. No motion or complete label-stability claim.' }, null, 2)}\n`);
console.log(`${findings.length} anchor changes; evidence: ${out}`);
if (findings.length) process.exitCode = 1;
