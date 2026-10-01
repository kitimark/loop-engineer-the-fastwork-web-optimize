// tools/lib/lock.mjs host admission gate (incident I-016, postmortem 2026-09-30 §3 (a)): the head normal
// waiter of chrome-measure is granted only on a quiet host, keeps its place meanwhile, is granted anyway
// (gateTimeout) after the cap; short jobs are exempt; other resources are never gated. Host readings are
// injected (tryAcquire `host`, acquire `hostSamplers`), so nothing depends on the real machine.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, sleep } from '../helpers.mjs';

const L = await import('../../tools/lib/lock.mjs');
const H = await import('../../tools/lib/host.mjs');
const R = 'chrome-measure';
let state;
beforeEach(() => { state = tempDir('fw-gate-'); process.env.FW_STATE_DIR = state; });
const lockFile = (f) => join(state, 'locks', f);
const readJson = (f) => JSON.parse(readFileSync(lockFile(f), 'utf8'));
const QUIET = { quiet: true, reasons: [], sample: { load1: 2, busyPct: 8, sysPct: 2, pressure: 1, windowSec: 10 } };
const BUSY = { quiet: false, reasons: ['cpu 60 % > 20 %'], sample: { load1: 14, busyPct: 60, sysPct: 20, pressure: 1, windowSec: 10 } };
const UNKNOWN = { quiet: null, reasons: ['not measured yet'] };

/** Fake host samplers for acquire(): busy fraction from a function of the number of windows measured. */
function samplers(busyAt) {
  let t = 5_000_000, busy = 0, total = 0, windows = 0;
  return {
    now: () => t, mono: () => t, wake: () => 1, procs: () => ({}), // a complete host: the real one is refused in tests (I-024)
    sleep: async (ms) => { t += ms; total += ms * 8; busy += ms * 8 * busyAt(windows++); },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: busy / 8, nice: 0, sys: 0, idle: (total - busy) / 8, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
}

test('the head normal waiter keeps its place until the host is quiet; the grant records the gate', async () => {
  const first = await L.tryAcquire(R, { owner: 'ab-topic', kind: 'lease', host: UNKNOWN });
  assert.equal(first.ok, false);
  assert.equal(first.gated, true);
  assert.equal(first.holder, null);
  assert.equal(first.position, 1);
  const since = first.gate.since;
  const busy = await L.tryAcquire(R, { owner: 'ab-topic', kind: 'lease', host: BUSY });
  assert.equal(busy.gated, true);
  assert.equal(busy.gate.since, since, 'the gate wait keeps its start');
  assert.deepEqual([busy.gate.quiet, busy.gate.reasons, busy.gate.load1, busy.gate.busyPct], [false, ['cpu 60 % > 20 %'], 14, 60]);
  assert.deepEqual(readJson(`${R}.queue.json`).map((w) => [w.owner, w.gate.quiet]), [['ab-topic', false]], 'status can show why');
  // someone else queued behind it can't take the free lock either
  const other = await L.tryAcquire(R, { owner: 'later', kind: 'lease', host: QUIET });
  assert.equal(other.ok, false);
  assert.equal(other.position, 2);
  const ok = await L.tryAcquire(R, { owner: 'ab-topic', kind: 'lease', host: QUIET });
  assert.equal(ok.ok, true);
  assert.equal(ok.holder.gateTimeout, undefined);
  assert.deepEqual({ ...ok.holder.gate, waitedSec: 0 }, { quiet: true, waitedSec: 0, reasons: [], load1: 2, busyPct: 8, sysPct: 2, pressure: 1 });
  assert.deepEqual(readJson(`${R}.queue.json`).map((w) => w.owner), ['later']);
});

test('gate timeout: after gateMaxWaitSec the waiter is granted anyway, marked gateTimeout, and an alert is logged', async () => {
  const T = { ...H.THRESHOLDS, gateMaxWaitSec: 1 };
  assert.equal((await L.tryAcquire(R, { owner: 'patient', kind: 'lease', host: BUSY, thresholds: T })).gated, true);
  await sleep(1100);
  const g = await L.tryAcquire(R, { owner: 'patient', kind: 'lease', host: BUSY, thresholds: T });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, true);
  assert.deepEqual([g.holder.gate.quiet, g.holder.gate.timeout, g.holder.gate.reasons, g.holder.gate.busyPct], [false, true, ['cpu 60 % > 20 %'], 60]);
  assert.ok(g.holder.gate.waitedSec >= 1);
  const alerts = readFileSync(L.hostAlertsFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(alerts.map((a) => [a.resource, a.owner, a.event, a.quiet]), [[R, 'patient', 'gate-timeout', false]]);
});

test('short jobs are exempt: granted past a head normal waiter held by the gate; the gate wait survives them', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).gated, true);
  // the short-lane drain budget is used up, so without the gate the normal waiter would be served first
  mkdirSync(join(state, 'locks'), { recursive: true });
  const t = Date.now();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: 'aaaaaaaaaaaa' }));
  const s = await L.tryAcquire(R, { owner: 'npm-test', kind: 'lease', short: true, maxSec: 120 });
  assert.equal(s.ok, true, 'short job passes the gated head waiter');
  const since = readJson(`${R}.queue.json`)[0].gate.since;
  const wait = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: UNKNOWN });
  assert.equal(wait.ok, false);
  assert.equal(wait.gated, undefined, 'busy (held by the short job), not gated');
  assert.equal(readJson(`${R}.queue.json`)[0].gate.since, since, 'gate wait kept while the short job runs');
  await L.release(R, { owner: 'npm-test' });
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: QUIET });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gate.quiet, true);
});

