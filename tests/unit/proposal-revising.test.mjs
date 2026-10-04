// Proposal "revising" mark and overdue alarm (incident I-177, user T-154 #7/#9, 2026-10-04). After the user asked for a
// change, the Proposals page kept showing that decision until rev N+1 was posted: no sign of work, no expected time,
// no alarm (PR-018: 2 h 8 min; PR-021: 30+ min). Now `proposal revising <id> --by <author|lead> --note … [--eta …]`
// stores a progress mark (only while changes-requested) that the page, list and show carry; without a mark the page says
// "not started yet by <author>"; revise, a new decision (undo) and withdraw clear it; `proposal overdue` (pure function
// in tools/lib/proposal-overdue.mjs) lists change requests with no mark after 15 min or a passed eta, exit 3.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

let P, C, O, T, dir;

before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-revising-');
  process.env.FW_PROPOSAL_PHONE = 'off';
  P = await import('../../tools/lib/proposal.mjs');
  C = await import('../../tools/lib/proposal-cli.mjs');
  O = await import('../../tools/lib/proposal-overdue.mjs');
  T = await import('../../tools/lib/console-threads.mjs');
  dir = tempDir('fw-proposal-revising-src-');
  mkdirSync(join(dir, 'shots'), { recursive: true });
  writePng(join(dir, 'shots', 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'shots', 'b-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
});

const sample = () => ({
  schema: 'fw-proposal/1', title: 'Strip the countdown layers', area: 'hero',
  problem: 'The countdown repaints 40 layers per tick.', idea: 'One strip, moved by transform.',
  looksSame: 'Same digits, same timing.', visualDiff: ['Nothing visible at 1x.'],
  gain: [{ what: 'Layers repainted per tick', before: '40', after: '1', better: 'better', tag: 'OBSERVED', how: 'Chrome layer tree, 3 runs' }],
  risk: 'A font change needs a new strip.',
  live: { none: 'Test fixture: no page to try.' },
  compare: { a: { label: 'Original' }, b: { label: 'Strip' }, shots: [{ caption: 'Top', a: 'shots/a-0.png', b: 'shots/b-0.png' }] },
});
const post = async (by) => (await P.postProposal({ by, raw: sample(), baseDir: dir })).proposal;
const changeRequested = async (by) => {
  const p = await post(by);
  await P.decide(p.id, { value: 'change', notes: 'Make the strip one row', rev: 1 });
  return P.get(p.id);
};
const at = (iso, min) => Date.parse(iso) + min * 60000;
/** Run the CLI, capturing stdout / stderr. */
async function cli(argv, deps = {}) {
  const out = [], err = [];
  const [lo, le] = [console.log, console.error];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  try { const code = await C.run(argv, deps); return { code, out: out.join('\n'), err: err.join('\n') }; } finally { console.log = lo; console.error = le; }
}

