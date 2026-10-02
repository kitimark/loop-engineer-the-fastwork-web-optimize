// Incident I-026 kept every chrome-measure hold (and, reopened, every queued waiter) awake with caffeinate -i -s.
// Incident I-070 narrows it to MEASUREMENTS only (the user's answer to C-024: "Keep awake only during measurements"):
// a timing hold of chrome-measure (-w <pid> for a process hold, -t <seconds> for a lease, ended on release), a
// --no-timing hold only when asked (`awake`: its command wraps a phone part or a Sim session), and the measuring
// processes themselves (keepAwakeFor: iphone.mjs scroll|record|run|gesture, sim.mjs session). Never shared or short
// jobs, plain --no-timing builds, queue or gate waits. A fake caffeinate ($FW_CAFFEINATE) records its arguments and
// pid; no binary, FW_NO_CAFFEINATE=1 or a non-macOS host means no assertion.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tempDir, sleep, TESTS, FAKE_HOST } from '../helpers.mjs';

process.env.FW_TEST_HOST = FAKE_HOST; // a quiet fake host for the lock's admission gate, not the real Mac
const L = await import('../../tools/lib/lock.mjs');
const A = await import('../../tools/lib/awake.mjs');
const FAKE = join(TESTS, 'fixtures', 'fake-caffeinate.mjs');
let state, log;
beforeEach(() => {
  state = tempDir('fw-awake-');
  log = join(state, 'caffeinate.jsonl');
  delete process.env.FW_NO_CAFFEINATE;
  Object.assign(process.env, { FW_STATE_DIR: state, FW_CAFFEINATE: FAKE, FAKE_CAFFEINATE_LOG: log });
});
const calls = async (n = 1) => {
  for (let i = 0; i < 100 && (!existsSync(log) || readFileSync(log, 'utf8').trim().split('\n').length < n); i++) await sleep(30);
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
const gone = async (p) => { for (let i = 0; i < 100 && alive(p); i++) await sleep(30); return !alive(p); };

test('I-070 (C-024): a timing process hold on chrome-measure keeps the Mac awake for exactly its lifetime (caffeinate -i -s -w <pid>), holder.awake, ended on release', async () => {
  const h = await L.acquire('chrome-measure', { owner: 'verify', kind: 'process', log: () => {} });
  const [c] = await calls();
  assert.deepEqual(c.args, ['-i', '-s', '-w', String(process.pid)]);
  assert.ok(alive(c.pid));
  assert.equal(h.holder.awake, true, 'the holder record says it keeps the Mac awake');
  assert.equal(JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.json'), 'utf8')).awake, true);
  assert.equal(A.holdAwake('chrome-measure', h.holder).pid, c.pid);
  assert.ok(existsSync(join(state, 'locks', 'chrome-measure.awake.json')));
  h.release();
  assert.ok(await gone(c.pid), 'ended on release');
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.awake.json')));
});

test('I-070: a timing lease keeps it awake until the lease expires (-t), a renewal replaces the assertion, release ends it', async () => {
  const r = await L.tryAcquire('chrome-measure', { owner: 'lease', kind: 'lease', ttlSec: 600 });
  assert.equal(r.holder.awake, true);
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

test('no caffeinate binary (or FW_CAFFEINATE=off, FW_NO_CAFFEINATE=1): the lock works without an assertion; other resources never get one', async () => {
  process.env.FW_CAFFEINATE = join(state, 'missing-caffeinate');
  const h = await L.acquire('chrome-measure', { owner: 'a', kind: 'process', log: () => {} });
  h.release();
  process.env.FW_CAFFEINATE = 'off';
  const h2 = await L.acquire('chrome-measure', { owner: 'b', kind: 'process', log: () => {} });
  h2.release();
  process.env.FW_CAFFEINATE = FAKE;
  process.env.FW_NO_CAFFEINATE = '1';
  const h4 = await L.acquire('chrome-measure', { owner: 'd', kind: 'process', log: () => {} });
  h4.release();
  assert.equal(A.keepAwakeFor('iphone.mjs scroll', 999999), null, 'FW_NO_CAFFEINATE=1: no per-process assertion either');
  delete process.env.FW_NO_CAFFEINATE;
  const h3 = await L.acquire('iphone', { owner: 'c', kind: 'process', log: () => {} });
  assert.equal(h3.holder.awake, undefined, 'an iphone lease is no measurement (the phone run is)');
  h3.release();
  await sleep(200);
  assert.deepEqual(await calls(0), []);
});

test('stopAwake never signals a pid that is no longer a caffeinate (pid reuse)', async () => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(state, 'locks'), { recursive: true });
  writeFileSync(join(state, 'locks', 'chrome-measure.awake.json'), JSON.stringify({ token: 't', pid: process.pid }));
  assert.equal(A.stopAwake('chrome-measure', 't'), false, 'this test process is not a caffeinate: left alone');
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.awake.json')), 'the stale record is dropped');
});

// I-070 (user C-024; replaces I-026 reopened and ts-lock-bundle (a)): a queued or gated waiter keeps NOTHING awake;
// neither do shared (functional) jobs, short jobs and plain --no-timing holds (builds).
test('I-070 (C-024): no caffeinate for a queued waiter, a --short job, a --shared reader (lane off and on) or a plain --no-timing build', async () => {
  const h = await L.acquire('chrome-measure', { owner: 'holder', kind: 'process', log: () => {} });
  const [held] = await calls(1);
  await assert.rejects(L.acquire('chrome-measure', { owner: 'w1', kind: 'process', short: true, maxSec: 60, timeoutSec: 0.3, pollMs: 50, log: () => {} }), /timed out/);
  await assert.rejects(L.acquire('chrome-measure', { owner: 'w2', kind: 'process', timeoutSec: 0.3, pollMs: 50, log: () => {} }), /timed out/);
  h.release();
  assert.ok(await gone(held.pid));
  const s = await L.acquire('chrome-measure', { owner: 'npm-test', kind: 'process', short: true, maxSec: 60, log: () => {} });
  assert.equal(s.holder.awake, undefined);
  s.release();
  const b = await L.acquire('chrome-measure', { owner: 'build', kind: 'process', noTiming: true, log: () => {} });
  assert.equal(b.holder.awake, undefined, 'a plain --no-timing hold (a build) is no measurement');
  b.release();
  const off = await L.acquire('chrome-measure', { owner: 'check', kind: 'process', shared: true, weight: 2, maxSec: 60, log: () => {} });
  assert.equal(off.mode, 'short', 'the lane is off: the exclusive short stand-in');
  assert.equal(off.holder.awake, undefined);
  off.release();
  await L.setSharedSwitch('chrome-measure', { on: true, by: 'lead', reason: 'test' });
  const r1 = await L.acquire('chrome-measure', { owner: 'npm-test', kind: 'process', shared: true, weight: 2, maxSec: 60, log: () => {} });
  assert.equal(r1.mode, 'shared');
  r1.release();
  await sleep(300);
  const all = await calls(1);
  assert.equal(all.length, 1, `only the timing hold's assertion: ${JSON.stringify(all.map((c) => c.args))}`);
  assert.ok(!existsSync(join(state, 'locks', 'chrome-measure.queue-awake.json')), 'no queue assertion (I-026 reopened is gone)');
});

test('I-070: a --no-timing hold asked to keep the Mac awake (it wraps a phone part or a Sim session) does: -w <pid>, ended on release; a short hold never', async () => {
  const h = await L.acquire('chrome-measure', { owner: 'phone-block', kind: 'process', noTiming: true, awake: true, log: () => {} });
  assert.equal(h.holder.awake, true);
  assert.equal(h.holder.noTiming, true);
  const [c] = await calls(1);
  assert.deepEqual(c.args, ['-i', '-s', '-w', String(process.pid)]);
  h.release();
  assert.ok(await gone(c.pid));
  const s = await L.acquire('chrome-measure', { owner: 'x', kind: 'process', short: true, maxSec: 30, awake: true, log: () => {} });
  assert.equal(s.holder.awake, undefined);
  s.release();
  await sleep(200);
  assert.equal((await calls(1)).length, 1);
});

test('I-070: wrapsMeasurement finds a phone part or a Sim session in a hold\'s command, nothing else', () => {
  for (const c of [['sh', '-c', 'node tools/iphone.mjs scroll --owner t --label base && node tools/iphone.mjs park --owner t'], ['node', 'tools/iphone.mjs', 'record', '--seconds', '25'],
    ['node', '/abs/tools/iphone.mjs', 'run', '--driver', 'scroll'], ['node', 'tools/iphone.mjs', 'gesture', 'g.json'], ['node', 'tools/sim.mjs', 'session', '--owner', 'o', '--', 'sh', '-c', 'x']])
    assert.equal(A.wrapsMeasurement(c), true, c.join(' '));
  for (const c of [['xcodebuild', 'build'], ['node', 'tools/ioscap.mjs', 'build'], ['node', 'tools/sim.mjs', 'wda', 'build'], ['node', 'tools/iphone.mjs', 'park'], ['node', 'tools/iphone.mjs', 'wda', 'build'], ['npm', 'test'], ['node', 'tools/wait.mjs', 'phone-temp']])
    assert.equal(A.wrapsMeasurement(c), false, c.join(' '));
});

test('I-070: keepAwakeFor keeps the Mac awake for a measuring process (-i -s -w <its pid>), once, gone with it (crash too); recorded for status', async () => {
  const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try { await keepAwakeForCase(p); } finally { p.kill('SIGKILL'); } // the child never outlives a failing test
});
async function keepAwakeForCase(p) {
  const c = A.keepAwakeFor('iphone.mjs scroll (t)', p.pid);
  assert.ok(c);
  assert.equal(A.keepAwakeFor('iphone.mjs scroll (t)', p.pid), c, 'once per process');
  const [x] = await calls(1);
  assert.equal(x.pid, c);
  assert.deepEqual(x.args, ['-i', '-s', '-w', String(p.pid)]);
  const list = A.awakeProcesses();
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].what, list[0].pid, list[0].caffeinate], ['iphone.mjs scroll (t)', p.pid, c]);
  p.kill('SIGKILL'); // a crash
  assert.ok(await gone(c), 'the assertion ends with the process');
  assert.deepEqual(A.awakeProcesses(), [], 'and its record is dropped');
  assert.deepEqual(readdirSync(join(state, 'locks', 'awake')), []);
  assert.equal((await calls(1)).length, 1);
}

