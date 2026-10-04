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
  // the waiter keeps polling (fresh gate record) and has now waited 490 s at the gate: past the pass window, below the
  // cap. (I-185: past the window only a job whose cap ends GATE_PASS_SETTLE_SEC before the cap passes; this 60 s one
  // would end at 550 s, inside the settling window, so the gate stays closed to it. Before I-185 this waited 31 s.)
  const q = readJson(`${R}.queue.json`);
  Object.assign(q[0].gate, { at: new Date().toISOString(), since: new Date(Date.now() - 490000).toISOString() });
  writeFileSync(lockFile(`${R}.queue.json`), JSON.stringify(q));
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 'npm-test2', kind: 'lease', short: true, maxSec: 60, thresholds: T })).ok, false, 'past the pass window the gate closes to short jobs that do not fit');
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY, thresholds: T })).gated, true, 'still waits for quiet (cap not reached)');
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: QUIET, thresholds: T });
  assert.equal(g.ok, true);
  assert.equal(g.holder.gateTimeout, undefined);
  assert.ok(g.holder.gate.waitedSec >= 490);
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

// I-185 (user T-165, 2026-10-04 22:04-22:07Z): the lane stood empty while 11 jobs waited behind a timing head held at
// the host gate past its 120 s pass window. Past that window a capped non-timing job (a short job, or a shared reader)
// passes the gated timing head when its cap ends at least GATE_PASS_SETTLE_SEC before the head's gate-timeout grant
// (now + maxSec + 120 <= gate.since + gateMaxWaitSec); moved heads too; never a job without a cap (--no-timing) and never
// a timing waiter; FW_GATE_SHORT_PASS=0: none; board priority, then queue order; every pass is one audit line.
const gatePasses = () => (existsSync(lockFile('audit.log')) ? readFileSync(lockFile('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.code === 'gate-pass') : []);
/** A head timing waiter held at the gate since `sec` s before `now` (its gate record fresh, as while it polls a free lock). */
async function gatedHead(owner, sec, now, { moved = false } = {}) {
  if (moved) {
    assert.equal((await L.tryAcquire(R, { owner: 'holder', kind: 'lease', now })).ok, true);
    assert.equal((await L.tryAcquire(R, { owner, kind: 'lease', host: BUSY, now })).ok, false);
    const X = await import('../../tools/lib/lock-repair.mjs');
    await X.moveWaiter(R, { owner, to: 1, by: 'lead', reason: 'goal path', apply: true });
    await L.release(R, { owner: 'holder' });
  }
  assert.equal((await L.tryAcquire(R, { owner, kind: 'lease', host: BUSY, now })).gated, true);
  editQueue((q) => Object.assign(gateOf(q, owner), { since: new Date(now - sec * 1000).toISOString(), at: new Date(now).toISOString() }));
}
const short = (owner, maxSec, now, extra = {}) => L.tryAcquire(R, { owner, kind: 'lease', short: true, maxSec, now, ...extra });
const reader = (owner, maxSec, now, extra = {}) => L.tryAcquire(R, { owner, kind: 'lease', shared: true, weight: 2, job: 'npm-test', maxSec, now, load1: 1, ...extra });

test('I-185: past the pass window a short job whose cap fits passes the gated timing head (130 s, 300 s job), logged as gate-pass', async () => {
  assert.equal(L.GATE_PASS_SETTLE_SEC, 120);
  const now = Date.now();
  await gatedHead('normal', 130, now);
  assert.equal((await short('fit', 300, now)).ok, false, 'the first poll queues it');
  const s = await short('fit', 300, now);
  assert.equal(s.ok, true, '130 + 300 + 120 = 550 <= 600: it passes');
  assert.equal(s.mode, 'short');
  assert.deepEqual(readJson(`${R}.queue.json`).map((w) => w.owner), ['normal'], 'the head keeps its place and its gate wait');
  const [a, ...more] = gatePasses();
  assert.equal(more.length, 0, 'one audit line per pass');
  assert.deepEqual({ code: a.code, resource: a.resource, by: a.by, owner: a.owner, head: a.head, headGatedSec: a.headGatedSec, maxSec: a.maxSec },
    { code: 'gate-pass', resource: R, by: 'lock', owner: 'fit', head: 'normal', headGatedSec: 130, maxSec: 300 });
  assert.equal(a.ts, new Date(now).toISOString());
  assert.match(a.reason, /I-185/);
});

test('I-185: no pass that would end inside the settling window before the head\'s gate-timeout grant (boundary; back-to-back shorts)', async () => {
  const now = Date.now();
  await gatedHead('normal', 181, now);
  for (let i = 0; i < 2; i++) assert.equal((await short('long', 300, now)).ok, false, '181 + 300 + 120 = 601 > 600');
  editQueue((q) => { gateOf(q, 'normal').since = new Date(now - 180000).toISOString(); });
  assert.equal((await short('long', 300, now)).ok, true, '180 + 300 + 120 = 600: just fits');
  await L.release(R, { owner: 'long' });
  // back to back: the head polls again (busy, fresh gate record) 60 s later; a second 300 s short no longer fits, a 60 s one does
  const later = now + 60000;
  editQueue((q) => { gateOf(q, 'normal').at = new Date(later).toISOString(); q[0].lastSeen = new Date(later).toISOString(); });
  for (let i = 0; i < 2; i++) assert.equal((await short('second', 300, later)).ok, false, '240 + 300 + 120 > 600: refused after the first pass');
  assert.equal((await short('small', 60, later)).ok, false, 'queued');
  assert.equal((await short('small', 60, later)).ok, true, '240 + 60 + 120 = 420: fits');
  assert.deepEqual(gatePasses().map((x) => [x.owner, x.headGatedSec, x.maxSec]), [['long', 180, 300], ['small', 240, 60]]);
});

test('I-185: a shared reader passes the gated head when its cap fits; a 480 s npm-test reader at 200 s does not', async () => {
  await L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'test', cap: 6 });
  const now = Date.now();
  await gatedHead('normal', 200, now);
  for (let i = 0; i < 2; i++) assert.equal((await reader('npm480', 480, now)).ok, false, '200 + 480 + 120 = 800 > 600');
  assert.equal((await reader('npm260', 260, now)).ok, false, 'queued');
  const g = await reader('npm260', 260, now);
  assert.equal(g.ok, true, '200 + 260 + 120 = 580 <= 600: it opens a group');
  assert.equal(g.opened, true);
  // npm480 was queued before the group opened (an in-batch join), but its cap still does not fit
  assert.equal((await reader('npm480', 480, now)).ok, false, 'no join past the gated head that does not fit');
  assert.deepEqual(gatePasses().map((x) => [x.owner, x.head, x.headGatedSec, x.maxSec]), [['npm260', 'normal', 200, 260]]);
});

test('I-185: an in-batch reader join past a gated head is a pass too: it joins only when its cap fits, and is logged', async () => {
  await L.setSharedSwitch(R, { on: true, by: 'lead', reason: 'test', cap: 6 });
  const now = Date.now();
  await gatedHead('normal', 130, now);
  assert.equal((await reader('r1', 300, now)).ok, false);
  assert.equal((await reader('r2', 300, now, { weight: 2 })).ok, false);
  assert.equal((await reader('r1', 300, now)).opened, true);
  const j = await reader('r2', 300, now);
  assert.equal(j.ok, true, 'r2 queued before the group opened and fits: it joins');
  assert.deepEqual(gatePasses().map((x) => x.owner), ['r1', 'r2']);
});

test('I-185: nobody passes before 120 s at a moved head; a moved head is passed after 120 s by a job that fits', async () => {
  const now = Date.now();
  await gatedHead('goal', 100, now, { moved: true });
  for (let i = 0; i < 2; i++) assert.equal((await short('s', 60, now)).ok, false, 'a moved head is never passed in its first 120 s (I-030)');
  editQueue((q) => { gateOf(q, 'goal').since = new Date(now - 125000).toISOString(); });
  const s = await short('s', 60, now);
  assert.equal(s.ok, true, 'after 120 s the fit rule passes the moved head too');
  assert.deepEqual(gatePasses().map((x) => [x.owner, x.head, x.headGatedSec]), [['s', 'goal', 125]]);
});

test('I-185: no pass without a cap (--no-timing) and never a timing waiter past a timing waiter; FW_GATE_SHORT_PASS=0: none', async () => {
  const now = Date.now();
  await gatedHead('normal', 130, now);
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 'build', kind: 'lease', noTiming: true, now })).ok, false, 'a --no-timing hold has no cap');
  for (let i = 0; i < 2; i++) assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: QUIET, now })).ok, false, 'a timing waiter never passes a timing waiter');
  const T0 = H.thresholds({ FW_GATE_SHORT_PASS: '0' });
  for (let i = 0; i < 2; i++) assert.equal((await short('s', 60, now, { thresholds: T0 })).ok, false, 'FW_GATE_SHORT_PASS=0: no pass at all');
  assert.equal(gatePasses().length, 0);
  assert.equal((await short('s', 60, now)).ok, true, 'the default env passes');
});

