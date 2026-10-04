// tools/lib/lock.mjs shared lane (ts-lock-share, research/architecture/lock-shared-lane.md): functional jobs hold
// chrome-measure as readers of one group, in parallel with each other, never beside an exclusive (timing) holder.
// The group lives inside <r>.json as a holder record that lock code from before the lane reads as a live lease, so
// mixed versions never co-hold (shelf B2); readers re-enter only their own slot (B1) and are keyed by token (B3).
// Every test uses its own $FW_STATE_DIR (I-041: unlanded lock code never touches the live lock).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { tempDir, REPO } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const LR = await import('../../tools/lib/lock-repair.mjs');
const W = await import('../../tools/lib/wait.mjs');
const R = 'chrome-measure';
let state;
delete process.env.FW_LOCK_SHARED; // npm test may itself run inside a shared hold: these tests pass sharedHeld explicitly
beforeEach(() => { state = tempDir('fw-shared-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const readJson = (f) => JSON.parse(readFileSync(lockFile(f), 'utf8'));
const holder = () => (existsSync(lockFile(`${R}.json`)) ? readJson(`${R}.json`) : null);
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
const kids = [];
const livePid = () => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); kids.push(c); return c.pid; };
after(() => { for (const c of kids) try { c.kill('SIGKILL'); } catch {} });
const on = (extra = {}) => L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'test', ...extra });
// a reader attempt: a process reader of this test process unless pid / kind say otherwise
const rd = (owner, o = {}) => L.tryAcquire(R, { owner, kind: 'process', shared: true, weight: 1, maxSec: 60, load1: 0, ncpu: 8, ...o });
const ms = (s) => s * 1000;

test('config: one constant holds the cap, the per-job weights and the bounds; the join load is 2x the cpu count', () => {
  assert.deepEqual(L.SHARED_LANE, {
    cap: 4, defaultCap: 3, joinLoadPerCpu: 2, joinBusyPct: 75, busyWindowMs: 1000, maxSec: 300, batchJoinSec: 30, expiryGraceSec: 10, killGraceSec: 5, readerMaxWaitSec: 600, readerBypassSec: 300,
    weights: { check: 1, probe: 1, 'bench-mech': 1, 'test-chrome-fn': 1, 'npm-test': 2, simulator: 3 },
    jobMaxSec: { 'npm-test': 480 },
  });
  assert.ok(Object.isFrozen(L.SHARED_LANE) && Object.isFrozen(L.SHARED_LANE.weights) && Object.isFrozen(L.SHARED_LANE.jobMaxSec));
  for (const w of Object.values(L.SHARED_LANE.weights)) assert.ok(Number.isInteger(w) && w >= 1 && w <= L.SHARED_LANE.cap);
  const prev = process.env.FW_LOCK_SHARED_JOIN_LOAD;
  delete process.env.FW_LOCK_SHARED_JOIN_LOAD;
  try { assert.equal(L.sharedJoinLoad(), 2 * os.cpus().length); } finally { if (prev !== undefined) process.env.FW_LOCK_SHARED_JOIN_LOAD = prev; }
  const prevB = process.env.FW_LOCK_SHARED_JOIN_BUSY;
  delete process.env.FW_LOCK_SHARED_JOIN_BUSY;
  try {
    assert.equal(L.sharedJoinBusy(), 75, 'I-051: a joining reader needs CPU busy <= 75 % by default');
    process.env.FW_LOCK_SHARED_JOIN_BUSY = '100';
    assert.equal(L.sharedJoinBusy(), 100, 'FW_LOCK_SHARED_JOIN_BUSY overrides it (tests)');
  } finally { if (prevB !== undefined) process.env.FW_LOCK_SHARED_JOIN_BUSY = prevB; else delete process.env.FW_LOCK_SHARED_JOIN_BUSY; }
  assert.equal(L.GROUP_OWNER, '(shared)');
  assert.equal(L.SHARED_FORMAT, 'rw1');
});

test('switch: absent = off; only the lead turns it on or off, with a reason, audited; cap 3 by default, 1..4; a join load', async () => {
  assert.deepEqual(L.sharedSwitch(R), { enabled: false, cap: 3 });
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'someone', reason: 'x' }), /--by lead/);
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead' }), /--reason/);
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'x', cap: 9 }), /cap/);
  await assert.rejects(L.setSharedSwitch('iphone', { on: true, by: 'lead', reason: 'x' }), /iphone/);
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'x', joinLoad: 0 }), /join/);
  await on();
  assert.deepEqual(L.sharedSwitch(R), { enabled: true, cap: 3 });
  await on({ cap: 4, joinLoad: 12 });
  assert.deepEqual(L.sharedSwitch(R), { enabled: true, cap: 4, joinLoad: 12 });
  const prev = process.env.FW_LOCK_SHARED_JOIN_LOAD;
  delete process.env.FW_LOCK_SHARED_JOIN_LOAD;
  try { assert.equal(L.sharedJoinLoad(R), 12, 'the switch file sets the join load'); } finally { if (prev !== undefined) process.env.FW_LOCK_SHARED_JOIN_LOAD = prev; }
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'x', joinBusy: 0 }), /--join-busy/);
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'x', joinBusy: 101 }), /--join-busy/);
  await on({ cap: 4, joinLoad: 12, joinBusy: 60 });
  assert.deepEqual(L.sharedSwitch(R), { enabled: true, cap: 4, joinLoad: 12, joinBusy: 60 });
  const prevB = process.env.FW_LOCK_SHARED_JOIN_BUSY;
  delete process.env.FW_LOCK_SHARED_JOIN_BUSY;
  try { assert.equal(L.sharedJoinBusy(R), 60, 'the switch file sets the join busy limit (I-051)'); } finally { if (prevB !== undefined) process.env.FW_LOCK_SHARED_JOIN_BUSY = prevB; }
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 'rollback' });
  assert.equal(L.sharedSwitch(R).enabled, false);
  const audit = readFileSync(LR.auditFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(audit.map((a) => [a.code, a.by, a.reason]), [['shared-switch', 'lead', 'test'], ['shared-switch', 'lead', 'test'], ['shared-switch', 'lead', 'test'], ['shared-switch', 'lead', 'rollback']]);
});

test('argument checks: max-seconds 1..300 and weight 1..cap are required; never with short or no iphone; an owner "(shared)" is no group', async () => {
  await on();
  await assert.rejects(rd('a', { maxSec: undefined }), /max-seconds/);
  await assert.rejects(rd('a', { maxSec: 301 }), /max-seconds/);
  await assert.rejects(rd('a', { weight: 0 }), /weight/);
  await assert.rejects(rd('a', { weight: 5 }), /weight/);
  await assert.rejects(rd('a', { weight: 1.5 }), /weight/);
  await assert.rejects(rd('a', { short: true }), /--short/);
  await assert.rejects(L.tryAcquire('iphone', { owner: 'a', shared: true, weight: 1, maxSec: 60 }), /iphone/);
  // N1: no "(" refusal (main has none); a group is `shared: true` + its format, never an owner name
  const g = await rd('npm-a', { weight: 2 });
  assert.equal(g.opened, true);
  const x = await L.tryAcquire(R, { owner: '(shared)', kind: 'lease' });
  assert.equal(x.ok, false, 'an exclusive "(shared)" lease does not re-enter the group by its owner name');
  assert.equal(holder().readers.length, 1);
});

test('I-114: a shared job named npm-test may take --max-seconds up to 480 (the commit hook\'s suite, ~250 s); every other shared job keeps 300', async () => {
  assert.equal(L.sharedMaxSec('npm-test'), 480);
  for (const j of [undefined, 'check', 'probe', 'bench-mech', 'test-chrome-fn', 'simulator']) assert.equal(L.sharedMaxSec(j), 300, String(j));
  await on();
  // only by its job name: a plain weight 2 is any job, and keeps 300
  await assert.rejects(rd('a', { weight: 2, maxSec: 480 }), /between 1 and 300/);
  await assert.rejects(rd('a', { job: 'check', maxSec: 301 }), /between 1 and 300/);
  await assert.rejects(rd('a', { weight: 2, job: 'npm-test', maxSec: 481 }), /between 1 and 480/);
  await assert.rejects(rd('a', { weight: 2, job: 'frob', maxSec: 60 }), /job/);
  await assert.rejects(rd('a', { weight: 1, job: 'npm-test', maxSec: 480 }), /weight/, 'the name brings its weight: npm-test is at least 2');
  const t0 = Date.now();
  const a = await rd('npm-a', { weight: 2, job: 'npm-test', maxSec: 480 });
  assert.equal(a.ok, true);
  assert.equal(a.opened, true);
  assert.equal(a.reader.maxSec, 480);
  const dl = Date.parse(a.reader.deadline);
  assert.ok(dl >= t0 + ms(480 + L.SHARED_LANE.killGraceSec) && dl <= Date.now() + ms(480 + L.SHARED_LANE.killGraceSec));
  // the group record old lock code reads as a live short lease covers the long reader: expiresAt past its deadline,
  // maxSec the longest reader's, and the last-grant record stays "short" until that reader's end + the hand-over grace
  let h = holder();
  assert.ok(Date.parse(h.expiresAt) >= dl + ms(L.SHARED_LANE.expiryGraceSec));
  assert.equal(h.maxSec, 480);
  assert.equal(L.lastGrant(R).maxSec, 480);
  const b = await rd('chk-b', { maxSec: 60 });
  assert.equal(b.ok, true);
  h = holder();
  assert.equal(h.readers.length, 2);
  assert.equal(h.maxSec, 480, 'a shorter reader joining keeps the longest reader\'s bound');
  assert.equal(L.lastGrant(R).maxSec, 480);
});

