// Tier B statistics (tools/bench.mjs gain | calibrate), design §3. The unit is one run (one fresh page,
// one scenario pass); n = 5 per side, ABBA. No bootstrap at n = 5; no pairing (Wilcoxon on 5 pairs
// can't go below two-sided p = 0.0625).
//
//   mannWhitney(a, b, dir)  exact one-sided p of "b improves on a" (dir 'lower': b smaller), ties by
//                           midranks (U counts ties as 1/2), by enumerating every split of the pooled values
//   hodgesLehmann(a, b, dir) median of the n*m improvements (a_i - b_j for 'lower')
//   mosesCI(a, b, dir)      distribution-free CI of that shift: the (c+1)th smallest to the (c+1)th largest
//                           improvement, c = the largest U with P(U <= c) <= alpha/2 (5 vs 5: 3rd, ~96.8 %)
//   gainVerdict(...)        HOLDS / REGRESSED / INCONCLUSIVE with the host gate and calibration staleness
//   experimentOutcome(...)  better / within-noise / worse (for bench.json experiments[])

function combos(n, k, fn) {
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    fn(idx);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}
const MAX_N = 20;

/** U = #{(i,j): b_j "worse" than a_i} + 1/2 ties; small U = b improves on a in direction `dir`. */
export function uStat(a, b, dir = 'lower') {
  let u = 0;
  for (const x of a) for (const y of b) {
    const worse = dir === 'lower' ? y > x : y < x;
    u += worse ? 1 : y === x ? 0.5 : 0;
  }
  return u;
}

/** Exact one-sided Mann-Whitney p = P(U* <= U_obs) over every split of the pooled values. */
export function mannWhitney(a, b, dir = 'lower') {
  const n = a.length, m = b.length, N = n + m;
  if (!n || !m) throw new Error('mannWhitney: empty sample');
  if (N > MAX_N) throw new Error(`mannWhitney: exact enumeration is limited to ${MAX_N} values`);
  const pooled = [...a, ...b];
  const u = uStat(a, b, dir);
  let le = 0, total = 0;
  combos(N, m, (idx) => {
    const inB = new Set(idx);
    const bb = [], aa = [];
    for (let i = 0; i < N; i++) (inB.has(i) ? bb : aa).push(pooled[i]);
    total++;
    if (uStat(aa, bb, dir) <= u + 1e-9) le++;
  });
  return { u, p: le / total, count: le, total };
}

/** Null distribution of U without ties: cumulative P(U <= c) for c = 0..n*m. */
export function uNullCdf(n, m) {
  const counts = new Array(n * m + 1).fill(0);
  let total = 0;
  const ranks = Array.from({ length: n + m }, (_, i) => i + 1);
  combos(n + m, m, (idx) => {
    const inB = new Set(idx);
    let u = 0;
    for (let i = 0; i < ranks.length; i++) if (!inB.has(i)) for (const j of idx) if (ranks[j] > ranks[i]) u++;
    counts[u]++; total++;
  });
  let acc = 0;
  return counts.map((c) => (acc += c) / total);
}

