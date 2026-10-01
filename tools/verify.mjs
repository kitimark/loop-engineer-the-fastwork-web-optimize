#!/usr/bin/env node
// Compare scroll jank of the live site vs. the local mirror in a dedicated Chrome (CDP, no deps).
//
//   node tools/verify.mjs live=https://fastwork.com/ block=http://localhost:5173/ local=http://localhost:5174/
//        [--viewport desktop|mobile|both] [--cpu 4] [--runs 3] [--out out/verify] [--no-screens]
//        [--port 0] [--profile out/chrome-verify-profile] [--result file.json] [--owner name] [--no-lock]
//        [--idle 6]
//
// Parallel worktrees: the DevTools port defaults to 0 (Chrome picks a free one) and the profile dir
// is under this checkout's out/, so runs from different worktrees never collide. Every run takes the
// cross-worktree "chrome-measure" lock (tools/lib/lock.mjs, FIFO) before launching Chrome, so only one
// throttled measurement uses the Mac's CPU at a time; --no-lock skips that (don't, when agents run).
// With several targets, the order alternates per run (A B, B A, A B, ...) so drift hits all equally.
//
// For every target and run: fresh isolated browser context (cold cache), load, settle, then with
// CPU throttling a rAF frame logger + PerformanceObserver('long-animation-frame') record first for
// --idle seconds (default 6, i.e. two ticks of the page's 3 s carousel interval) at the top of the
// page without any input ("idle" phase: timers, rAF loops and animations that run while nobody
// scrolls; --idle 0 skips it), then while the page is smooth-scrolled with window.scrollBy({top:250,behavior:'smooth'}) every 300 ms to the
// bottom ("scroll" phase), and then pushed past the end with wheel / touch gestures ("morph" phase,
// the scroll-jacked header morph). Screenshots at top/middle/bottom are compared pixel-wise.
// No Tracing is used by default (in-page LoAF attribution only).
//
// Per-frame attribution (incident I-018), all opt-in: without these flags a run sends exactly the CDP
// commands it sent before I-018 (tests/e2e/verify-fake.test.mjs golden sequence).
//   [--cdp-metrics]   CDP Performance.getMetrics, enabled once per page and read at each phase boundary
//                     (outside the in-page recording window); each phase summary gets the deltas cdpScriptMs,
//                     cdpStyleMs, cdpLayoutMs, cdpTaskMs, cdpStyleCount, cdpLayoutCount (and cdpV8CompileMs,
//                     cdpDevToolsMs). Opt-in until an interleaved A/A shows it costs nothing.
//   [--trace-frames]  a devtools.timeline trace over the scroll phase attributes every frame > 20 ms of the
//                     phase's own window to script / style / layout / paint / other main-thread time and
//                     offMain (compositor / raster / GPU / vsync: GPU is not separated), plus the elements its
//                     style recalcs touched, and counts frames > 34 / > 50 ms per class (lib/trace-frames.mjs):
//                     run.traceFrames, run.traceSummary. Records dataLossOccurred and marks a trace `partial`
//                     when it ends before the last frame; a trace that never completes (--trace-timeout s,
//                     default 180) is run.traceFrames.error, the run goes on.
//                     TRACING PERTURBS TIMING: frame numbers of a traced run are not comparable with untraced.
//   [--frame-log]     opt-in (E5): run.frameLog.<phase> = [[t, dt, scrollY], ...] for every frame, for
//                     tools/frames.mjs (long-frame clusters by scroll position). Reads scrollY in the rAF
//                     callback, which can force a style/layout if the page dirtied it: opt-in for that reason.
//
// Render-side signals (incident I-032, protocol v2 T6 + T7), all opt-in: without these flags a run sends exactly
// the CDP commands it sent before (the golden sequence); with --trace-frames alone it differs from before I-032
// only in one more trace category (disabled-by-default-devtools.timeline.frame, the Frames track).
//   --trace-frames now also gives: presentation (DroppedFrame without / with hasPartialUpdate, BeginFrame, DrawFrame,
//                     and rAF gap bands x presentation, lib/trace-frames.mjs), layerMs (Layerize / UpdateLayer(Tree) /
//                     CompositeLayers / Commit: a sub-split of paintMs, which keeps its meaning) and Paint event counts.
//   [--trace-phases idle,scroll,morph]  which phases --trace-frames traces, one trace each (default: scroll, as
//                     before). Others: run.tracePhases.<phase>, run.traceIdleSummary / traceMorphSummary.
//   [--save-trace]    with --trace-frames: write each trace as {traceEvents: [...]} to <out>/trace-<viewport>-<label>-
//                     run<n>-<phase>.json (opens in the DevTools Performance panel), after the run's page is closed
//                     (no timing effect); run.traceFiles.
//   [--paint-rects]   CDP LayerTree in every phase (lib/paint-rects.mjs), per frame: paints, layer count, added /
//                     removed layers; per layer: paint counts, node and compositing reasons of the top layers.
//                     Source (paintRects.source): LayerTree.layerPainted where Chrome sends it (then mpx = sum of
//                     dirty clips, never a union; never the trace Paint clip), else the layer lists' paintCount rises
//                     (Chrome 148+ sends none, Chromium 1bf9d9eb378c: no clip area, mpx null). Both: layerMpx = full size of the
//                     painted layers (upper bound) and layerVpMpx = the same capped to the viewport (position-free),
//                     in layer px = CSS px x the host display's DSF, not the emulated DPR (the compositor keeps the
//                     real DSF under emulation; paintRects.units, .layerScale). run.paintRects, run.paint<Phase>Summary. Adds main-thread
//                     work (the layer list on every paint + a per-frame binding call): compare only with other
//                     --paint-rects runs, never a gain A/B. No paint data at all is reported as such (status).
//   longFrames        with --frame-log, --trace-frames or --paint-rects (the sources with frame timestamps):
//                     run.longFrames.<phase> = every frame > 34 ms with ticks, scrollY (--frame-log only), trace class,
//                     top LoAF script, paint area / top layer and layer delta (lib/frame-tags.mjs).
//
// Host state (incident I-017, postmortem 2026-09-30 (d); rules in tools/lib/host.mjs):
//   [--max-wait 60] [--max-load 6] [--max-busy 25]
// Before each run (each target of each run) verify waits, still holding the lock, until the host is
// quiet (host CPU <= --max-busy % over a 10 s window, load1 <= --max-load, memory pressure normal) or
// --max-wait seconds have passed (0 = no recheck); then it runs anyway and records that. Every run gets
// `host`: load1 at start/end, free memory, the recheck, the lock's admission gate (from the holder
// record), and per phase (idle, scroll, morph) host CPU busy/sys % from os.cpus() tick deltas, the
// measured Chrome's CPU (its process tree, ps, read outside the timed window), other CPU = busy - Chrome,
// max memory pressure and decompressions/s. `host.loadInvalid` (contaminated) when load1 at start > 10,
// other CPU in the scroll phase > 25 %, memory pressure >= warn, or the lock was granted by the gate's
// timeout; `host.loadWarn` at load1 > 6 or other CPU > 20 %.
// Who the other CPU is (I-031, log only: no effect on the recheck, the flags or any verdict):
// `host.topProcs` and `host.recheck.topProcs` = {windowSec, top: [{pid, command, cpuPct}]}, the 5 busiest
// processes outside the measured Chrome tree over the run (page open to report) and over the recheck, from
// ps CPU-time deltas (% of one core, not ps's decayed %CPU). One ps (~20 ms) at each end, outside the phases.
// Sleep and hangs (incident I-023; the Mac's Maintenance Sleep, I-026): the recheck stops after --max-wait s
// of wall time, or one window after a host sleep; Chrome (launched before run 1's recheck) is pinged after
// every window, and one that exited or stopped answering is relaunched before the run (host.chromeRelaunched,
// a warning). [--chrome-warm 10]: no run starts sooner than that after its Chrome launched
// (host.chromeWarmedSec = the wait it took). host.sleptSec / host.woke: a sleep inside the run makes it
// contaminated. [--watchdog 300]: once the lock is held, a step with no progress for that many seconds
// (monotonic, plus the step's own budget) fails verify with a WATCHDOG error, which closes Chrome and frees
// the lock; 0 = off.
// Display, wake and power (T8+, incident I-033; U1: the plain baseline ran 63-78 fps with the display on, 92-94
// in DarkWake): `host.power = {start, end}` per run (read just outside the run's own snapshots) and
// `host.recheck.power = {start, end}`, each hostPower(): display 'on'|'off', fullWake (false = DarkWake),
// powerSource, displaySleepPrevented (a PreventUserIdleDisplaySleep assertion, e.g. caffeinate -d). `host.chrome`
// per run: the browser version (from /json/version) and sha256 of the profile's ChromeFeatureState and variations
// seed (U8). verify.json `host.hostState` (hostStateSummary): the distinct states over the runs and `tag`
// HOST-DISPLAY-CHANGED when display or wake differ within a run, between runs or between targets; fix.mjs ab
// prefixes its verdicts with it. `host.gate.sleptSec`: a host sleep in the lock's admission gate (a warning).
import { writeFileSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { launchChrome, CDP, gotoAndSettle, sleep } from './lib/cdp.mjs';
import { REPO, checkoutId } from './lib/paths.mjs';
import { requireBaseline, baselineStatus, baselineMeta, baselineTag } from './lib/baseline.mjs';
import { acquire } from './lib/lock.mjs';
import { loggerSource, RESET, COLLECT, COLLECT_AT } from './lib/perf-page.mjs';
import { TRACE_START, TRACE_ARM, TRACE_DISARM, BUCKETS, BUCKET_LABELS, attributeFrames } from './lib/trace-frames.mjs';
import { PAINT_BINDING, PAINT_ARM, PAINT_DISARM, PAINT_LAYER_SCALE, PAINT_NOTE, PAINT_UNITS, PAINT_SCALE_TAG, layerScales, streamItem, analyzePaints, topLayerIds, nodeLabel } from './lib/paint-rects.mjs';
import { longFrameTags } from './lib/frame-tags.mjs';
import { THRESHOLDS, snapshot, slept, waitQuiet, treeCpuSec, classifyRun, hostInfo, hostClock, stubOutsideTest, procsSnapshot, topProcs, hostPower, hostStateSummary, describeHostState, chromeProfileState } from './lib/host.mjs';

const ROOT = REPO;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
// ts-lock-share: verify.mjs measures timing and holds chrome-measure exclusively; only functional jobs share it
if (flag('shared')) { console.error('verify.mjs is a timing measurement and never runs in the shared lane (--shared): it takes an exclusive chrome-measure hold (inside a shared hold it is refused)'); process.exit(2); }
const targets = argv.filter((a) => /^[\w-]+=https?:\/\//.test(a)).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
if (!targets.length) { console.error('usage: node tools/verify.mjs live=https://fastwork.com/ local=http://localhost:5173/ [--viewport both] [--runs 3]'); process.exit(2); }
const CPU = Number(opt('cpu', 4));
const RUNS = Number(opt('runs', 1));
const VIEWPORTS = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true } };
const vpSel = opt('viewport', 'desktop');
const vpList = vpSel === 'both' ? ['desktop', 'mobile'] : [vpSel];
const OUT = resolve(ROOT, opt('out', 'out/verify'));
const SCREENS = !flag('no-screens');
const CDP_METRICS = flag('cdp-metrics'), TRACE = flag('trace-frames'), FRAME_LOG = flag('frame-log');
// Idle phase length in seconds, recorded after settle + throttle and before the scroll phase; 0 = off.
// The scroll and morph phases run exactly as without it, just IDLE seconds later. Default 6 s: the
// carousel ticks every 3 s, so a 5 s window caught 1 or 2 ticks and idle LoAF ms went bimodal.
const IDLE = Number(opt('idle', 6));
if (!Number.isFinite(IDLE) || IDLE < 0) { console.error(`--idle must be a number of seconds >= 0 (got "${opt('idle')}")`); process.exit(2); }
// recheck before each run (host.mjs quiet(); --max-load / --max-busy override its load1 / CPU limits)
const num = (n, d) => { const v = Number(opt(n, d)); if (!Number.isFinite(v) || v < 0) { console.error(`--${n} must be a number >= 0 (got "${opt(n)}")`); process.exit(2); } return v; };
const MAX_WAIT = num('max-wait', THRESHOLDS.recheckMaxWaitSec);
const QUIET = { ...THRESHOLDS, quietMaxLoad1: num('max-load', THRESHOLDS.quietMaxLoad1), quietMaxBusyPct: num('max-busy', THRESHOLDS.quietMaxBusyPct) };
const WATCHDOG = num('watchdog', THRESHOLDS.watchdogStallSec);
const CHROME_WARM = num('chrome-warm', THRESHOLDS.chromeWarmSec);
const TRACE_TIMEOUT = num('trace-timeout', 180);
// I-032 render-side signals (opt-in)
const PAINT = flag('paint-rects'), SAVE_TRACE = flag('save-trace');
const PHASES = ['idle', 'scroll', 'morph'];
const TRACE_PHASES = String(opt('trace-phases', 'scroll')).split(',').map((x) => x.trim()).filter(Boolean);
if (TRACE_PHASES.some((p) => !PHASES.includes(p)) || !TRACE_PHASES.length) { console.error(`--trace-phases: a comma list of ${PHASES.join(', ')} (got "${opt('trace-phases')}")`); process.exit(2); }
if (!TRACE && (SAVE_TRACE || opt('trace-phases') !== undefined)) { console.error('--save-trace and --trace-phases need --trace-frames'); process.exit(2); }
const traceOn = (ph) => TRACE && TRACE_PHASES.includes(ph);
// ts-headless: timing is measured headed only (headless renders at 60 Hz here, DSF 1, no presentation; F-091,
// research/architecture/headless-functional.md); a functional check in headless Chrome is tools/check.mjs
const HEADLESS_REFUSED = 'verify.mjs measures timing and runs headed only: for a functional check in headless Chrome use node tools/check.mjs (or node tools/fix.mjs check <topic>)';
if (flag('headless') || flag('functional')) { console.error(HEADLESS_REFUSED); process.exit(2); }
// --save-trace writes every trace: ~200-300 MB each on this page (I-032 review N4), so say how many before starting
if (SAVE_TRACE) console.log(`save-trace: ${RUNS * targets.length * vpList.length * TRACE_PHASES.length} trace file(s) (runs x targets x viewports x traced phases), ~200-300 MB each on this page, into ${OUT}`);
// Local targets serve the baseline: it must be the snapshot pinned by baseline.json, unchanged
// (tools/lib/baseline.mjs; exit 3 otherwise). A live-only run just records it. Metadata only.
// The check is repeated after every run (git status of the snapshot, between runs, no CDP): a run
// whose baseline was not, or stopped being, the pinned snapshot (a re-mirror mid-A/B) gets
// run.baseline = {snapshot, state, tag} and verify.json baseline.flaggedRuns; fix.mjs ab prefixes its
// verdicts with the tag. Unflagged runs carry no baseline field.
const LIVE = /^https?:\/\/([\w-]+\.)*fastwork\.com(:\d+)?(\/|$)/i;
const LOCAL = !targets.every((t) => LIVE.test(t.url));
const BASELINE = baselineMeta(LOCAL ? requireBaseline('verify.mjs') : baselineStatus());
let flaggedRuns = 0;
/** After a run of a local target: re-check the baseline; returns {snapshot, state, tag} when flagged, else null. */
function baselineAfterRun() {
  if (!LOCAL) return null;
  const now = baselineMeta(baselineStatus());
  const tag = baselineTag(BASELINE, now);
  return tag ? { ...now, tag } : null;
}
mkdirSync(OUT, { recursive: true });

