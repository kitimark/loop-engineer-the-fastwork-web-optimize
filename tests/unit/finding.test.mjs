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
