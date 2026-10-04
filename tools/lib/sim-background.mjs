// The Simulator's own background CPU (incident I-082). A booted fw-sim runs a whole iOS userland as host processes
// (children of its launchd_sim): besides Safari and its WebKit processes (the measured page) there are daemons and
// extensions that burn host cores on their own schedule. OBSERVED in our setup (2026-10-03, iOS 26.5 runtime 23F77,
// cause unknown): the Health app's SleepWidgetExtension (a WidgetKit extension, com.apple.Health.Sleep.
// SleepWidgetExtension) at 100 % of a core, the Sim's diagnosticd at 30-57 %, backboardd at 18-31 %, and a cold-boot
// storm (searchd, swcd, dasd, amsengagementd, ...) that takes host load1 from ~15 to ~70 within 20 s of `simctl boot`.
// Sim checks are counts only, but several counts follow frame cadence (Paint records per 5 s, clock-paint frames,
// Layout / RecalcStyle per hold), so a core-burning background process can bias them, and not equally across arms
// that run one after the other. This module MEASURES that background (read-only: one `ps` per sample, ~20 ms; it
// never kills, stops or reconfigures anything in the Simulator) so every session can
//   - wait for the background to settle before its command (settle(): bounded, recorded, never fails the session), and
//   - record it during the command (monitor(): one window every FW_SIM_BG_EVERY_SEC) and print a summary, so every
//     count carries its context (which windows were busy, and with what).
//
// Process classes (simTree + kindOf): the launchd_sim tree is split into
//   page        MobileSafari and the WebKit processes (WebContent, GPU, Networking): what the command measures;
//   render      backboardd, the Sim's display server: it composites what the page draws (OBSERVED in our setup: 13-20 %
//               with an idle page, ~60 % while the page animates), so it is part of the measured system;
//   log         diagnosticd and logd, the Sim's log relay (OBSERVED in our setup, cause unknown: diagnosticd follows the
//               page's activity, 20-60 % idle and 130-145 % while the page animates, as if it relayed WebKit's logging);
//               reported apart from background, because its load goes up and down with the page;
//   driver      WebDriverAgent's runner and testmanagerd (sim.mjs wda start), when they run;
//   background  everything else in the tree (daemons, widget and poster extensions, SpringBoard, ...): CPU the page
//               does not cause; the quantity this module is about (settle waits for it, `busy` windows count it).
// Host-side Simulator services outside the tree (SimRenderServer, SimMetalHost, Simulator.app) render the page: they
// are reported as `hostSim`, never as background. Each process's CPU is its ps CPU-time delta over the window, in % of
// ONE core (as top), like host.mjs topProcs (I-031), so a busy process that started or ended inside a window is seen
// for the part it ran (one that exited inside the window is not).
//
// Test double: $FW_PS names the ps executable (it gets `-A -o pid=,ppid=,time=,comm=`). In a test process without $FW_PS
// (a `node --test` process, or a stubbed host $FW_TEST_HOST as tests/helpers.mjs cleanEnv sets for every tool a test
// starts) the real ps is never read (I-024's rule for host.mjs): every sample is null and settle() / monitor() say so
// (`skipped`), so a test never waits on a real Simulator someone else has booted.
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { parsePsProcs } from './host.mjs';

export const PAGE = Object.freeze(['MobileSafari', 'com.apple.WebKit.WebContent', 'com.apple.WebKit.GPU', 'com.apple.WebKit.Networking']);
export const RENDER = Object.freeze(['backboardd']);
export const LOG = Object.freeze(['diagnosticd', 'logd']);
export const HOST_SIM = Object.freeze(['SimRenderServer', 'SimMetalHost', 'Simulator']);
const DRIVER = /^(WebDriverAgentRunner|testmanagerd$)/;
export const DEFAULTS = Object.freeze({ settleSec: 60, limitPct: 60, windowSec: 3, everySec: 10 });

/** The env-tunable numbers: FW_SIM_SETTLE_SEC (max wait before the command; 0 = no wait, only a reading),
 *  FW_SIM_BG_LIMIT_PCT (settled = the background at or below this, % of one core), FW_SIM_BG_EVERY_SEC (monitor
 *  window; 0 = no monitor). */
