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
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, nodeAsync, tool, startServe, startProc, run, sleep, REPO, chromeLock } from '../helpers.mjs';
import { makeFixtureHome, VENDOR_KEY, PAGE_JS, PAGE_CSS } from '../fixtures/baseline.mjs';

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
  const r = await nodeAsync(tool('verify.mjs'), [`fx=${srv.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '4', '--idle', '1', '--no-screens', '--out', join(d, 'out3'), '--result', join(d, 'r3.json'), '--profile', join(d, 'profile3'), '--owner', OWNER + '-trace', '--max-wait', '0', '--trace-frames', '--frame-log', '--trace-phases', 'idle,scroll', '--save-trace'], { env: { ...REAL_HOST, ...lock.env }, timeout: 600000 });
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
  // I-032: the Frames track (disabled-by-default-devtools.timeline.frame), the layer sub-split, one trace per phase, saved traces
  const pr = x.traceFrames.summary.presentation;
  assert.ok(pr && pr.beginFrames + pr.drawFrames > 0, `Frames track events in the scroll window: ${JSON.stringify(pr)}`);
  for (const k of ['layerMs', 'paintEvents', 'droppedFrames', 'partialFrames']) assert.equal(typeof x.traceSummary[k], 'number', k);
  for (const f of x.traceFrames.frames) assert.ok(f.layerMs <= f.paintMs + 0.1, `layerMs is part of paintMs (frame at ${f.t})`);
  assert.equal(x.tracePhases.idle.error, undefined, x.tracePhases.idle.error);
  assert.equal(x.tracePhases.idle.check.traceWindowFrames, x.tracePhases.idle.check.loggerFrames, 'the idle trace covers the idle phase\'s frames');
  assert.equal(typeof x.traceIdleSummary.frames, 'number');
  const saved = JSON.parse(readFileSync(x.traceFiles.scroll, 'utf8'));
  assert.equal(saved.traceEvents.length, x.traceFrames.events, 'the saved trace is the one attributed');
  assert.equal(saved.metadata.phase, 'scroll');
  for (const f of x.longFrames.scroll) { assert.ok(f.dur > 34); assert.equal(typeof f.scrollY, 'number'); assert.equal(f.source, 'frame-log'); }
  console.log(`trace-frames (real Chrome): presentation ${JSON.stringify({ ...pr, byGap: undefined, byGapMs: undefined })}, layerMs ${x.traceSummary.layerMs} of paintMs ${x.traceSummary.paintMs}, ${x.longFrames.scroll.length} long frames tagged`);
});

test('verify.mjs --paint-rects: real LayerTree paints per frame and layer, layer nodes, in the scroll window (I-032)', async () => {
  // the fixture only transforms (composited, no repaint while scrolling): a copy with an in-flow line showing
  // body[data-y], which the fixture's scroll listener sets, so every scroll event repaints the scrolling contents
  // layer. In flow, not position:fixed: a fixed badge with the same text got 1 paintCount rise in 360 frames on
  // both Chrome 154 and 143 (I-032 probe 2026-10-01, F-072), while in-flow text rose every frame on both.
  const fxp = makeFixtureHome(join(d, 'home-paint'));
  appendFileSync(join(fxp.home, 'site-pretty', PAGE_CSS.slice(1)), 'body::before{content:attr(data-y);display:block;height:40px;color:#000}\n');
  const srvp = await startServe(['--port', '0', '--quiet', '--root', 'site-pretty', '--vendors=local', '--https'], { env: { FW_MIRROR_HOME: fxp.home } });
  let r;
  try {
    r = await nodeAsync(tool('verify.mjs'), [`fx=${srvp.url}`, '--runs', '1', '--viewport', 'mobile', '--cpu', '2', '--idle', '1', '--no-screens', '--out', join(d, 'out4'), '--result', join(d, 'r4.json'), '--profile', join(d, 'profile4'), '--owner', OWNER + '-paint', '--max-wait', '0', '--paint-rects'], { env: { ...REAL_HOST, ...lock.env }, timeout: 600000 });
  } finally { await srvp.stop(); }
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(join(d, 'r4.json'), 'utf8'));
  const x = res.results[0];
  const pr = x.paintRects;
  assert.ok(pr.bindingFrames > 10, `binding frames ${pr.bindingFrames}`);
  // Chrome 148+ sends no layerPainted (Chromium 1bf9d9eb378c, F-064): then the layer lists' paintCount is the source
  assert.ok(['layerPainted', 'paintCount'].includes(pr.source), `source ${pr.source} (status ${pr.status})`);
  assert.ok(pr.layerPaintedEvents > 0 || pr.countedPaints > 0, `layerPainted ${pr.layerPaintedEvents}, counted paints ${pr.countedPaints}`);
  assert.equal(pr.status, 'ok');
  // layer px = CSS px x the host display's DSF (the compositor keeps it under emulation, blink widget_base.cc), not x the emulated DPR 3
  assert.deepEqual([pr.units, pr.dpr], ['layer px', 3]);
  assert.ok(pr.layerScale > 0, `layerScale ${pr.layerScale}`);
  assert.deepEqual(pr.viewport, { w: Math.round(430 * pr.layerScale), h: Math.round(932 * pr.layerScale) });
  const s = x.paintScrollSummary;
  // the binding recorder and the logger are both rAF callbacks over the same window
  assert.ok(Math.abs(s.frames - x.scrollSummary.frames) <= 2, `paint frames ${s.frames} vs logger frames ${x.scrollSummary.frames}`);
  assert.ok(s.layersMax >= 1, `layers ${s.layersMax}`);
  assert.ok(s.paints > 0 && s.framesWithPaint > 0, `the data-y line repaints while scrolling: ${s.paints} paints in ${s.framesWithPaint} frames`);
  assert.ok(s.layerMpx > 0 && s.layerVpMpx <= s.layerMpx, `layerMpx ${s.layerMpx}, viewport-capped ${s.layerVpMpx}`);
  const all = Object.values(pr.phases).flatMap((p) => Object.values(p.perLayer));
  const widths = [...new Set(all.map((l) => l.w).filter((w) => w != null))].sort((a, b) => b - a);
  assert.ok(widths.includes(pr.viewport.w), `layer widths ${widths.slice(0, 5)}: the painted document layer is the viewport width in layer px (430 CSS px x ${pr.layerScale} = ${pr.viewport.w})`);
  console.log(`paint-rects (real Chrome): source ${pr.source}, binding ${pr.binding} ${JSON.stringify(pr.intervals)}, ${pr.layerPaintedEvents} layerPainted / ${pr.countedPaints} counted paints, scroll ${JSON.stringify(s)}, painted layer widths ${widths.slice(0, 5)} (430 CSS px x layerScale ${pr.layerScale} = ${pr.viewport.w}), nodes ${JSON.stringify(Object.values(pr.layerNodes).map((n) => n.node))}`);
  assert.ok(Object.values(pr.layerNodes).some((n) => n.node), 'the top layers have DOM nodes');
  assert.deepEqual(res.measurement.paintRects, true);
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
