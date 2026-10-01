#!/usr/bin/env node
// Perceptual frame metrics from the committed iPhone per-frame logs (de-unknowns-ux, 2026-10-01).
// Offline only: reads fixes/iphone-wave2/raw/*.json, no device, no Chrome.
//   node research/design-engineering/unknowns-ux-metric.mjs [--json | --groups]   (--groups: the tables in unknowns-ux.md §1)
//
// Per frame i: dt_i (rAF gap), dx_i = displacement of the tracked motion between frames i-1 and i
// (|scrollY delta| for scroll; 739 CSS px * |--morph delta| for the morph panel's bottom edge, nav height
// 52 + 739m, morph-endpage §1.2). Metrics over "moving" frames (dx > 0):
//   MWFI   motion-weighted frame interval = sum(dx*dt)/sum(dx), ms. A main-thread-drawn element that tracks
//          the motion is on average dx/2 behind it per frame, so its mean position error = v*MWFI/2.
//          Floor: 16.7 ms (Safari rAF at 60 Hz); a perfect 120 Hz compositor motion is 8.3 ms.
//   HTR    hitch-time ratio = sum(max(0, k-2)*8.33 ms) / moving time, ms per s (Apple's hitch metric shape; k = 120 Hz ticks, so integer-ms jitter of 17 vs 16.7 is not a hitch).
//   STUT   stutter events = runs of consecutive frames with tick k>=4 (dt >= 29.2 ms), counted once per run.
//   RUNmax longest run of consecutive stutter frames, ms (a sustained low-fps stretch, e.g. a slow drag at 18 fps).
//   JUMP   excess jump px = dx*max(0, 1-16.67/dt): how far the element leaps beyond a 60 Hz step.
//   ODD    share of moving frames on an odd tick count (k = 1 or 3): cadence phase breaks at "60 fps".
//   LGG    longest gap per gesture (gesture = moving frames split by >= 250 ms without motion).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(here, '../../fixes/iphone-wave2/raw');
const TICK = 1000 / 120, F60 = 1000 / 60, MORPH_PX = 739;
const tick = (dt) => Math.round(dt / TICK);
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

// frames: [{t, dt, dx, y, ih, tm}] -> metrics over moving frames
export function metrics(frames) {
  const mv = frames.filter((f) => f.dx > 0 && f.dt > 0);
  const T = mv.reduce((s, f) => s + f.dt, 0), X = mv.reduce((s, f) => s + f.dx, 0);
  let stut = 0, inRun = false, run = 0, runMax = 0, prevT = -Infinity;
  for (const f of frames) {
    const moving = f.dx > 0;
    if (f.t - f.dt > prevT + 1) inRun = false; // region filters drop frames: a time gap ends a run
    prevT = f.t;
    if (moving && tick(f.dt) >= 4) { if (!inRun) { stut++; run = 0; } inRun = true; run += f.dt; runMax = Math.max(runMax, run); }
    else if (moving || f.dt > 0) inRun = false;
  }
  const jumps = mv.map((f) => f.dx * Math.max(0, 1 - F60 / f.dt));
  // gestures
  const gestures = []; let g = null, still = 0;
  for (const f of frames) {
    if (f.dx > 0) { if (!g || still >= 250) { g = { n: 0, max: 0, dist: 0, t0: f.t }; gestures.push(g); } g.n++; g.max = Math.max(g.max, f.dt); g.dist += f.dx; still = 0; }
    else still += f.dt;
  }
  const big = gestures.filter((x) => x.dist >= 100);
  return {
    frames: mv.length, seconds: r1(T / 1000),
    MWFI: r1(X ? mv.reduce((s, f) => s + f.dx * f.dt, 0) / X : NaN),
    HTR: r1(T ? mv.reduce((s, f) => s + Math.max(0, tick(f.dt) - 2) * TICK, 0) / (T / 1000) : NaN),
    STUT: stut, RUNmax: runMax, STUTperS: r1(T ? stut / (T / 1000) : NaN),
    JUMPp95: r1(q(jumps, 0.95)), JUMPmax: r1(Math.max(0, ...jumps)), JUMPge20: jumps.filter((j) => j >= 20).length,
    ODD: r1(mv.length ? (100 * mv.filter((f) => { const k = tick(f.dt); return k === 1 || k === 3; }).length) / mv.length : NaN),
    k2share: r1(mv.length ? (100 * mv.filter((f) => tick(f.dt) <= 2).length) / mv.length : NaN),
    gestures: big.length, LGGmed: r1(q(big.map((x) => x.max), 0.5)), LGGmax: big.length ? Math.max(...big.map((x) => x.max)) : null,
    LGGge54: big.filter((x) => x.max >= 54.2).length,
  };
}