test('I-114 switch off: the stand-in exclusive short job of an npm-test shared job may take up to 480 s too; others keep 300', async () => {
  await assert.rejects(rd('fn-x', { maxSec: 301 }), /between 1 and 300/);
  const a = await rd('npm-x', { weight: 2, job: 'npm-test', maxSec: 480 });
  assert.equal(a.ok, true);
  assert.equal(a.mode, 'short');
  const h = holder();
  assert.equal(h.maxSec, 480);
  assert.ok(Date.parse(h.expiresAt) - Date.parse(h.acquiredAt) >= ms(480));
  await assert.rejects(L.tryAcquire(R, { owner: 'sh', kind: 'process', short: true, maxSec: 480 }), /between 1 and 300/, 'a plain --short job keeps 300');
});

test('switch off: a shared acquire is an exclusive short hold with the same max-seconds (tools never branch)', async () => {
  const a = await rd('fn-a', { maxSec: 120 });
  assert.equal(a.ok, true);
  assert.equal(a.mode, 'short');
  assert.equal(a.holder.shared, undefined);
  assert.deepEqual([a.holder.owner, a.holder.short, a.holder.maxSec, a.holder.functional, a.holder.weight], ['fn-a', true, 120, true, 1]);
  assert.equal(a.reader, undefined);
  const b = await rd('fn-b', { pid: livePid(), weight: 2 });
  assert.equal(b.ok, false, 'no parallel readers while the lane is off');
  assert.deepEqual(L.status(R).queue.map((w) => [w.owner, w.short, w.functional, w.weight, w.shared]), [['fn-b', true, true, 2, undefined]], 'its queue entry is an exclusive short entry marked functional');
  // N2: the stand-in is a slot like a reader: an exclusive acquire inside it is refused, a heavier shared one too (N8)
  const sharedHeld = L.sharedEnv(R, a.holder.token, '');
  await assert.rejects(L.tryAcquire(R, { owner: 'verify-x', kind: 'process', sharedHeld }), /inside the shared \(functional\) hold of "fn-a"/);
  await assert.rejects(rd('fn-c', { sharedHeld, weight: 2 }), /weight/);
  assert.deepEqual(L.sharedSlot(R, sharedHeld), { owner: 'fn-a', token: a.holder.token, weight: 1, holder: true });
  assert.equal(L.sharedSlot(R, ''), null);
});

test('N8: a nested shared acquire heavier than its reader slot is refused; an equal or lighter one re-enters', async () => {
  await on();
  const a = await rd('fn', { weight: 2 });
  const sharedHeld = L.sharedEnv(R, a.reader.token, '');
  await assert.rejects(rd('inner', { sharedHeld, weight: 3 }), /weight/);
  assert.equal((await rd('inner', { sharedHeld, weight: 2 })).mode, 'reentrant-shared');
  assert.equal(L.sharedSlot(R, sharedHeld).token, a.reader.token);
  assert.equal(holder().readers.length, 1);
});

test('N4 + I-049: readers join in queue order, but one that fits may pass a head reader that does not, until that one is readerBypassSec old', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await rd('npm-a', { weight: 2, maxSec: 300, now: t0 })).opened, true);
  const pidB = livePid(), pidC = livePid(), pidD = livePid();
  const b = await rd('npm-b', { pid: pidB, weight: 2, now: t0 + 1000 });
  assert.equal(b.ok, false, '2 + 2 > cap 3');
  // I-049 head-of-line: npm-b cannot fit now, so a lighter reader that fits joins past it while npm-b is young
  const c = await rd('check-c', { pid: pidC, weight: 1, now: t0 + 2000 });
  assert.equal(c.ok, true, 'fits (2 + 1 <= 3); npm-b does not fit and has waited 1 s');
  await L.releaseReader(R, c.reader.token);
  const bypass = ms(L.SHARED_LANE.readerBypassSec);
  // once npm-b has waited readerBypassSec, nobody passes it any more: the group drains for it (npm-b's entry is
  // backdated: a real waiter keeps polling, this test does not)
  const late = t0 + 1000 + bypass;
  assert.equal((await rd('npm-b', { pid: pidB, weight: 2, now: late })).ok, false);
  const qb = L.status(R).queue;
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(qb.map((w) => (w.owner === 'npm-b' ? { ...w, since: new Date(t0 + 1000).toISOString() } : w))));
  const d = await rd('check-d', { pid: pidD, weight: 1, now: late + 500 });
  assert.equal(d.ok, false, 'would fit, but npm-b is past the bypass bound');
  assert.match(d.why, /"npm-b" queued first/);
  // a reader that stopped polling does not hold the others up
  const q = L.status(R).queue;
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q.map((w) => (w.owner === 'npm-b' ? { ...w, lastSeen: new Date(late - 120000).toISOString() } : w))));
  assert.equal((await rd('check-d', { pid: pidD, weight: 1, now: late + 1000 })).ok, true);
});

test('I-049 head-of-line: a reader ahead that fits is never passed', async () => {
  await on({ cap: 4 });
  const t0 = Date.now();
  assert.equal((await rd('npm-a', { weight: 2, now: t0 })).opened, true);
  const w = await L.tryAcquire(R, { owner: 'ab', kind: 'lease', now: t0 + 500 }); // closes joins for a moment
  assert.equal(w.ok, false);
  const pidB = livePid(), pidC = livePid();
  assert.equal((await rd('npm-b', { pid: pidB, weight: 2, now: t0 + 1000 })).ok, false, 'joins closed by ab');
  assert.equal((await rd('check-c', { pid: pidC, weight: 1, now: t0 + 2000 })).ok, false);
  await L.dequeue(R, 'ab');
  const c = await rd('check-c', { pid: pidC, weight: 1, now: t0 + 3000 });
  assert.equal(c.ok, false, 'npm-b fits (2 + 2 <= 4), so it goes first');
  assert.match(c.why, /"npm-b" queued first/);
  assert.equal((await rd('npm-b', { pid: pidB, weight: 2, now: t0 + 3500 })).ok, true);
});

test('N10: a waiter converts in place when the lead flips the switch (its queue place is kept)', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'w', kind: 'lease' })).ok, true);
  await L.tryAcquire(R, { owner: 'x', kind: 'lease' });
  const pidF = livePid();
  assert.equal((await rd('fn', { pid: pidF })).ok, false);
  const pos = () => L.status(R).queue.findIndex((w) => w.owner === 'fn');
  assert.equal(pos(), 1);
  await on();
  assert.equal((await rd('fn', { pid: pidF })).ok, false);
  assert.equal(L.status(R).queue.filter((w) => w.owner === 'fn').length, 1, 'one entry, converted');
  assert.equal(pos(), 1);
  assert.equal(L.status(R).queue[1].shared, true);
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 't' });
  assert.equal((await rd('fn', { pid: pidF })).ok, false);
  assert.equal(L.status(R).queue.filter((w) => w.owner === 'fn').length, 1);
  assert.deepEqual([pos(), L.status(R).queue[1].functional, L.status(R).queue[1].shared], [1, true, undefined]);
});

test('readers share: two join one group (weights 2+2), the group reads as a live short lease, a third waits at the cap', async () => {
  await on({ cap: 4 });
  const pidB = livePid();
  const a = await rd('npm-a', { weight: 2, maxSec: 300 });
  assert.equal(a.ok, true);
  assert.equal(a.mode, 'shared');
  assert.equal(a.opened, true);
  const b = await rd('npm-b', { weight: 2, pid: pidB, maxSec: 100 });
  assert.equal(b.ok, true);
  assert.equal(b.opened, undefined);
  const g = holder();
  assert.deepEqual([g.owner, g.kind, g.short, g.maxSec, g.shared, g.format, g.pid], ['(shared)', 'lease', true, 300, true, 'rw1', undefined]);
  assert.match(g.token, /^[0-9a-f]{12}$/);
  assert.deepEqual(g.readers.map((x) => [x.owner, x.weight, x.kind]), [['npm-a', 2, 'process'], ['npm-b', 2, 'process']]);
  assert.notEqual(a.reader.token, b.reader.token);
  assert.ok(![a.reader.token, b.reader.token].includes(g.token), 'reader tokens are not the group token');
  assert.equal(g.meta.readers, 'npm-a (w2), npm-b (w2)');
  // invariant: the group outlives every reader's hard deadline (maxSec + the kill grace) by expiryGraceSec
  const deadlines = g.readers.map((x) => Date.parse(x.deadline));
  assert.equal(Date.parse(g.readers[0].deadline), Date.parse(g.readers[0].acquiredAt) + ms(300 + 5));
  assert.equal(Date.parse(g.expiresAt), Math.max(...deadlines) + ms(10));
  assert.equal(L.staleReason(g), null);
  const c = await rd('check-c', { weight: 1 });
  assert.equal(c.ok, false, '2 + 2 + 1 > cap 4');
  assert.equal(c.holder.owner, '(shared)');
  assert.equal(L.status(R).queue[0].shared, true);
  assert.equal(L.status(R).queue[0].short, true, 'old code orders reader entries like short jobs');
  // a reader leaves: the group shrinks (expiry follows the remaining deadlines) and the waiting reader joins
  const rel = await L.releaseReader(R, a.reader.token);
  assert.equal(rel.closed, false);
  assert.equal(Date.parse(holder().expiresAt), Date.parse(holder().readers[0].deadline) + ms(10));
  assert.equal((await rd('check-c', { weight: 1 })).ok, true);
  assert.deepEqual(holder().readers.map((x) => x.owner), ['npm-b', 'check-c']);
});

