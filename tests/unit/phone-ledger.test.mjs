// Phone ledger (incident I-167, phone-hold v2 T1): tools/lib/phone-ledger.mjs splits one iphone hold into causes from
// synthetic holder / run / Mac / step / waiter marks, and tools/lib/lock.mjs writes one holds.log line at every iphone
// hold or lease end (release, a process hold's end, a stale lease cleared by the next acquirer). Every test uses its
// own $FW_STATE_DIR (never the live .git/fastwork-mirror/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir } from '../helpers.mjs';

const P = await import('../../tools/lib/phone-ledger.mjs');
const L = await import('../../tools/lib/lock.mjs');

let state;
beforeEach(() => { state = tempDir('fw-ledger-'); process.env.FW_STATE_DIR = state; });

const T0 = Date.parse('2026-10-04T10:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const holder = (extra = {}) => ({ resource: 'iphone', owner: 'fix-x', kind: 'lease', token: 'abcdefabcdef', acquiredAt: at(0), expiresAt: at(60), meta: {}, ...extra });
const ledgerLines = () => {
  const f = join(state, 'locks', 'holds.log');
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.resource === 'iphone') : [];
};
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

test('phoneLedger: a hold splits into run, cooling, Mac wait, Mac hold and idle (before / between / after the uses); waiters overlap', () => {
  const h = holder({
    uses: [{ k: 'run', from: at(5), to: at(10), pid: 1 }, { k: 'cooling', from: at(12), to: at(14), pid: 2 }],
    waiters: [[at(20), at(25)]],
  });
  const macLines = [
    { resource: 'chrome-measure', owner: 'fix-x', queuedAt: at(15), acquiredAt: at(16), endedAt: at(18) },
    { resource: 'chrome-measure', owner: 'someone-else', queuedAt: at(1), acquiredAt: at(2), endedAt: at(29) },
  ];
  // the waiter that has queued since 10:20 is still there at the end: its span reaches the end
  const queue = [{ owner: 'fix-y', since: at(20), lastSeen: at(29) }];
  const l = P.phoneLedger(h, { endedAt: at(30), how: 'release', queue, macLines });
  assert.equal(l.resource, 'iphone');
  assert.equal(l.ledger, 1);
  assert.equal(l.owner, 'fix-x');
  assert.equal(l.kind, 'lease');
  assert.equal(l.how, 'release');
  assert.equal(l.acquiredAt, at(0));
  assert.equal(l.endedAt, at(30));
  assert.equal(l.durationSec, 1800);
  assert.equal(l.runSec, 300);
  assert.equal(l.coolingSec, 120);
  assert.equal(l.macWaitSec, 60);
  assert.equal(l.macHoldSec, 120);
  assert.equal(l.userWaitSec, 0);
  assert.equal(l.idleSec, 1200);
  assert.equal(l.runSec + l.coolingSec + l.macWaitSec + l.macHoldSec + l.userWaitSec + l.idleSec, l.durationSec);
  assert.equal(l.idleBeforeSec, 300); // 10:00-10:05, H-early
  assert.equal(l.idleBetweenSec, 180); // 10:10-10:12 and 10:14-10:15, H-gap
  assert.equal(l.idleAfterSec, 720); // 10:18-10:30, H-done
  assert.equal(l.waitersPresentSec, 600);
  assert.equal(l.idleWaitersSec, 600);
  assert.equal(l.macWaitWaitersSec, 0);
});

test('phoneLedger: a run beats the user step it records, the step beats idle; a not-ready waiter is no waiter', () => {
  const h = holder({ uses: [{ k: 'run', from: at(4), to: at(6), pid: 1 }] });
  const steps = [
    { id: 'C-1', by: 'fix-x', status: 'answered', history: [{ at: at(1), action: 'posted' }, { at: at(2), action: 'ack', state: 'loading' }, { at: at(3), action: 'start' }, { at: at(8), action: 'answer' }] },
    { id: 'C-2', by: 'other', status: 'active', history: [{ at: at(0), action: 'start' }] },
  ];
  const l = P.phoneLedger(h, { endedAt: at(10), steps, queue: [{ owner: 'fix-y', since: at(0), lastSeen: at(9), notReady: true }] });
  assert.equal(l.runSec, 120);
  assert.equal(l.userWaitSec, 240); // 10:02-10:08 minus the run 10:04-10:06
  assert.equal(l.idleSec, 240); // 10:00-10:02 before, 10:08-10:10 after
  assert.equal(l.idleBeforeSec, 120);
  assert.equal(l.idleAfterSec, 120);
  assert.equal(l.waitersPresentSec, 0);
});