test('I-070: off macOS (no FW_CAFFEINATE) or with FW_NO_CAFFEINATE=1 there is no caffeinate binary; the flags are -i -s only', () => {
  assert.equal(A.caffeinateBin({}, 'linux'), null);
  assert.equal(A.caffeinateBin({ FW_NO_CAFFEINATE: '1', FW_CAFFEINATE: FAKE }, 'darwin'), null);
  assert.equal(A.caffeinateBin({ FW_CAFFEINATE: 'off' }, 'darwin'), null);
  assert.equal(A.caffeinateBin({ FW_CAFFEINATE: FAKE }, 'linux'), FAKE, 'an explicit binary (the tests\' fake) works anywhere');
  assert.equal(A.caffeinateBin({ FW_CAFFEINATE: join(state, 'nope') }, 'darwin'), null);
  assert.deepEqual([...A.AWAKE_FLAGS], ['-i', '-s'], 'idle and system sleep only: never -d (display) or -u');
});

test('a test process never starts a real caffeinate: without FW_CAFFEINATE, no assertion (holds or processes)', async () => {
  delete process.env.FW_CAFFEINATE;
  try {
    assert.ok(process.env.NODE_TEST_CONTEXT, 'running under node --test');
    assert.equal(A.keepAwake('chrome-measure', { token: 't', kind: 'process', pid: process.pid, awake: true }), null);
    assert.equal(A.keepAwakeFor('x', 999998), null);
  } finally { process.env.FW_CAFFEINATE = FAKE; }
  assert.deepEqual(await calls(0), []);
});

test('I-070 (C-024, replaces ts-lock-bundle (a)): the head waiter held at the host gate keeps nothing awake', async () => {
  // a busy fake host for this acquire only (its samplers advance fake time: no real 10 s windows)
  let t = 7_000_000, busy = 0, total = 0;
  const s = {
    now: () => t, mono: () => t, wake: () => 1, procs: () => ({}),
    sleep: async (ms) => { t += ms; total += ms * 8; busy += ms * 8 * 0.7; await sleep(5); },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: busy / 8, nice: 0, sys: 0, idle: (total - busy) / 8, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
  await assert.rejects(L.acquire('chrome-measure', { owner: 'gated', kind: 'process', timeoutSec: 0.3, pollMs: 50, log: () => {}, hostSamplers: s }), /timed out after 0\.3 s waiting for a quiet host/);
  await sleep(200);
  assert.deepEqual(await calls(0), [], 'a gate wait is no measurement');
});
