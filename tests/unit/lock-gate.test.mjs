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
const BUSY = { quiet: false, reasons: ['cpu 60 % > 25 %'], sample: { load1: 14, busyPct: 60, sysPct: 20, pressure: 1, windowSec: 10 } };
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
  assert.deepEqual([busy.gate.quiet, busy.gate.reasons, busy.gate.load1, busy.gate.busyPct], [false, ['cpu 60 % > 25 %'], 14, 60]);
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
  assert.deepEqual([g.holder.gate.quiet, g.holder.gate.timeout, g.holder.gate.reasons, g.holder.gate.busyPct], [false, true, ['cpu 60 % > 25 %'], 60]);
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
  assert.deepEqual(g.holder.gate.reasons, ['cpu 70 % > 25 %']);
  assert.match(logs.join('\n'), /free, but the host is not quiet \(cpu 70 % > 25 %\)/);
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

// I-030: short jobs passed a lead-moved normal waiter while its gate was closed ("not measured yet"); each short
// kept the host busy, so the gate stayed closed and the normal was starved until the gate cap (contaminated grant).
test('I-030: short jobs never pass a head normal waiter the lead moved, even while its gate is closed', async () => {
  const X = await import('../../tools/lib/lock-repair.mjs');
  assert.equal((await L.tryAcquire(R, { owner: 'holder', kind: 'lease' })).ok, true);
  for (const o of ['a', 'goal']) assert.equal((await L.tryAcquire(R, { owner: o, kind: 'lease', host: UNKNOWN })).ok, false);
  await X.moveWaiter(R, { owner: 'goal', to: 1, by: 'lead', reason: 'goal path', apply: true });
  await L.release(R, { owner: 'holder' });
  const g = await L.tryAcquire(R, { owner: 'goal', kind: 'lease', host: UNKNOWN });
  assert.deepEqual([g.gated, g.gate.quiet, g.gate.reasons], [true, null, ['not measured yet']], 'the incident state');
  for (let i = 0; i < 2; i++) {
    const s = await L.tryAcquire(R, { owner: 'test-chrome', kind: 'lease', short: true, maxSec: 300 });
    assert.equal(s.ok, false, 'the short job waits behind the moved waiter');
    assert.equal(s.next, 'goal');
  }
  assert.equal((await L.tryAcquire(R, { owner: 'goal', kind: 'lease', host: BUSY })).gated, true);
  assert.equal((await L.tryAcquire(R, { owner: 'test-chrome', kind: 'lease', short: true, maxSec: 300 })).ok, false, 'still not while the host settles');
  const ok = await L.tryAcquire(R, { owner: 'goal', kind: 'lease', host: QUIET });
  assert.equal(ok.ok, true);
  assert.equal(ok.holder.gateTimeout, undefined, 'a clean grant, not a starved gate timeout');
  assert.deepEqual(readJson(`${R}.queue.json`).map((w) => w.owner), ['a', 'test-chrome']);
});

test('I-030: short jobs pass any gated head normal waiter only during the first gateShortPassSec of its gate wait', async () => {
  assert.equal(H.DEFAULTS.gateShortPassSec, 120);
  assert.ok(H.DEFAULTS.gateShortPassSec + L.SHORT_MAX_SEC + 2 * H.DEFAULTS.quietMinWindowSec <= H.DEFAULTS.gateMaxWaitSec,
    'the last short job let through ends with time left for the gate to settle before the cap');
  const T = { ...H.THRESHOLDS, gateShortPassSec: 30 };
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T })).gated, true);
  mkdirSync(join(state, 'locks'), { recursive: true });
  const usedUp = (tok) => { const t = Date.now(); writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: tok })); };
  usedUp('aaaaaaaaaaaa'); // drain budget used up: only the gate exemption could let a short job through
  assert.equal((await L.tryAcquire(R, { owner: 'npm-test', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, true, 'within the pass window: exempt');
  await L.release(R, { owner: 'npm-test' });
  usedUp('bbbbbbbbbbbb');
  // the waiter keeps polling (fresh gate record) and has now waited 31 s at the gate: past the pass window, far below the cap
  const q = readJson(`${R}.queue.json`);
  Object.assign(q[0].gate, { at: new Date().toISOString(), since: new Date(Date.now() - 31000).toISOString() });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 'npm-test2', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, false, 'past the pass window the gate closes to short jobs too');
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T })).gated, true, 'still waits for quiet (cap not reached)');
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: QUIET, thresholds: T });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, undefined);
  assert.ok(g.holder.gate.waitedSec >= 31);
});

// review of I-030: the short-lane drain (nextIndex) let short jobs pass a gated waiter before gateHolding was asked
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const editQueue = (fn) => { const q = readJson(`${R}.queue.json`); fn(q); writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q)); };
const gateOf = (q, owner) => q.find((w) => w.owner === owner).gate;