test('a lowered cap in the switch file is the cap', async () => {
  await on({ cap: 2 });
  assert.equal((await rd('a', { weight: 2 })).ok, true);
  assert.equal((await rd('b', { weight: 1, pid: livePid() })).ok, false);
});

test('join load: a joining reader needs load1 <= the cpu count; the opener does not', async () => {
  await on();
  assert.equal((await rd('a', { load1: 50, ncpu: 8 })).ok, true, 'the opener ignores load');
  const b = await rd('b', { pid: livePid(), load1: 8.5, ncpu: 8 });
  assert.equal(b.ok, false);
  assert.match(b.why, /load1 8\.5 > 8/);
  assert.equal((await rd('b', { pid: b.queue[0].pid, load1: 7.9, ncpu: 8 })).ok, true);
});

test('I-057 FW_LOCK_LOAD1: a test-only stand-in for the host load1 in the join check (CLI tests stay hermetic); an explicit load1 wins', async () => {
  const prev = process.env.FW_LOCK_LOAD1;
  try {
    await on();
    assert.equal((await rd('a', { load1: undefined, ncpu: 8 })).ok, true);
    process.env.FW_LOCK_LOAD1 = '50';
    const b = await rd('b', { pid: livePid(), load1: undefined, ncpu: 8 });
    assert.equal(b.ok, false);
    assert.match(b.why, /load1 50 > 8: no new reader joins a loaded host/);
    assert.equal((await rd('b', { pid: b.queue[0].pid, load1: 1, ncpu: 8 })).ok, true, 'an injected load1 (library tests) wins over the env');
    process.env.FW_LOCK_LOAD1 = '0.5';
    assert.equal((await rd('c', { pid: livePid(), load1: undefined, ncpu: 8 })).ok, true);
    for (const bad of ['', 'x', '-1']) {
      process.env.FW_LOCK_LOAD1 = bad; // not a load: the real os.loadavg, as before
      assert.equal(L.envLoad1(), null, `"${bad}" is ignored`);
    }
  } finally { if (prev !== undefined) process.env.FW_LOCK_LOAD1 = prev; else delete process.env.FW_LOCK_LOAD1; }
});

test('I-051 join busy: once the reader has a CPU busy sample, busy <= the join busy limit decides, not load1', async () => {
  const prev = process.env.FW_LOCK_SHARED_JOIN_BUSY;
  delete process.env.FW_LOCK_SHARED_JOIN_BUSY;
  try {
    await on({ cap: 4 });
    assert.equal((await rd('a', { load1: 139, busyPct: 100 })).ok, true, 'the opener ignores load and busy');
    const pid = livePid();
    // seen live 2026-10-02 00:42Z: load1 132 after a Simulator boot while the CPU was 33-42 % busy
    const quiet = await rd('b', { pid, load1: 132, ncpu: 16, busyPct: 40 });
    assert.equal(quiet.ok, true, 'a quiet CPU joins although load1 still carries the boot');
    const busy = await rd('c', { pid: livePid(), load1: 2, ncpu: 16, busyPct: 80 });
    assert.equal(busy.ok, false, 'a busy CPU keeps joins closed although load1 is low');
    assert.match(busy.why, /CPU 80 % busy > 75 %/);
    const first = await rd('c', { pid: busy.queue[0].pid, load1: 20, ncpu: 16 });
    assert.equal(first.ok, false, 'before its first busy sample a reader goes by load1');
    assert.match(first.why, /load1 20 > 16/);
    assert.equal((await rd('c', { pid: busy.queue[0].pid, load1: 20, ncpu: 16, busyPct: 75 })).ok, true, 'busy = the limit joins');
  } finally { if (prev !== undefined) process.env.FW_LOCK_SHARED_JOIN_BUSY = prev; }
});

test('I-051 hand-over: a free lock names the waiter served next and why it has not taken it (gated, or not seen)', () => {
  const now = Date.parse('2026-10-02T00:22:00Z');
  const ago = (s) => new Date(now - s * 1000).toISOString();
  const st = (w, o = {}) => ({ resource: R, holder: null, stale: null, next: 'fix-nav-morph', queue: [{ owner: 'scene-scope', lastSeen: ago(1) }, { owner: 'fix-nav-morph', since: ago(900), lastSeen: ago(1), ...w }], ...o });
  // seen live 2026-10-02 00:21:52-00:22:54Z: the lock stood free while the head waited for a quiet host
  const gated = L.handoverInfo(st({ gate: { since: ago(300), at: ago(2), quiet: false, reasons: ['cpu 32.5 % > 25 %', 'load1 70.8 > 6'] } }), now);
  assert.deepEqual(gated, { to: 'fix-nav-morph', gated: ['cpu 32.5 % > 25 %', 'load1 70.8 > 6'], gatedSince: ago(300) });
  assert.equal(L.handoverText(gated), 'handing over to "fix-nav-morph" (gated: cpu 32.5 % > 25 %, load1 70.8 > 6)');
  // a waiter that stopped polling (or polls code that defers to someone else, I-049 mixed versions)
  const gone = L.handoverInfo(st({ lastSeen: ago(42) }), now);
  assert.deepEqual(gone, { to: 'fix-nav-morph', notSeenSec: 42 });
  assert.equal(L.handoverText(gone), 'handing over to "fix-nav-morph" (not seen for 42 s)');
  // an old gate record (not refreshed for a minute) is no gate; a fresh poll says when it was seen
  const fresh = L.handoverInfo(st({ lastSeen: ago(1), gate: { since: ago(900), at: ago(120), quiet: false, reasons: ['load1 9 > 6'] } }), now);
  assert.deepEqual(fresh, { to: 'fix-nav-morph', seenSec: 1 });
  assert.equal(L.handoverText(fresh), 'handing over to "fix-nav-morph" (seen 1 s ago)');
  assert.equal(L.handoverInfo(st({}, { holder: { owner: 'x' } }), now), null, 'held: no hand-over');
  assert.equal(L.handoverInfo(st({}, { next: null, queue: [] }), now), null, 'free and nobody waits');
  assert.equal(L.handoverText(null), '');
});

test('I-051 cpu busy: from two cumulative cpu-time snapshots; null without elapsed time', () => {
  assert.equal(L.cpuBusyPct({ idle: 100, total: 200 }, { idle: 130, total: 300 }), 70);
  assert.equal(L.cpuBusyPct({ idle: 100, total: 200 }, { idle: 100, total: 200 }), null);
  const t = L.cpuTimes();
  assert.ok(t.total > 0 && t.idle >= 0 && t.idle <= t.total);
});

test('I-051 acquire: a waiting reader samples CPU busy over its own polls and joins once the CPU is quiet', async () => {
  const prev = [process.env.FW_LOCK_SHARED_JOIN_LOAD, process.env.FW_LOCK_SHARED_JOIN_BUSY];
  process.env.FW_LOCK_SHARED_JOIN_LOAD = '0.0001'; // load1 alone would never let it join
  delete process.env.FW_LOCK_SHARED_JOIN_BUSY;
  try {
    await on({ cap: 4 });
    assert.equal((await rd('a', { pid: livePid() })).ok, true);
    // cumulative snapshots: 100 % busy, 100 % busy, then 10 % busy over the reader's polls
    const snaps = [{ idle: 0, total: 0 }, { idle: 0, total: 100 }, { idle: 0, total: 200 }, { idle: 90, total: 300 }];
    let n = 0;
    const seen = [];
    const b = await L.acquire(R, { owner: 'b', shared: true, weight: 1, maxSec: 60, held: '', sharedHeld: '', pollMs: 20, maxPollMs: 20, timeoutSec: 10,
      cpuSampler: () => snaps[Math.min(n++, snaps.length - 1)], busyWindowMs: 0, log: (s) => seen.push(s) });
    assert.equal(b.mode, 'shared');
    assert.ok(n >= 4, `it sampled over its polls (${n})`);
    b.release();
  } finally {
    for (const [k, v] of [['FW_LOCK_SHARED_JOIN_LOAD', prev[0]], ['FW_LOCK_SHARED_JOIN_BUSY', prev[1]]]) if (v !== undefined) process.env[k] = v; else delete process.env[k];
  }
});

test('exclusivity: no exclusive acquirer (process, lease, short, gated) gets the lock while a reader holds it', async () => {
  await on();
  assert.equal((await rd('fn')).ok, true);
  for (const o of [{ kind: 'process' }, { kind: 'lease' }, { kind: 'lease', short: true, maxSec: 60 }, { kind: 'lease', host: { quiet: true, reasons: [], sample: {} } }]) {
    const x = await L.tryAcquire(R, { owner: `w-${o.kind}-${o.short ? 's' : 'n'}`, ...o });
    assert.equal(x.ok, false, JSON.stringify(o));
    assert.equal(x.holder.owner, '(shared)');
  }
});