test('I-185: candidates go in board-priority order (best open status row), then queue order', async () => {
  const now = Date.now();
  await gatedHead('normal', 130, now);
  for (const o of ['a', 'b', 'c']) assert.equal((await short(o, 60, now)).ok, false);
  const ranks = { b: 1, c: 1, a: 5 };
  const rankOf = (o) => ranks[o] ?? null;
  assert.equal((await short('a', 60, now, { rankOf })).ok, false, 'a is first in the queue but ranks below b and c');
  assert.equal((await short('c', 60, now, { rankOf })).ok, false, 'b and c rank equal: queue order');
  assert.equal((await short('b', 60, now, { rankOf })).ok, true);
  await L.release(R, { owner: 'b' });
  assert.equal((await short('a', 60, now)).ok, true, 'without board ranks: queue order');
});

test('I-185: without an injected rankOf the pass reads the real status board (lock-repair boardRanks)', async () => {
  const S = await import('../../tools/lib/status.mjs');
  const now = Date.now();
  await gatedHead('normal', 130, now);
  for (const o of ['a', 'b']) assert.equal((await short(o, 60, now)).ok, false);
  await S.set('b-row', { by: 'b', kind: 'fix', title: 'Item b' });
  await S.set('a-row', { by: 'a', kind: 'fix', title: 'Item a' });
  await S.setPriority('b-row', 1, { by: 'lead' });
  await S.setPriority('a-row', 2, { by: 'lead' });
  assert.equal((await short('a', 60, now)).ok, false, 'a is first in the queue but b ranks #1 on the board');
  assert.equal((await short('b', 60, now)).ok, true);
  assert.deepEqual(gatePasses().map((x) => x.owner), ['b']);
});