test('without the gate holding the head, a short job past the drain budget still waits (no exemption)', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: undefined, meta: {} })).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'normal2', kind: 'lease' })).ok, false);
  await L.release(R, { owner: 'normal' });
  const t = Date.now();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: 'aaaaaaaaaaaa' }));
  for (let i = 0; i < 2; i++) {
    const s = await L.tryAcquire(R, { owner: 'npm-test', kind: 'lease', short: true, maxSec: 120 });
    assert.equal(s.ok, false, 'normal2 is next (drain budget used up) and not held by the gate');
  }
});

test('not gated: other resources, short jobs, and callers that pass no host reading', async () => {
  assert.equal((await L.tryAcquire('iphone', { owner: 'p', kind: 'lease', host: BUSY })).ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, host: BUSY })).ok, true);
  await L.release(R, { owner: 's' });
  const x = await L.tryAcquire(R, { owner: 'lib', kind: 'lease' });
  assert.equal(x.ok, true);
  assert.equal(x.holder.gate, undefined);
});

test('acquire(): samples 10 s windows while it is its turn, then takes the lock on a quiet host', async () => {
  const s = samplers((w) => (w < 2 ? 0.7 : 0.05)); // two busy windows, then quiet
  const h = await L.acquire(R, { owner: 'verify', kind: 'lease', pollMs: 20, log: () => {}, hostSamplers: s });
  assert.equal(h.holder.gate.quiet, true);
  assert.equal(h.holder.gate.busyPct, 5);
  assert.equal(h.holder.gateTimeout, undefined);
  h.release();
  // never quiet: granted after the cap, with gateTimeout
  const busy = samplers(() => 0.7);
  const logs = [];
  const g = await L.acquire(R, { owner: 'verify2', kind: 'lease', pollMs: 20, log: (m) => logs.push(m), hostSamplers: busy, thresholds: { ...H.THRESHOLDS, gateMaxWaitSec: 1 } });
  assert.equal(g.holder.gateTimeout, true);
  assert.deepEqual(g.holder.gate.reasons, ['cpu 70 % > 20 %']);
  assert.match(logs.join('\n'), /free, but the host is not quiet \(cpu 70 % > 20 %\)/);
  g.release();
  assert.equal(existsSync(lockFile(`${R}.json`)), false);
});

test('review-gate R1: once a gate wait reaches the cap, short jobs no longer pass the head waiter; it is granted next', async () => {
  const T = { ...H.THRESHOLDS, gateMaxWaitSec: 1 };
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T })).gated, true);
  // short-lane budget used up, so only the gate exemption could let a short job through
  mkdirSync(join(state, 'locks'), { recursive: true });
  const t = Date.now();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: 'aaaaaaaaaaaa' }));
  const s1 = await L.tryAcquire(R, { owner: 'npm-test', kind: 'lease', short: true, maxSec: 60, thresholds: T });
  assert.equal(s1.ok, true, 'before the cap: exempt');
  await L.release(R, { owner: 'npm-test' });
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: 'bbbbbbbbbbbb' }));
  await sleep(1100);
  // the head waiter's gate record is fresh (it keeps polling), but its wait has reached the cap
  const q = readJson(`${R}.queue.json`);
  q[0].gate.at = new Date().toISOString();
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 'npm-test2', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, false, 'no exemption after the cap');
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, true);
});

test('review-gate R2: a lead\'s queue move (I-019 movedBy/movedAt) survives the gated waiter\'s refresh', async () => {
  const X = await import('../../tools/lib/lock-repair.mjs');
  assert.equal((await L.tryAcquire(R, { owner: 'holder', kind: 'lease' })).ok, true);
  for (const o of ['a', 'b']) assert.equal((await L.tryAcquire(R, { owner: o, kind: 'lease', host: UNKNOWN })).ok, false);
  await X.moveWaiter(R, { owner: 'b', to: 1, by: 'lead', reason: 'priority', apply: true });
  await L.release(R, { owner: 'holder' });
  const g = await L.tryAcquire(R, { owner: 'b', kind: 'lease', host: BUSY });
  assert.equal(g.gated, true, 'b is first after the move, and the gate holds it');
  const b = readJson(`${R}.queue.json`).find((w) => w.owner === 'b');
  assert.equal(b.movedBy, 'lead');
  assert.equal(typeof b.movedAt, 'string');
  assert.equal(b.gate.quiet, false);
  assert.deepEqual(readJson(`${R}.queue.json`).map((w) => w.owner), ['b', 'a']);
});
