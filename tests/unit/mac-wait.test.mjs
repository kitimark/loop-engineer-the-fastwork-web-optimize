// Phone hold v2, step T0 (research/architecture/phone-hold-v2.md §5; mgmt-devices): a phone holder only QUEUED for
// chrome-measure is not using the phone (the T-150 kind of wait: the phone held 5-14 min behind a Mac reader). It is a
// state of its own, `waits for its Mac hold`, with no IDLE before 5 min of that wait and a NOTIFY to the holder after
// it; HOLDING chrome-measure stays use (I-155).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from '../helpers.mjs';

const D = await import('../../tools/lib/idle.mjs');
const S = await import('../../tools/lib/status.mjs');

const T0 = Date.parse('2026-10-04T18:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const lease = { resource: 'iphone', owner: 'fix-h', kind: 'lease', token: 'L5', acquiredAt: at(0), expiresAt: at(60), meta: {} };
const phone = (queue = [{ owner: 'fix-w' }]) => ({ resource: 'iphone', holder: lease, stale: null, queue });
const mac = (queue, holder = { owner: 'reader-x', kind: 'lease' }) => ({ resource: 'chrome-measure', holder, stale: null, queue });
const A = (now, o = {}) => D.assess('iphone', { st: phone(o.queue), cm: o.cm, activity: o.activity ?? null, min: 5, now });

test('T0: holder queued for chrome-measure, no run: waits-for-Mac state, no IDLE before 5 min of that wait, an alarm after it', () => {
  const cm = mac([{ owner: 'fix-h', noTiming: true, since: at(10) }]);
  // the lease is 14 min old (past the 5-min held-idle limit), but the Mac wait is 4 min: no IDLE yet
  const a = A(T0 + 14 * 60000, { cm });
  assert.deepEqual([a.held, a.heldIdle, a.alarm, a.chromeUse, a.macWait], [true, true, false, undefined, { since: T0 + 10 * 60000, min: 4 }]);
  assert.equal(D.lineFor(a), 'OK iphone: fix-h waits for its Mac hold since 18:10Z (4 min; not use of the phone); waiting: fix-w (queued for it)');
  // exactly 5 min of Mac wait is not more; just past it alarms
  assert.equal(A(T0 + 15 * 60000, { cm }).alarm, false);
  const b = A(T0 + 15 * 60000 + 1, { cm });
  assert.equal(b.alarm, true);
  assert.equal(D.lineFor(b), 'IDLE iphone: iPhone held by fix-h, which has waited 5 min for its Mac hold (since 18:10Z; no phone run since 18:00Z), over the 5 min limit, while work waits: fix-w (queued for it)');
  assert.deepEqual(D.addressees(b), ['fix-h', 'fix-w']);
  assert.match(D.notifyLine(b, 'fix-h'), /^NOTIFY fix-h: you hold the iPhone lease while you wait for your Mac hold \(5 min\) and others wait for the phone: release it \(or queue with --not-ready\) until your Mac hold comes, or ask the lead \(status board alert; phone-hold v2 T0\)$/);
  assert.match(D.notifyLine(b, 'fix-w'), /^NOTIFY fix-w: iPhone held by fix-h unused for 15 min while you wait/);
  // nobody else waits for the phone: the wait costs no one, no alarm (as the held-idle rule)
  const c = A(T0 + 40 * 60000, { cm, queue: [] });
  assert.deepEqual([c.alarm, c.macWait.min], [false, 30]);
  assert.equal(D.lineFor(c), 'OK iphone: fix-h waits for its Mac hold since 18:10Z (30 min; not use of the phone)');
  // a not-ready Mac entry is no Mac wait: the plain held-idle rule
  const d = A(T0 + 14 * 60000, { cm: mac([{ owner: 'fix-h', notReady: true, since: at(10) }]) });
  assert.deepEqual([d.alarm, d.macWait], [true, undefined]);
});

test('T0: holding chrome-measure stays use (I-155); the Mac wait is no use sighting, so the held-idle clock does not restart', async () => {
  const holds = A(T0 + 30 * 60000, { cm: mac([], { owner: 'fix-h', kind: 'process', noTiming: true }) });
  assert.deepEqual([holds.alarm, holds.heldIdle, holds.chromeUse], [false, false, 'holds']);
  assert.match(D.lineFor(holds), /^OK iphone: held by fix-h, which holds the Chrome slot \(its phone-block hold\): in use, not idle \(I-155\)$/);
  process.env.FW_STATE_DIR = tempDir('fw-macwait-');
  const cm = mac([{ owner: 'fix-h', noTiming: true, since: at(8) }]);
  await D.record([A(T0 + 10 * 60000, { cm })], { now: T0 + 10 * 60000 });
  assert.equal(D.readState().resources.iphone?.activity ?? null, null, 'queued is not a sighting of use');
  const r = await D.record([A(T0 + 14 * 60000, { cm })], { now: T0 + 14 * 60000 });
  assert.equal(r[0].news, 'alarm');
  const ep = D.readState().resources.iphone.episode;
  assert.deepEqual([ep.kind, ep.holder, ep.why, ep.owners], ['held', 'fix-h', 'mac-wait', ['fix-h', 'fix-w']]);
  const al = D.boardAlerts({ now: T0 + 14 * 60000 });
  assert.equal(al[0].why, 'mac-wait');
  assert.match(S.boardAlertText(al[0], 'fix-h', T0 + 14 * 60000), /^idle alarm: you hold the iPhone lease while you wait for your Mac hold, and others wait for the phone: release it \(or queue with --not-ready\) until your Mac hold comes \(phone-hold v2 T0\)$/);
  assert.match(S.boardAlertText(al[0], 'fix-w', T0 + 14 * 60000), /^idle alarm: the iPhone lease of fix-h has had no phone run for 14 min while you wait/);
});
