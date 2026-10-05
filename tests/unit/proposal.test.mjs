// Console proposals (ts-proposals): the fw-proposal/1 schema, the scrubber (Hard rule 12), media sniffing and
// copying into the store (Hard rule 3), the state machine (post, revise, publish, withdraw, decide, undo) and the
// wait conditions. Temp state dir ($FW_STATE_DIR), fake images, fake addresses (192.168.77.12).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { writePng, writeMp4, pngBytes } from '../fixtures/fake-media.mjs';
import { ARTIFACT_OK, ARTIFACT_BAD } from './artifact-cases.mjs';

const LAN = 'https://192.168.77.12:5612/';
let P, dir;

before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-unit-');
  P = await import('../../tools/lib/proposal.mjs');
  dir = tempDir('fw-proposal-src-');
  mkdirSync(join(dir, 'shots'), { recursive: true });
  writePng(join(dir, 'shots', 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'shots', 'b-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
  writePng(join(dir, 'shots', 'b-small.png'), 4, 3);
  writeMp4(join(dir, 'a.mp4'));
  writeMp4(join(dir, 'b.mp4'));
  writeFileSync(join(dir, 'notes.txt'), 'not an image');
});

const sample = (over = {}) => ({
  schema: 'fw-proposal/1',
  title: 'Hero glow as a pre-rendered image',
  area: 'hero',
  topic: 'style-recalc-r4',
  problem: 'Every scroll frame restyles 412 elements in the hero.\n\nThat costs 9 ms per frame at CPU 6x.',
  idea: 'Draw the glow once into an image and move the image.',
  looksSame: 'The glow is static while you scroll; the image has the same pixels.',
  visualDiff: ['The glow no longer follows the cursor on desktop.', 'At 3x zoom the edge shows 1-2 px banding.'],
  gain: [
    { what: 'Elements restyled per scroll frame', before: 412, after: '38', tag: 'OBSERVED', how: 'Chrome trace, 430x932, CPU 6x, 3 runs' },
    { what: 'Frames over 50 ms on the phone', before: '6', after: 'estimate 1-2', tag: 'estimate', how: 'from the Chrome count', needsPhone: true },
  ],
  risk: 'A future design change to the glow needs a new image.',
  live: { none: 'Test fixture: no page to try.' }, // I-109: every posted proposal names its Try-it entry
  compare: {
    a: { label: 'Original (baseline)', url: 'https://localhost:5612/' },
    b: { label: 'PoC', url: 'http://127.0.0.1:5613/?x=1' },
    shots: [{ caption: 'Top (scrollY 0)', a: 'shots/a-0.png', b: 'shots/b-0.png' }],
    view: 'slider',
  },
  ...over,
});

test('scrubText: LAN addresses, other URLs, e-mail, home paths and ids go; localhost URLs stay', () => {
  const r = P.scrubText(`Open ${LAN} or http://localhost:5612/x?y=1, mail kiti@example.com, file /Users/someone/x, phone.local, udid 00008130-001234567890ABCD`);
  assert.ok(!r.text.includes('192.168'), r.text);
  assert.ok(r.text.includes('http://localhost:5612/x?y=1'), r.text);
  for (const bad of ['example.com', '/Users/someone', 'phone.local', '001234567890ABCD']) assert.ok(!r.text.includes(bad), `${bad}: ${r.text}`);
  assert.ok(r.found.includes('url') && r.found.includes('e-mail') && r.found.includes('home path'), r.found.join());
  assert.deepEqual(P.scrubText('Plain words, 412 -> 38 elements, P-029, 16:21:39').found, []);
  assert.equal(P.scrubText('Plain words, 412 -> 38 elements').text, 'Plain words, 412 -> 38 elements');
  // closing punctuation after a scrubbed URL stays; the address does not
  assert.equal(P.scrubText(`Keep it (seen on ${LAN}).`).text, 'Keep it (seen on <link>).');
  assert.equal(P.scrubText('see https://192.168.77.12:5612/a?b=1, then').text, 'see <link>, then');
});

test('I-191 scrubText: a claude.ai artifact link is kept as written (sentence punctuation after it is not part of it); look-alikes scrubbed whole', () => {
  for (const ok of ARTIFACT_OK) assert.deepEqual(P.scrubText(`Review ${ok} please`), { text: `Review ${ok} please`, found: [] }, ok);
  const u = ARTIFACT_OK[0];
  assert.equal(P.scrubText(`See ${u}. Or (${u}), "${u}"! Seen ${u}?`).text, `See ${u}. Or (${u}), "${u}"! Seen ${u}?`);
  for (const bad of ARTIFACT_BAD) {
    const r = P.scrubText(`x ${bad} y`);
    assert.equal(r.text, 'x <link> y', bad);
    assert.ok(r.found.includes('url'), bad);
  }
  // the rest of the text is scrubbed as before
  assert.equal(P.scrubText(`${u} and https://192.168.77.12:5612/ and someone@example.invalid`).text, `${u} and <link> and <e-mail>`);
});