test('phoneLedger: the user\'s own hand test is user time; an agent\'s lease, a process hold, a keep window and a step lease are told apart', () => {
  const l = P.phoneLedger(holder({ owner: 'user-try' }), { endedAt: at(12), queue: [{ owner: 'fix-y', since: at(2), lastSeen: at(11) }] });
  assert.equal(l.kind, 'user');
  assert.equal(l.userWaitSec, 720);
  assert.equal(l.idleSec, 0);
  assert.equal(l.waitersPresentSec, 600);
  assert.equal(l.idleWaitersSec, 0);
  assert.equal(P.ledgerKind(holder({ owner: 'user' })), 'user');
  assert.equal(P.ledgerKind(holder()), 'lease');
  assert.equal(P.ledgerKind(holder({ kind: 'process', pid: 1 })), 'process');
  assert.equal(P.ledgerKind(holder({ kind: 'process', keep: { until: at(2) } })), 'keep');
  assert.equal(P.ledgerKind(holder({ meta: { step: 'C-9' } })), 'step');
});

test('phoneLedger: an unclosed run of a live process counts to the end; of a dead one, nothing (like the idle alarm\'s dead marker)', () => {
  const h = holder({ uses: [{ k: 'run', from: at(2), pid: 111 }, { k: 'run', from: at(6), pid: 222 }] });
  const l = P.phoneLedger(h, { endedAt: at(10), isAlive: (pid) => pid === 222 });
  assert.equal(l.runSec, 240); // 10:06-10:10 only
  assert.equal(l.idleSec, 360);
});

test('phoneLedger: the holder\'s live chrome-measure hold or queue entry at the end counts as Mac hold / Mac wait, with a waiter', () => {
  const mac = { holder: { owner: 'fix-x', acquiredAt: at(7) }, stale: null, queue: [] };
  let l = P.phoneLedger(holder(), { endedAt: at(10), mac });
  assert.equal(l.macHoldSec, 180);
  const group = { holder: { owner: '(shared)', acquiredAt: at(0), readers: [{ owner: 'other', acquiredAt: at(0) }, { owner: 'fix-x', acquiredAt: at(8) }] }, stale: null, queue: [] };
  l = P.phoneLedger(holder(), { endedAt: at(10), mac: group });
  assert.equal(l.macHoldSec, 120);
  const queued = { holder: { owner: 'other', acquiredAt: at(0) }, stale: null, queue: [{ owner: 'fix-x', since: at(4) }] };
  l = P.phoneLedger(holder({ waiters: [[at(5), at(9)]] }), { endedAt: at(10), mac: queued });
  assert.equal(l.macWaitSec, 360);
  assert.equal(l.macWaitWaitersSec, 240);
  assert.equal(l.idleSec, 240);
});

test('observeWaiters: a sighting opens a span from the earliest ready waiter (readyAt, else since), extends it while that waiter stays, opens a new one after a gap', () => {
  const h = holder();
  assert.equal(P.observeWaiters(h, [], Date.parse(at(1))), false);
  assert.equal(P.observeWaiters(h, [{ owner: 'fix-x', since: at(0) }], Date.parse(at(1))), false, 'the holder itself is no waiter');
  assert.equal(P.observeWaiters(h, [{ owner: 'a', since: at(1), notReady: true, lastSeen: at(2) }], Date.parse(at(2))), false);
  assert.equal(P.observeWaiters(h, [{ owner: 'a', since: at(1), readyAt: at(3), lastSeen: at(4) }], Date.parse(at(4))), true);
  assert.deepEqual(h.waiters, [[at(3), at(4)]]);
  assert.equal(P.observeWaiters(h, [{ owner: 'a', since: at(1), readyAt: at(3) }], Date.parse(at(6))), true);
  assert.deepEqual(h.waiters, [[at(3), at(6)]]);
  // a new waiter after the first one left: a second span from its own since
  assert.equal(P.observeWaiters(h, [{ owner: 'b', since: at(9) }], Date.parse(at(10))), true);
  assert.deepEqual(h.waiters, [[at(3), at(6)], [at(9), at(10)]]);
  // a waiter queued before the hold began counts from the grant
  const g = holder({ acquiredAt: at(5) });
  P.observeWaiters(g, [{ owner: 'a', since: at(0) }], Date.parse(at(7)));
  assert.deepEqual(g.waiters, [[at(5), at(7)]]);
});

