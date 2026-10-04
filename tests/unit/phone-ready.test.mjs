// I-155: a phone lease taken before its hold could start idled the iPhone, and the idle alarm then fired on phone-side
// work. (1) `acquire iphone --not-ready` queues without being served; (3) the idle alarm counts the lease holder's
// chrome-measure hold or queue entry, and a `lock.mjs run iphone` command under its lease, as use; (2) the 5-min thread
// stays, and an open alarm shows as a red alert on the /status rows of the agents it concerns. Own $FW_STATE_DIR (I-041).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const D = await import('../../tools/lib/idle.mjs');
const S = await import('../../tools/lib/status.mjs');
let state;
beforeEach(() => { state = tempDir('fw-pready-'); process.env.FW_STATE_DIR = state; });
const kids = [];
const livePid = () => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); kids.push(c); return c.pid; };
after(() => { for (const c of kids) try { c.kill('SIGKILL'); } catch {} });
const iphone = () => JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8'));
const lease = (owner, o = {}) => L.tryAcquire('iphone', { owner, kind: 'lease', ttlSec: 900, ...o });

test('I-155 --not-ready: the entry keeps its place but is never served; the next ready waiter is; acquiring without the flag marks it ready', async () => {
  assert.equal((await lease('runner')).ok, true);
  const a = await lease('fix-a', { notReady: true });
  assert.deepEqual([a.ok, a.notReady, a.position], [false, true, 1]);
  const b = await lease('fix-b');
  assert.deepEqual([b.ok, b.position, b.next], [false, 2, 'fix-b'], 'the ready waiter behind it is served next');
  assert.equal(L.status('iphone').next, 'fix-b');
  assert.equal(L.status('iphone').queue[0].notReady, true);
  await L.release('iphone', { owner: 'runner' });
  assert.equal((await lease('fix-a', { notReady: true })).ok, false, 'a free lease is not granted to a not-ready waiter');
  assert.equal(L.status('iphone').holder, null);
  assert.equal((await lease('fix-b')).ok, true, 'the ready one takes it past the not-ready head');
  assert.deepEqual(L.status('iphone').queue.map((w) => [w.owner, !!w.notReady]), [['fix-a', true]], 'fix-a kept its place');
  await L.release('iphone', { owner: 'fix-b' });
  // only not-ready waiters: nobody is next, and a newcomer takes the free lease
  assert.equal(L.status('iphone').next, null);
  assert.equal((await lease('fix-c')).ok, true);
  await L.release('iphone', { owner: 'fix-c' });
  // fix-a is ready now: the same entry (its place), and it is granted
  const g = await lease('fix-a');
  assert.equal(g.ok, true);
  assert.deepEqual(L.status('iphone').queue, []);
});

test('I-155 --not-ready: a ready re-acquire clears the mark in place; a not-ready head never blocks the ready waiter behind it while held', async () => {
  assert.equal((await lease('runner')).ok, true);
  await lease('fix-a', { notReady: true });
  await lease('fix-b');
  const r = await lease('fix-a'); // ready now, still held by runner
  assert.deepEqual([r.ok, r.position, r.next, r.notReady], [false, 1, 'fix-a', undefined]);
  assert.equal(L.status('iphone').queue[0].notReady, undefined);
  assert.equal(L.status('iphone').next, 'fix-a');
});