test('isLocalUrl: localhost, 127.0.0.1 and [::1] only', () => {
  for (const u of ['http://localhost:5612/', 'https://127.0.0.1:1/x', 'http://[::1]:80/']) assert.ok(P.isLocalUrl(u), u);
  for (const u of [LAN, 'http://example.com/', 'http://localhost.evil.invalid/', 'file:///etc/passwd', 'http://user:pw@localhost/', 'javascript:alert(1)', 'nope']) assert.ok(!P.isLocalUrl(u), u);
});

test('sniffMedia: by magic bytes, not the name; size limits; PNG dimensions', () => {
  const m = P.sniffMedia(join(dir, 'shots', 'a-0.png'));
  assert.deepEqual([m.kind, m.ext, m.width, m.height], ['image', 'png', 8, 6]);
  assert.equal(P.sniffMedia(join(dir, 'a.mp4')).kind, 'video');
  const disguised = join(dir, 'really-text.png');
  writeFileSync(disguised, 'hello');
  assert.throws(() => P.sniffMedia(disguised), /not a PNG, JPEG, WebP or GIF image/);
  assert.throws(() => P.sniffMedia(join(dir, 'missing.png')), /no such file/);
  const jpg = join(dir, 'x.bin'); writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
  assert.equal(P.sniffMedia(jpg).ext, 'jpg');
});

test('normalize: the sample is valid; required fields, enums, gain rows, localhost-only URLs, media are checked', () => {
  const ok = P.normalize(sample(), { baseDir: dir });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.fields.gain[0].before, '412', 'numbers become text');
  assert.equal(ok.fields.gain[1].needsPhone, true);
  assert.equal(ok.fields.compare.b.url, 'http://127.0.0.1:5613/?x=1');
  assert.equal(ok.media.shots.length, 1);

  const e = (over, opts = {}) => P.normalize(sample(over), { baseDir: dir, ...opts }).errors.join('\n');
  assert.match(e({ area: 'top' }), /area: one of hero, middle, end, whole/);
  assert.match(e({ problem: '' }), /problem: required/);
  assert.match(e({ visualDiff: [] }), /visualDiff: at least one item/);
  assert.match(e({ gain: [{ what: 'x', before: '1', after: '2', tag: 'guess', how: 'h' }] }), /gain\[0\]\.tag: one of OBSERVED/);
  assert.match(e({ gain: [{ what: 'x', before: '1', after: '2', tag: 'OBSERVED', how: 'h', needsPhone: 'yes' }] }), /needsPhone: true or false/);
  assert.match(e({ schema: 'fw-proposal/9' }), /schema: must be "fw-proposal\/1"/);
  assert.match(e({ title: 'x'.repeat(121) }), /title: 121 characters, at most 120/);
  assert.match(e({ compare: { ...sample().compare, a: { label: 'A', url: LAN } } }), /compare\.a\.url: must be a localhost URL/);
  assert.ok(!e({ compare: { ...sample().compare, a: { label: 'A', url: LAN } } }).includes('192.168'), 'the error does not echo the address');
  assert.match(e({ compare: { ...sample().compare, view: 'zoom' } }), /compare\.view: one of side, slider, blink/);
  assert.match(e({ compare: { a: {}, b: {} } }), /at least one screenshot pair/);
  assert.match(e({ compare: { shots: [{ a: 'notes.txt', b: 'shots/b-0.png' }] } }), /shot 1 A: .*not a PNG/);
  assert.match(e({ compare: { shots: [{ a: 'a.mp4', b: 'shots/b-0.png' }] } }), /is a video; screenshots are images/);
  assert.match(e({ compare: { video: { a: 'a.mp4' } } }), /give both A and B/);
  assert.match(e({}, { shotsA: ['x.png'], shotsB: [] }), /pair up by order/);
  assert.equal(e({ compare: { video: { a: 'a.mp4', b: 'b.mp4' } } }), '', 'a video alone is enough');
  assert.deepEqual(P.normalize(sample({ compare: { shots: [{ a: 'shots/a-0.png', b: 'shots/b-small.png' }] } }), { baseDir: dir }).warnings.length, 1, 'a size mismatch warns');
  // a draft needs only the title and area
  assert.deepEqual(P.normalize({ title: 'Idea', area: 'end' }, { draft: true }).errors, []);
  assert.match(P.normalize({ area: 'end' }, { draft: true }).errors.join(), /title: required/);
});

