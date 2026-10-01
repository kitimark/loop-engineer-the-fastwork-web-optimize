// tools/lib/host.mjs: host CPU from os.cpus() tick deltas, load1, memory pressure, the quiet() admission
// rule, waitQuiet(), the measured Chrome's process-tree CPU and the per-run classifyRun() flags
// (postmortem 2026-09-30 §3 (a)/(d), incidents I-016/I-017). Samplers are stubbed; one subprocess checks
// the process-wide $FW_TEST_HOST stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { TESTS, node } from '../helpers.mjs';
import * as host from '../../tools/lib/host.mjs';

const FAKE_HOST = join(TESTS, 'fixtures', 'fake-host.mjs');

/** Synthetic host: 8 CPUs, a fake clock advanced by sleep(), busy/load/pressure from functions of fake time. */
function fakeSamplers({ busy = () => 0.1, load = () => 2, pressure = () => 1, decomp = () => 0, procs } = {}) {
  let t = 1_000_000, busyMs = 0, totalMs = 0, last = t, dec = 0;
  const adv = () => { const dt = t - last; last = t; totalMs += dt; busyMs += dt * busy(t); dec += (dt / 1000) * decomp(t); };
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    cpus: () => { adv(); return Array.from({ length: 8 }, () => ({ times: { user: busyMs * 0.75, nice: 0, sys: busyMs * 0.25, idle: totalMs - busyMs, irq: 0 } })); },
    loadavg: () => [load(t), 0, 0],
    freemem: () => 3 * 1048576 * 1024,
    pressure: () => pressure(t),
    decompressions: () => { adv(); return Math.round(dec); },
    procs: procs || (() => ({})),
    get t() { return t; },
  };
}

test('THRESHOLDS: the documented defaults; FW_GATE_* env overrides; bad values are refused', () => {
  assert.deepEqual({ ...host.DEFAULTS }, {
    quietMaxBusyPct: 20, quietMaxLoad1: 6, quietMaxPressure: 1, quietMinWindowSec: 10, gateMaxWaitSec: 600, recheckMaxWaitSec: 60,
    invalidLoad1: 10, invalidOtherBusyPct: 25, invalidPressure: 2, warnLoad1: 6, warnOtherBusyPct: 20,
  });
  const t = host.thresholds({ FW_GATE_MAX_LOAD1: '4', FW_GATE_MAX_BUSY: '15', FW_GATE_MAX_WAIT: '120' });
  assert.equal(t.quietMaxLoad1, 4);
  assert.equal(t.quietMaxBusyPct, 15);
  assert.equal(t.gateMaxWaitSec, 120);
  assert.equal(t.invalidLoad1, 10, 'run-validity numbers are not env-tunable');
  assert.deepEqual(host.thresholds({}), { ...host.DEFAULTS });
  assert.throws(() => host.thresholds({ FW_GATE_MAX_BUSY: 'lots' }), /FW_GATE_MAX_BUSY must be a number/);
});

test('between(): busy and sys % from summed tick deltas, load at both ends, max pressure, decompressions/s', () => {
  const snap = (at, busy, sys, total, load1, pressure, decompressions) => ({ at, ticks: { busy, sys, idle: total - busy, total }, load1, pressure, decompressions, freeMemMB: 500 });
  const x = host.between(snap(0, 1000, 300, 10000, 3.2, 1, 100), snap(10000, 3500, 1300, 90000, 4.1, 2, 600));
  assert.deepEqual({ w: x.windowSec, b: x.busyPct, s: x.sysPct, l: x.load1, ls: x.load1Start, le: x.load1End, p: x.pressure, pm: x.pressureMax, d: x.decompPerSec, f: x.freeMemMB },
    { w: 10, b: 3.1, s: 1.3, l: 4.1, ls: 3.2, le: 4.1, p: 2, pm: 2, d: 50, f: 500 });
  // unknown pressure/decompressions (not macOS) stay null
  const y = host.between(snap(0, 0, 0, 0, 1, null, null), snap(1000, 0, 0, 0, 1, null, null));
  assert.equal(y.busyPct, null, 'no tick delta: unknown, not 0');
  assert.equal(y.pressureMax, null);
  assert.equal(y.decompPerSec, null);
});