const improvements = (a, b, dir) => { const d = []; for (const x of a) for (const y of b) d.push(dir === 'lower' ? x - y : y - x); return d.sort((p, q) => p - q); };
const median = (s) => { const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** Hodges-Lehmann shift: median of the pairwise improvements (positive = b better). */
export const hodgesLehmann = (a, b, dir = 'lower') => median(improvements(a, b, dir));

/** Moses CI of the shift. {lo, hi, coverage}; lo/hi null when n, m are too small for alpha. */
export function mosesCI(a, b, dir = 'lower', alpha = 0.05) {
  const d = improvements(a, b, dir);
  const cdf = uNullCdf(a.length, b.length);
  let c = -1;
  while (c + 1 < cdf.length && cdf[c + 1] <= alpha / 2 + 1e-12) c++;
  if (c < 0) return { lo: null, hi: null, coverage: 1, k: 0 };
  return { lo: d[c], hi: d[d.length - 1 - c], coverage: 1 - 2 * cdf[c], k: c + 1 };
}

/** The A/A noise floor: minEffect = half-width of the Moses CI of an A/A (5 vs 5). */
export function calibrate(a, b, dir = 'lower') {
  const ci = mosesCI(a, b, dir);
  if (ci.lo == null) throw new Error('calibrate: too few runs for a Moses CI (need at least 4 vs 4)');
  return { shift: hodgesLehmann(a, b, dir), ci, minEffect: (ci.hi - ci.lo) / 2 };
}

/** Host band of a set of runs, from per-run {loadInvalid, loadWarn} (tools/lib/host.mjs classifyRun). */
export function hostBand(runs) {
  if (runs.some((r) => r.loadInvalid)) return 'contaminated';
  if (runs.some((r) => r.loadWarn)) return 'warn';
  return 'clean';
}

/**
 * Tier B verdict. a = baseline runs, b = patched runs (the metric), dir = the claimed direction.
 * calibration {minEffect, toolsSha, chromeMajor, setting, band}; current {toolsSha, chromeMajor, setting}
 * (setting: time domain, CPU throttle, serve args);
 * authored {shift} or null; hosts: per-run gate records.
 */
export function gainVerdict({ a, b, dir, calibration, current, authored = null, hosts = [], alpha = 0.05 }) {
  const band = hostBand(hosts);
  const base = { band };
  const invalid = hosts.map((h, i) => (h.loadInvalid ? `run ${i + 1}: ${(h.reasons || []).join(', ') || 'contaminated'}` : null)).filter(Boolean);
  if (invalid.length) return { ...base, verdict: 'INCONCLUSIVE', reason: `contaminated: ${invalid.join('; ')}` };
  if (!calibration) return { ...base, verdict: 'INCONCLUSIVE', reason: 'no calibration: run bench.mjs calibrate first' };
  const stale = [];
  if (calibration.toolsSha !== current.toolsSha) stale.push(`toolsSha ${calibration.toolsSha} -> ${current.toolsSha}`);
  if (calibration.chromeMajor !== current.chromeMajor) stale.push(`Chrome ${calibration.chromeMajor} -> ${current.chromeMajor}`);
  if ((calibration.setting ?? null) !== (current.setting ?? null)) stale.push(`setting ${calibration.setting} -> ${current.setting}`);
  if (calibration.band !== 'clean') stale.push(`calibration band ${calibration.band}`);
  if (stale.length) return { ...base, verdict: 'INCONCLUSIVE', reason: `stale calibration (${stale.join(', ')}): re-run bench.mjs calibrate` };
  if (authored && authored.toolsSha && authored.toolsSha !== current.toolsSha) return { ...base, verdict: 'INCONCLUSIVE', reason: `authored effect from toolsSha ${authored.toolsSha}: re-author (calibrate + gain) on a quiet host` };
  const mw = mannWhitney(a, b, dir), worse = mannWhitney(a, b, dir === 'lower' ? 'higher' : 'lower');
  const shift = hodgesLehmann(a, b, dir), ci = mosesCI(a, b, dir, alpha);
  const budget = Math.max(calibration.minEffect, authored ? 0.5 * authored.shift : 0);
  const stats = { ...base, p: mw.p, pWorse: worse.p, u: mw.u, shift, ci, budget, minEffect: calibration.minEffect };
  if (mw.p <= alpha && shift >= budget) return { ...stats, verdict: 'HOLDS', reason: `p ${fmt(mw.p)} <= ${alpha}, shift ${fmt(shift)} >= budget ${fmt(budget)}` };
  if (worse.p <= alpha) return { ...stats, verdict: 'REGRESSED', reason: `significant shift in the wrong direction (p ${fmt(worse.p)})` };
  if (ci.hi != null && ci.hi < budget) return { ...stats, verdict: 'REGRESSED', reason: `CI upper ${fmt(ci.hi)} < budget ${fmt(budget)}: confidently smaller than ${authored ? 'half the authored gain' : 'the noise floor'}` };
  return { ...stats, verdict: 'INCONCLUSIVE', reason: `p ${fmt(mw.p)}, shift ${fmt(shift)} vs budget ${fmt(budget)}: neither held nor regressed` };
}

/** better / worse / within-noise for an experiment row (inconclusive when contaminated or stale). */
export function experimentOutcome(args) {
  const v = gainVerdict({ ...args, authored: null });
  if (v.p == null) return { outcome: 'inconclusive', ...v };
  const bigger = (x) => x >= args.calibration.minEffect;
  if (v.p <= (args.alpha ?? 0.05) && bigger(v.shift)) return { ...v, outcome: 'better' };
  if (v.pWorse <= (args.alpha ?? 0.05) && bigger(-v.shift)) return { ...v, outcome: 'worse' };
  return { ...v, outcome: 'within-noise' };
}

function fmt(x) { return x == null ? '-' : Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 1000) / 1000; }
export { fmt };
