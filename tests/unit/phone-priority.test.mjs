// I-172 (mgmt-devices, 2026-10-04 19:13Z): phone-block priority (I-136) moved the iphone holder's --no-timing hold only
// ahead of the shared readers queued after its lease began, so it sat #3 behind earlier non-phone exclusive holds (a
// 10-min timing hold among them) while the phone idled; the lead moved it by hand. Now such a hold goes before every
// non-phone waiter: FIFO among phone owners, never past a user step (`user`, `user-*`) or a hand-made move (lead or a
// delegate, I-171), never ahead of the holder. Only --no-timing holds: the holder's timing hold stays FIFO.
// Every test uses its own $FW_STATE_DIR (I-041).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, REPO } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const R = 'chrome-measure';
let state;
delete process.env.FW_LOCK_SHARED;
beforeEach(() => { state = tempDir('fw-phoneprio-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const kids = [];
const livePid = () => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); kids.push(c); return c.pid; };
after(() => { for (const c of kids) try { c.kill('SIGKILL'); } catch {} });
const on = () => L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'test' });
const rd = (owner, o = {}) => L.tryAcquire(R, { owner, kind: 'process', shared: true, weight: 1, maxSec: 60, load1: 0, ncpu: 8, ...o });
const iso = (t) => new Date(t).toISOString();
const order = () => L.status(R).queue.map((x) => x.owner);
const marks = () => L.status(R).queue.map((x) => [x.owner, x.movedBy]);
// a held chrome-measure (a no-timing build), so every later attempt queues
const busy = (t) => L.tryAcquire(R, { owner: 'build', kind: 'process', pid: livePid(), noTiming: true, now: t });

test('I-172: the iphone holder\'s --no-timing hold goes before every non-phone waiter: timing, no-timing, short and readers, queued before or after the lease', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await busy(t0)).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'scroll-cb', kind: 'process', pid: livePid(), noTiming: true, now: t0 + 1000 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 'section-ms', kind: 'process', pid: livePid(), now: t0 + 2000 })).ok, false, 'a 10-min timing hold');
  assert.equal((await rd('fn-a', { pid: livePid(), now: t0 + 3000 })).ok, false);
  assert.equal((await L.tryAcquire('iphone', { owner: 'runner', kind: 'lease', ttlSec: 900, now: t0 + 4000 })).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'cal', kind: 'process', pid: livePid(), short: true, maxSec: 120, now: t0 + 5000 })).ok, false);
  const pR = livePid();
  const w = await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 6000 });
  assert.equal(w.ok, false, 'never ahead of the holder: it waits for "build"');
  assert.equal(w.position, 1);
  assert.deepEqual(order(), ['runner', 'scroll-cb', 'section-ms', 'fn-a', 'cal']);
  assert.equal(L.status(R).queue[0].movedBy, L.PHONE_BLOCK_BY);
  assert.equal(L.status(R).queue[0].since, iso(t0 + 6000), 'it keeps its own since');
  assert.equal((await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 7000 })).position, 1, 'a refresh keeps the place');
  assert.equal(L.status(R).queue.filter((x) => x.owner === 'runner').length, 1);
  await L.release(R, { owner: 'build', force: true });
  assert.equal(L.status(R).next, 'runner', 'at the hand-over the phone part goes first, short jobs included');
  const g = await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 8000 });
  assert.equal(g.ok, true);
  assert.deepEqual(order(), ['scroll-cb', 'section-ms', 'fn-a', 'cal'], 'the others keep their FIFO order');
});

test('I-172: never past a user step (user, user-*), a hand-made move (lead or delegate) or another phone owner\'s entry; never for a timing hold or another owner', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await busy(t0)).ok, true);
  const entry = (owner, t, extra = {}) => ({ owner, kind: 'lease', checkout: REPO, since: iso(t), lastSeen: iso(t0 + 9000), queueTtlSec: 600, ...extra });
  assert.equal((await L.tryAcquire('iphone', { owner: 'runner', kind: 'lease', ttlSec: 900, now: t0 + 500 })).ok, true);
  const pR = livePid();
  for (const [blocker, extra] of [['user', {}], ['user-try', {}], ['ab', { movedBy: 'lead', movedAt: iso(t0 + 1500) }], ['ab', { movedBy: 'mgmt-devices', movedAt: iso(t0 + 1500) }], ['old-phone', { noTiming: true, movedBy: L.PHONE_BLOCK_BY, movedAt: iso(t0 + 1500) }]]) {
    writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([entry('first', t0 + 1000), entry(blocker, t0 + 2000, extra), entry('later', t0 + 3000)]));
    await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 9000 });
    assert.deepEqual(order(), ['first', blocker, 'runner', 'later'], `stops behind ${blocker} (${extra.movedBy || 'user step'})`);
    await L.dequeue(R, 'runner');
  }
  // the holder's own timing hold, and another owner's no-timing hold: plain FIFO, no mark
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([entry('first', t0 + 1000)]));
  assert.equal((await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, now: t0 + 9000 })).position, 2);
  assert.equal((await L.tryAcquire(R, { owner: 'other', kind: 'process', pid: livePid(), noTiming: true, now: t0 + 9000 })).position, 3);
  assert.equal(L.status(R).queue.some((x) => x.movedBy), false);
  // a lead move of the phone hold itself is kept (never replaced by the phone mark)
  await L.dequeue(R, 'runner');
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify([entry('first', t0 + 1000), entry('runner', t0 + 2000, { kind: 'process', pid: pR, noTiming: true, movedBy: 'lead', movedAt: iso(t0 + 2500) }), entry('later', t0 + 3000)]));
  await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 9000 });
  assert.deepEqual(marks(), [['first', undefined], ['runner', 'lead'], ['later', undefined]]);
});

test('I-172: the mark goes with the lease, the place stays; a process hold of the iphone counts like a lease', async () => {
  await on();
  const t0 = Date.now();
  assert.equal((await busy(t0)).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'process', pid: livePid(), now: t0 + 1000 })).ok, false);
  const pR = livePid();
  assert.equal((await L.tryAcquire('iphone', { owner: 'runner', kind: 'process', pid: pR, now: t0 + 1500 })).ok, true, 'a process hold of the phone (T2)');
  await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 2000 });
  assert.deepEqual(marks(), [['runner', L.PHONE_BLOCK_BY], ['ab', undefined]]);
  await L.release('iphone', { owner: 'runner' });
  await L.tryAcquire(R, { owner: 'runner', kind: 'process', pid: pR, noTiming: true, now: t0 + 3000 });
  assert.deepEqual(marks(), [['runner', undefined], ['ab', undefined]], 'nothing is moved back');
  // stale queue file content is not read here: the queue file holds only what tryAcquire wrote
  assert.ok(JSON.parse(readFileSync(lockFile(`${R}.queue.json`), 'utf8')).length === 2);
});
