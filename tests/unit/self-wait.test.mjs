// I-165: `lock.mjs wait iphone --until mine --for N` kept waiting N s after the lease was already the caller's
// (fix-hero-exit-threaded idled the iPhone 18:28-18:37Z, 2026-10-04). lib/wait.mjs lockHoldSec drops --for on a hold of
// your own; lib/idle.mjs flags a lease holder whose only process on the lease is a wait on it (STUCK).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const W = await import('../../tools/lib/wait.mjs');
const D = await import('../../tools/lib/idle.mjs');

test('I-165 lockHoldSec: --for is dropped (with a note) on --until mine / held-by:<--owner>; kept for every other condition', () => {
  const mine = W.lockHoldSec(W.parseLockCondition('mine', 'fix-h'), 120, 'fix-h');
  assert.equal(mine.holdSec, 0);
  assert.match(mine.note, /^NOTE --for 120 is ignored with --until mine \(held-by:fix-h\): .* ends as soon as it is yours \(I-165\)\. For a quiet window use --until idle --for N\.$/);
  assert.equal(W.lockHoldSec(W.parseLockCondition('held-by:fix-h'), 60, 'fix-h').holdSec, 0);
  assert.deepEqual(W.lockHoldSec(W.parseLockCondition('held-by:other'), 60, 'fix-h'), { holdSec: 60, note: null }, 'someone else\'s hold: --for stays');
  assert.deepEqual(W.lockHoldSec(W.parseLockCondition('idle'), 120, 'fix-h'), { holdSec: 120, note: null });
  assert.deepEqual(W.lockHoldSec(W.parseLockCondition('released-by:fix-h'), 30, 'fix-h'), { holdSec: 30, note: null });
  assert.deepEqual(W.lockHoldSec(W.parseLockCondition('mine', 'fix-h'), 0, 'fix-h'), { holdSec: 0, note: null }, 'no --for: no note');
});

const T0 = Date.parse('2026-10-04T18:28:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const lease = { resource: 'iphone', owner: 'fix-h', kind: 'lease', token: 'L9', acquiredAt: at(0), expiresAt: at(15), meta: {} };
const wait = (extra = {}) => ({ schema: 'fw-waits/1', id: 'w', owner: 'fix-h', tool: 'lock.mjs wait', what: 'lock iphone held-by "fix-h", for 600 s', since: at(0), pid: 4242, ...extra });

test('I-165 idle: a lease holder whose only process on the lease is a wait on it is STUCK after 2 min, waiters or not', () => {
  const A = (now, o = {}) => D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: o.queue ?? [] }, waits: o.waits ?? [wait()], min: 5, now });
  const early = A(T0 + 2 * 60000);
  assert.deepEqual([early.alarm, early.stuck, early.selfWait.what], [false, undefined, 'lock iphone held-by "fix-h", for 600 s'], 'exactly 2 min is not more');
  const s = A(T0 + 2 * 60000 + 1);
  assert.deepEqual([s.alarm, s.stuck, s.heldIdle, s.ready], [true, true, true, false]);
  assert.match(D.lineFor(s), /^STUCK iphone: fix-h holds the iPhone lease but its only process on it is a wait \(lock iphone held-by "fix-h", for 600 s, for 2 min; no phone run since 18:28Z\): .* \(I-165\)$/);
  assert.match(D.threadFor(s).text, /Its only process on the lease is a wait on that same lease .* stop that wait \(I-165\)\./);
  assert.deepEqual(D.addressees(s), ['fix-h']);
  const q = A(T0 + 3 * 60000, { queue: [{ owner: 'fix-w' }] });
  assert.match(D.lineFor(q), /; waiting: fix-w \(queued for it\)$/);
  // not the holder's wait, another lock, another tool, or no wait: the plain held-idle rule (no alarm before 5 min without waiters)
  for (const w of [wait({ owner: 'fix-w' }), wait({ what: 'lock chrome-measure idle, for 120 s' }), wait({ tool: 'wait.mjs file' })]) {
    const x = A(T0 + 4 * 60000, { waits: [w] });
    assert.deepEqual([x.alarm, x.stuck, x.selfWait], [false, undefined, undefined]);
  }
  // a phone run since: the wait counts from the run's end (lastRunAt)
  const ran = D.assess('iphone', { st: { resource: 'iphone', holder: { ...lease, lastRunAt: at(3) }, stale: null, queue: [] }, waits: [wait()], min: 5, now: T0 + 4 * 60000 });
  assert.equal(ran.alarm, false);
  // a live phone run: in use, never stuck
  const live = D.assess('iphone', { st: { resource: 'iphone', holder: { ...lease, meta: { run: { text: 'x', since: at(1), pid: process.pid } } }, stale: null, queue: [] }, waits: [wait()], min: 5, now: T0 + 9 * 60000 });
  assert.deepEqual([live.alarm, live.runLive], [false, true]);
  assert.deepEqual(D.selfWait('fix-h', [wait({ since: at(1) }), wait({ since: at(0), pid: 7 })]), { what: 'lock iphone held-by "fix-h", for 600 s', since: T0, pid: 7 }, 'the oldest');
});

