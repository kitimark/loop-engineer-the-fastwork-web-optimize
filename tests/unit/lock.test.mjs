// tools/lib/lock.mjs in-process: acquire/release/renew/status, FIFO queue, stale recovery, guard.
// Every test uses its own $FW_STATE_DIR, so the real cross-worktree locks are never touched.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, sleep } from '../helpers.mjs';

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

test('I-091: a noShorten renew (iphone.mjs run before every run) never shortens a longer live lease; a plain renew still sets now + ttl', async () => {
  await L.tryAcquire(R, { owner: 'a', kind: 'lease', ttlSec: 1800 }); // the owner set a 30-min lease on purpose
  const long = Date.parse(L.status(R).holder.expiresAt);
  const rn = await L.renew(R, { owner: 'a', ttlSec: 900, noShorten: true }); // the run needs only 900 s
  assert.equal(Date.parse(rn.expiresAt), long, `kept the longer expiry (${rn.expiresAt})`);
  assert.equal(Date.parse(L.status(R).holder.expiresAt), long, 'and wrote it so');
  // a run that needs more than is left still extends it
  const ext = await L.renew(R, { owner: 'a', ttlSec: 2400, noShorten: true });
  assert.ok(Date.parse(ext.expiresAt) - Date.now() > 2390000, `extended to now + 2400 s (${ext.expiresAt})`);
  // an explicit renew from the owner keeps its semantics: the new expiry is now + ttl, shorter or not
  const plain = await L.renew(R, { owner: 'a', ttlSec: 600 });
  assert.ok(Math.abs(Date.parse(plain.expiresAt) - Date.now() - 600000) < 5000, `plain renew: now + 600 s (${plain.expiresAt})`);
  // still only your own live lease, and never a short job
  await assert.rejects(L.renew(R, { owner: 'b', ttlSec: 60, noShorten: true }), /not held by "b"/);
});

test('I-091: a re-entrant acquire by the same owner never shortens its live lease; the chrome-measure cap still applies', async () => {
  await L.tryAcquire(R, { owner: 'a', kind: 'lease', ttlSec: 1800 });
  const long = Date.parse(L.status(R).holder.expiresAt);
  const re = await L.tryAcquire(R, { owner: 'a', kind: 'lease', ttlSec: 900, meta: { job: { text: 'next run' } } });
  assert.equal(re.reentrant, true);
  assert.equal(Date.parse(re.holder.expiresAt), long, `re-entry kept the longer expiry (${re.holder.expiresAt})`);
  assert.equal(Date.parse(L.status(R).holder.expiresAt), long);
  assert.deepEqual(L.status(R).holder.meta.job, { text: 'next run' }, 'the job description is still refreshed');
  const up = await L.tryAcquire(R, { owner: 'a', kind: 'lease', ttlSec: 3600 });
  assert.ok(Date.parse(up.holder.expiresAt) - Date.now() > 3590000, 're-entry with a longer ttl still extends it');
  await L.release(R, { owner: 'a' });
  // chrome-measure: keeping the expiry never passes acquiredAt + maxHoldSec
  const CMR = 'chrome-measure', { maxHoldSec } = L.LEASE_POLICY[CMR];
  await L.tryAcquire(CMR, { owner: 'a', kind: 'lease', ttlSec: 900 });
  const cm = Date.parse(L.status(CMR).holder.expiresAt);
  const cre = await L.tryAcquire(CMR, { owner: 'a', kind: 'lease', ttlSec: 300 });
  assert.equal(Date.parse(cre.holder.expiresAt), cm, 'a shorter re-entry keeps the chrome-measure lease too');
  const cmax = await L.tryAcquire(CMR, { owner: 'a', kind: 'lease', ttlSec: maxHoldSec });
  assert.ok(Date.parse(cmax.holder.expiresAt) <= Date.parse(cmax.holder.acquiredAt) + maxHoldSec * 1000, 'within the cap');
  await L.release(CMR, { owner: 'a' });
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

// incident I-005: `lock.mjs run` holds the lock in its own pid and exports FW_LOCK_HELD=<resource>:<token>
// to its command; a descendant (verify.mjs, fix.mjs ab) presenting it re-enters instead of queueing
// behind its own ancestor forever.
test('held token: a descendant presenting the holder\'s token re-enters (any owner/pid), touching neither holder nor queue', async () => {
  const a = await L.tryAcquire(R, { owner: 'wrapper', kind: 'process', pid: process.ppid, ttlSec: 600 });
  assert.equal(a.ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'b' })).position, 1);
  const before = readJson(`${R}.json`);
  for (const held of [`${R}:${a.holder.token}`, `iphone:ffffffffffff,${R}:${a.holder.token}`]) {
    const c = await L.tryAcquire(R, { owner: 'child', kind: 'process', ttlSec: 5, held });
    assert.equal(c.ok, true, held);
    assert.equal(c.reentrant, true);
    assert.equal(c.inherited, true);
    assert.equal(c.holder.owner, 'wrapper');
  }
  assert.deepEqual(readJson(`${R}.json`), before, 'the ancestor\'s holder record (pid, TTL) is unchanged');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['b'], 'FIFO queue unchanged; the child never joined it');
});

