#!/usr/bin/env node
// P-122 scorer (v9 phone no-worse check: C = v8 vs V = v9-final, rev 7c + double-drive + Join button + nav-hit-cache, no scroll-cb or close; README "P-122 (v9-final)").
// Written before any P-122 data. It imports, refused if changed:
//   - v9's P-120 scorer fixes/v9-best/phone/score.mjs (fd9ecebcf4d0: the A2 cut trimM, the arm pins V9, loadEntries),
//     which itself imports P-111's scorer unchanged (S: scoreM, scoreG, gate, tweenGate, clusters, applySentinel);
//   - P-121's path gates fixes/v9-best/phone/p121/gate.mjs (1a1d716698f0: gateM, gateE, strokes, RULE).
// Items (hold122.sh): n<arm><n> M leg (A2, cycles 4) · g<P><arm><n> G runs, P = M (flick-middle-v2), X (flick-end-v2
// speed=fast), S (flick-end-v2 speed=slow), R (flick-return-v1, incident I-179) · sCo / sCc S sentinels on C ·
// w<arm>, wg<P><arm> warm-ups (skipped).
// Per run, before scoring, a path gate (a failing run is VOID, never scored):
//   gM  gateM: >= 5 traversals of [2200, 3800], max y < 5000 (both arms)
//   gX  C: gateE fast (the out stroke meets the release rule's stroke criteria, the fling leaves the end by >= 1600 px)
//       V: the out stroke meets the same stroke criteria; leaving the end is NOT required: rev 7c catches every
//       close-direction release from the open end at the closed rest (H3a2, F-258), so V's fromEnd is reported
//       ("caught" when < 1600), never a void
//   gS  gateE slow (both arms: the out stroke meets neither criterion, with the margins)
//   gR  gateR: at least one of the three ret strokes lifts with p in (-0.20, -0.05] (just past the closed rest)
// Gates (block verdict):
//   Mmoving, Mtweens  P-111's, on the A2-cut M records (unchanged from P-120 A2)
//   GM                P-111's G gate on part M (> 50 WORSE when d > +2, NEW 250 px cluster fails; twins)
//   EX, ES            V ceiling: every valid V run has 0 frames with dt > 50 ms in the part window (into1 .. end); > 46 /
//                     > 54 twins reported (threshold-sensitive when a twin's verdict differs), frames in (46, 54]
//                     flagged; sub-windows out1..into2 and out2..end reported. Needs >= 3 valid V runs (EX), >= 2 (ES).
//                     C runs are reported (counts, path), not gated: the paths differ by design (catch vs travel on).
//   R                 report only (rev 7c's known limit, I-179): per ret stroke p at lift, lowest p, returned to open
//                     with no finger down (and the delay); the V ceiling counts of the R window are reported.
// Verdict: WORSE if any gate is WORSE or has a NEW cluster; else insufficient if any is; else no-worse. Gates here are
//   GM, EX, ES and FLICKER (nav-hit-cache's flicker gate with C = v8: the ship baseline, a deviation from nav's draft
//   C = step 4, accepted by the lead). No M leg on v9-final (G parts only); the Mmoving/Mtweens lines above are history.
//   A fling-distance parity FAIL (parity() below) prefixes the verdict with "FAIL (behaviour)".
//   If V's gM path gate fails, part M is INSUFFICIENT with the reason (never re-scripted after data, lead ruling).
// Also per run (F-260, report only): the Analytics 90 % depth line y90 = 0.9 docH - vh, the time the run first reaches
// it, and whether that is inside the scored window (gtag's scroll task, OBSERVED in Chrome at the first open on v9).
//   node fixes/v9-best/phone/p122/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const PINS = { 'score.mjs': ['../score.mjs', 'fd9ecebcf4d0'], 'gate.mjs': ['../p121/gate.mjs', '1a1d716698f0'],
  'flicker-gate.mjs': ['../../../nav-hit-cache/flicker-gate.mjs', '3c2bd0cb7f09'] };
