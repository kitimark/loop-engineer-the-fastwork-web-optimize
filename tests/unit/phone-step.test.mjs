// tools/lib/phone-step.mjs and its users in-process (incident I-123, user T-078): a console step on the iPhone and the
// iphone lease. C-037 (2026-10-04): the user pressed Start over at 06:17:59Z, the runner's lease ran out at 06:27:44Z
// in the middle of the step, and the lock handed the phone to the next waiter. Each part of the fix has its own test:
// (a) lease grace, (c) stuck steps, (d) runner guard, (f) post guard. Own $FW_STATE_DIR per test; .invalid hosts only.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const P = await import('../../tools/lib/phone-step.mjs');
const C = await import('../../tools/lib/console.mjs');
const L = await import('../../tools/lib/lock.mjs');
let state;
beforeEach(() => { state = tempDir('fw-phonestep-'); process.env.FW_STATE_DIR = state; });

const A = 'http://page-a.invalid:5401/', B = 'http://page-b.invalid:5402/';
const pair = (by = 'fix-nav-morph') => C.post({ by, kind: 'swipe-pair', title: 'Pair', url: A, url2: B });
const holderFile = () => join(state, 'locks', 'iphone.json');
/** The holder's lease ran out `agoSec` ago (the lock code's own clock is the wall clock). */
function expire(agoSec) {
  const h = JSON.parse(readFileSync(holderFile(), 'utf8'));
  h.expiresAt = new Date(Date.now() - agoSec * 1000).toISOString();
  writeFileSync(holderFile(), JSON.stringify(h));
  return h;
}

test('I-123 phone steps: swipe-pair, a recorded part, or --phone; on the phone once begun and while open', async () => {
  assert.equal(P.isPhoneStep(C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', url: A, url2: B })), true);
  assert.equal(P.isPhoneStep(C.buildStep({ by: 'a', kind: 'action', title: 't', record: true })), true);
  assert.equal(P.isPhoneStep(C.buildStep({ by: 'a', kind: 'action', title: 't', phone: true })), true);
  assert.equal(P.isPhoneStep(C.buildStep({ by: 'a', kind: 'action', title: 't', url: A })), false, 'an unrecorded action is not one');
  assert.equal(P.isPhoneStep(C.buildStep({ by: 'a', kind: 'question', title: 't' })), false);
  const s = await pair();
  assert.equal(P.onPhone(C.get(s.id)), false, 'posted, nothing begun yet');
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'loading' });
  assert.equal(P.onPhone(C.get(s.id)), true, 'the runner prepares part 1');
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'ready' });
  await C.start(s.id, { part: 1 });
  await C.restart(s.id);
  assert.equal(P.onPhone(C.get(s.id)), true, 'a Start over keeps it active, every part waiting');
  await C.skip(s.id);
  assert.equal(P.onPhone(C.get(s.id)), false, 'skipped: over');
});

// ---- (a) lease grace ------------------------------------------------------------------------------------------

test('I-123 a: an iphone lease that runs out during its owner\'s user step is not handed over (up to 10 min past expiry), and says so', async () => {
  assert.equal(P.LEASE_STEP_GRACE_SEC, 600);
  assert.equal((await L.tryAcquire('iphone', { owner: 'fix-nav-morph', kind: 'lease', ttlSec: 900 })).ok, true);
  const s = await pair();
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'ready' });
  await C.start(s.id, { part: 1 });
  await C.restart(s.id); // 06:17:59Z
  const h = expire(5); // 06:27:44Z: the lease ran out
  const st = L.status('iphone');
  assert.equal(st.stale, null, 'not stale: the user is in the step');
  assert.deepEqual(st.grace, { step: s.id, expiredAt: h.expiresAt, until: new Date(Date.parse(h.expiresAt) + 600000).toISOString() });
  assert.match(P.graceText(st.grace), /^lease ran out at .*; kept for its owner's step C-001 on the phone until .* \(I-123\)$/);
  const b = await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 900 });
  assert.equal(b.ok, false, 'the next waiter waits');
  assert.equal(b.holder.owner, 'fix-nav-morph');
  await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 900 }); // polls again: logged once
  const log = readFileSync(L.stepGraceLogFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((x) => [x.resource, x.owner, x.step, x.seenBy]), [['iphone', 'fix-nav-morph', s.id, 'iphone-runner']]);
  assert.equal(JSON.parse(readFileSync(holderFile(), 'utf8')).stepGrace.step, s.id);
  // the owner renews as usual (the lease is live)
  const r = await L.renew('iphone', { owner: 'fix-nav-morph', ttlSec: 300 });
  assert.ok(Date.parse(r.expiresAt) > Date.now());
  // the step ends: an expired lease goes at once
  expire(5);
  await C.skip(s.id);
  assert.match(L.status('iphone').stale, /^expired at /);
  const c = await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 900 });
  assert.deepEqual([c.ok, c.holder.owner], [true, 'iphone-runner']);
});