test('exclusivity: a reader never joins an exclusive holder (normal process, lease, short, gated grant)', async () => {
  await on();
  for (const o of [{ kind: 'process' }, { kind: 'lease' }, { kind: 'lease', short: true, maxSec: 60 }]) {
    const w = await L.tryAcquire(R, { owner: 'writer', ...o });
    assert.equal(w.ok, true);
    const r = await rd('fn');
    assert.equal(r.ok, false, JSON.stringify(o));
    assert.equal(r.holder.owner, 'writer');
    await L.release(R, { owner: 'writer' });
    await L.dequeue(R, 'fn');
  }
});

test('a group in an unknown format is an exclusive holder to this code', async () => {
  await on();
  assert.equal((await rd('fn')).ok, true);
  const g = holder();
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...g, format: 'rw2' }));
  const b = await rd('fn2', { pid: livePid() });
  assert.equal(b.ok, false);
  assert.match(b.why, /format "rw2"/);
});

test('writer preference: a queued exclusive waiter closes joins; when the readers drain, the writer goes before queued readers', async () => {
  await on();
  const a = await rd('fn-a');
  assert.equal(a.ok, true);
  const w = await L.tryAcquire(R, { owner: 'ab', kind: 'lease' });
  assert.equal(w.ok, false);
  const b = await rd('fn-b', { pid: livePid() });
  assert.equal(b.ok, false, 'joins are closed while a writer waits');
  assert.match(b.why, /"ab" waits/);
  await L.releaseReader(R, a.reader.token);
  assert.equal(holder(), null, 'the last reader closes the group');
  // fn-b is a short-lane entry, but right after a group the exclusive waiter goes first (no second group in a row)
  const b2 = await rd('fn-b', { pid: b.queue.find((x) => x.owner === 'fn-b').pid });
  assert.equal(b2.ok, false);
  assert.equal(b2.next, 'ab');
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease' })).ok, true);
});

test('I-049: a later exclusive never passes an earlier reader at the hand-over after a group; it still closes joins', async () => {
  await on(); // cap 3
  const t0 = Date.now();
  const a = await rd('npm-a', { weight: 2, now: t0 });
  assert.equal(a.opened, true);
  const pB = livePid();
  assert.equal((await rd('npm-b', { pid: pB, weight: 2, now: t0 + 1000 })).ok, false, '2 + 2 > cap 3');
  assert.equal((await L.tryAcquire(R, { owner: 'cal', kind: 'lease', now: t0 + 2000 })).ok, false, 'queued behind npm-b');
  await L.releaseReader(R, a.reader.token);
  assert.equal(holder(), null);
  const w = await L.tryAcquire(R, { owner: 'cal', kind: 'lease', now: t0 + 3000 });
  assert.equal(w.ok, false, 'right after a group, the exclusive queued later does not pass the reader queued first');
  assert.equal(w.next, 'npm-b');
  const b = await rd('npm-b', { pid: pB, weight: 2, now: t0 + 4000 });
  assert.equal(b.ok, true);
  assert.equal(b.opened, true);
  // writer preference only closes joins: a reader that came after cal waits behind it
  const late = await rd('late', { pid: livePid(), now: t0 + 5000 });
  assert.equal(late.ok, false);
  assert.match(late.why, /"cal" waits/);
  await L.releaseReader(R, b.reader.token);
  assert.equal((await rd('late', { pid: late.queue.find((x) => x.owner === 'late').pid, now: t0 + 6000 })).next, 'cal', 'cal before the reader queued after it');
});

test('I-049: age bound: a reader waiting readerMaxWaitSec goes before an exclusive queued ahead of it', async () => {
  await on();
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const pB = livePid();
  const queue = (readerSince) => JSON.stringify([
    { owner: 'ab', kind: 'lease', checkout: REPO, since: iso(readerSince - 1000), lastSeen: iso(now), queueTtlSec: 600 },
    { owner: 'fn-b', kind: 'process', pid: pB, checkout: REPO, since: iso(readerSince), lastSeen: iso(now), queueTtlSec: 600, short: true, maxSec: 60, shared: true, weight: 1 },
  ]);
  // right after a group (its grant spends the short-drain budget), with nobody holding the lock
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify(L.groupGrant({ token: 'abcdefabcdef' }, now - 20000)));
  const bound = ms(L.SHARED_LANE.readerMaxWaitSec);
  writeFileSync(lockFile(`${R}.queue.json`), queue(now - bound + 60000));
  assert.equal(L.status(R).next, 'ab', 'below the bound: the exclusive queued first goes first');
  writeFileSync(lockFile(`${R}.queue.json`), queue(now - bound - 1000));
  assert.equal(L.status(R).next, 'fn-b', 'past the bound: the reader goes before any exclusive');
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', now })).ok, false);
  const b = await rd('fn-b', { pid: pB, now: now + 1000 });
  assert.equal(b.ok, true);
  assert.equal(b.opened, true);
});

// I-097 (2026-10-03 16:24-16:34Z): the lead moved iphone-runner's --no-timing phone hold to #1, and readers queued more
// than readerMaxWaitSec passed it at every hand-over (the I-049 age bound came before the move) while the phone cooled.
test('I-097: a lead-moved exclusive waiter at the head goes before readers past the I-049 age bound; they wait for its hold', async () => {
  await on();
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const pB = livePid(), pR = livePid();
  const old = now - ms(L.SHARED_LANE.readerMaxWaitSec) - 60000; // both readers waited past the bound
  const runner = { owner: 'iphone-runner', kind: 'process', pid: pR, checkout: REPO, since: iso(now - 30000), lastSeen: iso(now), queueTtlSec: 600, noTiming: true };
  const readers = [
    { owner: 'fn-b', kind: 'process', pid: pB, checkout: REPO, since: iso(old), lastSeen: iso(now), queueTtlSec: 60, short: true, maxSec: 60, shared: true, weight: 1 },
    { owner: 'fn-c', kind: 'lease', checkout: REPO, since: iso(old + 1000), lastSeen: iso(now), queueTtlSec: 60, short: true, maxSec: 60, shared: true, weight: 1 },
  ];
  // right after a group (the live case), and right after an exclusive hold (short lane on)
  for (const lg of [L.groupGrant({ token: 'abcdefabcdef' }, now - 20000), { owner: 'w0', short: false, at: iso(now - 60000), token: '0123456789ab' }]) {
    writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify(lg));
    writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([runner, ...readers]));
    assert.equal(L.status(R).next, 'fn-b', `unmoved: the I-049 age bound still serves the old reader first (${lg.owner})`);
    writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([{ ...runner, movedBy: 'lead', movedAt: iso(now - 5000) }, ...readers]));
    assert.equal(L.status(R).next, 'iphone-runner', `moved by the lead: the move wins over the age bound (${lg.owner})`);
    const b = await rd('fn-b', { pid: pB, now });
    assert.equal(b.ok, false, 'the old reader does not open a group past the moved head');
    assert.equal(b.next, 'iphone-runner');
    assert.match(b.why, /"iphone-runner" is served first/);
    assert.equal(holder(), null);
  }
  const g = await L.tryAcquire(R, { owner: 'iphone-runner', kind: 'process', pid: pR, noTiming: true, now: now + 1000 });
  assert.equal(g.ok, true, 'the moved phone hold is granted at this hand-over');
  assert.equal(g.holder.noTiming, true);
  assert.equal(L.status(R).queue.some((w) => w.owner === 'iphone-runner'), false, 'its entry (and the lead\'s mark) leaves with the grant');
  for (const [o, x] of [['fn-b', { pid: pB }], ['fn-c', { kind: 'lease' }]]) assert.equal((await rd(o, { ...x, now: now + 2000 })).ok, false, `${o} waits for the moved hold to finish`);
  await L.release(R, { owner: 'iphone-runner', force: true });
  // after it, nothing is moved any more: the I-049 age bound applies again
  const b = await rd('fn-b', { pid: pB, now: now + 3000 });
  assert.equal(b.ok, true);
  assert.equal(b.opened, true);
});

test('I-097: the move wins only from where the lead put it: moved behind an old reader, that reader goes first (FIFO, I-049)', async () => {
  await on();
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const pB = livePid();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify(L.groupGrant({ token: 'abcdefabcdef' }, now - 20000)));
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([
    { owner: 'fn-b', kind: 'process', pid: pB, checkout: REPO, since: iso(now - ms(L.SHARED_LANE.readerMaxWaitSec) - 1000), lastSeen: iso(now), queueTtlSec: 60, short: true, maxSec: 60, shared: true, weight: 1 },
    { owner: 'ab', kind: 'lease', checkout: REPO, since: iso(now - 30000), lastSeen: iso(now), queueTtlSec: 600, movedBy: 'lead', movedAt: iso(now - 5000) },
  ]));
  assert.equal(L.status(R).next, 'fn-b');
});