test('sample(): waits the window with the injected sleep, or measures from `since` without waiting', async () => {
  const s = fakeSamplers({ busy: () => 0.25, load: () => 5.5, decomp: () => 40 });
  const x = await host.sample({ windowSec: 3, samplers: s });
  assert.deepEqual({ load1: x.load1, busyPct: x.busyPct, sysPct: x.sysPct, windowSec: x.windowSec, pressure: x.pressure, decompPerSec: x.decompPerSec, freeMemMB: x.freeMemMB },
    { load1: 5.5, busyPct: 25, sysPct: 6.3, windowSec: 3, pressure: 1, decompPerSec: 40, freeMemMB: 3072 });
  const a = await host.snapshot({ samplers: s });
  await s.sleep(12000);
  const t = s.t;
  const y = await host.sample({ since: a, samplers: s });
  assert.equal(y.windowSec, 12);
  assert.equal(s.t, t, 'no extra wait with since');
  assert.equal(x.stub, undefined, 'not stubbed through FW_TEST_HOST');
});

test('quiet(): cpu <= 20 % over >= 10 s, load1 <= 6, pressure normal; each failing condition is named', () => {
  const ok = { windowSec: 10, busyPct: 20, load1: 6, pressure: 1 };
  assert.deepEqual(host.quiet(ok), { quiet: true, reasons: [] });
  assert.deepEqual(host.quiet({ ...ok, pressure: null }), { quiet: true, reasons: [] }, 'no pressure reading (not macOS) does not block');
  assert.deepEqual(host.quiet({ ...ok, busyPct: 20.1 }).reasons, ['cpu 20.1 % > 20 %']);
  assert.deepEqual(host.quiet({ ...ok, load1: 6.2 }).reasons, ['load1 6.2 > 6']);
  assert.deepEqual(host.quiet({ ...ok, pressure: 2 }).reasons, ['mem pressure warn']);
  assert.deepEqual(host.quiet({ ...ok, pressureMax: 4 }).reasons, ['mem pressure critical']);
  assert.deepEqual(host.quiet({ ...ok, windowSec: 3 }).reasons, ['cpu window 3 s < 10 s'], 'a 3 s window is too short to admit');
  assert.deepEqual(host.quiet({ ...ok, busyPct: null }).reasons, ['cpu unknown']);
  assert.equal(host.quiet(null).quiet, false);
  assert.equal(host.quiet({ ...ok, load1: 7 }, { ...host.DEFAULTS, quietMaxLoad1: 8 }).quiet, true, 'thresholds are a parameter');
});

test('waitQuiet(): 10 s windows until quiet, or gives up after maxWaitSec (always at least one window)', async () => {
  // busy 60 % for the first 25 s of fake time, then 5 %
  const s = fakeSamplers({ busy: (t) => (t < 1_025_000 ? 0.6 : 0.05) });
  const seen = [];
  const r = await host.waitQuiet({ maxWaitSec: 60, samplers: s, onSample: (x, q) => seen.push([x.busyPct, q.quiet]) });
  assert.equal(r.quiet, true);
  assert.equal(r.windows, 3);
  assert.equal(r.waitedSec, 30);
  assert.deepEqual(seen, [[60, false], [60, false], [5, true]]);
  assert.deepEqual(r.reasons, []);

  const busy = fakeSamplers({ busy: () => 0.9, load: () => 12 });
  const g = await host.waitQuiet({ maxWaitSec: 60, samplers: busy });
  assert.equal(g.quiet, false);
  assert.equal(g.windows, 6);
  assert.equal(g.waitedSec, 60);
  assert.deepEqual(g.reasons, ['cpu 90 % > 20 %', 'load1 12 > 6']);
  assert.equal((await host.waitQuiet({ maxWaitSec: 0, samplers: fakeSamplers({ busy: () => 0.9 }) })).windows, 1);
});

test('treeCpuSec(): the root pid plus all descendants from ps, nothing else; parsePsTime formats', async () => {
  const procs = () => ({ 100: { ppid: 1, cpuSec: 10 }, 101: { ppid: 100, cpuSec: 2.5 }, 102: { ppid: 101, cpuSec: 1 }, 200: { ppid: 1, cpuSec: 99 }, 201: { ppid: 200, cpuSec: 7 } });
  assert.equal(await host.treeCpuSec(100, { samplers: { procs } }), 13.5);
  assert.equal(await host.treeCpuSec(101, { samplers: { procs } }), 3.5);
  assert.equal(await host.treeCpuSec(999, { samplers: { procs } }), null, 'gone: unknown');
  assert.equal(host.parsePsTime('0:01.23'), 1.23);
  assert.equal(host.parsePsTime('841:23.65'), 841 * 60 + 23.65);
  assert.equal(host.parsePsTime('1:02:03.5'), 3723.5);
  assert.equal(host.parsePsTime('2-01:00:00'), 2 * 86400 + 3600);
  assert.equal(host.parsePsTime('n/a'), null);
  // the real ps: this process tree used some CPU
  const mine = await host.treeCpuSec(process.pid);
  assert.equal(typeof mine, 'number');
});

