// tools/verify.mjs end to end against the fake Chrome ($CHROME): argument handling, the result JSON
// shape and its frame/LoAF summaries (exact values from the fake's canned data), the idle phase
// (--idle, and that --idle 0 leaves the scroll + morph steps exactly as before), the emulation it
// asks for, and the chrome-measure lock (held during the run, FIFO wait, released after, --no-lock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, TESTS, sleep, startProc, FAKE_HOST, cdpTokens } from '../helpers.mjs';
import { TRACE_START } from '../../tools/lib/trace-frames.mjs';
import { BIG_CHUNK, TRACE_EVENTS } from '../fixtures/trace-fixture.mjs';
import { LOGGER, RESET, COLLECT, COLLECT_AT } from '../../tools/lib/perf-page.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
const VERIFY = tool('verify.mjs');
const LOCK = tool('lock.mjs');
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const holder = (state) => { try { return JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.json'), 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// The measurement steps of one run as tokens, in CDP order (the fake logs the first 120 chars of an expression).
const step = (l) => {
  if (l.method === 'Emulation.setCPUThrottlingRate') return `cpu ${l.params.rate}`;
  if (l.method.startsWith('Input.')) return 'input';
  if (l.method !== 'Runtime.evaluate') return null;
  const e = l.params.expression;
  if (e.includes('kit: Object.keys(window)')) return 'state';
  if (e.includes('window.__perf.frames.length=0')) return 'reset';
  if (e.includes('let still = 0')) return 'scroll';
  if (e.includes('p.on = false')) return 'collect';
  if (e.includes("top-nav')?.className")) return 'morphState';
  return 'other';
};
const steps = (log) => log.map((l) => ({ s: step(l), t: l.t })).filter((x) => x.s);
// verify.mjs before the idle phase existed (incident I-002); the scroll and morph phases must keep exactly this
const SCROLL_MORPH = ['reset', 'scroll', 'collect', 'reset', 'input', 'input', 'input', 'input', 'collect', 'morphState', 'cpu 1', 'other'];

function setup() {
  const d = tempDir('fw-verify-');
  // FW_MIRROR_HOME: these targets serve no baseline; keep verify's snapshot check off this checkout's real one
  const env = { CHROME: FAKE, FW_STATE_DIR: join(d, 'state'), FAKE_CHROME_LOG: join(d, 'chrome.jsonl'), FAKE_CHROME_METRICS: 'step', FW_MIRROR_HOME: d };
  const args = (owner, extra = []) => ['a=http://127.0.0.1:9/', '--runs', '1', '--viewport', 'mobile', '--cpu', '3', '--no-screens', '--out', join(d, 'out'), '--result', join(d, 'result.json'), '--profile', join(d, 'profile'), '--owner', owner, ...extra];
  return { d, env, args };
}

test('usage error without targets: exit 2 before any lock or browser', () => {
  const { d, env } = setup();
  const r = node(VERIFY, ['--runs', '1'], { env });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^usage: node tools\/verify\.mjs/);
  assert.equal(existsSync(join(d, 'state')), false);
  assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0);
});

test('one mobile run: result JSON shape + exact summaries, emulation settings, lock held then released', async () => {
  const A = setup(), B = setup();
  // A takes the lock; B runs at the same time with --no-lock and must never touch lock state
  const pa = nodeAsync(VERIFY, A.args('vtest'), { env: A.env });
  const pb = nodeAsync(VERIFY, B.args('nolock', ['--no-lock']), { env: B.env });
  let seen = null;
  for (let i = 0; i < 1000 && !seen; i++) { seen = holder(A.env.FW_STATE_DIR); await sleep(10); }
  const [ra, rb] = await Promise.all([pa, pb]);
  assert.equal(ra.code, 0, ra.out);
  assert.equal(rb.code, 0, rb.out);

  assert.ok(seen, 'chrome-measure was held during the run');
  assert.equal(seen.owner, 'vtest');
  assert.equal(seen.kind, 'process');
  assert.deepEqual(seen.meta, { cmd: 'verify', targets: ['a=http://127.0.0.1:9/'], cpu: 3, runs: 1, viewport: 'mobile', idle: 6 }, 'the holder meta records the idle length (I-020)');
  assert.equal(holder(A.env.FW_STATE_DIR), null, 'released on exit');
  assert.equal(existsSync(join(B.d, 'state')), false, '--no-lock never touches the lock dir');

  const res = JSON.parse(readFileSync(join(A.d, 'result.json'), 'utf8'));
  assert.equal(res.cpu, 3);
  assert.equal(res.idle, 6, 'idle phase defaults to 6 s');
  assert.deepEqual(res.viewports, ['mobile']);
  assert.equal(res.runs, 1);
  assert.deepEqual(res.targets, [{ label: 'a', url: 'http://127.0.0.1:9/' }]);
  assert.deepEqual(Object.keys(res.host).sort(), ['chromeLaunches', 'chromeWarmSec', 'contaminated', 'contaminatedRuns', 'cpus', 'gate', 'hostState', 'loadavg', 'model', 'recheck', 'runsTotal', 'stub', 'thresholds', 'warnRuns', 'watchdogSec']);
  assert.equal(res.host.stub, FAKE_HOST, 'the tests run on the fake host, and the result says so');
  assert.equal(res.results.length, 1);
  const r = res.results[0];
  assert.deepEqual(Object.keys(r).sort(), ['errors', 'host', 'idleSummary', 'label', 'loadavg1', 'morphState', 'morphSummary', 'notFound', 'origins', 'requests', 'run', 'scripts', 'scroll', 'scrollSummary', 'shimStats', 'shots', 'state', 'url', 'viewport'].sort());
  assert.equal(r.viewport, 'mobile');
  assert.equal(r.run, 0);
  assert.equal(r.morphState, 'start-selling-top-nav is-morph');
  assert.deepEqual(r.scroll, { ms: 5000, ticks: 16, y: 2068, h: 3000 });
  assert.deepEqual(r.shots, {});
  assert.deepEqual(r.scripts, ['/_app/immutable/nodes/2.fixture.js']);
  assert.deepEqual(r.notFound, []);
  // FRAMES = 50 x 16.7 ms + [25, 40, 60, 120]; one LoAF of 120 ms (script 80 ms, forced layout 25 ms)
  const s = r.scrollSummary;
  assert.deepEqual({ frames: s.frames, seconds: s.seconds, fps: s.fps, p50: s.p50, p95: s.p95, max: s.max, gt20: s.gt20, gt33: s.gt33, gt34: s.gt34, gt50: s.gt50, gt100: s.gt100, droppedPct: s.droppedPct },
    { frames: 54, seconds: 1.1, fps: 50, p50: 16.7, p95: 40, max: 120, gt20: 4, gt33: 3, gt34: 3, gt50: 2, gt100: 1, droppedPct: 7.4 });
  assert.deepEqual({ n: s.loafCount, ms: s.loafMs, block: s.loafBlockingMs, render: s.loafRenderMs, script: s.loafScriptMs, forced: s.forcedLayoutMs }, { n: 1, ms: 120, block: 70, render: 30, script: 80, forced: 25 });
  assert.equal(s.topScripts[0].key, '/_app/immutable/nodes/2.fixture.js:10 tick [user-callback FrameRequestCallback]');
  assert.deepEqual(s.byFile, { '/_app/immutable/nodes/2.fixture.js': 80 });
  assert.deepEqual(r.morphSummary.frames, 54);
  // idle phase: the fake answers a recording without scroll/input with IDLE_FRAMES = 100 x 16.7 ms + [30, 55]
  // and one 55 ms LoAF (script 40 ms, forced layout 6 ms)
  const i = r.idleSummary;
  assert.deepEqual({ frames: i.frames, seconds: i.seconds, fps: i.fps, p50: i.p50, p95: i.p95, max: i.max, gt20: i.gt20, gt33: i.gt33, gt34: i.gt34, gt50: i.gt50, gt100: i.gt100, droppedPct: i.droppedPct },
    { frames: 102, seconds: 1.8, fps: 58.1, p50: 16.7, p95: 16.7, max: 55, gt20: 2, gt33: 1, gt34: 1, gt50: 1, gt100: 0, droppedPct: 2 });
  assert.deepEqual({ n: i.loafCount, ms: i.loafMs, block: i.loafBlockingMs, render: i.loafRenderMs, script: i.loafScriptMs, forced: i.forcedLayoutMs }, { n: 1, ms: 55, block: 5, render: 10, script: 40, forced: 6 });
  assert.equal(i.topScripts[0].key, '/_app/immutable/nodes/2.fixture.js:42 spring [user-callback FrameRequestCallback]');
  assert.equal(i.scrollY, 0, 'idle collect reports scrollY (the page stayed at the top)');
  assert.equal('scrollY' in s, false, 'scroll/morph summaries are unchanged');
  assert.deepEqual(res.rows[0], { viewport: 'mobile', target: 'a', runs: 1, fps: 50, p95: 40, gt20: 4, gt34: 3, gt50: 2, gt100: 1, max: 120, loafMs: 120, loafScriptMs: 80, forcedMs: 25, morphFps: 50, morphGt50: 2, morphLoafMs: 120, scrollS: 5, idleFps: 58.1, idleGt50: 1, idleLoafMs: 55, idleScriptMs: 40, idleForcedMs: 6 });
  assert.match(ra.stdout, /\[mobile run 1\/1\] a http:\/\/127\.0\.0\.1:9\/ \.\.\. fps 50 .* idle fps 58\.1 >50ms 1 LoAF 55ms/);

  const log = readLog(A.env.FAKE_CHROME_LOG);
  const cmd = (m) => log.filter((l) => l.method === m).map((l) => l.params);
  // idle window: throttled, no input, 6 s, directly before the unchanged scroll + morph phases. Under a
  // stubbed host verify waits on the stub's clock (I-027): 6 s there, no wall time here; the host record
  // measures the window on that clock (on a real host: Date.now + setTimeout as before, tests/chrome)
  const st = steps(log);
  assert.deepEqual(st.map((x) => x.s), ['state', 'cpu 3', 'reset', 'collect', ...SCROLL_MORPH]);
  const idleWin = r.host.phases.idle.windowSec;
  assert.ok(idleWin >= 6 && idleWin < 6.5, `idle window ${idleWin} s on the host clock`);
  const idleMs = st[3].t - st[2].t;
  assert.ok(idleMs < 1000, `the idle window took ${idleMs} ms of wall time under the fake host`);
  assert.ok(st[4].t - st[3].t < 1000, 'scroll phase starts right after the idle window');
  assert.deepEqual(cmd('Emulation.setCPUThrottlingRate'), [{ rate: 3 }, { rate: 1 }]);
  assert.deepEqual(cmd('Emulation.setDeviceMetricsOverride'), [{ width: 430, height: 932, deviceScaleFactor: 3, mobile: true }]);
  assert.deepEqual(cmd('Emulation.setTouchEmulationEnabled'), [{ enabled: true, maxTouchPoints: 5 }]);
  assert.deepEqual(cmd('Security.setIgnoreCertificateErrors'), [{ ignore: true }]);
  assert.equal(cmd('Input.synthesizeScrollGesture').length, 4, 'mobile morph phase uses touch gestures');
  assert.equal(cmd('Page.captureScreenshot').length, 0, '--no-screens');
  assert.equal(cmd('Page.addScriptToEvaluateOnNewDocument')[0].source, LOGGER, 'injects lib/perf-page.mjs LOGGER (run in tests/unit/perf-page.test.mjs)');
  const evals = cmd('Runtime.evaluate').map((p) => p.expression); // the fake logs the first 120 chars
  assert.equal(evals.filter((e) => e === RESET.slice(0, 120)).length, 3, 'every phase starts with RESET (stamps t0)');
  assert.equal(evals.filter((e) => e === COLLECT.slice(0, 120)).length, 2, 'scroll + morph read out with COLLECT');
  assert.equal(evals.filter((e) => e === COLLECT_AT.slice(0, 120)).length, 1, 'idle reads out with COLLECT_AT (scrollY)');
  assert.equal(log.find((l) => l.method === '(started)').params.profile, join(A.d, 'profile'));
  assert.ok(log.some((l) => l.method === '(exit)'), 'Chrome was closed');
});

