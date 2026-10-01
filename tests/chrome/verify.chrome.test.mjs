// OPT-IN (npm run test:chrome): real Chrome, short runs, through the REAL cross-worktree chrome-measure
// lock (so it queues behind agents' measurements instead of disturbing them). Fixture baseline only.
// The file holds the lock once (chromeLock: the queue wait is outside the per-test timeouts, I-022) and
// verify.mjs re-enters that hold through FW_LOCK_HELD.
//   1. verify.mjs: one mobile run at CPU 2x against the fixture served like `fix.mjs ab` serves it
//      (--vendors=local --https, --root site-pretty); frames/LoAF fields present (idle, scroll, morph);
//      ran under the lock without queueing; SRI ok.
//   2. SIGTERM during a real run: the dedicated Chrome (its profile) is gone; the file's hold stays.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, nodeAsync, tool, startServe, startProc, run, sleep, REPO, chromeLock } from '../helpers.mjs';
import { makeFixtureHome, VENDOR_KEY, PAGE_JS } from '../fixtures/baseline.mjs';

const OWNER = `test-chrome-${process.pid}`;
// the real host (not tests/fixtures/fake-host.mjs), with a short gate cap: the numbers don't matter here, the samplers do
const REAL_HOST = { FW_TEST_HOST: '', FW_GATE_MAX_WAIT: '60' };
const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).stdout.trim();
const LOCKFILE = join(common, 'fastwork-mirror', 'locks', 'chrome-measure.json');
const holder = () => { try { return JSON.parse(readFileSync(LOCKFILE, 'utf8')); } catch { return null; } };
const lock = chromeLock(OWNER, { cmd: 'verify.chrome test' });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());
let fx, srv, d;
before(async () => {
  d = tempDir('fw-chrome-');
  fx = makeFixtureHome(join(d, 'home'));
  srv = await startServe(['--port', '0', '--quiet', '--root', 'site-pretty', '--vendors=local', '--https'], { env: { FW_MIRROR_HOME: fx.home } });
});
after(() => srv?.stop());