export function config(env = process.env) {
  const num = (k, d, min = 0) => {
    const v = env[k];
    if (v === undefined || v === '') return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) throw new Error(`${k} must be a number >= ${min} (got ${v})`);
    return n;
  };
  return { settleSec: num('FW_SIM_SETTLE_SEC', DEFAULTS.settleSec), limitPct: num('FW_SIM_BG_LIMIT_PCT', DEFAULTS.limitPct), windowSec: DEFAULTS.windowSec, everySec: num('FW_SIM_BG_EVERY_SEC', DEFAULTS.everySec) };
}

/** Is reading the real ps refused here (a test process without $FW_PS)? */
export const refused = (env = process.env) => !env.FW_PS && (!!env.NODE_TEST_CONTEXT || !!env.FW_TEST_HOST);

/** A window whose end stamps are less certain than this share of it (skew, see between()) is not reported on its own: it
 *  extends to the next reading (I-120). The reported % is then within ±MAX_SKEW of the true one, so a 130 % background
 *  reads 104-156 % and a real overrun (anything above limitPct / (1 - MAX_SKEW)) still counts as busy. */
export const MAX_SKEW = 0.2;

/** One process table {pid: {ppid, cpuSec, command}} with a monotonic stamp, or null (refused, or ps failed). ps reads the
 *  table at some instant inside its run, so `at` is the middle of the call and `span` its length (ms): the stamp is right
 *  within span / 2. A ps slowed by host load (a 0.35 s call against 0.4 s windows, I-120) otherwise read 130 % as 200 %. */