test('--idle 0: no idle phase, the run is step for step the scroll + morph measurement it was before', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('noidle', ['--idle', '0']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  assert.equal(res.idle, 0);
  const x = res.results[0];
  assert.equal(x.idleSummary, null);
  assert.equal(x.scrollSummary.frames, 54);
  assert.equal(x.scrollSummary.loafMs, 120);
  assert.deepEqual(res.rows[0], { viewport: 'mobile', target: 'a', runs: 1, fps: 50, p95: 40, gt20: 4, gt34: 3, gt50: 2, gt100: 1, max: 120, loafMs: 120, loafScriptMs: 80, forcedMs: 25, morphFps: 50, morphGt50: 2, morphLoafMs: 120, scrollS: 5 });
  assert.doesNotMatch(r.stdout, /idle fps/);
  assert.deepEqual(steps(readLog(env.FAKE_CHROME_LOG)).map((x) => x.s), ['state', 'cpu 3', ...SCROLL_MORPH]);
});

test('--idle with a bad value: exit 2 before any lock or browser', () => {
  const { d, env, args } = setup();
  for (const bad of ['-1', 'abc']) {
    const r = node(VERIFY, args('bad', ['--idle', bad]), { env });
    assert.equal(r.code, 2, r.out);
    assert.match(r.stderr, /--idle must be a number of seconds >= 0/);
  }
  assert.equal(existsSync(join(d, 'state')), false);
  assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0);
});

test('waits in the chrome-measure FIFO queue while someone else measures', async () => {
  const { d, env, args } = setup();
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'other-agent'], { env }).code, 0);
  const p = nodeAsync(VERIFY, args('waiter'), { env });
  await sleep(1500);
  assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0, 'Chrome must not start while the lock is held');
  const st = JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0];
  assert.deepEqual(st.queue.map((w) => w.owner), ['waiter']);
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'other-agent'], { env }).code, 0);
  const r = await p;
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(d, 'result.json')));
});

test('inside `lock.mjs run chrome-measure`: verify re-enters the wrapper\'s hold (no deadlock), which outlives it (incident I-005)', async () => {
  const { d, env, args } = setup();
  const lockFile = join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json');
  // the wrapped command runs verify (a different pid and owner than the wrapper), then a probe that
  // must still be covered by the wrapper's hold
  const script = `const { spawnSync } = require('child_process'); const fs = require('fs');
    const v = spawnSync(process.execPath, ${JSON.stringify([VERIFY, ...args('inner-topic')])}, { stdio: 'inherit' });
    console.log('VERIFY EXIT ' + v.status);
    console.log('AFTER ' + fs.readFileSync(${JSON.stringify(lockFile)}, 'utf8').replace(/\\s+/g, ' '));`;
  const r = await nodeAsync(LOCK, ['run', 'chrome-measure', '--owner', 'wrapper', '--', process.execPath, '-e', script], { env, timeout: 40000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^VERIFY EXIT 0$/m);
  assert.ok(existsSync(join(d, 'result.json')), 'verify measured');
  assert.ok(readLog(env.FAKE_CHROME_LOG).some((l) => l.method === '(exit)'), 'Chrome ran and was closed');
  const after = JSON.parse(r.stdout.match(/^AFTER (.*)$/m)[1]);
  assert.equal(after.owner, 'wrapper', 'verify exiting must not release the wrapper\'s hold');
  assert.equal(after.kind, 'process');
  assert.equal(holder(env.FW_STATE_DIR), null, 'released when the wrapper finishes');
  assert.deepEqual(JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0].queue, [], 'verify never queued');
});

test('a forged or stale FW_LOCK_HELD token does not let verify past someone else\'s hold', async () => {
  // one lock dir per forged value, all four at once (I-027: they waited out their 3 s one after another)
  const forge = async (held, i) => {
    const { env, args } = setup();
    assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'other-agent'], { env }).code, 0);
    const token = holder(env.FW_STATE_DIR).token;
    held = held.replace('<token>', token);
    const p = nodeAsync(VERIFY, args('forger'), { env: { ...env, FW_LOCK_HELD: held }, timeout: 3000 }); // SIGTERMed after 3 s
    await sleep(1200);
    assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0, `Chrome must not start with FW_LOCK_HELD=${held}`);
    const st = JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0];
    assert.equal(st.holder.owner, 'other-agent');
    assert.deepEqual(st.queue.map((w) => w.owner), ['forger'], `it queues like anyone else (case ${i})`);
    await p;
    assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0);
    assert.deepEqual(JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0].queue, [], 'a killed waiter leaves the queue');
  };
  await Promise.all(['chrome-measure:0123456789ab', 'iphone:<token>', 'chrome-measure:<token>x', ''].map(forge));
});