test('openUse / closeUse: a run opens a use and closes only its own; cooling is its own kind; the list stays bounded', () => {
  const h = holder();
  P.openUse(h, { pid: 10 }, Date.parse(at(1)));
  P.openUse(h, { pid: 11, cooling: true }, Date.parse(at(2)));
  assert.equal(P.closeUse(h, 99, Date.parse(at(3))), false);
  assert.equal(P.closeUse(h, 10, Date.parse(at(4))), true);
  assert.deepEqual(h.uses, [{ k: 'run', from: at(1), pid: 10, to: at(4) }, { k: 'cooling', from: at(2), pid: 11 }]);
  const b = holder();
  for (let i = 0; i < 260; i++) { P.openUse(b, { pid: 1000 + i }, T0 + i * 1000); P.closeUse(b, 1000 + i, T0 + i * 1000 + 500); }
  assert.ok(b.uses.length <= 200);
  assert.equal(b.uses[0].from, at(0));
  assert.equal(b.uses.at(-1).to, new Date(T0 + 259 * 1000 + 500).toISOString());
});

// ---- lib/lock.mjs writes the line --------------------------------------------------------------------------------

test('I-167: releasing an iphone lease writes one ledger line to holds.log with its runs and its waiters', async () => {
  const a = await L.tryAcquire('iphone', { owner: 'fix-x', kind: 'lease', ttlSec: 900 });
  assert.equal(a.ok, true);
  await L.describeHold('iphone', { owner: 'fix-x', run: { text: 'scroll', since: new Date().toISOString(), pid: process.pid } });
  await L.describeHold('iphone', { owner: 'fix-x', run: null });
  const b = await L.tryAcquire('iphone', { owner: 'fix-y', kind: 'lease', ttlSec: 900 });
  assert.equal(b.ok, false);
  const held = JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));
  assert.equal(held.uses.length, 1);
  assert.ok(held.uses[0].to, 'the run end closed its use');
  assert.equal(held.waiters.length, 1, 'the waiter\'s poll was seen on the holder');
  assert.equal(ledgerLines().length, 0, 'nothing is written while the hold lives');
  await L.release('iphone', { owner: 'fix-x' });
  const lines = ledgerLines();
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.equal(l.owner, 'fix-x');
  assert.equal(l.kind, 'lease');
  assert.equal(l.ledger, 1);
  assert.equal(l.how, 'release');
  assert.equal(l.token, a.holder.token);
  assert.equal(l.acquiredAt, a.holder.acquiredAt);
  for (const k of ['durationSec', 'runSec', 'coolingSec', 'macHoldSec', 'macWaitSec', 'userWaitSec', 'idleSec', 'waitersPresentSec', 'idleWaitersSec']) assert.equal(typeof l[k], 'number', k);
  assert.ok(Date.parse(l.endedAt) >= Date.parse(l.acquiredAt));
});

test('I-167: a stale (expired) iphone lease cleared by the next acquirer gets its line, ended at its expiry', async () => {
  mkdirSync(join(state, 'locks'), { recursive: true });
  writeFileSync(join(state, 'locks', 'iphone.json'), JSON.stringify(holder({ acquiredAt: at(0), expiresAt: at(15) })));
  const b = await L.tryAcquire('iphone', { owner: 'fix-y', kind: 'lease', ttlSec: 900 });
  assert.equal(b.ok, true);
  const lines = ledgerLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].owner, 'fix-x');
  assert.equal(lines[0].endedAt, at(15));
  assert.equal(lines[0].durationSec, 900);
  assert.equal(lines[0].idleSec, 900);
  assert.match(lines[0].how, /^stale: expired/);
});

test('I-167: a process hold of iphone writes its line when it ends; chrome-measure holds write no ledger line', async () => {
  const x = await L.acquire('iphone', { owner: 'fix-p', kind: 'process', timeoutSec: 5, log: () => {} });
  x.release();
  const lines = ledgerLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'process');
  assert.equal(lines[0].how, 'process hold ended');
  const c = await L.acquire('chrome-measure', { owner: 'fix-p', kind: 'process', short: true, maxSec: 30, timeoutSec: 5, log: () => {} });
  c.release();
  assert.equal(ledgerLines().length, 1);
});

test('I-167: an entry that turns ready (--not-ready, then acquire) records readyAt and keeps it', async () => {
  await L.tryAcquire('iphone', { owner: 'fix-x', kind: 'lease', ttlSec: 900 });
  await L.tryAcquire('iphone', { owner: 'fix-y', kind: 'lease', ttlSec: 900, notReady: true });
  let q = JSON.parse(readFileSync(join(state, 'locks', 'iphone.queue.json'), 'utf8'));
  assert.equal(q[0].notReady, true);
  assert.equal(q[0].readyAt, undefined);
  let h = JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));
  assert.equal(h.waiters, undefined, 'a not-ready waiter is no waiter');
  await L.tryAcquire('iphone', { owner: 'fix-y', kind: 'lease', ttlSec: 900 });
  q = JSON.parse(readFileSync(join(state, 'locks', 'iphone.queue.json'), 'utf8'));
  assert.ok(q[0].readyAt);
  assert.equal(q[0].notReady, undefined);
  await L.tryAcquire('iphone', { owner: 'fix-y', kind: 'lease', ttlSec: 900 });
  q = JSON.parse(readFileSync(join(state, 'locks', 'iphone.queue.json'), 'utf8'));
  assert.ok(q[0].readyAt, 'kept on the next poll');
  h = JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));
  assert.equal(h.waiters.length, 1);
  assert.equal(h.waiters[0][0], q[0].readyAt);
});

