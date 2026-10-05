#!/usr/bin/env node
// P-152 reader (frozen before data; card: fixes/end-morph-f12/README.md "P-152"). Phone no-worse check of end-morph
// F1+U2 on v9-final: C (v9-final, JS 647c9ef2b1e2) vs V (C + F1 + U2, JS a6426953727a), CSS e1359ab9994a both.
// A pure reader: no device, no measurement.
//   node fixes/end-morph-f12/phone/p152-read.mjs <folder> [--json out.json]      (folder: out/p152/runs)
//   node fixes/end-morph-f12/phone/p152-read.mjs --selftest
// Built from fix-end-bg's P-150 reader (fixes/end-bg/phone/p150-read.mjs at 24041a92: decideNoWorse, the rule of P-150
// rev 1.1) and P-137's (p137-read.mjs: verdict, the after-touchend metric), with the metric moved to the end zone.
// RUNS: counted EC1-EC4 (C) and EV1-EV4 (V), g-<run>.json + tl-<run>.json; a re-run <run>r replaces its run when the
//   first try is INVALID (the first valid try counts). Sentinels S0, S1 (Timeline off, g- only). Attribution AC1, AV1
//   (after S1; read below, decide nothing). Records of a VOID hold are moved to out/p152/void/<H>/ by the runner before
//   the read and never count (P-145 N1's rule).
// PER RUN: the SIGNED P-129 reader rev 1.1 (research/serious-heat/p129-read.mjs readRun, role E) for the run gates G1-G6
//   and the moving-frame rows (dt, band, toolbar step).
// METRIC (the end zone): the run's moving frames (scrollY differs from the previous frame) in the reader's lastScreen
//   band (scrollY >= maxY - innerHeight, maxY = docH - innerHeight). On v9-final the morph track is the last
//   innerHeight of the scroll (Chrome: endStart 5189 = max 5964 - 775, OBSERVED), so this band is the morph zone
//   (m >= 0) and the screen before it. n = their number, s(th) = those with dt > th, th 30, 34, 38, 46, 50, 54.
//   P-137's metric (lastScreen frames whose last touch event is a touchend) is reported, decides nothing.
// DECISION (lead, 2026-10-05: like P-150 rev 1.1; V against C, at least 3 valid runs per arm, both sentinels PASS).
//   At >34 and at >50 separately, WORSE when EITHER
//   (a) full separation: min(V) > max(C); OR
//   (b) the median bound: median(V) - median(C) > +2 at >34, > +1 at >50 (counts; on the rates basis 2 / median n(C)
//       and 1 / median n(C)).
//   Denominator guard 15 %: when median n differs between the arms by more than 15 % of C's, the rule runs on rates s/n.
//   NO-WORSE PASS: neither >34 nor >50 is WORSE. FAIL: either is WORSE (named, with (a) and/or (b)); a FAIL goes to the
//   lead (block 2 or no landing). INSUFFICIENT: an arm has < 3 valid runs. VOID: a sentinel failed or is missing.
//   Twins (>30/>38 use the >34 bound, >46/>54 the >50 bound): a twin whose WORSE-or-not differs from its main
//   threshold marks the result "threshold-sensitive" (reported; PASS/FAIL unchanged).
//   A FAIL whose lowest V run at a failing threshold opens its hold (EV1 or EV3) is labelled "position-confounded"
//   (P-150 N3; the outcome is unchanged).
// ATTRIBUTION (AC1, AV1 only; decides nothing): Timeline Paint records (any depth) that start inside a moving frame's gap
//   (t - dt, t], split by the frame's morph value m = (scrollY - (maxY - innerHeight)) / innerHeight: m >= 0.55 (the
//   range where F1 hides #platform) and 0 <= m < 0.55. Per arm: frames, Paint records, Paint records per frame.
//   The geometry (track = innerHeight) is OBSERVED in Chrome; on the phone it is an approximation.
// PER RUN (descriptive): hold and position (the card's plan), start (meta.date), gap since the previous counted or
//   sentinel run, battery °C at its phone hold's start (meta.profile.start.battC).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun, flatten } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
export const TH = [30, 34, 38, 46, 50, 54];
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** End-zone metric of one readRun result: moving lastScreen frames. */
export function endZone(r) {
  const rows = r.rows.filter((x) => x.band === 'lastScreen');
  return { n: rows.length, s: Object.fromEntries(TH.map((th) => [th, rows.filter((x) => x.dt > th).length])) };
}
/** P-137's metric (descriptive): lastScreen moving frames whose last touch event before the frame is a touchend. */
export function afterTouchend(g, r) {
  const seg = g.run.segments[0], fr = seg.frames, tc = seg.touches || [];
  const rows = r.rows.filter((x) => x.band === 'lastScreen').filter((x) => {
    const t = fr[x.i][0]; let last = null; for (const e of tc) if (e[0] <= t) last = e;
    return last && last[1] === 'e';
  });
  return { n: rows.length, s: Object.fromEntries(TH.map((th) => [th, rows.filter((x) => x.dt > th).length])) };
}
/** separation verdict (P-137's `verdict`, WORSE branch used here). */
export function separated(c, v) { return c.length >= 3 && v.length >= 3 && Math.min(...v) > Math.max(...c); }
export const BOUND = { 30: 2, 34: 2, 38: 2, 46: 1, 50: 1, 54: 1 };
export const FIRST_IN_HOLD = ['EV1', 'EV3'];
export function decideNoWorse(c, x, names = null) {
  const nC = med(c.map((m) => m.n)), nX = med(x.map((m) => m.n));
  const basisRates = c.length && x.length && nC ? Math.abs(nX - nC) > 0.15 * nC : false;
  const basis = basisRates ? `rates (median n C ${nC}, V ${nX})` : `counts (median n C ${nC}, V ${nX})`;
  if (c.length < 3 || x.length < 3) return { result: 'INSUFFICIENT', basis };
  const val = (m, th) => (basisRates ? (m.n ? m.s[th] / m.n : 0) : m.s[th]);
  const bound = (th) => (basisRates ? BOUND[th] / nC : BOUND[th]);
  const diff = Object.fromEntries(TH.map((th) => [th, med(x.map((m) => val(m, th))) - med(c.map((m) => val(m, th)))]));
  const why = (th) => [separated(c.map((m) => val(m, th)), x.map((m) => val(m, th))) ? 'separated' : null,
    diff[th] > bound(th) + 1e-12 ? `median +${+diff[th].toFixed(4)} > +${+bound(th).toFixed(4)}` : null].filter(Boolean);
  const isW = (th) => why(th).length > 0;
  const worse = [34, 50].filter(isW);
  const sensitive = isW(30) !== isW(34) || isW(38) !== isW(34) || isW(46) !== isW(50) || isW(54) !== isW(50);
  let confounded = false;
  if (worse.length && names) for (const th of worse) { const vs = x.map((m) => val(m, th)), lo = Math.min(...vs); if (FIRST_IN_HOLD.includes(names[vs.indexOf(lo)])) confounded = true; }
  return { result: worse.length ? `FAIL (WORSE at ${worse.map((t) => `>${t} [${why(t).join(', ')}]`).join('; ')})` : 'NO-WORSE PASS', sensitive, confounded, basis, diff };
}
/** Attribution: Paint records per moving frame by morph range (AC1 / AV1). */
export function attribution(g, tl) {
  const seg = g.run.segments[0], fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0;
  const flat = tl && Number.isFinite(tl.offsetMs) ? flatten(tl.recs, tl.offsetMs) : [];
  const paints = flat.filter((r) => r.type === 'Paint').map((r) => r.a).sort((a, b) => a - b);
  const out = { hi: { frames: 0, paints: 0 }, lo: { frames: 0, paints: 0 } };
  for (let i = 1; i < fr.length; i++) {
    const [t, dt, y, ih] = fr[i]; if (y === fr[i - 1][2]) continue;
    const maxY = docH - ih, m = (y - (maxY - ih)) / ih; if (m < 0) continue;
    const k = m >= 0.55 ? 'hi' : 'lo';
    out[k].frames++; out[k].paints += paints.filter((a) => a > t - dt && a <= t).length;
  }
  for (const k of ['hi', 'lo']) out[k].perFrame = out[k].frames ? Math.round((1000 * out[k].paints) / out[k].frames) / 1000 : null;
  return out;
}
function selftest() {
  let n = 0;
  const ok = (a, b, m) => { n++; if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  const mk = (s34, s50 = 2, nn = 300) => ({ n: nn, s: { 30: s34 + 4, 34: s34, 38: Math.max(0, s34 - 4), 46: s50 + 1, 50: s50, 54: Math.max(0, s50 - 1) } });
  const C = [mk(20), mk(22), mk(19), mk(21)];
  ok(decideNoWorse(C, [mk(21), mk(20), mk(23), mk(19)]).result, 'NO-WORSE PASS', 'overlap, median +0.5');
  ok(decideNoWorse(C, [mk(10), mk(9), mk(11), mk(12)]).result, 'NO-WORSE PASS', 'better is a pass');
  ok(decideNoWorse(C, [mk(23), mk(18), mk(25), mk(24)]).result, 'FAIL (WORSE at >34 [median +3 > +2])', 'clause (b) alone at >34');
  ok(decideNoWorse([mk(20), mk(21), mk(22), mk(21)], [mk(23), mk(23), mk(23), mk(23)]).result, 'FAIL (WORSE at >34 [separated])', 'clause (a) alone: separated, median +2 within the bound');
  ok(decideNoWorse(C, [mk(30), mk(28), mk(31), mk(29)]).result, 'FAIL (WORSE at >34 [separated, median +9 > +2])', 'both clauses at >34');
  ok(decideNoWorse(C, [mk(20, 4), mk(21, 5), mk(19, 1), mk(21, 4)]).result, 'FAIL (WORSE at >50 [median +2 > +1])', 'clause (b) at >50');
  ok(decideNoWorse(C, [mk(20, 3), mk(21, 3), mk(19, 3), mk(21, 3)]).result, 'FAIL (WORSE at >50 [separated])', 'clause (a) at >50, median +1 within bound');
  ok(decideNoWorse(C, [mk(21), mk(20), mk(23)]).result, 'NO-WORSE PASS', '3 valid runs are enough');
  ok(decideNoWorse(C, [mk(21), mk(20)]).result, 'INSUFFICIENT', 'under 3 valid V runs');
  ok(decideNoWorse(C.slice(0, 2), [mk(21), mk(20), mk(22)]).result, 'INSUFFICIENT', 'under 3 valid C runs');
  ok(decideNoWorse(C, [mk(30, 2, 200), mk(28, 2, 200), mk(31, 2, 200), mk(29, 2, 200)]).basis.startsWith('rates'), true, 'denominator guard');
  ok(decideNoWorse(C, [mk(30), mk(28), mk(31), mk(29)], ['EV1', 'EV2', 'EV3', 'EV4']).confounded, false, 'lowest V is EV2: not confounded');
  ok(decideNoWorse(C, [mk(27), mk(28), mk(31), mk(29)], ['EV1', 'EV2', 'EV3', 'EV4']).confounded, true, 'lowest V is EV1: position-confounded');
  // twins: >34 worse by +3 while >38 (s34-4 clipped at 0 in C? no) moves the same; build a case where only >30 crosses
  const tw = (s30, s34) => ({ n: 300, s: { 30: s30, 34: s34, 38: s34, 46: 2, 50: 2, 54: 2 } });
  const Ct = [tw(20, 10), tw(21, 10), tw(20, 11), tw(21, 10)];
  const r = decideNoWorse(Ct, [tw(24, 11), tw(24, 10), tw(25, 11), tw(23, 10)]);
  ok(r.result, 'NO-WORSE PASS', 'twin case main pass');
  ok(r.sensitive, true, 'twin >30 worse while >34 is not: threshold-sensitive');
  // metric: end zone filters on band
  ok(endZone({ rows: [{ band: 'lastScreen', dt: 40 }, { band: 'middle', dt: 60 }, { band: 'lastScreen', dt: 16 }] }).s[34], 1, 'end zone counts lastScreen only');
  ok(endZone({ rows: [{ band: 'lastScreen', dt: 40 }, { band: 'hero', dt: 60 }] }).n, 1, 'end zone n');
  // attribution split by m (ih 800, docH 6800: maxY 6000, zone starts at 5200; m 0.55 at 5640)
  const g = { run: { segments: [{ docH: 6800, frames: [[0, 16, 5000, 800], [16, 16, 5300, 800], [32, 16, 5700, 800], [48, 16, 5900, 800], [64, 16, 5900, 800]] }] } };
  const tl = { offsetMs: 0, recs: [{ type: 'Paint', startTime: 0.010 }, { type: 'Paint', startTime: 0.020 }, { type: 'Paint', startTime: 0.040 }, { type: 'Paint', startTime: 0.060 }] };
  const a = attribution(g, tl);
  ok(`${a.lo.frames}/${a.lo.paints} ${a.hi.frames}/${a.hi.paints}`, '1/1 2/2', 'attribution split at m 0.55 (still frame skipped)');
  console.log(`SELFTEST ok (${n} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-morph-f12/phone/p152-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {}, attribution: {} }, per = { C: [], V: [] }, names = { C: [], V: [] };
  const PLAN = { S0: 'H2/1', EC1: 'H2/2', EV1: 'H3/1', EV2: 'H3/2', EC2: 'H4/1', EC3: 'H4/2', EV3: 'H5/1', EV4: 'H5/2', EC4: 'H6/1', S1: 'H7+/last' };
  const t0 = (g) => (g?.meta?.date ? Date.parse(g.meta.date) : null);
  const starts = [];
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const r = g ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: 'FAIL (no record)' }; if (g) starts.push([s, t0(g)]); }
  for (const arm of ['C', 'V']) for (let k = 1; k <= 4; k++) {
    const base = `E${arm}${k}`; let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      const r = readRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name; const w = endZone(r), at = afterTouchend(g, r);
      out.runs[name] = { arm, ...w, afterTouchend: at, hold: PLAN[name] || 'H7+ (re-run)', start: g.meta?.date ?? null, battC: g.meta?.profile?.start?.battC ?? null };
      starts.push([name, t0(g)]); per[arm].push(w); names[arm].push(base); break;
    }
    if (!used) out.invalid[base] ||= ['no valid try'];
  }
  for (const n of ['AC1', 'AV1']) { const g = load(`g-${n}.json`), tl = load(`tl-${n}.json`); out.attribution[n] = g && tl ? attribution(g, tl) : 'missing'; }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.result = sentOk ? decideNoWorse(per.C, per.V, names.V) : { result: 'VOID (a sentinel failed or is missing)' };
  const ord = starts.filter((x) => x[1] != null).sort((p, q) => p[1] - q[1]);
  for (let i = 0; i < ord.length; i++) if (out.runs[ord[i][0]]) out.runs[ord[i][0]].gapS = i ? Math.round((ord[i][1] - ord[i - 1][1]) / 1000) : null;
  out.medians = Object.fromEntries(['C', 'V'].map((x) => [x, Object.fromEntries(TH.map((th) => [`dt>${th}`, med(per[x].map((m) => m.s[th]))]))]));
  console.log(`P-152 read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) ${r.hold} start ${r.start} gap ${r.gapS ?? '-'} s batt ${r.battC ?? '-'} C | end zone n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]} | after touchend n ${r.afterTouchend.n} >34 ${r.afterTouchend.s[34]}`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`DECISION ${out.result.result}${out.result.confounded ? ' [position-confounded]' : ''}${out.result.sensitive ? ' [threshold-sensitive]' : ''} ${out.result.basis || ''} ${out.result.diff ? 'median V-C ' + JSON.stringify(out.result.diff) : ''}`);
  console.log(`ATTRIBUTION (decides nothing) ${JSON.stringify(out.attribution)}`);
  console.log('NOTE first-in-hold (disclosed): EV1, EC2, EV3 and EC4 open their holds (V twice, C twice)');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}