test('revising: only while changes-requested, by the author or the lead; note required and scrubbed; eta ISO or +Nm', async () => {
  const w = await post('fix-rev-a');
  await assert.rejects(P.markRevising(w.id, { by: 'fix-rev-a', note: 'started' }), /is proposed, not changes-requested/);
  const p = await changeRequested('fix-rev-a');
  await assert.rejects(P.markRevising(p.id, { by: 'fix-rev-a' }), /--note/);
  await assert.rejects(P.markRevising(p.id, { note: 'x' }), /--by/);
  await assert.rejects(P.markRevising(p.id, { by: 'fix-other', note: 'x' }), /only its author \(fix-rev-a\) or the lead/);
  const now = Date.now();
  await assert.rejects(P.markRevising(p.id, { by: 'fix-rev-a', note: 'x', eta: 'soon', now }), /--eta must be an ISO time or \+N(m|h)/);
  await assert.rejects(P.markRevising(p.id, { by: 'fix-rev-a', note: 'x', eta: new Date(now - 10 * 60000).toISOString(), now }), /in the past/);
  const m = await P.markRevising(p.id, { by: 'fix-rev-a', note: 'Rebuilding the strip; see 192.168.77.12', eta: '+30m', now });
  assert.equal(m.state, 'changes-requested', 'the state stays');
  assert.deepEqual([m.revising.by, m.revising.rev, m.revising.decisionAt], ['fix-rev-a', 1, m.decision.at]);
  assert.ok(!m.revising.note.includes('192.168'), 'the note is scrubbed (Hard rule 12)');
  assert.equal(Date.parse(m.revising.eta), now + 30 * 60000);
  assert.equal(m.history.at(-1).action, 'revising');
  assert.equal(m.history.at(-1).eta, m.revising.eta);
  // again: the latest replaces the mark, the history keeps both; the lead may mark too; +Nh works
  const m2 = await P.markRevising(p.id, { by: 'lead', note: 'Waiting on a phone check', eta: '+2h', now });
  assert.deepEqual([m2.revising.by, m2.revising.note], ['lead', 'Waiting on a phone check']);
  assert.equal(Date.parse(m2.revising.eta), now + 2 * 3600000);
  assert.equal(m2.history.filter((h) => h.action === 'revising').length, 2);
  const m3 = await P.markRevising(p.id, { by: 'fix-rev-a', note: 'No eta yet' });
  assert.equal(m3.revising.eta, undefined, 'no --eta: no eta');
  // an ISO eta is stored as given (normalized)
  const iso = new Date(now + 45 * 60000).toISOString();
  assert.equal((await P.markRevising(p.id, { by: 'fix-rev-a', note: 'x', eta: iso, now })).revising.eta, iso);
});

test('revising: revise, an undo and withdraw clear the mark; a revise logs it', async () => {
  const p = await changeRequested('fix-rev-b');
  await P.markRevising(p.id, { by: 'fix-rev-b', note: 'Working on it', eta: '+20m' });
  const r = (await P.reviseProposal(p.id, { by: 'fix-rev-b', note: 'One row now' })).proposal;
  assert.equal(r.revising, undefined, 'revise clears it');
  assert.equal(r.state, 'proposed');
  await assert.rejects(P.markRevising(p.id, { by: 'fix-rev-b', note: 'x' }), /not changes-requested/);
  // undo of the change request (the user changes the decision)
  await P.decide(p.id, { value: 'change', notes: 'Another change', rev: 2 });
  await P.markRevising(p.id, { by: 'fix-rev-b', note: 'Working on it' });
  const u = await P.undoDecision(p.id, { rev: 2 });
  assert.equal(u.revising, undefined, 'a changed decision clears it');
  // withdraw
  await P.decide(p.id, { value: 'change', notes: 'Third', rev: 2 });
  await P.markRevising(p.id, { by: 'lead', note: 'Working on it' });
  const w = await P.withdrawProposal(p.id, { by: 'fix-rev-b' });
  assert.equal(w.revising, undefined, 'withdraw clears it');
});