for (const [n, [p, h]] of Object.entries(PINS)) {
  const got = sha(join(here, p)).slice(0, 12);
  if (got !== h) { console.error(`${n} changed (${got}, pinned ${h}): refuse`); process.exit(3); }
}
export const V9S = await import(join(here, '../score.mjs'));
export const GT = await import(join(here, '../p121/gate.mjs'));
const S = V9S.S;
const self = sha(fileURLToPath(import.meta.url));

export const R_LIFT = [-0.2, -0.05], R_LEFT = -0.15, R_OPEN = 0.98, MIN = { GM: 3, EX: 3, ES: 2, R: 2 };
// P-122's arms: C = v8-best (P-120's pin), V = v9-final (fixes/v9-best/build.mjs V9_EXPECT; out/p122/snap/HASHES.txt)
export const P122 = {
  C: { ...V9S.V9.C },
  V: { js: '647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
};
// nav-hit-cache's flicker gate (its own scorer, run as a child; exit 0 PASS, 3 FAIL, 4 VOID, 5 INCONCLUSIVE) on the
// counted G runs of parts M, X and S (both arms carry the logger; R is V only and stays out), path-voided runs included.
// Lead ruling F3 (2026-10-05): G1 (V monotone blinks = 0) is the gate; G2 / G3 (against C = v8) and the gate's own
// overall word (PASS / FAIL / INCONCLUSIVE) are reported only, so INCONCLUSIVE never makes the block insufficient.
// VOID (exit 4: < 3 valid runs an arm, script hashes differ) or an unknown exit / no G1 line: insufficient.
export const FLICKER = join(here, PINS['flicker-gate.mjs'][0]);
export function flickerVerdict(code, stdout = '') {
  const g1 = String(stdout).match(/^G1 V monotone blinks (\d+) \(C (\d+)\): (pass|FAIL)$/m);
  const word = String(stdout).match(/^FLICKER-GATE (.+?) \(K=/m)?.[1] ?? null;
  const rep = `; flicker-gate ${word ?? `exit ${code}`} (G2/G3 reported only)`;
  if (code === 4) return `insufficient (flicker gate VOID)${rep}`;
  if (![0, 3, 5].includes(code) || !g1) return `insufficient (flicker-gate exit ${code}${g1 ? '' : ', no G1 line'})`;
  return g1[3] === 'pass' ? `no-worse (G1: V monotone blinks 0, C ${g1[2]})${rep}` : `WORSE (G1: V monotone blinks ${g1[1]}, C ${g1[2]})${rep}`;
}

export function parse(item) {
  if (/^w[CV]$/.test(item) || /^wg[MXSR][CV]$/.test(item)) return { warmup: true };
  if (/^sC[oc]$/.test(item)) return { kind: 'S', arm: 'C' };
  let m = item.match(/^n([CV])(\d+)$/); if (m) return { kind: 'M', arm: m[1], run: +m[2] };
  m = item.match(/^g([MXSR])([CV])(\d+)$/); if (m) return { kind: 'G', part: m[1], arm: m[2], run: +m[3] };
  throw new Error(`unknown item ${item}`);
}

const segOf = (j, mark) => (j?.run?.segments || []).find((s) => (s.marks || []).some((m) => m[1] === mark));

// F-260: first time the run reaches the 90 % depth line, and whether it is inside the scored window [t0, t1]
export function depth90(frames, docH, vh, t0, t1) {
  if (!frames?.length || !docH || !vh) return null;
  const y90 = Math.round(0.9 * docH - vh), f = frames.find((x) => x[2] >= y90);
  return { y90, firstAt: f ? f[0] : null, inWindow: f ? f[0] >= t0 && f[0] <= t1 : false };
}

// I-179: the ret strokes of flick-return-v1 (marks ret1..ret3)
export function gateR(j, { lift = R_LIFT, left = R_LEFT, open = R_OPEN } = {}) {
  const seg = segOf(j, 'into1'); if (!seg) return { ok: false, why: ['no into1 mark'] };
  const marks = seg.marks.map((x) => [x[1], x[0]]), fr = seg.frames || [], tc = seg.touches || [];
  const lvh = Math.max(...fr.map((x) => x[3] ?? 0)), docH = Math.max(seg.docH ?? 0, seg.docH1 ?? 0);
  const pOf = (x) => (x[2] - (docH - (x[3] ?? lvh) - lvh)) / lvh;
  const all = GT.strokes(seg), rets = [];
  for (const name of ['ret1', 'ret2', 'ret3']) {
    const i = marks.findIndex((m) => m[0] === name); if (i < 0) { rets.push({ name, err: 'no mark' }); continue; }
    const tm = marks[i][1], tn = marks[i + 1]?.[1] ?? Infinity, s = all.find((x) => x.t >= tm && x.t < tn);
    if (!s) { rets.push({ name, err: 'no stroke' }); continue; }
    const before = fr.filter((x) => x[0] < s.end).at(-1), after = fr.filter((x) => x[0] >= s.end && x[0] <= tn); // last frame before the lift
    const pLift = before ? +pOf(before).toFixed(3) : null;
    let low = null; for (const x of after) { const p = pOf(x); if (!low || p < low.p) low = { t: x[0], p }; }
    const back = low && low.p < left ? after.find((x) => x[0] > low.t && pOf(x) >= open) : null;
    const fingerDown = back ? tc.some((t) => t[1] === 's' && t[0] > s.end && t[0] <= back[0]) : false;
    rets.push({ name, fv: s.fv, travel: s.travel, pLift, inRange: pLift !== null && pLift > lift[0] && pLift <= lift[1],
      lowP: low ? +low.p.toFixed(3) : null, left: !!(low && low.p < left), returned: !!(back && !fingerDown), returnMs: back && !fingerDown ? back[0] - low.t : null });
  }
  const n = rets.filter((r) => r.inRange).length, why = n ? [] : ['path not covered: no ret stroke lifted with p in (-0.20, -0.05]'];
  return { ok: !why.length, why, rets, inRange: n, returned: rets.filter((r) => r.inRange && r.returned).length };
}

const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34 };
function windowCounts(seg, a, b) {
  const fr = seg.frames || [], dts = [];
  for (let i = 1; i < fr.length; i++) if (fr[i][0] >= a && fr[i][0] <= b && fr[i][1] != null && fr[i][2] !== fr[i - 1][2]) dts.push(fr[i][1]);
  return { frames: dts.length, ...Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length])), near: dts.filter((d) => d > 46 && d <= 54) };
}

