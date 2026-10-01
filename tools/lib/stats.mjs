// Analysis library of measurement protocol v2 (research/architecture/measurement-protocol-v2.md §3, §5.3;
// item T3). Pure functions, no I/O; CLI: tools/stats.mjs; tests: tests/unit/stats.test.mjs.
// ANALYSIS CODE: these functions decide phone-block verdicts. A change here changes verdicts; call it out.
//
// Ticks (§3.2, Chrome only): Chrome stamps are vsync-aligned at 120 Hz, so a frame's dt is read as
//   k = round(dt / 8.333) ticks. On time = k <= 2. ">34" = k >= 5 (dt >= 37.5 ms), ">50" = k >= 7 (dt >= 54.17
//   ms; the protocol rounds it to 54.2). Legacy columns dt > 34 / dt > 50 are kept for one wave (`frameCounts`).
// Phone (CLAUDE.md "Frame thresholds"): no k forms (Safari's 1 ms stamps are not vsync-quantized); dt > 50 and
//   dt > 34 in ms, each also counted at +-4 ms (PHONE_TWINS); medians compare raw.
// Robust summaries: median, quartiles by linear interpolation (R type 7 / numpy default), IQR.
// Two-sample (one block, §5.3): exact one-sided Mann-Whitney (tools/lib/bench-stats.mjs: full enumeration
//   of the splits of the pooled values, ties = 1/2 in U, so tied tick values give the exact conditional p)
//   and the Hodges-Lehmann shift. Convention everywhere: a = control, b = variant, dir = which way is
//   better ('lower' for dt, ticks, counts; 'higher' for fps); a positive shift = the variant is better.
// Stratified (§5.3 after block 2, agreed with arch-lead 2026-10-01): exact van Elteren test, i.e. the
//   permutation distribution of sum_b U_b / (N_b + 1) over within-block splits only (runs never change
//   blocks); the shift is the stratified HL = median of the within-block pairwise improvements pooled over
//   blocks. The aligned variant (each run minus its block's control median, then one pooled MW) is
//   reported as a diagnostic, never as the verdict.
// Sequential decision (§5.3): after block 1 win iff U = 0, exact p <= 1/70 and HL >= max(minShift,
//   predicted / 2); futile iff the variant median is worse, or the medians are equal and HL <= 0 (ms
//   medians compared as ticks); else run block 2. After block 2: win iff the van Elteren p <= alpha and
//   the stratified HL >= minShift; else 'no-win' (a third block only by the lead). 3-arm blocks give 3 vs 3
//   per comparison (min p 1/20 > 1/70), so they can't win after block 1. Given 2 blocks, block 1's rule
//   runs first: if block 1 already stopped (win or futile), that decision stands and block 2 is not
//   evaluated ("outside the protocol, lead only"); the stratified rule never gets a second look
//   (review-stats). Blocks are taken in array order (blocksFromRuns sorts by block id).
//   Minimum shift: 1 tick = 8.333 ms (unit ms) or 1 (unit ticks); for count metrics (frames k>=5 per run)
//   "1 tick" does not apply and the default is 1 frame per run (arch-lead sign-off 2026-10-01).
//   Every run value must be a finite number: a missing value (empty frame log, NaN, null) throws; it
//   never counts as an improvement.
// Crossings (§3.4): threshold i sits at y_i = top_i - f_i * base, base by the threshold's unit: 'ih' the
//   frame's own innerHeight (IO rootMargin, JS reads), 'lvh' / 'svh' the device's large / small viewport
//   height, 'dvh' innerHeight; or an absolute `y`. A frame [yStart, yEnd] has delta = 0 when y_i lies in
//   it, else the signed distance to its nearest end (+ = the frame is past the threshold); its crossing is
//   the threshold with the smallest |delta|. top_i should come from the same run (layout above moves);
//   a static fallback is flagged topSource 'static'.
import { mannWhitney, hodgesLehmann, uStat } from './bench-stats.mjs';

export { mannWhitney, hodgesLehmann, uStat };

export const TICK_MS = 1000 / 120;
/** Tick count of a frame time: round(dt / 8.333). Exact at the midpoints (37.5 ms -> 5). */
export const tick = (dt, tickMs = TICK_MS) => Math.round(Math.round((dt / tickMs) * 1e9) / 1e9);
/** The dt at which a frame starts to count as k ticks (midpoint below k): 5 -> 37.5, 7 -> 54.17. */
export const tickThresholdMs = (k, tickMs = TICK_MS) => (k - 0.5) * tickMs;
export const K34 = 5, K50 = 7;

const num = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
/** Throw unless every value is a finite number (a null/NaN would read as "variant better" in U). */
export function assertFinite(xs, what) {
  if (!Array.isArray(xs)) throw new Error(`${what}: not an array`);
  const bad = xs.findIndex((x) => typeof x !== 'number' || !Number.isFinite(x));
  if (bad >= 0) throw new Error(`${what}: run ${bad + 1} has no finite value (${xs[bad]}); fix or void that run`);
}
const checkBlocks = (blocks, who) => blocks.forEach(({ control, variant }, i) => { assertFinite(control, `${who}: block ${i + 1} control`); assertFinite(variant, `${who}: block ${i + 1} variant`); });
const sorted = (xs) => num(xs).sort((p, q) => p - q);