test('held token: forged, truncated, other-resource or empty tokens queue like anyone else', async () => {
  const a = await L.tryAcquire(R, { owner: 'wrapper', kind: 'process', pid: process.ppid });
  const t = a.holder.token;
  const bad = [`${R}:0123456789ab`, `${R}:${t.slice(1)}`, `${R}:${t}0`, `iphone:${t}`, `${R}x:${t}`, t, `${R}:`, '', undefined];
  for (const [i, held] of bad.entries()) {
    const c = await L.tryAcquire(R, { owner: `forger-${i}`, kind: 'process', held });
    assert.equal(c.ok, false, String(held));
    assert.equal(c.position, i + 1);
  }
  assert.equal(L.status(R).holder.owner, 'wrapper');
});

test('held token: a stale holder\'s token grants nothing (the queue head still goes first)', async () => {
  const pid = deadPid();
  const a = await L.tryAcquire(R, { owner: 'crashed', kind: 'process', pid });
  mkdirSync(join(state, 'locks'), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([{ owner: 'b', kind: 'lease', since: now, lastSeen: now }]));
  const c = await L.tryAcquire(R, { owner: 'orphan', kind: 'process', held: `${R}:${a.holder.token}` });
  assert.equal(c.ok, false);
  assert.equal(c.position, 2);
  assert.equal((await L.tryAcquire(R, { owner: 'b' })).ok, true);
});

test('acquire() with FW_LOCK_HELD from the environment: returns at once, its release() and exit leave the ancestor\'s hold', async () => {
  const a = await L.tryAcquire(R, { owner: 'wrapper', kind: 'process', pid: process.ppid });
  const exitListeners = process.listenerCount('exit'), termListeners = process.listenerCount('SIGTERM');
  const saved = process.env.FW_LOCK_HELD;
  process.env.FW_LOCK_HELD = `${R}:${a.holder.token}`;
  try {
    const h = await L.acquire(R, { owner: 'verify', kind: 'process', timeoutSec: 1, pollMs: 30, log: () => {} });
    assert.equal(h.holder.owner, 'wrapper');
    assert.equal(process.listenerCount('exit'), exitListeners, 'no exit handler that would release the ancestor\'s hold');
    assert.equal(process.listenerCount('SIGTERM'), termListeners);
    h.release();
    assert.equal(L.status(R).holder.owner, 'wrapper');
    assert.equal(L.status(R).holder.token, a.holder.token);
  } finally {
    if (saved === undefined) delete process.env.FW_LOCK_HELD; else process.env.FW_LOCK_HELD = saved;
  }
});

test('re-entering a lease of the same owner (the FW_LOCK_OWNER workaround): the inner handle does not release the lease', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'topic', kind: 'lease', ttlSec: 600 })).ok, true);
  const h = await L.acquire(R, { owner: 'topic', kind: 'process', timeoutSec: 1, pollMs: 30, log: () => {} });
  h.release();
  assert.equal(L.status(R).holder?.owner, 'topic', 'only `lock.mjs release` (or the TTL) ends the lease');
});