function pathGate(j, part, arm) {
  if (part === 'M') return GT.gateM(j);
  if (part === 'S') return GT.gateE(j, 'slow');
  if (part === 'R') return gateR(j);
  const g = GT.gateE(j, 'fast');
  if (arm === 'C' || !g.outs) return g;
  const why = g.outs.filter((o) => !o.released).map((o) => `${o.name}: out stroke not fast by the rule's criteria (Fv ${o.fv}, travel ${o.travel})`);
  for (const k of ['out1', 'out2']) if (!g.outs.some((o) => o.name === k)) why.push(`no ${k} stroke`);
  return { ...g, ok: !why.length, why, outs: g.outs.map((o) => ({ ...o, caught: o.fromEnd !== null && o.fromEnd < GT.LEAVE_E })) };
}

export function scoreRun(item, j, checkLog) {
  const p = parse(item); if (p.warmup) return null;
  const base = { item, ...p, isSentinel: p.kind === 'S' || (p.kind === 'M' && p.arm === 'C') };
  if (p.kind !== 'G') {
    let jj = j, trim;
    if (p.kind === 'M') { const t = V9S.trimM(j); jj = t.j; trim = t.trim; }
    const r = S.scoreBlock([{ item: p.kind === 'S' ? 'sC' : `m${p.arm}${p.run}`, j: jj }]).runs[0];
    const out = { ...base, void: r.void.filter((v) => !/^sentinel /.test(v)), sentinel: r.sentinel, moving: r.moving, tweens: r.tweens, atOneP95: r.atOneP95, a2: trim };
    if (p.kind === 'M' && jj?.frames) { const d = jj.marks?.drive; out.f260 = depth90(jj.frames, jj.pre?.docH, jj.meta?.vh0, d?.[0], d?.[1]); } // frames [t, dt, yStart, ...]
    return out;
  }
  const jj = V9S.gNoData(j, p.part === 'M' ? 'M' : 'E');
  const g = S.scoreG(jj, p.part === 'M' ? 'M' : 'E', checkLog);
  const out = { ...base, ...g };
  if (!j) return out;
  const path = pathGate(j, p.part, p.arm);
  out.path = path;
  if (!path.ok) out.void.push(...path.why.map((w) => `path: ${w}`));
  const seg = segOf(j, p.part === 'M' ? 'mid1' : 'into1');
  if (seg) {
    const mk = Object.fromEntries(seg.marks.map((x) => [x[1], x[0]])), t0 = mk[p.part === 'M' ? 'mid1' : 'into1'], t1 = mk.end ?? Infinity;
    out.window = windowCounts(seg, t0, t1);
    if (p.part === 'X' || p.part === 'S') out.sub = { out1_into2: windowCounts(seg, mk.out1, mk.into2), out2_end: windowCounts(seg, mk.out2, t1) };
    out.f260 = depth90(seg.frames, Math.max(seg.docH ?? 0, seg.docH1 ?? 0), seg.vh0, t0, t1);
  }
  return out;
}