/** Quantile by linear interpolation between order statistics (R type 7). null for an empty sample. */
export function quantile(xs, q) {
  const s = sorted(xs);
  if (!s.length) return null;
  const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const median = (xs) => quantile(xs, 0.5);
/** {n, median, q1, q3, iqr, min, max}. */
export function summary(xs) {
  const s = sorted(xs);
  if (!s.length) return { n: 0, median: null, q1: null, q3: null, iqr: null, min: null, max: null };
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75);
  return { n: s.length, median: quantile(s, 0.5), q1, q3, iqr: q3 - q1, min: s[0], max: s[s.length - 1] };
}

/**
 * Per-run frame counts: tick histogram, k>=5, k>=7, on-time (k<=2) (Chrome forms); dt>34 / dt>50 and the
 * phone's +-4 ms counts dt>30/38, dt>46/54, near34 = #(30 < dt <= 38), near50 = #(46 < dt <= 54), i.e. dt in
 * (th-4, th+4], half-open (th-4 excluded, th+4 included): the frames whose classification differs between the -4 and +4 ms counts (gt30 - gt38, gt46 - gt54; CLAUDE.md "Frame
 * thresholds", names agreed with ts-iphone-run's nearThreshold). Strict ">".
 */
export function frameCounts(dts) {
  const d = num(dts), hist = {};
  let k5 = 0, k7 = 0, onTime = 0, gt30 = 0, gt34 = 0, gt38 = 0, gt46 = 0, gt50 = 0, gt54 = 0;
  for (const dt of d) {
    const k = tick(dt);
    hist[k] = (hist[k] || 0) + 1;
    if (k >= K34) k5++;
    if (k >= K50) k7++;
    if (k <= 2) onTime++;
    if (dt > 30) gt30++;
    if (dt > 34) gt34++;
    if (dt > 38) gt38++;
    if (dt > 46) gt46++;
    if (dt > 50) gt50++;
    if (dt > 54) gt54++;
  }
  return { n: d.length, k5, k7, onTime, gt30, gt34, gt38, gt46, gt50, gt54, near34: gt30 - gt38, near50: gt46 - gt54, hist };
}

/** One run's scalar metrics from its frame times: counts plus p50/p95 in ms and in ticks. */
export function runMetrics(dts) {
  const c = frameCounts(dts);
  const p50 = quantile(dts, 0.5), p95 = quantile(dts, 0.95);
  return { ...c, p50Ms: p50, p95Ms: p95, p50Ticks: p50 == null ? null : tick(p50), p95Ticks: p95 == null ? null : tick(p95) };
}

// ---------------------------------------------------------------- two-sample and stratified comparisons

const improvements = (a, b, dir) => { const d = []; for (const x of a) for (const y of b) d.push(dir === 'lower' ? x - y : y - x); return d; };
const better = (x, y, dir) => (dir === 'lower' ? x < y : x > y); // x better than y

