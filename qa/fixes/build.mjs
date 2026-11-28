#!/usr/bin/env node
// Read-only report generation. GitHub issues are imported, never changed here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const strict = args.includes('--require-evidence');
const dest = path.resolve(root, args.find(a => !a.startsWith('--')) || 'qa/.scratch/fix-register');
if (dest === root || !dest.startsWith(root + path.sep)) throw new Error('Output must be a directory inside this checkout.');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const register = read('qa/fixes/register.json');
const github = read('qa/fixes/github-snapshot.json');
const recall = read('qa/recall/finds.json');
const spacing = read('qa/fixes/spacing-evidence.json');
const render = read('qa/fixes/render-evidence.json');
const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unique = (items, key) => {
  const ids = items.map(x => x[key]);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${key}`);
};
for (const [list, key] of [[register.findings,'id'],[register.evidence,'id'],[github.issues,'number'],[recall.finds,'id']]) unique(list,key);
const issueIds = new Set(github.issues.map(i => i.number));
const evidenceIds = new Set(register.evidence.map(e => e.id));
for (const f of register.findings) {
  for (const key of ['title','kind','status','priority','scope','observation','next','done_when','verification']) {
    if (!f[key]) throw new Error(`${f.id} needs ${key}`);
  }
  if (!(f.status in register.status_definitions)) throw new Error(`Unknown status: ${f.status}`);
  if (f.status === 'fixed-preview' && !f.fixed_commit) throw new Error(`${f.id} needs a verified fix commit`);
  for (const n of f.issues) if (!issueIds.has(n)) throw new Error(`${f.id}: missing issue #${n}`);
  for (const id of f.evidence) if (!evidenceIds.has(id)) throw new Error(`${f.id}: missing evidence ${id}`);
}
if (!github.complete_open_issue_listing || github.comment_errors.length) throw new Error('Incomplete GitHub snapshot');
for (const i of github.issues) {
  if (i.state !== 'open' || i.comments.length !== i.comment_count) throw new Error(`Incomplete open issue #${i.number}`);
}
fs.mkdirSync(path.join(dest, 'evidence'), {recursive:true});
const evidence = register.evidence.map(e => {
  const source = path.resolve(root,e.path);
  if (!source.startsWith(root + path.sep)) throw new Error(`Evidence outside checkout: ${e.path}`);
  if (!fs.existsSync(source)) {
    if (strict) throw new Error(`Missing evidence: ${e.path}`);
    return {...e, available:false};
  }
  const bytes = fs.readFileSync(source);
  const filename = `${e.id}${e.type === 'image' ? '.png' : e.type === 'json' ? '.json' : '.txt'}`;
  fs.writeFileSync(path.join(dest, 'evidence', filename), bytes);
  return {...e, available:true, href:`evidence/${filename}`, bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
const getEvidence = id => evidence.find(e => e.id === id);
const evidenceLink = id => {
  const e = getEvidence(id);
  return e.available ? `<li><a href="${html(e.href)}">${html(e.label)}</a> <small>build ${html(e.commit)}</small></li>` : `<li>${html(e.label)} <small>capture unavailable in this checkout</small></li>`;
};
const issueLink = n => `<a href="https://github.com/${github.repository}/issues/${n}">#${n}</a>`;
const statuses = {'open':'Open','needs-check':'Needs a check','fixed-preview':'Fixed in preview'};
const badge = (label, cls='') => `<span class="badge ${html(cls)}">${html(label)}</span>`;
const detail = (label, text) => `<h3>${html(label)}</h3><p>${html(text)}</p>`;
const searchAttr = text => html(text.toLowerCase());
const findingCards = [...register.findings].sort((a,b) =>
  Number(a.status === 'fixed-preview') - Number(b.status === 'fixed-preview') ||
  Number(a.priority === 'later') - Number(b.priority === 'later') || a.id.localeCompare(b.id)
).map(f => `<article class="record" data-kind="findings" data-status="${f.status}" data-search="${searchAttr(JSON.stringify(f))}">
<details id="${html(f.id)}"><summary><span class="record-title">${html(f.title)}</span><span class="meta">${badge(statuses[f.status],f.status)} ${badge(f.priority === 'next' ? 'Next' : 'Later')} <span>${html(f.id)}</span></span></summary>
<div class="body"><p class="scope">${html(f.scope)} · ${html(f.kind)}</p>
${detail('What needs attention',f.observation)}${detail('Next action',f.next)}${detail('Done when',f.done_when)}${detail('Verification',f.verification)}
<p>Related work: ${f.issues.map(issueLink).join(', ')}</p>
${f.fixed_commit ? `<p>Fixed in preview commit <code>${html(f.fixed_commit.slice(0,7))}</code>. This is not a production release.</p>` : ''}
<h3>Evidence</h3><ul>${f.evidence.map(evidenceLink).join('')}</ul>
${f.review_id ? `<p>Phone review: <a href="${html(f.review_url)}">${html(f.review_id)}</a></p>` : ''}</div></details></article>`).join('\n');
const stageNames = [...new Set(github.issues.map(i => i.milestone?.title || 'No milestone'))];
const rank = title => title.startsWith('Launch') ? 0 : title.startsWith('v2:') ? 1 : title.startsWith('v1.1') ? 2 : title.startsWith('Parked') ? 3 : title.startsWith('v2.x') ? 4 : 5;
stageNames.sort((a,b) => rank(a)-rank(b));
const issueCards = [...github.issues].sort((a,b) => rank(a.milestone?.title||'')-rank(b.milestone?.title||'') || a.number-b.number).map(i => {
  const local = register.findings.filter(f => f.issues.includes(i.number));
  return `<article class="record" data-kind="github" data-stage="${html(i.milestone?.title || 'No milestone')}" data-search="${searchAttr(JSON.stringify(i))}">
<details id="GH-${i.number}"><summary><span class="record-title">#${i.number} ${html(i.title)}</span><span class="meta">${badge(i.labels.includes('needs Chris') ? 'Needs phone review or decision' : i.labels.includes('in progress') ? 'In progress on GitHub' : 'Open on GitHub')} <span>${html(i.milestone?.title || 'No milestone')}</span></span></summary>
<div class="body"><p><a href="${html(i.url)}">Open GitHub issue</a> · Updated ${html(i.updated_at)}</p><p>${i.labels.map(l => badge(l)).join(' ')}</p>
<h3>Current issue body</h3><pre><span>${html(i.body)}</span></pre>
${local.length ? `<p>Linked findings: ${local.map(f=>`<a href="#${f.id}" data-finding-link="${f.id}">${f.id}</a>`).join(', ')}</p>` : ''}
${i.comments.length ? `<details class="comments"><summary>Discussion · ${i.comments.length} comments</summary>${i.comments.map((c,k)=>`<section><h3>Comment ${k+1}</h3><pre><span>${html(c.body)}</span></pre></section>`).join('')}</details>` : ''}
</div></details></article>`;
}).join('\n');
const recallCards = recall.finds.map(f => `<article class="record" data-kind="history" data-search="${searchAttr(JSON.stringify(f))}">
<details id="pin-${html(f.id)}"><summary><span class="record-title">${html(f.place)} · ${html(f.said)}</span><span class="meta">${badge('Historical pin')} <span>${html(f.id)}</span></span></summary>
<div class="body"><p>Seen on ${html(f.seen_on.join(', '))} · ${html(f.theme)} · zoom ${html(f.zoom)} · ${issueLink(f.issue)}</p>
${detail('Last recorded observation',f.latest ? `${f.latest.looked}, build ${f.latest.build}: ${f.latest.status}` : 'No later comparison is recorded in the pin.')}
<p>Recheck on the current build before treating this as an open defect or a verified current fix.</p>
<pre>${html(JSON.stringify(f,null,2))}</pre></div></details></article>`).join('\n');
const counts = {findings:register.findings.length, active:register.findings.filter(f=>f.status!=='fixed-preview').length, fixed:register.findings.filter(f=>f.status==='fixed-preview').length, github:github.issues.length, history:recall.finds.length};
const dateLabel = new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Denver'}).format(new Date(github.fetched_at)) + ' Denver time';
const options = stageNames.map(s=>`<option>${html(s)}</option>`).join('');
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>RTD map fixes</title>
<style>
:root{font:17px/1.5 system-ui,sans-serif;color:#172d38;background:#f3f5f4;--paper:#fff;--line:#c9d4d8;--muted:#4e626d;--accent:#056776;--tint:#e6f2f3}
*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:auto;padding:24px 18px 70px}h1{font-size:2rem;line-height:1.15;margin:0 0 12px}h2{font-size:1.3rem;margin:24px 0 8px}h3{font-size:1rem;margin:20px 0 4px}p{margin:8px 0 14px}a{color:var(--accent);text-underline-offset:3px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #e5a126;outline-offset:3px}small,.scope,.meta,.note{color:var(--muted)}small{font-size:.82rem}.intro{max-width:750px}.totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:18px 0}.total{font-size:.85rem;padding:10px;border:1px solid var(--line);background:var(--paper);border-radius:10px}.total strong{display:block;font-size:1.5rem}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 14px}button,input,select{font:inherit}button{min-height:44px;border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:inherit;background:var(--paper);cursor:pointer}button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:white}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:16px 0}.filters label{display:grid;gap:4px;flex:1 1 200px}.filters input,.filters select{min-height:46px;padding:8px;width:100%;background:var(--paper);color:inherit;border:1px solid var(--line);border-radius:6px}.record{margin:10px 0;background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow:hidden}.record summary{cursor:pointer;padding:16px;min-height:52px}.record-title{font-weight:650}.meta{display:flex;flex-wrap:wrap;gap:7px;align-items:center;font-size:.82rem;margin:7px 0 0 20px}.badge{font-weight:500;display:inline-block;border-radius:4px;padding:2px 7px;background:var(--tint);color:inherit}.badge.fixed-preview{background:#e7f4e7;color:#214d2d}.badge.needs-check{background:#fff0d2;color:#69440b}.body{padding:0 20px 20px;border-top:1px solid var(--line);overflow-wrap:anywhere}.body p{white-space:pre-wrap}.body ul{padding-left:20px}.body li{margin-bottom:7px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.9rem}code{font-size:.9em}.comments{margin-top:20px;border-top:1px solid var(--line)}.comments summary{padding-left:0}.notice{padding:14px 16px;border-left:4px solid var(--accent);background:var(--tint);border-radius:5px}.downloads{display:flex;flex-wrap:wrap;gap:14px}footer{margin-top:30px;font-size:.85rem;color:var(--muted)}[hidden]{display:none!important}
@media(prefers-color-scheme:dark){:root{background:#14212a;color:#e7eef0;--paper:#1c2e39;--line:#3d5665;--muted:#b0c4ce;--accent:#7bd4dd;--tint:#243e49}button[aria-selected=true]{color:#102a32}.badge.fixed-preview{background:#284832;color:#d6efd8}.badge.needs-check{background:#57411d;color:#ffe2b0}}
</style></head><body><main>
<header><h1>RTD map fixes</h1><p class="intro">Fixes and checks for the sheets and continuous zoom preview.</p>
<p class="note">Snapshot ${html(dateLabel)} · zoom preview build ${html(register.map_commit.slice(0,7))}</p>
<p><a href="${html(register.preview_url)}">Open corrected zoom preview</a> · <a href="${html(register.review_url)}">Open phone reviews</a></p></header>
<div class="totals"><div class="total"><strong>${counts.active}</strong>Need attention</div><div class="total"><strong>${counts.fixed}</strong>Fixed in preview</div><div class="total"><strong>${counts.github}</strong>GitHub issues</div></div>

<nav role="tablist" aria-label="Fix register sections"><button type="button" role="tab" id="tab-findings" aria-controls="findings" aria-selected="true" tabindex="0" data-tab="findings">Findings ${counts.findings}</button><button type="button" role="tab" id="tab-github" aria-controls="github" aria-selected="false" tabindex="-1" data-tab="github">GitHub ${counts.github}</button><button type="button" role="tab" id="tab-history" aria-controls="history" aria-selected="false" tabindex="-1" data-tab="history">History ${counts.history}</button></nav>
<div class="filters"><label>Search this section<input id="search" type="search" placeholder="Place, route, label or issue"></label><label id="status-label">Finding status<select id="status"><option value="">All statuses</option><option value="active">Needs work or a check</option><option value="open">Open</option><option value="needs-check">Needs a check</option><option value="fixed-preview">Fixed in preview</option></select></label><label id="stage-label" hidden>GitHub milestone<select id="stage"><option value="">All milestones</option>${options}</select></label></div>
<p id="result-count" role="status" aria-live="polite"></p>
<section id="findings" role="tabpanel" aria-labelledby="tab-findings">${findingCards}</section>
<section id="github" role="tabpanel" aria-labelledby="tab-github" hidden><h2>Open GitHub work</h2><p class="note">All ${counts.github} open issues and ${github.issues.reduce((n,i)=>n+i.comments.length,0)} comments loaded from GitHub. Issue bodies and milestone assignments are preserved. This is a dated snapshot, not a live connection.</p>${issueCards}</section>
<section id="history" role="tabpanel" aria-labelledby="tab-history" hidden><h2>Historical checks</h2><p class="note">These ${counts.history} pinned findings preserve what was seen on an earlier build. Their last observations may be old. They are regression references, not ${counts.history} confirmed current defects.</p>${recallCards}</section>
<footer><h2>Tracking and sources</h2><p>GitHub remains the work tracker. The findings link to it and may overlap its tasks; the counts are not a count of independent bugs. New findings are saved here but have not been written back to GitHub because the integration rejected issue writes.</p><p>“Next” and “Later” are proposed priorities. Existing launch gates and GitHub completion criteria still apply. A preview fix stays separate from a released fix.</p><h2>Download the records</h2><p class="downloads"><a download href="register.json">Current findings JSON</a><a download href="findings.csv">Current findings CSV</a><a download href="github-snapshot.json">GitHub snapshot JSON</a><a download href="recall-pins.json">Historical pins JSON</a><a download href="evidence-index.json">Evidence hashes</a></p><p>Current finding records updated ${html(register.updated_at)}. GitHub snapshot fetched ${html(github.fetched_at)}. Maintain the source in <code>qa/fixes/</code>; regenerate with <code>npm run fixes:build</code>.</p></footer>
</main><script>
const tabs=[...document.querySelectorAll('[data-tab]')], search=document.querySelector('#search'), status=document.querySelector('#status'), stage=document.querySelector('#stage');
let active='findings';
function filter(){let n=0;const query=search.value.toLocaleLowerCase().trim();for(const r of document.querySelectorAll('.record')){const matches=r.dataset.kind===active&&(!query||r.dataset.search.includes(query))&&(active!=='findings'||!status.value||(status.value==='active'?r.dataset.status!=='fixed-preview':r.dataset.status===status.value))&&(active!=='github'||!stage.value||r.dataset.stage===stage.value);r.hidden=!matches;if(matches)n++;}document.querySelector('#result-count').textContent=n+' '+(active==='github'?'issues':active==='history'?'historical checks':'findings')+' shown'+(n?'':'. Clear the search or filter to see more.');}
function select(kind){active=kind;for(const t of tabs){t.setAttribute('aria-selected',String(t.dataset.tab===kind));t.tabIndex=t.dataset.tab===kind?0:-1;}for(const s of document.querySelectorAll('[role=tabpanel]'))s.hidden=s.id!==kind;document.querySelector('#status-label').hidden=kind!=='findings';document.querySelector('#stage-label').hidden=kind!=='github';search.value='';filter();}
for(const t of tabs){t.addEventListener('click',()=>select(t.dataset.tab));t.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.indexOf(t),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;select(tabs[next].dataset.tab);tabs[next].focus();});}
for(const c of [search,status,stage])c.addEventListener('input',filter);
function showFinding(id){if(!/^RTD-\\d+$/.test(id))return;select('findings');status.value='';filter();const target=document.getElementById(id);if(target){target.open=true;target.scrollIntoView({block:'start'});}}
for(const a of document.querySelectorAll('[data-finding-link]'))a.addEventListener('click',()=>showFinding(a.dataset.findingLink));
window.addEventListener('hashchange',()=>showFinding(location.hash.slice(1)));filter();showFinding(location.hash.slice(1));
</script></body></html>`;
const writeJson = (name,data) => fs.writeFileSync(path.join(dest,name),JSON.stringify(data,null,2)+'\n');
fs.writeFileSync(path.join(dest,'index.html'),page);
writeJson('register.json',register);
writeJson('github-snapshot.json',github);
writeJson('recall-pins.json',recall);
writeJson('evidence-index.json',evidence);
writeJson('spacing-evidence.json',spacing);
writeJson('render-evidence.json',render);
const fields = ['id','title','status','priority','scope','observation','next','done_when','verification','issues','fixed_commit'];
const csvCell = value => '"'+String(Array.isArray(value)?value.join(' '):value??'').replace(/"/g,'""')+'"';
fs.writeFileSync(path.join(dest,'findings.csv'),[fields,...register.findings.map(f=>fields.map(k=>f[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n');
writeJson('build-report.json',{generated_at:new Date().toISOString(),map_commit:register.map_commit,github_fetched_at:github.fetched_at,counts,evidence_files:evidence.filter(e=>e.available).length,missing_evidence:evidence.filter(e=>!e.available).map(e=>e.path),output:path.relative(root,dest)});
console.log(JSON.stringify({output:dest,counts,evidence_files:evidence.filter(e=>e.available).length,missing_evidence:evidence.filter(e=>!e.available).length}));
