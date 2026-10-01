#!/usr/bin/env node
// Morph clock-shift replay (unknowns-actions D4, X-U2; de-unknowns-ux, 2026-10-01). Offline only: reads the
// committed morph-driver logs fixes/iphone-wave2/raw/md-*.json, no device, no Chrome.
//   node research/design-engineering/morph-clock-replay.mjs [--tweens] [--json]
//
// The tween (JS 13020-13034): E() sets o = performance.now(); every rAF T(e) writes m = ZM(i, a, e - o), i.e.
// i + (a - i)*(1 - (1 - (e - o)/680)^3). The first T call writes m > 0.001, which flips the panel scene to active
// (JS 13196): that frame's render is the expensive activation gap (p50 48 ms). The next T call then writes the
// content for e - o = ~e1 + 48 ms, at the ease-out's peak velocity (3.26 px/ms): the 94 px p50 leap (unknowns-ux U2).
//
// Reconstruction. The logger's m lags one frame: m[i+1] = M(t[i] - o) (checked on every tween, residual < 0.001
// in m, < 0.7 px). a = the tween's first rAF (m[a] = start, m[a+1] != start); o = t[a] - e1, e1 = inverse ease of
// m[a+1]. Content written at rAF j: c_j = M(t_j - o').
//
// Variants (the clock start o'; c_a is the activation frame's content):
//   base   o' = o                    (as shipped)
//   naive  o' = t_a, c_a = 0          (start the clock at the first rAF timestamp instead of performance.now())
//   A1     o' = t_{a+1} - 16.67, c_a = 0  (the first T call only activates; the clock starts one nominal frame before
//          the next rAF, so the activation gap carries no motion and the first step is one 60 Hz step)
//   A0     o' = t_{a+1}, c_a = 0      (same, the clock starts at the next rAF: one extra still frame)
//   clamp  o' = o, but the clock advances at most 25 ms per frame (a frame-paced clock: a bound, not a proposal;
//          it stretches the tween by the clipped time)
// dt models (frame costs):
//   T      de-pm-morph's time-since-start model (postmortem-morph.md §1): frame dt is a function of the time since
//          the tween started, not of m, so the logged dt sequence is kept as is (primary).
//   Mf     H3 alternative ("cost follows the per-frame panel change"): a frame whose content does not change is light;
//          for A0 one 16.67 ms frame is inserted after the activation gap and the logged sequence follows it.
//   P17    the countdown-repaint removal (P-017, gh-cdwc), modelled from postmortem-morph §1b: in the first 450 ms
//          after the activation gap, a heavy frame (k >= 4) loses the face-repaint composite cost C (hi: 30 ms
//          before 150 ms, 22 after; lo: half of that), floored at 2 ticks, quantized to ticks. The activation gap
//          itself is kept (layer creation: R5, not P-017).
// Metrics (unknowns-ux §1.1), on the nav edge (739 px * |dm|), per moving frame:
//   MWFI   content pairing: the step c_j - c_{j-1} with dt_j (as unknowns-ux-metric.mjs, comparable to §1.2);
//   MWFIp  presentation pairing: the same step with the hold before it is shown, dt_{j+1};
//   JUMP   dx*(1 - 16.67/dt) (content pairing), p95 and max over all frames; JTW = median over tweens of the tween's max;
//   ACTpx  the step that crosses the activation gap (median over tweens);
//   LAT1   ms from t_a to the presentation (next rAF) of the first step >= 1 px; LAT50: to the first content >= 50 %;
//   END    ms from t_a to the presentation of the final value.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metrics } from './unknowns-ux-metric.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(here, '../../fixes/iphone-wave2/raw');
const D = 680, PX = 739, F60 = 1000 / 60, TICK = 1000 / 120;
const Y = (u) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;
const Yi = (y) => 1 - Math.cbrt(1 - y);
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const med = (a) => q(a, 0.5);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

// Cool driver runs (unknowns-ux §1.2; warm runs void per protocol v2 sentinel).
export const GROUPS = { f: ['f1', 'f2', 'f3'], g: ['g1', 'g2', 'g3', 'g7', 'g8', 'g9'], gh: ['gh1', 'gh4', 'gh5', 'gh6'], ghb: ['ghb1', 'ghb2', 'ghb3'] };

// Tweens of one driver log: {fwd, e1, t: [rAF ts from a on], dt: [gap ending at each ts]}, plus the reconstruction residual.
export function tweens(file) {
  const f = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8')).frames;
  const out = [];
  for (let a = 1; a < f.length - 2; a++) {
    const s = f[a][3];
    if (!(s === 0 || s === 1) || f[a - 1][3] !== s || f[a + 1][3] === s) continue;
    const fwd = s === 0, e1 = Yi(fwd ? f[a + 1][3] : 1 - f[a + 1][3]) * D, o = f[a][0] - e1;
    let res = 0, b = a;
    for (let j = a; j < f.length - 1; j++) {
      const c = fwd ? Y((f[j][0] - o) / D) : 1 - Y((f[j][0] - o) / D);
      res = Math.max(res, Math.abs(c - f[j + 1][3])); b = j;
      if (f[j + 1][3] === (fwd ? 1 : 0)) break;
    }
    // keep the following hold frames too: a later clock needs frames past b
    const end = Math.min(f.length, b + 40);
    out.push({ fwd, e1, res, n: b - a + 1, t: f.slice(a, end).map((r) => r[0]), dt: f.slice(a, end).map((r) => r[1]) });
    a = b;
  }
  return out;
}

const quant = (dt) => Math.max(2, Math.round(dt / TICK)) * TICK;

