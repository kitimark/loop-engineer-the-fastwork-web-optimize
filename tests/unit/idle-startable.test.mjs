// Incident I-182 (user T-159 #6/#7; rule and brief by mgmt-devices): 2026-10-04 20:41Z the iPhone stood free 15+ min
// while P-117, signed to run next, waited only on two Mac-side pre-checks; `idle.mjs check` said "OK iphone: free, no
// ready work" because nothing was queued or marked waiting on the phone. Ready work for the iPhone now also counts:
//   (a) a status row that marks startable phone work: --phone-next <ticket> with --phone-needs none, or with the
//       pre-check it still waits on and --arm-neutral (a pre-check that can change the arms is a real precondition);
//   (b) an open console step for the phone that has not begun (nobody is on it), by someone else than the holder;
//   (c) the unmarked fallback: an active row whose `next` names the phone, only after the phone has been idle for
//       twice the limit (10 min), so a normal "Simulator first" does not alarm early.
// Excluded as before: rows waiting on the user, an incident or the lead (a decision), or on a thermal gate; the
// holder's own rows and steps and rows waiting on the holder (I-189). T0's Mac-wait and in-hold rules are unchanged.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const D = await import('../../tools/lib/idle.mjs');
const S = await import('../../tools/lib/status.mjs');

beforeEach(() => { process.env.FW_STATE_DIR = tempDir('fw-idle-startable-'); });

const T0 = Date.parse('2026-10-04T20:41:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const free = (queue = []) => ({ resource: 'iphone', holder: null, stale: null, queue });
const rel = { owner: 'iphone-runner', token: 'L1', at: at(0) };
const grant = { token: 'L1', at: at(-30) };
const row = (id, owner, extra = {}) => ({ id, owner, state: 'measuring', ...extra });
const p117 = row('phone-queue', 'iphone-runner', { state: 'coordinating', phoneNext: { what: 'P-117', needs: 'Chrome counts, Simulator parity', armNeutral: true } });
const freeA = (min, o = {}) => D.assess('iphone', { st: free(o.queue), rel, grant, rows: o.rows || [], steps: o.steps || [], min: 5, now: T0 + min * 60000 + 1 });
const ids = (a) => a.rows.map((x) => x.id);

test('I-182 (a): a row with startable phone work (--phone-next, needs none or arm-neutral) is ready work; a real precondition is not', () => {
  const a = freeA(6, { rows: [p117] });
  assert.deepEqual([a.alarm, ids(a)], [true, ['phone-queue']]);
  assert.equal(a.rows[0].why, 'startable: P-117, waits only on Chrome counts, Simulator parity (arm-neutral)');
  assert.match(D.lineFor(a), /^IDLE iphone: iPhone free for 6 min .*, over the 5 min limit, while work waits: phone-queue \(owner iphone-runner; startable: P-117, waits only on Chrome counts, Simulator parity \(arm-neutral\)\)$/);
  assert.deepEqual(D.addressees(a), ['iphone-runner']);
  // no pre-check left
  assert.equal(freeA(6, { rows: [row('t', 'fix-a', { phoneNext: { what: 'P-120', needs: null, armNeutral: false } })] }).rows[0].why, 'startable: P-120');
  // a pre-check that can change the arms (not arm-neutral) is a real precondition: not startable, no alarm
  const real = freeA(30, { rows: [row('t', 'fix-a', { phoneNext: { what: 'P-120', needs: 'arms change', armNeutral: false } })] });
  assert.deepEqual([real.alarm, ids(real)], [false, []]);
  // under the limit: no alarm yet, but listed
  const under = freeA(4, { rows: [p117] });
  assert.deepEqual([under.alarm, ids(under)], [false, ['phone-queue']]);
});

test('I-182 (a) exclusions: waits on the user, an incident, the lead or a thermal gate; finished or parked rows', () => {
  const mk = (extra) => row('t', 'fix-a', { phoneNext: { what: 'P-120', needs: null, armNeutral: false }, ...extra });
  for (const w of [{ kind: 'user', text: 'C-045' }, { kind: 'incident', target: 'I-180' }, { kind: 'lead', text: 'sign P-120' }, { kind: 'other', text: 'thermal gate: cooling to 38' }, { kind: 'other', text: 'phone-temp below auto' }]) {
    assert.deepEqual(ids(freeA(30, { rows: [mk({ state: 'waiting', waitingOn: w })] })), [], JSON.stringify(w));
  }
  for (const state of ['parked', 'done', 'landed', 'dropped', 'closed-no-fix']) assert.deepEqual(ids(freeA(30, { rows: [mk({ state })] })), [], state);
  // waiting on Chrome (a Mac pre-check) does not block a startable mark
  assert.deepEqual(ids(freeA(30, { rows: [mk({ state: 'waiting', waitingOn: { kind: 'chrome' } })] })), ['t']);
  // a queued owner is listed once, as queued
  const q = freeA(6, { rows: [p117], queue: [{ owner: 'iphone-runner' }] });
  assert.deepEqual([q.queue, ids(q)], [[{ owner: 'iphone-runner' }], []]);
});

test('I-182 (a) held lease: the holder\'s own startable row is not a waiter (I-189); someone else\'s is', () => {
  const lease = { resource: 'iphone', owner: 'iphone-runner', kind: 'lease', token: 'L2', acquiredAt: at(0), expiresAt: at(90), meta: {} };
  const held = (rows) => D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: [] }, rows, min: 5, now: T0 + 7 * 60000 });
  assert.equal(held([p117]).alarm, false);
  const other = held([row('dd', 'fix-double-drive', { phoneNext: { what: 'P-119', needs: null } })]);
  assert.deepEqual([other.alarm, other.heldIdle, ids(other)], [true, true, ['dd']]);
  // T0 unchanged: the holder queued for its Mac hold under the limit is still OK
  const cm = { resource: 'chrome-measure', holder: { owner: 'x', kind: 'lease' }, stale: null, queue: [{ owner: 'iphone-runner', since: at(4) }] };
  const t0 = D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: [] }, cm, rows: [row('dd', 'fix-double-drive', { phoneNext: { what: 'P-119', needs: null } })], min: 5, now: T0 + 7 * 60000 });
  assert.deepEqual([t0.alarm, t0.macWait.min], [false, 3]);
});

