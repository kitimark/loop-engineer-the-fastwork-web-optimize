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