export function psSnapshot({ env = process.env, now = () => performance.now() } = {}) {
  if (refused(env)) return null;
  try {
    const t0 = now();
    const r = spawnSync(env.FW_PS || 'ps', ['-A', '-o', 'pid=,ppid=,time=,comm='], { encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
    const t1 = now();
    if (r.status !== 0) return null;
    const procs = parsePsProcs(r.stdout);
    return Object.keys(procs).length ? { at: (t0 + t1) / 2, span: t1 - t0, wall: Date.now(), procs } : null;
  } catch { return null; }
}

/** Every launchd_sim process and its descendants (pid numbers), from one process table. */
export function simTree(procs) {
  const kids = {};
  for (const [pid, p] of Object.entries(procs || {})) (kids[p.ppid] ||= []).push(Number(pid));
  const roots = Object.entries(procs || {}).filter(([, p]) => p.command === 'launchd_sim').map(([pid]) => Number(pid));
  const out = new Set(), stack = [...roots];
  while (stack.length) { const pid = stack.pop(); if (out.has(pid)) continue; out.add(pid); stack.push(...(kids[pid] || [])); }
  return { roots, pids: out };
}
/** 'page' | 'render' | 'log' | 'driver' | 'background' for a process in the Sim's tree. */
export const kindOf = (command) => (PAGE.includes(command) ? 'page' : RENDER.includes(command) ? 'render' : LOG.includes(command) ? 'log' : DRIVER.test(command) ? 'driver' : 'background');

const r1 = (x) => Math.round(x * 10) / 10;
/**
 * The Simulator's CPU between two psSnapshot()s: {windowSec, sims (launchd_sim count), bgPct, pagePct, renderPct, logPct, driverPct,
 * hostSimPct, top: [{command, kind, cpuPct}] (the n busiest background processes, kind 'background'), page: same for
 * the page, skew}. % of one core. skew: how uncertain the window's length is, as a share of it (half of each ps call's
 * span; 0 without spans); above MAX_SKEW, monitor() and settle() extend the window (I-120). Null without two snapshots.
 */
export function between(a, b, { n = 3 } = {}) {
  if (!a || !b || !(b.at > a.at)) return null;
  const sec = (b.at - a.at) / 1000;
  const tree = simTree(b.procs);
  const sum = { background: 0, page: 0, render: 0, log: 0, driver: 0, hostSim: 0 };
  const rows = [];
  for (const [pid, p] of Object.entries(b.procs)) {
    const inTree = tree.pids.has(Number(pid));
    const kind = inTree ? kindOf(p.command) : HOST_SIM.includes(p.command) ? 'hostSim' : null;
    if (!kind) continue;
    const prev = a.procs[pid];
    const d = p.cpuSec - (prev && prev.command === p.command ? prev.cpuSec : 0);
    if (!(d > 0)) continue;
    const pct = (d / sec) * 100;
    sum[kind] += pct;
    if (kind !== 'hostSim') rows.push({ command: p.command, kind, cpuPct: r1(pct) });
  }
  const top = (k) => rows.filter((x) => x.kind === k).sort((x, y) => y.cpuPct - x.cpuPct || x.command.localeCompare(y.command)).slice(0, n);
  const skew = ((a.span || 0) + (b.span || 0)) / 2 / (b.at - a.at);
  return { windowSec: r1(sec), skew: Math.round(skew * 1000) / 1000, sims: tree.roots.length, bgPct: r1(sum.background), pagePct: r1(sum.page), renderPct: r1(sum.render), logPct: r1(sum.log), driverPct: r1(sum.driver), hostSimPct: r1(sum.hostSim), top: top('background'), page: top('page') };
}

const topText = (w) => (w?.top?.length ? w.top.map((x) => `${x.command} ${Math.round(x.cpuPct)} %`).join(', ') : 'none');
/** One line: "sim background 140 % (SleepWidgetExtension 100 %, diagnosticd 30 %), page 90 %, load1 37". */
export function describe(w, load1 = null) {
  if (!w) return 'sim background unknown';
  return `sim background ${Math.round(w.bgPct)} % of a core (${topText(w)}), page ${Math.round(w.pagePct)} %, render ${Math.round(w.renderPct)} %, log ${Math.round(w.logPct)} %${load1 != null ? `, load1 ${Math.round(load1)}` : ''}`;
}

/**
 * Before the command: sample windowSec windows until the Sim's background CPU is at or below limitPct, at most maxSec
 * (bounded by the caller's hold budget). Never throws, never fails the session: the result is recorded.
 * -> {settled, waitedSec, limitPct, windows: [{at, bgPct, pagePct, renderPct, logPct, top}], last, load1Start, load1End} | {skipped}
 */
export async function settle({ maxSec, limitPct, windowSec = DEFAULTS.windowSec, abort, env = process.env, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), snap = () => psSnapshot({ env }), load = () => loadavg1() } = {}) {
  const t0 = Date.now();
  const load1Start = load();
  let a = snap();
  if (!a) return { skipped: refused(env) ? 'a test process without FW_PS' : 'ps failed', limitPct };
  const windows = [];
  let last = null;
  for (;;) {
    if (abort?.aborted) break;
    await sleep(windowSec * 1000);
    const b = snap();
    if (!b) break;
    const w = between(a, b);
    const late = (Date.now() - t0) / 1000 + windowSec > maxSec;
    const unsure = !!w && w.skew > MAX_SKEW;
    // I-120: an uncertain window extends to the next reading; kept (flagged) only when time is up and nothing else was read
    if (!unsure || (late && !last)) {
      a = b;
      if (w) {
        last = w;
        windows.push({ at: new Date(b.wall).toISOString(), bgPct: w.bgPct, pagePct: w.pagePct, renderPct: w.renderPct, logPct: w.logPct, top: w.top, ...(unsure ? { uncertain: true } : {}) });
        if (w.bgPct <= limitPct) break;
      }
    }
    if (late) break;
  }
  return { settled: !!last && last.bgPct <= limitPct, waitedSec: Math.round((Date.now() - t0) / 1000), limitPct, maxSec, windows, last, load1Start, load1End: load() };
}

/**
 * During the command: one window every everySec (one ps each). stop() -> the summary
 * {everySec, windows: [{at, bgPct, pagePct, renderPct, logPct, top, load1}], n, bgMax, bgMean, busy (windows above limitPct), top (the
 * busiest background processes over the whole command, by CPU-time delta), load1Max} | {skipped}.
 * `onWindow(w)` (optional) gets each window as it closes (the session appends it to a live JSONL file).
 */
export function monitor({ everySec, limitPct, env = process.env, snap = () => psSnapshot({ env }), load = () => loadavg1(), onWindow = null } = {}) {
  if (!(everySec > 0)) return { stop: () => ({ skipped: 'FW_SIM_BG_EVERY_SEC=0' }) };
  const first = snap();
  if (!first) { const why = refused(env) ? 'a test process without FW_PS' : 'ps failed'; return { stop: () => ({ skipped: why }) }; }
  let prev = first;
  const windows = [];
  const tick = (tail = false) => {
    const b = snap();
    if (!b) return;
    const w = between(prev, b);
    const unsure = !!w && w.skew > MAX_SKEW;
    // I-120: an uncertain window extends to the next tick; the tail is kept (flagged) only when it is the only window
    if (unsure && !(tail && !windows.length)) return;
    prev = b;
    if (!w) return;
    const row = { at: new Date(b.wall).toISOString(), bgPct: w.bgPct, pagePct: w.pagePct, renderPct: w.renderPct, logPct: w.logPct, top: w.top, load1: r1(load() ?? NaN), ...(unsure ? { uncertain: true } : {}) };
    windows.push(row);
    try { onWindow?.(row); } catch {}
  };
  const timer = setInterval(tick, everySec * 1000);
  timer.unref?.();
  return {
    stop: () => {
      clearInterval(timer);
      tick(true); // the tail since the last window
      const whole = between(first, prev, { n: 5 });
      const bg = windows.map((w) => w.bgPct);
      const mean = (k) => (windows.length ? r1(windows.reduce((x, w) => x + (w[k] ?? 0), 0) / windows.length) : null);
      const loads = windows.map((w) => w.load1).filter(Number.isFinite);
      return { everySec, limitPct, n: windows.length, bgMax: bg.length ? Math.max(...bg) : null, bgMean: mean('bgPct'), pageMean: mean('pagePct'), renderMean: mean('renderPct'), logMean: mean('logPct'),
        busy: windows.filter((w) => w.bgPct > limitPct).length, top: whole?.top ?? [], load1Max: loads.length ? Math.max(...loads) : null, windows };
    },
  };
}

/** One line for the session log after the command. */
export function summaryLine(s) {
  if (!s || s.skipped) return `SIM_BACKGROUND skipped (${s?.skipped ?? 'no monitor'})`;
  if (!s.n) return 'SIM_BACKGROUND no complete window (the command ended within one)';
  const top = s.top.length ? s.top.map((x) => `${x.command} ${Math.round(x.cpuPct)} %`).join(', ') : 'none';
  return `SIM_BACKGROUND ${s.n} windows of ${s.everySec} s: sim background mean ${Math.round(s.bgMean)} %, max ${Math.round(s.bgMax)} % of a core; ${s.busy} window(s) above ${s.limitPct} %; busiest over the command: ${top}; means: page ${Math.round(s.pageMean ?? 0)} %, render ${Math.round(s.renderMean ?? 0)} %, log ${Math.round(s.logMean ?? 0)} %${s.load1Max != null ? `; load1 max ${Math.round(s.load1Max)}` : ''} (I-082: counts that follow frame cadence carry this context)`;
}
/** One line for the settle phase. */
export function settleLine(s) {
  if (!s || s.skipped) return `SIM_QUIET skipped (${s?.skipped ?? 'off'})`;
  return `SIM_QUIET ${s.settled ? 'settled' : 'NOT settled'} after ${s.waitedSec} s (limit ${s.limitPct} % of a core, max ${s.maxSec} s): ${describe(s.last, s.load1End)}`;
}

/** Append one JSON line to a mode-600 file (directories made as needed); never throws. */
export function appendJsonl(file, obj) {
  try { mkdirSync(dirname(file), { recursive: true, mode: 0o700 }); appendFileSync(file, JSON.stringify(obj) + '\n', { mode: 0o600 }); chmodSync(file, 0o600); } catch {}
}
function loadavg1() { try { return r1(os.loadavg()[0]); } catch { return null; } }