// dt model -> {t, dt} arrays (index 0 = rAF a, 1 = a+1: its dt is the activation gap)
function applyModel(tw, model, variant) {
  let dt = [...tw.dt];
  if (model === 'P17hi' || model === 'P17lo') {
    // ts = time since the tween's first rAF (postmortem-morph's "start"), at the frame's end
    const s = model === 'P17hi' ? 1 : 0.5; let ts = 0;
    dt = dt.map((d, j) => {
      if (j === 0) return d;
      let nd = d;
      if (j >= 2 && ts + d <= 450 && Math.round(d / TICK) >= 4) nd = quant(Math.max(F60, d - (ts + d <= 150 ? 30 : 22) * s));
      ts += nd; return nd;
    });
  }
  if (model === 'Mf' && variant === 'A0') dt = [dt[0], dt[1], F60, ...dt.slice(2)];
  const t = [tw.t[0]]; for (let j = 1; j < dt.length; j++) t.push(t[j - 1] + dt[j]);
  return { t, dt };
}

// content per rAF index for a variant
function contents(tw, t, dt, variant) {
  const ta = t[0], o = ta - tw.e1, c = [];
  let clock = tw.e1;
  for (let j = 0; j < t.length; j++) {
    let e;
    if (variant === 'base') e = t[j] - o;
    else if (variant === 'naive') e = t[j] - ta;
    else if (variant === 'A1') e = j === 0 ? 0 : t[j] - (t[1] - F60);
    else if (variant === 'A0') e = j === 0 ? 0 : t[j] - t[1];
    else if (variant === 'clamp') { if (j > 0) clock += Math.min(dt[j], 25); e = clock; }
    c.push(Y(e / D));
    if (e >= D) break;
  }
  return c;
}

function replayTween(tw, variant, model) {
  const { t, dt } = applyModel(tw, model, variant);
  const c = contents(tw, t, dt, variant);
  if (c.length >= t.length) return null; // ran out of logged frames (never with +40 hold frames)
  const fr = [], frP = []; let prev = 0, lat1 = null, lat50 = null, act = null, jmax = 0;
  for (let j = 0; j < c.length; j++) {
    const dx = Math.abs(c[j] - prev) * PX; prev = c[j];
    const present = t[j + 1] - t[0]; // content written at rAF j is shown at about the next rAF
    if (lat1 === null && c[j] * PX >= 1) lat1 = present;
    if (lat50 === null && c[j] >= 0.5) lat50 = present;
    if (j === 0) continue; // c_0's dt is the gap before the tween's first rAF (not a tween frame)
    if (j === 1) act = dx;
    fr.push({ t: t[j], dt: dt[j], dx });
    frP.push({ t: t[j + 1], dt: dt[j + 1], dx });
    jmax = Math.max(jmax, dx * Math.max(0, 1 - F60 / dt[j]));
  }
  // the first step (c_0 - start) is shown after the activation gap: count it in both pairings with that gap
  const dx0 = c[0] * PX;
  if (dx0 > 0) { fr.unshift({ t: t[0], dt: tw.dt[0], dx: dx0 }); frP.unshift({ t: t[1], dt: dt[1], dx: dx0 }); }
  return { fr, frP, lat1, lat50, end: t[c.length] - t[0], act, jmax };
}

export const VARIANTS = ['base', 'naive', 'A1', 'A0', 'clamp'];
export function replay(runs, variant, model = 'T') {
  const fr = [], frP = [], lat1 = [], lat50 = [], end = [], act = [], jmax = [];
  for (const run of runs) for (const tw of tweens(`md-${run}.json`)) {
    const r = replayTween(tw, variant, model); if (!r) continue;
    fr.push(...r.fr); frP.push(...r.frP); lat1.push(r.lat1); lat50.push(r.lat50); end.push(r.end); act.push(r.act); jmax.push(r.jmax);
  }
  const m = metrics(fr), mp = metrics(frP);
  return { tweens: end.length, MWFI: m.MWFI, MWFIp: mp.MWFI, HTR: m.HTR, JUMPp95: m.JUMPp95, JUMPmax: m.JUMPmax, JTW: r1(med(jmax)),
    ACTpx: r1(med(act)), LAT1: r1(med(lat1)), LAT50: r1(med(lat50)), END: r1(med(end)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const all = Object.values(GROUPS).flat();
  if (process.argv.includes('--tweens')) {
    for (const run of all) for (const tw of tweens(`md-${run}.json`))
      console.log(run.padEnd(6), tw.fwd ? 'F' : 'R', `e1 ${tw.e1.toFixed(1)}`.padEnd(9), `res ${(tw.res * PX).toFixed(2)}px`, `n ${tw.n}`, 'dt', tw.dt.slice(0, 8).join(' '));
    process.exit(0);
  }
  const out = {};
  const cols = ['tweens', 'MWFI', 'MWFIp', 'HTR', 'JUMPp95', 'JUMPmax', 'JTW', 'ACTpx', 'LAT1', 'LAT50', 'END'];
  const rows = [];
  for (const model of ['T', 'Mf', 'P17lo', 'P17hi']) for (const [g, runs] of [['all', all], ...Object.entries(GROUPS)]) for (const v of VARIANTS) {
    if (model === 'Mf' && v !== 'A0') continue;
    if (model !== 'T' && g !== 'all' && g !== 'gh') continue;
    const r = replay(runs, v, model); (out[model] ??= {})[g] ??= {}; out[model][g][v] = r;
    rows.push([`${model} ${g} ${v}`, r]);
  }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  console.log(['model group variant'.padEnd(20), ...cols.map((c) => c.padStart(7))].join(' '));
  for (const [k, r] of rows) console.log([k.padEnd(20), ...cols.map((c) => String(r[c]).padStart(7))].join(' '));
}