function ceiling(V, min) {
  const n = V.length; if (n < min) return { nV: n, verdict: `insufficient (V ${n}, need ${min})` };
  const k = (key) => V.reduce((a, r) => a + (r.window?.[key] ?? 0), 0), worse = (key) => k(key) > 0;
  const out = { nV: n, gt50: k('gt50'), gt46: k('gt46'), gt54: k('gt54'), near: V.flatMap((r) => r.window?.near ?? []) };
  out.thresholdSensitive = worse('gt46') !== worse('gt50') || worse('gt54') !== worse('gt50');
  out.verdict = (worse('gt50') ? `WORSE (V ceiling: ${out.gt50} frame(s) > 50 ms)` : 'no-worse') + (out.thresholdSensitive ? ' (threshold-sensitive)' : '');
  return out;
}

export function scoreP122(entries, flicker = null) {
  const runs = entries.map((e) => scoreRun(e.item, e.j, e.checkLog)).filter(Boolean);
  S.applySentinel(runs);
  const ok = (f) => runs.filter((r) => !r.void.length && r.kind !== 'S' && f(r));
  const gates = {};
  // no M leg (v9-final: G parts only); an n item is refused by hold122.sh, and any M record here is ignored
  const G = (P, A) => ok((r) => r.kind === 'G' && r.part === P && r.arm === A);
  const gm = S.gate(G('M', 'C').map((r) => r.counts), G('M', 'V').map((r) => r.counts), MIN.GM);
  if (!/^insufficient/.test(gm.verdict)) {
    gm.cluster = S.clusters(G('M', 'C'), G('M', 'V'), 'gt50');
    gm.clusterThresholdSensitive = ['gt46', 'gt54'].some((k) => (S.clusters(G('M', 'C'), G('M', 'V'), k).newClusters.length > 0) !== (gm.cluster.newClusters.length > 0));
    if (gm.cluster.newClusters.length) gm.verdict = `NEW CLUSTER at ${gm.cluster.newClusters.join(', ')}` + (gm.verdict.startsWith('WORSE') ? `; ${gm.verdict}` : '');
  }
  gates.GM = gm;
  gates.EX = ceiling(G('X', 'V'), MIN.EX);
  gates.ES = ceiling(G('S', 'V'), MIN.ES);
  const rV = G('R', 'V');
  const reported = {
    R: { nV: rV.length, enough: rV.length >= MIN.R, strokesInRange: rV.reduce((a, r) => a + r.path.inRange, 0), returned: rV.reduce((a, r) => a + r.path.returned, 0), ceiling: ceiling(rV, 1) },
    Cref: Object.fromEntries(['X', 'S', 'R'].map((P) => [P, G(P, 'C').map((r) => ({ item: r.item, window: r.window, outs: r.path?.outs }))])),
  };
  if (flicker) gates.FLICKER = flicker;
  const par = parity(entries);
  reported.parity = par;
  const vs = Object.values(gates).map((g) => g.verdict);
  let verdict = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  if (par.verdict === 'BEHAVIOUR FAIL') verdict = `BEHAVIOUR FAIL; frames ${verdict}`;
  const thresholdSensitive = Object.values(gates).some((g) => g.thresholdSensitive || g.clusterThresholdSensitive);
  return { runs, gates, reported, verdict, thresholdSensitive };
}