const load = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const scrollFrames = (arr) => arr.map((a, i) => ({ t: a[0], dt: i ? a[1] : 0, y: a[2], ih: a[3], dx: i ? Math.abs(a[2] - arr[i - 1][2]) : 0 }));
const region = (fr, lo, hi) => fr.filter((f) => f.y >= lo && f.y < hi);

export function scripted(file) {
  const j = load(file); const [s0, s1] = j.marks.scroll;
  const fr = scrollFrames(j.frames).filter((f) => f.t > s0 && f.t <= s1);
  return { all: metrics(fr), hero: metrics(region(fr, -1e9, 900)), middle: metrics(region(fr, 900, 4485)), end: metrics(region(fr, 4485, 1e9)) };
}

// morph driver: logged m lags one frame (the logger reads the value the tween wrote in the previous frame;
// checked on md-gh2: 1-(1-u)^3 with D = 680 ms fits only with that shift), so dx of interval i is m[i+1]-m[i].
export function morphDriver(file) {
  const fr = load(file).frames; const out = [];
  for (let i = 1; i < fr.length - 1; i++) {
    const dm = Math.abs(fr[i + 1][3] - fr[i][3]);
    out.push({ t: fr[i][0], dt: fr[i][1], dx: dm * MORPH_PX, y: fr[i][2] });
  }
  return metrics(out);
}

export function finger(file) {
  const j = load(file); const res = [];
  for (const seg of j.segments) {
    const fr = scrollFrames(seg.frames);
    const ihCh = fr.filter((f, i) => i && f.ih !== fr[i - 1].ih && f.dx > 0).map((f) => f.dt);
    const ihSame = fr.filter((f, i) => i && f.ih === fr[i - 1].ih && f.dx > 0).map((f) => f.dt);
    res.push({ frames: fr.length, all: metrics(fr), hero: metrics(region(fr, -1e9, 900)), middle: metrics(region(fr, 900, 4485)), end: metrics(region(fr, 4485, 1e9)),
      toolbar: { changingFrames: ihCh.length, p50: q(ihCh, 0.5), p90: q(ihCh, 0.9), otherP50: q(ihSame, 0.5), otherP90: q(ihSame, 0.9) },
      // speed at long frames: is the eye able to track? px/s over the long frame
      longFrames: fr.filter((f) => f.dt >= 54.2 && f.dx > 0).map((f) => ({ y: f.y, dt: f.dt, v: Math.round((f.dx / f.dt) * 1000) })) });
  }
  return res;
}