test('SIGTERM mid-run: lock released and the browser does not outlive verify.mjs', async () => {
  const { env, args } = setup();
  // Chrome never answers the throttle command, so verify is mid-run when the signal comes (I-027: a fake
  // run no longer spends seconds in sleeps, so without it the run could end before the SIGTERM)
  const v = await startProc(process.execPath, [VERIFY, ...args('killed')], { env: { ...env, FAKE_CHROME_HANG_AT: 'Emulation.setCPUThrottlingRate' }, ready: (s) => /\[mobile run 1\/1\]/.test(s) });
  // Chrome starts after the host recheck before run 1 (I-023)
  let started;
  for (let i = 0; i < 200 && !(started = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === '(started)')); i++) await sleep(50);
  const chromePid = started.pid;
  assert.ok(alive(chromePid));
  assert.equal(holder(env.FW_STATE_DIR).owner, 'killed');
  await v.stop('SIGTERM');
  assert.equal(holder(env.FW_STATE_DIR), null);
  let gone = false;
  for (let i = 0; i < 60 && !(gone = !alive(chromePid)); i++) await sleep(50);
  if (!gone) process.kill(chromePid, 'SIGKILL');
  assert.ok(gone, 'Chrome was left running (and would keep the profile dir locked for the next run)');
});

test('SIGTERM without an own lock hold (re-entered `lock.mjs run` hold, test:chrome, --no-lock): the browser does not outlive verify.mjs either', async () => {
  // lib/lock.mjs installs its signal handlers only for an own process hold; verify.mjs installs its own
  // so the exit handlers (Chrome tree kill) run (test:chrome on 48ace89 left 11 Chrome processes)
  const { env, args } = setup();
  const v = await startProc(process.execPath, [VERIFY, ...args('nolock', ['--no-lock'])], { env: { ...env, FAKE_CHROME_HANG_AT: 'Emulation.setCPUThrottlingRate' }, ready: (s) => /\[mobile run 1\/1\]/.test(s) });
  let started;
  for (let i = 0; i < 200 && !(started = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === '(started)')); i++) await sleep(50);
  assert.ok(alive(started.pid));
  await v.stop('SIGTERM');
  let gone = false;
  for (let i = 0; i < 60 && !(gone = !alive(started.pid)); i++) await sleep(50);
  if (!gone) process.kill(started.pid, 'SIGKILL');
  assert.ok(gone, 'Chrome was left running after SIGTERM to a verify without its own hold');
});