test('I-033: a host sleep inside a gate window is not quiet (one more window), and the grant records the gate\'s sleep', async () => {
  // the 04:00Z canary: the Mac slept 27 s inside the gate's only window, the gate granted on that window, and the
  // holder's gate record dropped the sleep, so verify.json said sleptSec 0 everywhere (its own windows came later)
  let t = 9_000_000, jump = 0, wake = 1, windows = 0;
  const s = {
    now: () => t + jump, mono: () => t, wake: () => wake, procs: () => ({}),
    sleep: async (ms) => { if (windows++ === 0) { t += 7000; jump += 27000; wake++; t += ms - 7000; } else t += ms; },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: t * 0.05, nice: 0, sys: 0, idle: t * 0.95, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
  const g = await L.gateSample({ samplers: s });
  assert.equal(g.quiet, false, 'a window with a sleep in it is not quiet, however idle its ticks look');
  assert.deepEqual(g.reasons, ['host slept 27 s in this window']);
  windows = 0;
  const h = await L.acquire(R, { owner: 'canary', kind: 'lease', pollMs: 20, log: () => {}, hostSamplers: s });
  assert.equal(windows, 2, 'granted on the fresh window after the wake, not on the one with the sleep');
  assert.equal(h.holder.gate.quiet, true);
  assert.equal(h.holder.gate.sleptSec, 27, 'the gate\'s sleep, summed over its windows');
  assert.equal(h.holder.gate.woke, true);
  h.release();
});

const SLEPT = (sec) => ({ quiet: false, reasons: [`host slept ${sec} s in this window`], sample: { ...BUSY.sample, load1: 1, busyPct: 3, suspended: true, sleptSec: sec, woke: true } });

test('review-host-state B1: a sleep that carries the gate past its cap is no gate timeout: the suspended window never times out, and the cap counts awake time', async () => {
  const T = { ...H.THRESHOLDS, gateMaxWaitSec: 1 };
  assert.equal((await L.tryAcquire(R, { owner: 'sleeper', kind: 'lease', host: BUSY, thresholds: T })).gated, true);
  await sleep(1100); // the wall clock is past the 1 s cap (as after a 472 s Maintenance Sleep, I-026)
  const w = await L.tryAcquire(R, { owner: 'sleeper', kind: 'lease', host: SLEPT(600), thresholds: T });
  assert.deepEqual([w.ok, w.gated, w.gate.sleptSec, w.gate.woke], [false, true, 600, true], 'one more gated round, not timeout: true');
  // the fresh window after the wake is busy: 1.1 s of wall time minus 600 s asleep is under the cap, so still no timeout
  const b = await L.tryAcquire(R, { owner: 'sleeper', kind: 'lease', host: BUSY, thresholds: T });
  assert.deepEqual([b.ok, b.gated, b.gate.sleptSec], [false, true, 600]);
  assert.equal(existsSync(L.hostAlertsFile()), false, 'no gate-timeout alert');
  const g = await L.tryAcquire(R, { owner: 'sleeper', kind: 'lease', host: QUIET, thresholds: T });
  assert.deepEqual([g.ok, g.holder.gateTimeout, g.holder.gate.quiet, g.holder.gate.sleptSec, g.holder.gate.woke], [true, undefined, true, 600, true]);
});

test('review-host-state N3: the gate\'s sleep sum survives a short job passing the gated waiter (keyed by its gate wait)', async () => {
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: SLEPT(27) })).gated, true);
  mkdirSync(join(state, 'locks'), { recursive: true });
  const t = Date.now();
  writeFileSync(lockFile(`${R}.last-grant.json`), JSON.stringify({ owner: 'x', short: true, maxSec: 120, at: new Date(t - 10000).toISOString(), runStart: new Date(t - (L.SHORT_DRAIN_SEC - 10) * 1000).toISOString(), token: 'aaaaaaaaaaaa' }));
  assert.equal((await L.tryAcquire(R, { owner: 'npm-test', kind: 'lease', short: true, maxSec: 120 })).ok, true, 'short job passes the gated head waiter');
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: UNKNOWN })).ok, false);
  await L.release(R, { owner: 'npm-test' });
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: { ...QUIET, sample: { ...QUIET.sample, sleptSec: 0, woke: false } } });
  assert.deepEqual([g.ok, g.holder.gate.sleptSec, g.holder.gate.woke], [true, 27, true]);
});

