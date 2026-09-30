// Host state for measurements: is the Mac quiet enough to measure, and was a finished run clean?
// Shared by tools/lib/lock.mjs (admission gate of chrome-measure), tools/verify.mjs (per-run record,
// recheck before each run), tools/fix.mjs ab (contamination flag) and the benchmark runner.
// Background: research/architecture/postmortem-2026-09-30-overload.md §3 (a) and (d), incident I-017,
// research/measurement-parallelism/README.md.
//
// Signals, in order of trust (postmortem "Is load average the right signal?"):
//   busyPct / sysPct  host CPU from os.cpus() tick deltas (Mach per-CPU tick counters on macOS), over a
//                     window; counts short-lived processes too. The primary signal.
//   pressure          macOS memory pressure level (sysctl kern.memorystatus_vm_pressure_level):
//                     1 normal, 2 warn, 4 critical; null elsewhere.
//   decompPerSec      compressor decompressions per second (vm_stat), macOS only.
//   load1             os.loadavg()[0]. A coarse guard only: on macOS it counts runnable threads (memory
//                     stalls included) and lags ~1 min. Kept because the I-017 evidence is in load1 units.
//
// API (keep it small; the bench runner imports it):
//   THRESHOLDS                         the numbers below, with env overrides applied (thresholds())
//   thresholds(env)                    same, for another env
//   snapshot({samplers})       async   one reading: {at, ticks, load1, pressure, decompressions, freeMemMB}
//   between(a, b)                      two snapshots -> {windowSec, busyPct, sysPct, load1, load1Start,
//                                      load1End, pressure, pressureMax, decompPerSec, freeMemMB}
//   sample({windowSec=3, since, samplers})  async  snapshot, wait, snapshot -> between(); with `since`
//                                      (an earlier snapshot) it does not wait.
//                                      -> {load1, busyPct, sysPct, windowSec, pressure, pressureMax, decompPerSec, freeMemMB, ...}
//   quiet(sample, t=THRESHOLDS)        -> {quiet: bool, reasons: [...]}: the admission rule (busy, load1,
//                                      pressure, window length)
//   waitQuiet({maxWaitSec=60, windowSec, thresholds, samplers, onSample})  async
//                                      sample windows until quiet() or maxWaitSec
//                                      -> {quiet, waitedSec, windows, last, reasons}
//   treeCpuSec(rootPid, {samplers}) async   CPU seconds used so far by rootPid and its descendants (ps)
//   classifyRun(rec, t=THRESHOLDS)     per-run flags -> {loadInvalid, loadWarn, reasons, warnings}
//                                      rec: {load1Start, otherBusyPct, pressureMax, gateTimeout, recheckQuiet}
//   describe(sample)                   one-line text: "load1 3.1 | cpu 12 % busy (sys 4 %) | mem pressure normal"
//
// Stubbing: every function takes {samplers} (partial; merged over the defaults). $FW_TEST_HOST=<module
// path> replaces the defaults process-wide with that module's exports (tests of the CLIs; see
// tests/fixtures/fake-host.mjs). Every snapshot then carries `stub: <path>`, and verify/fix copy it into
// their results, so a stubbed host is never mistaken for a measured one.
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Defaults. Why these numbers: see the comments; recalibrate after the first quiet A/A (postmortem (a)). */
export const DEFAULTS = Object.freeze({
  // --- quiet(): the admission rule (lock gate, verify's recheck before each run) ---
  quietMaxBusyPct: 20,   // host CPU busy over the window, before Chrome starts (~1.6 of 8 cores). Provisional:
                         // other processes used ~16-18 % at the quiet reference point (postmortem (a)).
  quietMaxLoad1: 6,      // I-017: frames >20 ms 66 at load1 < 6 vs 96-103 at 6-15 on the unchanged baseline (a step)
  quietMaxPressure: 1,   // memory pressure normal
  quietMinWindowSec: 10, // CPU window length the rule needs
  gateMaxWaitSec: 600,   // lock gate: after this the head waiter is granted anyway (gateTimeout, run contaminated)
  recheckMaxWaitSec: 60, // verify.mjs: wait up to this before each run, then run anyway (flagged)
  // --- classifyRun(): was a finished run clean? (postmortem (d), I-017) ---
  invalidLoad1: 10,        // load1 at run start. 6-10: level shift only (spread unchanged, sd 7.5 -> 7.7 frames >20 ms);
                           // 10-15: the spread more than doubles (sd 19, fps sd 4.6 vs 2.1), so the no-overlap verdict breaks
  invalidOtherBusyPct: 25, // host CPU minus the measured Chrome, scroll phase (measure-parallel's proposal)
  invalidPressure: 2,      // memory pressure warn or worse at any phase boundary
  warnLoad1: 6,            // the step: absolute numbers no longer comparable with the A/A floor (measured at load1 2.8-5.8)
  warnOtherBusyPct: 15,
});

