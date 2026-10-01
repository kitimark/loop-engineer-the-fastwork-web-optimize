#!/usr/bin/env node
// Fit the perceptual metrics to the user's ratings from the pacing page (pacing/index.html; unknowns-ux U3, F5).
//   node research/design-engineering/pacing-fit.mjs <results.json>   # window.__fwPacing / localStorage "fwPacing"
//   node research/design-engineering/pacing-fit.mjs --synthetic      # ideal 60 Hz patterns: what each metric predicts
// Per trial: frames = the presented updates (shown[] rAF times); dt = gap between presents; dx = v*dt (the content is
// time-driven). Metrics from unknowns-ux-metric.mjs. Score = Spearman rho of each metric vs the rating (1 smooth .. 5
// janky), pooled and per speed. A metric that ranks the patterns as the user does has rho near +1.
import fs from 'node:fs';
import { metrics } from './unknowns-ux-metric.mjs';

const KEYS = ['MWFI', 'HTR', 'STUTperS', 'RUNmax', 'JUMPp95', 'JUMPmax', 'ODD', 'p50dt', 'gt34', 'fps'];

function trialMetrics(t) {
  const s = t.shown.filter((x) => x - t.shown[0] <= 4000), ys = t.ys || s.map((x) => (t.v * (x - s[0])) / 1000);
  const fr = s.map((x, i) => ({ t: x, dt: i ? x - s[i - 1] : 0, dx: i ? Math.abs(ys[i] - ys[i - 1]) : 0 }));
  const m = metrics(fr), dts = fr.slice(1).map((f) => f.dt).sort((a, b) => a - b);
  const secs = (s[s.length - 1] - s[0]) / 1000;
  return { ...m, p50dt: Math.round(dts[dts.length >> 1] * 10) / 10, gt34: dts.filter((d) => d >= 37.5).length / secs, fps: Math.round((dts.length / secs) * 10) / 10 };
}

const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
const spearman = (x, y) => { const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n; let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (rx[i] - mx) * (ry[i] - my); b += (rx[i] - mx) ** 2; c += (ry[i] - my) ** 2; } return b && c ? Math.round((a / Math.sqrt(b * c)) * 100) / 100 : null; };

function synthetic(T = 1000 / 60) {
  const per = (ms) => Math.max(1, Math.round(ms / T));
  const P = { steady: [1], g50: [per(50), 1, 1, 1, 1], s30: [per(33.33)], uneven: [2, 1], g100: [per(100), ...Array(Math.round(900 / T)).fill(1)] };
  const trials = [];
  for (const v of [600, 1600]) for (const [pattern, seq] of Object.entries(P)) {
    const shown = []; let t = 0, i = 0; while (t <= 4000) { shown.push(t); t += seq[i++ % seq.length] * T; }
    trials.push({ pattern, v, seq, shown });
  }
  // eased trials as the page draws them: morph tween 739 px / 680 ms ease-out cubic + 600 ms rest, 60 Hz ticks skipped
  for (const [ease, skip] of [['early', [2, 3, 5, 6, 8, 9]], ['late', [30, 31, 33, 34, 36, 37]]]) {
    const shown = [], ys = [];
    for (let t = 0; t <= 4000; t += T) {
      const cyc = Math.floor(t / 1280), ph = t - cyc * 1280, u = Math.min(1, ph / 680);
      if (skip.includes(Math.round(ph / (1000 / 60)))) continue;
      shown.push(t); ys.push(cyc * 739 + 739 * (1 - (1 - u) ** 3));
    }
    trials.push({ pattern: `ease-${ease}`, v: 0, ease, shown, ys });
  }
  return { page: 'synthetic', rafMs: T, trials };
}

const arg = process.argv[2];
if (!arg) { console.error('usage: pacing-fit.mjs <results.json> | --synthetic'); process.exit(2); }
const res = arg === '--synthetic' ? synthetic() : JSON.parse(fs.readFileSync(arg, 'utf8'));
const rows = res.trials.map((t) => ({ t, m: trialMetrics(t) }));
console.log(`page ${res.page}  rAF ${res.rafMs} ms  trials ${rows.length}`);
console.log(['pattern'.padEnd(8), 'v'.padStart(5), 'rate'.padStart(4), ...KEYS.map((k) => k.padStart(8))].join(' '));
for (const { t, m } of rows) console.log([t.pattern.padEnd(8), String(t.v).padStart(5), String(t.rating ?? '-').padStart(4), ...KEYS.map((k) => String(Math.round(m[k] * 10) / 10).padStart(8))].join(' '));
if (arg === '--synthetic') {
  // do the patterns separate the metrics? rank agreement between metrics across the 10 trials
  console.log('\nmetric-vs-metric Spearman (low = the ranking can tell them apart):');
  for (let i = 0; i < KEYS.length; i++) console.log(KEYS[i].padEnd(9), KEYS.map((k) => String(spearman(rows.map((r) => r.m[KEYS[i]]), rows.map((r) => r.m[k]))).padStart(6)).join(' '));
  process.exit(0);
}
const rated = rows.filter((r) => Number.isFinite(r.t.rating));
const reps = rated.filter((r) => r.t.repeat).map((r) => { const first = rated.find((x) => !x.t.repeat && x.t.pattern === r.t.pattern && x.t.v === r.t.v); return first ? Math.abs(first.t.rating - r.t.rating) : null; });
console.log(`\nrepeat consistency |Δrating|: ${reps.join(', ')} (≤ 1 = usable)`);
console.log('Spearman rho vs rating:  metric   all   600   1600');
for (const k of KEYS) {
  const sub = (f) => { const a = rated.filter(f); return spearman(a.map((r) => r.m[k]), a.map((r) => r.t.rating)); };
  console.log(`  ${k.padEnd(9)} ${String(sub(() => true)).padStart(6)} ${String(sub((r) => r.t.v === 600)).padStart(6)} ${String(sub((r) => r.t.v === 1600)).padStart(6)}`);
}
