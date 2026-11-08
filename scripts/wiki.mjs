// Builds the GitHub wiki from DESIGN.md: one page per "## " section, a Home
// page with the introduction and a grouped contents list, and a sidebar.
// DESIGN.md stays the only source; .github/workflows/wiki.yml runs this on
// every change to it on main and replaces the wiki's pages with the output.
//
//   node scripts/wiki.mjs DESIGN.md <out-dir>
//
// Section names that the design quotes as cross-references ("see "Bus
// routes"") become links to that page and heading.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The contents groups, by page name (the heading before any ":" or "(...)").
// A section not listed here still gets a page, under "Other sections".
const GROUPS = [
  ['What the map is for', ['Objective', 'Who it is for', 'Why', 'Non goals',
    'What people can do in priority order']],
  ['How it is built', ['Zero maintenance', 'Data', 'Map design', 'Interface',
    'Installed on a phone', 'Voice', 'Architecture', 'Unattended work']],
  ['How it is checked', ['Quality floor', 'Design review rubric', 'Validation']],
  ['Plans and decisions', ['Milestones', 'Open questions', 'Decision log']],
  ['The record', ['V1 review', 'V2 review', 'Sources']],
];

const FENCE = /^\s*(```|~~~)/;

// GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens.
export function slug(text) {
  return text.replace(/[`*_]/g, '').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
}

function counter() {
  const seen = new Map();
  return text => {
    const s = slug(text);
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    return n ? `${s}-${n}` : s;
  };
}

// "Why: the research" -> Why + "The research"; "V1 review (red team)" ->
// V1 review + "Red team". The wiki titles a page by its file name, with
// hyphens shown as spaces, so the name keeps only letters, digits and spaces.
export function pageName(heading) {
  let name = heading.replace(/[`*]/g, '');
  let sub = '';
  const paren = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (paren) [, name, sub] = paren;
  const colon = name.match(/^(.*?):\s+(.*)$/);
  if (colon) {
    name = colon[1];
    sub = sub ? `${colon[2]} (${sub})` : colon[2];
  }
  const file = name.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
  return {
    file,
    title: file.replace(/-/g, ' '),
    sub: sub && sub[0].toUpperCase() + sub.slice(1),
  };
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Applies fn to the text outside code fences only.
function outsideFences(text, fn) {
  const out = [];
  let chunk = [];
  let fenced = false;
  const flush = () => {
    if (chunk.length) out.push(fenced ? chunk.join('\n') : fn(chunk.join('\n')));
    chunk = [];
  };
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      if (!fenced) { flush(); fenced = true; chunk.push(line); }
      else { chunk.push(line); flush(); fenced = false; }
    } else chunk.push(line);
  }
  flush();
  return out.join('\n');
}

export function buildWiki(markdown, repo = 'datapolitical/rtd-system-map') {
  const blob = `https://github.com/${repo}/blob/main/`;
  const docAnchor = counter();

  // Split into the introduction and the "## " sections.
  const intro = [];
  const sections = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) fenced = !fenced;
    const h2 = !fenced && line.match(/^## (.+?)\s*$/);
    if (h2) {
      sections.push({ heading: h2[1], docSlug: docAnchor(h2[1]), lines: [], ...pageName(h2[1]) });
    } else if (sections.length) sections.at(-1).lines.push(line);
    else intro.push(line);
  }

  // Every heading's place in the wiki: by its anchor in DESIGN.md, and by its
  // text where that text names only one heading.
  const byDocSlug = new Map();
  const byText = new Map();
  const note = (text, target) => byText.set(text,
    byText.has(text) && byText.get(text) !== target ? null : target);
  for (const s of sections) {
    byDocSlug.set(s.docSlug, s.file);
    note(s.heading, s.file);
    note(s.title, s.file);
    const pageAnchor = counter();
    fenced = false;
    s.lines = s.lines.map(line => {
      if (FENCE.test(line)) fenced = !fenced;
      const h = !fenced && line.match(/^(#{3,6}) (.+?)\s*$/);
      if (!h) return line;
      const target = `${s.file}#${pageAnchor(h[2])}`;
      byDocSlug.set(docAnchor(h[2]), target);
      note(h[2], target);
      return `${h[1].slice(1)} ${h[2]}`;
    });
  }

  // Quoted names of headings become links: multi-word names anywhere, and
  // one-word names ("Why", "Data") only right after "see".
  const refs = [...byText]
    .filter(([, target]) => target)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([text, target]) => [
      new RegExp(`${/\s/.test(text.trim()) ? '' : '(?<=\\b[Ss]ee\\s+)'}` +
        `(?<!\\[)(["“])(${escape(text).replace(/\s+/g, '\\s+')})(["”])(?!\\]\\()`, 'g'),
      target,
    ]);

  const rewrite = text => {
    // Repository files first, then DESIGN.md's own anchors to wiki pages.
    let t = text.replace(/(!?)(\[[^\]]*\])\((?!https?:|mailto:|#)([^)\s]+)\)/g,
      (m, img, label, path) =>
        `${img}${label}(${blob}${path.replace(/^\.\//, '')}${img ? '?raw=true' : ''})`);
    t = t.replace(/\]\(#([^)\s]+)\)/g, (m, a) =>
      byDocSlug.has(a) ? `](${byDocSlug.get(a)})` : m);
    for (const [re, target] of refs) {
      t = t.replace(re, (m, open, name, close) => `[${open}${name}${close}](${target})`);
    }
    return t;
  };

  const pages = {};
  for (const s of sections) {
    const body = outsideFences(s.lines.join('\n').trim(), rewrite);
    pages[`${s.file}.md`] = [
      s.sub && `*${s.sub}*\n`,
      body,
      `\n---\n\nThis page is the "${s.heading}" section of DESIGN.md. ` +
        `[Edit it there](${blob}DESIGN.md#${s.docSlug}).\n`,
    ].filter(Boolean).join('\n');
  }

  // Contents, grouped; any section the groups don't name goes last.
  const listed = new Set(GROUPS.flatMap(([, titles]) => titles));
  const other = sections.filter(s => !listed.has(s.title)).map(s => s.title);
  const groups = [...GROUPS, ...(other.length ? [['Other sections', other]] : [])];
  const bySection = new Map(sections.map(s => [s.title, s]));
  const list = groups.map(([group, titles]) => {
    const items = titles.filter(t => bySection.has(t)).map(t => {
      const s = bySection.get(t);
      return `- [${s.title}](${s.file})${s.sub ? ` — ${s.sub}` : ''}`;
    });
    return items.length ? `**${group}**\n\n${items.join('\n')}` : '';
  }).filter(Boolean);

  pages['Home.md'] = [
    `> This wiki is generated from [DESIGN.md](${blob}DESIGN.md) each time it ` +
      'changes on main. To change the specification, edit DESIGN.md, not these pages.',
    outsideFences(intro.join('\n').trim(), rewrite),
    '## Contents',
    list.join('\n\n'),
  ].join('\n\n') + '\n';

  pages['_Sidebar.md'] = [
    '**[Home](Home)**',
    list.map(g => g.replace(/ — .*$/gm, '')).join('\n\n'),
    `[DESIGN.md on GitHub](${blob}DESIGN.md)`,
  ].join('\n\n') + '\n';

  return pages;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [src = 'DESIGN.md', out = 'wiki-out'] = process.argv.slice(2);
  const pages = buildWiki(readFileSync(src, 'utf8'), process.env.GITHUB_REPOSITORY);
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(pages)) writeFileSync(join(out, name), text);
  console.log(`${Object.keys(pages).length} wiki pages in ${out}`);
}
