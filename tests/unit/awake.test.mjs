// Incident I-026: the Mac went into Maintenance Sleep for 472 s in the middle of a chrome-measure hold, so
// every timer and --max-seconds fired ~8 min late. While chrome-measure is held, the lock keeps a
// sleep-prevention assertion (caffeinate -i -s): -w <pid> for a process hold, -t <seconds> for a lease,
// ended on release. A fake caffeinate ($FW_CAFFEINATE) records its arguments; no binary means no assertion.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, sleep, TESTS, FAKE_HOST } from '../helpers.mjs';

process.env.FW_TEST_HOST = FAKE_HOST; // a quiet fake host for the lock's admission gate, not the real Mac
const L = await import('../../tools/lib/lock.mjs');
const FAKE = join(TESTS, 'fixtures', 'fake-caffeinate.mjs');
let state, log;
beforeEach(() => {
  state = tempDir('fw-awake-');
  log = join(state, 'caffeinate.jsonl');
  Object.assign(process.env, { FW_STATE_DIR: state, FW_CAFFEINATE: FAKE, FAKE_CAFFEINATE_LOG: log });
});
const calls = async (n = 1) => {
  for (let i = 0; i < 100 && (!existsSync(log) || readFileSync(log, 'utf8').trim().split('\n').length < n); i++) await sleep(30);
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
const gone = async (p) => { for (let i = 0; i < 100 && alive(p); i++) await sleep(30); return !alive(p); };

test('a process hold on chrome-measure keeps the Mac awake for exactly its lifetime (caffeinate -i -s -w <pid>), ended on release', async () => {
  const h = await L.acquire('chrome-measure', { owner: 'verify', kind: 'process', log: () => {} });
  const [c] = await calls();
  assert.deepEqual(c.args, ['-i', '-s', '-w', String(process.pid)]);
  assert.ok(alive(c.pid));
  assert.ok(existsSync(join(state, 'locks', 'chrome-measure.awake.json')));
  h.release();
  assert.ok(await gone(c.pid), 'ended on release');
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.awake.json')));
});

test('a lease keeps it awake until the lease expires (-t), a renewal replaces the assertion, release ends it', async () => {
  const A = await import('../../tools/lib/awake.mjs');
  const r = await L.tryAcquire('chrome-measure', { owner: 'lease', kind: 'lease', ttlSec: 600 });
  const p1 = A.keepAwake('chrome-measure', r.holder);
  const [c1] = await calls();
  assert.equal(c1.pid, p1);
  assert.deepEqual(c1.args.slice(0, 3), ['-i', '-s', '-t']);
  assert.ok(Math.abs(Number(c1.args[3]) - 600) <= 2);
  const h2 = await L.renew('chrome-measure', { owner: 'lease', ttlSec: 900 });
  const p2 = A.keepAwake('chrome-measure', h2);
  assert.ok(await gone(p1), 'the old assertion is replaced');
  assert.ok(alive(p2));
  await L.release('chrome-measure', { owner: 'lease' });
  A.stopAwake('chrome-measure', h2.token);
  assert.ok(await gone(p2));
});

test('no caffeinate binary (or FW_CAFFEINATE=off): the lock works without an assertion; other resources never get one', async () => {
  process.env.FW_CAFFEINATE = join(state, 'missing-caffeinate');
  const h = await L.acquire('chrome-measure', { owner: 'a', kind: 'process', log: () => {} });
  h.release();
  process.env.FW_CAFFEINATE = 'off';
  const h2 = await L.acquire('chrome-measure', { owner: 'b', kind: 'process', log: () => {} });
  h2.release();
  process.env.FW_CAFFEINATE = FAKE;
  const h3 = await L.acquire('iphone', { owner: 'c', kind: 'process', log: () => {} });
  h3.release();
  await sleep(200);
  assert.deepEqual(await calls(0), []);
});

test('stopAwake never signals a pid that is no longer a caffeinate (pid reuse)', async () => {
  const A = await import('../../tools/lib/awake.mjs');
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(state, 'locks'), { recursive: true });
  writeFileSync(join(state, 'locks', 'chrome-measure.awake.json'), JSON.stringify({ token: 't', pid: process.pid }));
  assert.equal(A.stopAwake('chrome-measure', 't'), false, 'this test process is not a caffeinate: left alone');
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.awake.json')), 'the stale record is dropped');
});