function combos(n, k, fn) {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k === 0) { fn(idx); return; }
  for (;;) {
    fn(idx);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** Exact null distribution of U over every split of one block's pooled values: Map(u -> count), total. */
function uDistribution(a, b, dir) {
  const pooled = [...a, ...b], N = pooled.length, m = b.length;
  if (N > 20) throw new Error('vanElteren: exact enumeration is limited to 20 runs per block');
  const dist = new Map();
  let total = 0;
  combos(N, m, (idx) => {
    const inB = new Set(idx), aa = [], bb = [];
    for (let i = 0; i < N; i++) (inB.has(i) ? bb : aa).push(pooled[i]);
    const u = uStat(aa, bb, dir);
    dist.set(u, (dist.get(u) || 0) + 1);
    total++;
  });
  return { dist, total };
}

/**
 * Exact van Elteren test: T = sum_b U_b / (N_b + 1), one-sided p = P(T* <= T_obs) under independent
 * within-block permutations. blocks: [{control: [...], variant: [...]}]. Small T = variant better.
 */
export function vanElteren(blocks, dir = 'lower') {
  if (!blocks.length) throw new Error('vanElteren: no blocks');
  checkBlocks(blocks, 'vanElteren');
  let acc = new Map([[0, 1]]), total = 1, t = 0;
  for (const { control: a, variant: b } of blocks) {
    if (!a.length || !b.length) throw new Error('vanElteren: empty arm in a block');
    const w = 1 / (a.length + b.length + 1);
    t += w * uStat(a, b, dir);
    const { dist, total: tb } = uDistribution(a, b, dir);
    const next = new Map();
    for (const [s, c] of acc) for (const [u, cu] of dist) { const k = Math.round((s + w * u) * 1e9) / 1e9; next.set(k, (next.get(k) || 0) + c * cu); }
    acc = next; total *= tb;
  }
  const tObs = Math.round(t * 1e9) / 1e9;
  let le = 0;
  for (const [s, c] of acc) if (s <= tObs + 1e-9) le += c;
  return { t: tObs, p: le / total, count: le, total };
}

/** Stratified HL: median of within-block pairwise improvements pooled over blocks (+ = variant better). */
export function stratifiedShift(blocks, dir = 'lower') {
  checkBlocks(blocks, 'stratifiedShift');
  return median(blocks.flatMap(({ control, variant }) => improvements(control, variant, dir)));
}

/** Aligned diagnostic: every run minus its own block's control median, then one pooled MW and HL. */
export function aligned(blocks, dir = 'lower') {
  checkBlocks(blocks, 'aligned');
  const a = [], b = [];
  for (const { control, variant } of blocks) { const c = median(control); a.push(...control.map((x) => x - c)); b.push(...variant.map((x) => x - c)); }
  const mw = mannWhitney(a, b, dir);
  return { test: 'aligned Mann-Whitney (diagnostic)', control: a, variant: b, u: mw.u, p: mw.p, shift: hodgesLehmann(a, b, dir) };
}

/** One block: summaries, exact one-sided MW (and the reverse direction), HL. */
export function compareBlock(control, variant, dir = 'lower') {
  assertFinite(control, 'control'); assertFinite(variant, 'variant');
  const mw = mannWhitney(control, variant, dir), rev = mannWhitney(control, variant, dir === 'lower' ? 'higher' : 'lower');
  return { test: 'exact Mann-Whitney, one-sided', dir, control: summary(control), variant: summary(variant), n: [control.length, variant.length], u: mw.u, p: mw.p, pWorse: rev.p, shift: hodgesLehmann(control, variant, dir) };
}

/** Pooled-over-blocks comparison (stratified by block). */
export function compareBlocks(blocks, dir = 'lower') {
  const ve = vanElteren(blocks, dir), rev = vanElteren(blocks, dir === 'lower' ? 'higher' : 'lower');
  return {
    test: 'exact van Elteren, one-sided, stratified by block', dir, blocks: blocks.length,
    n: [blocks.reduce((s, x) => s + x.control.length, 0), blocks.reduce((s, x) => s + x.variant.length, 0)],
    perBlock: blocks.map(({ control, variant }) => compareBlock(control, variant, dir)),
    t: ve.t, p: ve.p, pWorse: rev.p, shift: stratifiedShift(blocks, dir), aligned: aligned(blocks, dir),
  };
}

// ---------------------------------------------------------------- the sequential decision (§5.3)

export const BLOCK1_ALPHA = 1 / 70; // U = 0 at 4 vs 4
const DEFAULT_MIN_SHIFT = { ms: TICK_MS, ticks: 1, count: 1 };
// Phone ms metrics (arch-claims decision, 2026-10-01; protocol §5 by doc-protocol-v2): 1 ms stamps with no vsync
// grid (claims-audit §2.3), so the minimum shift is the +-4 ms threshold-sensitivity band, not a Chrome tick, and
// medians compare in whole ms (rounded; equal rounded medians tie). T1a's A/A may raise it: a parameter change.
export const PHONE_MIN_SHIFT_MS = 4;
/** Platforms decided by the phone rules (ms forms, no k forms, 4 ms, whole-ms medians); the simulator scores like
 * the phone (fidelity protocol §4.2) but is its own device: never pooled with phone or Chrome runs. */
export const PHONE_LIKE = new Set(['phone', 'simulator']);

/**
 * blocks: [{control, variant}] (1 or 2 so far; per-run scalars of ONE metric). unit 'ms' | 'ticks' | 'count'.
 * predicted: the predicted improvement (positive, metric units) or null. platform 'chrome' | 'phone' sets
 * the defaults: ms minShift 8.333 (1 tick) | 4, ms medians compared as 'ticks' | 'ms1' (whole ms); counts
 * and ticks are unchanged (minShift 1, medians 'raw'). minShift / medianCompare override them. Returns
 * {decision: 'win' | 'futile' | 'block2' | 'no-win', reason, rule, stats}; stats.choices records the rule used.
 */
export function sequentialDecision({ blocks, dir = 'lower', unit = 'ms', predicted = null, minShift = null, alpha = 0.05, block1Alpha = BLOCK1_ALPHA, medianCompare = null, platform = 'chrome' }) {
  if (!['lower', 'higher'].includes(dir)) throw new Error(`bad dir: ${dir}`);
  if (!(unit in DEFAULT_MIN_SHIFT)) throw new Error(`bad unit: ${unit} (ms | ticks | count)`);
  if (!blocks?.length) throw new Error('sequentialDecision: no blocks');
  if (blocks.length > 2) throw new Error('sequentialDecision: at most 2 blocks (a third only by the lead)');
  checkBlocks(blocks, 'sequentialDecision');
  if (!['chrome', ...PHONE_LIKE].includes(platform)) throw new Error(`bad platform: ${platform} (chrome | phone | simulator)`);
  const phoneMs = PHONE_LIKE.has(platform) && unit === 'ms';
  const ms = minShift ?? (phoneMs ? PHONE_MIN_SHIFT_MS : DEFAULT_MIN_SHIFT[unit]);
  const f = (x) => (x == null ? '-' : Math.round(x * 1000) / 1000);
  // ms medians compare as ticks on Chrome (§3.2); the phone has no k forms (CLAUDE.md, claims-audit §2.3): whole ms
  const mcmp = medianCompare ?? (phoneMs ? 'ms1' : unit === 'ms' ? 'ticks' : 'raw');
  if (!['ticks', 'ms1', 'raw'].includes(mcmp)) throw new Error(`bad medianCompare: ${mcmp} (ticks | ms1 | raw)`);
  const choices = { platform, unit, dir, minShift: ms, predicted, alpha, block1Alpha, medianCompare: mcmp };
  {
    const { control, variant } = blocks[0];
    const s = compareBlock(control, variant, dir);
    const need = Math.max(ms, predicted != null ? predicted / 2 : 0);
    const stats = { ...s, need, choices };
    const stop = (decision, reason, rule, stats) => (blocks.length === 1 ? { decision, reason, rule, stats }
      : { decision, stoppedAt: 1, reason: `block 1 stopped (${decision}): ${reason}; block 2 is outside the protocol (lead only) and was not evaluated`, rule, stats });
    const rule = `block 1: win iff U = 0 and p <= ${f(block1Alpha)} and HL >= max(minShift ${f(ms)}, predicted/2 ${predicted != null ? f(predicted / 2) : '-'}); futile iff variant median worse, or medians equal and HL <= 0`;
    if (s.u === 0 && s.p <= block1Alpha + 1e-12 && s.shift >= need - 1e-9) return stop('win', `U = 0, p ${f(s.p)}, HL ${f(s.shift)} >= ${f(need)}`, rule, stats);
    const asTicks = mcmp === 'ticks', q = asTicks ? tick : mcmp === 'ms1' ? Math.round : (x) => x;
    const mc = q(s.control.median), mv = q(s.variant.median);
    const medians = `medians ${asTicks ? `${mc} vs ${mv} ticks` : mcmp === 'ms1' ? `${mc} vs ${mv} ms (whole ms)` : `${f(mc)} vs ${f(mv)}`}`;
    if (better(mc, mv, dir)) return stop('futile', `variant median worse (${medians})`, rule, stats);
    if (mc === mv && s.shift <= 0) return stop('futile', `${medians} equal and HL ${f(s.shift)} <= 0`, rule, stats);
    if (blocks.length === 1) return { decision: 'block2', reason: `U ${s.u}, p ${f(s.p)}, HL ${f(s.shift)} (need U = 0, p <= ${f(block1Alpha)}, HL >= ${f(need)}); ${medians}: run block 2`, rule, stats };
  }
  const s = compareBlocks(blocks, dir);
  const stats = { ...s, need: ms, choices };
  const rule = `block 2: win iff stratified p <= ${alpha} and stratified HL >= minShift ${f(ms)}; otherwise no-win (a third block only by the lead)`;
  if (s.p <= alpha + 1e-12 && s.shift >= ms - 1e-9) return { decision: 'win', reason: `van Elteren p ${f(s.p)} <= ${alpha}, HL ${f(s.shift)} >= ${f(ms)}`, rule, stats };
  const worse = s.pWorse <= alpha ? `; variant significantly WORSE (p ${f(s.pWorse)})` : '';
  return { decision: 'no-win', reason: `van Elteren p ${f(s.p)}, HL ${f(s.shift)} (need p <= ${alpha}, HL >= ${f(ms)})${worse}`, rule, stats };
}

// ---------------------------------------------------------------- block orders (§5.3)

/** Run order of one block: 2 arms ABBA C V V C C V V C; 3 arms the rotated Latin square C A B / A B C / B C A. */
export function blockOrder(arms = 2) {
  if (arms === 2) return ['C', 'V', 'V', 'C', 'C', 'V', 'V', 'C'];
  if (arms === 3) return ['C', 'A', 'B', 'A', 'B', 'C', 'B', 'C', 'A'];
  throw new Error('blockOrder: 2 or 3 arms');
}

// ---------------------------------------------------------------- crossings (§3.4)

const UNITS = ['ih', 'lvh', 'svh', 'dvh'];

/**
 * y of threshold th for a frame with innerHeight ih. th: {id, y} (absolute) or {id, top, f, unit}.
 * viewport: {lvh, svh} (device px heights; phone: lvh = collapsed-toolbar innerHeight, svh = expanded).
 * tops: {id: documentTop} measured in the same run; overrides th.top.
 */
export function crossingY(th, ih, { viewport = {}, tops = {} } = {}) {
  if (typeof th.y === 'number') return { y: th.y, topSource: 'absolute' };
  const unit = th.unit ?? 'ih';
  if (!UNITS.includes(unit)) throw new Error(`threshold ${th.id}: bad unit ${unit} (${UNITS.join(' | ')})`);
  const fromRun = typeof tops[th.id] === 'number';
  const top = fromRun ? tops[th.id] : th.top;
  if (typeof top !== 'number') throw new Error(`threshold ${th.id}: no top (neither in the run nor static)`);
  const base = unit === 'ih' || unit === 'dvh' ? ih : viewport[unit];
  if ((th.f ?? 0) !== 0 && typeof base !== 'number') throw new Error(`threshold ${th.id}: unit ${unit} needs ${unit === 'ih' || unit === 'dvh' ? 'the frame innerHeight' : `viewport.${unit}`}`);
  return { y: top - (th.f ?? 0) * (base ?? 0), topSource: fromRun ? 'run' : 'static' };
}

/** Place one frame {yStart, yEnd, innerHeight}: every threshold's delta, and the nearest crossing. */
export function placeFrame(frame, thresholds, opts = {}) {
  // no scroll position (logger --y-source none): not placeable; Math.min(null, null) would read as y = 0
  if (![frame.yStart, frame.yEnd].every((y) => typeof y === 'number' && Number.isFinite(y))) return { nearest: null, all: [], noY: true };
  const lo = Math.min(frame.yStart, frame.yEnd), hi = Math.max(frame.yStart, frame.yEnd);
  let best = null;
  const all = thresholds.map((th) => {
    const { y, topSource } = crossingY(th, frame.innerHeight, opts);
    const delta = y < lo ? lo - y : y > hi ? hi - y : 0;
    const r = { id: th.id, unit: typeof th.y === 'number' ? 'px' : th.unit ?? 'ih', y, delta, topSource };
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = r;
    return r;
  });
  return { nearest: best, all };
}

/** Frames (normalized objects) with dt >= minDt placed at their nearest crossing. */
export function placeFrames(frames, thresholds, { minDt = tickThresholdMs(K34), ...opts } = {}) {
  return frames.filter((fr) => fr.dt >= minDt).map((fr) => {
    const { nearest, noY } = placeFrame(fr, thresholds, opts);
    return { ...(noY ? { noY: true } : {}), t: fr.t, dt: fr.dt, k: tick(fr.dt), yStart: fr.yStart, yEnd: fr.yEnd, innerHeight: fr.innerHeight, m: fr.m ?? null, crossing: nearest?.id ?? null, crossingY: nearest?.y ?? null, delta: nearest?.delta ?? null, unit: nearest?.unit ?? null, topSource: nearest?.topSource ?? null };
  });
}

// ---------------------------------------------------------------- input normalisation (both devices)

// fw-iphone-run/1 `fields` (ts-iphone-run 4f0bfd4/e96e5b5): [t, dt, yStart, yEnd, innerHeight, m, rafJsMs, probeMs, docH];
// rafJsMs is read as jsMs. yStart/yEnd/docH are null with --y-source none (such frames can't be placed).
const FIELDS = ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'jsMs', 'probeMs', 'docH'];