test('I-155 describeHold: a run inside a live outer run keeps it and gives it back at its end; a lock.mjs run iphone marker (lockRun) keeps the between window', async () => {
  assert.equal((await lease('runner')).ok, true);
  await L.describeHold('iphone', { owner: 'runner', block: 'P-1', betweenMin: 10 });
  const outerPid = livePid();
  await L.describeHold('iphone', { owner: 'runner', run: { text: 'thermal gate', since: new Date().toISOString(), pid: outerPid, lockRun: true } });
  assert.equal(iphone().meta.run.pid, outerPid);
  assert.ok(iphone().meta.between, 'a lock.mjs run iphone wrapper does not end the window');
  await L.describeHold('iphone', { owner: 'runner', run: { text: 'scroll', since: new Date().toISOString(), pid: process.pid } });
  assert.equal(iphone().meta.run.pid, process.pid);
  assert.equal(iphone().meta.run.outer.pid, outerPid);
  assert.equal(iphone().meta.between, undefined, 'a phone run ends it');
  await L.describeHold('iphone', { owner: 'runner', run: null });
  assert.deepEqual([iphone().meta.run.pid, iphone().meta.run.outer], [outerPid, undefined], 'the outer marker is back');
  await L.describeHold('iphone', { owner: 'runner', run: null, runPid: outerPid });
  assert.equal(iphone().meta.run, undefined);
  // an outer marker whose process is gone is not given back
  await L.describeHold('iphone', { owner: 'runner', run: { text: 'gone', since: new Date().toISOString(), pid: 999999, lockRun: true } });
  await L.describeHold('iphone', { owner: 'runner', run: { text: 'scroll', since: new Date().toISOString(), pid: process.pid } });
  assert.equal(iphone().meta.run.outer, undefined, 'a dead marker is not kept as the outer one');
  await L.describeHold('iphone', { owner: 'runner', run: null });
  assert.equal(iphone().meta.run, undefined);
});

