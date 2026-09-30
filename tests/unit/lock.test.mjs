// tools/lib/lock.mjs in-process: acquire/release/renew/status, FIFO queue, stale recovery, guard.
// Every test uses its own $FW_STATE_DIR, so the real cross-worktree locks are never touched.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const R = 'test-res';
let state;
beforeEach(() => { state = tempDir('fw-lock-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const readJson = (f) => JSON.parse(readFileSync(lockFile(f), 'utf8'));
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid; // a pid that just exited

test('lock dir follows FW_STATE_DIR', () => {
  assert.equal(L.lockDir(), join(state, 'locks'));
});

test('lease: acquire, re-entrant renew, status, release', async () => {
  const a = await L.tryAcquire(R, { owner: 'a', kind: 'lease', ttlSec: 60, meta: { url: 'https://x/' } });
  assert.equal(a.ok, true);
  assert.equal(a.holder.owner, 'a');
  assert.equal(a.holder.kind, 'lease');
  assert.equal(a.holder.pid, undefined);
  assert.deepEqual(a.holder.meta, { url: 'https://x/' });
  assert.match(a.holder.token, /^[0-9a-f]{12}$/);
  assert.ok(Math.abs(Date.parse(a.holder.expiresAt) - Date.now() - 60000) < 5000);
  assert.ok(existsSync(lockFile(`${R}.json`)));

  const again = await L.tryAcquire(R, { owner: 'a', kind: 'lease', ttlSec: 600 });
  assert.equal(again.ok, true);
  assert.equal(again.reentrant, true);
  assert.ok(Date.parse(again.holder.expiresAt) - Date.now() > 500000);

  const s = L.status(R);
  assert.equal(s.holder.owner, 'a');
  assert.equal(s.stale, null);
  assert.deepEqual(s.queue, []);

  assert.throws(() => L.status('Bad Name'), /bad resource name/);
  await assert.rejects(L.tryAcquire(R, { kind: 'lease' }), /owner is required/);

  const rel = await L.release(R, { owner: 'a' });
  assert.equal(rel.owner, 'a');
  assert.equal(L.status(R).holder, null);
  assert.equal(await L.release(R, { owner: 'a' }), null, 'releasing a free lock is a no-op');
});

test('busy: FIFO queue, positions, only the head may take a freed lock', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'a' })).ok, true);
  const b = await L.tryAcquire(R, { owner: 'b' });
  const c = await L.tryAcquire(R, { owner: 'c' });
  assert.deepEqual([b.ok, b.position, c.ok, c.position], [false, 1, false, 2]);
  assert.equal(b.holder.owner, 'a');
  // retrying keeps your place (and your original "since")
  const b2 = await L.tryAcquire(R, { owner: 'b' });
  assert.equal(b2.position, 1);
  assert.equal(b2.queue[0].since, b.queue[0].since);
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['b', 'c']);

  await L.release(R, { owner: 'a' });
  const cEarly = await L.tryAcquire(R, { owner: 'c' });
  assert.equal(cEarly.ok, false, 'c must not jump the queue');
  assert.equal(cEarly.holder, null);
  assert.equal(cEarly.position, 2);
  const late = await L.tryAcquire(R, { owner: 'd' });
  assert.equal(late.position, 3);

  const bWin = await L.tryAcquire(R, { owner: 'b' });
  assert.equal(bWin.ok, true);
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['c', 'd']);

  await L.dequeue(R, 'c');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['d']);
});

test('release by a non-owner is refused unless forced', async () => {
  await L.tryAcquire(R, { owner: 'a' });
  await assert.rejects(L.release(R, { owner: 'b' }), /held by "a", not "b"/);
  assert.equal(L.status(R).holder.owner, 'a');
  const h = await L.release(R, { owner: 'b', force: true });
  assert.equal(h.owner, 'a');
  assert.equal(L.status(R).holder, null);
});

test('renew extends only your own live lease', async () => {
  await L.tryAcquire(R, { owner: 'a', ttlSec: 10 });
  const h = await L.renew(R, { owner: 'a', ttlSec: 900 });
  assert.ok(Date.parse(h.expiresAt) - Date.now() > 890000);
  await assert.rejects(L.renew(R, { owner: 'b', ttlSec: 60 }), /not held by "b" \(holder: a\)/);
  await L.release(R, { owner: 'a' });
  await assert.rejects(L.renew(R, { owner: 'a', ttlSec: 60 }), /not held by "a"/);
});