test('I-030 review: with drain budget left, short jobs stop passing a gated waiter after the pass window, even behind a 300 s short', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).gated, true);
  assert.equal((await L.tryAcquire(R, { owner: 's1', kind: 'lease', short: true, maxSec: 300 })).ok, true, 'early in the gate wait the short lane serves the short job');
  // the waiter keeps polling while s1 holds the lock: busy, so its gate record is kept but gate.at is not refreshed
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).ok, false);
  editQueue((q) => Object.assign(gateOf(q, 'normal'), { since: ago(290000), at: ago(280000) })); // s1 ran 280 s
  await L.release(R, { owner: 's1' });
  for (let i = 0; i < 2; i++) {
    const s = await L.tryAcquire(R, { owner: 's2', kind: 'lease', short: true, maxSec: 300 });
    assert.equal(s.ok, false, 'a second 300 s short still fits the 900 s drain budget, but the gate has waited out its pass window');
    assert.equal(s.next, 'normal');
  }
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).gated, true);
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: QUIET });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, undefined, 'granted on a quiet host, not by the 600 s timeout');
});

test('I-030 review: a lead-moved waiter that reaches the cap is granted (gate timeout); then short jobs flow again', async () => {
  const X = await import('../../tools/lib/lock-repair.mjs');
  const T = { ...H.THRESHOLDS, gateMaxWaitSec: 1 };
  assert.equal((await L.tryAcquire(R, { owner: 'holder', kind: 'lease' })).ok, true);
  for (const o of ['a', 'goal']) assert.equal((await L.tryAcquire(R, { owner: o, kind: 'lease', host: UNKNOWN, thresholds: T })).ok, false);
  await X.moveWaiter(R, { owner: 'goal', to: 1, by: 'lead', reason: 'goal path', apply: true });
  await L.release(R, { owner: 'holder' });
  assert.equal((await L.tryAcquire(R, { owner: 'goal', kind: 'lease', host: BUSY, thresholds: T })).gated, true);
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, false);
  editQueue((q) => { gateOf(q, 'goal').since = ago(2000); });
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, false, 'due: granted next');
  const g = await L.tryAcquire(R, { owner: 'goal', kind: 'lease', host: BUSY, thresholds: T });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, true);
  await L.release(R, { owner: 'goal' });
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, true, 'the short lane serves short jobs again');
});

test('I-030 review: FW_GATE_SHORT_PASS=0, read by the short job\'s own process: no short job passes a gated waiter', async () => {
  const T0 = H.thresholds({ FW_GATE_SHORT_PASS: '0' });
  assert.equal(T0.gateShortPassSec, 0);
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).gated, true);
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, thresholds: T0 })).ok, false, 'not through the drain (budget left; the 2nd poll is a queued short)');
  mkdirSync(join(state, 'locks'), { recursive: true });
  const t = Date.now();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: 'cccccccccccc' }));
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, thresholds: T0 })).ok, false, 'not through the gate exemption (budget used up)');
  // the setting is the polling process's: a short job started with the default env still passes in the window
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, true);
});

test('I-030 review: gateShortPassSec above the cap: the cap bounds the pass window (granted next, by timeout)', async () => {
  const T = { ...H.THRESHOLDS, gateShortPassSec: 1000, gateMaxWaitSec: 1 };
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T })).gated, true);
  editQueue((q) => Object.assign(gateOf(q, 'normal'), { since: ago(2000), at: ago(0) }));
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, false, 'drain budget left, but the wait reached the cap');
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, true);
});

test('I-030 review: a lead-moved gated waiter that stopped polling is skipped at the hand-over; short jobs pass it, it keeps its place', async () => {
  const X = await import('../../tools/lib/lock-repair.mjs');
  assert.equal((await L.tryAcquire(R, { owner: 'holder', kind: 'lease' })).ok, true);
  for (const o of ['a', 'goal']) assert.equal((await L.tryAcquire(R, { owner: o, kind: 'lease', host: UNKNOWN })).ok, false);
  await X.moveWaiter(R, { owner: 'goal', to: 1, by: 'lead', reason: 'goal path', apply: true });
  await L.release(R, { owner: 'holder' });
  assert.equal((await L.tryAcquire(R, { owner: 'goal', kind: 'lease', host: BUSY })).gated, true);
  editQueue((q) => { const w = q.find((x) => x.owner === 'goal'); w.lastSeen = ago((L.HANDOVER_FRESH_SEC + 10) * 1000); Object.assign(w.gate, { since: ago(200000), at: ago((L.HANDOVER_FRESH_SEC + 10) * 1000) }); });
  // the first poll queues the short job (it is not a waiter yet, so `a` is next); the second is served by the short lane
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, false);
  assert.equal((await L.tryAcquire(R, { owner: 's', kind: 'lease', short: true, maxSec: 60 })).ok, true);
  assert.deepEqual(readJson(`${R}.queue.json`).map((w) => w.owner), ['goal', 'a']);
});