test('normalize scrubs every text field and reports what it scrubbed', () => {
  const n = P.normalize(sample({ problem: `Measured on ${LAN} by kiti@example.com`, visualDiff: ['see /Users/someone/shot.png'] }), { baseDir: dir });
  assert.deepEqual(n.errors, []);
  assert.ok(!JSON.stringify(n.fields).includes('192.168'));
  assert.ok(!JSON.stringify(n.fields).includes('example.com'));
  assert.ok(n.scrubbed.some((s) => /^problem: url/.test(s)) && n.scrubbed.some((s) => /^problem: e-mail/.test(s)) && n.scrubbed.some((s) => /^visualDiff\[0\]: home path/.test(s)), n.scrubbed.join());
});

test('parseMarkdown: front matter and sections give the same proposal as the JSON form', () => {
  const md = `---
title: Hero glow as a pre-rendered image
area: hero
topic: style-recalc-r4
a: Original (baseline) | https://localhost:5612/
b: PoC | http://127.0.0.1:5613/?x=1
view: slider
live: none: Test fixture: no page to try.
---
## Problem
Every scroll frame restyles 412 elements in the hero.

That costs 9 ms per frame at CPU 6x.

## Idea
Draw the glow once into an image and move the image.

## Looks the same
The glow is static while you scroll; the image has the same pixels.

## Visual difference
- The glow no longer follows the cursor on desktop.
- At 3x zoom the edge shows 1-2 px banding.

## Gain
| what | before | after | tag | how | phone |
|---|---|---|---|---|---|
| Elements restyled per scroll frame | 412 | 38 | OBSERVED | Chrome trace, 430x932, CPU 6x, 3 runs | |
| Frames over 50 ms on the phone | 6 | estimate 1-2 | estimate | from the Chrome count | yes |

## Risk
A future design change to the glow needs a new image.
`;
  const raw = P.parseMarkdown(md);
  const a = P.normalize(raw, { baseDir: dir, shotsA: [join(dir, 'shots', 'a-0.png')], shotsB: [join(dir, 'shots', 'b-0.png')], captions: ['Top (scrollY 0)'] });
  const b = P.normalize(sample(), { baseDir: dir });
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.fields, b.fields);
  assert.equal(a.media.shots[0].caption, 'Top (scrollY 0)');
});

test('post: assigns PR-001, copies the media into the store under fixed names; drafts; list order', async () => {
  const { proposal: p, warnings } = await P.postProposal({ by: 'de-illusion-style', raw: sample(), baseDir: dir });
  assert.equal(p.id, 'PR-001');
  assert.deepEqual([p.state, p.rev, p.by, p.decision], ['proposed', 1, 'de-illusion-style', null]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(p.compare.shots, [{ caption: 'Top (scrollY 0)', a: 'r1-a-1.png', b: 'r1-b-1.png', aSize: [8, 6], bSize: [8, 6] }]);
  const md = P.mediaDir('PR-001');
  assert.deepEqual(readdirSync(md).sort(), ['r1-a-1.png', 'r1-b-1.png']);
  assert.deepEqual(readFileSync(join(md, 'r1-b-1.png')), pngBytes(8, 6, [200, 60, 60], [60, 60, 200]), 'a copy of the bytes');
  assert.ok(md.startsWith(join(process.env.FW_STATE_DIR, 'console', 'proposals')), md);
  await assert.rejects(P.postProposal({ by: '', raw: sample(), baseDir: dir }), /--by/);
  await assert.rejects(P.postProposal({ by: 'x', raw: sample({ area: 'nowhere' }), baseDir: dir }), /not valid:\n {2}area/);
  const d = await P.postProposal({ by: 'de-illusion-composite', raw: { title: 'Later', area: 'end' }, draft: true });
  assert.deepEqual([d.proposal.id, d.proposal.state], ['PR-002', 'draft']);
  assert.deepEqual(P.listProposals({ waiting: true }).map((x) => x.id), ['PR-001']);
  assert.deepEqual(P.listProposals({ by: 'de-illusion-composite' }).map((x) => x.id), ['PR-002']);
  assert.deepEqual(P.pageProposals().map((x) => x.id), ['PR-001'], 'drafts are not on the page');
  assert.equal(P.publicView(P.get('PR-002')), null);
});

test('decide: accept / reject / change; change needs notes; a stale revision is refused; undo; final states', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-a', raw: sample(), baseDir: dir });
  await assert.rejects(P.decide(p.id, { value: 'maybe' }), /accept, reject or change/);
  await assert.rejects(P.decide(p.id, { value: 'change' }), /say what to change/);
  await assert.rejects(P.decide(p.id, { value: 'accept', rev: 2 }), /was revised \(now revision 1, you saw 2\)/);
  const d = await P.decide(p.id, { value: 'change', notes: `Keep the glow moving; see ${LAN}`, rev: 1 });
  assert.equal(d.state, 'changes-requested');
  assert.deepEqual([d.decision.value, d.decision.rev, d.decision.who], ['changes-requested', 1, 'user']);
  assert.ok(!d.decision.notes.includes('192.168'), 'the user\'s notes are scrubbed too');
  await assert.rejects(P.decide(p.id, { value: 'accept' }), /is changes-requested, not waiting/);
  const u = await P.undoDecision(p.id, { rev: 1 });
  assert.deepEqual([u.state, u.decision, u.decisions.length], ['proposed', null, 1]);
  const a = await P.decide(p.id, { value: 'accepted', notes: 'nice' });
  assert.equal(a.state, 'accepted');
  await assert.rejects(P.withdrawProposal(p.id, { by: 'de-a' }), /is accepted/);
  // T-030 (intended change): revising an accepted proposal used to be refused ("post a new proposal instead"); now the
  // decision goes stale and the user re-decides (tests/unit/proposal-hold.test.mjs). A withdrawn one still refuses.
  assert.equal(P.decisionStateOf((await P.reviseProposal(p.id, { by: 'de-a', note: 'x' })).proposal), 'stale');
  const { proposal: w } = await P.postProposal({ by: 'de-a', raw: sample(), baseDir: dir });
  await P.withdrawProposal(w.id, { by: 'de-a' });
  await assert.rejects(P.reviseProposal(w.id, { by: 'de-a', note: 'x' }), /post a new proposal instead/);
});