test('stale process holder (dead pid) is replaced and recorded in last-stale.json', async () => {
  const pid = deadPid();
  await L.tryAcquire(R, { owner: 'crashed', kind: 'process', pid });
  assert.equal(L.status(R).stale, `pid ${pid} is gone`);
  const b = await L.tryAcquire(R, { owner: 'b', kind: 'process' });
  assert.equal(b.ok, true);
  assert.equal(b.holder.pid, process.pid);
  const last = readJson(`${R}.last-stale.json`);
  assert.equal(last.owner, 'crashed');
  assert.equal(last.clearedBy, 'b');
  assert.match(last.staleBecause, /is gone/);
  await L.release(R, { owner: 'b' });
});

test('a live process holder is not stale; the same owner in another pid queues', async () => {
  await L.tryAcquire(R, { owner: 'a', kind: 'process' });
  assert.equal(L.status(R).stale, null);
  const other = await L.tryAcquire(R, { owner: 'a', kind: 'process', pid: process.ppid });
  assert.equal(other.ok, false);
  assert.equal(other.position, 1);
});

test('expired lease is taken over', async () => {
  const past = new Date(Date.now() - 1000).toISOString();
  mkdirSync(join(state, 'locks'), { recursive: true });
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ resource: R, owner: 'old', kind: 'lease', token: 'x', acquiredAt: past, expiresAt: past }));
  assert.match(L.status(R).stale, /^expired at/);
  const b = await L.tryAcquire(R, { owner: 'b' });
  assert.equal(b.ok, true);
  assert.equal(readJson(`${R}.last-stale.json`).owner, 'old');
});

test('stale queue head (not refreshed within its queue TTL, or dead process waiter) is dropped', async () => {
  mkdirSync(join(state, 'locks'), { recursive: true });
  const old = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([
    { owner: 'gone-agent', kind: 'lease', since: old, lastSeen: old },
    { owner: 'dead-proc', kind: 'process', pid: deadPid(), since: now, lastSeen: now },
    { owner: 'short-ttl', kind: 'lease', since: now, lastSeen: new Date(Date.now() - 3000).toISOString(), queueTtlSec: 1 },
  ]));
  assert.deepEqual(L.status(R).queue, []);
  const c = await L.tryAcquire(R, { owner: 'c' });
  assert.equal(c.ok, true, 'the head-of-queue entries were stale, so c takes the free lock');
});

test('a guard dir left by a process that died in the critical section is removed after 10 s', async () => {
  const g = lockFile(`${R}.guard`);
  mkdirSync(g, { recursive: true });
  const t = new Date(Date.now() - 20000);
  utimesSync(g, t, t);
  const a = await L.tryAcquire(R, { owner: 'a' });
  assert.equal(a.ok, true);
  assert.equal(existsSync(g), false);
});

test('acquire() waits for the holder and then takes the lock; release() of the handle is token-safe', async () => {
  await L.tryAcquire(R, { owner: 'a' });
  const logs = [];
  const p = L.acquire(R, { owner: 'b', kind: 'lease', pollMs: 30, maxPollMs: 60, log: (s) => logs.push(s) });
  let done = false;
  p.then(() => (done = true));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(done, false, 'must wait while a holds it');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['b']);
  assert.ok(logs.some((l) => /busy: held by "a"/.test(l)), logs.join('\n'));
  await L.release(R, { owner: 'a' });
  const h = await p;
  assert.equal(h.holder.owner, 'b');
  // someone force-takes it; b's release handle must not delete the new holder
  await L.release(R, { owner: 'x', force: true });
  await L.tryAcquire(R, { owner: 'c' });
  h.release();
  assert.equal(L.status(R).holder.owner, 'c');
});

test('acquire() times out, leaves the queue and says who holds the lock', async () => {
  await L.tryAcquire(R, { owner: 'a' });
  await assert.rejects(L.acquire(R, { owner: 'b', kind: 'lease', timeoutSec: 0.2, pollMs: 30, maxPollMs: 30, log: () => {} }), /timed out after 0.2 s; held by a/);
  assert.deepEqual(L.status(R).queue, []);
});

test('allStatus lists the known resources and any ad-hoc ones', async () => {
  await L.tryAcquire(R, { owner: 'a' });
  const names = L.allStatus().map((s) => s.resource);
  for (const n of ['chrome-measure', 'iphone', R]) assert.ok(names.includes(n), names.join(','));
});

