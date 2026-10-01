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

test('config: one constant holds the cap, the per-job weights and the bounds; the join load is the cpu count', () => {
  assert.deepEqual(L.SHARED_LANE, {
    cap: 4, maxSec: 300, batchJoinSec: 30, expiryGraceSec: 10, killGraceSec: 5,
    weights: { check: 1, probe: 1, 'bench-mech': 1, 'test-chrome-fn': 1, 'npm-test': 2, simulator: 3 },
  });
  assert.ok(Object.isFrozen(L.SHARED_LANE) && Object.isFrozen(L.SHARED_LANE.weights));
  for (const w of Object.values(L.SHARED_LANE.weights)) assert.ok(Number.isInteger(w) && w >= 1 && w <= L.SHARED_LANE.cap);
  const prev = process.env.FW_LOCK_SHARED_JOIN_LOAD;
  delete process.env.FW_LOCK_SHARED_JOIN_LOAD;
  try { assert.equal(L.sharedJoinLoad(), os.cpus().length); } finally { if (prev !== undefined) process.env.FW_LOCK_SHARED_JOIN_LOAD = prev; }
  assert.equal(L.GROUP_OWNER, '(shared)');
  assert.equal(L.SHARED_FORMAT, 'rw1');
});

test('switch: absent = off; only the lead turns it on or off, with a reason, audited; the cap can be lowered', async () => {
  assert.deepEqual(L.sharedSwitch(R), { enabled: false, cap: 4 });
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'someone', reason: 'x' }), /--by lead/);
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead' }), /--reason/);
  await assert.rejects(L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'x', cap: 9 }), /cap/);
  await assert.rejects(L.setSharedSwitch('iphone', { on: true, by: 'lead', reason: 'x' }), /iphone/);
  await on({ cap: 3 });
  assert.equal(L.sharedSwitch(R).enabled, true);
  assert.equal(L.sharedSwitch(R).cap, 3);
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 'rollback' });
  assert.equal(L.sharedSwitch(R).enabled, false);
  const audit = readFileSync(LR.auditFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(audit.map((a) => [a.code, a.by, a.reason]), [['shared-switch', 'lead', 'test'], ['shared-switch', 'lead', 'rollback']]);
});

test('argument checks: max-seconds 1..300 and weight 1..cap are required; never with short or no iphone; "(" owners are reserved', async () => {
  await on();
  await assert.rejects(rd('a', { maxSec: undefined }), /max-seconds/);
  await assert.rejects(rd('a', { maxSec: 301 }), /max-seconds/);
  await assert.rejects(rd('a', { weight: 0 }), /weight/);
  await assert.rejects(rd('a', { weight: 5 }), /weight/);
  await assert.rejects(rd('a', { weight: 1.5 }), /weight/);
  await assert.rejects(rd('a', { short: true }), /--short/);
  await assert.rejects(L.tryAcquire('iphone', { owner: 'a', shared: true, weight: 1, maxSec: 60 }), /iphone/);
  await assert.rejects(L.tryAcquire(R, { owner: '(shared)', kind: 'lease' }), /reserved/);
  await assert.rejects(rd('(x)'), /reserved/);
});

test('switch off: a shared acquire is an exclusive short hold with the same max-seconds (tools never branch)', async () => {
  const a = await rd('fn-a', { maxSec: 120 });
  assert.equal(a.ok, true);
  assert.equal(a.mode, 'short');
  assert.equal(a.holder.shared, undefined);
  assert.deepEqual([a.holder.owner, a.holder.short, a.holder.maxSec], ['fn-a', true, 120]);
  assert.equal(a.reader, undefined);
  const b = await rd('fn-b');
  assert.equal(b.ok, false, 'no parallel readers while the lane is off');
});

test('readers share: two join one group (weights 2+2), the group reads as a live short lease, a third waits at the cap', async () => {
  await on();
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

test('re-entry: a shared acquire inside an exclusive hold (FW_LOCK_HELD) re-enters it; by owner name it does not', async () => {
  await on();
  const w = await L.tryAcquire(R, { owner: 'topic', kind: 'lease' });
  const inside = await rd('topic-npm', { held: L.heldEnv(R, w.holder.token, '') });
  assert.equal(inside.ok, true);
  assert.equal(inside.mode, 'reentrant-exclusive');
  assert.equal(inside.holder.owner, 'topic');
  const byName = await rd('topic');
  assert.equal(byName.ok, false, 'the same owner name is no proof that this job belongs to that hold');
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
  await on();
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
  assert.deepEqual(r.env, { FW_LOCK_HELD: held });
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
  // switch off: env carries FW_LOCK_HELD of the exclusive short
  await L.setSharedSwitch(R, { on: false, by: 'lead', reason: 't' });
  const s = await L.acquire(R, { owner: 'fn', shared: true, weight: 1, maxSec: 60, held: '', sharedHeld: '', log: () => {} });
  assert.equal(s.mode, 'short');
  assert.deepEqual(s.env, { FW_LOCK_HELD: L.heldEnv(R, s.holder.token, '') });
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
  assert.deepEqual(LR.doctor(R)[0].problems.map((p) => p.code), ['group-empty']);
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

old('old and new code agree on who is served next (no reader and old waiter each waiting for the other)', async () => {
  await on();
  const fresh = () => new Date().toISOString();
  const rdr = (owner, since) => ({ owner, kind: 'lease', checkout: REPO, since, lastSeen: fresh(), queueTtlSec: 60, short: true, maxSec: 60, shared: true, weight: 1 });
  const normal = (owner, since) => ({ owner, kind: 'lease', checkout: REPO, since, lastSeen: fresh(), queueTtlSec: 600 });
  const short = (owner, since) => ({ owner, kind: 'lease', checkout: REPO, since, lastSeen: fresh(), queueTtlSec: 60, short: true, maxSec: 120 });
  const t = (s) => new Date(Date.now() - s * 1000).toISOString();
  const cases = [
    ['after a group: a normal waiter before every short-lane entry', [rdr('fn-b', t(50)), short('npm-x', t(40)), normal('old-ab', t(30))], 'old-ab'],
    ['after a group, no normal waiter: short-lane entries FIFO', [rdr('fn-b', t(50)), short('npm-x', t(40))], 'fn-b'],
    ['after a group, no normal waiter: short-lane entries FIFO (exclusive short first)', [short('npm-x', t(50)), rdr('fn-b', t(40))], 'npm-x'],
  ];
  // a real group: opened, then closed by its last reader (its last-grant record is what both versions read)
  const a = await rd('fn-a');
  await L.releaseReader(R, a.reader.token);
  for (const [name, q, want] of cases) {
    writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
    assert.equal(L.status(R).next, want, `new: ${name}`);
    assert.equal(OLD.status(R).next, want, `old: ${name}`);
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