test('I-097: a lead-moved exclusive waiter closes joins to a running group even for the opening batch (readers wait for it)', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await L.tryAcquire(R, { owner: 'w1', kind: 'lease', now: t0 })).ok, true);
  const pB = livePid();
  assert.equal((await rd('fn-a', { now: t0 + 1000 })).ok, false);
  assert.equal((await rd('fn-b', { pid: pB, now: t0 + 2000 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'runner', kind: 'lease', noTiming: true, now: t0 + 3000 })).ok, false);
  await L.release(R, { owner: 'w1' });
  const t1 = t0 + 10000;
  assert.equal((await rd('fn-a', { now: t1 })).opened, true, 'the short lane opens a group for the readers queued first');
  // the lead moves the runner to the head while the group runs: the batch member fn-b no longer joins
  const q = readJson(`${R}.queue.json`);
  const i = q.findIndex((w) => w.owner === 'runner');
  const moved = { ...q[i], movedBy: 'lead', movedAt: new Date(t1 + 1000).toISOString() };
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([moved, ...q.filter((_, j) => j !== i)]));
  const b = await rd('fn-b', { pid: pB, now: t1 + 2000 });
  assert.equal(b.ok, false, 'a batch member does not join past a lead-moved writer');
  assert.match(b.why, /"runner" waits/);
  assert.equal(holder().readers.length, 1, 'the group does not grow');
});

test('writer preference: an old-code waiter (no `shared` field) closes joins too, fresh or not', async () => {
  await on();
  assert.equal((await rd('fn-a')).ok, true);
  const q = [{ owner: 'old-ab', kind: 'lease', since: new Date(Date.now() - 200000).toISOString(), lastSeen: new Date(Date.now() - 120000).toISOString(), queueTtlSec: 600 }];
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
  assert.equal((await rd('fn-b', { pid: livePid() })).ok, false);
});

test('opening batch: readers queued before the group opened join for batchJoinSec despite a waiting writer; later ones wait', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await L.tryAcquire(R, { owner: 'w1', kind: 'lease', now: t0 })).ok, true);
  const pB = livePid(), pC = livePid(), pD = livePid();
  assert.equal((await rd('fn-a', { now: t0 + 1000 })).ok, false);
  assert.equal((await rd('fn-b', { pid: pB, now: t0 + 2000 })).ok, false);
  assert.equal((await rd('fn-c', { pid: pC, now: t0 + 3000 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'w2', kind: 'lease', now: t0 + 4000 })).ok, false);
  await L.release(R, { owner: 'w1' });
  const t1 = t0 + 10000;
  const a = await rd('fn-a', { now: t1 });
  assert.equal(a.ok, true, 'the short lane serves the readers first at a hand-over after an exclusive hold');
  assert.equal(a.opened, true);
  assert.equal(Date.parse(holder().openedAt), t1);
  assert.equal((await rd('fn-b', { pid: pB, now: t1 + 5000 })).ok, true, 'batch member joins although w2 waits');
  const d = await rd('fn-d', { pid: pD, now: t1 + 6000 });
  assert.equal(d.ok, false, 'a reader that arrived after the opening waits behind w2');
  const c = await rd('fn-c', { pid: pC, now: t1 + ms(L.SHARED_LANE.batchJoinSec) + 1000 });
  assert.equal(c.ok, false, 'past the batch window even a batch member waits');
});

test('writer bound: once a writer waits, the group ends by the readers\' deadlines (no join extends it)', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await rd('fn-a', { now: t0, maxSec: 300 })).ok, true);
  const exp0 = Date.parse(holder().expiresAt);
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', now: t0 + 1000 })).ok, false);
  for (let i = 0; i < 5; i++) assert.equal((await rd(`late-${i}`, { pid: livePid(), now: t0 + 2000 + i * 1000 })).ok, false);
  assert.equal(Date.parse(holder().expiresAt), exp0);
  assert.ok(exp0 - t0 <= ms(300 + 5 + 10));
});

test('I-030: a reader never passes a gated writer the lead moved; after a group, readers do not use the gate exemption', async () => {
  await on();
  const BUSY = { quiet: false, reasons: ['cpu'], sample: {} };
  // the lead moved "ab" to the head; it waits at the gate on a free lock
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([]));
  const g1 = await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: BUSY });
  assert.equal(g1.gated, true);
  const q = readJson(`${R}.queue.json`); q[0].movedBy = 'lead'; q[0].movedAt = new Date().toISOString();
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
  assert.equal((await rd('fn')).ok, false);
  // not moved, fresh at the gate, but the last grant was a group: no reader passes it either
  q[0].movedBy = undefined;
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q.map(({ movedBy, movedAt, ...w }) => w)));
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify(L.groupGrant({ token: 'abcdefabcdef' }, Date.now() - 20000)));
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: BUSY })).gated, true);
  assert.equal((await rd('fn')).ok, false);
});

test('stale readers: a dead process reader is pruned; the last prune removes the group (last-stale) and the lock is free', async () => {
  await on();
  const dead = deadPid();
  assert.equal((await rd('fn-a', { pid: dead })).ok, true, 'a dead opener is still recorded (tryAcquire trusts its pid)');
  const pB = livePid();
  const b = await rd('fn-b', { pid: pB });
  assert.equal(b.ok, true);
  assert.deepEqual(holder().readers.map((x) => x.owner), ['fn-b'], 'fn-a was pruned by the next attempt');
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...holder(), readers: [{ ...holder().readers[0], pid: deadPid() }] }));
  const w = await L.tryAcquire(R, { owner: 'ab', kind: 'lease' });
  assert.equal(w.ok, true, 'all readers dead: the group is gone and the writer is granted');
  assert.equal(readJson(`${R}.last-stale.json`).owner, '(shared)');
  assert.match(readJson(`${R}.last-stale.json`).staleBecause, /no live reader/);
});

test('stale readers: a lease reader past its deadline is pruned; the group never outlives its expiry', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await L.tryAcquire(R, { owner: 'lease-a', kind: 'lease', shared: true, weight: 1, maxSec: 30, now: t0, load1: 0 })).ok, true);
  assert.equal(Date.parse(holder().readers[0].deadline), t0 + ms(30), 'a lease reader has no kill grace');
  const x = await rd('fn-b', { pid: livePid(), now: t0 + ms(31) });
  assert.equal(x.ok, true);
  assert.deepEqual(holder().readers.map((r) => r.owner), ['fn-b']);
});

// I-080: a group's last-grant record (groupGrant: short, drain budget spent) only sends an exclusive waiter that waited
// through the group before later short-lane entries. A group that ended with no such waiter queued left it behind, and
// with the lock idle doctor reported last-grant-short-outlived 335 s after the last join (twice on 2026-10-03).
const lastGrant = () => (existsSync(lockFile(`${R}.last-grant.json`)) ? readJson(`${R}.last-grant.json`) : null);
const outlived = () => LR.doctor(R, { now: Date.now() + ms(400) })[0].problems.map((p) => p.code).filter((c) => c.startsWith('last-grant'));
const GATED_BUSY = { quiet: false, reasons: ['cpu'], sample: {} };

test('I-080: the last reader out with no exclusive waiter queued removes the group\'s last-grant record; doctor stays clean', async () => {
  await on();
  const a = await rd('fn-a'), b = await rd('fn-b', { pid: livePid() });
  assert.equal(lastGrant().owner, '(shared)');
  await L.releaseReader(R, a.reader.token);
  assert.equal(lastGrant()?.token, holder().token, 'the group lives on: its record stays');
  const q = [{ owner: 'npm-x', kind: 'lease', checkout: REPO, since: new Date().toISOString(), lastSeen: new Date().toISOString(), queueTtlSec: 60, short: true, maxSec: 120 }];
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
  const out = await L.releaseReader(R, b.reader.token);
  assert.equal(out.closed, true);
  assert.equal(holder(), null);
  assert.equal(lastGrant(), null, 'only short-lane entries queued: the record decides nothing (FIFO either way)');
  assert.equal(L.status(R).next, 'npm-x');
  assert.deepEqual(outlived(), [], 'no last-grant-short-outlived once the lock stays idle');
});

test('I-080: with an exclusive waiter queued at the end, the group\'s record stays for that waiter (writer preference)', async () => {
  await on();
  const a = await rd('fn-a');
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: GATED_BUSY })).ok, false, 'a writer waits through the group');
  assert.equal((await rd('fn-c', { pid: livePid() })).ok, false, 'joins closed');
  await L.releaseReader(R, a.reader.token);
  assert.equal(lastGrant()?.shared, true, 'kept: an exclusive waiter is queued');
  assert.equal(L.status(R).next, 'ab', 'the writer before the reader queued after it');
  const w = await L.tryAcquire(R, { owner: 'ab', kind: 'lease' });
  assert.equal(w.ok, true);
  assert.equal(lastGrant().owner, 'ab', 'its grant replaces the record');
});

test('I-080: a crashed reader: the group pruned for a dead pid takes its last-grant record along', async () => {
  await on();
  assert.equal((await rd('fn-a', { pid: deadPid() })).ok, true);
  assert.equal(lastGrant().owner, '(shared)');
  const g = await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: GATED_BUSY });
  assert.equal(g.gated, true, 'the dead group is pruned; the writer that just arrived waits at the host gate');
  assert.match(readJson(`${R}.last-stale.json`).staleBecause, /no live reader/);
  assert.equal(lastGrant(), null);
  await L.dequeue(R, 'ab');
  assert.deepEqual(outlived(), []);
});