// Fling-distance parity (BEHAVIOUR; lead rulings 2026-10-05 after the Simulator dry run and the gM split: v9 with
// scroll-cb stopped the first page-up fling in the middle 500-950 px short, OBSERVED). Fixed before any P-122 data:
//   distance  per stroke, from the finger's lift (the stroke's touchend) to the settle (the first frame after which the
//             page's scrollY stays unchanged for SETTLE_MS) or to the next stroke's touchstart, whichever comes first;
//             d = |y(end) - y(lift)|, y from the run's own frame log (run.segments[].frames [t, dt, scrollY, ih]).
//   compared  M: the first page-up fling of the part window (the first finger-down stroke after mark mid1: the fling
//             that came up short), and X: the first stroke after mark into1 (not out1/out2: rev 7c's catch shortens
//             V's out-flings by design). Reported only: M's first page-down fling, every other stroke of M, X, S and R.
//   clipped   a fling that ends within CLIP_PX of its own arm's end (top 0 or docH - innerHeight) could not go further:
//             a pair (or median) gap in which the SHORTER side is clipped does not count (v9's open end is one screen
//             lower than v8's, so X's into fling can travel further on V by design).
//   runs      every counted G run of the part that has a record, whatever its path gate said (a behaviour change may be
//             exactly what voids a path); pairs by run number n (g<P>C<n> with g<P>V<n>).
//   counts    |median V - median C| > PARITY_PX (300) AND at least PAIRS_MIN (2) pairs with |V - C| > 300 in the same
//             direction (clip rule applied to both); fewer than PAIRS_MIN pairs: insufficient, never pass.
//   verdict   BEHAVIOUR FAIL (printed on its own line, never masked by the frame gates) | pass | insufficient.
export const PARITY_PX = 300, PAIRS_MIN = 2, SETTLE_MS = 300, CLIP_PX = 10;
export const PARITY_PARTS = { M: 'first page-up fling after mid1', X: 'first stroke after into1' };
export const settles = (j) => (j?.run?.untils || []).filter((u) => u.cond === 'settled' && Number.isFinite(u.y)).map((u) => u.y);
const PMARK = { M: 'mid1', X: 'into1', S: 'into1', R: 'into1' };
// per stroke after the part's mark: the page's direction ('down' = scrollY grows = finger up), y at lift, y at end, distance
export function liftDists(j, part) {
  const mark = PMARK[part], seg = segOf(j, mark); if (!seg) return { err: `no ${mark} mark`, flings: [] };
  const mk = Object.fromEntries(seg.marks.map((x) => [x[1], x[0]])), t0 = mk[mark], t1 = mk.end ?? Infinity;
  const fr = seg.frames || [], docH = Math.max(seg.docH ?? 0, seg.docH1 ?? 0);
  const st = GT.strokes(seg).filter((x) => x.t >= t0 && x.t <= t1);
  const yAt = (t) => { let y = null; for (const f of fr) { if (f[0] >= t) break; y = f[2]; } return y; }; // last frame before the lift
  const flings = st.map((s, i) => {
    const next = st[i + 1]?.t, stop = Math.min(next ?? Infinity, t1), yLift = yAt(s.end), page = s.dir === 'up' ? 'down' : 'up';
    const after = fr.filter((f) => f[0] >= s.end && (next !== undefined && next <= t1 ? f[0] < next : f[0] <= t1)); // up to the next touchstart (excl.) or the end mark
    if (!after.length || yLift === null) return { t: s.end, page, err: 'no frames after lift' };
    let end = after[after.length - 1], how = 'next stroke';
    for (let k = 0; k < after.length; k++) {
      const y = after[k][2], tk = after[k][0];
      if (tk + SETTLE_MS > stop && stop !== Infinity) break; // not enough time left to call it settled: the next stroke ends it
      if (after.every((f) => f[0] < tk || f[0] > tk + SETTLE_MS || f[2] === y)) { end = after[k]; how = 'settle'; break; }
    }
    const maxY = docH ? docH - (end[3] ?? 0) : Infinity, yEnd = end[2];
    return { t: s.end, page, yLift, yEnd, d: Math.abs(yEnd - yLift), how, clipped: yEnd <= CLIP_PX || yEnd >= maxY - CLIP_PX };
  });
  return { flings };
}
export function pickFling(j, part) {
  const r = liftDists(j, part), ok = r.flings.filter((f) => !f.err);
  if (part === 'M') return { compared: ok.find((f) => f.page === 'up') ?? null, firstDown: ok.find((f) => f.page === 'down') ?? null, all: r.flings, err: r.err };
  return { compared: ok[0] ?? null, all: r.flings, err: r.err };
}
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// a V - C gap counts unless the shorter side is clipped at its own end
export const gapCounts = (gap, cClip, vClip) => Math.abs(gap) > PARITY_PX && !(gap > 0 && cClip) && !(gap < 0 && vClip);
export function parity(entries) {
  const per = {};
  for (const e of entries) {
    let p; try { p = parse(e.item); } catch { continue; }
    if (!p || p.warmup || p.kind !== 'G' || !e.j) continue;
    ((per[p.part] ||= { C: [], V: [] })[p.arm]).push({ item: e.item, n: p.run, ...pickFling(e.j, p.part), settles: settles(e.j) });
  }
  const out = { px: PARITY_PX, pairsMin: PAIRS_MIN, parts: {}, fail: [], insufficient: [] };
  for (const [P, a] of Object.entries(per)) {
    const rep = { compared: PARITY_PARTS[P] ?? null, runs: a };
    if (P === 'M') rep.firstDown = { C: med(a.C.map((r) => r.firstDown?.d)), V: med(a.V.map((r) => r.firstDown?.d)) };
    if (PARITY_PARTS[P]) {
      const dC = a.C.filter((r) => r.compared), dV = a.V.filter((r) => r.compared);
      const c = med(dC.map((r) => r.compared.d)), v = med(dV.map((r) => r.compared.d));
      const clipC = dC.filter((r) => r.compared.clipped).length * 2 > dC.length, clipV = dV.filter((r) => r.compared.clipped).length * 2 > dV.length;
      const pairs = dC.map((rc) => { const rv = dV.find((x) => x.n === rc.n); return rv ? { n: rc.n, C: rc.compared.d, V: rv.compared.d, gap: rv.compared.d - rc.compared.d, cClip: rc.compared.clipped, vClip: rv.compared.clipped } : null; }).filter(Boolean);
      for (const q of pairs) q.counts = gapCounts(q.gap, q.cClip, q.vClip);
      const gap = c != null && v != null ? v - c : null;
      const medCounts = gap != null && gapCounts(gap, clipC, clipV);
      const pairHits = pairs.filter((q) => q.counts && Math.sign(q.gap) === Math.sign(gap)).length;
      Object.assign(rep, { C: c, V: v, gap, clipC, clipV, pairs, pairHits, medCounts });
      if (pairs.length < PAIRS_MIN || c == null || v == null) { rep.verdict = `insufficient (${pairs.length} pair(s), need ${PAIRS_MIN})`; out.insufficient.push(`${P} ${rep.verdict}`); }
      else if (medCounts && pairHits >= PAIRS_MIN) { rep.verdict = 'BEHAVIOUR FAIL'; out.fail.push(`${P} ${rep.compared}: median V ${v} vs C ${c} (gap ${gap} px), ${pairHits} of ${pairs.length} pairs > ${PARITY_PX} px`); }
      else rep.verdict = 'pass';
    }
    out.parts[P] = rep;
  }
  for (const P of Object.keys(PARITY_PARTS)) if (!out.parts[P]) out.insufficient.push(`${P} no G runs`);
  out.verdict = out.fail.length ? 'BEHAVIOUR FAIL' : out.insufficient.length ? `insufficient (${out.insufficient.join('; ')})` : 'pass';
  return out;
}

