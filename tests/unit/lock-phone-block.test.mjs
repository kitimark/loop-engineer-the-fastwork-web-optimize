// I-160: Simulator sessions (shared readers, job `simulator`) started beside a timed phone block and took Mac load1 to
// 80-170 during P-111's holds. The runner marks its iphone lease with the block (--block) and opens a between-holds
// window after each hold (--between); a Simulator session is deferred (out of the queue, listed in <r>.deferred.json)
// while the block is on and no window that fits it is open. The warm Simulator's keeper counts the lease holder's
// --no-timing hold as demand. Every test uses its own $FW_STATE_DIR (I-041).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const SW = await import('../../tools/lib/sim-warm.mjs');
const R = 'chrome-measure';
let state;
delete process.env.FW_LOCK_SHARED;
beforeEach(() => { state = tempDir('fw-pblock-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const iphone = () => JSON.parse(readFileSync(lockFile('iphone.json'), 'utf8'));
const kids = [];
const livePid = () => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); kids.push(c); return c.pid; };
after(() => { for (const c of kids) try { c.kill('SIGKILL'); } catch {} });
const on = () => L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'test', cap: 6 });
const sim = (owner, o = {}) => L.tryAcquire(R, { owner, kind: 'process', shared: true, job: 'simulator', weight: 3, maxSec: 300, load1: 0, ncpu: 8, ...o });
const fn = (owner, o = {}) => L.tryAcquire(R, { owner, kind: 'process', shared: true, weight: 1, maxSec: 60, load1: 0, ncpu: 8, ...o });
const lease = (owner, now) => L.tryAcquire('iphone', { owner, kind: 'lease', ttlSec: 3600, now });

test('I-160 describeHold: --block and --between mark the iphone lease; validated; a phone run or --block none ends the window', async () => {
  const t0 = Date.now();
  await lease('runner', t0);
  await assert.rejects(L.describeHold(R, { owner: 'x', block: 'P-1' }), /iphone lease/);
  await assert.rejects(L.describeHold('iphone', { owner: 'runner', block: 'bad id!' }), /ticket id/);
  await assert.rejects(L.describeHold('iphone', { owner: 'runner', betweenMin: 500 }), /0\.\.120/);
  await assert.rejects(L.describeHold('iphone', { owner: 'other', block: 'P-1' }), /held by "runner"/);
  let h = await L.describeHold('iphone', { owner: 'runner', block: 'P-114', now: t0 });
  assert.deepEqual(h.meta.block, { id: 'P-114', at: new Date(t0).toISOString() });
  h = await L.describeHold('iphone', { owner: 'runner', block: 'P-114', now: t0 + 5000 });
  assert.equal(h.meta.block.at, new Date(t0).toISOString(), 'the same ticket keeps its start');
  h = await L.describeHold('iphone', { owner: 'runner', betweenMin: 10, now: t0 });
  assert.deepEqual(h.meta.between, { at: new Date(t0).toISOString(), until: new Date(t0 + 600000).toISOString() });
  assert.deepEqual(L.phoneBlock(iphone(), t0), { owner: 'runner', id: 'P-114', since: new Date(t0).toISOString(), between: h.meta.between, run: null });
  h = await L.describeHold('iphone', { owner: 'runner', run: { text: 'scroll', since: new Date(t0).toISOString(), pid: process.pid } });
  assert.equal(h.meta.between, undefined, 'a phone run ends the window');
  assert.equal(h.meta.block.id, 'P-114', 'the block stays');
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 5 });
  assert.ok(iphone().meta.between);
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 0 });
  assert.equal(iphone().meta.between, undefined, '--between 0 ends it');
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 5 });
  await L.describeHold('iphone', { owner: 'runner', block: null });
  assert.equal(iphone().meta.block, undefined);
  assert.equal(iphone().meta.between, undefined, '--block none ends the window too');
  assert.equal(L.phoneBlock(iphone()), null);
});