test('acquire() during a hand-over (free, another waiter is next) says so instead of "held by undefined"', async () => {
  await L.tryAcquire(R, { owner: 'a' });
  await L.tryAcquire(R, { owner: 'b' });
  await L.release(R, { owner: 'a' });
  const logs = [];
  await assert.rejects(L.acquire(R, { owner: 'c', timeoutSec: 0.2, pollMs: 50, log: (s) => logs.push(s) }), (e) => {
    assert.doesNotMatch(e.message, /undefined/);
    assert.match(e.message, /handing over to "b"/);
    return true;
  });
  assert.ok(logs.length > 0);
  for (const l of logs) assert.doesNotMatch(l, /undefined/);
  assert.match(logs[0], /handing over to "b"/);
});

// Short lane (incident I-007): a short job (the pre-commit `npm test`, ~35 s) waits for the current
// holder, but is served before earlier normal waiters (5-min A/Bs) at the next hand-over; at most one
// short job runs between two normal holders; a short holder is bounded by its max-seconds.
const SHORT = { short: true, maxSec: 90 };
test('short lane: a short job queued behind long ones is served at the next hand-over, never preempts', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'ab1' })).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'ab2' })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'ab3' })).ok, false);
  const s = await L.tryAcquire(R, { owner: 'commit', ...SHORT });
  assert.equal(s.ok, false, 'a short job never preempts the current holder');
  assert.equal(s.holder.owner, 'ab1');
  assert.equal(s.queue.find((w) => w.owner === 'commit').short, true);
  assert.equal(s.next, 'commit', 'the short job is next at the hand-over');

  await L.release(R, { owner: 'ab1' });
  const ab2 = await L.tryAcquire(R, { owner: 'ab2' });
  assert.equal(ab2.ok, false, 'the queue head waits for the short job');
  assert.equal(ab2.next, 'commit');
  const win = await L.tryAcquire(R, { owner: 'commit', ...SHORT });
  assert.equal(win.ok, true);
  assert.equal(win.holder.short, true);
  assert.equal(win.holder.maxSec, 90);
  assert.ok(Math.abs(Date.parse(win.holder.expiresAt) - Date.now() - 90000) < 5000, 'a short holder expires at max-seconds');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['ab2', 'ab3']);

  await L.release(R, { owner: 'commit' });
  assert.equal((await L.tryAcquire(R, { owner: 'ab3' })).ok, false, 'FIFO again among normal waiters');
  assert.equal((await L.tryAcquire(R, { owner: 'ab2' })).ok, true);
});

test('short lane drains: queued short jobs go back to back at a hand-over, then the normal waiter (I-011)', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, true);
  await L.tryAcquire(R, { owner: 'n2' });
  await L.tryAcquire(R, { owner: 's1', ...SHORT });
  await L.tryAcquire(R, { owner: 's2', ...SHORT });
  await L.tryAcquire(R, { owner: 's3', ...SHORT });
  const order = [];
  for (let i = 0; i < 4; i++) {
    await L.release(R, { owner: L.status(R).holder.owner });
    // every waiter polls; exactly one of them wins
    const won = [];
    for (const w of L.status(R).queue) {
      const r = await L.tryAcquire(R, { owner: w.owner, ...(w.short ? SHORT : {}) });
      if (r.ok) won.push(w.owner);
    }
    assert.equal(won.length, 1, `exactly one winner at hand-over ${i + 1}: ${won}`);
    order.push(won[0]);
  }
  // was ['s1', 'n2', 's2', 's3'] (one short job per normal holder): with 30-45 min A/B holds that made
  // four 1-min test jobs wait ~2 h; now the three shorts (3 x 90 s <= SHORT_DRAIN_SEC) drain first
  assert.deepEqual(order, ['s1', 's2', 's3', 'n2']);
});