test('browser crash mid-run: verify.mjs fails fast (no hang) and releases the lock', async () => {
  const { env, args } = setup();
  const t0 = Date.now();
  const r = await nodeAsync(VERIFY, args('crashy'), { env: { ...env, FAKE_CHROME_CRASH_AT: 'Emulation.setCPUThrottlingRate' }, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /CDP connection closed/);
  assert.ok(Date.now() - t0 < 30000, 'failed fast');
  assert.equal(holder(env.FW_STATE_DIR), null, 'lock released');
});

// ---- host record, contamination flags, recheck before each run (incident I-017) -----------------------
test('host record per run and phase on a quiet host: CPU busy/sys, Chrome tree, other CPU, load, pressure; clean', async () => {
  const { d, env, args } = setup();
  // fake host: 10 % busy, the measured Chrome tree 0.4 of 8 cores = 5 % -> other CPU 5 %
  // I-031: other processes, among them a 3-core hog the host-wide numbers above do not include (log only)
  const PROCS = '427:WindowServer:0.12,377:mds_stores:0.03,4242:hog:3';
  const r = await nodeAsync(VERIFY, args('hostrec', ['--idle', '1']), { env: { ...env, FAKE_HOST_BUSY: '0.1', FAKE_HOST_LOAD1: '3.5', FAKE_HOST_PROCS: PROCS } });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const h = res.results[0].host;
  assert.deepEqual(Object.keys(h).sort(), ['chrome', 'chromeRelaunched', 'chromeWarmedSec', 'freeMemMB', 'freeMemMBEnd', 'gate', 'load1End', 'load1Start', 'loadInvalid', 'loadWarn', 'phases', 'power', 'reasons', 'recheck', 'sleptSec', 'stub', 'topProcs', 'warnings', 'woke']);
  // T8+ (I-033): display / wake / power at the run's start and end and around the recheck (fake host defaults:
  // display on, FullWake, AC, caffeinate -d's assertion); the browser version from /json/version
  for (const p of [h.power.start, h.power.end, h.recheck.power.start, h.recheck.power.end]) {
    assert.deepEqual({ ...p, at: undefined, stub: undefined }, { at: undefined, display: 'on', fullWake: true, capabilities: ['CPU', 'Graphics', 'Audio', 'Network'], powerSource: 'AC', displaySleepPrevented: true, systemSleepPrevented: true, userActive: true, stub: undefined });
    assert.equal(p.stub, FAKE_HOST);
  }
  assert.deepEqual(h.chrome, { version: 'FakeChrome/1.0', featureStateSha256: null, featureStateMtime: null, variationsSeedSha256: null, variationsSeedDate: null });
  assert.deepEqual([res.host.hostState.recorded, res.host.hostState.display, res.host.hostState.fullWake, res.host.hostState.powerSource, res.host.hostState.tag], [true, ['on'], [true], ['AC'], null]);
  assert.deepEqual(res.host.hostState.chromeVersions, ['FakeChrome/1.0']);
  assert.match(r.stdout, /^host state: display on, FullWake, power AC, display-sleep assertion yes$/m);
  // I-031: the top non-Chrome processes over the run (start to end) and over the recheck, % of one core
  const TOP = [{ pid: 4242, command: 'hog', cpuPct: 300 }, { pid: 427, command: 'WindowServer', cpuPct: 12 }, { pid: 377, command: 'mds_stores', cpuPct: 3 }];
  assert.deepEqual(h.topProcs.top, TOP);
  assert.ok(h.topProcs.windowSec > 1, `run window ${h.topProcs.windowSec}`);
  assert.deepEqual(h.recheck.topProcs.top, TOP);
  assert.ok(h.recheck.topProcs.windowSec >= 10, `recheck window ${h.recheck.topProcs.windowSec}`);
  assert.deepEqual(Object.keys(h.phases), ['idle', 'scroll', 'morph']);
  for (const [name, p] of Object.entries(h.phases)) {
    assert.ok(p.windowSec > 0, `${name} window ${p.windowSec}`);
    assert.deepEqual({ busy: p.busyPct, sys: p.sysPct, chrome: p.chromeCpuPct, other: p.otherBusyPct, src: p.otherSource, l0: p.load1Start, l1: p.load1End, pr: p.pressureMax },
      { busy: 10, sys: 3, chrome: 5, other: 5, src: 'host - Chrome tree', l0: 3.5, l1: 3.5, pr: 1 }, name);
    assert.ok(p.decompPerSec >= 5 && p.decompPerSec <= 15, `${name} decompressions/s ${p.decompPerSec}`);
  }
  assert.ok(h.phases.idle.windowSec >= 1 && h.phases.idle.windowSec < 3, 'idle window = the 1 s idle phase');
  assert.deepEqual([h.load1Start, h.load1End, h.loadInvalid, h.loadWarn, h.reasons, h.warnings], [3.5, 3.5, false, false, [], []]);
  // the lock's host gate (I-016) admitted this hold on a quiet reading; verify copies the holder's record
  assert.deepEqual({ ...h.gate, stub: undefined }, { quiet: true, waitedSec: 0, reasons: [], load1: 3.5, busyPct: 10, sysPct: 3, pressure: 1, sleptSec: 0, woke: false, stub: undefined, gateTimeout: false });
  assert.deepEqual(res.host.gate, h.gate);
  assert.deepEqual(res.results[0].loadavg1, { before: 3.5, after: 3.5 }, 'legacy loadavg1 comes from the same (stubbed) reading');
  assert.equal(h.recheck.quiet, true);
  assert.equal(h.recheck.windows, 1, 'a quiet host passes the first 10 s window');
  assert.deepEqual([res.host.contaminated, res.host.contaminatedRuns, res.host.warnRuns, res.host.runsTotal], [false, 0, 0, 1]);
  assert.deepEqual(res.host.recheck, { maxWaitSec: 60, maxLoad1: 6, maxBusyPct: 25 });
  assert.equal(res.host.thresholds.invalidLoad1, 10);
  assert.match(r.stdout, /host: load1 3\.5, other CPU 5 %\n/);
  assert.match(r.stdout, /^host: 0 of 1 runs contaminated {2}\[host STUBBED: .*fake-host\.mjs\]$/m);
});

test('T8+ (I-033): display / wake per run; a change between the targets or inside a run tags verify.json HOST-DISPLAY-CHANGED', async () => {
  const { d, env, args } = setup();
  const two = (owner) => { const a = args(owner, ['--idle', '0', '--no-lock']); a.splice(1, 0, 'b=http://127.0.0.1:9/b'); return a; };
  // hostPower() readings in order: recheck a (2), run a (2), recheck b (2), run b (2). After 4: a on, b in DarkWake
  let r = await nodeAsync(VERIFY, two('arms'), { env: { ...env, FAKE_HOST_DARKWAKE_AFTER: '4' } });
  assert.equal(r.code, 0, r.out);
  let res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  assert.deepEqual(res.results.filter((x) => !x.diff).map((x) => [x.label, x.host.power.start.display, x.host.power.end.display, x.host.power.start.fullWake]), [['a', 'on', 'on', true], ['b', 'off', 'off', false]]);
  assert.deepEqual([res.results[1].host.recheck.power.start.display, res.results[1].host.recheck.power.end.fullWake], ['off', false], 'the recheck readings are recorded too');
  let hs = res.host.hostState;
  assert.equal(hs.tag, 'HOST-DISPLAY-CHANGED');
  assert.deepEqual(hs.reasons, ['the arms differ: a display on, FullWake vs b display off, DarkWake']);
  assert.match(r.stdout, /^host state: display on\/off, FullWake\/DarkWake, power AC, display-sleep assertion yes; HOST-DISPLAY-CHANGED: the arms differ/m);
  assert.equal(res.results[0].host.loadInvalid, false, 'a tag on the comparison, not a contaminated run');
  // after 3 readings (recheck a 1-2, run a 3-4): the display slept while run a was measured (start on, end off)
  r = await nodeAsync(VERIFY, two('within'), { env: { ...env, FAKE_HOST_DARKWAKE_AFTER: '3' } });
  assert.equal(r.code, 0, r.out);
  res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  hs = res.host.hostState;
  assert.equal(hs.tag, 'HOST-DISPLAY-CHANGED');
  assert.deepEqual(hs.reasons, ['a run 1: display on, FullWake at the start, display off, DarkWake at the end']);
  // a change only inside a recheck (before run a): every run reading is the same, no tag
  r = await nodeAsync(VERIFY, two('recheck'), { env: { ...env, FAKE_HOST_DARKWAKE_AFTER: '1' } });
  assert.equal(r.code, 0, r.out);
  res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  assert.deepEqual([res.host.hostState.tag, res.host.hostState.display, res.results[0].host.recheck.power.start.display], [null, ['off'], 'on']);
});

test('contaminated runs: load1 > 10 at run start, other CPU > 25 %, memory pressure warn; load1 > 6 only warns', async () => {
  const cases = [
    [{ FAKE_HOST_LOAD1: '12' }, true, ['load1 12 > 10 at run start'], []],
    [{ FAKE_HOST_BUSY: '0.4' }, true, ['other CPU 35 % > 25 %'], []],
    [{ FAKE_HOST_PRESSURE: '2' }, true, ['mem pressure warn'], []],
    [{ FAKE_HOST_LOAD1: '7' }, false, [], ['load1 7 > 6 at run start']],
    [{ FAKE_HOST_BUSY: '0.27' }, false, [], ['other CPU 22 % > 20 %']],
  ];
  await Promise.all(cases.map(async ([fake, invalid, reasons, warnings]) => {
    const { d, env, args } = setup();
    // --no-lock: this is about the run record, not the lock's gate (which would hold a busy host back, I-016)
    const r = await nodeAsync(VERIFY, args('dirty', ['--idle', '0', '--max-wait', '0', '--no-lock']), { env: { ...env, ...fake } });
    assert.equal(r.code, 0, r.out);
    const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
    const h = res.results[0].host;
    assert.deepEqual([h.loadInvalid, h.reasons, h.warnings], [invalid, reasons, warnings], JSON.stringify(fake));
    assert.equal(h.recheck, null, '--max-wait 0: no recheck');
    assert.equal(res.host.contaminated, invalid);
    if (invalid) assert.match(r.stdout, new RegExp(`CONTAMINATED: ${reasons[0]}`));
    if (invalid) assert.match(r.stdout, /^host: 1 of 1 runs contaminated \(.*\): verdicts provisional/m);
    else assert.match(r.stdout, /^host: 0 of 1 runs contaminated; 1 warn/m);
  }));
});

test('recheck before each run: waits (holding the lock) until the host is quiet, or runs anyway after --max-wait and says so', async () => {
  // busy 60 % for the first 25 s of (fake) time, then quiet: two failed 10 s windows, then quiet
  const A = setup();
  const ra = await nodeAsync(VERIFY, A.args('rewait', ['--idle', '0', '--no-lock']), { env: { ...A.env, FAKE_HOST_BUSY: '0.6:25000,0.05' } });
  assert.equal(ra.code, 0, ra.out);
  const ha = JSON.parse(readFileSync(join(A.d, 'result.json'), 'utf8')).results[0].host;
  assert.equal(ha.recheck.quiet, true);
  assert.ok(ha.recheck.windows >= 2 && ha.recheck.windows <= 3, `windows ${ha.recheck.windows}`);
  assert.match(ra.stdout, /\(waited \d+(\.\d)? s for a quiet host\)/);
  assert.deepEqual([ha.loadInvalid, ha.loadWarn], [false, false]);
  // never quiet: gives up after --max-wait 30 (3 windows), measures anyway, flags a warning (and the busy phases)
  const B = setup();
  const rb = await nodeAsync(VERIFY, B.args('regive', ['--idle', '0', '--max-wait', '30', '--max-busy', '50', '--no-lock']), { env: { ...B.env, FAKE_HOST_BUSY: '0.6' } });
  assert.equal(rb.code, 0, rb.out);
  const resB = JSON.parse(readFileSync(join(B.d, 'result.json'), 'utf8'));
  const hb = resB.results[0].host;
  assert.deepEqual([hb.recheck.quiet, hb.recheck.windows, hb.recheck.waitedSec, hb.recheck.reasons], [false, 3, 30, ['cpu 60 % > 50 %']]);
  assert.ok(hb.warnings.includes('host not quiet after the recheck before the run'));
  assert.ok(hb.reasons.includes('other CPU 55 % > 25 %'));
  assert.deepEqual(resB.host.recheck, { maxWaitSec: 30, maxLoad1: 6, maxBusyPct: 50 });
  assert.match(rb.stdout, /\(host not quiet after 30 s: cpu 60 % > 50 %; measuring anyway\)/);
  assert.equal(resB.results[0].scrollSummary.frames, 54, 'the run was measured, not skipped');
  // bad values
  const bad = node(VERIFY, B.args('bad', ['--max-wait', 'x']), { env: B.env });
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--max-wait must be a number >= 0/);
});