test('a re-entrant child process (same-owner lease, or FW_LOCK_HELD token) never releases the outer hold on exit or SIGTERM', async () => {
  const lib = JSON.stringify(new URL('../../tools/lib/lock.mjs', import.meta.url).href);
  const child = (owner, env, sig) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `const L = await import(${lib}); await L.acquire(${JSON.stringify(R)}, { owner: ${JSON.stringify(owner)}, kind: 'process', timeoutSec: 2, pollMs: 50, log: () => {} }); console.log('IN'); ${sig ? `process.kill(process.pid, '${sig}'); setTimeout(() => {}, 5000);` : ''}`],
    { env: { ...process.env, FW_STATE_DIR: state, ...env }, encoding: 'utf8', timeout: 15000 });
  // same-owner lease (the pre-I-005 workaround: FW_LOCK_OWNER=<lease owner> fix.mjs ab)
  const lease = await L.tryAcquire(R, { owner: 'topic', kind: 'lease', ttlSec: 600 });
  for (const sig of [null, 'SIGTERM']) {
    const r = child('topic', { FW_LOCK_HELD: '' }, sig);
    assert.match(r.stdout, /^IN$/m, r.stderr);
    assert.equal(L.status(R).holder?.token, lease.holder.token, `lease survives a re-entrant child's ${sig || 'exit'}`);
  }
  await L.release(R, { owner: 'topic' });
  // token re-entry into a process hold (lock.mjs run -> verify.mjs)
  const run = await L.tryAcquire(R, { owner: 'wrapper', kind: 'process', pid: process.ppid });
  for (const sig of [null, 'SIGTERM']) {
    const r = child('verify', { FW_LOCK_HELD: `${R}:${run.holder.token}` }, sig);
    assert.match(r.stdout, /^IN$/m, r.stderr);
    assert.equal(L.status(R).holder?.token, run.holder.token, `the wrapper's hold survives a re-entrant child's ${sig || 'exit'}`);
  }
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
  for (const n of ['chrome-measure', 'iphone', 'simulator', R]) assert.ok(names.includes(n), names.join(','));
  assert.ok(!L.GATED.simulator, 'ts-lock-share: the simulator lock is strict FIFO, never host-gated');
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
  // I-081: a short hold's record outlives it only while someone is queued, so n1 waits from s0's hold on
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, false);
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
  assert.ok(L.SHORT_DRAIN_SEC >= 3 * L.SHORT_MAX_SEC && L.SHORT_DRAIN_SEC <= 900, 'drain all queued shorts, but a normal waiter waits at most ~15 min (I-020)');
  assert.equal((await L.tryAcquire(R, { owner: 's1', ...SHORT })).ok, true);
  const lg = readJson(`${R}.last-grant.json`);
  assert.equal(lg.short, true);
  assert.equal(lg.runStart, lg.at, 'the first short grant after a normal one starts a run');
  await L.tryAcquire(R, { owner: 'n1' });
  await L.tryAcquire(R, { owner: 's2', ...SHORT });
  // the run started SHORT_DRAIN_SEC - 50 s ago (s1 was its latest job): s2's 90 s would end it past the budget
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ ...lg, runStart: new Date(Date.now() - (L.SHORT_DRAIN_SEC - 50) * 1000).toISOString() }));
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

test('I-020: at a hand-over ALL queued shorts (180/240/300 s caps, ~100 s each) drain before the queued normal waiter', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, true);
  await L.tryAcquire(R, { owner: 'n2' });
  const caps = { s1: 180, s2: 240, s3: 300 };
  for (const [o, maxSec] of Object.entries(caps)) await L.tryAcquire(R, { owner: o, short: true, maxSec });
  const order = [];
  for (let i = 0; i < 4; i++) {
    const held = L.status(R).holder.owner;
    await L.release(R, { owner: held });
    // each short job really ran ~100 s: move the run start back (the 300 s budget allowed only s1 here)
    const lg = readJson(`${R}.last-grant.json`);
    if (lg.runStart) writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ ...lg, runStart: new Date(Date.parse(lg.runStart) - 100000).toISOString(), at: new Date(Date.parse(lg.at) - 100000).toISOString() }));
    const won = [];
    for (const w of L.status(R).queue) if ((await L.tryAcquire(R, { owner: w.owner, ...(w.short ? { short: true, maxSec: caps[w.owner] } : {}) })).ok) won.push(w.owner);
    assert.equal(won.length, 1, `one winner at hand-over ${i + 1}: ${won}`);
    order.push(won[0]);
  }
  assert.deepEqual(order, ['s1', 's2', 's3', 'n2']);
});