test('no-timing hold (ts-lock-bundle): granted in its FIFO turn on a busy host without the gate; no timing acquirer re-enters it; the gate still holds the timing waiter after it', async () => {
  // FIFO: a no-timing waiter behind a normal holder waits like anyone
  assert.equal((await L.tryAcquire(R, { owner: 'h', kind: 'lease', host: QUIET })).ok, true);
  const q = await L.tryAcquire(R, { owner: 'build', kind: 'process', noTiming: true, host: BUSY });
  assert.deepEqual([q.ok, q.gated, q.position], [false, undefined, 1]);
  assert.equal(readJson(`${R}.queue.json`)[0].noTiming, true, 'status can show it');
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: BUSY })).ok, false);
  await L.release(R, { owner: 'h' });
  // its turn on a BUSY host: granted at once, no gate record (it measures nothing)
  const g = await L.tryAcquire(R, { owner: 'build', kind: 'process', noTiming: true, host: BUSY });
  assert.deepEqual([g.ok, g.holder.noTiming, g.holder.gate, g.holder.gateTimeout], [true, true, undefined, undefined]);
  assert.equal(existsSync(L.hostAlertsFile()), false);
  // nothing timed runs inside it: a descendant (FW_LOCK_HELD) or the same owner, as a normal (gated) acquirer, throws
  const held = L.heldEnv(R, g.holder.token, '');
  for (const o of [{ owner: 'verify', kind: 'process', held, host: UNKNOWN }, { owner: 'verify', kind: 'process', held }, { owner: 'build', kind: 'process', host: UNKNOWN }]) {
    await assert.rejects(L.tryAcquire(R, o), /chrome-measure is held by "build" as a no-timing hold .*a timing run \(verify\.mjs, fix\.mjs ab, bench, a normal lock\.mjs run\) never runs inside it/);
  }
  await assert.rejects(L.acquire(R, { owner: 'bench', kind: 'process', held, log: () => {}, hostSamplers: samplers(() => 0.05) }), /no-timing hold/, 'acquire() too (verify.mjs, fix.mjs ab, bench)');
  // short jobs and nested no-timing runs may
  assert.deepEqual([(await L.tryAcquire(R, { owner: 'npm-test', kind: 'process', short: true, maxSec: 60, held })).reentrant, (await L.tryAcquire(R, { owner: 'xcb', kind: 'process', noTiming: true, held })).reentrant], [true, true]);
  assert.equal(L.status(R).holder.owner, 'build', 're-entry changes nothing');
  await assert.rejects(L.tryAcquire(R, { owner: 'x', kind: 'process', noTiming: true, short: true, maxSec: 60 }), /--no-timing is for normal holds/);
  // after it, the timing waiter passes the gate as usual: BUSY keeps it gated, QUIET grants with a gate record
  await L.release(R, { owner: 'build' });
  assert.equal((await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: BUSY })).gated, true);
  const t = await L.tryAcquire(R, { owner: 'ab', kind: 'lease', host: QUIET });
  assert.deepEqual([t.ok, t.holder.gate.quiet, t.holder.noTiming], [true, true, undefined]);
});