// ---- watchdog (incident I-023) --------------------------------------------------------------------
// Every step of the measurement calls progress(step, extraSec). A step that makes no progress for
// --watchdog s (+ its own extra: the recheck's --max-wait, the scroll eval's 600 s timeout, --idle)
// fails verify with a clear error; the exit handlers then free the chrome-measure lock and kill Chrome.
// Armed only once the lock is held (armWatchdog() in main()): waiting in the queue is not a stall.
// Measured on the process's monotonic clock: a host sleep (I-026) stops it too, so a sleep is not a
// stall; a run with a sleep in it is flagged by the host record instead. --watchdog 0 = off.
const wd = { step: 'start', extraSec: 0, at: performance.now(), where: '' };
function progress(step, extraSec = 0) { wd.step = step; wd.extraSec = extraSec; wd.at = performance.now(); }
function armWatchdog() {
  if (!(WATCHDOG > 0)) return;
  progress('start');
  setInterval(() => {
    const idle = (performance.now() - wd.at) / 1000;
    if (idle <= WATCHDOG + wd.extraSec) return;
    console.error(`\nverify.mjs: WATCHDOG: no progress for ${Math.round(idle)} s in step "${wd.step}"${wd.where ? ` (${wd.where})` : ''} (limit ${WATCHDOG + wd.extraSec} s, --watchdog ${WATCHDOG}); aborting so Chrome is closed and the chrome-measure lock is freed (incident I-023)`);
    process.exit(1);
  }, Math.min(5000, Math.max(100, WATCHDOG * 250))).unref();
}