test('I-020: the drain cap still ends a short run: a short that would end past SHORT_DRAIN_SEC waits for the normal waiter', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, true);
  await L.tryAcquire(R, { owner: 'n2' });
  await L.tryAcquire(R, { owner: 's9', short: true, maxSec: 300 });
  await L.release(R, { owner: 'n1' });
  const t = Date.now();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 240, at: new Date(t - 5000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 200) * 1000).toISOString(), token: 'cccccccccccc' }));
  assert.equal(L.status(R).next, 'n2', '700 s into the run + 300 s > 900 s');
  assert.equal((await L.tryAcquire(R, { owner: 's9', short: true, maxSec: 300 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'n2' })).ok, true);
});

test('a second SIGTERM while the lock\'s signal handler exits does not skip the other exit handlers (incident I-008)', async () => {
  // verify.mjs holds chrome-measure (kind 'process') and kills its browser in an 'exit' listener
  // (lib/cdp.mjs killOnExit). fix.mjs ab forwards SIGTERM to verify.mjs twice (signal handler, then its
  // own 'exit' listener). With process.once the SIGTERM listener was gone after the first signal, so the
  // default action killed verify.mjs midway through process.exit(): lock released, browser orphaned.
  // Deterministic: the child's exit listener announces itself and spins until the second signal is sent.
  const { spawn } = await import('node:child_process');
  const started = join(state, 'exit-started'), sent = join(state, 'second-sent'), done = join(state, 'exit-done');
  const child = `
    import { writeFileSync, existsSync } from 'node:fs';
    const L = await import(${JSON.stringify(new URL('../../tools/lib/lock.mjs', import.meta.url).href)});
    await L.acquire(${JSON.stringify(R)}, { owner: 'sig', kind: 'process', log: () => {} });
    process.on('exit', () => {
      writeFileSync(${JSON.stringify(started)}, '');
      for (const t = Date.now() + 5000; Date.now() < t && !existsSync(${JSON.stringify(sent)});) {}
      for (const t = Date.now() + 200; Date.now() < t;) {} // let the second signal land
      writeFileSync(${JSON.stringify(done)}, '');
    });
    console.log('ready');
    setInterval(() => {}, 1000);`;
  const p = spawn(process.execPath, ['--input-type=module', '-e', child], { env: { ...process.env, FW_STATE_DIR: state }, stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((r) => p.on('exit', (code, signal) => r({ code, signal })));
  await new Promise((r) => p.stdout.once('data', r));
  assert.equal(L.status(R).holder.owner, 'sig');
  p.kill('SIGTERM');
  for (const t = Date.now() + 5000; Date.now() < t && !existsSync(started);) await new Promise((r) => setTimeout(r, 5));
  assert.ok(existsSync(started), 'exit listeners started');
  p.kill('SIGTERM');
  writeFileSync(sent, '');
  assert.deepEqual(await exited, { code: 130, signal: null }, 'exited via the handler, not killed by the second SIGTERM');
  assert.ok(existsSync(done), 'the later exit listener (the browser kill) ran to completion');
  assert.equal(L.status(R).holder, null, 'lock released');
});

// Incident I-020 (research/architecture/tools-speed.md #1, #4): an idle lease kept chrome-measure for
// 40 min; hand-overs waited 8-15 s for the next waiter's backoff; a head waiter that retries every few
// minutes could keep a free lock unused for up to its queue TTL.
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const CM = 'chrome-measure';

test('I-020: a normal chrome-measure lease gets a default TTL and a hard cap; other resources and short leases unchanged', async () => {
  const { defaultTtlSec, maxHoldSec } = L.LEASE_POLICY[CM];
  assert.ok(defaultTtlSec >= 600 && maxHoldSec >= defaultTtlSec, 'the TTL must exceed an A/B plus a probe');
  const a = await L.tryAcquire(CM, { owner: 'a', kind: 'lease' });
  assert.equal(a.ok, true);
  assert.ok(Math.abs(Date.parse(a.holder.expiresAt) - Date.now() - defaultTtlSec * 1000) < 5000, 'no --ttl: the default TTL, not forever');
  await assert.rejects(L.tryAcquire(CM, { owner: 'a', kind: 'lease', ttlSec: maxHoldSec + 1 }), /capped at \d+ s.*lock\.mjs run chrome-measure/);
  await assert.rejects(L.tryAcquire(CM, { owner: 'z', kind: 'lease', ttlSec: 2400 }), /capped/, 'refused before queueing');
  assert.deepEqual(L.status(CM).queue, []);
  // renewals and re-entrant refreshes never pass acquiredAt + maxHoldSec
  const h = readJson(`${CM}.json`);
  h.acquiredAt = ago(maxHoldSec - 60);
  writeFileSync(lockFile(`${CM}.json`), JSON.stringify(h));
  const rn = await L.renew(CM, { owner: 'a', ttlSec: 600 });
  assert.equal(rn.capped, true);
  assert.ok(Math.abs(Date.parse(rn.expiresAt) - (Date.parse(h.acquiredAt) + maxHoldSec * 1000)) < 1000, 'renew is clamped to the cap');
  const re = await L.tryAcquire(CM, { owner: 'a', kind: 'lease', ttlSec: 600 });
  assert.equal(re.reentrant, true);
  assert.ok(Date.parse(re.holder.expiresAt) <= Date.parse(h.acquiredAt) + maxHoldSec * 1000 + 1, 're-entry is clamped too');
  await L.release(CM, { owner: 'a' });
  // a process hold (verify.mjs, fix.mjs ab, lock.mjs run) has no TTL; a short lease keeps its max-seconds
  const p = await L.tryAcquire(CM, { owner: 'p', kind: 'process' });
  assert.equal(p.holder.expiresAt, undefined);
  await L.release(CM, { owner: 'p' });
  const s = await L.tryAcquire(CM, { owner: 's', kind: 'lease', short: true, maxSec: 150 });
  assert.ok(Date.parse(s.holder.expiresAt) - Date.now() <= 150000);
  await L.release(CM, { owner: 's' });
  // other resources: no policy
  const o = await L.tryAcquire(R, { owner: 'o', kind: 'lease' });
  assert.equal(o.holder.expiresAt, undefined);
  assert.equal((await L.tryAcquire(R, { owner: 'o', kind: 'lease', ttlSec: 7200 })).ok, true);
  assert.equal(L.LEASE_POLICY.iphone, undefined, 'the iphone lease keeps its own CLI default');
});

test('I-020: at a hand-over a head waiter not seen for HANDOVER_FRESH_SEC is skipped but keeps its place', async () => {
  const now = new Date().toISOString();
  assert.equal((await L.tryAcquire(R, { owner: 'h', kind: 'lease' })).ok, true);
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([
    { owner: 'slow', kind: 'lease', since: ago(300), lastSeen: ago(L.HANDOVER_FRESH_SEC + 10), queueTtlSec: 600 },
    { owner: 'recent', kind: 'lease', since: ago(200), lastSeen: ago(L.HANDOVER_FRESH_SEC - 10), queueTtlSec: 600 },
    { owner: 'live', kind: 'lease', since: now, lastSeen: now, queueTtlSec: 600 },
  ]));
  assert.equal(L.status(R).next, 'recent', 'a head polled within the window is not skipped');
  await L.release(R, { owner: 'h' });
  assert.equal((await L.tryAcquire(R, { owner: 'live', kind: 'lease' })).ok, false, 'a fresh head still goes first');
  assert.equal((await L.tryAcquire(R, { owner: 'recent', kind: 'lease' })).ok, true);
  await L.release(R, { owner: 'recent' });
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['slow', 'live']);
  assert.equal(L.status(R).next, 'live', 'the stale head is skipped');
  assert.equal((await L.tryAcquire(R, { owner: 'live', kind: 'lease' })).ok, true, 'the next live waiter is served instead of leaving the lock idle');
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['slow'], 'the skipped waiter keeps its place');
  await L.release(R, { owner: 'live' });
  // when it retries it counts as seen (it is the caller) and is served
  assert.equal((await L.tryAcquire(R, { owner: 'slow', kind: 'lease' })).ok, true);
  // nobody fresh: the head goes first as before
  await L.release(R, { owner: 'slow' });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([
    { owner: 'x', kind: 'lease', since: ago(300), lastSeen: ago(200), queueTtlSec: 600 },
    { owner: 'y', kind: 'lease', since: ago(100), lastSeen: ago(100), queueTtlSec: 600 },
  ]));
  assert.equal(L.status(R).next, 'x');
});