test('short lane: max-seconds is required and bounded, cannot be stretched, and an overrunning short holder is replaced', async () => {
  await assert.rejects(L.tryAcquire(R, { owner: 'x', short: true }), /max-seconds/);
  await assert.rejects(L.tryAcquire(R, { owner: 'x', short: true, maxSec: 0 }), /max-seconds/);
  await assert.rejects(L.tryAcquire(R, { owner: 'x', short: true, maxSec: L.SHORT_MAX_SEC + 1 }), /max-seconds/);
  assert.ok(L.SHORT_MAX_SEC <= 300, 'the lane stays short');

  const s = await L.tryAcquire(R, { owner: 's', kind: 'lease', ttlSec: 3600, ...SHORT });
  assert.equal(s.ok, true);
  assert.ok(Date.parse(s.holder.expiresAt) - Date.now() < 95000, '--ttl does not stretch a short lease');
  const again = await L.tryAcquire(R, { owner: 's', kind: 'lease', ttlSec: 3600 });
  assert.equal(again.ok, true);
  assert.ok(Date.parse(again.holder.expiresAt) - Date.now() < 95000, 're-acquiring does not stretch a short lease');
  await assert.rejects(L.renew(R, { owner: 's', ttlSec: 900 }), /short/);

  await L.tryAcquire(R, { owner: 'n' });
  const h = readJson(`${R}.json`);
  h.expiresAt = new Date(Date.now() - 1000).toISOString();
  writeFileSync(lockFile(`${R}.json`), JSON.stringify(h));
  const n = await L.tryAcquire(R, { owner: 'n' });
  assert.equal(n.ok, true, 'an overrunning short holder is released at max-seconds');
  assert.equal(readJson(`${R}.last-stale.json`).owner, 's');
});

// Incident I-011: clients on lock code from before the short lane grant by plain FIFO and never write
// last-grant.json, so a `short: true` record outlived the normal grants that followed it and short
// waiters deferred to normal ones for good.
const oldClientGrant = (owner) => {
  // what pre-25391a2 code writes: a holder record, no last-grant, no `short`
  mkdirSync(join(state, 'locks'), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ resource: R, owner, kind: 'lease', token: 'a1b2c3d4e5f6', acquiredAt: now, expiresAt: new Date(Date.now() + 600000).toISOString(), meta: {} }));
};

test('short lane with old clients: a normal grant made by old code (no last-grant write) counts once any new client sees it', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 's0', ...SHORT })).ok, true);
  await L.release(R, { owner: 's0' });
  assert.equal(readJson(`${R}.last-grant.json`).short, true);
  oldClientGrant('old-ab');
  const n1 = await L.tryAcquire(R, { owner: 'n1' });
  const s1 = await L.tryAcquire(R, { owner: 's1', ...SHORT });
  assert.equal(s1.ok, false, 'never preempts the old client');
  assert.equal(s1.next, 's1', 'the last grant (old-ab) was normal, so the short job is next');
  assert.equal(L.status(R).next, 's1');
  await L.release(R, { owner: 'old-ab' });
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 's1', ...SHORT })).ok, true);
  assert.equal(n1.position, 1);
});

test('short lane with old clients: a short last-grant record older than any short hold cannot block short waiters', async () => {
  mkdirSync(join(state, 'locks'), { recursive: true });
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString(), now = new Date().toISOString();
  // the stuck record from the incident (no maxSec/token), then old clients came and went unseen
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'lead-land-i007', short: true, at: old }));
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([
    { owner: 'n1', kind: 'lease', since: old, lastSeen: now },
    { owner: 's1', kind: 'lease', since: now, lastSeen: now, short: true, maxSec: 90, queueTtlSec: 60 },
  ]));
  assert.equal(L.status(R).next, 's1');
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 's1', ...SHORT })).ok, true);
});

test('short lane cannot starve normal waiters: a short run ends within SHORT_DRAIN_SEC, then the normal waiter goes', async () => {
  assert.ok(L.SHORT_DRAIN_SEC >= L.SHORT_MAX_SEC && L.SHORT_DRAIN_SEC <= 600);
  assert.equal((await L.tryAcquire(R, { owner: 's1', ...SHORT })).ok, true);
  const lg = readJson(`${R}.last-grant.json`);
  assert.equal(lg.short, true);
  assert.equal(lg.runStart, lg.at, 'the first short grant after a normal one starts a run');
  await L.tryAcquire(R, { owner: 'n1' });
  await L.tryAcquire(R, { owner: 's2', ...SHORT });
  // the run started 250 s ago (s1 was its latest job): s2's 90 s would end it past the budget
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ ...lg, runStart: new Date(Date.now() - 250000).toISOString() }));
  assert.equal(L.status(R).next, 'n1');
  await L.release(R, { owner: 's1' });
  assert.equal((await L.tryAcquire(R, { owner: 's2', ...SHORT })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, true);
  assert.equal(readJson(`${R}.last-grant.json`).runStart, undefined, 'a normal grant ends the run');
  await L.release(R, { owner: 'n1' });
  const s2 = await L.tryAcquire(R, { owner: 's2', ...SHORT });
  assert.equal(s2.ok, true);
  assert.equal(readJson(`${R}.last-grant.json`).runStart, s2.holder.acquiredAt, 'a new run');
});