test('revise: changes-requested -> proposed, rev+1, new shots replace the old, none keep them; a note is required', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-b', raw: sample(), baseDir: dir });
  await P.decide(p.id, { value: 'change', notes: 'less banding' });
  await assert.rejects(P.reviseProposal(p.id, { by: 'de-b' }), /--note/);
  const r = await P.reviseProposal(p.id, { by: 'de-b', note: 'smoother gradient', raw: sample({ risk: 'New risk.' }), baseDir: dir, shotsA: [join(dir, 'shots', 'a-0.png')], shotsB: [join(dir, 'shots', 'b-0.png')], captions: ['Again'] });
  const q = r.proposal;
  assert.deepEqual([q.state, q.rev, q.risk, q.decision], ['proposed', 2, 'New risk.', null]);
  assert.deepEqual(q.compare.shots.map((s) => [s.caption, s.a, s.b]), [['Top (scrollY 0)', 'r2-a-1.png', 'r2-b-1.png'], ['Again', 'r2-a-2.png', 'r2-b-2.png']]);
  assert.equal(q.decisions.length, 1, 'the old decision stays in decisions');
  assert.deepEqual(q.revisions.map((x) => [x.rev, x.note]), [[1, 'first version'], [2, 'smoother gradient']]);
  // text-only revision: shots kept
  const t = (await P.reviseProposal(p.id, { by: 'de-b', note: 'typo' })).proposal;
  assert.equal(t.rev, 3);
  assert.deepEqual(t.compare.shots.map((s) => s.a), ['r2-a-1.png', 'r2-a-2.png']);
  assert.equal(t.risk, 'New risk.');
  assert.equal(t.topic, 'style-recalc-r4');
  // a draft stays a draft unless published
  const { proposal: d } = await P.postProposal({ by: 'de-b', raw: { title: 'Draft', area: 'middle' }, draft: true });
  assert.equal((await P.reviseProposal(d.id, { by: 'de-b', note: 'more', raw: { title: 'Draft 2', area: 'middle' } })).proposal.state, 'draft');
  await assert.rejects(P.publishProposal(d.id, { by: 'de-b' }), /problem: required[\s\S]*at least one screenshot pair/);
  await assert.rejects(P.reviseProposal(d.id, { by: 'de-b', note: 'go', raw: { title: 'Draft 2', area: 'middle' }, publish: true }), /problem: required/);
  const pub = await P.reviseProposal(d.id, { by: 'de-b', note: 'complete', raw: sample(), baseDir: dir, publish: true });
  assert.equal(pub.proposal.state, 'proposed');
});

