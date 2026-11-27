import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// The repo is public. A real tailnet name or Tailscale address in any
// committed file is a leak. Read it from RTD_REVIEW_ORIGIN or RTD_SITE_URL, or
// write a path that starts at the root. Placeholders are fine: a host with a
// HOST, TAILNET or example label (HOST.TAILNET.ts.net, review.example.ts.net).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 3 * 1024 * 1024;

const HOST = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+ts\.net\b/gi;
const PLACEHOLDER_LABEL = /^(?:host|tailnet|example)$/i;
// Tailscale addresses: 100.64.0.0/10 (100.64 to 100.127), as a dotted quad.
const IP = /(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d.])/g;
// 100.64.0.x is reserved here for made-up test addresses.
const PLACEHOLDER_IP = /^100\.64\.0\./;

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter((f) => f && !f.startsWith('node_modules/'));

const text = (file) => {
  let size;
  try {
    size = statSync(join(root, file)).size;
  } catch {
    return null; // listed but deleted in the working tree
  }
  if (size > MAX_BYTES) return null;
  const buf = readFileSync(join(root, file));
  if (buf.subarray(0, 8192).includes(0)) return null; // binary
  return buf.toString('utf8');
};

export const leaks = (body) => {
  const found = [];
  body.split('\n').forEach((line, i) => {
    for (const host of line.match(HOST) ?? []) {
      if (!host.split('.').some((label) => PLACEHOLDER_LABEL.test(label))) {
        found.push({ line: i + 1, kind: 'a .ts.net hostname' });
      }
    }
    for (const ip of line.match(IP) ?? []) {
      if (!PLACEHOLDER_IP.test(ip)) found.push({ line: i + 1, kind: 'a Tailscale IP address' });
    }
  });
  return found;
};

test('the leak finder flags real-looking addresses and passes placeholders', () => {
  // Built from pieces so this file holds no address of its own.
  assert.equal(leaks(`see https://fake-name.not-real${'.ts'}.net/x`).length, 1);
  assert.equal(leaks(`ssh ${['100', '87', '224', '94'].join('.')}`).length, 1);
  assert.equal(leaks('https://HOST.TAILNET.ts.net/shots/').length, 0);
  assert.equal(leaks('https://review.example.ts.net/').length, 0);
  assert.equal(leaks('Client-Host: 100.64.0.9').length, 0);
  assert.equal(leaks('version 1100.87.224.94 and 100.200.1.1 and 100.87.224').length, 0);
});

test('no committed file holds a real tailnet address', () => {
  const problems = [];
  for (const file of tracked()) {
    const body = text(file);
    if (body === null) continue;
    for (const { line, kind } of leaks(body)) problems.push(`${file}:${line} has ${kind}`);
  }
  assert.deepEqual(
    problems,
    [],
    'Never write a real server or tailnet address into a committed file. Read it from RTD_REVIEW_ORIGIN or RTD_SITE_URL, or write a path that starts at the root, like /shots/.\n' +
      problems.join('\n'),
  );
});