test('ts-lock-bundle, N7: a --no-timing run nested inside a timing hold (FW_LOCK_HELD) refuses; inside a short or a no-timing hold it re-enters', async () => {
  const t = await L.tryAcquire(R, { owner: 'ab', kind: 'process', host: QUIET });
  assert.equal(t.ok, true);
  const held = L.heldEnv(R, t.holder.token, '');
  await assert.rejects(L.tryAcquire(R, { owner: 'xcb', kind: 'process', noTiming: true, held }), /chrome-measure is held by "ab" as a timing hold: a --no-timing run \(a build, CPU work\) never runs inside it/);
  await assert.rejects(L.acquire(R, { owner: 'xcb', kind: 'process', noTiming: true, held, log: () => {} }), /as a timing hold/, 'acquire() too (lock.mjs run --no-timing)');
  assert.equal(L.status(R).holder.owner, 'ab', 'the refusal changes nothing');
  assert.equal((await L.tryAcquire(R, { owner: 'npm-test', kind: 'process', short: true, maxSec: 60, held })).reentrant, true, 'a short job still may');
  await L.release(R, { owner: 'ab' });
  // a short hold may host it
  const s = await L.tryAcquire(R, { owner: 'npm-test', kind: 'process', short: true, maxSec: 60 });
  assert.equal(s.ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'xcb', kind: 'process', noTiming: true, held: L.heldEnv(R, s.holder.token, '') })).reentrant, true);
  await L.release(R, { owner: 'npm-test' });
});

test('no-timing hold (ts-lock-bundle): acquire() skips the gate windows (no host sample) and the holder says noTiming', async () => {
  let windows = 0;
  const s = { ...samplers(() => 0.9), sleep: async () => { windows++; } };
  const h = await L.acquire(R, { owner: 'build', kind: 'lease', noTiming: true, pollMs: 20, log: () => {}, hostSamplers: s });
  assert.deepEqual([h.holder.noTiming, h.holder.gate, windows], [true, undefined, 0]);
  h.release();
});

