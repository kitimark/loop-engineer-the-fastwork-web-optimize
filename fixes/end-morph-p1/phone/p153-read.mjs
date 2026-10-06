#!/usr/bin/env node
// P-153 reader (frozen before data; card: fixes/end-morph-p1/README.md "P-153", rev 1.3). Phone no-worse check of end-morph
// P1 (PR-012 rev 1's composited clip reveal by fix-morph-gpu, ported onto v9-final + F1 + U2):
//   C (v9-final + F1 + U2, JS a6426953727a, CSS e1359ab9994a) vs V (C + P1, JS 4da641f828bb, CSS a81b9af7b2c9).
// REV 1.1: a copy of fix-end-morph's P-152 rev 1.1 reader (fixes/end-morph-f12/phone/p152-read.mjs adf4e7a27122 at
// ac229f7f; the decision rule, the permutation test on the mean difference, the part-2 end-gate void, near bands, EC1
// slot and its self-test cases unchanged) with the P-153 arms, FIRST OPEN (below; the named risk) and the lead's late
// P-152 delta (part 2 counts only after "HOLD HA VALID", or a standalone end gate after an HA stop).
// REV 1.2: P-152 rev 1.3's hold validity (fix-end-morph, p152-read.mjs 11ab8b9496b0 at e3c1a254: holdStatus, its
// self-test cases and its read lines, P-152 -> P-153), replacing rev 1.1's part-2 rule (part2Gate).
// REV 1.3 (lead ruling after block 1 went VOID on heat, 2026-10-06; = P-152 rev 1.4): one counted run per hold, the
//   phone cooled below 38 °C before every hold. The decision rule and holdStatus are unchanged; changed: the per-run
//   plan labels (PLAN below: S0 H3, EC1 H4, EV1 H5, EV2 H6, EC2 H7, EC3 H8, EV3 H9, EV4 H10, EC4 H11, re-runs and S1
//   H12+) and the position label: every counted run now opens its own hold after the same cooling wait, so no run is
//   "first in hold" against another (FIRST_IN_HOLD = [], the label cannot fire; the rule is kept as a parameter and
//   its self-test cases pass the rev 1.2 list explicitly).
// A pure reader: no device, no measurement.
//   node fixes/end-morph-p1/phone/p153-read.mjs <folder> [--json out.json]      (folder: out/p153/runs)
//   node fixes/end-morph-p1/phone/p153-read.mjs --selftest
// Built from fix-end-bg's P-150 reader (fixes/end-bg/phone/p150-read.mjs at 24041a92: decideNoWorse, the rule of P-150
// rev 1.1) and P-137's (p137-read.mjs: verdict, the after-touchend metric), with the metric moved to the end zone.
// RUNS: counted EC1-EC4 (C) and EV1-EV4 (V), g-<run>.json + tl-<run>.json; a re-run <run>r replaces its run only when
//   the first try is INVALID by readRun (the first valid try counts): a first try flagged by the runner only for a
//   non-zero gesture exit, but valid by readRun, still counts and its re-run is ignored. Sentinels S0, S1 (Timeline off, g- only). Attribution AC1, AV1
//   (after S1; read below, decide nothing). Records of a VOID hold are moved to out/p153/void/<H>/ by the runner before
//   the read and never count (P-145 N1's rule).
// PER RUN: the SIGNED P-129 reader rev 1.1 (research/serious-heat/p129-read.mjs readRun, role E) for the run gates G1-G6
//   and the moving-frame rows (dt, band, toolbar step).
// METRIC (the end zone): the run's moving frames (scrollY differs from the previous frame) in the reader's lastScreen
//   band (scrollY >= maxY - innerHeight, maxY = docH - innerHeight). On v9-final the morph track is the last
//   innerHeight of the scroll (Chrome: endStart 5189 = max 5964 - 775, OBSERVED), so this band is the morph zone
//   (m >= 0) and the screen before it. n = their number, s(th) = those with dt > th, th 30, 34, 38, 46, 50, 54.
//   P-137's metric (lastScreen frames whose last touch event is a touchend) is reported, decides nothing.
// DECISION (card rev 1.1, lead-signed N1 of the pre-data read, 2026-10-06; V against C, at least 3 valid runs per arm,
//   both sentinels PASS). At >34 and at >50 separately, WORSE when EITHER
//   (a) full separation: min(V) > max(C); OR
//   (b) the median bound AND the permutation test: median(V) - median(C) > +2 at >34, > +1 at >50 (counts; on the
//       rates basis 2 / median n(C) and 1 / median n(C)) AND an exact one-sided permutation p <= 0.05 on the MEAN
//       difference (lead, 2026-10-06, for consistency with P-150 rev 1.3; permP copied from fix-end-bg's
//       p150-read.mjs at 753366c1): p = the share of all C(nC + nV, nV) relabelings of the valid runs into the arms'
//       sizes whose mean(V') - mean(C') is >= the observed one (the observed labelling included; ties count against V,
//       i.e. in the numerator). At 4 v 4 the observed split must be among the top 3 of 70.
//   Rev 1 had (b) without the permutation test; it failed a V = C resample of P-137's C runs 37-52 % of the time
//   (ops-reader-P152 N1). False FAIL and power at 4 v 4 at P-137's noise: see the card's power note.
//   Denominator guard 15 %: when median n differs between the arms by more than 15 % of C's, the rule runs on rates s/n.
//   Precedence: VOID > INSUFFICIENT > FAIL / NO-WORSE PASS.
//   NO-WORSE PASS: neither >34 nor >50 is WORSE. FAIL: either is WORSE (named, with (a) and/or (b)); a FAIL goes to the
//   lead (block 2, judged by itself with the same rule, never pooled; or no landing). INSUFFICIENT: an arm has < 3
//   valid runs. VOID: a sentinel failed or is missing.
//   HOLD VALIDITY (rev 1.2 = P-152 rev 1.3, lead ruling 2026-10-06 after P-152's block 1 stopped at H3's end gate):
//   every hold runs a start and an end thermal gate. A counted run or a sentinel counts only when the hold that ran it
//   (its "RUN <item> arm" line in out/p153/hold-<H>.log, next to the runs folder; the current log, not a .prev) ended
//   "HOLD <H> VALID"; otherwise it is INVALID "hold <H> VOID: <why>" (an end-gate FAIL voids only that hold's runs; the
//   block stops). A run in no hold log does not count. A missing or voided sentinel makes the result VOID. This replaces
//   rev 1.1's part-2 rule (N3 and the late P-152 delta: part2Gate, endgate-HA.log), which rested on HA being part 2's
//   only end gate.
//   Twins (>30/>38 use the >34 bound, >46/>54 the >50 bound): a twin whose WORSE-or-not differs from its main
//   threshold marks the result "threshold-sensitive" (reported; PASS/FAIL unchanged).
//   A FAIL whose lowest V run at a failing threshold opens its hold (rev 1.2: EV1 or EV3) is labelled "position-confounded"
//   (P-150 N3; the outcome is unchanged). Rev 1.3: every counted run opens its hold, so the list is empty.
// ATTRIBUTION (AC1, AV1 only; decides nothing): Timeline Paint records (any depth) that start inside a moving frame's gap
//   (t - dt, t], split by the frame's morph value m = (scrollY - (maxY - innerHeight)) / innerHeight: m >= 0.55 (the
//   range where F1 hides #platform) and 0 <= m < 0.55. Per arm: frames, Paint records, Paint records per frame.
//   The geometry (track = innerHeight) is OBSERVED in Chrome; on the phone it is an approximation.
// PER RUN (descriptive): hold and position (the card's plan), start (meta.date), gap since the previous counted or
//   sentinel run, battery °C at its phone hold's start (meta.profile.start.battC), the near-band counts
//   (30, 38] = s30 - s38 and (46, 54] = s46 - s54. EC1 SLOT (N7, descriptive): whether EC1 (rev 1.3: H4, the hold after S0's) is again
//   C's maximum at >34 and >50, as it was in P-137 (OBSERVED there; P-137's C was v9-final + 7d, here C is
//   v9-final + F1 + U2).
// FIRST OPEN (the named risk; reported per run, decides nothing in the rule above; rev 1.1 after ops-reader-P153 N1-N3):
//   PR-012 rev 1 on best-build paid a longer first frame when the menu opens (phone P-092, M driver: repeat opens after a
//   full close +7 ms, V 62 vs C 55; the first open per page load V 41 vs C 34.5 ms, n 4, ranges overlapping; rev 2
//   P-098: first open +6.5 ms, WORSE by its bound V <= C + 2 ms; fixes/morph-gpu/README.md at 6f824153).
//   m per frame = (scrollY - (docH - innerHeight - lvh)) / lvh, the page's own formula (C JS 14318, track 100lvh, C CSS
//   12413), with the run's largest innerHeight standing in for lvh (disclosed: exact only when that equals lvh).
//   Opens: frames with m > 0 after a frame with m <= 0. Per open: f1 = the dt of that frame (the gap BEFORE it), f2 = the
//   next dt (the gap in which the page's switch-on for that scrollY renders; P-092's first-frame number), f12, f123.
//   O1 = the first open after load. Repeat opens are split: "full" = after the previous open reached m >= 0.99 (a full
//   open and close, P-092's repeat opens) with no innerHeight change at the open frame; the rest (mostly toolbar steps
//   moving innerHeight across m = 0; 12 of 13 per run in P-137's records) are counted, not compared.
//   Per arm: median and range of O1.f1, f2, f12, f123, and of the per-run median f2 of the full repeat opens.
//   "FIRST-OPEN RISK SEEN" when median V O1.f2 - median C O1.f2 > 2 ms (rev 2's bound); the label goes to the lead
//   with the result, the NO-WORSE outcome stays as decided.
import { readFileSync, writeFileSync, existsSync, readdirSync as fs_readdir } from 'node:fs';
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
export const FIRST_IN_HOLD = []; // rev 1.3: one counted run per hold (rev 1.2: ['EV1', 'EV3'])
export const FIRST_OPEN_BOUND_MS = 2;
/** Opens of one run (FIRST OPEN above). */
export function opens(g) {
  const seg = g.run.segments[0], fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0;
  const lvh = Math.max(...fr.map((f) => f[3]));
  const mOf = (f) => (f[2] - (docH - f[3] - lvh)) / lvh;
  const out = []; let peak = -Infinity, seen = false;
  for (let i = 1; i < fr.length; i++) {
    if (mOf(fr[i]) > 0 && mOf(fr[i - 1]) <= 0) {
      const d = (k) => (fr[i + k] ? fr[i + k][1] : null);
      const f1 = d(0), f2 = d(1), f3 = d(2);
      out.push({ i, t: fr[i][0], f1, f2, f12: f2 == null ? null : f1 + f2, f123: f2 == null || f3 == null ? null : f1 + f2 + f3,
        ihStep: fr[i][3] !== fr[i - 1][3], afterFullClose: seen && peak >= 0.99 });
      peak = -Infinity; seen = true;
    }
    if (seen) peak = Math.max(peak, mOf(fr[i]));
  }
  return out;
}
/** Per-run first-open record: O1, the full repeat opens' f2 values, the number of other opens. */
export function firstOpen(g) {
  const o = opens(g);
  if (!o.length) return { opens: 0, o1: null, repeatFull: [], repeatFullF2Median: null, repeatOther: 0 };
  const full = o.slice(1).filter((x) => x.afterFullClose && !x.ihStep).map((x) => x.f2).filter((x) => x != null);
  return { opens: o.length, o1: o[0], repeatFull: full, repeatFullF2Median: med(full), repeatOther: o.length - 1 - full.length };
}
/** Arm summary of the first open and the risk label on f2 (decides nothing). */
export function firstOpenSummary(perC, perV) {
  const st = (a) => { const v = a.filter((x) => x != null); return v.length ? { median: med(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : null; };
  const out = {};
  for (const k of ['f1', 'f2', 'f12', 'f123']) {
    const c = st(perC.map((r) => r.o1?.[k] ?? null)), v = st(perV.map((r) => r.o1?.[k] ?? null));
    const diff = c && v ? v.median - c.median : null;
    out[k] = { C: c, V: v, diff, risk: diff != null && diff > FIRST_OPEN_BOUND_MS + 1e-12 };
  }
  out.repeatFullF2 = { C: st(perC.map((r) => r.repeatFullF2Median)), V: st(perV.map((r) => r.repeatFullF2Median)) };
  out.label = out.f2.risk ? 'FIRST-OPEN RISK SEEN' : (out.f2.diff == null ? 'FIRST-OPEN NOT READ (no open in an arm)' : 'first open within +2 ms');
  return out;
}
/** Rev 1.2 (P-152 rev 1.3): which hold ran each item, and whether that hold ended VALID. logs = { H: text of hold-<H>.log }.
 *  Returns { item: { hold, valid, why } } from each log's RUN lines and its last HOLD line. */
export function holdStatus(logs) {
  const out = {};
  for (const [h, text] of Object.entries(logs)) {
    const last = (text.match(new RegExp(`^HOLD ${h} (VALID|VOID|DRY).*$`, 'gm')) || []).pop() || '';
    const valid = /^HOLD \S+ VALID/.test(last);
    for (const m of text.matchAll(/^RUN (\S+) arm/gm)) out[m[1]] = { hold: h, valid, why: valid ? null : `hold ${h} ${last ? last.replace(/^HOLD \S+ /, '') : 'did not end (no HOLD line)'}` };
  }
  return out;
}
export const P_MAX = 0.05;
/** Exact one-sided permutation p for "V higher than C" on the mean difference; ties count against V.
 *  Copied from fix-end-bg's fixes/end-bg/phone/p150-read.mjs at 753366c1 (P-150 rev 1.3), arm name N -> V only. */
export function permP(c, x) {
  const all = [...c, ...x], n = all.length, k = x.length, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const obs = mean(x) - mean(c), eps = 1e-9;
  let tot = 0, ge = 0;
  const pick = (start, chosen) => {
    if (chosen.length === k) {
      const inX = new Set(chosen), xs = chosen.map((i) => all[i]), cs = all.filter((_, i) => !inX.has(i));
      tot++; if (mean(xs) - mean(cs) >= obs - eps) ge++; return;
    }
    for (let i = start; i <= n - (k - chosen.length); i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return { p: ge / tot, ge, tot };
}
export function decideNoWorse(c, x, names = null, fih = FIRST_IN_HOLD) {
  const nC = med(c.map((m) => m.n)), nX = med(x.map((m) => m.n));
  const basisRates = c.length && x.length && nC ? Math.abs(nX - nC) > 0.15 * nC : false;
  const basis = basisRates ? `rates (median n C ${nC}, V ${nX})` : `counts (median n C ${nC}, V ${nX})`;
  if (c.length < 3 || x.length < 3) return { result: 'INSUFFICIENT', basis };
  const val = (m, th) => (basisRates ? (m.n ? m.s[th] / m.n : 0) : m.s[th]);
  const bound = (th) => (basisRates ? BOUND[th] / nC : BOUND[th]);
  const diff = Object.fromEntries(TH.map((th) => [th, med(x.map((m) => val(m, th))) - med(c.map((m) => val(m, th)))]));
  const perm = Object.fromEntries(TH.map((th) => [th, permP(c.map((m) => val(m, th)), x.map((m) => val(m, th)))]));
  const fmtP = (th) => `p ${perm[th].ge}/${perm[th].tot}`;
  const why = (th) => [separated(c.map((m) => val(m, th)), x.map((m) => val(m, th))) ? 'separated' : null,
    diff[th] > bound(th) + 1e-12 && perm[th].p <= P_MAX + 1e-12 ? `median +${+diff[th].toFixed(4)} > +${+bound(th).toFixed(4)}, ${fmtP(th)}` : null].filter(Boolean);
  const isW = (th) => why(th).length > 0;
  const worse = [34, 50].filter(isW);
  const sensitive = isW(30) !== isW(34) || isW(38) !== isW(34) || isW(46) !== isW(50) || isW(54) !== isW(50);
  let confounded = false;
  if (worse.length && names) for (const th of worse) { const vs = x.map((m) => val(m, th)), lo = Math.min(...vs); if (fih.includes(names[vs.indexOf(lo)])) confounded = true; }
  // reported, decides nothing: thresholds whose median bound is exceeded while p > 0.05 (rev 1 would have failed them)
  const boundOnly = TH.filter((th) => diff[th] > bound(th) + 1e-12 && perm[th].p > P_MAX + 1e-12).map((th) => `>${th} ${fmtP(th)}`);
  const p = Object.fromEntries(TH.map((th) => [th, `${perm[th].ge}/${perm[th].tot}`]));
  return { result: worse.length ? `FAIL (WORSE at ${worse.map((t) => `>${t} [${why(t).join(', ')}]`).join('; ')})` : 'NO-WORSE PASS', sensitive, confounded, basis, diff, p, boundOnly };
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
  const bo = decideNoWorse(C, [mk(23), mk(18), mk(25), mk(24)]);
  ok(bo.result, 'NO-WORSE PASS', 'rev 1.1: median bound alone (+3 > +2) passes because p > 0.05');
  ok(bo.boundOnly.some((x) => x.startsWith('>34 p ')), true, 'rev 1.1: the bound-only threshold is reported with its p');
  ok(decideNoWorse([mk(20), mk(21), mk(19), mk(22)], [mk(22), mk(26), mk(27), mk(28)]).result, 'FAIL (WORSE at >34 [median +6 > +2, p 2/70])', 'clause (b) alone at >34: bound and p <= 0.05, not separated (22 = 22)');
  ok(decideNoWorse([mk(20), mk(21), mk(22), mk(21)], [mk(23), mk(23), mk(23), mk(23)]).result, 'FAIL (WORSE at >34 [separated])', 'clause (a) alone: separated, median +2 within the bound');
  ok(decideNoWorse(C, [mk(30), mk(28), mk(31), mk(29)]).result, 'FAIL (WORSE at >34 [separated, median +9 > +2, p 1/70])', 'both clauses at >34');
  ok(decideNoWorse(C, [mk(20, 4), mk(21, 5), mk(19, 1), mk(21, 4)]).result, 'NO-WORSE PASS', 'rev 1.1: median bound alone at >50 (+2 > +1, p 5/70) passes');
  ok(decideNoWorse([mk(20, 1), mk(21, 2), mk(19, 1), mk(21, 2)], [mk(20, 2), mk(21, 4), mk(19, 5), mk(21, 4)]).result, 'FAIL (WORSE at >50 [median +2.5 > +1, p 3/70])', 'clause (b) at >50: bound and p 3/70, not separated');
  // P-137's records (fix-end-bg's block, read by this reader): C = v9-final + 7d, V = + fix; end zone per run
  const R = (n, a, b, c, d, e, f) => ({ n, s: { 30: a, 34: b, 38: c, 46: d, 50: e, 54: f } });
  const p137C = [R(1394, 55, 40, 31, 16, 15, 12), R(1428, 36, 26, 14, 5, 1, 0), R(1438, 37, 25, 16, 8, 5, 2), R(1431, 46, 29, 18, 5, 3, 2)];
  const p137V = [R(1492, 13, 4, 1, 0, 0, 0), R(1496, 12, 6, 4, 1, 1, 1), R(1490, 12, 7, 1, 0, 0, 0), R(1489, 15, 9, 3, 1, 1, 0)];
  ok(decideNoWorse(p137C, [p137C[2], p137C[0], p137C[3], p137C[1]]).result, 'NO-WORSE PASS', 'A/A: P-137 C against a relabeled copy of itself passes');
  ok(decideNoWorse(p137C, p137V).result, 'NO-WORSE PASS', 'P-137 as recorded passes');
  ok(decideNoWorse(p137V, p137C).result, 'FAIL (WORSE at >34 [separated, median +21 > +2, p 1/70]; >50 [median +3.5 > +1, p 3/70])', 'P-137 arms swapped (+21 / +3.5) fails');
  ok(JSON.stringify(permP([10, 11, 12, 21], [20, 22, 23, 30])), JSON.stringify({ p: 2 / 70, ge: 2, tot: 70 }), 'permP 4 v 4: 2 of 70 relabelings (P-150 rev 1.3 case)');
  ok(permP([1, 2, 3, 4], [11, 12, 13, 14]).ge, 1, 'permP 4 v 4: full separation is 1 of 70');
  ok(permP([1, 2, 3], [11, 12, 13, 14]).p, 1 / 35, 'permP 3 v 4: full separation is 1 of 35 (clause (b) can fire)');
  ok(permP([1, 2, 3], [4, 5, 6]).p, 0.05, 'permP 3 v 3: full separation is the only p <= 0.05');
  ok(permP([1, 2, 4], [4, 5, 6]).p > 0.05, true, 'permP 3 v 3: a tie at the boundary gives p > 0.05 (ties against V)');
  ok(permP([5, 5, 5], [5, 5, 5]).ge, 20, 'permP: all ties, every relabeling counts (p 1)');
  ok(decideNoWorse(C, [mk(20, 3), mk(21, 3), mk(19, 3), mk(21, 3)]).result, 'FAIL (WORSE at >50 [separated])', 'clause (a) at >50, median +1 within bound');
  ok(decideNoWorse(C, [mk(21), mk(20), mk(23)]).result, 'NO-WORSE PASS', '3 valid runs are enough');
  ok(decideNoWorse(C, [mk(21), mk(20)]).result, 'INSUFFICIENT', 'under 3 valid V runs');
  ok(decideNoWorse(C.slice(0, 2), [mk(21), mk(20), mk(22)]).result, 'INSUFFICIENT', 'under 3 valid C runs');
  ok(decideNoWorse(C, [mk(30, 2, 200), mk(28, 2, 200), mk(31, 2, 200), mk(29, 2, 200)]).basis.startsWith('rates'), true, 'denominator guard');
  ok(decideNoWorse(C, [mk(30), mk(28), mk(31), mk(29)], ['EV1', 'EV2', 'EV3', 'EV4'], ['EV1', 'EV3']).confounded, false, 'rev 1.2 list: lowest V is EV2: not confounded');
  ok(decideNoWorse(C, [mk(27), mk(28), mk(31), mk(29)], ['EV1', 'EV2', 'EV3', 'EV4'], ['EV1', 'EV3']).confounded, true, 'rev 1.2 list: lowest V is EV1: position-confounded');
  ok(decideNoWorse(C, [mk(27), mk(28), mk(31), mk(29)], ['EV1', 'EV2', 'EV3', 'EV4']).confounded, false, 'rev 1.3 (one counted run per hold): never position-confounded');
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
  // P-153: first open (ih = lvh 800, docH 6800 -> m 0 at y 5200, m 1 at 6000). Opens at i 2 (5300) and i 7 (5250)
  // after a full open (6000 at i 4) and close (5100 at i 5..6); i 9 opens on a toolbar step (ih 800 -> 760).
  const go = { run: { segments: [{ docH: 6800, frames: [[0, 16, 5000, 800], [16, 16, 5200, 800], [56, 40, 5300, 800], [76, 20, 5500, 800],
    [92, 16, 6000, 800], [108, 16, 5100, 800], [124, 16, 5100, 800], [166, 42, 5250, 800], [190, 24, 5220, 760], [206, 16, 5220, 800], [222, 16, 5300, 800]] }] } };
  const fo = firstOpen(go), oo = opens(go);
  ok(`${fo.opens} ${fo.o1.i} ${fo.o1.f1} ${fo.o1.f2} ${fo.o1.f12} ${fo.o1.f123}`, '3 2 40 20 60 76', 'first open: m 0 is not open; O1 at the first m > 0 frame; f1, f2, f12, f123');
  ok(`${oo[1].i} ${oo[1].afterFullClose} ${oo[1].ihStep} ${oo[1].f2}`, '7 true false 24', 'repeat open after a full open and close');
  ok(`${oo[2].i} ${oo[2].ihStep} ${oo[2].afterFullClose}`, '9 true false', 'an open on a toolbar step (innerHeight change; m from the run lvh 800)');
  ok(`${fo.repeatFull.join(',')} ${fo.repeatOther} ${oo[2].f123}`, '24 1 null', 'repeat split: 1 full (f2 24), 1 other; f123 null at the run end');
  ok(firstOpen({ run: { segments: [{ docH: 6800, frames: [[0, 16, 1000, 800], [16, 16, 2000, 800]] }] } }).o1, null, 'no open in a run');
  const RO = (f2) => ({ o1: { f1: 16, f2, f12: 16 + f2, f123: 36 + f2 }, repeatFullF2Median: f2 + 10 });
  ok(firstOpenSummary([RO(34), RO(35), RO(36), RO(33)], [RO(41), RO(40), RO(49), RO(38)]).label, 'FIRST-OPEN RISK SEEN', 'risk label on f2 at median +5 ms');
  ok(firstOpenSummary([RO(34), RO(35), RO(36), RO(33)], [RO(36), RO(35), RO(37), RO(34)]).label, 'first open within +2 ms', 'f2 +1.5 ms is within the bound');
  ok(firstOpenSummary([RO(34), RO(35), RO(36)], [{ o1: null, repeatFullF2Median: null }]).label, 'FIRST-OPEN NOT READ (no open in an arm)', 'no open in V');
  ok(firstOpenSummary([{ o1: { f1: 16, f2: 30, f12: 46, f123: 60 } }, { o1: { f1: 16, f2: 30, f12: 46, f123: 60 } }], [{ o1: { f1: 30, f2: 30, f12: 60, f123: 74 } }, { o1: { f1: 30, f2: 30, f12: 60, f123: 74 } }]).label, 'first open within +2 ms', 'the label ignores f1 (+14 ms) and reads f2');
  // rev 1.2 (P-152 rev 1.3's cases): per-hold validity
  { const hs = holdStatus({
      H2: 'HOLD H2 (P-153) start\nGATE p153-H2-start -> PASS\nRUN S0 arm C exit 0\nRUN EC1 arm C exit 0\nGATE p153-H2-end -> PASS\nHOLD H2 VALID 330 s\n',
      H3: 'HOLD H3 (P-153) start\nRUN EV1 arm V exit 0\nRUN EV2 arm V exit 0\nGATE p153-H3-end -> FAIL ceiling (Critical)\nHOLD H3 VOID end gate exit 3\n',
      H4: 'HOLD H4 (P-153) start\nRUN EC2 arm C exit 0\nHOLD H4 VOID time: EC3 would start at 400 s\n',
      H5: 'HOLD H5 (P-153) start\nRUN EV3 arm V exit 0\nRUN EV4 arm V exit 0\n' });
    ok(hs.EC1.valid && hs.S0.valid, true, 'rev 1.2: runs of a VALID hold count');
    ok(hs.EV1.valid || hs.EV2.valid, false, 'rev 1.2: an end-gate FAIL voids that hold\'s runs');
    ok(hs.EV2.why, 'hold H3 VOID end gate exit 3', 'rev 1.2: the reason names the hold and its last line');
    ok(hs.EC2.valid, false, 'rev 1.2: a run in a hold that stopped early (time guard) does not count');
    ok(hs.EV3.why, 'hold H5 did not end (no HOLD line)', 'rev 1.2: a hold with no HOLD line does not count');
    ok(hs.EC4, undefined, 'rev 1.2: a run in no hold log is unknown (the read voids it)'); }
  ok(holdStatus({ H4: 'RUN EC2 arm C exit 0\nHOLD H4 VOID time: EC3\n' }).EC2.valid, false, 'rev 1.2: the time-guard try of a hold is void');
  ok(holdStatus({ H4: 'RUN EC2 arm C exit 0\nRUN EC3 arm C exit 0\nHOLD H4 VALID 500 s\n' }).EC3.valid, true, 'rev 1.2: the whole re-run of that hold (the current log) counts');
  ok(holdStatus({ HA: 'RUN AC1 arm C exit 0\nRUN AV1 arm V exit 0\nHOLD HA VOID end gate exit 3\n' }).AV1.valid, false, 'rev 1.2: an HA end-gate FAIL voids only HA (attribution), not part 2');
  console.log(`SELFTEST ok (${n} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-morph-p1/phone/p153-read.mjs <folder> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {}, attribution: {} }, per = { C: [], V: [] }, names = { C: [], V: [] }, fo = { C: [], V: [] };
  const PLAN = { S0: 'H3', EC1: 'H4', EV1: 'H5', EV2: 'H6', EC2: 'H7', EC3: 'H8', EV3: 'H9', EV4: 'H10', EC4: 'H11', S1: 'H12+ (last)' }; // rev 1.3: one run per hold
  const t0 = (g) => (g?.meta?.date ? Date.parse(g.meta.date) : null);
  const starts = [];
  // rev 1.2 (P-152 rev 1.3): each run counts only when its own hold ended VALID
  const base = dirname(dir.replace(/\/+$/, ''));
  const logs = {};
  for (const f of existsSync(base) ? fs_readdir(base) : []) { const m = f.match(/^hold-(H[0-9A]+)\.log$/); if (m) logs[m[1]] = readFileSync(join(base, f), 'utf8'); }
  const hs = holdStatus(logs);
  const holdWhy = (item) => (!hs[item] ? 'in no hold log' : hs[item].valid ? null : hs[item].why);
  out.holds = Object.fromEntries(Object.keys(logs).sort().map((h) => [h, (logs[h].match(new RegExp(`^HOLD ${h} (VALID|VOID|DRY).*$`, 'gm')) || ['no HOLD line']).pop()]));
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const hw = g ? holdWhy(s) : null; const r = g && !hw ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: hw ? `FAIL (${hw})` : 'FAIL (no record)' }; if (g) starts.push([s, t0(g)]); }
  for (const arm of ['C', 'V']) for (let k = 1; k <= 4; k++) {
    const base = `E${arm}${k}`; let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(`g-${name}.json`), tl = load(`tl-${name}.json`);
      if (!g) continue;
      { const hw = holdWhy(name); if (hw) { out.invalid[name] = [hw]; continue; } }
      const r = readRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name; const w = endZone(r), at = afterTouchend(g, r), f = firstOpen(g);
      out.runs[name] = { arm, ...w, afterTouchend: at, firstOpen: f, hold: PLAN[name] || 'H12+ (re-run)', start: g.meta?.date ?? null, battC: g.meta?.profile?.start?.battC ?? null };
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
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) ${r.hold} start ${r.start} gap ${r.gapS ?? '-'} s batt ${r.battC ?? '-'} C | end zone n ${r.n} >30 ${r.s[30]} >34 ${r.s[34]} >38 ${r.s[38]} | >46 ${r.s[46]} >50 ${r.s[50]} >54 ${r.s[54]} | near bands (30,38] ${r.s[30] - r.s[38]} (46,54] ${r.s[46] - r.s[54]} | after touchend n ${r.afterTouchend.n} >34 ${r.afterTouchend.s[34]} | first open after load f1 ${r.firstOpen.o1?.f1 ?? '-'} f2 ${r.firstOpen.o1?.f2 ?? '-'} f12 ${r.firstOpen.o1?.f12 ?? '-'} f123 ${r.firstOpen.o1?.f123 ?? '-'} ms; opens ${r.firstOpen.opens} (full repeats ${r.firstOpen.repeatFull.length}, f2 median ${r.firstOpen.repeatFullF2Median ?? '-'}; other ${r.firstOpen.repeatOther})`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`HOLDS ${JSON.stringify(out.holds)}`);
  console.log(`DECISION ${out.result.result}${out.result.confounded ? ' [position-confounded]' : ''}${out.result.sensitive ? ' [threshold-sensitive]' : ''} ${out.result.basis || ''} ${out.result.diff ? 'median V-C ' + JSON.stringify(out.result.diff) : ''}${out.result.p ? ' p ' + JSON.stringify(out.result.p) : ''}`);
  if (out.result.boundOnly?.length) console.log(`  median bound exceeded with p > 0.05 (not WORSE in rev 1.1; reported): ${out.result.boundOnly.join(', ')}`);
  // N7 (OBSERVED in P-137: EC1, right after S0 in H2, was C's maximum at both thresholds): does it repeat?
  const ec1 = out.runs.EC1, cs = Object.values(out.runs).filter((r) => r.arm === 'C');
  if (ec1 && cs.length > 1) for (const th of [34, 50]) console.log(`EC1 SLOT >${th}: EC1 ${ec1.s[th]}, C runs ${cs.map((r) => r.s[th]).join('/')}; EC1 is C's maximum: ${ec1.s[th] >= Math.max(...cs.map((r) => r.s[th])) ? 'yes' : 'no'} (descriptive)`);
  { const F = out.firstOpen, d = (k) => `${k} C ${F[k].C ? `${F[k].C.median} (${F[k].C.min}-${F[k].C.max})` : '-'} V ${F[k].V ? `${F[k].V.median} (${F[k].V.min}-${F[k].V.max})` : '-'} diff ${F[k].diff ?? '-'}`;
    console.log(`FIRST OPEN (named risk; decides nothing) ${F.label}: ${d('f2')} | ${d('f1')} | ${d('f12')} | ${d('f123')} | full repeat opens f2 medians C ${F.repeatFullF2.C?.median ?? '-'} V ${F.repeatFullF2.V?.median ?? '-'} ms`); }
  console.log(`ATTRIBUTION (decides nothing) ${JSON.stringify(out.attribution)}`);
  console.log('NOTE rev 1.3: every counted run opens its own hold after cooling below 38 C (no first-in-hold position effect between runs)');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}