// morph logger runs (finger at the end): touch path, pin, morph motion
export function morphLog(file) {
  const j = load(file); const F = Object.fromEntries(j.fields.map((k, i) => [k, i])); const fr = j.frames;
  const rows = [];
  for (let i = 1; i < fr.length - 1; i++) {
    const a = fr[i], p = fr[i - 1];
    const dm = Math.abs(fr[i + 1][F.morph] - a[F.morph]);
    rows.push({ t: a[F.t], dt: a[F.dt], y: a[F.scrollY], dy: Math.abs(a[F.scrollY] - p[F.scrollY]), dm, tm: a[F.touchmove], tmp: a[F.tmPrevented], m: a[F.morph] });
  }
  const scrollOnly = rows.map((r) => ({ ...r, dx: r.dy }));
  const panel = rows.map((r) => ({ ...r, dx: r.dm * MORPH_PX }));
  const both = rows.map((r) => ({ ...r, dx: r.dy + r.dm * MORPH_PX }));
  const armT = (j.listeners.find((l) => l[2] === 'touchmove' && l[4] === true) || [])[0];
  const moving = rows.filter((r) => r.dy > 0 && r.y < 4485);
  const split = (arr, pred) => { const a = arr.filter(pred).map((r) => r.dt); return { n: a.length, p50: q(a, 0.5), p90: q(a, 0.9) }; };
  // scroll start latency: first frame with a touchmove after >= 300 ms without motion or touch, to the first frame with dy>0
  const starts = []; let quiet = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.tm > 0 && quiet >= 300 && r.m === 0) {
      let k = i; while (k < rows.length && rows[k].dy === 0 && rows[k].t - r.t < 500) k++;
      if (k < rows.length && rows[k].dy > 0) starts.push({ y: r.y, ms: rows[k].t - r.t + r.dt, armed: armT !== undefined && r.t - j.t0 >= armT });
    }
    quiet = r.dy === 0 && r.tm === 0 ? quiet + r.dt : 0;
  }
  return {
    scroll: metrics(scrollOnly), panel: metrics(panel), endBoth: metrics(both.filter((r) => r.y >= 4485)),
    touch: { midTouchmoveFrames: split(moving, (r) => r.tm > 0), midNoTouchFrames: split(moving, (r) => r.tm === 0) },
    starts,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = fs.readdirSync(RAW);
  const out = { scripted: {}, morph: {}, finger: {}, morphlog: {} };
  for (const f of files) {
    const n = f.replace(/\.json$/, '');
    if (/^(goal|ctl|hero|e)-/.test(n)) out.scripted[n] = scripted(f);
    else if (/^md-/.test(n)) out.morph[n] = morphDriver(f);
    else if (/^finger-/.test(n)) out.finger[n] = finger(f);
    else if (/^morphlog-/.test(n)) out.morphlog[n] = morphLog(f);
  }
  if (process.argv.includes('--groups')) {
    const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    const rng = (a) => { a = a.filter((x) => x != null); return `${r1(med(a))} [${Math.min(...a)}-${Math.max(...a)}]`; };
    const keys = ['MWFI', 'HTR', 'STUTperS', 'RUNmax', 'JUMPp95', 'JUMPmax', 'ODD'];
    const grp = (name, rs) => console.log(name.padEnd(24), `n${rs.length}`, keys.map((k) => `${k} ${rng(rs.map((r) => r[k]))}`).join(' | '));
    const S = (ns, sub) => ns.map((n) => out.scripted[n][sub]);
    const B = ['goal-B2', 'goal-B3', 'ctl-B5', 'ctl-B6', 'ctl-B9', 'ctl-B12', 'ctl-B13', 'ctl-B14', 'ctl-B15b', 'ctl-B16'], P = ['goal-P1', 'goal-P2', 'goal-P3'];
    for (const sub of ['all', 'hero', 'middle', 'end']) { grp(`S base ${sub}`, S(B, sub)); grp(`S aw1-10c ${sub}`, S(P, sub)); }
    for (const [k, ns] of Object.entries({ 'B aw1-10c': [1, 2, 3], 'Q aw1-10e': [1, 2, 3, 4, 5, 6], 'P hero v2': [1, 2, 3], 'R v2+people-o': [1, 2, 3] }))
      grp(`W hero ${k}`, ns.map((i) => out.scripted[`hero-${k[0]}${i}`].hero));
    const Mg = { f: ['f1', 'f2', 'f3'], g: ['g1', 'g2', 'g3', 'g7', 'g8', 'g9'], gh: ['gh1', 'gh4', 'gh5', 'gh6'], ghb: ['ghb1', 'ghb2', 'ghb3'],
      'warm (void)': ['f4', 'f5', 'g4', 'g5', 'g6', 'g10', 'gb2', 'gb3', 'gh2', 'gh3', 'ghb4', 'ghbn1'] };
    for (const [k, ns] of Object.entries(Mg)) grp(`M ${k}`, ns.map((n) => out.morph[`md-${n}`]));
    process.exit(0);
  }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  const cols = ['frames', 'MWFI', 'HTR', 'STUT', 'RUNmax', 'STUTperS', 'JUMPp95', 'JUMPmax', 'JUMPge20', 'ODD', 'LGGmed', 'LGGmax'];
  const line = (name, m) => console.log([name.padEnd(22), ...cols.map((c) => String(m[c]).padStart(7))].join(' '));
  console.log(['run'.padEnd(22), ...cols.map((c) => c.padStart(7))].join(' '));
  for (const [n, r] of Object.entries(out.scripted)) for (const k of ['all', 'hero', 'middle', 'end']) line(`${n}.${k}`, r[k]);
  for (const [n, r] of Object.entries(out.morph)) line(n, r);
  for (const [n, segs] of Object.entries(out.finger)) segs.forEach((s, i) => { for (const k of ['all', 'hero', 'middle', 'end']) line(`${n}#${i}.${k}`, s[k]); console.log('   toolbar', JSON.stringify(s.toolbar)); });
  for (const [n, r] of Object.entries(out.morphlog)) { for (const k of ['scroll', 'panel', 'endBoth']) line(`${n}.${k}`, r[k]); console.log('   touch', JSON.stringify(r.touch), 'starts', JSON.stringify(r.starts)); }
}