// Lead review of 10-04's idle alarms (I-165 batch): 79 of 204 idle minutes were the holder waiting for the user's Start.
test('I-165 idle: the holder\'s own open step with its current part loading or ready, before the user\'s Start, is a user wait (OK, no alarm), STUCK self-wait or not', () => {
  const st = (s) => ({ id: 'C-038', by: 'fix-h', kind: 'swipe-pair', status: 'pending', cur: 0, parts: [{ state: 'loading', gate: true, record: true }, { state: 'waiting', gate: true, record: true }], ...s });
  const A = (steps, waits = []) => D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: [{ owner: 'fix-w' }] }, steps, waits, min: 5, now: T0 + 30 * 60000 });
  const cases = [st({}), st({ kind: 'action', parts: [{ state: 'ready', gate: true }] }), st({ status: 'active', cur: 1, parts: [{ state: 'done' }, { state: 'loading', gate: true }] })];
  for (const s of cases) {
    const a = A([s], [wait()]);
    assert.deepEqual([a.held, a.heldIdle, a.alarm, a.freeMin, a.stuck], [true, false, false, 0, undefined], JSON.stringify(s));
    assert.match(D.lineFor(a), /^OK iphone: held by fix-h; (its step C-038 by fix-h \((pending|active), part \d\/\d (loading|ready)\) waits for the user's Start \(a user wait, not idle; I-165\)|the user's step C-038 .* is on the phone \(a user wait, not idle\))$/);
  }
  assert.match(D.lineFor(A([st({})])), /waits for the user's Start \(a user wait, not idle; I-165\)$/, 'a pending step loading its first part: the new rule');
  // still idle: the part not prepared yet, the user already past Start on a non-phone step, another owner's step, closed
  for (const s of [st({ parts: [{ state: 'waiting', gate: true }] }), st({ kind: 'action', status: 'active', parts: [{ state: 'started' }] }),
    st({ by: 'fix-w' }), st({ status: 'answered' }), st({ status: 'skipped' })]) {
    const a = A([s]);
    assert.deepEqual([a.heldIdle, a.alarm], [true, true], JSON.stringify(s));
  }
  assert.equal(D.awaitsStart(st({ cur: 2 })), false, 'past the last part');
});

test('I-165 STUCK reaches its holder: the NOTIFY line, the episode reason and the red /status alert name the wait', async () => {
  const { tempDir } = await import('../helpers.mjs');
  const S = await import('../../tools/lib/status.mjs');
  process.env.FW_STATE_DIR = tempDir('fw-selfwait-');
  const now = T0 + 3 * 60000;
  const a = D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: [] }, waits: [wait()], min: 5, now });
  assert.equal(a.stuck, true);
  assert.equal(D.notifyLine(a, 'fix-h'), 'NOTIFY fix-h: you hold the iPhone lease and your only process on it is a wait on it (lock iphone held-by "fix-h", for 600 s, for 3 min): end that wait and run your phone part, or release the lease (I-165)');
  const r = await D.record([a], { now });
  assert.equal(r[0].news, 'alarm');
  assert.equal(D.readState().resources.iphone.episode.why, 'stuck');
  const al = D.boardAlerts({ now });
  assert.deepEqual(al.map((x) => [x.kind, x.holder, x.why, x.owners.join(',')]), [['held', 'fix-h', 'stuck', 'fix-h']]);
  assert.match(S.boardAlertText(al[0], 'fix-h', now), /^idle alarm: you hold the iPhone lease and your only process on it is a wait on it \(lock\.mjs wait\), no phone run for 3 min: end that wait .* \(I-165\)$/);
  // the plain held-idle NOTIFY lines are unchanged (I-155)
  const p = { ...a, stuck: undefined, selfWait: undefined, freeMin: 6 };
  assert.equal(D.notifyLine(p, 'fix-h'), 'NOTIFY fix-h: you hold the iPhone lease with no phone run for 6 min while others wait (status board alert; I-155)');
  assert.equal(D.notifyLine(p, 'fix-w'), 'NOTIFY fix-w: iPhone held by fix-h unused for 6 min while you wait (status board alert; I-155)');
  // the wait ends, a waiter queues and the 5-min rule alarms: the reason goes back to plain held-idle
  const b = D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: [{ owner: 'fix-w' }] }, waits: [], min: 5, now: T0 + 6 * 60000 });
  await D.record([b], { now: T0 + 6 * 60000 });
  assert.equal(D.readState().resources.iphone.episode.why, undefined);
});