test('I-080: a group cleared as stale (past its expiry) or removed with release --force takes its last-grant record along', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await L.tryAcquire(R, { owner: 'lease-a', kind: 'lease', shared: true, weight: 1, maxSec: 30, now: t0, load1: 0 })).ok, true);
  assert.equal(lastGrant().owner, '(shared)');
  const g = await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: GATED_BUSY, now: t0 + ms(30 + L.SHARED_LANE.expiryGraceSec + 1) });
  assert.equal(g.gated, true);
  assert.equal(lastGrant(), null, 'stale group');
  await L.dequeue(R, 'ab');
  assert.equal((await rd('fn-b', { pid: livePid() })).ok, true);
  assert.equal(lastGrant().owner, '(shared)');
  await L.release(R, { owner: 'lead', force: true });
  assert.equal(holder(), null);
  assert.equal(lastGrant(), null, 'release --force');
  assert.deepEqual(outlived(), []);
});

test('I-080: repair of an empty group (its readers crashed, nobody polled) also removes its record unless a writer waits', async () => {
  await on();
  assert.equal((await rd('fn-a', { pid: livePid() })).ok, true);
  const g = holder();
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...g, readers: [{ ...g.readers[0], pid: deadPid() }] }));
  assert.deepEqual(LR.doctor(R)[0].problems.map((p) => p.code), ['group-reader-dead', 'group-empty', 'last-grant-group-closed']);
  await LR.repair(R, { by: 'lead', reason: 't', apply: true });
  assert.equal(holder(), null);
  assert.equal(lastGrant(), null);
  assert.deepEqual(outlived(), []);
  // with a writer queued, repair leaves the record to it (only the group goes)
  assert.equal((await rd('fn-b', { pid: livePid() })).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: GATED_BUSY })).ok, false);
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...holder(), readers: [{ ...holder().readers[0], pid: deadPid() }] }));
  assert.deepEqual(LR.doctor(R)[0].problems.map((p) => p.code), ['group-reader-dead', 'group-empty']);
  await LR.repair(R, { by: 'lead', reason: 't', apply: true });
  assert.equal(lastGrant()?.shared, true);
});

test('re-entry (B1): FW_LOCK_SHARED re-enters the same reader slot, adds no weight', async () => {
  await on();
  const a = await rd('fn', { weight: 3 });
  const env = L.sharedEnv(R, a.reader.token, '');
  assert.equal(env, `${R}:${a.reader.token}`);
  const again = await rd('fn-child', { pid: livePid(), weight: 3, sharedHeld: env });
  assert.equal(again.ok, true);
  assert.equal(again.reentrant, true);
  assert.equal(again.mode, 'reentrant-shared');
  assert.equal(again.reader.token, a.reader.token);
  assert.equal(holder().readers.length, 1);
});

test('re-entry (B1): an exclusive acquire inside a live reader slot is refused at once, on every path', async () => {
  await on();
  const a = await rd('fn');
  const sharedHeld = L.sharedEnv(R, a.reader.token, '');
  for (const o of [{ kind: 'process' }, { kind: 'lease' }, { kind: 'lease', short: true, maxSec: 60 }, { kind: 'lease', host: { quiet: true, reasons: [], sample: {} } }, { kind: 'process', owner: 'fn' }]) {
    await assert.rejects(L.tryAcquire(R, { owner: 'verify-x', sharedHeld, ...o }), /inside the shared \(functional\) hold of "fn"/, JSON.stringify(o));
  }
  await assert.rejects(L.acquire(R, { owner: 'verify-x', sharedHeld, held: '', timeoutSec: 1, log: () => {} }), /shared \(functional\) hold/);
  // a token that names no live reader (another state dir, a finished reader) refuses nothing: the acquirer just queues
  await L.releaseReader(R, a.reader.token);
  const later = await L.tryAcquire(R, { owner: 'verify-x', kind: 'lease', sharedHeld });
  assert.equal(later.ok, true);
});

test('re-entry: a shared acquire inside an exclusive hold (FW_LOCK_HELD) re-enters it; by owner name too, like a short job (N1)', async () => {
  await on();
  const w = await L.tryAcquire(R, { owner: 'topic', kind: 'lease' });
  const inside = await rd('topic-npm', { held: L.heldEnv(R, w.holder.token, '') });
  assert.equal(inside.ok, true);
  assert.equal(inside.mode, 'reentrant-exclusive');
  assert.equal(inside.holder.owner, 'topic');
  // review-lock-share N1: on main a short job of the same owner re-enters the owner's lease (bench mech inside a
  // fix owner's lease); a shared one does the same, in either switch state, so the switch changes nothing here
  const byName = await rd('topic');
  assert.deepEqual([byName.ok, byName.mode, byName.holder.token], [true, 'reentrant-exclusive', w.holder.token]);
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 't' });
  assert.deepEqual([(await rd('topic')).ok, (await rd('topic')).mode], [true, 'reentrant-exclusive']);
});

test('no-timing holds (ts-lock-bundle): a shared job inside one re-enters it like a short job; a --no-timing job inside a reader is refused; they never combine; a no-timing waiter closes joins', async () => {
  await on();
  const nt = await L.tryAcquire(R, { owner: 'build', kind: 'lease', noTiming: true });
  assert.equal(nt.ok, true);
  const inside = await rd('build-npm', { held: L.heldEnv(R, nt.holder.token, '') });
  assert.deepEqual([inside.ok, inside.mode], [true, 'reentrant-exclusive'], 'functional, like a short job inside the build hold');
  await assert.rejects(rd('x', { noTiming: true }), /--no-timing and --shared do not combine/);
  await L.release(R, { owner: 'build' });
  const a = await rd('fn');
  await assert.rejects(L.tryAcquire(R, { owner: 'build', kind: 'process', noTiming: true, sharedHeld: L.sharedEnv(R, a.reader.token, '') }), /inside the shared \(functional\) hold of "fn"/);
  assert.equal((await L.tryAcquire(R, { owner: 'build', kind: 'lease', noTiming: true })).ok, false, 'queued behind the group');
  const b = await rd('fn-b', { pid: livePid() });
  assert.equal(b.ok, false, 'a queued no-timing build is an exclusive waiter: joins are closed');
  assert.match(b.why, /"build" waits/);
});

test('re-entry: the group is never re-entered by name (GROUP_OWNER) nor by an exclusive acquirer whose owner is a reader', async () => {
  await on();
  assert.equal((await rd('fn', { kind: 'lease' })).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'fn', kind: 'lease' })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'fn', kind: 'process' })).ok, false);
});

test('owners (B3): two readers with one owner are two slots; each leaves by token; exclusive release never touches a group', async () => {
  await on();
  const pid2 = livePid();
  const a = await rd('agent');
  const b = await rd('agent', { pid: pid2 });
  assert.equal(b.ok, true);
  assert.equal(holder().readers.length, 2);
  await assert.rejects(L.release(R, { owner: 'agent' }), /shared group/);
  await assert.rejects(L.release(R, { owner: '(shared)' }), /shared group/);
  await L.releaseReader(R, b.reader.token);
  assert.deepEqual(holder().readers.map((x) => x.token), [a.reader.token]);
  assert.equal((await L.release(R, { force: true })).owner, '(shared)', 'force removes the whole group (lead only)');
});

test('owners (B3): release --shared frees the owner\'s lease reader of this checkout only; process readers end with their process', async () => {
  await on();
  assert.equal((await rd('agent', { kind: 'lease' })).ok, true);
  assert.equal((await rd('proc', { pid: livePid() })).ok, true);
  await assert.rejects(L.release(R, { owner: 'proc', shared: true }), /process/);
  const h = holder();
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...h, readers: h.readers.map((x) => (x.owner === 'agent' ? { ...x, checkout: '/elsewhere' } : x)) }));
  await assert.rejects(L.release(R, { owner: 'agent', shared: true }), /\/elsewhere/);
  writeFileSync(lockFile(`${R}.json`), JSON.stringify(h));
  const rel = await L.release(R, { owner: 'agent', shared: true });
  assert.equal(rel.owner, 'agent');
  assert.deepEqual(holder().readers.map((x) => x.owner), ['proc']);
  // switch off: an `acquire --shared` lease was an exclusive short; `release --shared` releases it like release
  await L.release(R, { force: true });
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 't' });
  assert.equal((await rd('agent', { kind: 'lease' })).mode, 'short');
  assert.equal((await L.release(R, { owner: 'agent', shared: true })).owner, 'agent');
});

test('a lease reader repeated by its owner from the same checkout is the same slot (no second weight); a process reader is not', async () => {
  await on({ cap: 4 });
  const a = await rd('agent', { kind: 'lease', weight: 2 });
  const again = await rd('agent', { kind: 'lease', weight: 2 });
  assert.equal(again.ok, true);
  assert.equal(again.mode, 'reentrant-shared');
  assert.equal(again.reader.token, a.reader.token);
  assert.equal(holder().readers.length, 1);
  const h = holder();
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...h, readers: h.readers.map((x) => ({ ...x, checkout: '/elsewhere' })) }));
  assert.equal((await rd('agent', { kind: 'lease', weight: 2 })).mode, 'shared', 'another checkout\'s lease reader is another slot');
  assert.equal(holder().readers.length, 2);
});