/** A frame as {t, dt, yStart, yEnd, innerHeight, m, jsMs, probeMs, docH} from a fw-iphone-run/1 tuple, an object, or a Chrome [t, dt, y]. */
export function normalizeFrame(fr, prevY = null, ih = null) {
  if (Array.isArray(fr)) {
    if (fr.length <= 3) { const y = fr[2] ?? null; return { t: fr[0], dt: fr[1], yStart: prevY ?? y, yEnd: y, innerHeight: ih, m: null, jsMs: null, probeMs: null, docH: null }; }
    const o = {}; FIELDS.forEach((k, i) => { o[k] = fr[i] ?? null; }); return o;
  }
  const yEnd = fr.yEnd ?? fr.y ?? null;
  return { t: fr.t, dt: fr.dt, yStart: fr.yStart ?? prevY ?? yEnd, yEnd, innerHeight: fr.innerHeight ?? ih, m: fr.m ?? null, jsMs: fr.jsMs ?? fr.rafJsMs ?? null, probeMs: fr.probeMs ?? null, docH: fr.docH ?? null };
}

const normFrames = (frames, ih) => { let prev = null; return frames.map((f) => { const n = normalizeFrame(f, prev, ih); prev = n.yEnd; return n; }); };
// legacy `iphone.mjs record` (finger) rows are [t, dt, y, innerHeight], without `fields`: not fw-iphone-run/1 tuples
const legacyRow = (f) => (Array.isArray(f) && f.length === 4 ? { t: f[0], dt: f[1], y: f[2], innerHeight: f[3] } : f);

