// Proposal holds and stale decisions (ts-proposal-hold, user T-030, 2026-10-03). PR-008 was posted, a review found
// errors in its card, the lead asked the user in a thread not to decide, and the user accepted it on the Proposals page
// six minutes later: nothing on the page said it was under revision. Then `revise` refused an accepted proposal ("post a
// new proposal instead"), so the decision kept resting on the incomplete card. Now: `hold`/`unhold` (the page shows the
// note and disables the decision; decide and undo refuse), a hold on a decided proposal puts the decision under review,
// and a revision of a decided proposal makes the decision stale (re-decide on the new revision) unless --keep-decision.
// decisionState: final | under-review | stale; `wait --until decided` is met only by a final decision.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

let P, dir;

before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-hold-');
  P = await import('../../tools/lib/proposal.mjs');
  dir = tempDir('fw-proposal-hold-src-');
  mkdirSync(join(dir, 'shots'), { recursive: true });
  writePng(join(dir, 'shots', 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'shots', 'b-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
});

const sample = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'Strip the countdown layers', area: 'hero',
  problem: 'The countdown repaints 40 layers per tick.', idea: 'One strip, moved by transform.',
  looksSame: 'Same digits, same timing.', visualDiff: ['Nothing visible at 1x.'],
  gain: [{ what: 'Layers repainted per tick', before: '40', after: '1', tag: 'OBSERVED', how: 'Chrome layer tree, 3 runs' }],
  risk: 'A font change needs a new strip.',
  compare: { a: { label: 'Original' }, b: { label: 'Strip' }, shots: [{ caption: 'Top', a: 'shots/a-0.png', b: 'shots/b-0.png' }] },
  ...over,
});
const post = async (by) => (await P.postProposal({ by, raw: sample(), baseDir: dir })).proposal;
const tick = () => new Promise((r) => setTimeout(r, 3));
const evKey = (e) => [e.event, e.value, e.was];