// ---- I-023: host sleep, Chrome gone between runs, hung steps -------------------------------------------
const runs2 = (a) => { const i = a.indexOf('--runs'); return [...a.slice(0, i), '--runs', '2', ...a.slice(i + 2)]; };
test('I-023: a host that stays busy past every window: the recheck stops at --max-wait (60 s default), then Chrome starts and the run is measured', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, runs2(args('busy', ['--idle', '0', '--no-lock'])), { env: { ...env, FAKE_HOST_BUSY: '0.3' } });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  for (const x of res.results) {
    assert.deepEqual([x.host.recheck.quiet, x.host.recheck.windows, x.host.recheck.waitedSec, x.host.recheck.suspended], [false, 6, 60, false], `run ${x.run}`);
    assert.equal(x.scrollSummary.frames, 54);
  }
  const log = readLog(env.FAKE_CHROME_LOG);
  assert.equal(log.filter((l) => l.method === '(started)').length, 1, 'one Chrome for both runs, as before');
  assert.ok(log.filter((l) => l.method === 'Browser.getVersion').length >= 6, 'Chrome is pinged during the recheck of run 2');
  assert.equal(res.host.chromeLaunches, 1);
});

test('I-023/I-026: a host sleep ends the recheck after one fresh window and is recorded; a sleep inside the run contaminates it', async () => {
  const { d, env, args } = setup();
  // fake monotonic time: Chrome launches at ~0, the recheck's 1st window (0-10 s) holds a 1890 s sleep at 5 s, the
  // fresh 2nd window ends at 20 s; the run (from fake ~20 s; its own waits are on that fake clock too, I-027) then sleeps 500 s at fake 22 s.
  const r = await nodeAsync(VERIFY, args('sleepy', ['--idle', '0', '--no-lock']), { env: { ...env, FAKE_HOST_BUSY: '0.3', FAKE_HOST_SUSPEND: '5000:1890,22000:500' } });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const h = res.results[0].host;
  assert.deepEqual([h.recheck.windows, h.recheck.suspended, h.recheck.sleptSec], [2, true, 1890], 'the sleep window plus one fresh window, not 6 windows and 1953 s');
  assert.ok(h.recheck.waitedSec >= 1910 && h.recheck.waitedSec < 1911, `wall time ${h.recheck.waitedSec}`);
  assert.match(r.stdout, /\(the host slept 1890 s during the recheck; measuring now\)/);
  assert.ok(h.warnings.includes('host slept 1890 s during the recheck before the run'));
  assert.equal(h.sleptSec, 500);
  assert.equal(h.woke, true);
  assert.equal(h.loadInvalid, true);
  assert.ok(h.reasons.includes('host slept 500 s during the run (I-026)'), h.reasons.join('; '));
  assert.equal(res.host.contaminatedRuns, 1);
});

test('I-023: Chrome gone between runs (exited during the recheck): relaunched before the next run, which is flagged', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, runs2(args('relaunch', ['--idle', '0', '--no-lock'])), { env: { ...env, FAKE_CHROME_EXIT_AFTER: 'Target.disposeBrowserContext' } });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  assert.equal(res.results.length, 2);
  assert.deepEqual(res.results.map((x) => x.host.chromeRelaunched), [false, true]);
  assert.ok(res.results[1].host.warnings.some((w) => /Chrome was relaunched/.test(w)));
  assert.equal(res.results[1].scrollSummary.frames, 54, 'run 2 measured on the new Chrome');
  assert.equal(res.host.chromeLaunches, 2);
  assert.equal(readLog(env.FAKE_CHROME_LOG).filter((l) => l.method === '(started)').length, 2);
  assert.match(r.stdout, /\(Chrome exited or stopped answering: relaunching\)/);
  // review-i023: never measure a just-launched Chrome. Run 1's Chrome idled through the 10 s recheck
  // window; the relaunched one waits --chrome-warm (10 s, on the fake host clock here) before run 2
  assert.deepEqual(res.results.map((x) => x.host.chromeWarmedSec), [0, 10]);
  assert.match(r.stdout, /\(Chrome exited or stopped answering: relaunching\) \(Chrome warm-up 10 s\)/);
  assert.equal(res.host.chromeWarmSec, 10);
});

test('review-i023: the watchdog starts once the lock is held, so a verify queued longer than --watchdog still measures', async () => {
  const { d, env, args } = setup();
  assert.equal(node(LOCK, ['acquire', 'chrome-measure', '--owner', 'long-holder'], { env }).code, 0);
  const p = nodeAsync(VERIFY, args('queued', ['--idle', '0', '--watchdog', '2']), { env, timeout: 60000 });
  await sleep(4500); // > 2 x --watchdog in the queue
  assert.deepEqual(JSON.parse(node(LOCK, ['status', 'chrome-measure', '--json'], { env }).stdout)[0].queue.map((w) => w.owner), ['queued'], 'still waiting, not killed');
  assert.equal(node(LOCK, ['release', 'chrome-measure', '--owner', 'long-holder'], { env }).code, 0);
  const r = await p;
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stderr, /WATCHDOG/);
  assert.ok(existsSync(join(d, 'result.json')));
});

test('I-023 watchdog: a step with no progress fails verify with a clear error, frees the lock and closes Chrome', async () => {
  const { env, args } = setup();
  const t0 = Date.now();
  const r = await nodeAsync(VERIFY, args('hung', ['--idle', '0', '--watchdog', '2']), { env: { ...env, FAKE_CHROME_HANG_AT: 'Input.synthesizeScrollGesture' }, timeout: 60000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /WATCHDOG: no progress for \d+ s in step "morph phase" \(mobile run 1\/1 a\) \(limit 12 s, --watchdog 2\); aborting so Chrome is closed and the chrome-measure lock is freed/);
  assert.ok(Date.now() - t0 < 30000, 'failed within seconds, not after the hang');
  assert.equal(holder(env.FW_STATE_DIR), null, 'lock released');
  const chromePid = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === '(started)').pid;
  let gone = false;
  for (let i = 0; i < 60 && !(gone = !alive(chromePid)); i++) await sleep(50);
  if (!gone) process.kill(chromePid, 'SIGKILL');
  assert.ok(gone, 'Chrome was left running');
  const bad = node(VERIFY, args('bad', ['--watchdog', '-1']), { env });
  assert.equal(bad.code, 2);
});

// ---- per-frame attribution, all opt-in: --cdp-metrics, --trace-frames, --frame-log (incident I-018, E5) ---
const CDP_STEP = { cdpScriptMs: 50, cdpStyleMs: 20, cdpLayoutMs: 10, cdpTaskMs: 200, cdpStyleCount: 5, cdpLayoutCount: 3, cdpV8CompileMs: 4, cdpDevToolsMs: 1 };
const cdpOf = (s) => Object.fromEntries(Object.keys(CDP_STEP).map((k) => [k, s[k]]));
// The golden: every CDP command verify.mjs sent on main before I-018 (05967e9), 2 runs with an idle phase,
// recorded with tests/helpers.mjs cdpTokens(). A default run must send exactly these, in this order.
const GOLDEN = JSON.parse(readFileSync(join(TESTS, 'fixtures', 'verify-default-cdp.json'), 'utf8'));

test('default run (no I-018 flags): exactly the CDP commands of verify.mjs before I-018 (golden), no Performance.*', async () => {
  const { d, env, args } = setup();
  const a = args('golden', ['--idle', '1', '--max-wait', '0']);
  a[a.indexOf('--runs') + 1] = '2'; // the first --runs wins: replace setup()'s, don't append
  const r = await nodeAsync(VERIFY, a, { env });
  assert.equal(r.code, 0, r.out);
  const log = readLog(env.FAKE_CHROME_LOG);
  assert.equal(log.some((l) => /^(Performance|Tracing)\./.test(l.method)), false);
  assert.deepEqual(cdpTokens(log), GOLDEN);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  assert.deepEqual(res.measurement, { cdpMetrics: false, traceFrames: false, frameLog: false });
  assert.equal('cdpStyleMs' in res.results[0].scrollSummary, false);
  assert.equal('traceFrames' in res.results[0], false);
  assert.equal('longFrames' in res.results[0], false, 'no >34 ms frame list without --trace-frames / --frame-log / --paint-rects');
  assert.equal('paintRects' in res.results[0], false);
});