test('withdraw, and the waits: decided (MET with the decision, NEVER when withdrawn) and --any for one author', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-w', raw: sample(), baseDir: dir });
  const w = P.waitCondition(p.id);
  assert.equal(w.check().met, false);
  assert.throws(() => P.waitCondition(p.id, { until: 'started' }), /--until must be decided or changed/);
  const since = new Date(Date.now() - 1).toISOString();
  const any = P.waitAnyCondition({ by: 'de-w', since });
  assert.equal(any.check().met, false);
  // I-045: --any without --by is the lead's wait over ALL proposals (it used to refuse)
  assert.match(P.waitAnyCondition({}).what, /^a decision on any proposal after /);
  assert.throws(() => P.waitAnyCondition({ since: 'yesterday' }), /--since must be an ISO time/);
  await P.decide(p.id, { value: 'reject', notes: 'too different' });
  const r = w.check();
  assert.equal(r.met, true);
  assert.deepEqual(JSON.parse(r.detail), { ...JSON.parse(r.detail), id: p.id, rev: 1, value: 'rejected', notes: 'too different' });
  const a = any.check();
  assert.equal(a.met, true);
  assert.deepEqual(JSON.parse(a.detail).decisions.map((d) => [d.id, d.value]), [[p.id, 'rejected']]);
  assert.equal(P.waitAnyCondition({ by: 'de-w' }).check().met, false, 'default since = now: an old decision does not count');
  const { proposal: q } = await P.postProposal({ by: 'de-w', raw: sample(), baseDir: dir });
  const wq = P.waitCondition(q.id);
  await P.withdrawProposal(q.id, { by: 'de-w', note: 'superseded' });
  assert.match(wq.check().never, /withdrawn/);
  assert.ok(!P.listProposals().some((x) => x.id === q.id), 'withdrawn ones are hidden by default');
  assert.ok(P.listProposals({ all: true }).some((x) => x.id === q.id));
});

// I-045 (2026-10-01 21:02-21:04Z): the user rejected PR-001, undid it, then requested a change. The author's
// `wait --until decided` had exited on "rejected" and nothing else watched, so the change notified nobody.
const past = () => new Date(Date.now() - 1).toISOString();
// the user clicks seconds apart; --since is strict (>), so keep each event in its own millisecond here
const tick = () => new Promise((r) => setTimeout(r, 3));
const evKey = (e) => [e.id, e.event, e.value, e.was];

test('I-045 decision events: reject -> undo -> change inside one --any window (all proposals, no --by) gives all three', async () => {
  const t0 = past();
  const anyAll = P.waitAnyCondition({ since: t0 });
  const anyMine = P.waitAnyCondition({ by: 'de-seq', since: t0 });
  const anyOther = P.waitAnyCondition({ by: 'de-someone-else', since: t0 });
  const { proposal: p } = await P.postProposal({ by: 'de-seq', raw: sample(), baseDir: dir });
  const changed = P.waitCondition(p.id, { until: 'changed', since: t0 });
  assert.equal(anyAll.check().met, false, 'posting is not a decision');
  assert.equal(changed.check().met, false);
  await P.decide(p.id, { value: 'reject', notes: 'too different' });
  const rejectAt = P.get(p.id).decision.at;
  await tick();
  await P.undoDecision(p.id, { rev: 1 });
  await P.decide(p.id, { value: 'change', notes: 'keep the glow moving' });
  const a = anyAll.check();
  assert.equal(a.met, true);
  const d = JSON.parse(a.detail);
  const mine = d.events.filter((e) => e.id === p.id);
  assert.deepEqual(mine.map(evKey), [
    [p.id, 'decided', 'rejected', null],
    [p.id, 'undecided', 'proposed', 'rejected'],
    [p.id, 'decided', 'changes-requested', 'rejected'],
  ]);
  assert.deepEqual(mine.map((e) => [e.who, e.rev, e.by, e.title]), Array(3).fill(['user', 1, 'de-seq', p.title]));
  assert.equal(mine[0].notes, 'too different');
  assert.equal(mine[2].notes, 'keep the glow moving');
  assert.ok(mine.every((e, i) => i === 0 || e.at >= mine[i - 1].at), 'events in time order');
  assert.deepEqual(d.decisions.filter((x) => x.id === p.id).map((x) => x.value), ['changes-requested'], 'decisions: the standing ones');
  assert.deepEqual(JSON.parse(anyMine.check().detail).events.map(evKey), mine.map(evKey), '--by: the author\'s proposals');
  assert.equal(anyOther.check().met, false, '--by: not another author\'s');
  assert.equal(anyAll.rearm(d), `node tools/console.mjs proposal wait --any --since ${mine[2].at}`);
  assert.equal(anyMine.rearm(d), `node tools/console.mjs proposal wait --any --by de-seq --since ${mine[2].at}`);
  // the same sequence for one proposal: --until changed reports every event; re-armed after the last, nothing
  const c = JSON.parse(changed.check().detail);
  assert.deepEqual(c.events.map(evKey), mine.map(evKey));
  assert.deepEqual([c.id, c.state, c.decision.value, c.decision.was], [p.id, 'changes-requested', 'changes-requested', 'rejected']);
  assert.equal(changed.rearm(c), `node tools/console.mjs proposal wait ${p.id} --until changed --since ${mine[2].at}`);
  assert.equal(P.waitCondition(p.id, { until: 'changed', since: mine[2].at }).check().met, false);
  assert.equal(P.waitCondition(p.id, { until: 'changed' }).check().met, false, 'changed: default since = now');
  // re-armed after the first decision (the author acted on "rejected"): the undo and the change are both seen
  const after1 = JSON.parse(P.waitCondition(p.id, { until: 'changed', since: rejectAt }).check().detail);
  assert.deepEqual(after1.events.map((e) => e.event), ['undecided', 'decided']);
});

