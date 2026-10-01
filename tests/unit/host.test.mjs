// tools/lib/host.mjs: host CPU from os.cpus() tick deltas, load1, memory pressure, the quiet() admission
// rule, waitQuiet(), the measured Chrome's process-tree CPU and the per-run classifyRun() flags
// (postmortem 2026-09-30 §3 (a)/(d), incidents I-016/I-017). Samplers are stubbed; one subprocess checks
// the process-wide $FW_TEST_HOST stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TESTS, node, cleanEnv, tempDir } from '../helpers.mjs';
import * as host from '../../tools/lib/host.mjs';

const FAKE_HOST = join(TESTS, 'fixtures', 'fake-host.mjs');

/**
 * Synthetic host: 8 CPUs, a fake monotonic clock t advanced by sleep(), busy/load/pressure from functions
 * of fake time. suspend: [{at, sec}]: the host sleeps sec s once t passes at (wall clock jumps, ticks and
 * t stand still, wake changes), like the Maintenance Sleep of I-026.
 */
function fakeSamplers({ busy = () => 0.1, load = () => 2, pressure = () => 1, decomp = () => 0, procs, suspend = [] } = {}) {
  let t = 1_000_000, busyMs = 0, totalMs = 0, last = t, dec = 0, jump = 0, wake = 1;
  const sus = suspend.map((x) => ({ ...x, done: false }));
  const check = () => { for (const x of sus) if (!x.done && t >= x.at) { x.done = true; jump += x.sec * 1000; wake++; } };
  const adv = () => { check(); const dt = t - last; last = t; totalMs += dt; busyMs += dt * busy(t); dec += (dt / 1000) * decomp(t); };
  return {
    now: () => { check(); return t + jump; },
    mono: () => { check(); return t; },
    wake: () => { check(); return wake; },
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
    suspendMinSec: 2, watchdogStallSec: 300, chromeWarmSec: 10,
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

test('waitQuiet() on a host that stays busy past every window: stops at the cap, never later (I-023)', async () => {
  // busy for the whole wait and beyond: exactly ceil(maxWait / window) windows, waitedSec = the cap
  const s = fakeSamplers({ busy: () => 0.3 });
  const t0 = s.t;
  const r = await host.waitQuiet({ maxWaitSec: 60, samplers: s });
  assert.deepEqual({ quiet: r.quiet, windows: r.windows, waitedSec: r.waitedSec, sleptSec: r.sleptSec, suspended: r.suspended }, { quiet: false, windows: 6, waitedSec: 60, sleptSec: 0, suspended: false });
  assert.equal(s.t - t0, 60000, 'no time spent past the cap');
  const odd = await host.waitQuiet({ maxWaitSec: 25, samplers: fakeSamplers({ busy: () => 0.3 }) });
  assert.deepEqual([odd.windows, odd.waitedSec], [3, 30], 'a cap between windows ends after the window that crosses it');
});

test('waitQuiet() across a host sleep: one fresh window after the wake, then stops; the sleep is recorded (I-023, I-026)', async () => {
  // the A/B of I-023: busy host, the Mac sleeps 1890 s in the 2nd window; before the fix the wait ran on
  // for 6 windows and 1953 s of wall time
  const s = fakeSamplers({ busy: () => 0.3, suspend: [{ at: 1_015_000, sec: 1890 }] });
  const seen = [];
  const r = await host.waitQuiet({ maxWaitSec: 60, samplers: s, onSample: (x, q) => seen.push([x.sleptSec, x.suspended, q.quiet]) });
  assert.equal(r.windows, 3, 'the window with the sleep, then one more');
  assert.equal(r.suspended, true);
  assert.equal(r.sleptSec, 1890);
  assert.equal(r.waitedSec, 1920, 'wall time, sleep included');
  assert.equal(r.quiet, false);
  assert.deepEqual(seen, [[0, false, false], [1890, true, false], [0, false, false]]);
  // a quiet host: the window with the sleep never counts as quiet; the fresh one after the wake decides
  const qs = fakeSamplers({ busy: () => 0.05, suspend: [{ at: 1_005_000, sec: 600 }] });
  const rq = await host.waitQuiet({ maxWaitSec: 60, samplers: qs });
  assert.deepEqual([rq.windows, rq.quiet, rq.suspended, rq.sleptSec], [2, true, true, 600]);
  // the sleep in the last allowed window still gets its fresh window (past the window count, never longer)
  const ls = fakeSamplers({ busy: () => 0.3, suspend: [{ at: 1_015_000, sec: 100 }] });
  assert.equal((await host.waitQuiet({ maxWaitSec: 20, samplers: ls })).windows, 3);
  // slept(): wall minus monotonic, or a new wake time alone
  assert.deepEqual(host.slept({ at: 0, mono: 0, wakeAt: 5 }, { at: 12000, mono: 10000, wakeAt: 5 }), { sleptSec: 2, woke: false, suspended: false }, '2 s is jitter, not sleep');
  assert.deepEqual(host.slept({ at: 0, mono: 0, wakeAt: 5 }, { at: 13000, mono: 10000, wakeAt: 5 }), { sleptSec: 3, woke: false, suspended: true });
  assert.deepEqual(host.slept({ at: 0, mono: 0, wakeAt: 5 }, { at: 10000, mono: 10000, wakeAt: 6 }), { sleptSec: 0, woke: true, suspended: true });
  assert.deepEqual(host.slept({ at: 0 }, { at: 10000 }), { sleptSec: null, woke: false, suspended: false }, 'old snapshots: unknown');
  // onSample may abort the wait (verify's Chrome keepalive)
  await assert.rejects(host.waitQuiet({ maxWaitSec: 60, samplers: fakeSamplers({ busy: () => 0.3 }), onSample: async () => { throw new Error('Chrome gone'); } }), /Chrome gone/);
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
  // the real ps: tests/chrome/host-real.chrome.test.mjs (no default test reads the real host, I-024)
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

test('I-024: no default test reads the real host: real samplers refuse in a test process, the fake host covers every sampler, and every tool subprocess gets it', async () => {
  // 1. in this (node --test) process, without a stub, every real sampler throws instead of reading or waiting
  assert.ok(process.env.NODE_TEST_CONTEXT, 'running under node --test');
  assert.equal(host.realHostRefused(), true);
  await assert.rejects(host.snapshot(), /real host sampler "pressure" used inside a test process.*I-024/);
  await assert.rejects(host.waitQuiet({ maxWaitSec: 60 }), /I-024/);
  await assert.rejects(host.treeCpuSec(process.pid), /real host sampler "procs"/);
  assert.equal(host.realHostRefused({ NODE_TEST_CONTEXT: 'child', FW_TEST_HOST: '' }), false, "FW_TEST_HOST='' opts in (Chrome tests)"); // I-024 scan: no tool runs here
  assert.equal(host.realHostRefused({}), false, 'outside tests: the real host');
  // 2. the fake host exports every default sampler, so a stubbed tool never falls through to the real host
  const fake = await import(new URL('../fixtures/fake-host.mjs', import.meta.url).href);
  assert.deepEqual(Object.keys(host.DEFAULT_SAMPLERS).filter((k) => typeof fake[k] !== 'function'), []);
  // 3. a stub that lacks a sampler refuses it instead of reading the real one
  const partial = join(tempDir('fw-host-'), 'partial-host.mjs');
  writeFileSync(partial, 'export const loadavg = () => [1, 1, 1];\n');
  const r = node('--input-type=module', ['-e', `import('${new URL('../../tools/lib/host.mjs', import.meta.url).href}').then((h) => h.snapshot()).then(() => console.log('READ'), (e) => console.log(e.message))`], { env: { FW_TEST_HOST: partial } });
  assert.match(r.stdout, /real host sampler "pressure" used under FW_TEST_HOST=.*which does not export it/);
  // 4. every tool subprocess of the default suite runs on the fake host: helpers.cleanEnv sets it, and no
  //    unit / e2e / hook test switches it off (only tests/chrome may pass FW_TEST_HOST: '')
  assert.equal(cleanEnv().FW_TEST_HOST, FAKE_HOST);
  assert.equal(cleanEnv().NODE_TEST_CONTEXT, undefined, 'tool subprocesses rely on FW_TEST_HOST, not on the test-process guard');
  const offenders = [], exceptions = [];
  const EXCEPTION = '// I-024 exception: ' + 'review-i027 real-clock guard'; // split: this line must not count itself
  for (const dir of ['unit', 'e2e', 'hooks']) for (const f of readdirSync(join(TESTS, dir))) {
    if (!f.endsWith('.mjs')) continue;
    const src = readFileSync(join(TESTS, dir, f), 'utf8');
    for (const l of src.split('\n')) if (l.includes(EXCEPTION)) exceptions.push(`${dir}/${f}`);
    const code = src.split('\n').filter((l) => !l.includes('// I-024 scan: no tool runs here') && !l.includes(EXCEPTION)).join('\n').replace(/\/\/.*$/gm, '');
    if (/FW_TEST_HOST\s*(:|=)\s*(''|""|undefined|null)|delete\s+[\w.]+\.FW_TEST_HOST|DEFAULT_SAMPLERS\.\w+\(/.test(code)) offenders.push(`${dir}/${f}`);
  }
  assert.deepEqual(offenders, [], 'default tests that switch the fake host off');
  // the one deliberate exception: verify-fake proves the real host keeps the real clock (npm test's guard
  // against a clock swap, review-i027), with gate thresholds that let its one real 10 s window pass
  assert.deepEqual(exceptions, ['e2e/verify-fake.test.mjs'], 'exactly one real-host test in the default suite');
});

test('review-i027 2: stubOutsideTest(): a stubbed host is refused outside a test unless Chrome is a test fixture', () => {
  const F = '/w/tests/fixtures/fake-host.mjs';
  assert.equal(host.stubOutsideTest({}), false, 'no stub');
  assert.equal(host.stubOutsideTest({ FW_TEST_HOST: '' }), false, 'real host'); // I-024 scan: no tool runs here
  assert.equal(host.stubOutsideTest({ FW_TEST_HOST: F }), true, 'stub, real Chrome (default path)');
  assert.equal(host.stubOutsideTest({ FW_TEST_HOST: F, CHROME: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }), true);
  assert.equal(host.stubOutsideTest({ FW_TEST_HOST: F, CHROME: '/tmp/fixtures/fake-chrome.mjs' }), true, 'only a tests/fixtures/ file counts');
  assert.equal(host.stubOutsideTest({ FW_TEST_HOST: F, CHROME: '/r/tests/fixtures/fake-chrome.mjs' }), false, 'the fake Chrome');
  assert.equal(host.stubOutsideTest({ FW_TEST_HOST: F, NODE_TEST_CONTEXT: 'child-v8' }), false, 'inside node --test');
});

test('$FW_TEST_HOST replaces the samplers process-wide, and every reading says it is stubbed', () => {
  const code = `import('${new URL('../../tools/lib/host.mjs', import.meta.url).href}').then(async (h) => {
    const x = await h.sample({ windowSec: 10 });
    const c = await h.hostClock(), m0 = c.mono(), w0 = Date.now();
    await c.sleep(60000);
    console.log(JSON.stringify({ ...x, q: h.quiet(x), tree: await h.treeCpuSec(1), clock: { stub: c.stub, monoSec: (c.mono() - m0) / 1000, wallMs: Date.now() - w0 } }));
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
  // I-027: hostClock() says it is stubbed, and its 60 s sleep advances only the fake clock (verify.mjs runs
  // its settle / idle / morph waits on it under a stub, so the fake-Chrome tests cost no wall time)
  assert.equal(x.clock.stub, FAKE_HOST);
  assert.ok(x.clock.monoSec >= 60 && x.clock.monoSec < 61, `fake mono advanced ${x.clock.monoSec} s`);
  assert.ok(x.clock.wallMs < 5000, `a 60 s fake sleep took ${x.clock.wallMs} ms of wall time`);
});

test('hostClock() without a stub: the real clock (stub undefined), samplers passed in are used as given', async () => {
  let t = 0;
  const c = await host.hostClock({ samplers: { mono: () => t, sleep: async (ms) => { t += ms; } } });
  assert.equal(c.stub, undefined);
  await c.sleep(1500);
  assert.equal(c.mono(), 1500);
});
