// tools/lib/finding.mjs in-process (incident I-013): post / validation, title-similarity dedup, list
// filters (kind, topic, since, unread per agent), ack, resolve rules, digest format, waitFor.
// Cross-process behaviour (concurrent posts, `wait` woken by another process) is in
// tests/e2e/finding-cli.test.mjs. Every test uses its own $FW_STATE_DIR: the real board is never touched.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const F = await import('../../tools/lib/finding.mjs');
let state;
beforeEach(() => { state = tempDir('fw-finding-'); process.env.FW_STATE_DIR = state; });

const T1 = { by: 'fix-a', kind: 'technique', topics: 'phone-invisible-shrink,commission', title: 'Gate rect reads on the same media query as the CSS', where: 'JS 3100-3155', evidence: 'fps 66.5 -> 71.6', body: 'copy the query exactly' };

test('store lives in the shared state dir as F-nnn.json', async () => {
  assert.equal(F.findingDir(), join(state, 'findings'));
  const r = await F.post(T1);
  assert.equal(r.action, 'posted');
  assert.ok(existsSync(join(state, 'findings', 'F-001.json')));
  assert.equal(F.parseId('f-1'), 'F-001');
  assert.throws(() => F.parseId('I-001'), /bad finding id/);
});

test('post: validates and records; get returns it', async () => {
  await assert.rejects(F.post({ ...T1, by: undefined }), /--by/);
  await assert.rejects(F.post({ ...T1, title: '' }), /--title/);
  await assert.rejects(F.post({ ...T1, kind: undefined }), /--kind/);
  await assert.rejects(F.post({ ...T1, kind: 'rumour' }), /bad kind "rumour"/);
  await assert.rejects(F.post({ ...T1, topics: '' }), /--topics/);
  await assert.rejects(F.post({ ...T1, topics: 'ok,../etc' }), /bad topic/);
  const { finding: f } = await F.post({ ...T1, topics: ' phone-invisible-shrink , commission,commission ' });
  assert.equal(f.id, 'F-001');
  assert.equal(f.kind, 'technique');
  assert.deepEqual(f.topics, ['phone-invisible-shrink', 'commission']);
  assert.equal(f.status, 'open');
  assert.equal(f.by, 'fix-a');
  assert.equal(f.where, 'JS 3100-3155');
  assert.equal(f.evidence, 'fps 66.5 -> 71.6');
  assert.equal(f.body, 'copy the query exactly');
  assert.match(f.postedAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(typeof f.branch, 'string');
  assert.deepEqual(f.acks, []);
  assert.equal(JSON.stringify(f).includes(process.env.HOME || '/nonexistent-home'), false, 'no home paths (personal data) in a finding');
  assert.deepEqual(F.get('1'), f);
  assert.throws(() => F.get('9'), /no finding F-009/);
});

test('titleSimilar: reordered or extended titles match, unrelated ones do not', () => {
  assert.ok(F.titleSimilar('Cache the MQL: matchMedia per frame is expensive', 'matchMedia per frame is expensive, cache the MQL'));
  assert.ok(F.titleSimilar('Cache MediaQueryList objects', 'Cache MediaQueryList objects instead of calling matchMedia every frame'));
  assert.ok(F.titleSimilar('filter: blur(0) still repaints', 'Filter blur(0) still repaints!'));
  assert.ok(!F.titleSimilar('filter: blur(0) still repaints', 'IntersectionObserver rootMargin on the section keeps it active'));
  assert.ok(!F.titleSimilar('Pause off-screen animations', 'Pause the countdown when hidden'));
  assert.ok(!F.titleSimilar('', 'anything'));
});

test('post: a similar title is not posted (SIMILAR) unless forced', async () => {
  await F.post(T1);
  const s = await F.post({ ...T1, by: 'fix-b', title: 'Gate the rect reads on the same media query as CSS', topics: 'hero-exit' });
  assert.equal(s.action, 'similar');
  assert.equal(s.finding.id, 'F-001');
  assert.equal(F.list().length, 1);
  const forced = await F.post({ ...T1, by: 'fix-b', title: 'Gate the rect reads on the same media query as CSS', topics: 'hero-exit', force: true });
  assert.equal(forced.action, 'posted');
  assert.equal(forced.finding.id, 'F-002');
  const other = await F.post({ ...T1, by: 'fix-b', title: 'Safari keyframes resolve custom properties against the base value', kind: 'pitfall' });
  assert.equal(other.action, 'posted');
  assert.equal(other.finding.id, 'F-003');
});

test('concurrent in-process posts with different titles get unique ids', async () => {
  const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
  const res = await Promise.all(words.map((w, k) => F.post({ by: `agent-${k}`, kind: 'coupling', topics: 'scroll-engine', title: `Coupling ${w}` })));
  assert.ok(res.every((r) => r.action === 'posted'));
  assert.equal(new Set(res.map((r) => r.finding.id)).size, 8);
  assert.equal(readdirSync(F.findingDir()).filter((f) => f.endsWith('.json')).length, 8);
});

async function seed() {
  await F.post({ by: 'fix-a', kind: 'technique', topics: 'commission', title: 'Write custom properties only on change' });
  await F.post({ by: 'fix-b', kind: 'pitfall', topics: 'nav-morph,hero-exit', title: 'Replace-all on a short minified name breaks SVG attributes', body: 'rename only inside your function' });
  await F.post({ by: 'fix-c', kind: 'measurement', topics: 'all', title: 'Host load above six hides the verdict', evidence: 'A/A at load 7: ranges overlap' });
  await F.post({ by: 'fix-a', kind: 'coupling', topics: 'scroll-engine,nav-morph', title: 'Engine iE also drives the nav callback', where: 'JS 2660-2780' });
  await F.post({ by: 'fix-b', kind: 'question', topics: 'large-area-blur', title: 'Does WebKit raster blur(0) layers?' });
}

test('list: newest last; filters by kind, topic (topic "all" matches every topic), since id or time', async () => {
  await seed();
  assert.deepEqual(F.list().map((f) => f.id), ['F-001', 'F-002', 'F-003', 'F-004', 'F-005']);
  assert.deepEqual(F.list({ kind: 'pitfall' }).map((f) => f.id), ['F-002']);
  assert.throws(() => F.list({ kind: 'nope' }), /bad kind/);
  assert.deepEqual(F.list({ topic: 'nav-morph' }).map((f) => f.id), ['F-002', 'F-003', 'F-004']);
  assert.deepEqual(F.list({ topic: 'commission,large-area-blur' }).map((f) => f.id), ['F-001', 'F-003', 'F-005']);
  assert.deepEqual(F.list({ since: 'F-003' }).map((f) => f.id), ['F-004', 'F-005']);
  assert.deepEqual(F.list({ since: '4' }).map((f) => f.id), ['F-005']);
  assert.deepEqual(F.list({ since: '2000-01-01T00:00:00Z' }).length, 5);
  assert.deepEqual(F.list({ since: new Date(Date.now() + 60000).toISOString() }), []);
  assert.throws(() => F.list({ since: 'yesterday-ish' }), /--since/);
  assert.deepEqual(F.list({ kind: 'coupling', topic: 'nav-morph', since: 'F-001' }).map((f) => f.id), ['F-004']);
});

test('ack and unread per agent: own posts are read, an ack marks read; re-ack updates the note', async () => {
  await seed();
  assert.deepEqual(F.list({ unreadAs: 'fix-a' }).map((f) => f.id), ['F-002', 'F-003', 'F-005']);
  assert.deepEqual(F.list({ unreadAs: 'fix-z' }).length, 5);
  await assert.rejects(F.ack('2', {}), /--by/);
  await assert.rejects(F.ack('42', { by: 'fix-a' }), /no finding F-042/);
  const a = await F.ack('2', { by: 'fix-a', note: 'applied in commission' });
  assert.deepEqual(a.acks.map((x) => [x.by, x.note]), [['fix-a', 'applied in commission']]);
  await F.ack('F-002', { by: 'fix-c', note: 'not relevant' });
  const again = await F.ack('F-002', { by: 'fix-a', note: 'applied in commission and nav-morph' });
  assert.deepEqual(again.acks.map((x) => [x.by, x.note]), [['fix-a', 'applied in commission and nav-morph'], ['fix-c', 'not relevant']]);
  await F.ack('3', { by: 'fix-a' });
  assert.deepEqual(F.list({ unreadAs: 'fix-a' }).map((f) => f.id), ['F-005']);
  assert.deepEqual(F.list({ unreadAs: 'fix-a', kind: 'pitfall' }), []);
  assert.equal(F.get('2').history.filter((h) => h.action === 'ack').length, 3);
});

test('resolve: only the lead; T/P/lesson/duplicate/rejected; validated', async () => {
  await seed();
  await assert.rejects(F.resolve('1', { by: 'fix-a', folded: 'T10' }), /only the lead/);
  await assert.rejects(F.resolve('1', { by: 'lead' }), /--folded/);
  await assert.rejects(F.resolve('1', { by: 'lead', folded: 'X3' }), /bad --folded "X3"/);
  await assert.rejects(F.resolve('1', { by: 'lead', folded: 'duplicate:F-001' }), /itself/);
  await assert.rejects(F.resolve('1', { by: 'lead', folded: 'duplicate:F-099' }), /no finding F-099/);
  await assert.rejects(F.resolve('1', { by: 'lead', folded: 'rejected' }), /needs --note/);
  const t = await F.resolve('1', { by: 'lead', folded: 't10', note: 'merged with T3' });
  assert.equal(t.status, 'folded');
  assert.equal(t.folded, 'T10');
  assert.equal(t.resolvedBy, 'lead');
  assert.equal(t.resolutionNote, 'merged with T3');
  assert.equal((await F.resolve('2', { by: 'lead', folded: 'P8' })).folded, 'P8');
  assert.equal((await F.resolve('3', { by: 'lead', folded: 'lesson' })).status, 'folded');
  const d = await F.resolve('4', { by: 'lead', folded: 'duplicate:2' });
  assert.equal(d.status, 'duplicate');
  assert.equal(d.duplicateOf, 'F-002');
  assert.equal((await F.resolve('5', { by: 'lead', folded: 'rejected', note: 'answered in P5' })).status, 'rejected');
  assert.deepEqual(F.list({ open: true }), []);
  assert.equal(F.list().length, 5, 'resolved findings stay on the board');
});

test('digest: FINDINGS.md table rows per kind, next T/P numbers from FINDINGS.md and the store, only open findings', async () => {
  const md = join(tempDir('fw-findmd-'), 'FINDINGS.md');
  writeFileSync(md, '| # | technique | where it won | notes |\n|---|---|---|---|\n| T1 | a | b | c |\n| T9 | **x** | y | z |\n\n| # | pitfall | source | how to avoid |\n|---|---|---|---|\n| P7 | p | s | h |\n');
  await seed();
  await F.post({ by: 'fix-d', kind: 'technique', topics: 'layout-animations', title: 'Composite progress bars with clip-path', evidence: 'layouts 231 -> 13 | per 5 s', body: 'write a --progress var\nreveal with inset()' });
  await F.ack('1', { by: 'fix-b', note: 'applied in nav-morph' });
  await F.resolve('3', { by: 'lead', folded: 'lesson' });
  await F.resolve('2', { by: 'lead', folded: 'P8' }); // folded already, not in FINDINGS.md yet: the next pitfall is P9
  const out = F.digest({ findingsFile: md });
  assert.match(out, /^<!-- finding\.mjs digest .*: 4 open findings \(F-001, F-004, F-005, F-006\)/);
  assert.match(out, /resolve <id> --by lead --folded/);
  assert.match(out, /^## Techniques that worked \(next: T10\)\n\n\| # \| technique \| where it won \| notes \|\n\|---\|---\|---\|---\|$/m);
  assert.match(out, /^\| T10 \| \*\*Write custom properties only on change\.\*\* \| commission \| F-001 by fix-a; acks: fix-b \(applied in nav-morph\) \|$/m);
  assert.match(out, /^\| T11 \| \*\*Composite progress bars with clip-path\.\*\* write a --progress var reveal with inset\(\) \| layout-animations: layouts 231 -> 13 \\\| per 5 s \| F-006 by fix-d \|$/m);
  assert.doesNotMatch(out, /Replace-all/, 'resolved findings are not in the digest');
  assert.doesNotMatch(out, /Host load/);
  assert.match(out, /^## Couplings \(change one, check the others\)\n\n- /m);
  assert.match(out, /^- \*\*Engine iE also drives the nav callback\.\*\* \(JS 2660-2780; scroll-engine, nav-morph; F-004 by fix-a\)$/m);
  assert.match(out, /^## Open questions/m);
  assert.match(out, /^- \*\*Does WebKit raster blur\(0\) layers\?\*\* \(large-area-blur; F-005 by fix-b\)$/m);
  assert.doesNotMatch(out, /^## Pitfalls/m, 'no empty sections');

  const since = F.digest({ findingsFile: md, since: 'F-005' });
  assert.match(since, /1 open finding \(F-006\)/);
  assert.match(since, /\| T10 \| \*\*Composite progress bars/);

  await F.post({ by: 'fix-e', kind: 'pitfall', topics: 'hero-exit', title: 'Safari keyframes read the base value of an animated custom property', where: 'CSS .hero', evidence: 'Safari 26', body: 'animate the real property' });
  await F.post({ by: 'fix-e', kind: 'measurement', topics: 'all', title: 'Frames over 20 ms move first', evidence: 'three fixes' });
  const all = F.digest({ findingsFile: md });
  assert.match(all, /^## Pitfalls \(next: P9\)\n\n\| # \| pitfall \| source \| how to avoid \|\n\|---\|---\|---\|---\|$/m);
  assert.match(all, /^\| P9 \| \*\*Safari keyframes read the base value of an animated custom property\.\*\* Safari 26 \| hero-exit \(CSS \.hero\); F-007 by fix-e \| animate the real property \|$/m);
  assert.match(all, /^## Measurement lessons\n\n- \*\*Frames over 20 ms move first\.\*\* \(three fixes; all; F-008 by fix-e\)$/m);

  // without a FINDINGS.md the numbers come from the store alone
  assert.match(F.digest({ findingsFile: join(state, 'missing.md') }), /\| T1 \| \*\*Write custom/);
  assert.equal(F.digest({ findingsFile: md, since: 'F-008' }).trim(), '<!-- finding.mjs digest: no open findings after F-008 -->');
});

test('waitFor: wakes on a new matching finding from someone else; ignores own, other topics, old ones; null on timeout', async () => {
  await seed();
  assert.equal(await F.waitFor({ as: 'fix-a', timeoutSec: 0.2, pollMs: 50 }), null, 'existing findings do not wake a new wait');
  await assert.rejects(F.waitFor({ timeoutSec: 0.1 }), /--as/);
  const p = F.waitFor({ as: 'fix-a', topic: 'hero-exit', timeoutSec: 10, pollMs: 50 });
  setTimeout(async () => {
    await F.post({ by: 'fix-a', kind: 'technique', topics: 'hero-exit', title: 'my own post does not wake me' });
    await F.post({ by: 'fix-b', kind: 'technique', topics: 'countdown', title: 'another topic does not wake me' });
    setTimeout(() => F.post({ by: 'fix-b', kind: 'pitfall', topics: 'hero-exit,nav-morph', title: 'this one wakes the hero-exit owner' }), 150);
  }, 100);
  const got = await p;
  assert.deepEqual(got.map((f) => f.title), ['this one wakes the hero-exit owner']);
  // --since: findings after that id count as new at once
  const s = await F.waitFor({ as: 'fix-z', since: 'F-007', timeoutSec: 1, pollMs: 50 });
  assert.deepEqual(s.map((f) => f.id), ['F-008']);
});

// ---- platform-claim status (research/architecture/claims-audit.md §4) -----------------------------------
const REF = 'https://source.chromium.org/chromium/chromium/src/+/main:cc/trees/layer_tree_host_impl.cc;l=1234';

test('claim on post: optional; validated; confirmed/refuted need a ref; refs trimmed and kept', async () => {
  const plain = (await F.post(T1)).finding;
  assert.equal('claim' in plain, false, 'a technique may carry no claim');
  assert.equal(F.claimLabel(plain), 'unknown');
  await assert.rejects(F.post({ ...T1, title: 'x1 other', claim: 'likely' }), /bad --claim "likely"/);
  await assert.rejects(F.post({ ...T1, title: 'x2 other', claim: 'confirmed' }), /a confirmed\/refuted claim needs --ref/);
  await assert.rejects(F.post({ ...T1, title: 'x3 other', claim: 'refuted', refs: ['  '] }), /needs --ref/);
  assert.equal(F.list().length, 1, 'nothing posted on an error');
  const c = (await F.post({ by: 'ver-a', kind: 'measurement', topics: 'all', title: 'layerPainted fires once per commit', claim: 'confirmed', refs: [` ${REF} `, REF, 'out/probe/raw.json'] })).finding;
  assert.equal(c.claim, 'confirmed');
  assert.deepEqual(c.refs, [REF, 'out/probe/raw.json'], 'trimmed, deduplicated');
  assert.equal(F.claimLabel(c), 'CONFIRMED');
  const o = await F.post({ by: 'fix-a', kind: 'pitfall', topics: 'hero-exit', title: 'Safari skips rAF in hidden iframes', claim: 'observed' });
  assert.equal(o.finding.claim, 'observed');
  assert.equal(o.defaulted, undefined);
  assert.deepEqual(o.finding.refs, []);
});

test('kind limitation: claim defaults to observed (defaulted flag for the NOTE); an explicit claim is kept', async () => {
  assert.ok(F.KINDS.includes('limitation'));
  const d = await F.post({ by: 'fix-a', kind: 'limitation', topics: 'large-area-blur', title: 'layerPainted never fires on Chrome 154' });
  assert.equal(d.action, 'posted');
  assert.equal(d.finding.claim, 'observed');
  assert.equal(d.defaulted, true);
  const u = await F.post({ by: 'fix-a', kind: 'limitation', topics: 'hero-exit', title: 'WebKit lays out the whole view on resize', claim: 'unresolved', refs: ['out/check.json'] });
  assert.equal(u.finding.claim, 'unresolved');
  assert.equal(u.defaulted, undefined);
});

test('claim(): transitions with history, refs appended, validation; any agent may run it', async () => {
  await F.post({ by: 'fix-a', kind: 'limitation', topics: 'large-area-blur', title: 'layerPainted never fires on Chrome 154' });
  await F.post(T1); // F-002, no claim
  await assert.rejects(F.claim('1', { status: 'refuted', refs: [REF] }), /--by/);
  await assert.rejects(F.claim('1', { by: 'ver-a' }), /--status/);
  await assert.rejects(F.claim('1', { by: 'ver-a', status: 'maybe' }), /bad --status "maybe"/);
  await assert.rejects(F.claim('1', { by: 'ver-a', status: 'refuted' }), /a confirmed\/refuted claim needs --ref/);
  await assert.rejects(F.claim('9', { by: 'ver-a', status: 'unresolved' }), /no finding F-009/);
  assert.equal(F.get('1').claim, 'observed', 'unchanged after errors');

  const u = await F.claim('1', { by: 'ver-a', status: 'unresolved', refs: ['out/probe-plan.md'], note: 'docs silent' });
  assert.equal(u.claim, 'unresolved');
  assert.deepEqual(u.refs, ['out/probe-plan.md']);
  const r = await F.claim('F-001', { by: 'ver-b', status: 'refuted', refs: [REF, 'out/probe-plan.md'], note: 'enable order was wrong' });
  assert.equal(r.claim, 'refuted');
  assert.deepEqual(r.refs, ['out/probe-plan.md', REF], 'appended, no duplicates');
  const h = F.get('1').history.filter((x) => x.action === 'claim');
  assert.equal(h.length, 2);
  assert.deepEqual(h[0].changes, { claim: { from: 'observed', to: 'unresolved' } });
  assert.deepEqual([h[0].by, h[0].note, h[0].refs], ['ver-a', 'docs silent', ['out/probe-plan.md']]);
  assert.deepEqual(h[1].changes, { claim: { from: 'unresolved', to: 'refuted' } });
  assert.deepEqual(h[1].refs, [REF, 'out/probe-plan.md'], 'the refs given in that call');
  assert.equal(r.status, 'open', 'the lifecycle status is untouched');

  // an old record without the field: from is null (unknown), never "observed"
  const c = await F.claim('2', { by: 'ver-a', status: 'confirmed', refs: [REF] });
  assert.equal(c.claim, 'confirmed');
  assert.deepEqual(c.history.at(-1).changes, { claim: { from: null, to: 'confirmed' } });
});

test('list: --claim filter; a record without the field is unknown, not observed', async () => {
  await F.post({ by: 'fix-a', kind: 'limitation', topics: 'large-area-blur', title: 'layerPainted never fires on Chrome 154' });
  await F.post(T1);
  await F.post({ by: 'fix-b', kind: 'pitfall', topics: 'hero-exit', title: 'Safari keyframes read the base value', claim: 'confirmed', refs: [REF] });
  // a record written before the claim field existed (no claim, no refs keys at all)
  const old = { ...F.get('2'), id: 'F-004', title: 'Old record from before claims' };
  delete old.claim; delete old.refs;
  writeFileSync(join(F.findingDir(), 'F-004.json'), JSON.stringify(old));
  assert.deepEqual(F.list({ claim: 'observed' }).map((f) => f.id), ['F-001']);
  assert.deepEqual(F.list({ claim: 'confirmed' }).map((f) => f.id), ['F-003']);
  assert.deepEqual(F.list({ claim: 'refuted' }), []);
  assert.throws(() => F.list({ claim: 'unknown' }), /bad --claim/);
  assert.deepEqual(F.list({ kind: 'limitation' }).map((f) => f.id), ['F-001']);
  assert.equal(F.claimLabel(F.get('4')), 'unknown');
  assert.equal(F.claimTag(F.get('4')), '');
  assert.equal(F.claimTag(F.get('1')), '[OBSERVED] ');
  assert.equal(F.claimTag(F.get('3')), '[CONFIRMED] ');
});

test('digest: carries the claim tag and refs; limitations get their own section', async () => {
  const md = join(tempDir('fw-findmd-'), 'FINDINGS.md');
  await F.post({ by: 'fix-a', kind: 'limitation', topics: 'large-area-blur', title: 'layerPainted never fires on Chrome 154', evidence: '0 events in 5 runs' });
  await F.post({ by: 'fix-b', kind: 'pitfall', topics: 'hero-exit', title: 'Safari keyframes read the base value', claim: 'confirmed', refs: [REF], body: 'animate the real property' });
  await F.post({ by: 'fix-c', kind: 'technique', topics: 'commission', title: 'Write custom properties only on change' });
  await F.claim('1', { by: 'ver-a', status: 'refuted', refs: ['https://chromedevtools.github.io/devtools-protocol/tot/LayerTree/#event-layerPainted'] });
  const out = F.digest({ findingsFile: md });
  assert.match(out, /^\| P1 \| \[CONFIRMED\] \*\*Safari keyframes read the base value\.\*\* \| hero-exit; F-002 by fix-b; refs: https:\/\/source\.chromium\.org\/\S+ \| animate the real property \|$/m);
  assert.match(out, /^\| T1 \| \*\*Write custom properties only on change\.\*\* \| commission \| F-003 by fix-c \|$/m, 'no tag without a claim');
  assert.match(out, /^## Platform limitations \(claim status per row\)\n\n- \[REFUTED\] \*\*layerPainted never fires on Chrome 154\.\*\* \(0 events in 5 runs; large-area-blur; F-001 by fix-a; refs: https:\/\/chromedevtools\S+\)$/m);
  assert.match(out, /3 open findings \(F-001, F-002, F-003\)/);
});

test('waitFor: a claim change by someone else is news for the finding\'s topics; own changes and other topics are not', async () => {
  await F.post({ by: 'fix-a', kind: 'limitation', topics: 'large-area-blur', title: 'layerPainted never fires on Chrome 154' });
  await F.post({ by: 'fix-b', kind: 'limitation', topics: 'countdown', title: 'Safari throttles timers in hidden tabs' });
  await F.claim('1', { by: 'ver-a', status: 'unresolved', refs: ['out/a.json'] });
  assert.equal(await F.waitFor({ as: 'fix-a', timeoutSec: 0.2, pollMs: 50 }), null, 'claim changes before the wait started are not news');
  const p = F.waitFor({ as: 'fix-a', topic: 'large-area-blur', timeoutSec: 10, pollMs: 50 });
  setTimeout(async () => {
    await F.claim('1', { by: 'fix-a', status: 'observed', note: 'my own change' });
    await F.claim('2', { by: 'ver-b', status: 'refuted', refs: [REF] }); // other topic
    setTimeout(() => F.claim('1', { by: 'ver-layerpainted', status: 'refuted', refs: [REF] }), 150);
  }, 100);
  const got = await p;
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'F-001');
  assert.deepEqual(got[0].claimChanges.map((c) => [c.from, c.to, c.by]), [['observed', 'refuted', 'ver-layerpainted']]);
  assert.equal(F.claimChangeLine(got[0].id, got[0].claimChanges[0]), 'CLAIM F-001 observed -> refuted by ver-layerpainted');
  assert.equal(F.claimChangeLine('F-009', { from: null, to: 'confirmed', by: 'v' }), 'CLAIM F-009 unknown -> confirmed by v');
  // --since <iso time>: claim changes after that time count at once
  const t = new Date(Date.parse(got[0].claimChanges[0].at) - 1).toISOString();
  const s = await F.waitFor({ as: 'fix-z', since: t, timeoutSec: 1, pollMs: 50 });
  assert.deepEqual(s.map((f) => [f.id, f.claimChanges?.map((c) => c.to)]), [['F-001', ['refuted']]]);
  // a new post is still plain news (no claimChanges)
  const n = F.waitFor({ as: 'fix-z', timeoutSec: 10, pollMs: 50 });
  setTimeout(() => F.post({ by: 'fix-b', kind: 'technique', topics: 'hero-exit', title: 'A fresh technique' }), 100);
  const fresh = await n;
  assert.deepEqual(fresh.map((f) => [f.id, f.claimChanges]), [['F-003', undefined]]);
});