test('acquire(): a re-entrant acquire returns the env its child needs (the reader slot, or the exclusive hold)', async () => {
  await on();
  const a = await L.acquire(R, { owner: 'fn', shared: true, maxSec: 60, held: '', sharedHeld: '', log: () => {} });
  const inner = await L.acquire(R, { owner: 'x', shared: true, maxSec: 60, held: '', sharedHeld: a.env.FW_LOCK_SHARED, log: () => {} });
  assert.deepEqual(inner.env, { FW_LOCK_SHARED: a.env.FW_LOCK_SHARED });
  a.release();
  const w = await L.tryAcquire(R, { owner: 'w', kind: 'lease' });
  const held = L.heldEnv(R, w.holder.token, '');
  const r = await L.acquire(R, { owner: 'fn', shared: true, maxSec: 60, held, sharedHeld: '', log: () => {} });
  assert.equal(r.mode, 'reentrant-exclusive');
  // its child keeps the exclusive hold (FW_LOCK_HELD) and is marked as a functional slot (FW_LOCK_SHARED): nothing
  // timed starts inside it (N2)
  assert.deepEqual(r.env, { FW_LOCK_HELD: held, FW_LOCK_SHARED: `${R}:${w.holder.token}` });
  await assert.rejects(L.tryAcquire(R, { owner: 'verify-x', kind: 'process', held, sharedHeld: r.env.FW_LOCK_SHARED }), /shared \(functional\) hold of "w"/);
  const nested = await rd('fn-2', { held, sharedHeld: r.env.FW_LOCK_SHARED, weight: 4 });
  assert.deepEqual([nested.ok, nested.mode], [true, 'reentrant-shared'], 'an exclusive hold counts as a slot of the full cap');
});

test('queue: reader entries are keyed by (owner, pid); an exclusive entry of the same owner stays separate', async () => {
  await on();
  assert.equal((await L.tryAcquire(R, { owner: 'w', kind: 'lease' })).ok, true);
  const p2 = livePid();
  await rd('agent');
  await rd('agent', { pid: p2 });
  await L.tryAcquire(R, { owner: 'agent', kind: 'lease' });
  const q = L.status(R).queue;
  assert.deepEqual(q.map((x) => [x.owner, !!x.shared]), [['agent', true], ['agent', true], ['agent', false]]);
  assert.equal(LR.doctor(R)[0].problems.filter((p) => p.code === 'queue-duplicate').length, 0, 'doctor uses the same key');
});

test('acquire(): a reader gets env FW_LOCK_SHARED (never FW_LOCK_HELD, never the group token) and leaves on release', async () => {
  await on();
  const a = await L.acquire(R, { owner: 'fn', shared: true, weight: 1, maxSec: 60, held: '', sharedHeld: '', log: () => {} });
  assert.equal(a.mode, 'shared');
  assert.deepEqual(Object.keys(a.env), ['FW_LOCK_SHARED']);
  assert.equal(a.env.FW_LOCK_SHARED, `${R}:${a.reader.token}`);
  assert.ok(!JSON.stringify(a.env).includes(holder().token));
  const inner = await L.acquire(R, { owner: 'fn-inner', shared: true, weight: 1, maxSec: 60, held: '', sharedHeld: a.env.FW_LOCK_SHARED, log: () => {} });
  assert.equal(inner.reentrant, true);
  inner.release();
  assert.equal(holder().readers.length, 1, 'a re-entrant release is a no-op');
  a.release();
  assert.equal(holder(), null);
  // switch off (N2): env carries FW_LOCK_SHARED naming the exclusive short stand-in, never FW_LOCK_HELD, so its
  // command behaves as in a reader slot: a nested shared job re-enters, an exclusive one is refused
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 't' });
  const s = await L.acquire(R, { owner: 'fn', shared: true, weight: 1, maxSec: 60, held: '', sharedHeld: '', log: () => {} });
  assert.equal(s.mode, 'short');
  assert.deepEqual(s.env, { FW_LOCK_SHARED: L.sharedEnv(R, s.holder.token, '') });
  const nested = await L.acquire(R, { owner: 'fn-inner', shared: true, weight: 1, maxSec: 60, held: '', sharedHeld: s.env.FW_LOCK_SHARED, log: () => {} });
  assert.deepEqual([nested.mode, nested.env], ['reentrant-shared', s.env]);
  await assert.rejects(L.acquire(R, { owner: 'verify-x', held: '', sharedHeld: s.env.FW_LOCK_SHARED, timeoutSec: 1, log: () => {} }), /shared \(functional\) hold of "fn"/);
  s.release();
});

test('status / wait see readers: held-by and released-by name a reader; free and idle are false while a group lives', async () => {
  await on();
  assert.equal((await rd('fn-a')).ok, true);
  const st = L.status(R);
  assert.equal(W.lockConditionMet(W.parseLockCondition('held-by:fn-a'), st).met, true);
  assert.equal(W.lockConditionMet(W.parseLockCondition('mine', 'fn-a'), st).met, true);
  assert.equal(W.lockConditionMet(W.parseLockCondition('released-by:fn-a'), st).met, false);
  assert.equal(W.lockConditionMet(W.parseLockCondition('free'), st).met, false);
  assert.equal(W.lockConditionMet(W.parseLockCondition('position<=1', 'fn-a'), st).met, true);
  assert.match(W.lockState(st), /shared by 1 reader: fn-a/);
});

test('doctor / repair: dead reader, empty group, expiry below a deadline, unknown format', async () => {
  await on();
  assert.equal((await rd('fn-a', { pid: livePid() })).ok, true);
  const g = holder();
  const dead = { ...g.readers[0], owner: 'gone', token: 'aaaaaaaaaaaa', pid: deadPid() };
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...g, readers: [...g.readers, dead], expiresAt: new Date(Date.parse(g.readers[0].deadline) - 1000).toISOString() }));
  const codes = LR.doctor(R)[0].problems.map((p) => p.code).sort();
  assert.deepEqual(codes, ['group-expiry-short', 'group-reader-dead']);
  const rep = await LR.repair(R, { by: 'lead', reason: 't', apply: true });
  assert.equal(rep.applied, true);
  assert.deepEqual(holder().readers.map((x) => x.owner), ['fn-a']);
  assert.equal(Date.parse(holder().expiresAt), Date.parse(holder().readers[0].deadline) + ms(10));
  assert.deepEqual(LR.doctor(R)[0].problems, []);
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...holder(), readers: [] }));
  // I-080: the removed group was the last grant and no writer is queued: its record goes in the same repair
  assert.deepEqual(LR.doctor(R)[0].problems.map((p) => p.code), ['group-empty', 'last-grant-group-closed']);
  await LR.repair(R, { by: 'lead', reason: 't', apply: true });
  assert.equal(holder(), null);
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...g, format: 'rw9' }));
  assert.ok(LR.doctor(R)[0].problems.some((p) => p.code === 'group-format-unknown'));
});

// ---- mixed versions (B2): the lock code from before the lane, as it is on main at PRE_LANE ----------------------------
// The last main commit before the shared lane; its tools/lib is extracted to a temp dir and imported as a second module
// instance, so these tests run against the real old code, not a model of it.
const PRE_LANE = '6d1b7ad';
let OLD = null, OLDR = null;
{
  const env = { ...process.env }; for (const k of Object.keys(env)) if (/^GIT_/.test(k)) delete env[k];
  const has = spawnSync('git', ['cat-file', '-e', `${PRE_LANE}^{commit}`], { cwd: REPO, env });
  if (has.status === 0) {
    const d = tempDir('fw-oldlock-');
    const tar = spawnSync('git', ['archive', PRE_LANE, 'tools/lib'], { cwd: REPO, env, maxBuffer: 64 * 1024 * 1024 });
    mkdirSync(d, { recursive: true });
    const x = spawnSync('tar', ['-x', '-C', d], { input: tar.stdout });
    if (tar.status === 0 && x.status === 0) {
      OLD = await import(pathToFileURL(join(d, 'tools', 'lib', 'lock.mjs')).href);
      OLDR = await import(pathToFileURL(join(d, 'tools', 'lib', 'lock-repair.mjs')).href);
    }
  }
}
const old = (name, fn) => test(`old lock code (${PRE_LANE}): ${name}`, { skip: OLD ? false : `commit ${PRE_LANE} not in this repo` }, fn);

old('sees a live group as busy on every acquire path and never re-enters it', async () => {
  await on();
  const a = await rd('fn-a');
  assert.equal(typeof OLD.tryAcquire, 'function');
  assert.equal(OLD.status(R).stale, null);
  for (const o of [{ kind: 'process' }, { kind: 'lease' }, { kind: 'lease', short: true, maxSec: 60 }, { kind: 'lease', host: { quiet: true, reasons: [], sample: {} } }]) {
    const x = await OLD.tryAcquire(R, { owner: 'old-ab', ...o });
    assert.equal(x.ok, false, JSON.stringify(o));
    await OLD.dequeue(R, 'old-ab');
  }
  // an old-code descendant of a reader (the reader's token in FW_LOCK_HELD, if anything ever put it there) still waits
  assert.equal((await OLD.tryAcquire(R, { owner: 'old-ab', kind: 'process', held: OLD.heldEnv(R, a.reader.token, '') })).ok, false);
  // the reader's owner name is no way in either
  assert.equal((await OLD.tryAcquire(R, { owner: 'fn-a', kind: 'lease' })).ok, false);
  await assert.rejects(OLD.release(R, { owner: 'fn-a' }), /held by "\(shared\)"/);
  await assert.rejects(OLD.renew(R, { owner: 'fn-a', ttlSec: 60 }), /not held/);
});

