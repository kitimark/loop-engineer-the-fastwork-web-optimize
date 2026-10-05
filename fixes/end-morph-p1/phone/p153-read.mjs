#!/usr/bin/env node
// P-153 reader (frozen before data; card: fixes/end-morph-p1/README.md "P-153"). Phone no-worse check of end-morph P1
// (PR-012 rev 1's composited clip reveal by fix-morph-gpu, ported onto v9-final + F1 + U2):
//   C (v9-final + F1 + U2, JS a6426953727a, CSS e1359ab9994a) vs V (C + P1, JS 4da641f828bb, CSS a81b9af7b2c9).
// A pure reader: no device, no measurement.
//   node fixes/end-morph-p1/phone/p153-read.mjs <folder> [--json out.json]      (folder: out/p153/runs)
//   node fixes/end-morph-p1/phone/p153-read.mjs --selftest
// A copy of fix-end-morph's P-152 reader (fixes/end-morph-f12/phone/p152-read.mjs 005136ea3002 at d705bdd6) with the
// P-153 arms, plus FIRST OPEN (below), the named risk; the decision rule and the end-zone metric are P-152's unchanged.
// P-152's reader was built from fix-end-bg's P-150 reader (fixes/end-bg/phone/p150-read.mjs at 24041a92: decideNoWorse, the rule of P-150
// rev 1.1) and P-137's (p137-read.mjs: verdict, the after-touchend metric), with the metric moved to the end zone.
// RUNS: counted EC1-EC4 (C) and EV1-EV4 (V), g-<run>.json + tl-<run>.json; a re-run <run>r replaces its run when the
//   first try is INVALID (the first valid try counts). Sentinels S0, S1 (Timeline off, g- only). Attribution AC1, AV1
//   (after S1; read below, decide nothing). Records of a VOID hold are moved to out/p153/void/<H>/ by the runner before
//   the read and never count (P-145 N1's rule). Paths: out/p153/void/<H>/.
// PER RUN: the SIGNED P-129 reader rev 1.1 (research/serious-heat/p129-read.mjs readRun, role E) for the run gates G1-G6
//   and the moving-frame rows (dt, band, toolbar step).
// METRIC (the end zone): the run's moving frames (scrollY differs from the previous frame) in the reader's lastScreen
//   band (scrollY >= maxY - innerHeight, maxY = docH - innerHeight). On v9-final the morph track is the last
//   innerHeight of the scroll (Chrome: endStart 5189 = max 5964 - 775, OBSERVED), so this band is the morph zone
//   (m >= 0) and the screen before it. n = their number, s(th) = those with dt > th, th 30, 34, 38, 46, 50, 54.
//   P-137's metric (lastScreen frames whose last touch event is a touchend) is reported, decides nothing.
// DECISION (lead, 2026-10-06: "NO-WORSE as in P-152 (whatever bound I sign there after its read, take the same)";
//   P-152's registered rule is P-150 rev 1.1's, written here; if the lead signs another bound for P-152 after its read,
//   BOUND below changes in an addendum commit BEFORE any P-153 data, with a new pin; V against C, at least 3 valid runs
//   per arm, both sentinels PASS).
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
// FIRST OPEN (the named risk; reported per run, decides nothing in the rule above): PR-012 rev 1 on best-build paid a
//   longer first frame when the menu opens (phone P-092, M driver: repeat opens +7 ms; the first open per page load V 41
//   vs C 34.5 ms, n 4, ranges overlapping; rev 2 P-098: first open +6.5 ms, WORSE by its bound V <= C + 2 ms;
//   fixes/morph-gpu/README.md). Here, per counted run: the opens are the frames whose morph value
//   m = (scrollY - (maxY - innerHeight)) / innerHeight is > 0 while the previous frame's was <= 0 (m from the frame's
//   own innerHeight and docH; the track = innerHeight is OBSERVED in Chrome, an approximation on the phone).
//   O1 = the first open after load: f1 = its frame's dt, f12 = f1 + the next frame's dt, f123 = + the one after.
//   Repeat opens: their f1 values and median. Per arm: median and range of O1.f1, O1.f12, O1.f123 and of the per-run
//   repeat-open f1 medians. Label "FIRST-OPEN RISK SEEN" when median V O1.f1 - median C O1.f1 > 2 ms (rev 2's bound),
//   also reported at f12 and f123; the label goes to the lead with the result, the NO-WORSE outcome stays as decided.
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
// P-152's registered bound (P-150 rev 1.1). Changed only by a pre-data addendum when the lead signs another for P-152.
export const BOUND = { 30: 2, 34: 2, 38: 2, 46: 1, 50: 1, 54: 1 };
export const FIRST_OPEN_BOUND_MS = 2;
/** Opens of one run: frames whose m > 0 while the previous frame's m <= 0 (FIRST OPEN above). */
export function opens(g) {
  const seg = g.run.segments[0], fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0;
  const mOf = (f) => { const ih = f[3], maxY = docH - ih; return (f[2] - (maxY - ih)) / ih; };
  const out = [];
  for (let i = 1; i < fr.length; i++) if (mOf(fr[i]) > 0 && mOf(fr[i - 1]) <= 0) {
    const d = (k) => (fr[i + k] ? fr[i + k][1] : null);
    const f1 = d(0), f2 = d(1), f3 = d(2);
    out.push({ i, t: fr[i][0], f1, f12: f2 == null ? null : f1 + f2, f123: f2 == null || f3 == null ? null : f1 + f2 + f3 });
  }
  return out;
}
/** Per-run first-open record: O1 and the repeat opens' f1 values. */
export function firstOpen(g) {
  const o = opens(g);
  if (!o.length) return { opens: 0, o1: null, repeatF1: [], repeatF1Median: null };
  const rep = o.slice(1).map((x) => x.f1);
  return { opens: o.length, o1: o[0], repeatF1: rep, repeatF1Median: med(rep) };
}
/** Arm summary of the first open and the risk label (decides nothing). */
export function firstOpenSummary(perC, perV) {
  const st = (a) => { const v = a.filter((x) => x != null); return v.length ? { median: med(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : null; };
  const out = {};
  for (const k of ['f1', 'f12', 'f123']) {
    const c = st(perC.map((r) => r.o1?.[k] ?? null)), v = st(perV.map((r) => r.o1?.[k] ?? null));
    const diff = c && v ? v.median - c.median : null;
    out[k] = { C: c, V: v, diff, risk: diff != null && diff > FIRST_OPEN_BOUND_MS + 1e-12 };
  }
  out.repeatF1 = { C: st(perC.map((r) => r.repeatF1Median)), V: st(perV.map((r) => r.repeatF1Median)) };
  out.label = out.f1.risk ? 'FIRST-OPEN RISK SEEN' : (out.f1.diff == null ? 'FIRST-OPEN NOT READ (no open in an arm)' : 'first open within +2 ms');
  return out;
}
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
  // first open: ih 800, docH 6800 -> zone starts at y 5200 (m 0); opens at i 2 (5300) and i 6 (5250), a close between
  const go = { run: { segments: [{ docH: 6800, frames: [[0, 16, 5000, 800], [16, 16, 5200, 800], [56, 40, 5300, 800], [76, 20, 5500, 800], [92, 16, 5600, 800], [108, 16, 5100, 800], [150, 42, 5250, 800], [170, 20, 5400, 800]] }] } };
  const fo = firstOpen(go);
  ok(`${fo.opens} ${fo.o1.i} ${fo.o1.f1} ${fo.o1.f12} ${fo.o1.f123}`, '2 2 40 60 76', 'first open: m 0 is not open, O1 at the first m > 0 frame, f12 and f123 sums');
  ok(`${fo.repeatF1.join(",")} ${fo.repeatF1Median} ${opens(go)[1].f123}`, '42 42 null', 'repeat open f1; f123 null at the run end');
  ok(firstOpen({ run: { segments: [{ docH: 6800, frames: [[0, 16, 1000, 800], [16, 16, 2000, 800]] }] } }).o1, null, 'no open in a run');
  const R = (f1) => ({ o1: { f1, f12: f1 + 20, f123: f1 + 36 }, repeatF1Median: f1 + 10 });
  ok(firstOpenSummary([R(34), R(35), R(36), R(33)], [R(41), R(40), R(49), R(38)]).label, 'FIRST-OPEN RISK SEEN', 'first-open risk at median +5 ms');
  ok(firstOpenSummary([R(34), R(35), R(36), R(33)], [R(36), R(35), R(37), R(34)]).label, 'first open within +2 ms', 'first open +1.5 ms is within the bound');
  ok(firstOpenSummary([R(34), R(35), R(36)], [{ o1: null, repeatF1Median: null }]).label, 'FIRST-OPEN NOT READ (no open in an arm)', 'no open in V');
  console.log(`SELFTEST ok (${n} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-morph-p1/phone/p153-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {}, attribution: {} }, per = { C: [], V: [] }, names = { C: [], V: [] }, fo = { C: [], V: [] };
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
      used = name; const w = endZone(r), at = afterTouchend(g, r), f = firstOpen(g);
      out.runs[name] = { arm, ...w, afterTouchend: at, firstOpen: f, hold: PLAN[name] || 'H7+ (re-run)', start: g.meta?.date ?? null, battC: g.meta?.profile?.start?.battC ?? null };
      starts.push([name, t0(g)]); per[arm].push(w); names[arm].push(base); fo[arm].push(f); break;
    }
    if (!used) out.invalid[base] ||= ['no valid try'];
  }
  for (const n of ['AC1', 'AV1']) { const g = load(`g-${n}.json`), tl = load(`tl-${n}.json`); out.attribution[n] = g && tl ? attribution(g, tl) : 'missing'; }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.result = sentOk ? decideNoWorse(per.C, per.V, names.V) : { result: 'VOID (a sentinel failed or is missing)' };
  const ord = starts.filter((x) => x[1] != null).sort((p, q) => p[1] - q[1]);
  for (let i = 0; i < ord.length; i++) if (out.runs[ord[i][0]]) out.runs[ord[i][0]].gapS = i ? Math.round((ord[i][1] - ord[i - 1][1]) / 1000) : null;
  out.firstOpen = firstOpenSummary(fo.C, fo.V);
  out.medians = Object.fromEntries(['C', 'V'].map((x) => [x, Object.fromEntries(TH.map((th) => [`dt>${th}`, med(per[x].map((m) => m.s[th]))]))]));
  console.log(`P-153 read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) ${r.hold} start ${r.start} gap ${r.gapS ?? '-'} s batt ${r.battC ?? '-'} C | end zone n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]} | after touchend n ${r.afterTouchend.n} >34 ${r.afterTouchend.s[34]} | first open after load f1 ${r.firstOpen.o1?.f1 ?? '-'} f12 ${r.firstOpen.o1?.f12 ?? '-'} f123 ${r.firstOpen.o1?.f123 ?? '-'} ms, opens ${r.firstOpen.opens}, repeat f1 median ${r.firstOpen.repeatF1Median ?? '-'}`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`DECISION ${out.result.result}${out.result.confounded ? ' [position-confounded]' : ''}${out.result.sensitive ? ' [threshold-sensitive]' : ''} ${out.result.basis || ''} ${out.result.diff ? 'median V-C ' + JSON.stringify(out.result.diff) : ''}`);
  { const F = out.firstOpen, d = (k) => `${k} C ${F[k].C ? `${F[k].C.median} (${F[k].C.min}-${F[k].C.max})` : '-'} V ${F[k].V ? `${F[k].V.median} (${F[k].V.min}-${F[k].V.max})` : '-'} diff ${F[k].diff ?? '-'}`;
    console.log(`FIRST OPEN (named risk; decides nothing) ${F.label}: ${d('f1')} | ${d('f12')} | ${d('f123')} | repeat-open f1 medians C ${F.repeatF1.C?.median ?? '-'} V ${F.repeatF1.V?.median ?? '-'} ms`); }
  console.log(`ATTRIBUTION (decides nothing) ${JSON.stringify(out.attribution)}`);
  console.log('NOTE first-in-hold (disclosed): EV1, EC2, EV3 and EC4 open their holds (V twice, C twice)');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}