/**
 * The platform a run file's data comes from, which sets the decision rules (sequentialDecision `platform`).
 * verify.json is 'chrome'. A frame-log file (fw-iphone-run/1 of iphone-run.mjs, legacy iphone.mjs scroll/record)
 * reads meta.device, checked in this order so a name that mentions two platforms lands on the right one:
 * 'simulator' / 'iOS Simulator (iPhone ...)' (tools/sim.mjs) -> simulator; 'Chrome ...' / 'HeadlessChrome ...,
 * iPhone 15 emulation' -> chrome; 'iPhone ...' (iphone-run.mjs DEVICE) / iPad / iOS / Safari -> phone. No
 * meta.device (or an unknown name): 'phone', and deviceAssumed() says so (the CLI prints a WARN). The UA is not
 * read (Chrome emulation can carry an iPhone UA).
 */
export function deviceOf(json) {
  if (Array.isArray(json?.results)) return 'chrome';
  const d = String(json?.meta?.device ?? '');
  if (/simulator/i.test(d)) return 'simulator'; // research/simulator/README.md §7: never pooled with others
  if (/chrome|chromium/i.test(d)) return 'chrome';
  if (/iphone|ipad|\bios\b|safari/i.test(d)) return 'phone';
  return 'phone';
}

/**
 * True when deviceOf() fell back to 'phone' because the frame-log file names no known device (no meta.device, or
 * one none of the patterns match): the caller should warn "device not recorded: phone rules assumed".
 */
export function deviceAssumed(json) {
  if (Array.isArray(json?.results)) return false;
  const d = String(json?.meta?.device ?? '');
  return !/simulator|chrome|chromium|iphone|ipad|\bios\b|safari/i.test(d);
}