test('--cdp-metrics: Performance.getMetrics enabled once per page, read at every phase boundary, deltas in every phase summary', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('cdp', ['--idle', '1', '--max-wait', '0', '--cdp-metrics']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const x = res.results[0];
  // the fake's counters grow by one step per read, and each phase is one read at its start and one at its end
  for (const ph of ['idleSummary', 'scrollSummary', 'morphSummary']) assert.deepEqual(cdpOf(x[ph]), CDP_STEP, ph);
  assert.deepEqual(res.measurement, { cdpMetrics: true, traceFrames: false, frameLog: false });
  const log = readLog(env.FAKE_CHROME_LOG);
  assert.equal(log.filter((l) => l.method === 'Performance.enable').length, 1);
  assert.equal(log.filter((l) => l.method === 'Performance.getMetrics').length, 6);
  // the reads sit outside the in-page window: never between a phase's RESET and its COLLECT
  const seq = log.map((l) => (l.method === 'Performance.getMetrics' ? 'M' : step(l))).filter((s) => s === 'M' || s === 'reset' || s === 'collect');
  assert.deepEqual(seq, ['M', 'reset', 'collect', 'M', 'M', 'reset', 'collect', 'M', 'M', 'reset', 'collect', 'M']);
  assert.match(r.stdout, /style 20ms\/5x layout 10ms\/3x script 50ms/);
  // apart from the Performance.* commands, the same sequence as a default run
  const B = setup();
  const rb = await nodeAsync(VERIFY, B.args('nocdp', ['--idle', '1', '--max-wait', '0']), { env: B.env });
  assert.equal(rb.code, 0, rb.out);
  assert.deepEqual(cdpTokens(log.filter((l) => !l.method.startsWith('Performance.'))), cdpTokens(readLog(B.env.FAKE_CHROME_LOG)));
});

test('--trace-frames: traces the scroll phase, attributes its own frames > 20 ms, checks completeness, says tracing perturbs timing', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('trace', ['--idle', '0', '--max-wait', '0', '--trace-frames']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const x = res.results[0];
  // tests/fixtures/trace-fixture.mjs: two frames > 20 ms in the logger's window (see tests/unit/trace-frames.test.mjs)
  const z = { script: 0, style: 0, layout: 0, paint: 0, other: 0, offMain: 0 };
  assert.deepEqual(x.traceSummary, { frames: 2, scriptMs: 8, styleMs: 21, layoutMs: 6, paintMs: 3, otherMs: 3, offMainMs: 17, gt34: 0, gt50: 0, styleElements: 1020, gt34ByClass: z, gt50ByClass: z, partial: false,
    layerMs: 1, paintEvents: 1, droppedFrames: 1, partialFrames: 1 }); // I-032: the fixture's Layerize, Paint and DroppedFrame events
  assert.equal(x.traceFrames.frames.length, 2);
  assert.deepEqual(x.traceFrames.summary.window, { from: 1000, to: 1106 }, 'the window the page reported');
  assert.equal(x.traceFrames.events, 20);
  assert.equal(x.traceFrames.dataLossOccurred, false);
  assert.equal(x.traceFrames.bufferPercentMax, 12.3, 'Tracing.bufferUsage');
  assert.equal(x.traceFrames.summary.lastEventCoversLastFrame, true);
  // the fake's canned logger frames (54, 4 > 20 ms) are not the fixture's rAF timestamps: the check shows both
  assert.deepEqual(x.traceFrames.check, { loggerFrames: 54, loggerGt20: 4, traceWindowFrames: 4, traceGt20: 2 });
  assert.match(x.traceFrames.note, /tracing perturbs timing/);
  assert.equal(res.measurement.traceFrames, true);
  assert.equal(res.measurement.traceBufferKb, TRACE_START.traceConfig.traceBufferSizeInKb);
  assert.match(r.stdout, /trace >20ms 2: script 8 style 21 layout 6 paint 3 other 3 offMain 17ms; >34ms 0 \(-\) >50ms 0 \(-\)/);
  assert.match(r.stdout, /^trace-frames: traced: tracing perturbs timing.*offMain = other \(compositor\/raster\/GPU\/vsync; GPU not separated\)/m);
  const log = readLog(env.FAKE_CHROME_LOG);
  assert.deepEqual(log.find((l) => l.method === 'Tracing.start').params, TRACE_START, 'explicit buffer size, recordUntilFull, buffer usage reports');
  const order = log.map((l) => (l.method.startsWith('Tracing.') ? l.method : step(l))).filter((s) => ['Tracing.start', 'Tracing.end', 'reset', 'scroll', 'collect'].includes(s));
  assert.deepEqual(order.slice(0, 5), ['Tracing.start', 'reset', 'scroll', 'collect', 'Tracing.end'], 'the trace covers exactly the scroll phase');
});

test('--trace-frames: data loss marks the trace partial; a huge dataCollected chunk is taken; a trace that never completes is traceFrames.error and the run goes on', async () => {
  const A = setup();
  const ra = await nodeAsync(VERIFY, A.args('loss', ['--idle', '0', '--max-wait', '0', '--trace-frames']), { env: { ...A.env, FAKE_CHROME_TRACE: 'dataloss,bigchunk' } });
  assert.equal(ra.code, 0, ra.out);
  const xa = JSON.parse(readFileSync(join(A.d, 'result.json'), 'utf8')).results[0];
  assert.equal(xa.traceFrames.error, undefined, 'a chunk of more events than a spread push(...) takes (RangeError) is collected');
  assert.equal(xa.traceFrames.events, 20 + BIG_CHUNK);
  assert.equal(xa.traceFrames.dataLossOccurred, true);
  assert.equal(xa.traceSummary.partial, true);
  assert.deepEqual(xa.traceFrames.summary.partialReasons, ['trace data loss (buffer full)']);
  assert.match(ra.stdout, /PARTIAL TRACE: trace data loss/);

  const B = setup();
  const rb = await nodeAsync(VERIFY, B.args('hang', ['--idle', '0', '--max-wait', '0', '--trace-frames', '--trace-timeout', '1']), { env: { ...B.env, FAKE_CHROME_TRACE: 'nocomplete' } });
  assert.equal(rb.code, 0, rb.out);
  const xb = JSON.parse(readFileSync(join(B.d, 'result.json'), 'utf8')).results[0];
  assert.match(xb.traceFrames.error, /Tracing\.tracingComplete not received within 1 s \(--trace-timeout; 20 events so far\)/);
  assert.equal(xb.traceSummary, null);
  assert.equal(xb.morphState, 'start-selling-top-nav is-morph', 'the morph phase still ran');
  assert.match(rb.stdout, /trace: Tracing\.tracingComplete not received/);
});

test('--frame-log: [t, dt, scrollY] for every frame of every phase (E5); the default injects the plain LOGGER', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('flog', ['--idle', '1', '--max-wait', '0', '--frame-log']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const x = res.results[0];
  assert.equal(res.measurement.frameLog, true);
  assert.deepEqual(Object.keys(x.frameLog), ['idle', 'scroll', 'morph']);
  assert.equal(x.frameLog.scroll.length, 54);
  assert.deepEqual(x.frameLog.scroll[0], [1016.7, 16.7, 10]);
  assert.equal(x.frameLog.idle.length, 102);
  const src = readLog(env.FAKE_CHROME_LOG).find((l) => l.method === 'Page.addScriptToEvaluateOnNewDocument').params.source;
  assert.match(src, /S\.log\.push/);
  assert.notEqual(src, LOGGER);
  // I-032: the frame log has timestamps, so the run gets per-frame tags of its frames > 34 ms (with scrollY)
  assert.deepEqual(x.longFrames.scroll.map((f) => [f.dur, f.ticks, f.scrollY, f.source]), [[40, 5, 520, 'frame-log'], [60, 7, 530, 'frame-log'], [120, 14, 540, 'frame-log']]);
  assert.deepEqual(x.longFrames.idle.map((f) => [f.dur, f.scrollY]), [[55, 0]]);
});

// ---- render-side signals, all opt-in: --trace-phases, --save-trace, --paint-rects (incident I-032) ------------
test('I-032 usage: --save-trace / --trace-phases need --trace-frames, --trace-phases takes idle,scroll,morph; exit 2 before any lock or browser', () => {
  for (const [extra, re] of [[['--save-trace'], /need --trace-frames/], [['--trace-phases', 'idle'], /need --trace-frames/], [['--trace-frames', '--trace-phases', 'idle,bogus'], /--trace-phases: a comma list of idle, scroll, morph/]]) {
    const { d, env, args } = setup();
    const r = node(VERIFY, args('usage', extra), { env });
    assert.equal(r.code, 2, extra.join(' '));
    assert.match(r.stderr, re);
    assert.equal(existsSync(join(d, 'state')), false);
    assert.equal(readLog(env.FAKE_CHROME_LOG).length, 0);
  }
});