test('I-160 simDeferral: only on a live lease with a block; a window that fits lets a session start; the runner holding, queued or running shuts it', async () => {
  const t0 = Date.now();
  const ph = { owner: 'runner', kind: 'lease', acquiredAt: new Date(t0).toISOString(), expiresAt: new Date(t0 + 3600000).toISOString(), meta: {} };
  const d = (o = {}) => L.simDeferral({ owner: 'sim-a', maxSec: 300, h: null, q: [], now: t0, ph, ...o });
  assert.equal(d(), null, 'no block mark: never deferred');
  ph.meta.block = { id: 'P-114', at: new Date(t0).toISOString() };
  assert.match(d(), /^deferred: phone block P-114 of "runner" runs on the iPhone and no between-holds window is open: .*--between <min>.*\(I-160\)$/);
  assert.equal(d({ owner: 'runner' }), null, 'the lease owner\'s own session is never deferred');
  assert.equal(d({ ph: { ...ph, expiresAt: new Date(t0 - 1000).toISOString() } }), null, 'a stale lease defers nothing');
  ph.meta.between = { at: new Date(t0).toISOString(), until: new Date(t0 + 600000).toISOString() };
  assert.equal(d(), null, 'a 10 min window fits a 300 s session');
  assert.match(d({ now: t0 + 400000 }), /window ends at .*, before this session's 300 s would/);
  assert.equal(d({ now: t0 + 400000, maxSec: 120 }), null, 'a shorter session still fits');
  assert.match(d({ now: t0 + 700000 }), /window ended at/);
  assert.match(d({ h: { owner: 'runner', kind: 'process', noTiming: true } }), /window is shut \("runner" holds chrome-measure\)/);
  assert.match(d({ q: [{ owner: 'runner', noTiming: true }] }), /window is shut \("runner" waits for its next chrome-measure hold\)/);
  assert.match(d({ ph: { ...ph, meta: { ...ph.meta, run: { pid: process.pid } } } }), /a phone run of "runner" is on/);
  assert.equal(d({ ph: { ...ph, meta: { ...ph.meta, run: { pid: 999999 } } } }), null, 'a dead run marker does not shut it');
  assert.equal(d({ h: { owner: 'someone', kind: 'process' } }), null, 'another holder: the lock decides as usual');
});

test('I-160 tryAcquire: a Simulator session is deferred (out of the queue, listed) while a block runs; other readers are not; a window lets it open a group', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await lease('runner', t0)).ok, true);
  await L.describeHold('iphone', { owner: 'runner', block: 'P-114', now: t0 });
  const pS = livePid();
  const a = await sim('sim-a', { pid: pS, now: t0 + 1000 });
  assert.equal(a.ok, false);
  assert.equal(a.deferred, true);
  assert.match(a.why, /phone block P-114/);
  assert.equal(a.position, 0);
  assert.deepEqual(L.status(R).queue, [], 'not a queue entry (old lock code never waits behind it)');
  assert.deepEqual(L.status(R).deferred.map((w) => [w.owner, w.pid]), [['sim-a', pS]]);
  assert.equal(L.status(R).holder, null);
  // a plain functional reader is not deferred
  const pF = livePid();
  const f = await fn('fn-b', { pid: pF, now: t0 + 2000 });
  assert.equal(f.opened, true);
  await L.releaseReader(R, f.reader.token);
  // a numeric --weight 3 session is deferred when the caller says it is a Simulator session (`run` of sim.mjs session)
  const n = await L.tryAcquire(R, { owner: 'sim-n', kind: 'process', pid: livePid(), shared: true, weight: 3, maxSec: 300, sim: true, load1: 0, ncpu: 8, now: t0 + 2500 });
  assert.equal(n.deferred, true);
  // the runner opens a 10 min window: the session opens a group and leaves the deferred list
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 10, now: t0 + 3000 });
  const b = await sim('sim-a', { pid: pS, now: t0 + 4000 });
  assert.equal(b.ok, true);
  assert.equal(b.opened, true);
  assert.deepEqual(L.status(R).deferred?.map((w) => w.owner) ?? [], ['sim-n']);
  await L.releaseReader(R, b.reader.token);
});