test('I-045 --until decided --since: an undo alone does not wake it, the changed decision does; plain decided is unchanged', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-seq2', raw: sample(), baseDir: dir });
  await P.decide(p.id, { value: 'reject' });
  const rejectAt = P.get(p.id).decision.at;
  await tick();
  const plain = P.waitCondition(p.id);
  const pd = JSON.parse(plain.check().detail);
  assert.deepEqual([pd.value, pd.was], ['rejected', null], 'without --since: met at once on the standing decision (as before)');
  assert.equal(plain.rearm(pd), `node tools/console.mjs proposal wait ${p.id} --until changed --since ${rejectAt}`);
  const again = P.waitCondition(p.id, { until: 'decided', since: rejectAt });
  assert.equal(again.check().met, false, 'the decision it already saw does not count');
  await P.undoDecision(p.id, { rev: 1 });
  const u = again.check();
  assert.equal(u.met, false, 'undone: waiting for the user again');
  assert.match(u.state, /^proposed, rev 1/);
  const ch = P.waitCondition(p.id, { until: 'changed', since: rejectAt }).check();
  assert.deepEqual(JSON.parse(ch.detail).events.map(evKey), [[p.id, 'undecided', 'proposed', 'rejected']], '--until changed wakes on the undo');
  await P.decide(p.id, { value: 'change', notes: 'brighter' });
  const m = again.check();
  assert.equal(m.met, true);
  const md = JSON.parse(m.detail);
  assert.deepEqual([md.id, md.value, md.was, md.notes], [p.id, 'changes-requested', 'rejected', 'brighter']);
  assert.deepEqual(md.events.map((e) => e.event), ['undecided', 'decided']);
  assert.throws(() => P.waitCondition(p.id, { since: 'soon' }), /--since must be an ISO time/);
  const { proposal: q } = await P.postProposal({ by: 'de-seq2', raw: sample(), baseDir: dir });
  const wq = P.waitCondition(q.id, { until: 'changed' });
  await P.withdrawProposal(q.id, { by: 'de-seq2' });
  assert.match(wq.check().never, /withdrawn/);
});

test('I-065 one instant per change: decision.at and proposedAt equal their history entry, even when the clock ticks inside the change', async (t) => {
  // under load the clock moved 1 ms between decision.at (taken in the mutator) and the history entry's at (taken in
  // change() after it): a wait re-armed at decision.at then reported that same decision again as a change
  const { proposal: p } = await P.postProposal({ by: 'de-tick', raw: sample(), baseDir: dir, draft: true });
  assert.equal(p.state, 'draft');
  let now = Date.now() - 60000; // a minute back, so nothing lands after the real clock (later tests' read marks)
  t.mock.method(Date, 'now', () => (now += 1)); // every read of the clock is 1 ms later than the one before
  const pub = await P.publishProposal(p.id, { by: 'de-tick' });
  assert.equal(pub.proposedAt, pub.history.at(-1).at, 'publish: proposedAt is the history instant');
  const d = await P.decide(p.id, { value: 'reject' });
  assert.equal(d.decision.at, d.history.at(-1).at, 'decide: decision.at is the history instant');
  assert.equal(d.decisions.at(-1).at, d.history.at(-1).at);
  assert.equal(P.waitCondition(p.id, { until: 'changed', since: d.decision.at }).check().met, false, 're-armed at the decision: nothing new');
  const plain = P.waitCondition(p.id);
  const again = P.waitCondition(p.id, { until: 'changed', since: JSON.parse(plain.check().detail).at });
  assert.equal(again.check().met, false, 'the plain wait\'s re-arm point does not re-report its own decision');
  t.mock.restoreAll();
  await P.undoDecision(p.id, { rev: 1 });
  assert.deepEqual(JSON.parse(again.check().detail).events.map((e) => e.event), ['undecided'], 'the undo alone');
});