test('I-032 --trace-frames: the Frames track category; traceSummary gains layerMs, Paint events, dropped / partial frames (DroppedFrame)', async () => {
  assert.ok(TRACE_START.traceConfig.includedCategories.includes('disabled-by-default-devtools.timeline.frame'));
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('trace32', ['--idle', '0', '--max-wait', '0', '--trace-frames']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const x = res.results[0];
  assert.deepEqual(x.traceFrames.summary.presentation, { dropped: 1, partial: 1, beginFrames: 2, drawFrames: 1, placedAtBegin: 2, byLayerTree: { 1: 2 },
    byGap: { 'k<=2': { frames: 2, withDropped: 0, withPartial: 0 }, 'k3-4': { frames: 2, withDropped: 1, withPartial: 1 }, 'k5-6': { frames: 0, withDropped: 0, withPartial: 0 }, 'k>=7': { frames: 0, withDropped: 0, withPartial: 0 } },
    byGapMs: { le20: { frames: 2, withDropped: 0, withPartial: 0 }, '20-34': { frames: 2, withDropped: 1, withPartial: 1 }, '34-50': { frames: 0, withDropped: 0, withPartial: 0 }, gt50: { frames: 0, withDropped: 0, withPartial: 0 } } });
  assert.deepEqual(res.measurement.tracePhases, ['scroll']);
  assert.equal(res.measurement.saveTrace, false);
  assert.deepEqual(res.measurement.traceCategories, TRACE_START.traceConfig.includedCategories);
  assert.equal('tracePhases' in x, false, 'scroll only (the default): no other phase traced');
  assert.equal('traceIdleSummary' in x || 'traceMorphSummary' in x || 'traceFiles' in x || 'paintRects' in x, false);
  assert.deepEqual(x.longFrames.scroll, [], 'the fixture\'s frames are <= 34 ms');
  assert.match(r.stdout, /frames: dropped 1 partial 1 layer 1ms paints 1/);
});

test('I-032 --trace-phases idle,scroll,morph --save-trace: one trace per phase around exactly its window, each saved for the Performance panel after the page closed', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('phases', ['--idle', '1', '--max-wait', '0', '--trace-frames', '--trace-phases', 'idle,scroll,morph', '--save-trace']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const x = res.results[0];
  const log = readLog(env.FAKE_CHROME_LOG);
  const order = log.map((l) => (l.method.startsWith('Tracing.') ? l.method : step(l))).filter((s) => ['Tracing.start', 'Tracing.end', 'reset', 'scroll', 'collect', 'input'].includes(s));
  assert.deepEqual(order, ['Tracing.start', 'reset', 'collect', 'Tracing.end', 'Tracing.start', 'reset', 'scroll', 'collect', 'Tracing.end', 'Tracing.start', 'reset', 'input', 'input', 'input', 'input', 'collect', 'Tracing.end']);
  assert.deepEqual(Object.keys(x.tracePhases), ['idle', 'morph']);
  assert.deepEqual(x.traceIdleSummary, x.traceSummary, 'the fake answers every trace with the same fixture');
  assert.deepEqual(x.traceMorphSummary, x.traceSummary);
  assert.equal(x.tracePhases.idle.check.loggerFrames, 102, 'checked against the idle phase\'s own logger frames');
  assert.deepEqual(res.measurement.tracePhases, ['idle', 'scroll', 'morph']);
  assert.equal(res.measurement.saveTrace, true);
  assert.deepEqual(Object.keys(x.traceFiles).sort(), ['idle', 'morph', 'scroll']);
  for (const [ph, f] of Object.entries(x.traceFiles)) {
    assert.equal(f, join(d, 'out', `trace-mobile-a-run1-${ph}.json`));
    const t = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(t.traceEvents.length, 20);
    assert.deepEqual(t.traceEvents, TRACE_EVENTS, 'the events as collected');
    assert.equal(t.metadata.phase, ph);
  }
  assert.match(r.stdout, /trace saved: .*trace-mobile-a-run1-idle\.json/);
});

// What --paint-rects adds to a run's CDP commands (the rest must be a default run's, in order).
const PAINT_CMD = (l) => ['Runtime.addBinding', 'Runtime.removeBinding', 'LayerTree.enable', 'LayerTree.disable', 'LayerTree.compositingReasons', 'DOM.describeNode'].includes(l.method)
  || (l.method === 'Runtime.evaluate' && l.params.expression.includes('__fwPaint'));

test('I-032 --paint-rects: LayerTree + binding armed before the throttle, read after it; per-frame paint area (sum), per-layer paints, layer nodes; otherwise a default run', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('paint', ['--idle', '1', '--max-wait', '0', '--paint-rects']), { env });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  const x = res.results[0];
  // the fake (tests/fixtures/fake-chrome.mjs paintPhase): per phase 2 frames in the window, 3 paints of L1 (1290x300) / L2 (1290x900),
  // in layer px: the fake host's DSF is 2 (read before the emulation), so the viewport is 430x932 CSS px x 2, not x the emulated DPR 3,
  // and the 1290 px wide layers are capped to 860 in layerVpMpx (L1 0.258, L2 0.774 Mpx)
  // a layer added in the 40 ms frame; the 4th paint is in a frame that ended after COLLECT (in no phase)
  assert.equal(x.paintRects.status, 'ok');
  assert.deepEqual([x.paintRects.source, x.paintRects.binding, x.paintRects.units, x.paintRects.dpr, x.paintRects.viewport], ['layerPainted', 'frame', 'layer px', 3, { w: 860, h: 1864 }]);
  assert.equal(x.paintRects.layerScale, 2);
  assert.equal(x.paintRects.layerPaintedEvents, 12);
  assert.equal(x.paintRects.bindingFrames, 12);
  assert.equal(x.paintRects.unassignedPaints, 3);
  // the fake's clips are whole layers, so the dirty-clip sum equals the painted layers' size here
  const P = { layerScale: 2, frames: 2, framesWithPaint: 2, paints: 3, newLayerPaints: 0, mpx: 1.935, frameMpxMax: 1.548, frameMpxP50: 1.548, layerMpx: 1.935, frameLayerMpxMax: 1.548, frameLayerMpxP50: 1.548,
    layerVpMpx: 1.29, frameLayerVpMpxMax: 1.032, layersMax: 4, layersAdded: 1, layersRemoved: 0, layerChurn: 1, layersPainted: 2, layerTreeChanges: 1 };
  for (const k of ['paintIdleSummary', 'paintScrollSummary', 'paintMorphSummary']) assert.deepEqual(x[k], P, k);
  assert.deepEqual(x.paintRects.phases.scroll.perLayer, { L2: { paints: 1, mpx: 1.161, layerMpx: 1.161, w: 1290, h: 900, backendNodeId: 3 }, L1: { paints: 2, mpx: 0.774, layerMpx: 0.774, w: 1290, h: 300, backendNodeId: 2 } });
  assert.deepEqual(x.paintRects.phases.scroll.topLayers, [{ layerId: 'L1', paints: 2, w: 1290, h: 300 }, { layerId: 'L2', paints: 1, w: 1290, h: 900 }]);
  assert.deepEqual(x.paintRects.frames.scroll, [[20005, 16.7, 1, 0.387, 0.387, 3, 0, 'L1'], [20021.7, 40, 2, 1.548, 1.548, 4, 1, 'L2']]);
  assert.deepEqual(x.paintRects.layerNodes, { L2: { node: 'section#hero.hero.is-on', reasons: ['willChange:L2'] }, L1: { node: 'nav.start-selling-top-nav', reasons: ['willChange:L1'] } });
  assert.match(x.paintRects.note, /compare only with other --paint-rects runs/);
  assert.deepEqual(x.longFrames.scroll, [{ t: 20021.7, dur: 40, ticks: 5, scrollY: null, class: null, top: null, loaf: null,
    paint: { paints: 2, mpx: 1.548, layerMpx: 1.548, topLayer: { layerId: 'L2', mpx: 1.161, layerMpx: 1.161, node: 'section#hero.hero.is-on' } }, layers: 4, layersDelta: 1, source: 'paint-rects' }]);
  assert.equal(res.measurement.paintRects, true);
  assert.equal(res.measurement.paintRectsAddedWork.length, 2, 'the added main-thread work is recorded');
  // I-032 review B1: the unit of every paint area is recorded where the numbers land
  assert.deepEqual([res.measurement.paintUnits, res.measurement.paintLayerScales, res.measurement.paintLayerScaleMixed], ['layer px', [2], false]);
  assert.match(res.measurement.paintRectsNote, /at the same layerScale/);
  assert.match(r.stdout, /paint-rects scroll \(layerPainted\): 3 paints 1\.935 layer Mpx \(frame max 1\.548\), painted layers 1\.935 layer Mpx \(viewport-capped 1\.29\), layers max 4 \+1 -0 \[layer px = CSS px x 2\]/);
  assert.doesNotMatch(r.stdout, /PAINT-SCALE-MIXED/);
  const log = readLog(env.FAKE_CHROME_LOG);
  const seq = log.map((l) => (['Runtime.addBinding', 'LayerTree.enable', 'LayerTree.disable', 'Runtime.removeBinding'].includes(l.method) ? l.method : step(l))).filter(Boolean);
  const at = (s) => seq.indexOf(s);
  assert.ok(at('Runtime.addBinding') < at('LayerTree.enable') && at('LayerTree.enable') < at('cpu 3'), 'armed before the throttle');
  assert.ok(at('cpu 1') < at('LayerTree.disable') && at('LayerTree.disable') < at('Runtime.removeBinding'), 'read out after the phases, unthrottled');
  assert.deepEqual(log.find((l) => l.method === 'Runtime.addBinding').params, { name: '__fwPaintFrame' });
  const scaleAt = log.findIndex((l) => l.method === 'Runtime.evaluate' && l.params.expression.includes('__fwPaintScale'));
  assert.ok(scaleAt >= 0 && scaleAt < log.findIndex((l) => l.method === 'Emulation.setDeviceMetricsOverride'), 'the layer scale is read before the emulation');
  // apart from the paint commands, exactly a default run's CDP sequence
  const B = setup();
  const rb = await nodeAsync(VERIFY, B.args('nopaint', ['--idle', '1', '--max-wait', '0']), { env: B.env });
  assert.equal(rb.code, 0, rb.out);
  assert.deepEqual(cdpTokens(log.filter((l) => !PAINT_CMD(l))), cdpTokens(readLog(B.env.FAKE_CHROME_LOG)));
});