test('I-020: the iphone keeps strict FIFO (its protocol retries every 2-5 min, so an old lastSeen means nothing)', async () => {
  const now = new Date().toISOString();
  assert.equal((await L.tryAcquire('iphone', { owner: 'h', kind: 'lease', ttlSec: 900 })).ok, true);
  writeFileSync(lockFile('iphone.queue.json'), JSON.stringify([
    { owner: 'retrier', kind: 'lease', since: ago(300), lastSeen: ago(120), queueTtlSec: 600 },
    { owner: 'poller', kind: 'lease', since: now, lastSeen: now, queueTtlSec: 600 },
  ]));
  await L.release('iphone', { owner: 'h' });
  assert.equal(L.status('iphone').next, 'retrier');
  assert.equal((await L.tryAcquire('iphone', { owner: 'poller', kind: 'lease', ttlSec: 900 })).ok, false);
  assert.equal((await L.tryAcquire('iphone', { owner: 'retrier', kind: 'lease', ttlSec: 900 })).ok, true);
});

test('I-020: the waiter that is next polls about every NEXT_POLL_MS, so a hand-over is not lost in its backoff', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'h', kind: 'lease' })).ok, true);
  let grantedAt = 0;
  const p = L.acquire(R, { owner: 'w', kind: 'lease', log: () => {} }).then((x) => { grantedAt = Date.now(); return x; });
  await sleep(6200); // default backoff polls at ~2.3 s, ~5.5 s, ~10 s: the old code would next poll 3-5 s after this release
  const releasedAt = Date.now();
  await L.release(R, { owner: 'h' });
  const x = await p;
  assert.equal(x.holder.owner, 'w');
  assert.ok(grantedAt - releasedAt < L.NEXT_POLL_MS + 800, `granted ${grantedAt - releasedAt} ms after the release`);
  x.release();
});