test('I-123 a: the grace has a hard bound (10 min past expiry), needs the OWNER\'s step, and never applies to chrome-measure', async () => {
  await L.tryAcquire('iphone', { owner: 'fix-nav-morph', kind: 'lease', ttlSec: 900 });
  const s = await pair();
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'loading' });
  expire(601);
  assert.match(L.status('iphone').stale, /^expired at /, 'past the hard bound');
  assert.equal(L.status('iphone').grace, undefined);
  const now = Date.now();
  const lease = (owner, resource = 'iphone') => ({ resource, owner, kind: 'lease', expiresAt: new Date(now - 1000).toISOString() });
  assert.equal(P.stepGrace(lease('someone-else'), now), null, 'another agent\'s step keeps no lease');
  assert.equal(P.stepGrace(lease('fix-nav-morph', 'chrome-measure'), now), null);
  assert.equal(P.stepGrace({ ...lease('fix-nav-morph'), short: true }, now), null, 'a short lease ends at its bound');
  assert.equal(P.stepGrace({ ...lease('fix-nav-morph'), kind: 'process', pid: 1 }, now), null);
  assert.equal(P.stepGrace({ ...lease('fix-nav-morph'), expiresAt: new Date(now + 1000).toISOString() }, now), null, 'live: no grace needed');
  assert.equal(P.stepGrace(lease('fix-nav-morph'), now).step, s.id);
});

// ---- (c) stuck steps ------------------------------------------------------------------------------------------

test('I-128: two changes in the same millisecond are two episodes (the key names the change by its place in the history, not by its time)', async () => {
  const s = await pair();
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'ready' });
  await C.start(s.id, { part: 1 });
  await C.restart(s.id, { by: 'user' });
  const a = C.get(s.id);
  const at = a.history.at(-1).at;
  // the runner acks "loading" in the same ms as the Start over (a fast runner, or a coarse clock): still waiting on it
  const b = { ...a, history: [...a.history, { at, who: 'fix-nav-morph', action: 'ack', part: 1, state: 'loading' }], parts: a.parts.map((p, i) => (i === 0 ? { ...p, state: 'loading' } : p)) };
  const now = Date.parse(at) + 10 * 60000;
  const [x] = P.stuckSteps({ steps: [a], now });
  const [y] = P.stuckSteps({ steps: [b], now });
  assert.ok(x && y, 'both wait on the runner');
  assert.notEqual(y.key, x.key, 'a new change is a new episode, even in the same ms');
  assert.equal(P.stuckSteps({ steps: [a], now })[0].key, x.key, 'the same step state keeps its key');
});

test('I-123 c: a step that waits on its runner (gated part not ready, recorded part without "recording") for more than 2 min is stuck', async () => {
  assert.equal(P.STUCK_STEP_MIN, 2);
  const s = await pair();
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'ready' });
  assert.deepEqual(P.stuckSteps({ now: Date.now() + 3600e3 }), [], 'pending: the user has not started anything');
  await C.start(s.id, { part: 1 });
  let t = Date.parse(C.get(s.id).updatedAt);
  assert.deepEqual(P.stuckSteps({ now: t + 120000 }), [], 'exactly 2 min: not yet');
  let [x] = P.stuckSteps({ now: t + 121000 });
  assert.deepEqual([x.id, x.by, x.part, x.attempt, x.minutes, x.after], [s.id, 'fix-nav-morph', 1, 1, 2, 'the user\'s Start']);
  assert.match(x.why, /has not acked recording/);
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'recording' });
  assert.deepEqual(P.stuckSteps({ now: Date.now() + 3600e3 }), [], 'recording: the user\'s turn');
  await C.restart(s.id);
  t = Date.parse(C.get(s.id).updatedAt);
  [x] = P.stuckSteps({ now: t + 10 * 60000 }); // C-037: "Getting page 1 ready" for 10 min
  assert.deepEqual([x.part, x.attempt, x.minutes, x.after], [1, 2, 10, 'the user\'s Start over']);
  assert.match(x.why, /^gated, waiting: Start stays off until fix-nav-morph acks ready$/);
  const key = x.key;
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'loading', message: 'waiting for the phone' });
  t = Date.parse(C.get(s.id).updatedAt);
  assert.deepEqual(P.stuckSteps({ now: t + 60000 }), [], 'a runner ack starts the clock again');
  [x] = P.stuckSteps({ now: t + 180000 });
  assert.notEqual(x.key, key, 'a new episode');
  assert.equal(x.after, 'fix-nav-morph\'s last ack');
  const u = await C.post({ by: 'r', kind: 'action', title: 'ungated' });
  await C.start(u.id, { part: 1 });
  assert.equal(P.stuckSteps({ now: Date.now() + 3600e3 }).some((y) => y.id === u.id), false, 'the user\'s Done: not the runner\'s');
});

// ---- (d) runner guard ---------------------------------------------------------------------------------------------