test('ts-lock-bundle (b): a host sleep in a gate window that outlasts acquire()\'s timeoutSec does not throw on wake: awake time counts, one fresh window decides', async () => {
  // the first window takes 1.2 s of real time (past timeoutSec 1) and the host "slept" 600 s in it (wall clock jumps, wake count rises)
  let t = 11_000_000, jump = 0, wake = 1, windows = 0;
  const s = {
    now: () => t + jump, mono: () => t, wake: () => wake, procs: () => ({}),
    sleep: async (ms) => { if (windows++ === 0) { await sleep(1200); jump += 600000; wake++; } t += ms; },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: t * 0.05, nice: 0, sys: 0, idle: t * 0.95, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
  const h = await L.acquire(R, { owner: 'woke', kind: 'lease', timeoutSec: 1, pollMs: 20, log: () => {}, hostSamplers: s });
  assert.equal(windows, 2, 'the window with the sleep, then one fresh window after the wake');
  assert.deepEqual([h.holder.gate.quiet, h.holder.gate.sleptSec, h.holder.gateTimeout], [true, 600, undefined]);
  h.release();
  // awake time past timeoutSec still ends the wait (a busy host that never sleeps)
  let u = 12_000_000, busy = 0, total = 0;
  const b = {
    now: () => u, mono: () => u, wake: () => 1, procs: () => ({}),
    sleep: async (ms) => { u += ms; total += ms * 8; busy += ms * 8 * 0.7; await sleep(5); },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: busy / 8, nice: 0, sys: 0, idle: (total - busy) / 8, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
  };
  await assert.rejects(L.acquire(R, { owner: 'busy', kind: 'lease', timeoutSec: 0.3, pollMs: 20, log: () => {}, hostSamplers: b }), /timed out after 0\.3 s waiting for a quiet host$/);
  assert.deepEqual(L.status(R).queue, [], 'it left the queue');
});

// review-lock-bundle N2: one test per mechanism of (b); the test above passes with either one alone.
// Fake host: window `i` (1-based) can take real time, jump the wall clock (sleptSec), bump the wake count, or be busy.
const gateHost = (plan) => {
  let t = 13_000_000, jump = 0, wake = 1, busy = 0, total = 0, w = 0;
  return {
    now: () => t + jump, mono: () => t, wake: () => wake, procs: () => ({}),
    sleep: async (ms) => {
      const p = plan[++w] || {};
      if (p.realMs) await sleep(p.realMs);
      if (p.jumpMs) jump += p.jumpMs;
      if (p.woke) wake++;
      t += ms; total += ms * 8; busy += ms * 8 * (p.busy ? 0.7 : 0.05);
    },
    cpus: () => Array.from({ length: 8 }, () => ({ times: { user: busy / 8, nice: 0, sys: 0, idle: (total - busy) / 8, irq: 0 } })),
    loadavg: () => [1, 1, 1], freemem: () => 1e9, pressure: () => 1, decompressions: () => 0,
    windows: () => w,
  };
};

test('ts-lock-bundle (b), N2: right after a slept window the timeout is not checked (!sleptLast), even when awake time is past it', async () => {
  // window 1: a wake (kern.waketime changed) with ~0 s of measured sleep, 400 ms of real time > timeoutSec 0.2; window 2 quiet.
  // Subtracting gateSleptMs (~0) would not save it: only the skipped check after a slept window does.
  const s = gateHost({ 1: { realMs: 400, woke: true } });
  const h = await L.acquire(R, { owner: 'woke0', kind: 'lease', timeoutSec: 0.2, pollMs: 20, log: () => {}, hostSamplers: s });
  assert.equal(s.windows(), 2, 'the slept window, then one fresh window decides');
  assert.equal(h.holder.gate.quiet, true);
  h.release();
});

test('ts-lock-bundle (b), N2: the sleep a gate window saw is subtracted from the timeout (- gateSleptMs) after a later awake window too', async () => {
  // window 1: the host slept 600 s (wall clock jump) and took 400 ms of real time; window 2 awake but busy (sleptLast
  // false again), window 3 quiet. At the check before window 3 only the subtracted 600 s keeps the wait alive.
  const s = gateHost({ 1: { realMs: 400, jumpMs: 600000 }, 2: { busy: true } });
  const h = await L.acquire(R, { owner: 'slept600', kind: 'lease', timeoutSec: 0.2, pollMs: 20, log: () => {}, hostSamplers: s });
  assert.equal(s.windows(), 3);
  assert.equal(h.holder.owner, 'slept600');
  h.release();
});

test('I-081: a short released while a normal waiter queues keeps its record: a short passing that waiter at the gate continues the run', async () => {
  const s1 = await L.tryAcquire(R, { owner: 's1', kind: 'lease', short: true, maxSec: 120 });
  assert.equal(s1.ok, true);
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).ok, false, 'queued behind s1');
  await L.release(R, { owner: 's1' });
  assert.equal(readJson(`${R}.last-grant.json`).token, s1.holder.token, 'kept: a normal waiter is queued');
  assert.equal((await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: BUSY })).gated, true);
  const s2 = await L.tryAcquire(R, { owner: 'npm-test', kind: 'lease', short: true, maxSec: 120 });
  assert.equal(s2.ok, true, 'the gate exemption is unchanged');
  assert.equal(readJson(`${R}.last-grant.json`).runStart, s1.holder.acquiredAt, 'the short run that started with s1 goes on');
  await L.release(R, { owner: 'npm-test' });
  assert.equal(readJson(`${R}.last-grant.json`).token, s2.holder.token, 'kept for the gated waiter');
  const g = await L.tryAcquire(R, { owner: 'normal', kind: 'lease', host: QUIET });
  assert.equal(g.ok, true);
  assert.equal(readJson(`${R}.last-grant.json`).owner, 'normal');
});
