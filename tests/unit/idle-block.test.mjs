// Incident I-189 (2026-10-04 22:34Z, user thread T-167): between H1 and H2 of the marked P-118 phone block the idle
// alarm said "iPhone held by iphone-runner, unused for 6 min while 1 job waits". Two gaps in tools/lib/idle.mjs:
//   (1) the lease holder of a marked block (I-160 `--block`) that is queued for its own next Mac hold is a Mac wait
//       inside the block, not an unused phone (that wait is the chrome-measure queue's business);
//   (2) the only "waiter" was a board row waiting on the holder itself (waiting-on agent:iphone-runner, its note named
//       the phone): a row that waits on the lease holder is no phone waiter.
// The old true alarms stay: an unmarked holder queued past 5 min (T0), an unused holder with a real waiter (I-111).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const D = await import('../../tools/lib/idle.mjs');

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-idle-block-'); });

const T0 = Date.parse('2026-10-04T22:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const lease = (meta = {}) => ({ resource: 'iphone', owner: 'iphone-runner', kind: 'lease', token: 'L9', acquiredAt: at(0), lastRunAt: at(27), expiresAt: at(90), meta });
const marked = (extra = {}) => lease({ block: { id: 'P-118', at: at(0) }, ...extra });
const phone = (h, queue = []) => ({ resource: 'iphone', holder: h, stale: null, queue });
const macQ = (queue) => ({ resource: 'chrome-measure', holder: { owner: 'lead', shared: true, readers: [{ owner: 'lead', since: at(30) }] }, stale: null, queue });
const queuedMac = macQ([{ owner: 'iphone-runner', noTiming: true, since: at(28) }]);
const row = (id, owner, extra = {}) => ({ id, owner, state: 'waiting', ...extra });
// the 22:34Z row: the lead's double-drive-fix, waiting on agent iphone-runner, its note names the phone
const ddRow = row('double-drive-fix', 'lead', { waitingOn: { kind: 'agent', target: 'iphone-runner' }, note: 'P-118 phone no-worse runs at Xcode Serious next' });
const A = (h, now, o = {}) => D.assess('iphone', { st: phone(h, o.queue), cm: o.cm ?? null, rows: o.rows || [], min: 5, now });

test('I-189 (2): a board row waiting on the lease holder (agent target, or its wait text names it) is no phone waiter', () => {
  const work = (rows) => D.readyWork('iphone', { st: phone(lease()), rows, exclude: 'iphone-runner' }).rows.map((x) => x.id);
  assert.deepEqual(work([ddRow]), [], 'waiting-on agent:<holder>');
  assert.deepEqual(work([row('t1', 'fix-a', { waitingOn: { kind: 'other', text: 'iphone-runner finishes the phone block' } })]), [], 'its wait text names the holder');
  assert.deepEqual(work([row('t2', 'fix-a', { waitingOn: { kind: 'agent', target: 'iphone-runner', text: 'phone runs' } })]), []);
  // a row waiting on someone else (or on the phone itself) still counts; a name that only contains the holder's does not
  assert.deepEqual(work([row('t3', 'fix-b', { waitingOn: { kind: 'agent', target: 'mgmt-devices' }, note: 'next on the phone' })]), ['t3']);
  assert.deepEqual(work([row('t4', 'fix-c', { waitingOn: { kind: 'phone' } })]), ['t4']);
  assert.deepEqual(work([row('t5', 'fix-d', { waitingOn: { kind: 'other', text: 'iphone-runner-2 then the phone' } })]), ['t5']);
  // without a holder (a free phone) nothing changes: the row waits on an agent that does not hold the phone
  assert.deepEqual(D.readyWork('iphone', { st: phone(null), rows: [ddRow] }).rows.map((x) => x.id), ['double-drive-fix']);
});

test('I-189 replay: 22:34Z, marked block P-118, the holder queued for its H2 Mac hold, only its own result row waits: no alarm', () => {
  const a = A(marked({ between: { at: at(28), until: at(40) } }), T0 + 34 * 60000 + 21000, { cm: queuedMac, rows: [ddRow] });
  assert.deepEqual([a.held, a.alarm, a.heldIdle, a.ready], [true, false, false, false]);
  assert.match(D.lineFor(a), /^OK iphone: held by iphone-runner, which waits for its next Mac hold inside phone block P-118 since 22:28Z \(6 min; a Mac wait inside the block, not idle; I-189\)$/);
});

test('I-189 (1): a block-marked holder queued for its next Mac hold is not idle, also with a real phone waiter', () => {
  const rows = [row('morph-gpu', 'fix-morph-gpu', { waitingOn: { kind: 'phone' } })];
  const a = A(marked(), T0 + 45 * 60000, { cm: queuedMac, queue: [{ owner: 'fix-w' }], rows });
  assert.deepEqual([a.alarm, a.heldIdle, a.ready, a.blockWait], [false, false, true, { block: 'P-118', since: T0 + 28 * 60000, min: 17 }]);
  assert.equal(D.lineFor(a), 'OK iphone: held by iphone-runner, which waits for its next Mac hold inside phone block P-118 since 22:28Z (17 min; a Mac wait inside the block, not idle; I-189); waiting: fix-w (queued for it), morph-gpu (owner fix-morph-gpu; waits on the phone)');
  // the same holder WITHOUT a block mark: T0's Mac-wait alarm stands (queued 17 min > 5, others wait)
  const t0 = A(lease(), T0 + 45 * 60000, { cm: queuedMac, queue: [{ owner: 'fix-w' }], rows });
  assert.deepEqual([t0.alarm, t0.heldIdle, t0.macWait.min], [true, true, 17]);
  // marked, but NOT queued for the Mac (nor holding it): unused past the limit with a real waiter alarms as before (I-111)
  const unused = A(marked(), T0 + 45 * 60000, { cm: macQ([]), queue: [{ owner: 'fix-w' }] });
  assert.deepEqual([unused.alarm, unused.heldIdle, unused.blockWait], [true, true, undefined]);
  // a not-ready Mac entry is no Mac wait inside the block either
  const nr = A(marked(), T0 + 45 * 60000, { cm: macQ([{ owner: 'iphone-runner', notReady: true, since: at(28) }]), queue: [{ owner: 'fix-w' }] });
  assert.equal(nr.alarm, true);
});

test('I-189 record: the Mac wait inside a block ends a held-idle episode and counts as a sighting of use', async () => {
  const q = [{ owner: 'fix-w' }];
  const r1 = await D.record([A(marked(), T0 + 33 * 60000 + 1, { cm: macQ([]), queue: q })], { now: T0 + 33 * 60000 + 1 });
  assert.equal(r1[0].news, 'alarm', 'unused 6 min, not queued for the Mac: alarm');
  const r2 = await D.record([A(marked(), T0 + 34 * 60000, { cm: queuedMac, queue: q })], { now: T0 + 34 * 60000 });
  assert.equal(r2[0].ended?.note, 'iphone-runner waits for its next Mac hold inside phone block P-118');
  assert.equal(D.readState().resources.iphone.episode, undefined);
  assert.deepEqual(D.readState().resources.iphone.activity, { token: 'L9', at: at(34) });
  // it leaves the queue without a hold: the held-idle clock runs from that last sighting
  const after = D.assess('iphone', { st: phone(marked(), q), cm: macQ([]), activity: D.readState().resources.iphone.activity, min: 5, now: T0 + 38 * 60000 });
  assert.deepEqual([after.alarm, after.since], [false, T0 + 34 * 60000]);
});

test('I-189: a STUCK holder (only a wait on its own lease) stays stuck inside a block', () => {
  const waits = [{ owner: 'iphone-runner', tool: 'lock.mjs wait', what: 'lock iphone until mine', since: at(28), pid: 1 }];
  const a = D.assess('iphone', { st: phone(marked()), cm: queuedMac, waits, min: 5, now: T0 + 40 * 60000 });
  assert.deepEqual([a.alarm, a.stuck], [true, true]);
});
