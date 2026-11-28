import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runZoomChecks } from './zoom/report.mjs';

const [adapter, output = 'qa/.scratch/zoom/report.json'] = process.argv.slice(2).filter((arg) => arg !== '--partial');
if (!adapter) throw new Error('Usage: npm run check:zoom -- <build-adapter.mjs> [report.json] [--partial]');

const { default: build } = await import(pathToFileURL(path.resolve(adapter)));
const report = await runZoomChecks(build, { partial: process.argv.includes('--partial') });
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
const findings = report.results.flatMap((result) => result.findings);
console.log(`${report.commit}${report.partial ? ' (partial)' : ''}: ${report.zooms.length} zooms: ${report.zooms.join(', ')}`);
console.log(`${findings.length} findings. Report: ${output}`);
if (findings.length) process.exitCode = 1;