// I-081: an exclusive short grant's last-grant record (short, runStart) counts a short-lane drain across back-to-back
// short grants, and within maxSec + 35 s of the grant it sends a normal waiter first once the drain budget is spent.
// Released with nobody queued it was left on the idle lock, and doctor reported last-grant-short-outlived (I-080's
// sibling for exclusive short holds: `lock.mjs acquire --short` + release, `lock.mjs run --short`).
const LR = await import('../../tools/lib/lock-repair.mjs');
const lastGrant = () => (existsSync(lockFile(`${R}.last-grant.json`)) ? readJson(`${R}.last-grant.json`) : null);
const grantCodes = (afterSec = 0) => LR.doctor(R, { now: Date.now() + afterSec * 1000 })[0].problems.map((p) => p.code);

test('I-081: a short lease released with nobody queued takes its last-grant record along; doctor stays clean', async () => {
  const s = await L.tryAcquire(R, { owner: 'commit', kind: 'lease', ...SHORT });
  assert.equal(s.ok, true);
  assert.deepEqual([lastGrant().token, lastGrant().short], [s.holder.token, true]);
  await L.release(R, { owner: 'commit' });
  assert.equal(L.status(R).holder, null);
  assert.equal(lastGrant(), null, 'nobody queued: the record decides nothing any more');
  assert.deepEqual(grantCodes(SHORT.maxSec + 36), [], 'no last-grant-short-outlived once the lock stays idle');
});

test('I-081: a short process hold released (its handle, or its exit handler) with nobody queued takes its record along', async () => {
  const h = await L.acquire(R, { owner: 'npm-test', kind: 'process', ...SHORT, timeoutSec: 1, pollMs: 30, log: () => {} });
  assert.equal(h.mode, 'short');
  assert.equal(lastGrant().token, h.holder.token);
  h.release();
  assert.equal(L.status(R).holder, null);
  assert.equal(lastGrant(), null);
  // `lock.mjs run --short` ends through the process's exit handler
  const lib = JSON.stringify(new URL('../../tools/lib/lock.mjs', import.meta.url).href);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `const L = await import(${lib}); const h = await L.acquire(${JSON.stringify(R)}, { owner: 'run-short', kind: 'process', short: true, maxSec: 90, timeoutSec: 2, pollMs: 50, log: () => {} }); console.log('IN', h.holder.token);`],
    { env: { ...process.env, FW_STATE_DIR: state }, encoding: 'utf8', timeout: 15000 });
  assert.match(r.stdout, /^IN [0-9a-f]{12}$/m, r.stderr);
  assert.equal(L.status(R).holder, null);
  assert.equal(lastGrant(), null, 'the exit handler took the record along');
  assert.deepEqual(grantCodes(SHORT.maxSec + 36), []);
});