test('list, show, --json and the page views carry the mark; a change request without one says whose turn it is', async () => {
  const p = await changeRequested('fix-rev-c');
  const now = at(p.decision.at, 25);
  // no mark yet
  assert.match(P.line(P.get(p.id), now), /\[changes-requested rev 1\].* REV 2 NOT STARTED \(fix-rev-c\), 25 min since the change request$/);
  assert.match(P.showText(P.get(p.id), now), /^ {2}REV 2 NOT STARTED by fix-rev-c: 25 min since the change request at \S+$/m);
  assert.deepEqual(P.revisionStateOf(P.get(p.id)), { state: 'not-started', nextRev: 2, by: 'fix-rev-c', decidedAt: p.decision.at });
  assert.equal(P.withDecisionState(P.get(p.id)).revisionState.state, 'not-started');
  // a mark
  await P.markRevising(p.id, { by: 'fix-rev-c', note: 'Rebuilding the strip', eta: new Date(at(p.decision.at, 60)).toISOString() });
  const q = P.get(p.id);
  assert.match(P.line(q, now), / REVISING rev 2 \(fix-rev-c\) since \d\d:\d\dZ, eta \d\d:\d\dZ: Rebuilding the strip$/);
  assert.match(P.showText(q, now), /^ {2}REVISING rev 2 by fix-rev-c since \S+, eta \S+ \(25 min since the change request\): Rebuilding the strip$/m);
  assert.match(P.showText(q, now), /^ {4}\S+ fix-rev-c revising rev 1 \(eta \S+\): Rebuilding the strip$/m);
  const j = P.withDecisionState(q);
  assert.equal(j.revising.note, 'Rebuilding the strip');
  assert.equal(j.revisionState.state, 'in-progress');
  const v = P.publicView(q);
  assert.deepEqual(Object.keys(v.revising).sort(), ['at', 'by', 'decisionAt', 'eta', 'note', 'rev']);
  const row = P.pageProposals().find((x) => x.id === p.id);
  assert.equal(row.revising.note, 'Rebuilding the strip');
  // the CLI: list and show, text and --json
  let r = await cli(['list']);
  assert.match(r.out, new RegExp(`${p.id} .* REVISING rev 2 \\(fix-rev-c\\)`));
  r = await cli(['list', '--json']);
  assert.equal(JSON.parse(r.out).find((x) => x.id === p.id).revising.note, 'Rebuilding the strip');
  r = await cli(['show', p.id, '--json']);
  assert.equal(JSON.parse(r.out).revisionState.state, 'in-progress');
  // a proposal that is not a change request: no revising keys on the page (served as before)
  const plain = await post('fix-rev-c');
  assert.ok(!('revising' in P.publicView(P.get(plain.id))));
  assert.ok(!('revising' in P.pageProposals().find((x) => x.id === plain.id)));
  assert.equal(P.revisionStateOf(P.get(plain.id)), null);
  assert.doesNotMatch(P.line(P.get(plain.id)), /REVISING|NOT STARTED/);
});

test('CLI revising: prints the mark, lints the note (answer format), refuses outside a change request', async () => {
  const p = await changeRequested('fix-rev-d');
  let r = await cli(['revising', p.id, '--by', 'fix-rev-d', '--note', 'Rebuilding the strip, then a phone check', '--eta', '+40m']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`^REVISING ${p.id} rev 2 by fix-rev-d: Rebuilding the strip, then a phone check \\(expected by \\d\\d:\\d\\dZ\\)`, 'm'));
  assert.match(r.out, /the Proposals page shows it on top of the proposal/);
  // an unexplained id in the note: refused, nothing stored
  r = await cli(['revising', p.id, '--by', 'fix-rev-d', '--note', 'Waiting on T-123']);
  assert.equal(r.code, 1);
  assert.match(r.err, /FORMAT REFUSED proposal revising/);
  assert.equal(P.get(p.id).revising.note, 'Rebuilding the strip, then a phone check');
  r = await cli(['revising', p.id, '--by', 'fix-rev-d', '--note', 'Waiting on T-123', '--check-format']);
  assert.equal(r.code, 1);
  assert.match(r.out, /FORMAT FAIL/);
  // --force-format posts anyway (logged)
  r = await cli(['revising', p.id, '--by', 'fix-rev-d', '--note', 'Waiting on T-123', '--force-format', 'thread id the user knows']);
  assert.equal(r.code, 0, r.err);
  const w = await post('fix-rev-d');
  await assert.rejects(cli(['revising', w.id, '--by', 'fix-rev-d', '--note', 'x']), /not changes-requested/);
});