test('I-167: a dead run marker on a released lease counts no run time', async () => {
  await L.tryAcquire('iphone', { owner: 'fix-x', kind: 'lease', ttlSec: 900 });
  await L.describeHold('iphone', { owner: 'fix-x', run: { text: 'scroll', since: new Date().toISOString(), pid: deadPid() } });
  await L.release('iphone', { owner: 'fix-x' });
  assert.equal(ledgerLines()[0].runSec, 0);
});

test('I-167: lock.mjs repair clearing a stale iphone lease writes its line', async () => {
  const Rp = await import('../../tools/lib/lock-repair.mjs');
  mkdirSync(join(state, 'locks'), { recursive: true });
  writeFileSync(join(state, 'locks', 'iphone.json'), JSON.stringify(holder({ acquiredAt: at(0), expiresAt: at(20) })));
  await Rp.repair('iphone', { by: 'lead', reason: 'test', apply: true });
  const lines = ledgerLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].endedAt, at(20));
  assert.match(lines[0].how, /^repair \(lead\)/);
});

// ---- the day's report ----------------------------------------------------------------------------------------------

test('ledgerReport / reportText: the holds that ended in the UTC day, sums by cause and owner, gaps between holds, the open hold', () => {
  const line = (owner, a, b, x = {}) => ({ resource: 'iphone', ledger: 1, owner, kind: 'lease', acquiredAt: at(a), endedAt: at(b), durationSec: (b - a) * 60, runSec: 0, coolingSec: 0, userWaitSec: 0, macHoldSec: 0, macWaitSec: 0, idleSec: 0, idleBeforeSec: 0, idleBetweenSec: 0, idleAfterSec: 0, waitersPresentSec: 0, idleWaitersSec: 0, macWaitWaitersSec: 0, how: 'release', ...x });
  const lines = [
    line('fix-a', 0, 10, { runSec: 300, idleSec: 300, idleBeforeSec: 240, idleAfterSec: 60, waitersPresentSec: 120, idleWaitersSec: 120 }),
    line('fix-b', 15, 20, { runSec: 240, macWaitSec: 60, macWaitWaitersSec: 60 }),
    { resource: 'chrome-measure', owner: 'fix-b', acquiredAt: at(1), endedAt: at(2) },
    line('fix-c', -60 * 24, -60 * 23, { idleSec: 3600 }), // the day before
  ];
  const open = line('user-try', 30, 34, { kind: 'user', userWaitSec: 240 });
  const rep = P.ledgerReport(lines, { day: '2026-10-04', open });
  assert.equal(rep.holds.length, 3);
  assert.equal(rep.totals.durationSec, 600 + 300 + 240);
  assert.equal(rep.totals.idleSec, 300);
  assert.equal(rep.totals.idleWaitersSec, 120);
  assert.equal(rep.freeSec, 300 + 600); // 10:10-10:15, 10:20-10:30
  assert.equal(rep.byOwner[0].owner, 'fix-a');
  const text = P.reportText(rep).join('\n');
  assert.match(text, /^PHONE LEDGER 2026-10-04 \(UTC; holds that ended that day, and the open hold so far\): 3 holds, held 19 min, free between holds 15 min$/m);
  assert.match(text, /idle \(held, none of the above\): 5 min: before the first use 4 min \(H-early\), between uses 0 min \(H-gap\), after the last use 1 min \(H-done\); 2 min with a ready waiter/);
  assert.match(text, /avoidable \(held, idle or Mac wait, while a ready waiter was queued\): 3 min/);
  assert.match(text, /^ {2}10:00-10:10Z fix-a lease: 10 min; run 5 min, idle 5 min \(early 4 min, gap 0 min, done 1 min\); waiters 2 min; release$/m);
  assert.match(text, /^ {2}10:30-10:34Z user-try user \(open\): 4 min; user 4 min$/m);
  assert.match(P.reportText(P.ledgerReport([], { day: '2026-10-05' })).join('\n'), /no iphone hold ended that day/);
});