test('I-081: a short released while another short-lane job is queued keeps its record: the drain counts across consecutive short grants', async () => {
  const s1 = await L.tryAcquire(R, { owner: 's1', kind: 'lease', ...SHORT });
  assert.equal(s1.ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 's2', ...SHORT })).ok, false);
  await L.release(R, { owner: 's1' });
  assert.equal(lastGrant()?.token, s1.holder.token, 'kept: a short-lane job is queued');
  const s2 = await L.tryAcquire(R, { owner: 's2', ...SHORT });
  assert.equal(s2.ok, true);
  assert.equal(lastGrant().runStart, s1.holder.acquiredAt, 'the run that started with s1 goes on');
  // a normal waiter and another short queue meanwhile; the run (started SHORT_DRAIN_SEC - 50 s ago) has no room for s3's 90 s
  await L.tryAcquire(R, { owner: 'n1' });
  await L.tryAcquire(R, { owner: 's3', ...SHORT });
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ ...lastGrant(), runStart: new Date(Date.now() - (L.SHORT_DRAIN_SEC - 50) * 1000).toISOString() }));
  await L.release(R, { owner: 's2' });
  assert.equal(lastGrant()?.token, s2.holder.token, 'kept: waiters are queued');
  assert.equal(L.status(R).next, 'n1', 'drain budget spent: the normal waiter goes first');
  assert.equal((await L.tryAcquire(R, { owner: 's3', ...SHORT })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'n1' })).ok, true);
  assert.equal(lastGrant().owner, 'n1', 'its grant replaces the record');
});

test('I-081: a short released while only a normal waiter is queued keeps its record until that waiter\'s grant replaces it', async () => {
  const s1 = await L.tryAcquire(R, { owner: 's1', kind: 'lease', ...SHORT });
  assert.equal((await L.tryAcquire(R, { owner: 'ab' })).ok, false);
  await L.release(R, { owner: 's1' });
  assert.equal(lastGrant()?.token, s1.holder.token, 'kept: a normal waiter is queued (a short passing it at the host gate continues the run)');
  assert.equal((await L.tryAcquire(R, { owner: 'ab' })).ok, true);
  assert.deepEqual([lastGrant().owner, lastGrant().short, lastGrant().runStart], ['ab', false, undefined]);
});

test('I-081: release --force of a short holder with nobody queued takes the record along; another grant\'s record is never touched', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'gone', kind: 'lease', ...SHORT })).ok, true);
  await L.release(R, { owner: 'lead', force: true });
  assert.equal(lastGrant(), null);
  // a normal hold's record stays (no short grant), and a short handle whose record another grant replaced leaves that one
  assert.equal((await L.tryAcquire(R, { owner: 'ab' })).ok, true);
  await L.release(R, { owner: 'ab' });
  assert.equal(lastGrant()?.owner, 'ab');
  const h = await L.acquire(R, { owner: 'npm', kind: 'process', ...SHORT, timeoutSec: 1, pollMs: 30, log: () => {} });
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'other', short: true, maxSec: 90, at: new Date().toISOString(), token: 'dddddddddddd' }));
  h.release();
  assert.equal(L.status(R).holder, null);
  assert.equal(lastGrant()?.token, 'dddddddddddd');
});

test('I-081 (intended change): after a short released with nobody queued, the next short on the idle lock starts a new drain run', async () => {
  // no waiter was queued across the idle gap, so none was delayed by s1; a waiter that queues behind s2 is delayed at most
  // SHORT_DRAIN_SEC from s2's grant, as before (lock code before I-081 continued s1's run here)
  const t0 = Date.now();
  const s1 = await L.tryAcquire(R, { owner: 's1', kind: 'lease', ...SHORT, now: t0 - 60000 });
  assert.equal(s1.ok, true);
  await L.release(R, { owner: 's1' });
  const s2 = await L.tryAcquire(R, { owner: 's2', kind: 'lease', ...SHORT, now: t0 });
  assert.equal(s2.ok, true);
  assert.equal(lastGrant().runStart, new Date(t0).toISOString());
});