const ENV = { FW_GATE_MAX_LOAD1: 'quietMaxLoad1', FW_GATE_MAX_BUSY: 'quietMaxBusyPct', FW_GATE_MAX_WAIT: 'gateMaxWaitSec' };

/** DEFAULTS with env overrides (FW_GATE_MAX_LOAD1, FW_GATE_MAX_BUSY, FW_GATE_MAX_WAIT). */
export function thresholds(env = process.env) {
  const t = { ...DEFAULTS };
  for (const [k, name] of Object.entries(ENV)) {
    if (env[k] === undefined || env[k] === '') continue;
    const v = Number(env[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number >= 0 (got "${env[k]}")`);
    t[name] = v;
  }
  return t;
}
export const THRESHOLDS = Object.freeze(thresholds());

// ---- samplers -----------------------------------------------------------------------------------------
function sh(cmd, args) { try { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000 }); return r.status === 0 ? r.stdout : null; } catch { return null; } }

/** "841:23.65", "1:02:03.45", "2-01:02:03" (ps time) -> seconds. */
export function parsePsTime(s) {
  const m = String(s).trim().match(/^(?:(\d+)-)?([\d:.]+)$/);
  if (!m) return null;
  const parts = m[2].split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec + (m[1] ? Number(m[1]) * 86400 : 0);
}

export const DEFAULT_SAMPLERS = Object.freeze({
  cpus: () => os.cpus(),
  loadavg: () => os.loadavg(),
  freemem: () => os.freemem(),
  pressure: () => {
    if (process.platform !== 'darwin') return null;
    const v = Number(sh('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']));
    return Number.isFinite(v) && v > 0 ? v : null;
  },
  decompressions: () => {
    if (process.platform !== 'darwin') return null;
    const m = (sh('vm_stat', []) || '').match(/^Decompressions:\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  },
  /** {pid: {ppid, cpuSec}} for every process. */
  procs: () => {
    const out = {};
    for (const l of (sh('ps', ['-A', '-o', 'pid=,ppid=,time=']) || '').split('\n')) {
      const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)$/);
      if (m) out[m[1]] = { ppid: Number(m[2]), cpuSec: parsePsTime(m[3]) };
    }
    return out;
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});

let envStub; // {path, mod} | null, loaded once
async function stubFromEnv() {
  if (envStub !== undefined) return envStub;
  const p = process.env.FW_TEST_HOST;
  envStub = p ? { path: resolve(p), mod: await import(pathToFileURL(resolve(p)).href) } : null;
  return envStub;
}
async function resolveSamplers(samplers) {
  const st = await stubFromEnv();
  const base = st ? { ...DEFAULT_SAMPLERS, ...Object.fromEntries(Object.entries(st.mod).filter(([, v]) => typeof v === 'function')) } : DEFAULT_SAMPLERS;
  return { s: { ...base, ...(samplers || {}) }, stub: st ? st.path : undefined };
}

// ---- readings -------------------------------------------------------------------------------------------
function sumTicks(cpus) {
  const t = { busy: 0, sys: 0, idle: 0, total: 0 };
  for (const c of cpus || []) {
    const x = c.times || {};
    const all = (x.user || 0) + (x.nice || 0) + (x.sys || 0) + (x.idle || 0) + (x.irq || 0);
    t.total += all; t.idle += x.idle || 0; t.sys += x.sys || 0; t.busy += all - (x.idle || 0);
  }
  return t;
}
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** One reading of the host. `ticks` are cumulative (ms summed over all CPUs). */
export async function snapshot({ samplers } = {}) {
  const { s, stub } = await resolveSamplers(samplers);
  // the spawning readers first, so their own CPU lands before the tick reading (outside a window that starts here)
  const pressure = s.pressure(), decompressions = s.decompressions();
  const snap = { at: s.now(), ticks: sumTicks(s.cpus()), load1: r1(s.loadavg()[0]), pressure, decompressions, freeMemMB: Math.round(s.freemem() / 1048576) };
  if (stub) snap.stub = stub;
  return snap;
}

/** The host between two snapshots (a earlier). */
export function between(a, b) {
  const dt = b.ticks.total - a.ticks.total;
  const sec = (b.at - a.at) / 1000;
  const pr = [a.pressure, b.pressure].filter((x) => x != null);
  const out = {
    windowSec: r1(sec),
    busyPct: dt > 0 ? r1((100 * (b.ticks.busy - a.ticks.busy)) / dt) : null,
    sysPct: dt > 0 ? r1((100 * (b.ticks.sys - a.ticks.sys)) / dt) : null,
    load1: b.load1, load1Start: a.load1, load1End: b.load1,
    pressure: b.pressure ?? null, pressureMax: pr.length ? Math.max(...pr) : null,
    decompPerSec: a.decompressions != null && b.decompressions != null && sec > 0 ? Math.round((b.decompressions - a.decompressions) / sec) : null,
    freeMemMB: b.freeMemMB,
    at: new Date(b.at).toISOString(),
  };
  if (b.stub) out.stub = b.stub;
  return out;
}

/** Host CPU and load over a window: {load1, busyPct, sysPct, windowSec, pressure, ...}. */
export async function sample({ windowSec = 3, since, samplers } = {}) {
  const { s } = await resolveSamplers(samplers);
  const a = since || (await snapshot({ samplers }));
  if (!since) await s.sleep(windowSec * 1000);
  return between(a, await snapshot({ samplers }));
}

// ---- rules ------------------------------------------------------------------------------------------------
/** The admission rule: {quiet, reasons}. A window shorter than quietMinWindowSec is never quiet. */
export function quiet(x, t = THRESHOLDS) {
  const reasons = [];
  if (!x) return { quiet: false, reasons: ['no sample'] };
  if (x.windowSec == null || x.windowSec < t.quietMinWindowSec - 0.05) reasons.push(`cpu window ${x.windowSec ?? 0} s < ${t.quietMinWindowSec} s`);
  if (x.busyPct == null) reasons.push('cpu unknown');
  else if (x.busyPct > t.quietMaxBusyPct) reasons.push(`cpu ${x.busyPct} % > ${t.quietMaxBusyPct} %`);
  if (x.load1 != null && x.load1 > t.quietMaxLoad1) reasons.push(`load1 ${x.load1} > ${t.quietMaxLoad1}`);
  const p = x.pressureMax ?? x.pressure;
  if (p != null && p > t.quietMaxPressure) reasons.push(`mem pressure ${pressureName(p)}`);
  return { quiet: reasons.length === 0, reasons };
}

/** Sample windows of `windowSec` until quiet() or ceil(maxWaitSec / windowSec) windows (at least one). */
export async function waitQuiet({ maxWaitSec = THRESHOLDS.recheckMaxWaitSec, windowSec, thresholds: t = THRESHOLDS, samplers, onSample } = {}) {
  const { s } = await resolveSamplers(samplers);
  const win = windowSec ?? t.quietMinWindowSec;
  const t0 = s.now(), maxWindows = Math.max(1, Math.ceil(maxWaitSec / win - 1e-9));
  let windows = 0, last = null, q = null;
  let a = await snapshot({ samplers });
  for (;;) {
    await s.sleep(win * 1000);
    const b = await snapshot({ samplers });
    last = between(a, b); a = b; windows++;
    q = quiet(last, t);
    onSample?.(last, q);
    if (q.quiet || windows >= maxWindows) return { quiet: q.quiet, waitedSec: r1((s.now() - t0) / 1000), windows, last, reasons: q.reasons };
  }
}

/** CPU seconds used so far by rootPid and all its descendants (null if unknown). */
export async function treeCpuSec(rootPid, { samplers } = {}) {
  const { s } = await resolveSamplers(samplers);
  if (s.treeCpu) return s.treeCpu(rootPid); // a stub may answer directly
  const all = s.procs();
  if (!all[rootPid]) return null;
  const kids = {};
  for (const [pid, p] of Object.entries(all)) (kids[p.ppid] ||= []).push(Number(pid));
  let sum = 0;
  const stack = [Number(rootPid)], seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    sum += all[pid]?.cpuSec || 0;
    for (const k of kids[pid] || []) stack.push(k);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Per-run validity (postmortem (d)). rec: {load1Start, otherBusyPct (scroll phase), pressureMax,
 * gateTimeout (the lock was granted by the gate's timeout, not on a quiet host), recheckQuiet (false:
 * the recheck before the run gave up)}. Missing fields are skipped.
 */
export function classifyRun(rec = {}, t = THRESHOLDS) {
  const reasons = [], warnings = [];
  if (rec.load1Start != null && rec.load1Start > t.invalidLoad1) reasons.push(`load1 ${rec.load1Start} > ${t.invalidLoad1} at run start`);
  else if (rec.load1Start != null && rec.load1Start > t.warnLoad1) warnings.push(`load1 ${rec.load1Start} > ${t.warnLoad1} at run start`);
  if (rec.otherBusyPct != null && rec.otherBusyPct > t.invalidOtherBusyPct) reasons.push(`other CPU ${rec.otherBusyPct} % > ${t.invalidOtherBusyPct} %`);
  else if (rec.otherBusyPct != null && rec.otherBusyPct > t.warnOtherBusyPct) warnings.push(`other CPU ${rec.otherBusyPct} % > ${t.warnOtherBusyPct} %`);
  if (rec.pressureMax != null && rec.pressureMax >= t.invalidPressure) reasons.push(`mem pressure ${pressureName(rec.pressureMax)}`);
  if (rec.gateTimeout) reasons.push('lock granted by gate timeout (host never quiet)');
  if (rec.recheckQuiet === false) warnings.push('host not quiet after the recheck before the run');
  return { loadInvalid: reasons.length > 0, loadWarn: warnings.length > 0, reasons, warnings };
}

export function pressureName(p) { return p == null ? 'unknown' : p <= 1 ? 'normal' : p < 4 ? 'warn' : 'critical'; }

/** "load1 3.1 | cpu 12 % busy (sys 4 %) over 3 s | mem pressure normal | 40 decompressions/s" */
export function describe(x) {
  if (!x) return 'host: unknown';
  return [`load1 ${x.load1 ?? '?'}`, `cpu ${x.busyPct ?? '?'} % busy (sys ${x.sysPct ?? '?'} %) over ${x.windowSec ?? '?'} s`, `mem pressure ${pressureName(x.pressureMax ?? x.pressure)}`,
    ...(x.decompPerSec != null ? [`${x.decompPerSec} decompressions/s`] : []), ...(x.stub ? [`STUBBED (${x.stub})`] : [])].join(' | ');
}