test('I-182 (b): an open phone step that has not begun is ready work; one the user is on, or the holder\'s own, is not', () => {
  const step = (o = {}) => ({ id: 'C-050', by: 'fix-pill-swap', kind: 'swipe-pair', status: 'pending', cur: 0, parts: [{ state: 'waiting' }, { state: 'waiting' }], ...o });
  const a = freeA(6, { steps: [step()] });
  assert.deepEqual([a.alarm, ids(a)], [true, ['C-050']]);
  assert.equal(a.rows[0].why, 'its console step for the phone is posted, not started');
  assert.match(D.threadFor(a).text, /Console steps for the phone: C-050 \(owner fix-pill-swap; its console step for the phone is posted, not started\)\./);
  assert.deepEqual(D.addressees(a), ['fix-pill-swap']);
  assert.deepEqual(ids(freeA(6, { steps: [step({ status: 'active', parts: [{ state: 'started' }, { state: 'waiting' }] })] })), [], 'the user is on it');
  assert.deepEqual(ids(freeA(6, { steps: [step({ parts: [{ state: 'ready' }, { state: 'waiting' }] })] })), [], 'its runner prepared a part: on the phone');
  assert.deepEqual(ids(freeA(6, { steps: [step({ status: 'answered' })] })), [], 'closed');
  assert.deepEqual(ids(freeA(6, { steps: [step({ kind: 'action', parts: [{ state: 'waiting' }] })] })), [], 'no phone step');
  const lease = { resource: 'iphone', owner: 'fix-pill-swap', kind: 'lease', token: 'L3', acquiredAt: at(0), expiresAt: at(90), meta: {} };
  assert.equal(D.assess('iphone', { st: { resource: 'iphone', holder: lease, stale: null, queue: [] }, steps: [step()], min: 5, now: T0 + 7 * 60000 }).alarm, false, 'the holder\'s own step');
});