/**
 * meta.driver (S scroll, W window, M morph, G gesture, F finger; DRIVERS in tools/lib/iphone-probe.mjs). Files
 * from before T1a carry none: a legacy `iphone.mjs record` file (summary.whileScrollYChanges) is F, a legacy
 * `iphone.mjs scroll` file (maxY + marks.scroll) is S (ts-iphone-run); anything else stays null (unknown).
 */
export function driverOf(json) {
  if (json?.meta?.driver != null) return json.meta.driver;
  if (json?.summary?.whileScrollYChanges) return 'F';
  if (json?.maxY != null && json?.marks?.scroll) return 'S';
  return null;
}

/**
 * Runs from one parsed JSON: verify.json (results[].frameLog.<phase>, Chrome [t, dt, y]; innerHeight from
 * `innerHeight` option) or an iPhone run file (schema fw-iphone-run/1 of `iphone.mjs run`, T1a: {fields, frames,
 * marks, meta: {driver, label, run, block, arm, pos, warmup}, mutations, crossings}; `void` is set by T2;
 * optional `tops` {id: documentTop} measured in the run). Returns [{label, run, block, arm,
 * pos, device ('chrome' | 'phone'), driver (driverOf; 'chrome' for verify.json), warmup, void, tops, frames}]
 * with normalized frames.
 */
export function runsFromJson(json, { phase = 'scroll', innerHeight = null, file = '' } = {}) {
  if (Array.isArray(json?.results)) {
    return json.results.filter((r) => !r.diff && r.frameLog?.[phase]).map((r) => ({
      label: r.label, run: r.run, block: r.block ?? null, arm: r.arm ?? null, pos: null, device: deviceOf(json), driver: 'chrome', warmup: false, void: false, tops: {}, source: file,
      frames: normFrames(r.frameLog[phase], innerHeight ?? r.innerHeight ?? null),
    }));
  }
  if (Array.isArray(json?.frames)) {
    const meta = json.meta || {};
    const mk = json.marks?.[phase];
    const tOf = (f) => (Array.isArray(f) ? f[0] : f.t);
    // phase 'all': every frame. A file with marks but none for this phase gives no frames (a counted run
    // without frames then throws in blocksFromRuns); a file without any marks keeps all frames, warned.
    let fr = json.frames, warning = null;
    if (phase !== 'all') {
      if (mk) fr = json.frames.filter((f) => tOf(f) >= mk[0] && tOf(f) <= mk[1]);
      else if (json.marks) { fr = []; warning = `no marks.${phase} (has ${Object.keys(json.marks).join(', ') || 'none'})`; }
      else warning = `no marks: all ${json.frames.length} frames used, incl. load and idle (pass --phase all to accept)`;
    }
    return [{ ...(warning ? { warning } : {}),
      label: meta.label ?? null, run: meta.run ?? 0, block: meta.block ?? null, arm: meta.arm ?? null, pos: meta.pos ?? null, device: deviceOf(json), ...(deviceAssumed(json) ? { deviceAssumed: true } : {}), driver: driverOf(json),
      warmup: !!meta.warmup, void: !!meta.void, sentinel: meta.sentinel ?? json.sentinel ?? null, tops: json.tops || meta.tops || {}, source: file,
      frames: normFrames(json.fields ? fr : fr.map(legacyRow), innerHeight),
    }];
  }
  return [];
}

/** Metric names a run can be scored by (runMetrics keys) with their unit and direction. */
export const METRICS = {
  k5: { unit: 'count', dir: 'lower' }, k7: { unit: 'count', dir: 'lower' }, gt34: { unit: 'count', dir: 'lower' }, gt50: { unit: 'count', dir: 'lower' },
  gt30: { unit: 'count', dir: 'lower' }, gt38: { unit: 'count', dir: 'lower' }, gt46: { unit: 'count', dir: 'lower' }, gt54: { unit: 'count', dir: 'lower' },
  p50Ms: { unit: 'ms', dir: 'lower' }, p95Ms: { unit: 'ms', dir: 'lower' }, p50Ticks: { unit: 'ticks', dir: 'lower' }, p95Ticks: { unit: 'ticks', dir: 'lower' },
};

/**
 * Chrome: every verdict is reported both ways (§3.2; arch-unknowns U2), a tick metric and its legacy ms twin.
 * k5 <-> gt34, k7 <-> gt50 (a verdict that differs is "threshold-sensitive"), p50Ms <-> p50Ticks, p95Ms <->
 * p95Ticks (one that differs is "tick-sensitive"). The phone uses PHONE_TWINS below instead.
 */
export const TWIN = { k5: 'gt34', gt34: 'k5', k7: 'gt50', gt50: 'k7', p50Ms: 'p50Ticks', p50Ticks: 'p50Ms', p95Ms: 'p95Ticks', p95Ticks: 'p95Ms' };
export const twinKind = (metric) => (/^(k|gt)\d/.test(metric) ? 'threshold-sensitive' : 'tick-sensitive');