// ---- the browser: one Chrome, kept alive across the rechecks, relaunched when gone (I-023) ----------
// One Chrome serves all runs (each run gets a fresh isolated context), as before, launched before the
// first recheck so it has idled through at least one recheck window when run 1 starts (as since
// 77693c3). New: after every recheck window and before every run it must answer Browser.getVersion;
// if it exited or stopped answering, verify relaunches it and flags that run (host.chromeRelaunched;
// I-023 A/A: CDP closed during a 60 s recheck). A run never starts sooner than --chrome-warm s
// (default 10) after its Chrome launched (review-i023: a just-launched Chrome measures cold).
let browser = null, launches = 0;
const PROFILE = resolve(ROOT, opt('profile', 'out/chrome-verify-profile'));
/** host.chrome of a run (T8+, U8): the browser version and the profile's field-trial state (hashes; a file read). */
const chromeState = () => ({ version: browser?.ch.browser ?? null, ...chromeProfileState(PROFILE) });
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: no answer in ${ms} ms`)), ms).unref())]);
async function openChrome() {
  progress('chrome launch', 30); // launchChrome waits up to 15 s for the DevTools port
  const ch = await launchChrome({ port: Number(opt('port', 0)), profileDir: PROFILE });
  // ts-headless: a browser that runs headless anyway (a $CHROME wrapper adding --headless=new) measures no timing;
  // read from /json/version's User-Agent, before any CDP command
  if (ch.headless) { await ch.close(); console.error(`verify.mjs: Chrome runs headless (User-Agent ${ch.userAgent}): refused. ${HEADLESS_REFUSED}`); process.exit(2); }
  let exited = false;
  ch.proc.on('exit', () => { exited = true; });
  const cdp = await CDP.connect(ch.wsUrl);
  // allow the mirror's self-signed --https certificate (this dedicated Chrome only)
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
  launches++;
  browser = { ch, cdp, exited: () => exited, launchedAt: (await hostClock()).mono() };
}
async function chromeAlive() {
  if (!browser || browser.exited() || browser.cdp.closedError) return false;
  try { await withTimeout(browser.cdp.send('Browser.getVersion'), 10000, 'Browser.getVersion'); return true; } catch { return false; }
}
async function closeChrome() { const b = browser; browser = null; if (b) { b.cdp.close(); await b.ch.close(); } }
/** Chrome up and answering before a run; returns true when it had to be relaunched. */
async function ensureChrome() {
  if (browser && (await chromeAlive())) return false;
  const relaunch = !!browser;
  if (relaunch) { process.stdout.write('(Chrome exited or stopped answering: relaunching) '); await closeChrome(); }
  await openChrome();
  return relaunch;
}
/** Wait until the browser has been up --chrome-warm s (on the host clock; a stubbed host's in tests). */
async function warmChrome() {
  const c = await hostClock();
  const left = CHROME_WARM - (c.mono() - browser.launchedAt) / 1000;
  if (!(left > 0)) return 0;
  progress('chrome warm-up', CHROME_WARM);
  process.stdout.write(`(Chrome warm-up ${Math.round(left * 10) / 10} s) `);
  await c.sleep(left * 1000);
  return left;
}
/** The host recheck before a run (I-017), capped in wall time (I-023); pings Chrome after every window. */
async function recheckHost() {
  if (!(MAX_WAIT > 0)) return null;
  progress('host recheck', MAX_WAIT + 60);
  const power0 = await hostPower(); // T8+ (I-033): display / wake / power on each side of the recheck windows
  const procs0 = await procsSnapshot(); // I-031, log only: one ps (~20 ms) on each side of the recheck windows
  const w = await waitQuiet({ maxWaitSec: MAX_WAIT, thresholds: QUIET, onSample: async () => { progress('host recheck', MAX_WAIT + 60); if (browser) await chromeAlive(); } });
  const recheck = { quiet: w.quiet, waitedSec: w.waitedSec, windows: w.windows, reasons: w.reasons, sleptSec: w.sleptSec, suspended: w.suspended, last: w.last,
    topProcs: topProcs(procs0, await procsSnapshot(), { excludeRoot: browser?.ch.proc.pid }) };
  recheck.power = { start: power0, end: await hostPower() };
  if (w.suspended) process.stdout.write(`(the host slept ${w.sleptSec} s during the recheck; measuring now) `);
  else if (!w.quiet) process.stdout.write(`(host not quiet after ${w.waitedSec} s: ${w.reasons.join(', ')}; measuring anyway) `);
  else if (w.windows > 1) process.stdout.write(`(waited ${w.waitedSec} s for a quiet host) `);
  return recheck;
}

// ---- the clock of the measurement's own waits (incident I-027) --------------------------------------
// Settle, the idle window, the morph tail and the screenshot pauses wait on T. A real host: Date.now +
// setTimeout, exactly as before. A stubbed host ($FW_TEST_HOST, tests only; every result records it as
// host.stub): the stub's fake clock, so a fake-Chrome run costs no wall time. There is no other switch.
// A stub outside a test with a real Chrome is refused (main(), host.mjs stubOutsideTest, review-i027).
let T = { now: () => Date.now(), sleep };
async function useHostClock() { const c = await hostClock(); if (c.stub) T = { now: () => c.mono(), sleep: (ms) => c.sleep(ms) }; }

// ---- host record per phase (tools/lib/host.mjs) ---------------------------------------------------
// start: Chrome's tree CPU (ps) first, then the tick snapshot; end: ticks first, then ps. So the ps and
// sysctl/vm_stat spawns stay outside the tick window, and the Chrome window covers the tick window.
async function hostStart(chromePid) { const chrome = await treeCpuSec(chromePid); return { chrome, snap: await snapshot() }; }
async function hostEnd(start, chromePid) {
  const snap = await snapshot(), chrome = await treeCpuSec(chromePid);
  const a = start.snap, b = snap, dt = b.ticks.total - a.ticks.total, sec = (b.at - a.at) / 1000;
  const pct = (x) => (dt > 0 ? Math.round((1000 * x) / dt) / 10 : null); // x in ms of CPU time -> % of all CPUs
  const busyPct = pct(b.ticks.busy - a.ticks.busy);
  const chromeCpuPct = start.chrome != null && chrome != null ? pct((chrome - start.chrome) * 1000) : null;
  const pr = [a.pressure, b.pressure].filter((x) => x != null);
  return {
    windowSec: Math.round(sec * 10) / 10, busyPct, sysPct: pct(b.ticks.sys - a.ticks.sys), chromeCpuPct,
    otherBusyPct: busyPct == null ? null : chromeCpuPct == null ? busyPct : Math.round(Math.max(0, busyPct - chromeCpuPct) * 10) / 10,
    otherSource: chromeCpuPct == null ? 'host (Chrome CPU unknown)' : 'host - Chrome tree',
    load1Start: a.load1, load1End: b.load1, pressureMax: pr.length ? Math.max(...pr) : null,
    decompPerSec: a.decompressions != null && b.decompressions != null && sec > 0 ? Math.round((b.decompressions - a.decompressions) / sec) : null,
  };
}

// ---- CDP Performance.getMetrics per phase (I-018) ---------------------------------------------------
const CDP_KEYS = [['ScriptDuration', 'cdpScriptMs', 1000], ['RecalcStyleDuration', 'cdpStyleMs', 1000], ['LayoutDuration', 'cdpLayoutMs', 1000], ['TaskDuration', 'cdpTaskMs', 1000],
  ['RecalcStyleCount', 'cdpStyleCount', 1], ['LayoutCount', 'cdpLayoutCount', 1], ['V8CompileDuration', 'cdpV8CompileMs', 1000], ['DevToolsCommandDuration', 'cdpDevToolsMs', 1000]];
async function cdpMetrics(page) {
  if (!CDP_METRICS) return null;
  const { metrics } = await page.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}
function cdpDelta(a, b) {
  if (!a || !b) return {};
  const out = {};
  for (const [k, name, f] of CDP_KEYS) if (typeof a[k] === 'number' && typeof b[k] === 'number') out[name] = Math.round((b[k] - a[k]) * f * 10) / 10;
  return out;
}
// the trace of --trace-frames: page-session Tracing, events collected until tracingComplete; the buffer's
// fill level (Tracing.bufferUsage) and tracingComplete.dataLossOccurred are kept. A trace that does not
// complete within --trace-timeout s is an error of this run's traceFrames, not of the run.
async function traceStart(page) {
  const tr = { events: [], bufferPercentMax: null };
  tr.off = page.on((m) => {
    if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) tr.events.push(e); // no spread: a large chunk would overflow the argument limit (RangeError)
    if (m.method === 'Tracing.bufferUsage' && typeof m.params.percentFull === 'number') tr.bufferPercentMax = Math.max(tr.bufferPercentMax ?? 0, Math.round(m.params.percentFull * 1000) / 10);
  });
  await page.send('Tracing.start', TRACE_START);
  return tr;
}
async function traceEnd(page, tr) {
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', TRACE_TIMEOUT * 1000);
  await page.send('Tracing.end');
  try { const c = await done; return { events: tr.events, dataLossOccurred: c.params?.dataLossOccurred ?? null, bufferPercentMax: tr.bufferPercentMax }; }
  catch { return { events: tr.events, error: `Tracing.tracingComplete not received within ${TRACE_TIMEOUT} s (--trace-timeout; ${tr.events.length} events so far)`, bufferPercentMax: tr.bufferPercentMax }; }
  finally { tr.off(); }
}

// ---- page side: LOGGER (injected before any page script), RESET / COLLECT per phase: lib/perf-page.mjs

const SCROLL = `new Promise((res) => {
  const t0 = performance.now(); let still = 0, ticks = 0;
  const id = setInterval(() => {
    const y = scrollY; ticks++;
    window.scrollBy({ top: 250, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollY === y) still++; else still = 0;
      if (still >= 4 || ticks > 400) { clearInterval(id); res({ ms: performance.now() - t0, ticks, y: scrollY, h: document.documentElement.scrollHeight }); }
    }, 280);
  }, 300);
})`;

function pct(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
const r1 = (x) => Math.round(x * 10) / 10;
function stripOrigin(u) { try { const x = new URL(u); return (x.host.includes('fastwork') || x.hostname === 'localhost' || /^\d+\./.test(x.hostname) ? '' : x.host) + x.pathname.replace(/^\/__vendor\/([^/]+)/, '$1'); } catch { return u || '(none)'; } }

function summarize(perf) {
  const f = perf.frames;
  const total = f.reduce((a, b) => a + b, 0);
  const loaf = perf.loaf;
  const scripts = new Map();
  let forced = 0;
  for (const e of loaf) for (const s of e.scripts) {
    forced += s.forced || 0;
    const key = `${stripOrigin(s.url)}:${s.pos} ${s.fn || ''} [${s.type}${s.invoker ? ' ' + String(s.invoker).slice(0, 40) : ''}]`;
    const v = scripts.get(key) || { key, dur: 0, forced: 0, n: 0 };
    v.dur += s.dur; v.forced += s.forced || 0; v.n++;
    scripts.set(key, v);
  }
  const byFile = new Map();
  for (const e of loaf) for (const s of e.scripts) { const k = stripOrigin(s.url); byFile.set(k, (byFile.get(k) || 0) + s.dur); }
  return {
    frames: f.length,
    seconds: r1(total / 1000),
    fps: r1(f.length / (total / 1000 || 1)),
    p50: r1(pct(f, 50)), p95: r1(pct(f, 95)), max: r1(Math.max(0, ...f)),
    gt20: f.filter((x) => x > 20).length, gt33: f.filter((x) => x > 33.4).length, gt34: f.filter((x) => x > 34).length,
    gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length,
    droppedPct: r1((100 * f.filter((x) => x > 20).length) / (f.length || 1)),
    loafCount: loaf.length,
    loafMs: Math.round(loaf.reduce((a, e) => a + e.duration, 0)),
    loafBlockingMs: Math.round(loaf.reduce((a, e) => a + e.blocking, 0)),
    loafRenderMs: Math.round(loaf.reduce((a, e) => a + e.render, 0)),
    loafScriptMs: Math.round(loaf.reduce((a, e) => a + e.scripts.reduce((b, s) => b + s.dur, 0), 0)),
    forcedLayoutMs: Math.round(forced),
    topScripts: [...scripts.values()].sort((a, b) => b.dur - a.dur).slice(0, 8).map((v) => ({ ...v, dur: Math.round(v.dur), forced: Math.round(v.forced) })),
    byFile: Object.fromEntries([...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, Math.round(v)])),
    noLoaf: perf.noLoaf,
  };
}

/** The numbers of a run's trace that fix.mjs ab compares (its "trace" rows); null when the trace failed. */
function traceSummary(tf) {
  const s = tf?.summary; // null: this phase was not traced (--trace-phases without scroll)
  if (!s) return null;
  return { frames: s.frames, ...Object.fromEntries(BUCKETS.map((k) => [k + 'Ms', s[k + 'Ms']])), gt34: s.gt34.frames, gt50: s.gt50.frames, styleElements: s.styleElements,
    gt34ByClass: s.gt34.dominant, gt50ByClass: s.gt50.dominant, partial: s.partial,
    // I-032: the layer sub-split of paintMs (not an extra bucket), Paint events, the Frames track's DroppedFrame events
    // over the phase window (droppedFrames: not presented; partialFrames: presented with a partial update)
    layerMs: s.layerMs, paintEvents: s.paintEvents, droppedFrames: s.presentation?.dropped ?? null, partialFrames: s.presentation?.partial ?? null };
}
/** The numbers of a run's --paint-rects phase that fix.mjs ab compares (paint<Phase>Summary). */
function paintSummary(s, layerScale) {
  if (!s) return null;
  // layerScale: the areas' unit (layer px = CSS px x layerScale, I-032 review B1); not a compared metric
  return { layerScale, frames: s.frames, framesWithPaint: s.framesWithPaint, paints: s.paints, newLayerPaints: s.newLayerPaints, mpx: s.mpx, frameMpxMax: s.frameMpxMax, frameMpxP50: s.frameMpxP50,
    layerMpx: s.layerMpx, frameLayerMpxMax: s.frameLayerMpxMax, frameLayerMpxP50: s.frameLayerMpxP50, layerVpMpx: s.layerVpMpx, frameLayerVpMpxMax: s.frameLayerVpMpxMax,
    layersMax: s.layerCount?.max ?? null, layersAdded: s.layersAdded, layersRemoved: s.layersRemoved, layerChurn: s.layerChurn, layersPainted: s.layersPainted, layerTreeChanges: s.layerTreeChanges };
}
/** LoAF script key for long-frame tags: the topScripts key without the invoker part. */
const loafScriptKey = (s) => `${stripOrigin(s.url)}:${s.pos} ${s.fn || ''}`.trim();
/** --save-trace: one trace as {traceEvents, metadata} (the DevTools Performance panel's format), written in chunks. */
function writeTrace(file, events, metadata) {
  const fd = openSync(file, 'w');
  try {
    writeSync(fd, '{"traceEvents":[\n');
    for (let i = 0; i < events.length; i += 5000) writeSync(fd, (i ? ',\n' : '') + events.slice(i, i + 5000).map((e) => JSON.stringify(e)).join(',\n'));
    writeSync(fd, `\n],"metadata":${JSON.stringify(metadata)}}\n`);
  } finally { closeSync(fd); }
  return file;
}
const byClass = (d) => BUCKETS.filter((k) => d[k]).map((k) => `${k} ${d[k]}`).join(', ') || '-';

async function measure(cdp, t, vpName, run, { chromePid, gate, recheck = null, chromeRelaunched = false, warmedSec = 0, chrome = null } = {}) {
  const vp = VIEWPORTS[vpName];
  const hostPhases = {};
  const powerStart = await hostPower(); // T8+ (I-033): before the run's first snapshot, outside every window
  const runStart = await snapshot();
  const procsStart = await procsSnapshot(); // I-031, log only: before the page opens, outside every phase window
  const loadBefore = runStart.load1;
  progress('open page');
  const page = await cdp.newIsolatedPage();
  const requests = [];
  const errors = [];
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent') requests.push({ id: m.params.requestId, url: m.params.request.url, type: m.params.type, method: m.params.request.method });
    if (m.method === 'Network.responseReceived') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.status = m.params.response.status; }
    if (m.method === 'Network.loadingFailed') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.failed = m.params.blockedReason || m.params.errorText; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.source}: ${m.params.entry.text.slice(0, 160)}`);
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  // --paint-rects: the compositor keeps the host's DSF under emulation, so read it before the override (layer px)
  const layerScale = PAINT ? await page.eval(PAINT_LAYER_SCALE) : null;
  await page.send('Emulation.setDeviceMetricsOverride', vp);
  if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (CDP_METRICS) await page.send('Performance.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: loggerSource({ frameLog: FRAME_LOG }) });
  await page.send('Page.bringToFront');
  progress('load + settle', 60);
  await gotoAndSettle(page, t.url, { quietMs: 2000, clock: T });
  progress('settle + throttle', 10);
  await T.sleep(1500);
  const state = await page.eval(`({
    kit: Object.keys(window).filter(k => k.startsWith('__sveltekit')),
    nav: document.querySelector('.start-selling-top-nav')?.className,
    hero: document.querySelector('.hero')?.className,
    h: document.documentElement.scrollHeight,
    shim: window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts.length } : null,
    vendors: { gtag: typeof gtag, amplitude: typeof amplitude, hj: typeof hj, dataLayer: (window.dataLayer||[]).length },
  })`);

  // --paint-rects (I-032): LayerTree events + a per-frame binding call, armed before the throttle, read after the phases
  let paintStream = null, offPaint = null;
  if (PAINT) {
    paintStream = [];
    offPaint = page.on((m) => { const it = streamItem(m); if (it) paintStream.push(it); });
    await page.send('Runtime.addBinding', { name: PAINT_BINDING });
    await page.send('LayerTree.enable');
    await page.eval(PAINT_ARM);
  }
  // --trace-frames: one trace per phase in --trace-phases (default scroll only, as before I-032)
  const traced = {}, traceOut = {}, traceEvents = {};
  const traceBegin = async (ph) => { if (traceOn(ph)) { const tr = await traceStart(page); traced[ph] = { tr, sync: await page.eval(TRACE_ARM) }; } };
  const traceFinish = async (ph, perf) => {
    const x = traced[ph];
    if (!x) return;
    if (ph !== 'scroll') progress(`${ph} trace`, TRACE_TIMEOUT);
    const d = await page.eval(TRACE_DISARM);
    const te = await traceEnd(page, x.tr);
    const window = { from: d.t0, to: d.lastOn }; // the logger's window: the phase's frames[] exactly (lib/trace-frames.mjs)
    const att = te.error ? { error: te.error } : attributeFrames(te.events, { frameTs: d.ts, syncStartTime: x.sync, window, dataLossOccurred: te.dataLossOccurred });
    if (SAVE_TRACE) traceEvents[ph] = te.events;
    traceOut[ph] = { ...att, events: te.events.length, dataLossOccurred: te.dataLossOccurred ?? null, bufferPercentMax: te.bufferPercentMax,
      // the trace's frames vs the logger's: equal unless the two rAF recorders saw different frames
      check: { loggerFrames: perf.frames.length, loggerGt20: perf.frames.filter((x) => x > 20).length, traceWindowFrames: att.summary?.windowFrames ?? null, traceGt20: att.summary?.frames ?? null },
      note: 'tracing perturbs timing: not comparable with untraced runs' };
  };

  await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await T.sleep(1000);
  // idle phase: same logger, no input, at the top of the page (before any scrolling)
  // phase boundaries: CDP metrics, then host (start); host, then CDP metrics (end); all outside RESET..COLLECT
  const cdpPhase = {};
  let idlePerf = null;
  if (IDLE > 0) {
    progress('idle phase', IDLE);
    await traceBegin('idle');
    const m = await cdpMetrics(page), h = await hostStart(chromePid);
    await page.eval(RESET);
    await T.sleep(IDLE * 1000);
    idlePerf = await page.eval(COLLECT_AT);
    hostPhases.idle = await hostEnd(h, chromePid);
    cdpPhase.idle = cdpDelta(m, await cdpMetrics(page));
    await traceFinish('idle', idlePerf);
  }
  progress('scroll phase', 600); // the scroll eval has its own 600 s timeout (covers the trace too)
  await traceBegin('scroll');
  let m = await cdpMetrics(page), h = await hostStart(chromePid);
  await page.eval(RESET);
  const scroll = await page.eval(SCROLL, { timeout: 600000 });
  await T.sleep(500);
  const scrollPerf = await page.eval(COLLECT);
  hostPhases.scroll = await hostEnd(h, chromePid);
  cdpPhase.scroll = cdpDelta(m, await cdpMetrics(page));
  await traceFinish('scroll', scrollPerf);
  const traceFrames = traceOut.scroll ?? null;

  // morph phase: push past the end (wheel on desktop, touch drag on mobile)
  progress('morph phase', 10); // wheel or touch gestures plus a 2 s settle
  if (traceOn('morph')) { await traceBegin('morph'); progress('morph phase', 10); }
  m = await cdpMetrics(page); h = await hostStart(chromePid);
  await page.eval(RESET);
  if (vp.mobile) {
    for (let i = 0; i < 4; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
  } else {
    for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 120 }); await T.sleep(100); }
  }
  await T.sleep(2000);
  const morphPerf = await page.eval(COLLECT);
  hostPhases.morph = await hostEnd(h, chromePid);
  cdpPhase.morph = cdpDelta(m, await cdpMetrics(page));
  await traceFinish('morph', morphPerf);
  const morphState = await page.eval(`document.querySelector('.start-selling-top-nav')?.className`);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // --paint-rects: stop the recorder, attribute the paints to the phases' frames, describe the top layers, disable
  let paintRects = null, paintAn = null;
  if (PAINT) {
    progress('paint-rects', 60);
    const pv = await page.eval(PAINT_DISARM); // {armed, w, h, dpr}: the viewport in CSS px, the emulated DPR
    offPaint();
    const dpr = typeof pv?.dpr === 'number' && pv.dpr > 0 ? pv.dpr : null;
    const ls = typeof layerScale === 'number' && layerScale > 0 ? layerScale : null; // layer px = CSS px x ls
    const vpPx = ls && pv?.w > 0 && pv?.h > 0 ? { w: Math.round(pv.w * ls), h: Math.round(pv.h * ls) } : null;
    paintAn = analyzePaints(paintStream, { idle: idlePerf?.t0 ?? null, scroll: scrollPerf.t0, morph: morphPerf.t0 }, vpPx);
    const layerNodes = {};
    for (const id of topLayerIds(paintAn.phases)) {
      const l = paintAn.layers.get(id);
      const node = l?.node != null ? await page.send('DOM.describeNode', { backendNodeId: l.node }).then((r) => nodeLabel(r.node)).catch(() => null) : null;
      const reasons = await page.send('LayerTree.compositingReasons', { layerId: id }).then((r) => r.compositingReasonIds || r.compositingReasons || []).catch(() => null);
      layerNodes[id] = { node, reasons };
    }
    await page.send('LayerTree.disable');
    await page.send('Runtime.removeBinding', { name: PAINT_BINDING });
    paintRects = {
      // source 'layerPainted' (clip areas) or 'paintCount' (no layerPainted, Chrome 148+: counts and layer sizes only, mpx null)
      status: paintAn.source ? 'ok' : 'enabled, 0 layerPainted events, no paintCount in the layer lists',
      source: paintAn.source, binding: paintAn.binding, intervals: paintAn.intervals, units: PAINT_UNITS, layerScale: ls, dpr, viewport: vpPx,
      layerPaintedEvents: paintAn.layerPaintedEvents, countedPaints: paintAn.countedPaints, bindingFrames: paintAn.bindingFrames, unassignedPaints: paintAn.unassignedPaints,
      phases: paintAn.phases, frames: paintAn.frames, layerNodes, note: PAINT_NOTE,
    };
  }

  progress('screenshots', 120);
  const shots = {};
  if (SCREENS && run === 0) {
    // Screenshots from a fresh load (unthrottled), walking down the page in small steps so the
    // scroll-linked effects see a normal scroll, *before* any morph gesture.
    await gotoAndSettle(page, t.url, { quietMs: 1500, clock: T });
    await T.sleep(1500);
    const maxY = await page.eval('document.documentElement.scrollHeight - innerHeight');
    for (const [name, y] of [['top', 0], ['middle', Math.round(maxY * 0.45)], ['bottom', maxY]]) {
      await page.eval(`new Promise(async (res) => { while (Math.abs(scrollY - ${y}) > 1) { const d = ${y} - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); if (scrollY + innerHeight >= document.documentElement.scrollHeight - 1 && d > 0) break; } res(); })`, { timeout: 60000 });
      await T.sleep(2500);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = join(OUT, `${vpName}-${t.label}-${name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      shots[name] = file;
    }
  }
  const shimStats = await page.eval('window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts, neutered: window.__mirrorVendorShim.neutered } : null');
  await page.close();

  // --save-trace: written after the page is closed (outside every phase)
  let traceFiles = null;
  if (SAVE_TRACE) {
    progress('save trace', 120);
    traceFiles = {};
    for (const [ph, evs] of Object.entries(traceEvents)) traceFiles[ph] = writeTrace(join(OUT, `trace-${vpName}-${t.label}-run${run + 1}-${ph}.json`), evs,
      { source: 'tools/verify.mjs --trace-frames --save-trace (incident I-032)', url: t.url, viewport: vpName, label: t.label, run: run + 1, phase: ph, cpu: CPU });
  }
  // per-frame tags of frames > 34 ms (lib/frame-tags.mjs): only from sources with frame timestamps
  let longFrames = null;
  if (FRAME_LOG || TRACE || PAINT) {
    const perfs = { idle: idlePerf, scroll: scrollPerf, morph: morphPerf };
    const layerNodes = Object.fromEntries(Object.entries(paintRects?.layerNodes || {}).map(([id, v]) => [id, v.node]));
    longFrames = {};
    for (const ph of PHASES) {
      if (!perfs[ph]) { longFrames[ph] = null; continue; }
      longFrames[ph] = longFrameTags({ frameLog: FRAME_LOG ? perfs[ph].log ?? null : null, trace: traceOut[ph]?.frames ?? null, paint: paintAn ? paintAn.tagFrames[ph] ?? null : null,
        loaf: perfs[ph].loaf, scriptKey: loafScriptKey, layerNodes });
    }
  }

  const origins = {};
  for (const r of requests) { try { const o = new URL(r.url).origin; const k = o + (r.failed ? ' (blocked/failed)' : ''); origins[k] = (origins[k] || 0) + 1; } catch {} }
  const firstParty = requests.filter((r) => { try { const u = new URL(r.url); return u.origin === new URL(t.url).origin; } catch { return false; } });
  const runEnd = await snapshot();
  const runTop = topProcs(procsStart, await procsSnapshot(), { excludeRoot: chromePid }); // I-031, after the last phase
  const powerEnd = await hostPower(); // T8+ (I-033): after the run's last snapshot
  progress('report');
  const pressures = Object.values(hostPhases).map((p) => p.pressureMax).filter((x) => x != null);
  const sl = slept(runStart, runEnd); // did the Mac sleep during the run (I-026)?
  const hostRec = {
    load1Start: runStart.load1, load1End: runEnd.load1, freeMemMB: runStart.freeMemMB, freeMemMBEnd: runEnd.freeMemMB,
    sleptSec: sl.sleptSec, woke: sl.woke, chromeRelaunched, chromeWarmedSec: Math.round(warmedSec * 10) / 10,
    recheck, gate: gate || null, phases: hostPhases,
    topProcs: runTop, // I-031: log only, not passed to classifyRun
    power: { start: powerStart, end: powerEnd }, chrome, // T8+ (I-033): verdict tag via hostStateSummary, not classifyRun
    ...(runStart.stub ? { stub: runStart.stub } : {}),
  };
  Object.assign(hostRec, classifyRun({ load1Start: runStart.load1, otherBusyPct: hostPhases.scroll?.otherBusyPct, pressureMax: pressures.length ? Math.max(...pressures) : null, gateTimeout: !!gate?.gateTimeout, recheckQuiet: recheck ? recheck.quiet : undefined, sleptSec: sl.sleptSec, woke: sl.woke, recheckSleptSec: recheck?.sleptSec, gateSleptSec: gate?.sleptSec, chromeRelaunched }));
  return {
    label: t.label, url: t.url, viewport: vpName, run, loadavg1: { before: r1(loadBefore), after: r1(runEnd.load1) }, host: hostRec, state, scroll, morphState, shots, shimStats,
    idleSummary: idlePerf ? { ...summarize(idlePerf), ...cdpPhase.idle, scrollY: idlePerf.scrollY } : null, scrollSummary: { ...summarize(scrollPerf), ...cdpPhase.scroll }, morphSummary: { ...summarize(morphPerf), ...cdpPhase.morph },
    ...(TRACE ? { traceFrames, traceSummary: traceSummary(traceFrames) } : {}),
    ...(FRAME_LOG ? { frameLog: { idle: idlePerf?.log ?? null, scroll: scrollPerf.log ?? null, morph: morphPerf.log ?? null } } : {}),
    ...(TRACE && TRACE_PHASES.some((p) => p !== 'scroll') ? { tracePhases: Object.fromEntries(TRACE_PHASES.filter((p) => p !== 'scroll').map((p) => [p, traceOut[p] ?? null])) } : {}),
    ...(traceOn('idle') ? { traceIdleSummary: traceOut.idle ? traceSummary(traceOut.idle) : null } : {}),
    ...(traceOn('morph') ? { traceMorphSummary: traceSummary(traceOut.morph) } : {}),
    ...(traceFiles ? { traceFiles } : {}),
    ...(PAINT ? { paintRects, ...Object.fromEntries(PHASES.map((p) => [`paint${p[0].toUpperCase()}${p.slice(1)}Summary`, paintSummary(paintRects.phases[p], paintRects.layerScale)])) } : {}),
    ...(longFrames ? { longFrames } : {}),
    requests: requests.length, origins,
    notFound: firstParty.filter((r) => r.status >= 400).map((r) => `${r.status} ${new URL(r.url).pathname}`),
    scripts: [...new Set(firstParty.filter((r) => r.type === 'Script').map((r) => new URL(r.url).pathname))].sort(),
    errors: [...new Set(errors)].slice(0, 30),
  };
}

// Pixel diff of two PNGs, computed in the browser (canvas) to stay dependency-free.
async function diffImages(cdp, a, b) {
  const { readFileSync } = await import('node:fs');
  const page = await cdp.newIsolatedPage();
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64');
  const db = 'data:image/png;base64,' + readFileSync(b).toString('base64');
  const res = await page.eval(`(async () => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]);
    const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let diff = 0;
    for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) diff++;
    return { w, h, diffPct: Math.round(10000 * diff / (w * h)) / 100 };
  })()`);
  await page.close();
  return res;
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

async function main() {
  // A signal must end verify through process.exit, so the 'exit' handlers run (lib/cdp.mjs kills the
  // Chrome tree, lib/lock.mjs releases an own hold). lib/lock.mjs installs such handlers only for an own
  // process hold; a verify that re-entered an outer hold (`lock.mjs run`, test:chrome) or ran with
  // --no-lock died on SIGTERM with its Chrome left running (test:chrome on 48ace89).
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));
  if (stubOutsideTest()) {
    // review-i027: a stubbed host would put fake waits and a fake host record under a real Chrome's numbers
    console.error(`verify: a stubbed host (FW_TEST_HOST=${process.env.FW_TEST_HOST}) outside a test, with a real Chrome: refused; unset FW_TEST_HOST to measure`);
    process.exit(2);
  }
  await useHostClock();
  let lockHolder = null;
  if (!flag('no-lock')) {
    ({ holder: lockHolder } = await acquire('chrome-measure', { owner: opt('owner', process.env.FW_LOCK_OWNER || checkoutId()), kind: 'process', meta: { cmd: 'verify', targets: targets.map((t) => t.label + '=' + t.url), cpu: CPU, runs: RUNS, viewport: vpSel, idle: IDLE } }));
  }
  // the lock's host admission gate (tools/lib/lock.mjs): how this hold (or the outer one we re-entered) was granted
  const gate = lockHolder?.gate ? { ...lockHolder.gate, gateTimeout: !!lockHolder.gateTimeout } : null;
  armWatchdog(); // from here on verify holds the lock: a stall must end it
  const results = [];
  try {
    for (const vpName of vpList) {
      for (let run = 0; run < RUNS; run++) {
        const order = run % 2 ? [...targets].reverse() : targets; // ABBA: cancel slow drift across a session
        for (const t of order) {
          wd.where = `${vpName} run ${run + 1}/${RUNS} ${t.label}`;
          process.stdout.write(`[${vpName} run ${run + 1}/${RUNS}] ${t.label} ${t.url} ... `);
          if (!browser) await openChrome(); // first run: Chrome idles (pinged) through the recheck, as since 77693c3
          const recheck = await recheckHost();
          const chromeRelaunched = await ensureChrome();
          const warmedSec = await warmChrome();
          const r = await measure(browser.cdp, t, vpName, run, { chromePid: browser.ch.proc.pid, gate, recheck, chromeRelaunched, warmedSec, chrome: chromeState() });
          const bl = baselineAfterRun();
          if (bl) { r.baseline = bl; flaggedRuns++; }
          results.push(r);
          const s = r.scrollSummary;
          const ts = r.traceSummary, pr = r.paintRects, ps = r.paintScrollSummary;
          const extra = (ts && ts.droppedFrames != null ? `  frames: dropped ${ts.droppedFrames} partial ${ts.partialFrames} layer ${ts.layerMs}ms paints ${ts.paintEvents}` : '')
            + (pr ? (pr.source ? `  paint-rects scroll (${pr.source}): ${ps?.paints ?? 0} paints${ps?.mpx != null ? ` ${ps.mpx} layer Mpx (frame max ${ps.frameMpxMax})` : ''}, painted layers ${ps?.layerMpx ?? 0} layer Mpx (viewport-capped ${ps?.layerVpMpx ?? '?'}), layers max ${ps?.layersMax ?? '?'} +${ps?.layersAdded ?? 0} -${ps?.layersRemoved ?? 0} [layer px = CSS px x ${pr.layerScale ?? '?'}]` : `  paint-rects: ${pr.status}`) : '')
            + (r.traceFiles ? `  trace saved: ${Object.values(r.traceFiles).join(', ')}` : '');
          console.log(`fps ${s.fps}  >20ms ${s.gt20}  >34ms ${s.gt34}  >50ms ${s.gt50}  >100ms ${s.gt100}  LoAF ${s.loafMs}ms  forced ${s.forcedLayoutMs}ms${s.cdpStyleCount != null ? `  style ${s.cdpStyleMs}ms/${s.cdpStyleCount}x layout ${s.cdpLayoutMs}ms/${s.cdpLayoutCount}x script ${s.cdpScriptMs}ms` : ''}${r.traceSummary ? `  trace >20ms ${r.traceSummary.frames}: script ${r.traceSummary.scriptMs} style ${r.traceSummary.styleMs} layout ${r.traceSummary.layoutMs} paint ${r.traceSummary.paintMs} other ${r.traceSummary.otherMs} offMain ${r.traceSummary.offMainMs}ms; >34ms ${r.traceSummary.gt34} (${byClass(r.traceSummary.gt34ByClass)}) >50ms ${r.traceSummary.gt50} (${byClass(r.traceSummary.gt50ByClass)})${r.traceSummary.partial ? ` PARTIAL TRACE: ${r.traceFrames.summary.partialReasons.join('; ')}` : ''}` : r.traceFrames?.error ? `  trace: ${r.traceFrames.error}` : ''}  morph LoAF ${r.morphSummary.loafMs}ms${r.idleSummary ? `  idle fps ${r.idleSummary.fps} >50ms ${r.idleSummary.gt50} LoAF ${r.idleSummary.loafMs}ms` : ''}  (${r.notFound.length} 404s, ${r.errors.length} errors)  host: load1 ${r.host.load1Start}, other CPU ${r.host.phases.scroll?.otherBusyPct ?? '?'} %${r.host.loadInvalid ? `  CONTAMINATED: ${r.host.reasons.join('; ')}` : r.host.loadWarn ? `  warn: ${r.host.warnings.join('; ')}` : ''}${bl ? `  ${bl.tag}: baseline state ${bl.state} after this run` : ''}${extra}`);
        }
      }
      if (SCREENS && targets.length > 1) {
        wd.where = `${vpName} screenshot diff`;
        progress('screenshot diff', 60);
        await ensureChrome();
        const ref = targets[0];
        for (const t of targets.slice(1)) for (const name of ['top', 'middle', 'bottom']) {
          const a = join(OUT, `${vpName}-${ref.label}-${name}.png`), b = join(OUT, `${vpName}-${t.label}-${name}.png`);
          const d = await diffImages(browser.cdp, a, b).catch((e) => ({ error: e.message }));
          results.push({ diff: true, viewport: vpName, a: ref.label, b: t.label, shot: name, ...d });
        }
      }
    }
  } finally { progress('close'); await closeChrome(); }

  // ---- report ----------------------------------------------------------------------------------
  const rows = [];
  for (const vpName of vpList) for (const t of targets) {
    const rs = results.filter((r) => !r.diff && r.viewport === vpName && r.label === t.label);
    const m = (phase, k) => median(rs.map((r) => r[phase][k]));
    rows.push({
      viewport: vpName, target: t.label, runs: rs.length,
      fps: m('scrollSummary', 'fps'), p95: m('scrollSummary', 'p95'), gt20: m('scrollSummary', 'gt20'), gt34: m('scrollSummary', 'gt34'), gt50: m('scrollSummary', 'gt50'), gt100: m('scrollSummary', 'gt100'), max: m('scrollSummary', 'max'),
      loafMs: m('scrollSummary', 'loafMs'), loafScriptMs: m('scrollSummary', 'loafScriptMs'), forcedMs: m('scrollSummary', 'forcedLayoutMs'),
      morphFps: m('morphSummary', 'fps'), morphGt50: m('morphSummary', 'gt50'), morphLoafMs: m('morphSummary', 'loafMs'),
      scrollS: Math.round(median(rs.map((r) => r.scroll.ms)) / 100) / 10,
      ...(IDLE > 0 ? { idleFps: m('idleSummary', 'fps'), idleGt50: m('idleSummary', 'gt50'), idleLoafMs: m('idleSummary', 'loafMs'), idleScriptMs: m('idleSummary', 'loafScriptMs'), idleForcedMs: m('idleSummary', 'forcedLayoutMs') } : {}),
    });
  }
  console.log(`\nmedians (scroll phase unless "morph"/"idle"; idle = ${IDLE} s at the top before scrolling):`);
  console.table(rows);
  const diffs = results.filter((r) => r.diff);
  if (diffs.length) { console.log('screenshot pixel diff vs ' + targets[0].label + ' (% of pixels differing):'); console.table(diffs.map(({ viewport, b, shot, diffPct, error }) => ({ viewport, target: b, shot, diffPct, error }))); }
  const file = opt('result') ? resolve(process.cwd(), opt('result')) : join(OUT, `verify-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const measured = results.filter((r) => !r.diff);
  const invalid = measured.filter((r) => r.host.loadInvalid), warn = measured.filter((r) => !r.host.loadInvalid && r.host.loadWarn);
  const hostSum = {
    ...(await hostInfo()), chromeLaunches: launches, watchdogSec: WATCHDOG, chromeWarmSec: CHROME_WARM,
    thresholds: THRESHOLDS, recheck: { maxWaitSec: MAX_WAIT, maxLoad1: QUIET.quietMaxLoad1, maxBusyPct: QUIET.quietMaxBusyPct }, gate,
    contaminated: invalid.length > 0, contaminatedRuns: invalid.length, warnRuns: warn.length, runsTotal: measured.length,
    hostState: hostStateSummary(measured.map((r) => ({ label: r.label, run: r.run, power: r.host.power, chrome: r.host.chrome }))), // T8+ (I-033)
    ...(measured[0]?.host.stub ? { stub: measured[0].host.stub } : {}),
  };
  console.log(describeHostState(hostSum.hostState));
  console.log(`host: ${invalid.length} of ${measured.length} runs contaminated${invalid.length ? ` (${[...new Set(invalid.flatMap((r) => r.host.reasons))].join('; ')}): verdicts provisional` : ''}${warn.length ? `; ${warn.length} warn (${[...new Set(warn.flatMap((r) => r.host.warnings))].join('; ')})` : ''}${hostSum.stub ? `  [host STUBBED: ${hostSum.stub}]` : ''}`);
  const paintScale = PAINT ? layerScales(measured) : null; // I-032 review B1: the unit of every paint area
  const measurement = { cdpMetrics: CDP_METRICS, traceFrames: TRACE, frameLog: FRAME_LOG, ...(TRACE ? { note: 'traced: tracing perturbs timing, frame numbers are not comparable with untraced runs', traceBufferKb: TRACE_START.traceConfig.traceBufferSizeInKb, traceTimeoutSec: TRACE_TIMEOUT,
    // I-032: the trace categories (incl. the Frames track's) and the traced phases; one trace per phase
    traceCategories: TRACE_START.traceConfig.includedCategories, tracePhases: TRACE_PHASES, saveTrace: SAVE_TRACE } : {}),
    ...(PAINT ? { paintRects: true, paintUnits: paintScale.units, paintLayerScales: paintScale.layerScales, paintLayerScaleMixed: paintScale.mixed, paintRectsNote: PAINT_NOTE, paintRectsAddedWork: ['Runtime.addBinding + one binding call per rAF frame (main thread)', 'LayerTree.enable: the full layer list on every tree change or paint (+ layerPainted per paint where Chrome sends it)'] } : {}) };
  if (TRACE) console.log(`trace-frames: ${measurement.note}; offMain = ${BUCKET_LABELS.offMain}`);
  if (PAINT) console.log(PAINT_NOTE);
  if (paintScale?.mixed) console.log(`${PAINT_SCALE_TAG}: the runs' layer scales differ (${paintScale.layerScales.join(', ')}): their paint Mpx are not comparable (layer px = CSS px x layerScale)`);
  if (flaggedRuns) console.log(`baseline: ${flaggedRuns} of ${measured.length} runs flagged (${[...new Set(measured.filter((r) => r.baseline).map((r) => r.baseline.tag))].join(', ')}): not measured on the pinned snapshot ${BASELINE.snapshot ?? ''} throughout`);
  writeFileSync(file, JSON.stringify({ chromeMode: 'headed', cpu: CPU, idle: IDLE, viewports: vpList, runs: RUNS, targets, measurement, baseline: flaggedRuns ? { ...BASELINE, flaggedRuns } : BASELINE, host: hostSum, rows, results }, null, 1));
  console.log('details: ' + file);
}

main().catch((e) => { console.error(e); process.exit(1); });