test('I-045 read marks: proposalNews reports each decision event once per reader; the lead sees all, an agent its own', async () => {
  assert.deepEqual(P.proposalNews('lead', { all: true }), [], 'no mark yet: nothing (a first wait never dumps the past)');
  await P.initProposalMark('lead');
  await P.initProposalMark('de-mark');
  const mark = P.proposalMark('lead');
  await P.initProposalMark('lead', '2000-01-01T00:00:00.000Z');
  assert.deepEqual(P.proposalMark('lead'), mark, 'init keeps an existing mark');
  assert.deepEqual(P.proposalNews('lead', { all: true }), [], 'older decisions are not news');
  const { proposal: p } = await P.postProposal({ by: 'de-mark', raw: sample(), baseDir: dir });
  const { proposal: q } = await P.postProposal({ by: 'de-other', raw: sample(), baseDir: dir });
  await P.decide(p.id, { value: 'reject', notes: 'no' });
  await P.undoDecision(p.id, { rev: 1 });
  await P.decide(p.id, { value: 'change', notes: 'line one\nline two' });
  await P.decide(q.id, { value: 'accept' });
  const lead = P.proposalNews('lead', { all: true });
  assert.deepEqual(lead.map(evKey), [
    [p.id, 'decided', 'rejected', null], [p.id, 'undecided', 'proposed', 'rejected'],
    [p.id, 'decided', 'changes-requested', 'rejected'], [q.id, 'decided', 'accepted', null],
  ]);
  assert.deepEqual(P.proposalNews('de-mark').map(evKey), lead.slice(0, 3).map(evKey), 'an agent: its own proposals only');
  await P.commitProposalNews('lead', lead.slice(0, 2));
  assert.deepEqual(P.proposalNews('lead', { all: true }).map(evKey), lead.slice(2).map(evKey), 'committed events are not news again');
  await P.commitProposalNews('lead', P.proposalNews('lead', { all: true }));
  assert.deepEqual(P.proposalNews('lead', { all: true }), []);
  assert.equal(P.proposalNews('de-mark').length, 3, 'each reader has its own mark');
  await P.undoDecision(q.id, { rev: 1 });
  assert.deepEqual(P.proposalNews('lead', { all: true }).map(evKey), [[q.id, 'undecided', 'proposed', 'accepted']]);
  // the text the lead's thread wait prints
  const [r, , c] = lead;
  assert.equal(P.proposalNewsText(r).split('\n')[0], `PROPOSAL ${p.id} decided rejected by user at ${r.at}: no`);
  assert.equal(P.proposalNewsText(lead[1]).split('\n')[0], `PROPOSAL ${p.id} undecided (was rejected) by user at ${lead[1].at}: back to proposed, waiting for the user`);
  const ct = P.proposalNewsText(c).split('\n');
  assert.equal(ct[0], `PROPOSAL ${p.id} decided changes-requested (was rejected) by user at ${c.at}: line one`);
  assert.equal(ct[1], '  line two');
  assert.match(ct.at(-1), new RegExp(`^ {2}"${p.title}" rev 1 by de-mark; show: node tools/console\\.mjs proposal show ${p.id}$`));
});

test('publicView and mediaFile: /media URLs, no history; strict names, no traversal', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-v', raw: sample({ compare: { ...sample().compare, video: { a: 'a.mp4', b: 'b.mp4' } } }), baseDir: dir });
  const v = P.publicView(P.get(p.id));
  assert.equal(v.history, undefined);
  assert.deepEqual(v.compare.shots[0], { caption: 'Top (scrollY 0)', a: `/media/${p.id}/r1-a-1.png`, b: `/media/${p.id}/r1-b-1.png`, aSize: [8, 6], bSize: [8, 6] });
  assert.deepEqual(v.compare.video, { a: `/media/${p.id}/r1-video-a.mp4`, b: `/media/${p.id}/r1-video-b.mp4`, both: undefined });
  assert.equal(v.compare.view, 'slider');
  assert.deepEqual(P.mediaFile(p.id, 'r1-a-1.png').type, 'image/png');
  assert.equal(P.mediaFile(p.id, 'r1-video-a.mp4').type, 'video/mp4');
  for (const [id, name] of [[p.id, '../PR-001.json'], [p.id, 'r1-a-1.png/..'], [p.id, 'r9-a-1.png'], ['PR-1', 'r1-a-1.png'], ['../x', 'r1-a-1.png'], [p.id, 'R1-A-1.PNG'], [p.id, 'r1-a-1.svg']]) assert.equal(P.mediaFile(id, name), null, `${id}/${name}`);
});

test('waitingProposals: proposed only, ids and scrubbed one-line titles', async () => {
  const before = P.waitingProposals().length;
  await P.postProposal({ by: 'de-x', raw: sample({ title: `Glow via ${LAN} now` }), baseDir: dir });
  const w = P.waitingProposals();
  assert.equal(w.length, before + 1);
  const last = w.at(-1);
  assert.deepEqual(Object.keys(last).sort(), ['id', 'queuedAt', 'status', 'title', 'updatedAt', 'yourTurn']);
  assert.equal(last.title, 'Glow via <link> now');
  assert.ok(!JSON.stringify(w).includes('192.168'));
  assert.ok(existsSync(P.proposalsDir()));
});