const T0 = Date.parse('2026-10-04T03:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const phoneLease = (extra = {}) => ({ resource: 'iphone', owner: 'runner', kind: 'lease', token: 'L1', acquiredAt: at(0), expiresAt: at(60), meta: {}, ...extra });
const heldSt = (h, queue = [{ owner: 'fix-w' }]) => ({ resource: 'iphone', holder: h, stale: null, queue });
const cmSt = (holder = null, queue = []) => ({ resource: 'chrome-measure', holder, stale: null, queue });

test('I-155 idle: the holder holding or queued for chrome-measure is using the phone; a lock.mjs run iphone command is a run; a not-ready waiter is no ready work', () => {
  const now = T0 + 30 * 60000;
  const A = (o = {}) => D.assess('iphone', { st: heldSt(phoneLease(o.h), o.queue), cm: o.cm ?? null, min: 5, now });
  assert.equal(A().alarm, true, 'as before: held-idle while fix-w waits');
  const holds = A({ cm: cmSt({ owner: 'runner', kind: 'process', noTiming: true, acquiredAt: at(25) }) });
  assert.deepEqual([holds.alarm, holds.heldIdle, holds.chromeUse], [false, false, 'holds']);
  assert.match(D.lineFor(holds), /^OK iphone: held by runner, which holds the Chrome slot \(its phone-block hold\): in use, not idle \(I-155\)$/);
  const reader = A({ cm: cmSt({ shared: true, owner: '(shared)', readers: [{ owner: 'runner', kind: 'lease', deadline: at(40) }] }) });
  assert.equal(reader.chromeUse, 'holds', 'a live reader of a shared group counts');
  const queued = A({ cm: cmSt({ owner: 'fix-x', kind: 'lease' }, [{ owner: 'runner', noTiming: true }]) });
  assert.deepEqual([queued.alarm, queued.chromeUse], [false, 'queued']);
  assert.match(D.lineFor(queued), /waits for its next Chrome slot hold/);
  assert.equal(A({ cm: cmSt({ owner: 'fix-x', kind: 'lease' }, [{ owner: 'other' }]) }).alarm, true, 'someone else on chrome-measure does not count');
  assert.equal(A({ cm: { ...cmSt({ owner: 'runner', kind: 'process' }), stale: 'pid 1 is gone' } }).alarm, true, 'a stale hold does not count');
  const lr = A({ h: { meta: { run: { text: 'xctrace gate', since: at(20), pid: process.pid, lockRun: true } } } });
  assert.deepEqual([lr.alarm, lr.runLive, lr.lockRun], [false, true, true]);
  assert.match(D.lineFor(lr), /a lock\.mjs run iphone command is on/);
  // the only waiter is not ready: no ready work, no alarm (held, and free)
  assert.equal(A({ queue: [{ owner: 'fix-w', notReady: true }] }).alarm, false);
  const fr = D.assess('iphone', { st: { resource: 'iphone', holder: null, stale: null, queue: [{ owner: 'fix-w', notReady: true }] }, rel: { owner: 'runner', token: 'L1', at: at(0) }, grant: { token: 'L1', at: at(-5) }, min: 5, now });
  assert.deepEqual([fr.held, fr.ready, fr.alarm], [false, false, false]);
  assert.deepEqual(D.chromeUse('runner', null), null);
});

test('I-155 idle record: chrome-measure use counts as a sighting (the held-idle clock starts again after it); the episode keeps its owners while the alarm stands', async () => {
  const A = (now, o = {}) => D.assess('iphone', { st: heldSt(phoneLease(), o.queue), cm: o.cm ?? null, activity: D.readState().resources.iphone?.activity || null, min: 5, now });
  await D.record([A(T0 + 20 * 60000, { cm: cmSt({ owner: 'runner', kind: 'process' }) })], { now: T0 + 20 * 60000 });
  assert.deepEqual(D.readState().resources.iphone.activity, { token: 'L1', at: at(20) });
  assert.equal(A(T0 + 25 * 60000).alarm, false, 'counts from the sighting at 20');
  const r = await D.record([A(T0 + 25 * 60000 + 1)], { now: T0 + 25 * 60000 + 1 });
  assert.equal(r[0].news, 'alarm');
  const ep = D.readState().resources.iphone.episode;
  assert.deepEqual([ep.owners, ep.alarmNow, ep.kind, ep.holder], [['runner', 'fix-w'], true, 'held', 'runner']);
  assert.deepEqual(D.boardAlerts({ now: T0 + 26 * 60000 }).map((x) => [x.resource, x.kind, x.holder, x.owners.join(',')]), [['iphone', 'held', 'runner', 'runner,fix-w']]);
  assert.deepEqual(D.boardAlerts({ now: T0 + 26 * 60000 + D.BOARD_FRESH_MS }), [], 'no alarm run lately: nothing shown');
  // the waiter leaves: the episode is still open, but its alarm no longer stands
  await D.record([A(T0 + 27 * 60000, { queue: [] })], { now: T0 + 27 * 60000 });
  assert.equal(D.readState().resources.iphone.episode.alarmNow, false);
  assert.deepEqual(D.boardAlerts({ now: T0 + 27 * 60000 }), []);
});

test('I-155 board: red alerts on the rows of the agents an open alarm concerns (holder, waiters), never on finished rows', () => {
  const now = T0 + 12 * 60000;
  const idle = [
    { resource: 'iphone', kind: 'held', holder: 'runner', owners: ['runner', 'fix-w'], since: at(0), thread: 'T-200' },
    { resource: 'chrome-measure', kind: 'free', holder: null, owners: ['fix-q'], since: at(0) },
  ];
  const mk = (id, owner, state = 'waiting', extra = {}) => ({ id, title: id, kind: 'fix', owner, state, stateSince: at(10), updatedAt: at(10), priority: null, waitingOn: null, ...extra });
  const items = [mk('h', 'runner', 'measuring'), mk('w', 'fix-w'), mk('q', 'other', 'waiting', { aliases: ['fix-q'] }), mk('done', 'fix-w', 'done'), mk('n', 'nobody')];
  const v = S.buildStatusView({ items, live: { locks: {}, incidents: [], steps: [], idle }, now });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.deepEqual(by.h.alerts, ['idle alarm: you hold the iPhone lease with no phone run for 12 min while others wait: run your phone part or release it (thread T-200) (I-155)']);
  assert.deepEqual(by.w.alerts, ['idle alarm: the iPhone lease of runner has had no phone run for 12 min while you wait (thread T-200) (I-155)']);
  assert.deepEqual(by.q.alerts, ['idle alarm: the Chrome slot has stood free for 12 min while you wait for it: take it now or say why not (I-155)']);
  assert.deepEqual(by.done.alerts, []);
  assert.deepEqual(by.n.alerts, []);
  assert.equal(v.counts.alerts, 3);
  assert.equal(S.boardAlertText(idle[0], 'someone-else', now), null);
  assert.deepEqual(S.buildStatusView({ items, live: { locks: {}, incidents: [], steps: [] }, now }).items.find((x) => x.id === 'h').alerts, [], 'no idle data: no alert');
});