test('I-160 tryAcquire: a queued Simulator session leaves the queue when a block starts and re-queues at the back; the runner\'s grant closes the window; the lane-off stand-in is deferred too', async () => {
  await on();
  const t0 = Date.now();
  const pA = livePid(), pB = livePid(), pS = livePid(), pR = livePid();
  const g = await fn('fn-a', { pid: pA, weight: 4, now: t0 }); // the group is (nearly) full: the session queues
  assert.equal(g.opened, true);
  assert.equal((await sim('sim-s', { pid: pS, now: t0 + 1000 })).ok, false);
  assert.equal((await fn('fn-b', { pid: pB, weight: 3, now: t0 + 1500 })).ok, false);
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['sim-s', 'fn-b']);
  await lease('runner', t0 + 2000);
  await L.describeHold('iphone', { owner: 'runner', block: 'P-200', now: t0 + 2000 });
  const d = await sim('sim-s', { pid: pS, now: t0 + 3000 });
  assert.equal(d.deferred, true);
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['fn-b'], 'its entry is gone; fn-b is next');
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 20, now: t0 + 4000 });
  assert.equal((await sim('sim-s', { pid: pS, now: t0 + 5000 })).ok, false);
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['fn-b', 'sim-s'], 'back in the queue, at the back');
  assert.equal(L.status(R).deferred, undefined);
  // the runner queues its next hold: the window is shut for new sessions, and its grant ends the window for good
  await L.releaseReader(R, g.reader.token);
  await L.dequeue(R, 'fn-b');
  await L.dequeue(R, 'sim-s');
  const w = await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 6000 });
  assert.equal(w.ok, true);
  assert.equal(iphone().meta.between, undefined, 'the runner\'s next hold closed the window');
  assert.equal(iphone().meta.block.id, 'P-200');
  await L.release(R, { owner: 'runner' });
  // the switch off: a shared Simulator acquire (an exclusive short stand-in) is deferred just the same
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 'test' });
  const off = await sim('sim-s', { pid: pS, now: t0 + 7000 });
  assert.equal(off.deferred, true);
  assert.equal(off.mode, 'short');
  // the lease ends: nothing is deferred any more
  await L.release('iphone', { owner: 'runner' });
  const go = await sim('sim-s', { pid: pS, now: t0 + 8000 });
  assert.equal(go.ok, true);
  assert.equal(L.status(R).deferred, undefined);
});

test('I-160 acquire(): a deferred Simulator session polls on and starts when the window opens; a deferred list entry of a dead process is pruned', async () => {
  await on();
  await lease('runner');
  await L.describeHold('iphone', { owner: 'runner', block: 'P-300' });
  const logs = [];
  const p = L.acquire(R, { owner: 'sim-q', shared: true, job: 'simulator', weight: 3, maxSec: 120, pollMs: 50, maxPollMs: 100, log: (s) => logs.push(s), cpuSampler: () => ({ idle: 1, total: 1 }) });
  for (let i = 0; i < 100 && !L.status(R).deferred; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(L.status(R).deferred.map((w) => w.owner), ['sim-q']);
  await L.describeHold('iphone', { owner: 'runner', betweenMin: 5 });
  const got = await p;
  assert.equal(got.mode, 'shared');
  assert.match(logs.join('\n'), /deferred: phone block P-300/);
  got.release();
  assert.equal(L.status(R).holder, null);
});

test('I-160 timingDemand: the iphone lease holder\'s --no-timing hold (held or queued, or marked phone-block priority) is demand for the warm Simulator\'s keeper', () => {
  const st = (holder, ...queue) => ({ holder, stale: null, queue });
  const nt = { owner: 'runner', kind: 'process', noTiming: true };
  assert.equal(SW.timingDemand(st(nt)), null, 'without the lease owner, a no-timing hold is no demand (as before)');
  assert.equal(SW.timingDemand(st(nt), { phoneOwner: 'runner' }), 'chrome-measure is held by "runner" for a phone block (a --no-timing hold of the iphone lease holder)');
  assert.equal(SW.timingDemand(st(nt), { phoneOwner: 'other' }), null);
  assert.equal(SW.timingDemand(st({ ...nt, owner: 'build' }), { phoneOwner: 'runner' }), null, 'another owner\'s build is no demand');
  assert.equal(SW.timingDemand(st(null, { owner: 'fn', shared: true, short: true }, nt), { phoneOwner: 'runner' }), '"runner" waits for a phone-block hold of chrome-measure (a --no-timing hold of the iphone lease holder)');
  assert.match(SW.timingDemand(st(null, { ...nt, movedBy: 'phone-block priority' })), /"runner" waits for a phone-block hold/, 'the I-136 mark alone is enough');
  assert.equal(SW.timingDemand({ holder: nt, stale: 'pid 1 is gone', queue: [] }, { phoneOwner: 'runner' }), null, 'a stale holder holds nothing');
  assert.equal(SW.timingDemand(st({ owner: 'ab', kind: 'process' }), { phoneOwner: 'runner' }), 'chrome-measure is held by "ab" (a timing hold)', 'timing demand still first');
  assert.equal(SW.leaseOwner({ holder: { owner: 'runner' }, stale: null }), 'runner');
  assert.equal(SW.leaseOwner({ holder: { owner: 'runner' }, stale: 'expired' }), null);
  assert.equal(SW.leaseOwner({ holder: null }), null);
});

test('I-160 status: no deferred field on a lock without deferred sessions; never on the iphone', () => {
  assert.equal(L.status(R).deferred, undefined);
  assert.equal(L.status('iphone').deferred, undefined);
  assert.equal(existsSync(lockFile(`${R}.deferred.json`)), false);
});