test('overdueProposals: no mark after 15 min, or a passed eta; a mark without eta, or a fresh request, is not overdue', async () => {
  const p = await changeRequested('fix-rev-e');
  const d = p.decision.at;
  const only = (items, now, o) => O.overdueProposals(items, { now, ...o }).filter((x) => x.id === p.id);
  assert.deepEqual(only([P.get(p.id)], at(d, 14)), [], '14 min: not yet');
  let x = only([P.get(p.id)], at(d, 16));
  assert.equal(x.length, 1);
  assert.deepEqual([x[0].reason, x[0].by, x[0].minutes, x[0].nextRev, x[0].decidedAt], ['not-started', 'fix-rev-e', 16, 2, d]);
  assert.match(O.overdueLine(x[0]), new RegExp(`^OVERDUE ${p.id} rev 2 \\(fix-rev-e\\): not started 16 min after the change request at \\d\\d:\\d\\dZ \\(limit 15 min\\)$`));
  assert.deepEqual(only([P.get(p.id)], at(d, 16), { startMin: 30 }), [], '--start-min 30');
  // a mark without eta: not overdue
  await P.markRevising(p.id, { by: 'fix-rev-e', note: 'On it' });
  assert.deepEqual(only([P.get(p.id)], at(d, 120)), []);
  // a mark with an eta: overdue once the eta has passed
  await P.markRevising(p.id, { by: 'fix-rev-e', note: 'On it', eta: '+30m' });
  const eta = Date.parse(P.get(p.id).revising.eta);
  assert.deepEqual(only([P.get(p.id)], eta - 1000), []);
  x = only([P.get(p.id)], eta + 7 * 60000);
  assert.deepEqual([x[0].reason, x[0].minutes], ['eta-passed', 7]);
  assert.match(O.overdueLine(x[0]), /: expected by \d\d:\d\dZ, 7 min late \(revising since \d\d:\d\dZ: On it\)$/);
  // other states never
  const w = await post('fix-rev-e');
  assert.deepEqual(O.overdueProposals([P.get(w.id)], { now: Date.now() + 3600000 }), []);
  // keys: one per episode (decision, reason, mark)
  assert.notEqual(O.overdueProposals([P.get(p.id)], { now: eta + 60000 })[0].key, only([{ ...P.get(p.id), revising: undefined }], at(d, 16))[0].key);
});

test('CLI overdue: exit 3 and one line each when any is overdue, 0 otherwise; --json', async () => {
  // a fresh store view: only this test's proposals matter, so use a far clock and filter in the JSON
  const p = await changeRequested('fix-rev-f');
  let r = await cli(['overdue', '--json'], { now: at(p.decision.at, 1) });
  assert.equal(r.code === 0 || r.code === 3, true);
  assert.ok(!JSON.parse(r.out).overdue.some((x) => x.id === p.id), '1 min: not overdue');
  r = await cli(['overdue'], { now: at(p.decision.at, 20) });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, new RegExp(`^OVERDUE ${p.id} rev 2 \\(fix-rev-f\\): not started 20 min`, 'm'));
  r = await cli(['overdue', '--start-min', '25', '--json'], { now: at(p.decision.at, 20) });
  const j = JSON.parse(r.out);
  assert.equal(j.startMin, 25);
  assert.ok(!j.overdue.some((x) => x.id === p.id));
  await assert.rejects(cli(['overdue', '--start-min', 'x']), /--start-min must be minutes/);
});

test('overduePass: as the lead one thread per overdue proposal, assigned to the lead only; closed when the mark comes', async () => {
  const p = await changeRequested('fix-rev-g');
  const now = at(p.decision.at, 30);
  const mine = (x) => x.filter((l) => l.includes(p.id));
  let log = [];
  let r = await O.overduePass({ by: 'lead', log: (s) => log.push(s), now, quietOk: true });
  assert.ok(r.alarm);
  assert.match(mine(log).join('\n'), new RegExp(`^OVERDUE ${p.id} rev 2`, 'm'));
  const posted = mine(log).find((l) => l.startsWith('POSTED'));
  assert.ok(posted, log.join('\n'));
  const tid = posted.match(/^POSTED (T-\d+)/)[1];
  const t = T.getThread(tid);
  assert.deepEqual(t.assignees, ['lead'], 'the lead is the first tier; the author (a worker) is never an assignee');
  assert.match(t.messages[0].text, /fix-rev-g/);
  assert.match(t.messages[0].text, /proposal revising/);
  // the same episode again: no second post
  log = [];
  await O.overduePass({ by: 'lead', log: (s) => log.push(s), now: now + 60000, quietOk: true });
  assert.deepEqual(mine(log), []);
  // without --by lead: prints, never posts
  // the author marks revising: the episode ends and the lead's next pass closes the thread
  await P.markRevising(p.id, { by: 'fix-rev-g', note: 'On it' });
  log = [];
  await O.overduePass({ by: 'lead', log: (s) => log.push(s), now: now + 120000, quietOk: true });
  assert.match(mine(log).join('\n'), new RegExp(`^ENDED ${p.id}`, 'm'));
  assert.match(log.join('\n'), new RegExp(`^CLOSED ${tid}`, 'm'));
  assert.equal(T.getThread(tid).status, 'closed');
});