// the flicker gate's input: counted G runs of parts M, X, S per arm (files), whatever their path gate said
export const flickerFiles = (entries) => {
  const f = { C: [], V: [] };
  for (const e of entries) { const p = parse(e.item); if (p && !p.warmup && p.kind === 'G' && 'MXS'.includes(p.part) && e.j) f[p.arm].push(e.file); }
  return f;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  V9S.pin(P122);
  const entries = V9S.loadEntries(args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)));
  const ff = flickerFiles(entries);
  let flicker = { verdict: `insufficient (flicker gate: no G runs, C ${ff.C.length} V ${ff.V.length})` };
  if (ff.C.length && ff.V.length) {
    const fj = (jsonOut || '/dev/null') === '/dev/null' ? null : jsonOut.replace(/\.json$/, '') + '-flicker.json';
    const r = spawnSync(process.execPath, [FLICKER, '--arm', 'C', ...ff.C, '--arm', 'V', ...ff.V, ...(fj ? ['--json', fj] : [])], { encoding: 'utf8' });
    flicker = { verdict: flickerVerdict(r.status, r.stdout), exit: r.status, files: { C: ff.C.length, V: ff.V.length }, json: fj, out: (r.stdout || '').trim().split('\n').slice(-12) };
  }
  const out = scoreP122(entries, flicker);
  for (const r of out.runs) {
    const what = r.kind === 'M' ? `moving ${JSON.stringify(r.moving)}; held m=1 p95 ${r.atOneP95}` : r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : `${JSON.stringify(r.window ?? r.counts)}${r.path?.outs ? '; outs ' + JSON.stringify(r.path.outs.map((o) => [o.name, o.fv, o.travel, o.fromEnd])) : ''}${r.path?.rets ? '; rets ' + JSON.stringify(r.path.rets.map((x) => [x.name, x.pLift, x.lowP, x.returned])) : ''}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}; f260 ${JSON.stringify(r.f260 ?? null)}`);
  }
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`R (report): ${JSON.stringify(out.reported.R)}`);
  for (const [P, x] of Object.entries(out.reported.parity.parts)) {
    const runs = x.runs.C.concat(x.runs.V).map((r) => `${r.item} ${r.compared ? `${r.compared.d}${r.compared.clipped ? ' clipped' : ''} (${r.compared.how})` : '-'}`).join(' | ');
    console.log(`parity ${P} (OBSERVED, lift to settle or next stroke): ${x.compared ? `${x.compared}: median C ${x.C} V ${x.V} gap ${x.gap}; pairs ${JSON.stringify((x.pairs || []).map((q) => [q.n, q.gap, q.counts]))}; ${x.verdict}` : 'reported only'}${x.firstDown ? `; first page-down (report) C ${x.firstDown.C} V ${x.firstDown.V}` : ''}; runs ${runs}`);
  }
  console.log(`parity: ${out.reported.parity.verdict}`);
  if (out.reported.parity.verdict === 'BEHAVIOUR FAIL') { console.log('BEHAVIOUR FAIL'); for (const f of out.reported.parity.fail) console.log(`  ${f}`); }
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v9-best/phone/p122/score.mjs', sha256: self, ...out }, null, 1));
}