test('classifyRun(): loadInvalid at load1 > 10, other CPU > 25 %, pressure >= warn or a gate-timeout grant; loadWarn at load1 > 6, other > 20 %', () => {
  const c = (rec) => host.classifyRun(rec);
  assert.deepEqual(c({ load1Start: 5, otherBusyPct: 10, pressureMax: 1 }), { loadInvalid: false, loadWarn: false, reasons: [], warnings: [] });
  assert.deepEqual(c({ load1Start: 6 }), { loadInvalid: false, loadWarn: false, reasons: [], warnings: [] }, 'boundaries are exclusive');
  assert.deepEqual(c({ load1Start: 6.1 }).warnings, ['load1 6.1 > 6 at run start']);
  assert.deepEqual(c({ load1Start: 10 }), { loadInvalid: false, loadWarn: true, reasons: [], warnings: ['load1 10 > 6 at run start'] });
  assert.deepEqual(c({ load1Start: 10.1 }), { loadInvalid: true, loadWarn: false, reasons: ['load1 10.1 > 10 at run start'], warnings: [] });
  assert.deepEqual(c({ otherBusyPct: 20 }).warnings, [], 'other CPU 20 % is normal during a live run (review-gate)');
  assert.deepEqual(c({ otherBusyPct: 20.5 }).warnings, ['other CPU 20.5 % > 20 %']);
  assert.deepEqual(c({ otherBusyPct: 25.5 }).reasons, ['other CPU 25.5 % > 25 %']);
  assert.deepEqual(c({ pressureMax: 2 }).reasons, ['mem pressure warn']);
  assert.deepEqual(c({ gateTimeout: true }).reasons, ['lock granted by gate timeout (host never quiet)']);
  assert.deepEqual(c({ recheckQuiet: false }), { loadInvalid: false, loadWarn: true, reasons: [], warnings: ['host not quiet after the recheck before the run'] });
  assert.deepEqual(c({}), { loadInvalid: false, loadWarn: false, reasons: [], warnings: [] }, 'unknown fields do not flag');
});

test('describe(): the one-line host summary for lock.mjs status and verify output', () => {
  assert.equal(host.describe({ load1: 3.1, busyPct: 12, sysPct: 4, windowSec: 3, pressure: 1, decompPerSec: 40 }), 'load1 3.1 | cpu 12 % busy (sys 4 %) over 3 s | mem pressure normal | 40 decompressions/s');
  assert.match(host.describe({ load1: 30, busyPct: 68, sysPct: 33, windowSec: 3, pressure: 2, stub: '/x/fake.mjs' }), /mem pressure warn \| STUBBED \(\/x\/fake\.mjs\)$/);
});

test('default samplers on this machine: numbers, not errors', async () => {
  const a = await host.snapshot();
  assert.ok(a.ticks.total > 0);
  assert.equal(typeof a.load1, 'number');
  assert.ok(a.freeMemMB > 0);
  if (process.platform === 'darwin') {
    assert.ok([1, 2, 4].includes(a.pressure), `pressure ${a.pressure}`);
    assert.equal(typeof a.decompressions, 'number');
  }
  const x = await host.sample({ since: a });
  assert.ok(x.busyPct === null || (x.busyPct >= 0 && x.busyPct <= 100));
});

test('$FW_TEST_HOST replaces the samplers process-wide, and every reading says it is stubbed', () => {
  const code = `import('${new URL('../../tools/lib/host.mjs', import.meta.url).href}').then(async (h) => {
    const x = await h.sample({ windowSec: 10 });
    console.log(JSON.stringify({ ...x, q: h.quiet(x), tree: await h.treeCpuSec(1) }));
  });`;
  const r = node('--input-type=module', ['-e', code], { env: { FW_TEST_HOST: FAKE_HOST, FAKE_HOST_BUSY: '0.5', FAKE_HOST_LOAD1: '7', FAKE_HOST_PRESSURE: '2', FAKE_HOST_CHROME_CORES: '0.8' } });
  assert.equal(r.code, 0, r.out);
  const x = JSON.parse(r.stdout);
  assert.equal(x.stub, FAKE_HOST);
  assert.equal(x.busyPct, 50);
  assert.equal(x.sysPct, 15);
  assert.equal(x.load1, 7);
  assert.equal(x.pressure, 2);
  assert.ok(x.windowSec >= 10 && x.windowSec < 11, `fake clock window ${x.windowSec}`);
  assert.deepEqual(x.q.reasons, ['cpu 50 % > 20 %', 'load1 7 > 6', 'mem pressure warn']);
  assert.ok(x.tree >= 8, 'treeCpu from the stub: 0.8 cores over >= 10 s');
});