old('an old-code waiter closes joins; when the group drains, the old waiter is granted by the old code', async () => {
  await on();
  const a = await rd('fn-a');
  assert.equal((await OLD.tryAcquire(R, { owner: 'old-ab', kind: 'lease' })).ok, false);
  assert.equal((await rd('fn-b', { pid: livePid() })).ok, false);
  await L.releaseReader(R, a.reader.token);
  assert.equal((await OLD.tryAcquire(R, { owner: 'old-ab', kind: 'lease' })).ok, true);
  assert.equal((await rd('fn-b', { pid: livePid() })).ok, false, 'a reader waits behind the old exclusive holder');
});

old('old and new code agree on who is served next, or new code picks a reader that goes itself (no reader and old waiter each waiting for the other)', async () => {
  await on();
  const fresh = () => new Date().toISOString();
  const rdr = (owner, since) => ({ owner, kind: 'lease', checkout: REPO, since, lastSeen: fresh(), queueTtlSec: 60, short: true, maxSec: 60, shared: true, weight: 1 });
  const normal = (owner, since) => ({ owner, kind: 'lease', checkout: REPO, since, lastSeen: fresh(), queueTtlSec: 600 });
  const short = (owner, since) => ({ owner, kind: 'lease', checkout: REPO, since, lastSeen: fresh(), queueTtlSec: 60, short: true, maxSec: 120 });
  const t = (s) => new Date(Date.now() - s * 1000).toISOString();
  // [name, queue, new code's pick, old code's pick]. I-049: where they differ, new code picks a reader queued before the
  // normal waiter; a reader is always new code, so it takes its turn itself while the old waiter takes its own: a race
  // the guard settles, never two waiters each waiting for the other
  const cases = [
    ['after a group: a normal waiter before every later short-lane entry', [normal('old-ab', t(60)), rdr('fn-b', t(50)), short('npm-x', t(40))], 'old-ab', 'old-ab'],
    ['after a group: a reader queued before the normal waiter goes first in new code (I-049)', [rdr('fn-b', t(50)), short('npm-x', t(40)), normal('old-ab', t(30))], 'fn-b', 'old-ab'],
    ['after a group, no normal waiter: short-lane entries FIFO', [rdr('fn-b', t(50)), short('npm-x', t(40))], 'fn-b', 'fn-b'],
    ['after a group, no normal waiter: short-lane entries FIFO (exclusive short first)', [short('npm-x', t(50)), rdr('fn-b', t(40))], 'npm-x', 'npm-x'],
    // I-097: the lead's move wins over the I-049 age bound, as it did before I-049: the versions agree again
    ['after a group: a lead-moved normal waiter at the head goes before a reader past the age bound (I-097)', [{ ...normal('old-ab', t(30)), movedBy: 'lead', movedAt: t(5) }, rdr('fn-b', t(L.SHARED_LANE.readerMaxWaitSec + 60))], 'old-ab', 'old-ab'],
  ];
  // a real group: opened, then closed by its last reader while these waiters queue (its last-grant record, or none when
  // no exclusive waiter was queued at its end, I-080, is what both versions read)
  for (const [name, q, wantNew, wantOld] of cases) {
    writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([]));
    const a = await rd('fn-a');
    writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
    await L.releaseReader(R, a.reader.token);
    assert.equal(L.status(R).next, wantNew, `new: ${name}`);
    assert.equal(OLD.status(R).next, wantOld, `old: ${name}`);
    if (wantNew !== wantOld) assert.equal(q.find((w) => w.owner === wantNew).shared, true, `new code's pick is a reader (new code): ${name}`);
  }
  // after an exclusive normal hold: the short lane (readers too) goes first in both
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([]));
  assert.equal((await L.tryAcquire(R, { owner: 'w', kind: 'lease' })).ok, true);
  await L.release(R, { owner: 'w' });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([normal('old-ab', t(50)), rdr('fn-b', t(40))]));
  assert.equal(L.status(R).next, 'fn-b');
  assert.equal(OLD.status(R).next, 'fn-b');
});

old('old doctor finds nothing to repair in a live group; old status shows it held by "(shared)"', async () => {
  await on();
  await rd('fn-a');
  await rd('fn-b', { pid: livePid() });
  assert.deepEqual(OLDR.doctor(R)[0].problems, []);
  assert.equal(OLD.status(R).holder.owner, '(shared)');
});

test('N5/N6: timedInSlotRefusal refuses a timed tool whenever FW_LOCK_SHARED names chrome-measure (live slot or not) or FW_SIM_FUNCTIONAL=1', async () => {
  assert.equal(L.timedInSlotRefusal('iphone.mjs scroll', {}), null);
  assert.equal(L.timedInSlotRefusal('iphone.mjs scroll', { FW_LOCK_SHARED: 'iphone:abcdefabcdef' }), null);
  assert.match(L.timedInSlotRefusal('iphone.mjs scroll', { FW_LOCK_SHARED: `${R}:abcdefabcdef` }), /iphone\.mjs scroll is a timing run.*shared \(functional\) slot \(FW_LOCK_SHARED\)/);
  assert.match(L.timedInSlotRefusal('x', { FW_SIM_FUNCTIONAL: '1' }), /functional Simulator session/);
  await on();
  const a = await rd('fn');
  assert.match(L.timedInSlotRefusal('x', { FW_LOCK_SHARED: L.sharedEnv(R, a.reader.token, '') }), /slot of "fn"/);
});

// I-113: a lease waiter (`lock.mjs acquire`, exit 3 BUSY) that re-runs keeps its place and its "since" for the normal
// queue TTL (10 min), shared and short ones too (they had 60 s: ts-i103's shared entry from 04:03:44Z reappeared at the
// back as 04:34:49Z after its owner waited with `lock.mjs wait`). Process waiters still drop with their process.
test('I-113: a shared lease waiter that re-runs after 90 s keeps its place and its since; the hand-over still skips it while it is not polling', async () => {
  await on({ cap: 4 });
  const t0 = Date.now();
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', ttlSec: 1200, now: t0 })).ok, true, 'an exclusive lease holds the lock');
  const lease = (owner, at, o = {}) => L.tryAcquire(R, { owner, kind: 'lease', shared: true, weight: 2, maxSec: 300, load1: 0, ncpu: 8, now: at, ...o });
  const first = await lease('ts-a', t0 + 1000);
  assert.equal(first.position, 1);
  const since = first.queue[0].since;
  assert.equal((await lease('ts-b', t0 + 10000)).position, 2);
  // ts-a stops polling (exit 3, then a `lock.mjs wait`); ts-b keeps polling past the old 60 s window
  for (const s of [40, 70, 85]) assert.equal((await lease('ts-b', t0 + s * 1000)).position, 2, `ts-b at +${s} s stays behind ts-a`);
  const again = await lease('ts-a', t0 + 90000);
  assert.equal(again.position, 1, 'the re-run keeps its place');
  assert.equal(again.queue[0].since, since, 'and its original since');
  // still dropped once it is not seen for the normal queue TTL (10 min)
  assert.equal((await lease('ts-b', t0 + 90000 + 601000)).position, 1, 'gone after 10 min unseen');
});

test('I-113: a short lease waiter (and a shared one with the switch off) keeps its place across a 90 s gap; process waiters keep the 60 s window', async () => {
  const t0 = Date.now();
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', ttlSec: 600, now: t0 })).ok, true);
  const sh = (owner, at, o = {}) => L.tryAcquire(R, { owner, kind: 'lease', short: true, maxSec: 120, now: at, ...o });
  assert.equal((await sh('s-a', t0 + 1000)).position, 1);
  assert.equal((await L.tryAcquire(R, { owner: 'sw-off', kind: 'lease', shared: true, weight: 1, maxSec: 120, now: t0 + 2000 })).position, 2, 'switch off: a short entry');
  const pid = livePid();
  assert.equal((await L.tryAcquire(R, { owner: 'p-run', kind: 'process', pid, short: true, maxSec: 120, now: t0 + 3000 })).position, 3);
  assert.equal((await sh('s-b', t0 + 4000)).position, 4);
  for (const s of [40, 70, 85]) await sh('s-b', t0 + s * 1000);
  const q = L.status(R).queue;
  assert.deepEqual(q.map((w) => w.owner), ['s-a', 'sw-off', 's-b'], 'the leases stay; the process waiter that stopped polling for 60 s is gone');
  assert.equal(q[0].queueTtlSec, 600);
  assert.equal((await sh('s-a', t0 + 90000)).position, 1, 'the short lease re-run keeps its place');
});

test('I-113: a short lease entry that is not polling does not stop a polling short job from passing a gate-held head writer', async () => {
  const now = Date.now(), iso = (t) => new Date(t).toISOString();
  mkdirSync(join(state, 'locks'), { recursive: true });
  // the head writer is held by its host gate right now (fresh gate record, early in its gate wait): short jobs may pass it
  const writer = { owner: 'ab', kind: 'lease', checkout: REPO, since: iso(now - 20000), lastSeen: iso(now), queueTtlSec: 600, gate: { since: iso(now - 5000), at: iso(now - 1000), quiet: false, reasons: ['cpu'] } };
  const idle = { owner: 'idle-short', kind: 'lease', checkout: REPO, since: iso(now - 15000), lastSeen: iso(now - 85000), queueTtlSec: 600, short: true, maxSec: 120 };
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([writer, idle]));
  const r = await L.tryAcquire(R, { owner: 'npm-y', kind: 'lease', short: true, maxSec: 120, now });
  assert.equal(r.ok, true, 'the polling short job passes; the unseen one keeps its place');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['ab', 'idle-short']);
});
