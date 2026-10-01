// tools/lib/lock.mjs shared short holds (ts-lock-bundle (f), lead 15:0xZ): while the holder is a short job and no normal
// job waits, the next short job (from another checkout) shares the hold in the co-hold slot; at most 2 holders; a
// normal waiter blocks new shared entries and is granted only after both ended (the co-holder takes the holder's place
// when the holder ends). Every test uses its own $FW_STATE_DIR.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const { lockConditionMet, lockState } = await import('../../tools/lib/wait.mjs');
const R = 'chrome-measure';
let state;
beforeEach(() => { state = tempDir('fw-lockshared-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const readJson = (f) => JSON.parse(readFileSync(lockFile(f), 'utf8'));
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
const S = (owner, checkout, o = {}) => ({ owner, kind: 'lease', short: true, maxSec: 120, checkout: `/wt/${checkout}`, ...o });
const N = (owner, checkout, o = {}) => ({ owner, kind: 'lease', checkout: `/wt/${checkout}`, ...o });

test('two short jobs from two checkouts share the hold; a third waits; the co-holder is shown and recorded', async () => {
  assert.equal(L.SHARED_SHORT[R], 2);
  const a = await L.tryAcquire(R, S('npm-a', 'x'));
  assert.equal(a.ok, true);
  const b = await L.tryAcquire(R, S('npm-b', 'y'));
  assert.deepEqual([b.ok, b.cohold, b.holder.cohold, b.holder.sharedWith, b.holder.short, b.holder.maxSec], [true, true, true, 'npm-a', true, 120]);
  assert.ok(Math.abs(Date.parse(b.holder.expiresAt) - Date.now() - 120000) < 5000, 'a short co-holder expires at acquiredAt + maxSec');
  assert.equal(readJson(`${R}.json`).owner, 'npm-a', 'the holder file is untouched');
  assert.equal(readJson(`${R}.cohold.json`).owner, 'npm-b');
  const c = await L.tryAcquire(R, S('npm-c', 'z'));
  assert.deepEqual([c.ok, c.position], [false, 1], 'at most 2 holders');
  const s = L.status(R);
  assert.deepEqual([s.holder.owner, s.cohold.owner, s.queue.map((w) => w.owner)], ['npm-a', 'npm-b', ['npm-c']]);
  assert.equal(L.allStatus().filter((x) => x.resource.startsWith('chrome-measure')).length, 1, 'the slot file is no resource of its own');
  // wait.mjs sees both holders
  assert.equal(lockConditionMet({ kind: 'held-by', owner: 'npm-b' }, s).met, true);
  assert.equal(lockConditionMet({ kind: 'released-by', owner: 'npm-b' }, s).met, false);
  assert.equal(lockConditionMet({ kind: 'free' }, { ...s, holder: null }).met, false, 'a co-holder alone is not free');
  assert.match(lockState(s), /^held by "npm-a" \(short\) and "npm-b" \(short, shared\); queue: 1\. npm-c \(short\)$/);
});

test('no sharing with a normal holder (a no-timing one included), from the same checkout, or on another resource', async () => {
  assert.equal((await L.tryAcquire(R, N('ab', 'x'))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm', 'y'))).ok, false, 'a normal hold is never shared');
  await L.release(R, { owner: 'ab' });
  await L.dequeue(R, 'npm');
  assert.equal((await L.tryAcquire(R, N('build', 'x', { kind: 'process', noTiming: true }))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm', 'y'))).ok, false, 'nor a no-timing hold');
  await L.release(R, { owner: 'build' });
  await L.dequeue(R, 'npm');
  assert.equal((await L.tryAcquire(R, S('npm-a', 'x'))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm-b', 'x'))).ok, false, 'two jobs of one worktree would share its out/');
  assert.equal(existsSync(lockFile(`${R}.cohold.json`)), false);
  for (const r of ['iphone', 'test-res']) {
    assert.equal((await L.tryAcquire(r, S('a', 'x'))).ok, true);
    assert.equal((await L.tryAcquire(r, S('b', 'y'))).ok, false, `${r}: one holder`);
  }
});

test('a normal waiter blocks new shared entries, waits for both to drain, then is granted (the co-holder takes the holder\'s place)', async () => {
  assert.equal((await L.tryAcquire(R, S('npm-a', 'x'))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm-b', 'y'))).ok, true);
  const ab = await L.tryAcquire(R, N('fix-ab', 'w'));
  assert.deepEqual([ab.ok, ab.position], [false, 1]);
  // npm-b ends first: its slot frees, but no new shared entry while fix-ab waits
  assert.equal((await L.release(R, { owner: 'npm-b' })).owner, 'npm-b');
  assert.equal(readJson(`${R}.json`).owner, 'npm-a');
  assert.equal((await L.tryAcquire(R, S('npm-c', 'z'))).ok, false, 'a normal waiter is queued: no new shared entry');
  await L.dequeue(R, 'npm-c');
  assert.equal((await L.tryAcquire(R, N('fix-ab', 'w'))).ok, false);
  await L.release(R, { owner: 'npm-a' });
  assert.equal((await L.tryAcquire(R, N('fix-ab', 'w'))).ok, true, 'both drained');
  await L.release(R, { owner: 'fix-ab' });
  // the other order: the holder ends first, the co-holder becomes the holder, the normal waiter still waits for it
  assert.equal((await L.tryAcquire(R, S('npm-a', 'x'))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm-b', 'y'))).ok, true);
  assert.equal((await L.tryAcquire(R, N('fix-ab', 'w'))).ok, false);
  assert.equal((await L.release(R, { owner: 'npm-a' })).owner, 'npm-a');
  const h = readJson(`${R}.json`);
  assert.deepEqual([h.owner, h.cohold, h.sharedWith, typeof h.promotedAt], ['npm-b', undefined, 'npm-a', 'string']);
  assert.equal(existsSync(lockFile(`${R}.cohold.json`)), false);
  assert.equal((await L.tryAcquire(R, N('fix-ab', 'w'))).ok, false, 'the promoted co-holder still holds');
  assert.equal((await L.tryAcquire(R, S('npm-c', 'z'))).ok, false, 'and nobody shares while fix-ab waits');
  await L.dequeue(R, 'npm-c');
  await L.release(R, { owner: 'npm-b' });
  assert.equal((await L.tryAcquire(R, N('fix-ab', 'w'))).ok, true);
});

test('shared entry is FIFO among short waiters: only the one served next shares', async () => {
  assert.equal((await L.tryAcquire(R, S('npm-a', 'x'))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm-a', 'x'))).reentrant, true);
  // npm-b and npm-c queued while a third holder... simulate: fill the slot, queue b then c, free the slot
  assert.equal((await L.tryAcquire(R, S('npm-z', 'z'))).ok, true);
  assert.equal((await L.tryAcquire(R, S('npm-b', 'y'))).ok, false);
  assert.equal((await L.tryAcquire(R, S('npm-c', 'v'))).ok, false);
  await L.release(R, { owner: 'npm-z' });
  assert.equal((await L.tryAcquire(R, S('npm-c', 'v'))).ok, false, 'npm-b is first');
  const b = await L.tryAcquire(R, S('npm-b', 'y'));
  assert.deepEqual([b.ok, b.cohold], [true, true]);
  assert.deepEqual(L.status(R).queue.map((w) => w.owner), ['npm-c']);
});

test('re-entry, release and stale co-holders', async () => {
  assert.equal((await L.tryAcquire(R, S('npm-a', 'x'))).ok, true);
  const b = await L.tryAcquire(R, S('npm-b', 'y', { kind: 'process' }));
  assert.equal(b.cohold, true);
  // its descendants re-enter by token, the same owner (same pid) re-enters
  const inh = await L.tryAcquire(R, { owner: 'verify', kind: 'process', held: L.heldEnv(R, b.holder.token, '') });
  assert.deepEqual([inh.ok, inh.reentrant, inh.inherited, inh.holder.owner], [true, true, true, 'npm-b']);
  assert.deepEqual([(await L.tryAcquire(R, S('npm-b', 'y', { kind: 'process' }))).reentrant], [true]);
  // a stranger can't release; the message names both holders
  await assert.rejects(L.release(R, { owner: 'nobody' }), /held by "npm-a" and "npm-b" \(shared short hold\), not "nobody"/);
  // a dead co-holder is cleared by the next acquirer (recorded in last-stale), the holder stays
  writeFileSync(lockFile(`${R}.cohold.json`), JSON.stringify({ ...readJson(`${R}.cohold.json`), pid: deadPid() }));
  assert.equal(L.status(R).cohold, undefined, 'status hides a stale co-holder');
  const c = await L.tryAcquire(R, S('npm-c', 'z'));
  assert.deepEqual([c.ok, c.cohold], [true, true], 'its slot is free again');
  assert.equal(readJson(`${R}.last-stale.json`).owner, 'npm-b');
  // a stale holder with a live co-holder: the co-holder is promoted, a normal waiter still waits for it
  writeFileSync(lockFile(`${R}.json`), JSON.stringify({ ...readJson(`${R}.json`), expiresAt: new Date(Date.now() - 1000).toISOString() }));
  assert.equal((await L.tryAcquire(R, N('fix-ab', 'w'))).ok, false);
  assert.equal(readJson(`${R}.json`).owner, 'npm-c');
  assert.equal(existsSync(lockFile(`${R}.cohold.json`)), false);
});

test('acquire(): a co-holder\'s release frees only its slot; the holder\'s release hands its place to the co-holder', async () => {
  const quiet = { log: () => {} };
  const a = await L.acquire(R, { owner: 'npm-a', kind: 'process', short: true, maxSec: 60, checkout: '/wt/x', ...quiet });
  const b = await L.acquire(R, { owner: 'npm-b', kind: 'process', short: true, maxSec: 60, checkout: '/wt/y', ...quiet });
  assert.equal(b.holder.cohold, true);
  b.release();
  assert.equal(existsSync(lockFile(`${R}.cohold.json`)), false);
  assert.equal(readJson(`${R}.json`).owner, 'npm-a');
  const c = await L.acquire(R, { owner: 'npm-c', kind: 'process', short: true, maxSec: 60, checkout: '/wt/z', ...quiet });
  a.release();
  assert.equal(readJson(`${R}.json`).owner, 'npm-c', 'promoted by the holder\'s own synchronous release');
  c.release();
  assert.equal(existsSync(lockFile(`${R}.json`)), false);
  // a normal acquire() waits behind a shared hold until both are gone
  const d = await L.acquire(R, { owner: 'npm-d', kind: 'process', short: true, maxSec: 60, checkout: '/wt/x', ...quiet });
  const e = await L.acquire(R, { owner: 'npm-e', kind: 'process', short: true, maxSec: 60, checkout: '/wt/y', ...quiet });
  let got = null;
  // a quiet fake host for the gate (the real one is refused in tests, I-024)
  let t = 5_000_000, total = 0;
  const hostSamplers = {
    now: () => t, mono: () => t, wake: () => 1, procs: () => ({}), sleep: async (ms) => { t += ms; total += ms * 8; await new Promise((r) => setTimeout(r, 5)); },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: total * 0.05 / 8, nice: 0, sys: 0, idle: total * 0.95 / 8, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
  const n = L.acquire(R, { owner: 'fix-ab', kind: 'process', checkout: '/wt/w', pollMs: 20, maxPollMs: 40, hostSamplers, ...quiet }).then((x) => { got = x; });
  await new Promise((r) => setTimeout(r, 150));
  d.release();
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(got, null, 'one shared job still runs');
  e.release();
  await n;
  assert.equal(got.holder.owner, 'fix-ab');
  got.release();
});