test('proposals-page.html: one menu slot, the shared nav, text only (no HTML sinks), nothing external', () => {
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  assert.equal(html.split('<!--console-menu-->').length, 2);
  assert.ok(html.includes('<script src="/console-nav.js"></script>') && html.includes('<link rel="stylesheet" href="/console-nav.css">'));
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc']) assert.ok(!html.includes(sink), sink);
  assert.ok(!/(?:src|href)\s*=\s*["']?https?:/i.test(html), 'no external resource');
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(html), 'no external CSS');
  assert.match(html, /x-console': '1'/, 'POSTs carry the x-console header');
  assert.match(html, /open on this Mac only \(localhost\)/i, 'the live links say they are Mac-only');
  assert.match(html, /phone check needed/);
  for (const v of ['Side by side', 'Slider', 'Blink', 'Accept', 'Reject', 'Request change']) assert.ok(html.includes(`'${v}'`), v);
});

test('console-notify: waitingView carries the waiting proposals; a new proposal notifies once (--notify), never reminds', async () => {
  const N = await import('../../tools/lib/console-notify.mjs');
  const S = await import('../../tools/lib/console-server.mjs');
  const v = N.waitingView([], { remindMin: 3 });
  assert.equal(v.count, 0, 'proposals do not count as steps');
  assert.equal(v.proposals.count, P.listProposals({ waiting: true }).length);
  assert.ok(v.proposals.items.every((x) => /^PR-\d{3}$/.test(x.id) && x.yourTurn === true));
  assert.deepEqual(N.notificationText({ id: 'PR-004', title: `Glow ${LAN}` }, 'proposal'), { title: 'Console: new proposal', body: 'PR-004: Glow <link>' });
  const fired = [];
  const feed = S.createFeed({ intervalMs: 20, heartbeatMs: 100000, remindMin: 0.0001, notify: (s, k) => fired.push(`${k} ${s.id}`) });
  try {
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(fired, [], 'what is there at start is not announced');
    const { proposal: p } = await P.postProposal({ by: 'de-n', raw: sample(), baseDir: dir });
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(fired, [`proposal ${p.id}`]);
  } finally { feed.close(); }
});

// ---- I-084 (user T-038): the decision box says who receives the decision -----------------------------------------

/** proposals-page.html's decisionBlock and renderList on a tiny fake DOM (the page's own script; fetch never answers). */
function proposalsPage() {
  class N {
    constructor(tag, text) { this.tagName = tag; this.children = []; this.listeners = {}; this._t = text ?? ''; this.attrs = {}; this.className = ''; this.style = {}; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...c) { this._t = ''; this.children = c; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  }
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const ids = {};
  const document = { getElementById: (i) => (ids[i] ||= new N('div')), createElement: (t) => new N(t), createTextNode: (t) => new N('#text', t), querySelector: () => null };
  const api = new Function('window', 'document', 'location', 'fetch', 'setInterval', `${js}\nreturn { decisionBlock: decisionBlock, renderList: renderList };`)(
    { addEventListener() {} }, document, { hash: '' }, () => new Promise(() => {}), () => 0);
  return { ...api, ids };
}
const toLines = (n) => n.all().filter((x) => x.attrs['data-to'] === '1').map((x) => x.textContent);

test('I-084 proposals: publicView and the page list carry `to` (the author, then the lead); the decision box names them; fallback "lead"', async () => {
  const { proposal } = await P.postProposal({ by: 'de-hero', raw: sample(), baseDir: dir });
  const v = P.publicView(P.get(proposal.id));
  assert.deepEqual(v.to, ['de-hero', 'lead']);
  assert.deepEqual(P.pageProposals().find((x) => x.id === proposal.id).to, ['de-hero', 'lead']);
  assert.deepEqual(P.decisionRecipients({ by: 'someone@example.invalid' }), ['lead'], 'names only');
  assert.deepEqual(P.decisionRecipients({ by: 'lead' }), ['lead'], 'no repeat');
  const page = proposalsPage();
  assert.deepEqual(toLines(page.decisionBlock(v)), ['Your decision goes to: de-hero, lead'], 'before the decision, under the buttons');
  const decided = P.publicView(await P.decide(proposal.id, { value: 'accept', notes: 'fine', rev: v.rev }));
  assert.deepEqual(toLines(page.decisionBlock(decided)), ['Your decision went to: de-hero, lead'], 'after it: the confirmation names them');
  const legacy = { ...v }; delete legacy.to;
  assert.deepEqual(toLines(page.decisionBlock(legacy)), ['Your decision goes to: lead'], 'a view without `to` never shows a blank');
  page.renderList(P.pageProposals());
  const row = page.ids.list.all().find((x) => x.className === 'm' && x.textContent.startsWith(proposal.id));
  assert.match(row.textContent, / · to: de-hero, lead$/);
});