/**
 * The phone has no k forms (CLAUDE.md "Frame thresholds": Safari rAF stamps are 1 ms, not vsync-quantized):
 * goal dt>50 and dt>34, each checked at +-4 ms (dt>46/54, dt>30/38); a verdict that differs across them is
 * "threshold-sensitive". Conservative: the verdict is flagged when EITHER the -4 or the +4 count's verdict
 * differs from the goal count's (this catches every case "differs between the -4 and +4 counts" does, and
 * more). Medians on the phone compare raw (ms), not as ticks.
 */
export const PHONE_TWINS = { gt50: ['gt46', 'gt54'], gt34: ['gt30', 'gt38'] };
export const K_FORMS = new Set(['k5', 'k7', 'p50Ticks', 'p95Ticks']);
/** The metrics a verdict on `metric` is also decided by, per device ('chrome' | 'phone'); [] when none. */
export function twinsFor(metric, device = 'chrome') {
  if (PHONE_LIKE.has(device)) return PHONE_TWINS[metric] ?? [];
  return TWIN[metric] ? [TWIN[metric]] : [];
}

/** Block ids in order: null first, then numeric-aware (2 before 10, 'b2' before 'b10'). */
export const compareBlockIds = (x, y) => (x == null ? (y == null ? 0 : -1) : y == null ? 1
  : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true }));

/**
 * Throws when the runs carry more than one device ('chrome' | 'phone' | 'simulator'; runsFromJson always sets
 * one, hand-built runs without a device are not counted): frames and verdicts never pool across devices
 * (research/simulator/README.md §7).
 */
export function assertOneDevice(runs, who = 'stats') {
  const by = new Map();
  for (const r of runs) if (r.device != null) by.set(r.device, (by.get(r.device) || 0) + 1);
  if (by.size > 1) throw new Error(`${who}: refusing to pool devices: ${[...by].map(([d, n]) => `${d} (${n})`).join(' with ')}; analyse each device on its own (research/simulator/README.md §7)`);
}

/**
 * Group counted runs (not warm-up, not void) into blocks per variant arm, in block-id order, of the given
 * metric. The control arm is 'C'. Returns {arms: {arm: [{block, control, variant}]}, dropped: [{arm, block,
 * reason}]}: a block without counted controls or without counted variant runs is dropped and reported.
 * A counted run without a finite frame time (empty log, no marks for the phase, dt all null/NaN) throws:
 * void it or fix it. `partial` lists counted runs where only some frame times are non-finite (scored on
 * the finite ones; the CLI warns).
 */
export function blocksFromRuns(runs, metric) {
  if (!METRICS[metric]) throw new Error(`unknown metric ${metric} (${Object.keys(METRICS).join(', ')})`);
  assertOneDevice(runs, 'blocksFromRuns');
  const counted = runs.filter((r) => !r.warmup && !r.void);
  if (counted.some((r) => r.arm == null)) throw new Error('blocksFromRuns: a counted run has no arm (meta.arm)');
  const finiteN = (r) => frameCounts(r.frames.map((f) => f.dt)).n;
  const name = (r) => r.source || r.label || '?';
  const empty = counted.filter((r) => !finiteN(r));
  if (empty.length) throw new Error(`blocksFromRuns: ${empty.length} counted run(s) have no frames with a finite frame time in the phase (${empty.map((r) => `${name(r)}${r.frames.length ? `: ${r.frames.length} frame(s), dt all non-finite` : ''}${r.warning ? `: ${r.warning}` : ''}`).join('; ')}); void them or fix the log`);
  const partial = counted.filter((r) => finiteN(r) < r.frames.length).map((r) => ({ source: name(r), block: r.block ?? null, arm: r.arm, frames: r.frames.length, finite: finiteN(r) }));
  const blockIds = [...new Set(runs.map((r) => r.block))].sort(compareBlockIds);
  const arms = [...new Set(runs.map((r) => r.arm))].filter((a) => a != null && a !== 'C');
  const val = (r) => runMetrics(r.frames.map((f) => f.dt))[metric];
  const out = {}, dropped = [];
  for (const arm of arms) {
    out[arm] = [];
    for (const b of blockIds) {
      const inB = counted.filter((r) => r.block === b);
      const x = { block: b, control: inB.filter((r) => r.arm === 'C').map(val), variant: inB.filter((r) => r.arm === arm).map(val) };
      if (x.control.length && x.variant.length) out[arm].push(x);
      else dropped.push({ arm, block: b, reason: `${x.control.length} counted control and ${x.variant.length} counted ${arm} run(s)` });
    }
  }
  return { arms: out, dropped, partial };
}

/**
 * Frames near the phone thresholds, per arm and block, per run (§5.3: every run, never frames pooled across
 * runs or blocks): {arm: [{block, runs: [{source, run, pos, frames, near50, near34, gt50, gt34}], near50, near34,
 * gt50, gt34 (each summary() over the block's runs: median [IQR])}]}, counted runs only, blocks in id order.
 */