test('verify.mjs: one real mobile run at CPU 2x under the chrome-measure lock', async () => {
  const p = nodeAsync(tool('verify.mjs'), [`fx=${srv.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '2', '--no-screens', '--out', join(d, 'out'), '--result', join(d, 'r.json'), '--profile', join(d, 'profile'), '--owner', OWNER + '-verify', '--max-wait', '10'], { env: { ...REAL_HOST, ...lock.env }, timeout: 600000 });
  // the hold this file runs under: its own chromeLock(), or, under `npm run test:chrome`, the wrapper's
  // `lock.mjs run` hold that chromeLock() re-entered (I-022)
  const outer = holder();
  assert.ok(outer, 'this file holds chrome-measure');
  let seen = null, other = null, done = false;
  p.then(() => (done = true));
  while (!done) { const h = holder(); if (h?.token === outer.token) seen = h; else if (h) other = h; await sleep(200); }
  const r = await p;
  assert.equal(r.code, 0, r.out);
  assert.ok(seen, 'the real chrome-measure lock was held (by this file or its wrapper) while measuring');
  assert.equal(seen.kind, 'process');
  if (outer.owner === OWNER) assert.equal(seen.pid, process.pid);
  assert.equal(other, null, `nobody else held it meanwhile: ${JSON.stringify(other)}`);
  assert.doesNotMatch(r.out, /\[lock chrome-measure\] busy/, 'verify.mjs re-entered the hold instead of queueing');
  assert.equal(holder()?.token, outer.token, "verify.mjs's exit does not release the file's hold");

  const res = JSON.parse(readFileSync(join(d, 'r.json'), 'utf8'));
  const x = res.results[0];
  assert.equal(x.viewport, 'mobile');
  assert.ok(x.scroll.y > 0, 'the page scrolled');
  assert.equal(x.state.nav, 'start-selling-top-nav');
  assert.equal(res.idle, 6, 'default idle phase');
  assert.equal(x.idleSummary.scrollY, 0, 'idle phase stays at the top');
  for (const ph of ['idleSummary', 'scrollSummary', 'morphSummary']) {
    const s = x[ph];
    assert.ok(s.frames > 10, `${ph}.frames ${s.frames}`);
    assert.ok(s.fps > 0);
    for (const k of ['p50', 'p95', 'max', 'gt20', 'gt34', 'gt50', 'gt100', 'loafCount', 'loafMs', 'loafScriptMs', 'forcedLayoutMs']) assert.equal(typeof s[k], 'number', `${ph}.${k}`);
    assert.equal(s.noLoaf, undefined, 'long-animation-frame observer available');
    // a default run is main's measurement: no CDP Performance.getMetrics deltas (opt-in --cdp-metrics, I-018
    // review; real-Chrome coverage of --cdp-metrics: fix-ab.chrome.test.mjs)
    for (const k of ['cdpScriptMs', 'cdpStyleMs', 'cdpLayoutMs', 'cdpTaskMs', 'cdpStyleCount', 'cdpLayoutCount']) assert.equal(k in s, false, `${ph}.${k}`);
  }
  assert.deepEqual(res.measurement, { cdpMetrics: false, traceFrames: false, frameLog: false });
  assert.ok(x.scripts.includes(PAGE_JS));
  assert.ok(x.scripts.includes('/__vendor/' + VENDOR_KEY), 'CF beacon rewritten to the local vendor copy');
  assert.deepEqual(x.notFound, []);
  assert.deepEqual(x.errors.filter((e) => /integrity|digest/i.test(e)), [], 'vendor script passed SRI (served from site/, not site-pretty/)');
  // host record from the real samplers (I-017): the measured Chrome's process tree used CPU in every phase
  assert.equal(x.host.stub, undefined);
  // I-027: only a stubbed host ($FW_TEST_HOST) runs verify's waits on a fake clock; on the real host the
  // 6 s idle window is 6 s of wall time (the host record's window is Date.now-based here)
  assert.ok(x.host.phases.idle.windowSec >= 6, `real host: idle window ${x.host.phases.idle.windowSec} s of wall time`);
  for (const [ph, p] of Object.entries(x.host.phases)) {
    for (const k of ['windowSec', 'busyPct', 'sysPct', 'chromeCpuPct', 'otherBusyPct', 'load1Start']) assert.equal(typeof p[k], 'number', `host.phases.${ph}.${k}`);
    assert.ok(p.chromeCpuPct > 0, `${ph}: Chrome tree CPU ${p.chromeCpuPct} %`);
    assert.ok(p.busyPct >= p.chromeCpuPct - 2, `${ph}: host busy ${p.busyPct} % >= Chrome ${p.chromeCpuPct} %`);
    if (process.platform === 'darwin') assert.ok([1, 2, 4].includes(p.pressureMax));
  }
  assert.equal(typeof x.host.loadInvalid, 'boolean');
  assert.equal(x.host.recheck.windows >= 1, true);
  // I-023/I-026: real sleep detection (monotonic vs wall clock, kern.waketime) and one Chrome, not relaunched
  assert.equal(typeof x.host.sleptSec, 'number');
  assert.ok(x.host.sleptSec < 2 || x.host.loadInvalid, `slept ${x.host.sleptSec} s but not contaminated`);
  assert.equal(x.host.chromeRelaunched, false);
  assert.equal(typeof x.host.recheck.suspended, 'boolean');
  assert.deepEqual(Object.keys(x.origins).filter((o) => !/^https:\/\/localhost:\d+/.test(o) && !o.startsWith('data:')), [], 'no request left the machine');
});

test('verify.mjs --trace-frames --frame-log: a real trace is clock-synced and attributed; the frame log has scrollY (I-018, E5)', async () => {
  const r = await nodeAsync(tool('verify.mjs'), [`fx=${srv.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '4', '--idle', '1', '--no-screens', '--out', join(d, 'out3'), '--result', join(d, 'r3.json'), '--profile', join(d, 'profile3'), '--owner', OWNER + '-trace', '--max-wait', '0', '--trace-frames', '--frame-log'], { env: { ...REAL_HOST, ...lock.env }, timeout: 600000 });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'r3.json'), 'utf8'));
  const x = res.results[0];
  assert.equal(x.traceFrames.error, undefined, x.traceFrames.error);
  assert.ok(x.traceFrames.events > 100, `trace events ${x.traceFrames.events}`);
  assert.ok(x.traceFrames.summary.mainThreadEvents > 10, 'the main thread was found via the sync mark');
  for (const k of ['frames', 'scriptMs', 'styleMs', 'layoutMs', 'paintMs', 'otherMs', 'offMainMs', 'gt34', 'gt50', 'styleElements']) assert.equal(typeof x.traceSummary[k], 'number', k);
  for (const f of x.traceFrames.frames) {
    const sum = f.scriptMs + f.styleMs + f.layoutMs + f.paintMs + f.otherMs + f.offMainMs;
    assert.ok(Math.abs(sum - f.dur) < 1, `frame at ${f.t}: parts ${sum} vs ${f.dur} ms`);
  }
  // complete (I-018 review): no data loss, the main thread's events reach the last frame
  assert.equal(x.traceFrames.dataLossOccurred, false);
  assert.equal(x.traceFrames.summary.lastEventCoversLastFrame, true);
  assert.equal(x.traceSummary.partial, false, JSON.stringify(x.traceFrames.summary.partialReasons));
  // clipped to the logger window: the trace's frames are the scroll phase's frames
  const c = x.traceFrames.check;
  assert.equal(c.traceWindowFrames, c.loggerFrames, JSON.stringify(c));
  assert.equal(c.traceGt20, x.scrollSummary.gt20, JSON.stringify(c));
  assert.ok(x.frameLog.scroll.length > 10);
  const ys = x.frameLog.scroll.map((f) => f[2]);
  assert.ok(ys[ys.length - 1] > ys[0], 'scrollY grows during the scroll phase');
  assert.equal(x.frameLog.scroll.length, x.scrollSummary.frames, 'one log entry per recorded frame');
});

test('verify.mjs: SIGTERM mid-run closes the dedicated Chrome', async () => {
  const outer = holder(); // this file's hold, or the test:chrome wrapper's (I-022)
  const profile = join(d, 'profile-kill');
  const v = await startProc(process.execPath, [tool('verify.mjs'), `fx=${srv.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '2', '--no-screens', '--out', join(d, 'out2'), '--profile', profile, '--owner', OWNER + '-kill', '--max-wait', '0'], { env: { ...REAL_HOST, ...lock.env }, ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 600000 });
  const chromeUp = () => run('pgrep', ['-f', `user-data-dir=${profile}`]).stdout.trim();
  // Chrome starts right after the run's header line (after the host recheck, I-023)
  for (let i = 0; i < 100 && !chromeUp(); i++) await sleep(100);
  assert.ok(chromeUp(), 'Chrome is running with the dedicated profile');
  await v.stop('SIGTERM');
  let left = chromeUp();
  for (let i = 0; i < 60 && left; i++) { await sleep(100); left = chromeUp(); }
  if (left) run('pkill', ['-f', `user-data-dir=${profile}`]);
  assert.equal(left, '', 'Chrome must not outlive verify.mjs');
  assert.equal(holder()?.token, outer.token, "killing verify.mjs leaves the file's (or its wrapper's) hold (released in after())");
  assert.equal(existsSync(join(d, 'r2.json')), false);
});