test('I-032 --paint-rects as on Chrome 148+ (no layerPainted, paintCount in the lists): counts per frame and layer, no clip area, new layers flagged', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('paintc', ['--idle', '1', '--max-wait', '0', '--paint-rects']), { env: { ...env, FAKE_CHROME_PAINT: 'count' } });
  assert.equal(r.code, 0, r.out);
  const x = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8')).results[0];
  const pr = x.paintRects;
  assert.deepEqual([pr.status, pr.source, pr.binding, pr.layerPaintedEvents, pr.countedPaints, pr.unassignedPaints], ['ok', 'paintCount', 'frame', 0, 15, 3]);
  assert.deepEqual(pr.intervals, { lists: 12, withPaints: 9, spanGt1: 0, spanGt1Share: 0 });
  // per phase: L1 +1, then L1 +1 L2 +1 and the new L3 (first count 1, flagged), then L1 +1 after COLLECT (no phase)
  const P = { layerScale: 2, frames: 2, framesWithPaint: 2, paints: 3, newLayerPaints: 1, mpx: null, frameMpxMax: null, frameMpxP50: null, layerMpx: 1.935, frameLayerMpxMax: 1.548, frameLayerMpxP50: 1.548,
    layerVpMpx: 1.29, frameLayerVpMpxMax: 1.032, layersMax: 4, layersAdded: 1, layersRemoved: 0, layerChurn: 1, layersPainted: 2, layerTreeChanges: 2 };
  for (const k of ['paintIdleSummary', 'paintScrollSummary', 'paintMorphSummary']) assert.deepEqual(x[k], P, k);
  assert.deepEqual(pr.phases.scroll.perLayer, { L2: { paints: 1, mpx: null, layerMpx: 1.161, w: 1290, h: 900, backendNodeId: 3 }, L1: { paints: 2, mpx: null, layerMpx: 0.774, w: 1290, h: 300, backendNodeId: 2 },
    L3: { paints: 0, newPaints: 1, mpx: null, layerMpx: 0, w: 600, h: 600, backendNodeId: 4 } });
  assert.deepEqual(pr.frames.scroll, [[20005, 16.7, 1, null, 0.387, 3, 0, 'L1'], [20021.7, 40, 2, null, 1.548, 4, 1, 'L2']]);
  assert.deepEqual(x.longFrames.scroll[0].paint, { paints: 2, mpx: null, layerMpx: 1.548, topLayer: { layerId: 'L2', mpx: null, layerMpx: 1.161, node: 'section#hero.hero.is-on' } });
  assert.match(r.stdout, /paint-rects scroll \(paintCount\): 3 paints, painted layers 1\.935 layer Mpx \(viewport-capped 1\.29\), layers max 4 \+1 -0 \[layer px = CSS px x 2\]/);
});

test('I-032 --paint-rects with no paint data (no layerPainted, no paintCount): says so explicitly (zeros, not missing)', async () => {
  const { d, env, args } = setup();
  const r = await nodeAsync(VERIFY, args('paint0', ['--idle', '0', '--max-wait', '0', '--paint-rects']), { env: { ...env, FAKE_CHROME_PAINT: 'none' } });
  assert.equal(r.code, 0, r.out);
  const x = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8')).results[0];
  assert.equal(x.paintRects.status, 'enabled, 0 layerPainted events, no paintCount in the layer lists');
  assert.equal(x.paintRects.source, null);
  assert.equal(x.paintRects.layerPaintedEvents, 0);
  assert.equal(x.paintScrollSummary.paints, 0);
  assert.equal(x.paintScrollSummary.frames, 2);
  assert.equal(x.paintIdleSummary, null, '--idle 0: no idle phase');
  assert.match(r.stdout, /paint-rects: enabled, 0 layerPainted events, no paintCount/);
});

test('review-i027 1: the real host (FW_TEST_HOST \'\') keeps the real clock: a 1 s idle phase takes >= 1 s of wall time', async () => {
  // npm test's guard against an unconditional clock swap (before, only test:chrome caught one). Real samplers,
  // but no recheck (--max-wait 0) and no Chrome warm-up wait: ~3 s of real time, whatever the host's load.
  const { d, env, args } = setup();
  const real = { ...env, FW_TEST_HOST: '' }; // I-024 exception: review-i027 real-clock guard
  const r = await nodeAsync(VERIFY, args('realclock', ['--idle', '1', '--max-wait', '0', '--chrome-warm', '0', '--no-lock']), { env: real, timeout: 120000 });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'result.json'), 'utf8'));
  assert.equal(res.results[0].host.stub, undefined, 'not stubbed');
  const st = steps(readLog(env.FAKE_CHROME_LOG));
  assert.deepEqual(st.slice(0, 4).map((x) => x.s), ['state', 'cpu 3', 'reset', 'collect']);
  assert.ok(st[3].t - st[2].t >= 1000, `the 1 s idle window took ${st[3].t - st[2].t} ms of wall time`);
  assert.ok(res.results[0].host.phases.idle.windowSec >= 1);
});

test('review-i027 2: verify refuses a stubbed host outside a test unless Chrome is a test fixture (no verdict from a fake host)', () => {
  for (const chrome of [undefined, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
    const { d, env, args } = setup();
    const e = { ...env, FW_TEST_HOST: FAKE_HOST };
    if (chrome) e.CHROME = chrome; else delete e.CHROME;
    const r = node(VERIFY, args('stubbed'), { env: e });
    assert.equal(r.code, 2, r.out);
    assert.match(r.stderr, /stubbed host \(FW_TEST_HOST=.*fake-host\.mjs\) outside a test/);
    assert.equal(existsSync(join(d, 'state')), false, 'refused before the lock');
    assert.equal(existsSync(join(d, 'result.json')), false, 'no result');
  }
});