test('overduePass without --by lead prints and posts nothing', async () => {
  const p = await changeRequested('fix-rev-h');
  const log = [];
  const before = T.listThreads().length;
  const r = await O.overduePass({ by: undefined, log: (s) => log.push(s), now: at(p.decision.at, 40), quietOk: false });
  assert.ok(r.alarm);
  assert.match(log.join('\n'), new RegExp(`^NOT POSTED ${p.id}: posting needs --by lead`, 'm'));
  assert.equal(T.listThreads().length, before);
});

/** The page's script with a tiny DOM, as in proposal-gain-format.test.mjs. */
function page() {
  class N {
    constructor(tag, text) { this.tagName = tag; this.children = []; this._t = text ?? ''; this.attrs = {}; this.className = ''; this.style = {}; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener() {}
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...c) { this._t = ''; this.children = c; }
  }
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const document = { getElementById: () => new N('div'), createElement: (t) => new N(t), createTextNode: (t) => new N('#text', t), querySelector: () => null, querySelectorAll: () => [] };
  return new Function('window', 'document', 'location', 'fetch', 'setInterval', `${js}\nreturn { revisingBanner: revisingBanner, agoText: agoText };`)(
    { addEventListener() {} }, document, { hash: '' }, () => new Promise(() => {}), () => 0);
}

test('page: "Rev N+1 in progress" with the note, expected time and time since the decision; else "not started yet by <author>"', () => {
  const { revisingBanner, agoText } = page();
  const decidedAt = '2026-10-04T18:02:00.000Z', now = Date.parse('2026-10-04T18:40:00.000Z');
  const base = { id: 'PR-018', by: 'de-hero', rev: 6, state: 'changes-requested', decision: { value: 'changes-requested', at: decidedAt, rev: 6 } };
  const b = revisingBanner({ ...base, revising: { by: 'de-hero', note: 'Rebuilding the strip', at: '2026-10-04T18:10:00.000Z', eta: '2026-10-04T19:00:00.000Z', rev: 6, decisionAt: decidedAt } }, now);
  assert.equal(b.className, 'revbanner');
  assert.match(b.textContent, /Revision 7 in progress/);
  assert.match(b.textContent, /Rebuilding the strip/);
  assert.match(b.textContent, /expected by 2026-10-04 19:00Z/);
  assert.match(b.textContent, /You asked for a change 38 min ago/);
  const late = revisingBanner({ ...base, revising: { by: 'de-hero', note: 'x', at: decidedAt, eta: '2026-10-04T18:30:00.000Z', rev: 6, decisionAt: decidedAt } }, now);
  assert.match(late.textContent, /expected by 2026-10-04 18:30Z \(10 min late\)/);
  const none = revisingBanner(base, now);
  assert.equal(none.className, 'revbanner notstarted');
  assert.match(none.textContent, /Revision 7: not started yet by de-hero/);
  assert.match(none.textContent, /You asked for a change 38 min ago/);
  assert.equal(revisingBanner({ ...base, state: 'proposed', decision: null }, now), null);
  assert.equal(agoText(Date.parse(decidedAt), Date.parse(decidedAt) + 128 * 60000), '2 h 8 min');
  assert.equal(agoText(now, now + 20000), 'less than a minute');
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  assert.match(html, /revisingBanner\(p\)/, 'renderDetail shows it');
  assert.match(html, /data-since/, 'the time since the decision keeps counting');
});

test('proposal-cli header documents revising and overdue', () => {
  const src = readFileSync(new URL('../../tools/lib/proposal-cli.mjs', import.meta.url), 'utf8');
  const head = src.slice(0, src.indexOf('\nimport '));
  assert.match(head, /proposal revising <id> --by <author\|lead> --note/);
  assert.match(head, /proposal overdue \[--start-min 15\] \[--json\]/);
});
