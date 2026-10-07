// tools/fix.mjs ab end to end with the fake Chrome ($CHROME), in a temp repo + worktree: starts the two
// servers (calibrated defaults: --vendors=local --https --latency 150), checks the served overlay,
// runs verify.mjs under the lock, and writes results.json (A/B) / results-aa.json (A/A). Also: SIGTERM
// on `ab` must not leave servers, verify.mjs or the browser running, nor the lock held.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, nodeAsync, startProc, tempDir, TESTS, SLOW_EXIT, signalTwiceDuringExit, sleep, sha256 } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
let repo, fx;
const fix = (args, env = {}) => node(join(repo.wt, 'tools', 'fix.mjs'), args, { cwd: repo.wt, env });
const readLog = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
/** verify starts Chrome after the host recheck before run 1 (I-023), i.e. after "[mobile run 1/1]". */
async function chromeStarted(f) {
  for (let i = 0; i < 200; i++) { const s = readLog(f).find((l) => l.method === '(started)'); if (s) return s; await sleep(50); }
  throw new Error('fake Chrome did not start');
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// I-236: after a SIGTERM, fix.mjs signals its children and exits at once; verify.mjs then exits through its 'exit'
// handler, killTree() (tools/lib/cdp.mjs), which reads the tree with one synchronous `ps -A` (timeout 3000 ms) before it
// SIGKILLs Chrome. Beside other agents' real Chromes under load that ps alone outran the old fixed 3 s poll. Wait as
// long as the tool's own bound (that ps timeout) plus a margin for exit and signal delivery; return as soon as all are gone.
const KILLTREE_PS_TIMEOUT_MS = 3000, TEARDOWN_MARGIN_MS = 3000;
async function survivorsAfterTeardown(pids) {
  const left = () => Object.entries(pids).filter(([, pid]) => alive(pid)).map(([k]) => k);
  for (const t = Date.now() + KILLTREE_PS_TIMEOUT_MS + TEARDOWN_MARGIN_MS; left().length && Date.now() < t;) await sleep(50);
  return left();
}

before(() => {
  repo = makeTempRepo({ worktree: 'ab-wt' });
  fx = makeFixtureHome(repo.main);
  assert.equal(fix(['new', 'fast-nav']).code, 0);
  assert.equal(fix(['edit', 'fast-nav', PAGE_JS]).code, 0);
  const f = join(repo.wt, 'fixes', 'fast-nav', 'overlay', PAGE_JS.slice(1));
  writeFileSync(f, readFileSync(f, 'utf8').replace('requestAnimationFrame(tick);\n}', 'if (scrollY < 4000) requestAnimationFrame(tick);\n}'));
});

test('ab --runs 1 (A/B) and ab --aa (A/A) produce complete results files', async () => {
  // Both runs share one lock dir, as in real use: they serialize through chrome-measure (they also share
  // the checkout's Chrome profile dir, so running them unserialized would make them fight over one browser).
  const envB = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state'), FAKE_CHROME_LOG: join(repo.root, 'ab.jsonl'), FAKE_CHROME_METRICS: 'step' };
  // the A/A runs on a loaded (fake) host: load1 12 > 10 contaminates every run (I-017)
  const envA = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state'), FAKE_CHROME_LOG: join(repo.root, 'aa.jsonl'), FAKE_CHROME_METRICS: 'step', FAKE_HOST_LOAD1: '12',
    FW_GATE_MAX_LOAD1: '20' }; // ... which the lock's host gate (I-016) admits only with its load1 limit raised
  const [ab, aa] = await Promise.all([
    nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'fast-nav', '--runs', '1', '--idle', '1', '--no-screens', '--max-wait', '20', '--watchdog', '120'], { cwd: repo.wt, env: envB }), // no I-018 flags: main's measurement
    nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', '--aa', '--runs', '1', '--idle', '0', '--no-screens', '--trace-frames', '--cdp-metrics'], { cwd: repo.wt, env: envA }),
  ]);
  assert.equal(ab.code, 0, ab.out);
  assert.equal(aa.code, 0, aa.out);
  assert.match(ab.stdout, /served-file check OK: 1 overlay file\(s\) differ from baseline and come from the overlay/);

  const res = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results.json'), 'utf8'));
  assert.equal(res.topic, 'fast-nav');
  assert.equal(res.kind, 'A/B');
  assert.equal(res.git.branch, 'wt/ab-wt');
  const { hostThresholds, hostRecheck, watchdogSec, measurement, ...cfgRest } = res.config;
  assert.deepEqual(measurement, { cdpMetrics: false, traceFrames: false, frameLog: false }, 'what verify recorded (I-018): a flagless ab is main\'s measurement');
  assert.deepEqual(cfgRest, { cpu: 6, viewport: 'mobile', runs: 1, idle: 1, serveArgs: ['--vendors=local', '--https', '--latency', '150'], baseline: 'site-pretty', baselineSnapshot: { snapshot: null, state: 'unpinned' }, stackedOn: null, order: 'ABBA (alternating per run)' });
  assert.equal(hostThresholds.invalidLoad1, 10, 'thresholds copied into config');
  assert.deepEqual(hostRecheck, { maxWaitSec: 20, maxLoad1: 6, maxBusyPct: 25 }, 'ab passes --max-wait to verify.mjs');
  assert.equal(watchdogSec, 120, 'ab passes --watchdog to verify.mjs (I-023)');
  assert.equal(res.patch.file, 'fixes/fast-nav/patch.diff');
  assert.equal(res.patch.sha256, sha256(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'patch.diff'))));
  assert.deepEqual([res.patch.files, res.patch.added, res.patch.removed], [1, 1, 1]);
  assert.equal(res.servedCheck.length, 1);
  const sc = res.servedCheck[0];
  assert.equal(sc.path, '/' + PAGE_JS.slice(1));
  assert.equal(sc.baseline.source, 'base');
  assert.equal(sc.patched.source, 'overlay');
  assert.equal(sc.patched.sha256, sc.overlaySha256);
  assert.equal(sc.baseline.sha256, sha256(fx.prettyFiles[PAGE_JS]));
  // a flagless ab (I-018 review): main's metric keys exactly, no CDP or trace rows, every metric with its n of pairs
  assert.deepEqual(Object.keys(res.metrics.scroll), ['fps', 'gt20', 'gt34', 'gt50', 'gt100', 'max', 'p95', 'loafMs', 'loafScriptMs', 'forcedLayoutMs']);
  assert.deepEqual(Object.keys(res.metrics.morph), ['fps', 'gt50', 'loafMs', 'forcedLayoutMs']);
  for (const ms of Object.values(res.metrics)) for (const v of Object.values(ms)) assert.equal(v.n, 1, v.name);
  assert.doesNotMatch(res.markdown, /\(CDP\)|\(traced\)|trace-frames|traced|^\| trace:/m, 'no CDP or trace rows unless asked');
  // idle phase (--idle 1): the same metrics as the scroll phase, from the fake's no-input recording
  assert.deepEqual(Object.keys(res.metrics), ['scroll', 'morph', 'idle']);
  assert.deepEqual(Object.keys(res.metrics.idle), Object.keys(res.metrics.scroll));
  const ifps = res.metrics.idle.fps;
  assert.equal(ifps.name, 'fps');
  assert.equal(ifps.higherIsBetter, true);
  assert.deepEqual(ifps.baseline, { median: 58.1, min: 58.1, max: 58.1, runs: [58.1] });
  assert.deepEqual(ifps.patched, { median: 58.1, min: 58.1, max: 58.1, runs: [58.1] });
  assert.deepEqual([ifps.delta, ifps.deltaPct, ifps.pairedDeltas, ifps.verdict], [0, 0, [0], 'n=1 (need >=3 runs for a verdict)']);
  assert.deepEqual(Object.fromEntries(Object.entries(res.metrics.idle).map(([k, v]) => [k, v.baseline.median])),
    { fps: 58.1, gt20: 2, gt34: 1, gt50: 1, gt100: 0, max: 55, p95: 16.7, loafMs: 55, loafScriptMs: 40, forcedLayoutMs: 6 });
  assert.match(res.markdown, /^\| idle: fps \| 58\.1 \[58\.1-58\.1\] \| 58\.1 \[58\.1-58\.1\] \| 0 \(0%\) \| n=1/m);
  assert.match(res.markdown, /^\| idle: forced style\+layout ms \(in LoAF\) \| 6 \[6-6\] \| 6 \[6-6\] \| 0 \(0%\) \| n=1/m);
  assert.equal(JSON.parse(readFileSync(join(repo.wt, res.raw), 'utf8')).idle, 1, 'ab passes --idle to verify.mjs');
  const fps = res.metrics.scroll.fps;
  assert.deepEqual(fps.baseline, { median: 50, min: 50, max: 50, runs: [50] });
  assert.deepEqual(fps.patched, { median: 50, min: 50, max: 50, runs: [50] });
  assert.equal(fps.delta, 0);
  assert.deepEqual(fps.pairedDeltas, [0]);
  assert.equal(fps.n, 1, 'complete pairs (I-018 review)');
  assert.equal(fps.verdict, 'n=1 (need >=3 runs for a verdict)');
  assert.equal(res.metrics.scroll.forcedLayoutMs.baseline.median, 25);
  assert.deepEqual(res.regressions.newErrors, []);
  assert.deepEqual(res.regressions.new404s, []);
  assert.deepEqual(res.regressions.morphReached, { baseline: [true], patched: [true] });
  assert.match(res.markdown, /^\| mobile 6x, n=1 \| baseline median \[min-max\] \| patched median \[min-max\] \| delta \| verdict \|$/m);
  assert.match(res.markdown, /^\| scroll: fps \| 50 \[50-50\] \| 50 \[50-50\] \| 0 \(0%\) \| n=1/m);
  assert.ok(existsSync(join(repo.wt, res.raw)), 'raw verify.json kept under out/ab/');
  assert.equal(typeof res.host.loadavg1Min, 'number');
  // host guard (I-017): clean on the quiet fake host
  assert.deepEqual([res.host.contaminated, res.host.contaminatedRuns, res.host.runsTotal, res.host.invalidRuns, res.host.warnRuns, res.host.recorded], [false, 0, 2, [], [], true]);
  assert.deepEqual([res.host.loadavg1Min, res.host.loadavg1Max, res.host.otherCpuPctMax], [1, 1, 0]);
  assert.match(res.markdown, /^host: 0 of 2 runs contaminated \(load1 1-1, other CPU max 0 %\) \[host STUBBED: .*fake-host\.mjs\]$/m);
  assert.match(ab.stdout, /^host: 0 of 2 runs contaminated/m);
  // T8+ (I-033): one display / wake state throughout (the fake host's default: display on, FullWake, AC, caffeinate -d)
  assert.deepEqual([res.host.hostState.recorded, res.host.hostState.changed, res.host.hostState.tag, res.host.hostState.display, res.host.hostState.fullWake], [true, false, null, ['on'], [true]]);
  assert.match(res.markdown, /^host state: display on, FullWake, power AC, display-sleep assertion yes$/m);
  assert.match(ab.stdout, /^host state: display on, FullWake, power AC, display-sleep assertion yes$/m);

  // the two servers really were baseline vs baseline+overlay over https (ABBA with 1 run: base then fix)
  const nav = readLog(envB.FAKE_CHROME_LOG).filter((l) => l.method === 'Page.navigate').map((l) => l.params.url);
  assert.equal(nav.length, 2);
  for (const u of nav) assert.match(u, /^https:\/\/localhost:\d+\/$/);
  assert.notEqual(nav[0], nav[1]);
  assert.deepEqual(readLog(envB.FAKE_CHROME_LOG).filter((l) => l.method === 'Emulation.setCPUThrottlingRate').map((l) => l.params.rate), [6, 1, 6, 1]);

  const aaDirs = readdirSync(join(repo.wt, 'out', 'ab', '_aa'));
  assert.equal(aaDirs.length, 1);
  const aaRes = JSON.parse(readFileSync(join(repo.wt, 'out', 'ab', '_aa', aaDirs[0], 'results-aa-trace.json'), 'utf8'));
  assert.equal(existsSync(join(repo.wt, 'out', 'ab', '_aa', aaDirs[0], 'results-aa.json')), false, 'a traced A/A is not the noise floor file');
  assert.equal(aaRes.kind, 'A/A noise floor');
  assert.equal(aaRes.patch, null);
  assert.deepEqual(aaRes.servedCheck, []);
  assert.equal(aaRes.metrics.scroll.fps.delta, 0);
  // --idle 0: no idle phase measured, none reported
  assert.equal(aaRes.config.idle, 0);
  assert.deepEqual(Object.keys(aaRes.metrics), ['scroll', 'morph', 'trace'], '--trace-frames passed through: the trace rows (I-018)');
  assert.equal(aaRes.metrics.trace.styleMs.baseline.median, 21);
  assert.deepEqual(Object.keys(aaRes.metrics.trace), ['frames', 'scriptMs', 'styleMs', 'layoutMs', 'paintMs', 'otherMs', 'offMainMs', 'gt34', 'gt50', 'styleElements',
    'layerMs', 'paintEvents', 'droppedFrames', 'partialFrames']); // I-032: the layer sub-split, Paint events, the Frames track
  assert.deepEqual([aaRes.metrics.trace.layerMs.baseline.median, aaRes.metrics.trace.droppedFrames.baseline.median, aaRes.metrics.trace.partialFrames.patched.median], [1, 1, 1]);
  assert.match(aaRes.markdown, /^\| trace: other \(compositor\/raster\/GPU\/vsync; GPU not separated\) ms in them \| 17 \[17-17\]/m);
  assert.equal(aaRes.config.measurement.traceFrames, true);
  // + the per-phase CDP Performance.getMetrics deltas (--cdp-metrics passed through, I-018)
  assert.equal(aaRes.config.measurement.cdpMetrics, true);
  assert.deepEqual(Object.keys(aaRes.metrics.scroll), ['fps', 'gt20', 'gt34', 'gt50', 'gt100', 'max', 'p95', 'loafMs', 'loafScriptMs', 'forcedLayoutMs', 'cdpScriptMs', 'cdpStyleMs', 'cdpLayoutMs', 'cdpStyleCount', 'cdpLayoutCount', 'cdpTaskMs']);
  assert.deepEqual(Object.keys(aaRes.metrics.morph), ['fps', 'gt50', 'loafMs', 'forcedLayoutMs', 'cdpScriptMs', 'cdpStyleMs', 'cdpLayoutMs', 'cdpStyleCount', 'cdpLayoutCount', 'cdpTaskMs']);
  assert.deepEqual([aaRes.metrics.scroll.cdpStyleCount.baseline.median, aaRes.metrics.scroll.cdpLayoutMs.name, aaRes.metrics.morph.cdpScriptMs.patched.median], [5, 'layout ms (CDP)', 50]);
  assert.match(aaRes.markdown, /^\| scroll: style recalc ms \(CDP\) \| 20 \[20-20\] \| 20 \[20-20\] \| 0 \(0%\) \| CONTAMINATED \(host\): n=1/m);
  // I-032 review N3: the note names the traced phases; other trace-phase sets or tool versions don't compare either
  assert.match(aaRes.markdown, /^traced \(--trace-frames, phases scroll\): tracing perturbs timing; .*nor with traced A\/Bs of another trace-phase set or tool version/m);
  assert.doesNotMatch(aaRes.markdown, /\| idle:/);
  assert.equal(aaRes.metrics.scroll.fps.baseline.median, 50);
  // contaminated: every verdict carries the prefix, the summary names the runs and the reason
  assert.deepEqual([aaRes.host.contaminated, aaRes.host.contaminatedRuns, aaRes.host.runsTotal], [true, 2, 2]);
  assert.deepEqual(aaRes.host.invalidRuns, [{ label: 'base', run: 0, reasons: ['load1 12 > 10 at run start'] }, { label: 'base2', run: 0, reasons: ['load1 12 > 10 at run start'] }]);
  for (const ms of Object.values(aaRes.metrics)) for (const x of Object.values(ms)) assert.equal(x.verdict, 'CONTAMINATED (host): n=1 (need >=3 runs for a verdict)');
  assert.match(aaRes.markdown, /^\| scroll: fps \| 50 \[50-50\] \| 50 \[50-50\] \| 0 \(0%\) \| CONTAMINATED \(host\): n=1/m);
  assert.match(aaRes.markdown, /^\*\*host: 2 of 2 runs contaminated \(load1 12 > 10 at run start\); verdicts provisional\*\* \(load1 12-12, other CPU max 0 %\)/m);
  assert.match(aa.stdout, /^\*\*host: 2 of 2 runs contaminated/m);
  // no lock left behind
  assert.equal(existsSync(join(repo.root, 'state', 'locks', 'chrome-measure.json')), false);

  // a traced A/B (I-018 review): results-trace.json; the deliverable results.json stays as it was
  const deliverable = readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results.json'), 'utf8');
  // ... and the display slept between its arms (T8+, I-033): hostPower readings 1-2 recheck, 3-4 base run, 5-6 recheck,
  // 7-8 fix run; display off + DarkWake from reading 5 on
  // (I-032: --trace-phases is a valued option passed through, not the topic)
  const tr = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'fast-nav', '--runs', '1', '--idle', '0', '--no-screens', '--trace-frames', '--trace-phases', 'scroll,morph'], { cwd: repo.wt, env: { ...envB, FAKE_CHROME_LOG: join(repo.root, 'ab-trace.jsonl'), FAKE_HOST_DARKWAKE_AFTER: '4' } });
  assert.equal(tr.code, 0, tr.out);
  assert.equal(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results.json'), 'utf8'), deliverable, 'results.json untouched');
  const trRes = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results-trace.json'), 'utf8'));
  assert.deepEqual(trRes.config.measurement.traceFrames, true);
  assert.deepEqual(Object.keys(trRes.metrics), ['scroll', 'morph', 'trace', 'traceMorph']);
  assert.deepEqual(trRes.config.measurement.tracePhases, ['scroll', 'morph']);
  assert.match(tr.stdout, /^wrote fixes\/fast-nav\/results-trace\.json/m);
  assert.equal(trRes.host.hostState.tag, 'HOST-DISPLAY-CHANGED');
  assert.deepEqual(trRes.host.hostState.reasons, ['the arms differ: base display on, FullWake vs fix display off, DarkWake']);
  assert.equal(trRes.host.contaminated, false, 'a display change is its own tag, not host contamination');
  for (const ms of Object.values(trRes.metrics)) for (const x of Object.values(ms)) assert.equal(x.verdict, 'HOST-DISPLAY-CHANGED: n=1 (need >=3 runs for a verdict)');
  assert.match(trRes.markdown, /^\| scroll: fps \| 50 \[50-50\] \| 50 \[50-50\] \| 0 \(0%\) \| HOST-DISPLAY-CHANGED: n=1/m);
  assert.match(trRes.markdown, /^\*\*HOST-DISPLAY-CHANGED: the display or wake state was not the same throughout \(the arms differ: base display on, FullWake vs fix display off, DarkWake\); verdicts not comparable\*\* \(host state: display on\/off, FullWake\/DarkWake, power AC, display-sleep assertion yes; research\/host-display-state\)$/m);
  assert.match(tr.stdout, /^\*\*HOST-DISPLAY-CHANGED: /m);

  // a --paint-rects A/B (I-032): passed through, paint rows per phase, results-paint.json; results.json untouched
  const pr = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'fast-nav', '--runs', '1', '--idle', '1', '--no-screens', '--paint-rects'], { cwd: repo.wt, env: { ...envB, FAKE_CHROME_LOG: join(repo.root, 'ab-paint.jsonl') } });
  assert.equal(pr.code, 0, pr.out);
  assert.equal(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results.json'), 'utf8'), deliverable, 'results.json untouched');
  const prRes = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results-paint.json'), 'utf8'));
  assert.equal(prRes.config.measurement.paintRects, true);
  assert.deepEqual(Object.keys(prRes.metrics), ['scroll', 'morph', 'idle', 'paintIdle', 'paintScroll', 'paintMorph']);
  assert.deepEqual([prRes.metrics.paintScroll.mpx.baseline.median, prRes.metrics.paintScroll.layerMpx.baseline.median, prRes.metrics.paintScroll.layerChurn.patched.median, prRes.metrics.paintScroll.layersMax.patched.median], [1.9, 1.9, 1, 4]);
  assert.match(prRes.markdown, /^paint-rects \(--paint-rects\): .*compare this A\/B's numbers only with other --paint-rects runs at the same layerScale/m);
  assert.match(pr.stdout, /^wrote fixes\/fast-nav\/results-paint\.json/m);
  // I-032 review B1: the unit and each arm's layer scale are recorded with the numbers; the rows say "layer Mpx"
  assert.deepEqual(prRes.config.paintLayerScale, { units: 'layer px', baseline: [2], patched: [2], mixed: false });
  assert.deepEqual([prRes.config.measurement.paintUnits, prRes.config.measurement.paintLayerScales], ['layer px', [2]]);
  assert.match(prRes.markdown, /Units: layer Mpx, layer px = CSS px x layerScale .*: baseline 2, patched 2\./);
  assert.match(prRes.markdown, /^\| paintScroll: painted layer Mpx \(sum of dirty clips\) \|/m);
  assert.doesNotMatch(prRes.markdown, /PAINT-SCALE-MIXED/);
  for (const x of Object.values(prRes.metrics.paintScroll)) assert.doesNotMatch(x.verdict, /PAINT-SCALE-MIXED/);

  // arms at different layer scales (a DSF 2 built-in vs a DSF 1 external display): the paint verdicts are tagged, the rest not
  const pm = await nodeAsync(join(repo.wt, 'tools', 'fix.mjs'), ['ab', 'fast-nav', '--runs', '1', '--idle', '1', '--no-screens', '--paint-rects'], { cwd: repo.wt, env: { ...envB, FAKE_CHROME_LOG: join(repo.root, 'ab-paint-mixed.jsonl'), FAKE_CHROME_LAYER_SCALE: '2,1' } });
  assert.equal(pm.code, 0, pm.out);
  const pmRes = JSON.parse(readFileSync(join(repo.wt, 'fixes', 'fast-nav', 'results-paint.json'), 'utf8'));
  assert.equal(pmRes.config.paintLayerScale.mixed, true);
  assert.deepEqual([...pmRes.config.paintLayerScale.baseline, ...pmRes.config.paintLayerScale.patched].sort(), [1, 2]);
  assert.deepEqual([pmRes.config.measurement.paintLayerScales, pmRes.config.measurement.paintLayerScaleMixed], [[1, 2], true]);
  for (const [phase, ms] of Object.entries(pmRes.metrics)) for (const x of Object.values(ms)) {
    if (phase.startsWith('paint')) assert.match(x.verdict, /^PAINT-SCALE-MIXED: /, phase);
    else assert.doesNotMatch(x.verdict, /PAINT-SCALE-MIXED/, phase);
  }
  assert.match(pmRes.markdown, /^\*\*PAINT-SCALE-MIXED: the runs' layer scales differ \(baseline \d, patched \d\); the paint rows are not comparable\*\*$/m);
  assert.match(pm.stdout, /PAINT-SCALE-MIXED: the runs' layer scales differ \(1, 2\)/);
});

test('SIGTERM on ab: no server, verify.mjs or browser left running, lock released', async () => {
  // the fake Chrome never answers the throttle command, so ab is mid-run when the signal comes (I-027: a
  // fake run no longer spends seconds in sleeps, so it could end before the SIGTERM)
  const env = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state-kill'), FAKE_CHROME_LOG: join(repo.root, 'kill.jsonl'), FAKE_CHROME_HANG_AT: 'Emulation.setCPUThrottlingRate' };
  const p = await startProc(process.execPath, [join(repo.wt, 'tools', 'fix.mjs'), 'ab', 'fast-nav', '--runs', '1', '--no-screens'], { cwd: repo.wt, env, ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 30000 });
  const chromePid = (await chromeStarted(env.FAKE_CHROME_LOG)).pid;
  const lockFile = join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json');
  const verifyPid = JSON.parse(readFileSync(lockFile, 'utf8')).pid;
  const stamp = readdirSync(join(repo.wt, 'out', 'ab', 'fast-nav')).sort().pop();
  const serverPids = ['serve-base.json', 'serve-fix.json'].map((f) => JSON.parse(readFileSync(join(repo.wt, 'out', 'ab', 'fast-nav', stamp, f), 'utf8')).pid);
  await p.stop('SIGTERM');
  const pids = { verify: verifyPid, chrome: chromePid, base: serverPids[0], fix: serverPids[1] };
  const survivors = await survivorsAfterTeardown(pids);
  for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  assert.deepEqual(survivors, [], `still running after SIGTERM: ${survivors.join(', ')}`);
  assert.equal(existsSync(lockFile), false, 'lock released');
});

test('two SIGTERMs on ab, the second during its exit: ab still exits via its handler and leaves nothing running (incident I-009)', async () => {
  const env = { CHROME: FAKE, FW_STATE_DIR: join(repo.root, 'state-kill2'), FAKE_CHROME_LOG: join(repo.root, 'kill2.jsonl'), SLOW_EXIT_DIR: tempDir('fw-2sig-'), FAKE_CHROME_HANG_AT: 'Emulation.setCPUThrottlingRate' };
  const p = await startProc(process.execPath, ['--import', SLOW_EXIT, join(repo.wt, 'tools', 'fix.mjs'), 'ab', 'fast-nav', '--runs', '1', '--no-screens'], { cwd: repo.wt, env, ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 30000 });
  const chromePid = (await chromeStarted(env.FAKE_CHROME_LOG)).pid;
  const lockFile = join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json');
  const verifyPid = JSON.parse(readFileSync(lockFile, 'utf8')).pid;
  const stamp = readdirSync(join(repo.wt, 'out', 'ab', 'fast-nav')).sort().pop();
  const serverPids = ['serve-base.json', 'serve-fix.json'].map((f) => JSON.parse(readFileSync(join(repo.wt, 'out', 'ab', 'fast-nav', stamp, f), 'utf8')).pid);
  assert.deepEqual(await signalTwiceDuringExit(p.proc, env.SLOW_EXIT_DIR), { code: 130, signal: null }, 'fix.mjs exited via its handler, not killed by the second SIGTERM');
  const pids = { verify: verifyPid, chrome: chromePid, base: serverPids[0], fix: serverPids[1] };
  const survivors = await survivorsAfterTeardown(pids);
  for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  assert.deepEqual(survivors, [], `still running after SIGTERM: ${survivors.join(', ')}`);
  assert.equal(existsSync(lockFile), false, 'lock released');
});

test('SIGTERM on ab while `ps` hangs (I-236, the loaded host): verify\'s killTree times its ps out and still kills Chrome; all gone within the teardown bound', async () => {
  // a `ps` first on PATH that hangs once the test arms it (only for the teardown: the run itself reads ps normally),
  // so killTree's ps runs into its 3000 ms timeout: the slowest teardown the tool allows
  const bin = tempDir('fw-slowps-'), mark = join(bin, 'armed');
  writeFileSync(join(bin, 'ps'), `#!/bin/sh\nif [ -f "${mark}" ]; then exec sleep 30; fi\nexec /bin/ps "$@"\n`);
  chmodSync(join(bin, 'ps'), 0o755);
  const env = { CHROME: FAKE, PATH: `${bin}:${process.env.PATH}`, FW_STATE_DIR: join(repo.root, 'state-kill3'), FAKE_CHROME_LOG: join(repo.root, 'kill3.jsonl'), FAKE_CHROME_HANG_AT: 'Emulation.setCPUThrottlingRate' };
  const p = await startProc(process.execPath, [join(repo.wt, 'tools', 'fix.mjs'), 'ab', 'fast-nav', '--runs', '1', '--no-screens'], { cwd: repo.wt, env, ready: (s) => /\[mobile run 1\/1\]/.test(s), timeout: 30000 });
  const chromePid = (await chromeStarted(env.FAKE_CHROME_LOG)).pid;
  const lockFile = join(env.FW_STATE_DIR, 'locks', 'chrome-measure.json');
  const verifyPid = JSON.parse(readFileSync(lockFile, 'utf8')).pid;
  writeFileSync(mark, '1');
  const t0 = Date.now();
  await p.stop('SIGTERM');
  const pids = { verify: verifyPid, chrome: chromePid };
  const survivors = await survivorsAfterTeardown(pids);
  const ms = Date.now() - t0;
  for (const pid of Object.values(pids)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  rmSync(mark, { force: true });
  assert.deepEqual(survivors, [], `still running ${ms} ms after SIGTERM with a hanging ps: ${survivors.join(', ')}`);
  assert.ok(ms >= KILLTREE_PS_TIMEOUT_MS - 500, `the teardown really waited on the hanging ps (${ms} ms)`);
  assert.equal(existsSync(lockFile), false, 'lock released');
});