// I-026 reopened: the Mac also slept 15 min (Deep Idle) while the lock was FREE and agents were queued, so
// every waiter stalled. A waiter's attempt that leaves it queued keeps one shared assertion per resource
// (caffeinate -i -s -t 600, the normal queue-entry TTL), replaced only when less than half of it is left.
test('a queued waiter keeps the Mac awake: one shared -t 600 assertion, reused while fresh, replaced when half is gone', async () => {
  const A = await import('../../tools/lib/awake.mjs');
  const h = await L.acquire('chrome-measure', { owner: 'holder', kind: 'process', log: () => {} });
  await calls(1);
  await assert.rejects(L.acquire('chrome-measure', { owner: 'w1', kind: 'process', short: true, maxSec: 60, timeoutSec: 0.3, pollMs: 50, log: () => {} }), /timed out/);
  const [, q] = await calls(2);
  assert.deepEqual(q.args, ['-i', '-s', '-t', String(A.QUEUE_AWAKE_SEC)]);
  assert.equal(A.QUEUE_AWAKE_SEC, 600);
  const file = join(state, 'locks', 'chrome-measure.queue-awake.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, q.pid);
  // a second waiter, while the first assertion is fresh: no new process
  assert.equal(A.keepAwakeQueued('chrome-measure'), q.pid);
  await sleep(150);
  assert.equal((await calls(2)).length, 2);
  // less than half left: replaced, and the old one ended
  const rec = JSON.parse(readFileSync(file, 'utf8'));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, JSON.stringify({ ...rec, until: Date.now() + 200 * 1000 }));
  const p2 = A.keepAwakeQueued('chrome-measure');
  assert.notEqual(p2, q.pid);
  assert.ok(await gone(q.pid), 'the old queue assertion is replaced');
  assert.ok(alive(p2));
  h.release();
  process.kill(p2, 'SIGTERM');
  assert.equal(A.keepAwakeQueued('iphone'), null, 'only chrome-measure');
});

test('a test process never starts a real caffeinate: without FW_CAFFEINATE, no assertion (holds or queue)', async () => {
  const A = await import('../../tools/lib/awake.mjs');
  delete process.env.FW_CAFFEINATE;
  try {
    assert.ok(process.env.NODE_TEST_CONTEXT, 'running under node --test');
    assert.equal(A.keepAwake('chrome-measure', { token: 't', kind: 'process', pid: process.pid }), null);
    assert.equal(A.keepAwakeQueued('chrome-measure'), null);
  } finally { process.env.FW_CAFFEINATE = FAKE; }
  assert.deepEqual(await calls(0), []);
});

test('ts-lock-bundle (a): the head waiter held at the host gate keeps the Mac awake too (queue assertion), until it gives up', async () => {
  // a busy fake host for this acquire only (its samplers advance fake time: no real 10 s windows)
  let t = 7_000_000, busy = 0, total = 0;
  const s = {
    now: () => t, mono: () => t, wake: () => 1, procs: () => ({}),
    sleep: async (ms) => { t += ms; total += ms * 8; busy += ms * 8 * 0.7; await sleep(5); },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: busy / 8, nice: 0, sys: 0, idle: (total - busy) / 8, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
  await assert.rejects(L.acquire('chrome-measure', { owner: 'gated', kind: 'process', timeoutSec: 0.3, pollMs: 50, log: () => {}, hostSamplers: s }), /timed out after 0\.3 s waiting for a quiet host/);
  const c = await calls(1);
  assert.deepEqual(c.map((x) => x.args), [['-i', '-s', '-t', '600']], 'the shared queue assertion, started by the gated waiter (nobody holds the lock)');
  assert.equal(JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.queue-awake.json'), 'utf8')).pid, c[0].pid);
  process.kill(c[0].pid, 'SIGTERM');
});

test('ts-lock-bundle (f): a co-holder (shared short hold) keeps the Mac awake through the shared queue assertion, never replacing the holder\'s', async () => {
  const a = await L.acquire('chrome-measure', { owner: 'npm-a', kind: 'process', short: true, maxSec: 60, share: true, checkout: '/wt/x', log: () => {} });
  const [c1] = await calls(1);
  assert.deepEqual(c1.args, ['-i', '-s', '-w', String(process.pid)]);
  const b = await L.acquire('chrome-measure', { owner: 'npm-b', kind: 'process', short: true, maxSec: 60, share: true, checkout: '/wt/y', log: () => {} });
  assert.equal(b.holder.cohold, true);
  const c = await calls(2);
  assert.deepEqual(c[1].args, ['-i', '-s', '-t', '600'], 'the queue assertion (600 s > its 60 s)');
  assert.equal(JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.awake.json'), 'utf8')).token, a.holder.token, 'the holder\'s record stays');
  assert.ok(alive(c1.pid));
  b.release();
  assert.ok(alive(c1.pid), 'the co-holder\'s release leaves the holder\'s assertion alone');
  a.release();
  assert.ok(await gone(c1.pid));
  process.kill(c[1].pid, 'SIGTERM');
});