export const NEAR_KEYS = ['near50', 'near34', 'gt50', 'gt34'];
export function nearByBlock(runs) {
  assertOneDevice(runs, 'nearByBlock');
  const counted = runs.filter((r) => !r.warmup && !r.void), out = {};
  const ids = [...new Set(counted.map((r) => r.block))].sort(compareBlockIds);
  for (const arm of [...new Set(counted.map((r) => r.arm))].sort((x, y) => (x === 'C' ? -1 : y === 'C' ? 1 : String(x).localeCompare(String(y))))) {
    out[arm] = ids.map((b) => {
      const rs = counted.filter((r) => r.arm === arm && r.block === b).sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0)).map((r) => {
        const c = frameCounts(r.frames.map((f) => f.dt));
        return { source: r.source || r.label || null, run: r.run ?? null, pos: r.pos ?? null, frames: c.n, ...Object.fromEntries(NEAR_KEYS.map((k) => [k, c[k]])) };
      });
      return rs.length ? { block: b, runs: rs, ...Object.fromEntries(NEAR_KEYS.map((k) => [k, summary(rs.map((x) => x[k]))])) } : null;
    }).filter(Boolean);
  }
  return out;
}

/**
 * Block-shape warnings (§5.2, §5.3), per block: <= 9 counted runs; n per arm (4 for 2 arms, 3 for 3 arms);
 * exactly one warm-up, before the first counted run; counted runs in the ABBA / Latin-square order by pos;
 * control runs without a sentinel record (`meta.sentinel`: T2 sets it and `void`; T3 does not judge it);
 * counted runs of more than one driver, or none (F-071), a warm-up of another driver; across blocks, a variant
 * arm whose decision would pool blocks of different drivers.
 */
export function blockWarnings(runs) {
  const out = [];
  const ids = [...new Set(runs.map((r) => r.block))].sort(compareBlockIds);
  for (const b of ids) {
    const inB = runs.filter((r) => r.block === b), counted = inB.filter((r) => !r.warmup && !r.void), warm = inB.filter((r) => r.warmup);
    const tag = `block ${b ?? '-'}`;
    const arms = [...new Set(counted.map((r) => r.arm))];
    const per = arms.length === 3 ? 3 : 4;
    if (counted.length > 9) out.push(`${tag}: ${counted.length} counted runs (max 9)`);
    for (const a of arms) { const n = counted.filter((r) => r.arm === a).length; if (n !== per) out.push(`${tag}: arm ${a} has ${n} counted runs (expected ${per})`); }
    if (warm.length !== 1) out.push(`${tag}: ${warm.length} warm-up runs (expected 1)`);
    if (inB.length && inB.every((r) => typeof r.pos === 'number')) {
      const byPos = [...inB].sort((x, y) => x.pos - y.pos);
      if (warm.length === 1 && byPos.indexOf(warm[0]) > byPos.findIndex((r) => !r.warmup)) out.push(`${tag}: the warm-up is not before the first counted run`);
      if ((arms.length === 2 || arms.length === 3) && !inB.some((r) => r.void)) {
        const order = blockOrder(arms.length), seq = byPos.filter((r) => !r.warmup).map((r) => r.arm);
        const as = arms.length === 2 ? (a) => (a === 'C' ? 'C' : 'V') : (a) => a;
        if (seq.map(as).join(' ') !== order.join(' ')) out.push(`${tag}: run order ${seq.join(' ')} is not ${order.join(' ')}`);
      }
    } else out.push(`${tag}: run positions (meta.pos) missing: order not checked`);
    const noSentinel = counted.filter((r) => r.arm === 'C' && r.sentinel == null).length;
    if (noSentinel) out.push(`${tag}: sentinel not checked here (T2 sets void); ${noSentinel} control run(s) carry no sentinel record`);
    // a block names one driver (§5); F-071: F/G runs show ~80 Hz rAF stretches, S/W/M 60 Hz, so fps and frame
    // totals don't compare across drivers (the ms-threshold counts do; CLAUDE.md "Frame thresholds")
    const drivers = [...new Set(counted.map((r) => r.driver ?? '?'))].sort();
    if (drivers.length > 1) out.push(`${tag}: mixed drivers ${drivers.map((d) => `${d} ${counted.filter((r) => (r.driver ?? '?') === d).length}`).join(', ')} (a block names one driver; F-071: fps and frame totals of F/G and S/W/M runs don't compare; '?' = no meta.driver)`);
    else if (drivers[0] === '?') out.push(`${tag}: no meta.driver on its ${counted.length} counted run(s): driver unknown (a block names one driver)`);
    const wd = warm.map((r) => r.driver ?? '?').filter((d) => drivers.length && !drivers.includes(d));
    if (wd.length) out.push(`${tag}: warm-up driver ${wd.join(', ')} is not the counted runs' (${drivers.join(', ')})`);
  }
  // one decision pools every block of a variant arm (van Elteren): its blocks must share one driver (§5: a claim
  // names one driver), which the per-block check above can't see (block 1 all S, block 2 all F)
  if (ids.length > 1) {
    const counted = runs.filter((r) => !r.warmup && !r.void);
    for (const arm of [...new Set(counted.map((r) => r.arm))].filter((a) => a != null && a !== 'C')) {
      const per = ids.map((b) => [b, [...new Set(counted.filter((r) => r.block === b && (r.arm === 'C' || r.arm === arm)).map((r) => r.driver ?? '?'))].sort()]).filter(([, d]) => d.length);
      if (new Set(per.flatMap(([, d]) => d)).size > 1) out.push(`arm ${arm}: blocks ${per.map(([b, d]) => `${b ?? '-'} ${d.join('+')}`).join(', ')}: one decision mixes drivers (F-071)`);
    }
  }
  return out;
}