test('hold on a waiting proposal: decide and undo refuse, the page and the badge show it, unhold opens it again', async () => {
  const p = await post('fix-hold-a');
  await assert.rejects(P.holdProposal(p.id, { by: 'lead' }), /--note/);
  await assert.rejects(P.holdProposal(p.id, { note: 'x' }), /--by/);
  const h = await P.holdProposal(p.id, { by: 'lead', note: 'Errors in the card (control rate); being revised. See 192.168.77.12' });
  assert.equal(h.state, 'proposed', 'a hold keeps the state');
  assert.deepEqual([h.hold.by, h.hold.rev], ['lead', 1]);
  assert.ok(!h.hold.note.includes('192.168'), 'the hold note is scrubbed (Hard rule 12)');
  assert.equal(h.history.at(-1).action, 'held');
  assert.equal(P.decisionStateOf(h), null, 'no decision: no decision state');
  await assert.rejects(P.decide(p.id, { value: 'accept', rev: 1 }), new RegExp(`${p.id} is on hold \\(lead: Errors in the card`));
  await assert.rejects(P.decide(p.id, { value: 'accept' }), /on hold/, 'the CLI path (no rev) refuses too');
  // the user's page and the badge
  assert.ok(!P.waitingProposals().some((x) => x.id === p.id), 'not counted as waiting for the user');
  assert.ok(!P.listProposals({ waiting: true }).some((x) => x.id === p.id), 'list --waiting leaves it out');
  const row = P.pageProposals().find((x) => x.id === p.id);
  assert.deepEqual([row.hold.by, row.hold.note.slice(0, 18)], ['lead', 'Errors in the card']);
  const v = P.publicView(P.get(p.id));
  assert.equal(v.hold.by, 'lead');
  assert.match(v.hold.note, /^Errors in the card/);
  assert.match(P.line(P.get(p.id)), /\[proposed rev 1, on hold\].* ON HOLD \(lead\): Errors in the card/);
  assert.match(P.showText(P.get(p.id)), /^ {2}ON HOLD by lead since \S+: Errors in the card/m);
  const w = P.waitCondition(p.id);
  const c = w.check();
  assert.equal(c.met, false);
  assert.match(c.state, /^proposed, rev 1, on hold \(lead: Errors in the card/);
  // a second hold replaces the note; unhold
  const h2 = await P.holdProposal(p.id, { by: 'lead', note: 'still being checked' });
  assert.equal(h2.hold.note, 'still being checked');
  const u = await P.unholdProposal(p.id, { by: 'lead' });
  assert.equal(u.hold, undefined);
  assert.equal(u.history.at(-1).action, 'unheld');
  await assert.rejects(P.unholdProposal(p.id, { by: 'lead' }), /is not on hold/);
  assert.ok(P.waitingProposals().some((x) => x.id === p.id), 'waiting for the user again');
  assert.equal((await P.decide(p.id, { value: 'accept', rev: 1 })).state, 'accepted');
  assert.equal(P.decisionStateOf(P.get(p.id)), 'final');
  // drafts and withdrawn proposals are not on the page: nothing to hold
  const { proposal: d } = await P.postProposal({ by: 'fix-hold-a', raw: { title: 'Draft', area: 'end' }, draft: true });
  await assert.rejects(P.holdProposal(d.id, { by: 'lead', note: 'x' }), /draft/);
});

test('hold on a decided proposal: the decision is kept but under review; waits ignore it until it is final again', async () => {
  const p = await post('fix-hold-b');
  await P.decide(p.id, { value: 'accept', rev: 1, notes: 'looks right' });
  const acceptAt = P.get(p.id).decision.at;
  const plain = P.waitCondition(p.id);
  assert.equal(plain.check().met, true, 'never held: met at once, as before');
  assert.equal(P.decisionStateOf(P.get(p.id)), 'final');
  await tick();
  const h = await P.holdProposal(p.id, { by: 'lead', note: 'the card missed a difference' });
  assert.deepEqual([h.state, h.decision.value], ['accepted', 'accepted'], 'the decision is kept');
  assert.equal(P.decisionStateOf(h), 'under-review');
  assert.equal(P.publicView(h).decisionState, 'under-review');
  assert.equal(P.pageProposals().find((x) => x.id === p.id).decisionState, 'under-review');
  assert.match(P.line(h), /-> accepted \(under review: not final\)/);
  // waits: plain decided is not met by an under-review decision; changed reports the hold as an event
  const r = plain.check();
  assert.equal(r.met, false);
  assert.match(r.state, /^accepted, rev 1, on hold \(lead: the card missed a difference\), decision under review/);
  const ch = P.waitCondition(p.id, { until: 'changed', since: acceptAt }).check();
  assert.equal(ch.met, true);
  const cd = JSON.parse(ch.detail);
  assert.equal(cd.decisionState, 'under-review');
  assert.deepEqual(cd.events.map(evKey), [['held', 'under-review', 'accepted']]);
  assert.equal(cd.events[0].notes, 'the card missed a difference');
  assert.match(P.proposalNewsText(cd.events[0]), new RegExp(`^PROPOSAL ${p.id} on hold, decision accepted under review \\(not final\\) by lead at \\S+: the card missed a difference`));
  const anyW = P.waitAnyCondition({ by: 'fix-hold-b', since: acceptAt }).check();
  assert.equal(anyW.met, true);
  assert.deepEqual(JSON.parse(anyW.detail).decisions, [], 'an under-review decision is not a standing (final) one');
  // the user cannot undo or re-decide while it is held
  await assert.rejects(P.undoDecision(p.id, { rev: 1 }), /on hold/);
  // unhold without a revision: the same decision is final again; decided --since the acceptance wakes on that
  const since = P.get(p.id).history.at(-1).at;
  await tick();
  const u = await P.unholdProposal(p.id, { by: 'lead', note: 'checked: the card was right after all' });
  assert.equal(P.decisionStateOf(u), 'final');
  assert.equal(plain.check().met, true);
  const again = P.waitCondition(p.id, { until: 'decided', since }).check();
  assert.equal(again.met, true, 'final again after the hold: a wait armed during the hold wakes');
  assert.deepEqual(JSON.parse(again.detail).events.map(evKey), [['unheld', 'accepted', 'under-review']]);
  assert.match(P.proposalNewsText(JSON.parse(again.detail).events[0]), new RegExp(`^PROPOSAL ${p.id} hold released, decision accepted final again by lead at \\S+: checked`));
});

test('revise of a decided proposal: the decision goes stale (kept in history), the user re-decides on the new revision', async () => {
  await P.initProposalMark('lead');
  const p = await post('fix-hold-c');
  await P.decide(p.id, { value: 'accept', rev: 1 });
  const acceptAt = P.get(p.id).decision.at;
  await tick();
  const r = (await P.reviseProposal(p.id, { by: 'fix-hold-c', note: 'control rate corrected; one more difference', raw: sample({ visualDiff: ['Nothing visible at 1x.', 'The colon blinks 1 frame later.'] }), baseDir: dir })).proposal;
  assert.deepEqual([r.state, r.rev, r.decision], ['proposed', 2, null], 'waiting for the user again, no standing decision');
  assert.equal(P.decisionStateOf(r), 'stale');
  assert.deepEqual([r.staleDecision.value, r.staleDecision.rev, r.staleDecision.staleOnRev], ['accepted', 1, 2]);
  assert.equal(r.decisions.length, 1, 'kept in the history');
  assert.equal(r.decisions[0].staleOnRev, 2);
  assert.deepEqual(r.history.slice(-2).map((h) => h.action), ['revised', 'decision-stale']);
  const v = P.publicView(r);
  assert.equal(v.decisionState, 'stale');
  assert.deepEqual([v.staleDecision.value, v.staleDecision.rev], ['accepted', 1]);
  assert.match(P.line(r), /\[proposed rev 2\].* -> stale: accepted on rev 1, re-decide on rev 2/);
  assert.ok(P.waitingProposals().some((x) => x.id === p.id), 'the badge asks for a new decision');
  // waits: decided is not met by the stale decision; changed reports the stale event
  const plain = P.waitCondition(p.id);
  const pc = plain.check();
  assert.equal(pc.met, false);
  assert.match(pc.state, /^proposed, rev 2, decision accepted on rev 1 is stale: re-decide on rev 2/);
  const ch = JSON.parse(P.waitCondition(p.id, { until: 'changed', since: acceptAt }).check().detail);
  assert.deepEqual(ch.events.map(evKey), [['stale', 'proposed', 'accepted']]);
  assert.equal(ch.events[0].rev, 2);
  assert.match(P.proposalNewsText(ch.events[0]), new RegExp(`^PROPOSAL ${p.id} decision stale \\(was accepted on rev 1\\): re-decide on rev 2, revised by fix-hold-c at \\S+: control rate corrected`));
  // the lead's thread wait (read marks) wakes on the stale event and on the re-decision
  const news1 = P.proposalNews('lead', { all: true }).filter((e) => e.id === p.id);
  assert.deepEqual(news1.map((e) => e.event), ['decided', 'stale']);
  await P.commitProposalNews('lead', P.proposalNews('lead', { all: true }));
  await assert.rejects(P.decide(p.id, { value: 'accept', rev: 1 }), /was revised \(now revision 2, you saw 1\)/);
  const d = await P.decide(p.id, { value: 'accept', rev: 2, notes: 'still yes' });
  assert.equal(P.decisionStateOf(d), 'final');
  assert.equal(d.staleDecision, undefined);
  assert.deepEqual(d.decisions.map((x) => [x.value, x.rev, x.staleOnRev ?? null]), [['accepted', 1, 2], ['accepted', 2, null]]);
  const m = plain.check();
  assert.equal(m.met, true);
  assert.deepEqual([JSON.parse(m.detail).rev, P.decisionStateOf(P.get(p.id))], [2, 'final']);
  assert.equal(P.waitCondition(p.id, { until: 'decided', since: acceptAt }).check().met, true);
  const news2 = P.proposalNews('lead', { all: true }).filter((e) => e.id === p.id);
  assert.deepEqual(news2.map((e) => [e.event, e.value, e.was, e.rev]), [['decided', 'accepted', 'accepted', 2]], 'the re-decision, once');
  // a rejected proposal goes stale the same way
  const q = await post('fix-hold-c');
  await P.decide(q.id, { value: 'reject' });
  const rq = (await P.reviseProposal(q.id, { by: 'fix-hold-c', note: 'new approach' })).proposal;
  assert.deepEqual([rq.state, P.decisionStateOf(rq), rq.staleDecision.value], ['proposed', 'stale', 'rejected']);
});

test('revise --keep-decision: a pure wording fix keeps the decision final; refused where there is nothing to keep', async () => {
  const p = await post('fix-hold-d');
  await P.decide(p.id, { value: 'accept', rev: 1 });
  const acceptAt = P.get(p.id).decision.at;
  await tick();
  const r = (await P.reviseProposal(p.id, { by: 'fix-hold-d', note: 'typo in the risk', raw: sample({ risk: 'A font change needs a new strip image.' }), baseDir: dir, keepDecision: true })).proposal;
  assert.deepEqual([r.state, r.rev, r.decision.value, r.decision.rev, r.decision.keptThrough], ['accepted', 2, 'accepted', 1, 2]);
  assert.equal(P.decisionStateOf(r), 'final');
  assert.equal(r.history.at(-1).keptDecision, 'accepted');
  assert.equal(P.waitCondition(p.id, { until: 'changed', since: acceptAt }).check().met, false, 'no decision event');
  assert.equal((await P.undoDecision(p.id, { rev: 2 })).state, 'proposed', 'the page (showing rev 2) can still change it');
  const q = await post('fix-hold-d');
  await assert.rejects(P.reviseProposal(q.id, { by: 'fix-hold-d', note: 'x', keepDecision: true }), /--keep-decision: .* no decision to keep/);
  await P.decide(q.id, { value: 'change', notes: 'brighter' });
  await assert.rejects(P.reviseProposal(q.id, { by: 'fix-hold-d', note: 'x', keepDecision: true }), /--keep-decision: .* a revision answers the change request/);
  // changes-requested -> revise is the normal answer: proposed, no stale decision (as before)
  const rq = (await P.reviseProposal(q.id, { by: 'fix-hold-d', note: 'brighter now' })).proposal;
  assert.deepEqual([rq.state, rq.decision, rq.staleDecision, P.decisionStateOf(rq)], ['proposed', null, undefined, null]);
});

test('PR-008 scenario: accepted, then held (under review), revised while held (stale, still held), revise --unhold; the user re-decides', async () => {
  const p = await post('fix-cd-strip-x');
  await P.decide(p.id, { value: 'accept', rev: 1 });
  await P.holdProposal(p.id, { by: 'lead', note: 'review found errors in the card; please wait for revision 2' });
  const plain = P.waitCondition(p.id);
  assert.equal(plain.check().met, false);
  const r = (await P.reviseProposal(p.id, { by: 'fix-cd-strip-x', note: 'corrected control rate', raw: sample({ problem: 'Corrected: 38 layers.' }), baseDir: dir })).proposal;
  assert.deepEqual([r.state, r.rev, P.decisionStateOf(r), r.hold?.by], ['proposed', 2, 'stale', 'lead'], 'a revise alone keeps the hold');
  await assert.rejects(P.decide(p.id, { value: 'accept', rev: 2 }), /on hold/);
  const r2 = (await P.reviseProposal(p.id, { by: 'fix-cd-strip-x', note: 'second check: one more fact', unhold: true })).proposal;
  assert.deepEqual([r2.rev, r2.hold, P.decisionStateOf(r2), r2.staleDecision.rev], [3, undefined, 'stale', 1]);
  assert.deepEqual(r2.history.slice(-2).map((h) => h.action), ['revised', 'unheld']);
  assert.equal(plain.check().met, false, 'still not decided: the user has not re-decided');
  await P.decide(p.id, { value: 'accept', rev: 3 });
  assert.equal(plain.check().met, true);
  // --publish lifts a hold too (and still publishes a draft)
  const q = await post('fix-cd-strip-x');
  await P.holdProposal(q.id, { by: 'fix-cd-strip-x', note: 'checking' });
  const rq = (await P.reviseProposal(q.id, { by: 'fix-cd-strip-x', note: 'checked', publish: true })).proposal;
  assert.deepEqual([rq.state, rq.hold], ['proposed', undefined]);
  // a held proposal may be withdrawn
  const w = await post('fix-cd-strip-x');
  await P.holdProposal(w.id, { by: 'lead', note: 'x' });
  assert.equal((await P.withdrawProposal(w.id, { by: 'fix-cd-strip-x' })).state, 'withdrawn');
});

test('proposals-page.html: a hold banner with the note, disabled decision controls, the stale and under-review texts', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  for (const s of ['holdBanner', 'staleBanner', "'On hold'", 'under review', 'Please decide again', 'class: \'holdbanner\'']) assert.ok(html.includes(s), s);
  assert.match(html, /disabled: held/, 'the decision buttons are disabled while held');
  assert.match(html, /on hold\|revised/, 'a refused decision (held or revised meanwhile) reloads the proposal');
});
