import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWiki, pageName } from '../scripts/wiki.mjs';

const SAMPLE = `# Spec

Intro, see "Bus routes" and [sources](#sources). See "Sources"; not "Sources".

## Map design

### Bus routes

Drawn once.

\`\`\`
## not a section
\`\`\`

## Why: the research

As in "Bus
routes", and "Map design".

## Sources

![shot](docs/shot.png)
`;

test('page names drop the colon and parenthetical into a subtitle', () => {
  assert.deepEqual(pageName('Why: the research behind these choices'),
    { file: 'Why', title: 'Why', sub: 'The research behind these choices' });
  assert.deepEqual(pageName('V1 review (red team, 2026-11-01)'),
    { file: 'V1-review', title: 'V1 review', sub: 'Red team, 2026-11-01' });
  assert.equal(pageName('What people can do, in priority order').file,
    'What-people-can-do-in-priority-order');
});

test('one page per section, headings promoted, fences left alone', () => {
  const pages = buildWiki(SAMPLE);
  assert.deepEqual(Object.keys(pages).sort(),
    ['Home.md', 'Map-design.md', 'Sources.md', 'Why.md', '_Sidebar.md']);
  assert.match(pages['Map-design.md'], /^## Bus routes$/m);
  assert.match(pages['Map-design.md'], /^## not a section$/m);
  assert.match(pages['Why.md'], /^\*The research\*/);
});

test('cross-references become wiki links', () => {
  const pages = buildWiki(SAMPLE);
  assert.match(pages['Home.md'], /\["Bus routes"\]\(Map-design#bus-routes\)/);
  assert.match(pages['Home.md'], /\[sources\]\(Sources\)/);
  assert.match(pages['Home.md'], /See \["Sources"\]\(Sources\); not "Sources"\./);
  assert.match(pages['Why.md'], /\["Bus\nroutes"\]\(Map-design#bus-routes\)/);
  assert.match(pages['Why.md'], /\["Map design"\]\(Map-design\)/);
  assert.match(pages['Sources.md'],
    /!\[shot\]\(https:\/\/github\.com\/datapolitical\/rtd-system-map\/blob\/main\/docs\/shot\.png\?raw=true\)/);
});

test('every section of DESIGN.md is in the sidebar', () => {
  const pages = buildWiki(readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8'));
  const files = Object.keys(pages).filter(f => !f.startsWith('_') && f !== 'Home.md');
  for (const f of files) {
    assert.ok(pages['_Sidebar.md'].includes(`](${f.slice(0, -3)})`), f);
  }
  assert.doesNotMatch(pages['_Sidebar.md'], /Other sections/);
});