test('I-123 d: the runner guard refuses while another owner\'s step is on the phone; its own step, or --ignore-step, passes', async () => {
  assert.equal(P.runnerRefusal({ owner: 'iphone-runner' }), null);
  const s = await pair();
  assert.equal(P.runnerRefusal({ owner: 'iphone-runner' }), null, 'posted, not begun: no one is on the phone yet');
  await C.ack(s.id, { by: 'fix-nav-morph', part: 1, state: 'ready' });
  await C.start(s.id, { part: 1 });
  await C.restart(s.id);
  const why = P.runnerRefusal({ owner: 'iphone-runner' });
  assert.match(why, /^WAIT: the user's step C-001 by fix-nav-morph \(active, part 1\/2 waiting\) is on the iPhone/);
  assert.match(why, /node tools\/console\.mjs wait C-001 --until answered/);
  assert.match(why, /--ignore-step C-001$/);
  assert.equal(P.runnerRefusal({ owner: 'fix-nav-morph' }), null, 'the step\'s own runner');
  for (const ig of ['C-001', 'c-1', '1']) assert.equal(P.runnerRefusal({ owner: 'iphone-runner', ignore: ig }), null, ig);
  assert.match(P.runnerRefusal({ owner: 'iphone-runner', ignore: 'C-002' }), /C-001/);
  await C.cancel(s.id, { by: 'fix-nav-morph' });
  assert.equal(P.runnerRefusal({ owner: 'iphone-runner' }), null);
});

// ---- (f) post guard -----------------------------------------------------------------------------------------------

test('I-123 f: posting a phone step needs the poster\'s iphone lease and no other open phone step; the lead is exempt', async () => {
  const step = (by, extra = {}) => C.buildStep({ by, kind: 'swipe-pair', title: 't', url: A, url2: B, ...extra });
  const q = C.buildStep({ by: 'fix-x', kind: 'question', title: 'q' });
  assert.equal(P.postRefusal({ step: q, by: 'fix-x', lease: L.status('iphone') }), null, 'not a phone step');
  assert.match(P.postRefusal({ step: step('fix-x'), by: 'fix-x', lease: L.status('iphone') }), /needs your iphone lease first: you \("fix-x"\) don't hold it\. Run: node tools\/lock\.mjs acquire iphone --owner fix-x/);
  assert.equal(P.postRefusal({ step: step('lead'), by: 'lead', lease: L.status('iphone') }), null, 'the lead');
  await L.tryAcquire('iphone', { owner: 'iphone-runner', kind: 'lease', ttlSec: 900 });
  assert.match(P.postRefusal({ step: step('fix-x'), by: 'fix-x', lease: L.status('iphone') }), /\(holder: "iphone-runner"\)/);
  assert.equal(P.postRefusal({ step: step('iphone-runner'), by: 'iphone-runner', lease: L.status('iphone') }), null);
  const a = await C.post({ by: 'lead', kind: 'action', title: 'Finger scroll', record: true });
  const why = P.postRefusal({ step: step('iphone-runner'), by: 'iphone-runner', lease: L.status('iphone') });
  assert.match(why, /^another phone step is open: C-001 by lead \(pending, part 1\/1 waiting\)\. One phone step at a time/);
  assert.equal(P.postRefusal({ step: q, by: 'iphone-runner', lease: L.status('iphone') }), null, 'a question still posts');
  await C.cancel(a.id, { by: 'lead' });
  assert.equal(P.postRefusal({ step: step('iphone-runner'), by: 'iphone-runner', lease: L.status('iphone') }), null);
  assert.equal(existsSync(join(state, 'console')), true);
});

test('I-140 d: the stuck thread starts with a plain line for the user (what is going on, Skip / not now) and names the ack with the CURRENT attempt', async () => {
  const SA = await import('../../tools/lib/step-alarm.mjs');
  const base = { id: 'C-045', by: 'iphone-runner', part: 3, attempt: 2, minutes: 3, after: 'iphone-runner\'s redo', since: Date.parse('2026-10-04T12:44:40Z') };
  const g = SA.stuckThread({ ...base, why: 'gated, waiting: Start stays off until iphone-runner acks ready' }, { steward: { agent: 'mgmt-devices' } });
  const lines = g.text.split('\n');
  assert.match(lines[0], /^For you: you did nothing wrong\. The Start button of C-045 part 3 stays grey until iphone-runner gets the phone ready, and iphone-runner has not reacted for 3 min; it has been told\. If you don't want to wait, press "Skip \/ not now"/);
  assert.match(g.text, /node tools\/console\.mjs ack C-045 --by iphone-runner --part 3 --attempt 2 --state loading\|ready\|recording/);
  assert.match(g.text, /STALE-ATTEMPT refusal changes nothing \(I-140\)/);
  assert.match(g.text, /^Steward \(mgmt-devices\): nudge iphone-runner by message/m, 'I-175: the steward, not the desk or the runner');
  const r = SA.stuckThread({ ...base, attempt: 1, why: 'recorded, started: iphone-runner has not acked recording' });
  assert.match(r.text.split('\n')[0], /C-045 part 3 says "don't swipe yet" until iphone-runner starts its recording/);
  assert.doesNotMatch(r.text, /https?:|\.invalid|\d+\.\d+\.\d+\.\d+/, 'no URL or address (Hard rule 12)');
});