test('I-182 (c): unmarked fallback, a row whose next names the phone, counts only after twice the limit', () => {
  const r = row('pill', 'fix-pill-swap', { state: 'testing', next: 'Simulator, then the iPhone no-worse check' });
  const early = freeA(9, { rows: [r] });
  assert.deepEqual([early.alarm, ids(early)], [false, []]);
  assert.equal(D.lineFor(early), `OK iphone: free for 9 min (since 20:41Z, released by iphone-runner), no ready work`);
  const late = freeA(10, { rows: [r] });
  assert.deepEqual([late.alarm, ids(late)], [true, ['pill']]);
  assert.equal(late.rows[0].why, 'its next step names the phone (unmarked)');
  // not in an active state, waiting on the user/incident/lead/thermal, or with a phone mark that is not startable: no
  for (const x of [{ state: 'parked' }, { state: 'designing' }, { state: 'waiting', waitingOn: { kind: 'user', text: 'C-045' } }, { state: 'waiting', waitingOn: { kind: 'lead' } },
    { state: 'waiting', waitingOn: { kind: 'other', text: 'cooling, then the phone' } }, { phoneNext: { what: 'P-121', needs: 'arms change', armNeutral: false } }]) {
    assert.deepEqual(ids(freeA(30, { rows: [{ ...r, ...x }] })), [], JSON.stringify(x));
  }
  // a waiting row that already names the phone in its wait is listed once, by the old rule
  const w = freeA(30, { rows: [{ ...r, state: 'waiting', waitingOn: { kind: 'phone' } }] });
  assert.deepEqual(w.rows.map((x) => x.why), ['waits on the phone']);
});

test('I-182 status: --phone-next / --phone-needs / --arm-neutral are stored, amended, cleared, and shown on the board', async () => {
  await S.set('phone-queue', { by: 'iphone-runner', kind: 'phone', title: 'Phone queue', state: 'coordinating', note: 'next block', phoneNext: 'P-117', phoneNeeds: 'Chrome counts', armNeutral: true });
  let it = S.get('phone-queue');
  assert.deepEqual({ ...it.phoneNext, at: undefined }, { what: 'P-117', needs: 'Chrome counts', armNeutral: true, at: undefined });
  // amend the needs only; the mark stays arm-neutral
  await S.set('phone-queue', { by: 'iphone-runner', phoneNeeds: 'none' });
  it = S.get('phone-queue');
  assert.deepEqual([it.phoneNext.what, it.phoneNext.needs, it.phoneNext.armNeutral], ['P-117', null, true]);
  // a new --phone-next replaces the mark (needs and arm-neutral from this call)
  await S.set('phone-queue', { by: 'iphone-runner', phoneNext: 'P-118', phoneNeeds: 'review' });
  it = S.get('phone-queue');
  assert.deepEqual([it.phoneNext.what, it.phoneNext.needs, it.phoneNext.armNeutral], ['P-118', 'review', false]);
  // the board: a phoneNext field on the row's view and one text line; a row without a mark shows neither
  const view = S.buildStatusView({ items: [it, { ...it, id: 'plain', phoneNext: undefined }], progress: [] });
  const v = view.items.find((x) => x.id === 'phone-queue');
  assert.deepEqual(v.phoneNext, { what: 'P-118', needs: 'review', armNeutral: false, startable: false });
  assert.match(S.itemText(v), /\n {6}phone next: P-118 \(waits on review, which may change the arms: not startable yet\)(\n|$)/);
  const plain = view.items.find((x) => x.id === 'plain');
  assert.equal(plain.phoneNext, null);
  assert.doesNotMatch(S.itemText(plain), /phone next/);
  await S.set('phone-queue', { by: 'iphone-runner', armNeutral: true });
  assert.match(S.itemText(S.buildStatusView({ items: [S.get('phone-queue')], progress: [] }).items[0]), /phone next: P-118 \(waits only on review, arm-neutral: startable\)/);
  await S.set('phone-queue', { by: 'iphone-runner', phoneNext: 'none' });
  assert.equal(S.get('phone-queue').phoneNext, undefined);
  await assert.rejects(S.set('phone-queue', { by: 'iphone-runner', phoneNeeds: 'x' }), /--phone-needs and --arm-neutral go with a --phone-next mark/);
  await assert.rejects(S.set('phone-queue', { by: 'iphone-runner', phoneNext: 'see https://x.y/z' }), /URL|address|path/i);
});
