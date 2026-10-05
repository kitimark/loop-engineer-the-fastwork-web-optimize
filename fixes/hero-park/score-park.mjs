#!/usr/bin/env node
// P-140 part 1 scorer (frozen before data; card fixes/hero-park/TICKET.md). A pure reader of sim-park.json: no device.
//   node fixes/hero-park/score-park.mjs <sim-park.json> [--json out.json]     exit 0 PASS, 1 FAIL, 2 INSUFFICIENT, 3 VOID
//   node fixes/hero-park/score-park.mjs --selftest
// Arms: C, V, C2, C3 (C2, C3 = C again, each on its own server). Bands (sim-park): hero [0, E), edge [E, E+40),
// past [E+40, track end), below [track end, TO]. Per band and arm, per-frame rates: rs = RecalculateStyles per frame,
// sched = engine-scheduled style invalidations per frame, lay = Layout records per frame; live = frames whose swipe
// sample read .he-css (the sample is taken right after scrollTo, before that step's scroll event, so a park shows one
// 10 px step late; one step can span up to 2 rendering frames).
// Tolerance per band and rate: tol = the largest |Ci - Cj| over the three A/A pairs (C,C2), (C,C3), (C2,C3); no floor;
// cmin / cmax = min / max over C, C2, C3.
// VALID: all four arms present, none VOID (a served-hash mismatch, a thrown arm, a swipe short of TO), every band of the
// swipe has >= 5 frames in every arm. Not VALID: VOID (the run is re-run whole once by the owner; a second VOID: INSUFFICIENT).
// Items (all gating):
//   P1 functional: the step pattern below in every arm, and 0 console errors in every arm
//      C, C2, C3: E-400 live, E+60 live, E+20 live, E-100 live, E+300 live, top parked, rest parked
//      V:         E-400 live, E+60 parked, E+20 parked, E-100 live, E+300 parked, top parked, rest parked
//   P2 pixels: T0 at E+60, E+300, E+700: 0 counted px beyond the A/A and 0 px moving only in V (vOnlyMoving, rev 2b N2;
//      masks as sim-park). No T2 path on this card.
//   P3 past and below: (a) V live <= 2 in past, 0 in below; every C arm live >= 0.9 x frames in both;
//      (b) sched: V < cmin - tol in both; (c) rs: V <= cmax + tol in both; (d) lay: V <= cmax + tol in both
//      (rev 2, after the uncounted dry run, informed: (b) was V <= cmin - 0.5, the dry run cut 0.17-0.30 per frame;
//      (d) was two-sided, now one-sided after V's per-frame writer was skipped past the end, delta 14fb7c20781c)
//   P4 hero band: rs, sched, lay each within [cmin - tol, cmax + tol]
// PART 1 PASS = VALID and P1-P4 all hold; FAIL otherwise.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ARMS = ['C', 'V', 'C2', 'C3'];
export const BANDS = { hero: 'hero 0..E', edge: 'edge E..E+40', past: 'past E+40..track end' };
const below = (bands) => Object.keys(bands).find((k) => k.startsWith('below track end'));
export const EXPECT = {
  C: ['live', 'live', 'live', 'live', 'live', 'parked', 'parked'],
  V: ['live', 'parked', 'parked', 'live', 'parked', 'parked', 'parked'],
};
const STEP_NAMES = ['E-400', 'E+60', 'E+20', 'E-100', 'E+300', 'top', 'rest E-200 +700ms'];
const rate = (o, k) => (o && o.frames ? o[k] / o.frames : null);

export function score(res) {
  const out = { valid: true, why: [], items: {} };
  const A = res.arms || {};
  for (const a of ARMS) {
    if (!A[a]) { out.valid = false; out.why.push(`arm ${a} missing`); continue; }
    if (A[a].void) { out.valid = false; out.why.push(`arm ${a} VOID: ${A[a].void}`); }
  }
  if (!out.valid) return { ...out, verdict: 'VOID' };
  const bk = { hero: BANDS.hero, past: BANDS.past, below: below(A.C.bands || {}) };
  for (const a of ARMS) for (const [n, k] of Object.entries(bk)) {
    const f = k && A[a].bands?.[k]?.frames;
    if (!(f >= 5)) { out.valid = false; out.why.push(`arm ${a} band ${n} has ${f || 0} frames (< 5; a scored band: hero, past, below)`); }
  }
  if (!out.valid) return { ...out, verdict: 'VOID' };
  // P1
  const p1 = [];
  for (const a of ARMS) {
    const exp = EXPECT[a === 'V' ? 'V' : 'C'];
    const got = (A[a].steps || []).map((s) => (s[2] ? 'live' : 'parked'));
    const names = (A[a].steps || []).map((s) => s[0]);
    if (names.join('|') !== STEP_NAMES.join('|')) p1.push(`${a} steps ${names.join(',')}`);
    else exp.forEach((e, i) => { if (got[i] !== e) p1.push(`${a} ${STEP_NAMES[i]} ${got[i]} (expected ${e})`); });
    if ((A[a].consoleErrors || []).length) p1.push(`${a} ${A[a].consoleErrors.length} console errors`);
  }
  out.items.P1 = { pass: p1.length === 0, misses: p1 };
  // P2
  const p2 = [];
  for (const pos of ['E+60', 'E+300', 'E+700']) {
    const px = res[`pixels ${pos}`];
    if (!px) p2.push(`${pos} no pixel record`); else {
      if (px.beyondAA !== 0) p2.push(`${pos} ${px.beyondAA} px beyond A/A (max ${px.beyondAAmax}, >8: ${px.beyondAAover8})`);
      if (px.vOnlyMoving !== 0) p2.push(`${pos} ${px.vOnlyMoving ?? 'no'} px moving only in V (max ${px.vOnlyMovingMax})`);
    }
  }
  out.items.P2 = { pass: p2.length === 0, misses: p2 };
  // tolerances
  const cs = ['C', 'C2', 'C3'];
  const stat = (band, k) => {
    const c = cs.map((a) => rate(A[a].bands[band], k));
    const tol = Math.max(Math.abs(c[0] - c[1]), Math.abs(c[0] - c[2]), Math.abs(c[1] - c[2]));
    return { c, cmin: Math.min(...c), cmax: Math.max(...c), tol, v: rate(A.V.bands[band], k) };
  };
  out.stats = {};
  for (const [n, band] of Object.entries(bk)) out.stats[n] = Object.fromEntries(['rs', 'schedEngine', 'lay'].map((k) => [k, stat(band, k)]));
  // P3
  const p3 = [];
  for (const n of ['past', 'below']) {
    const band = bk[n], vb = A.V.bands[band];
    if (vb.liveFrames > (n === 'past' ? 2 : 0)) p3.push(`(a) V live ${vb.liveFrames} in ${n}`);
    for (const a of cs) { const b = A[a].bands[band]; if (b.liveFrames < 0.9 * b.frames) p3.push(`(a) ${a} live ${b.liveFrames} of ${b.frames} in ${n}`); }
    const S = out.stats[n];
    if (!(S.schedEngine.v < S.schedEngine.cmin - S.schedEngine.tol)) p3.push(`(b) ${n} sched V ${S.schedEngine.v.toFixed(3)} not < cmin - tol ${(S.schedEngine.cmin - S.schedEngine.tol).toFixed(3)}`);
    if (!(S.rs.v <= S.rs.cmax + S.rs.tol)) p3.push(`(c) ${n} rs V ${S.rs.v.toFixed(3)} > cmax + tol ${(S.rs.cmax + S.rs.tol).toFixed(3)}`);
    if (!(S.lay.v <= S.lay.cmax + S.lay.tol)) p3.push(`(d) ${n} lay V ${S.lay.v.toFixed(3)} > cmax + tol ${(S.lay.cmax + S.lay.tol).toFixed(3)}`);
  }
  out.items.P3 = { pass: p3.length === 0, misses: p3 };
  // P4
  const p4 = [];
  for (const k of ['rs', 'schedEngine', 'lay']) {
    const s = out.stats.hero[k];
    if (!(s.v >= s.cmin - s.tol && s.v <= s.cmax + s.tol)) p4.push(`hero ${k} V ${s.v.toFixed(3)} outside [${(s.cmin - s.tol).toFixed(3)}, ${(s.cmax + s.tol).toFixed(3)}]`);
  }
  out.items.P4 = { pass: p4.length === 0, misses: p4 };
  out.verdict = Object.values(out.items).every((i) => i.pass) ? 'PASS' : 'FAIL';
  return out;
}

function selftest() {
  let n = 0;
  const ok = (a, b, m) => { n++; if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${a} != ${b}`); process.exit(1); } };
  const band = (frames, live, rs, sched, lay) => ({ frames, liveFrames: live, rs: rs * frames, schedEngine: sched * frames, lay: lay * frames });
  const steps = (exp) => STEP_NAMES.map((s, i) => [s, 0, exp[i] === 'live']);
  const arm = (isV, o = {}) => ({
    steps: steps(EXPECT[isV ? 'V' : 'C']), consoleErrors: [],
    bands: { [BANDS.hero]: band(80, 70, 1.0, 1.0, 3.0), [BANDS.edge]: band(4, 4, 1, 1, 3),
      [BANDS.past]: band(70, isV ? 1 : 70, isV ? 0.6 : 1.2, isV ? 0.2 : 1.1, 3.0), 'below track end..2400': band(80, isV ? 0 : 80, isV ? 0.6 : 1.2, isV ? 0.2 : 1.1, 3.0) },
    ...o,
  });
  const px = { beyondAA: 0, beyondAAmax: 0, beyondAAover8: 0, vOnlyMoving: 0, vOnlyMovingMax: 0 };
  const good = () => ({ arms: { C: arm(false), V: arm(true), C2: arm(false), C3: arm(false) }, 'pixels E+60': { ...px }, 'pixels E+300': { ...px }, 'pixels E+700': { ...px } });
  ok(score(good()).verdict, 'PASS', 'good run');
  const r1 = good(); r1.arms.V.void = 'served x'; ok(score(r1).verdict, 'VOID', 'void arm');
  const r2 = good(); delete r2.arms.C3; ok(score(r2).verdict, 'VOID', 'missing arm');
  const r3 = good(); r3.arms.V.steps[1][2] = true; ok(score(r3).items.P1.pass, false, 'V live at E+60');
  const r4 = good(); r4.arms.C2.consoleErrors = ['x']; ok(score(r4).verdict, 'FAIL', 'console error');
  const r5 = good(); r5['pixels E+300'].beyondAA = 3; ok(score(r5).items.P2.pass, false, 'pixels beyond A/A');
  const r13 = good(); r13['pixels E+700'].vOnlyMoving = 12; ok(score(r13).items.P2.pass, false, 'motion only in V');
  const r14 = good(); delete r14['pixels E+60'].vOnlyMoving; ok(score(r14).items.P2.pass, false, 'no V-only motion record');
  const r6 = good(); r6.arms.V.bands[BANDS.past].liveFrames = 3; ok(score(r6).items.P3.pass, false, 'V live 3 in past');
  const r7 = good(); r7.arms.V.bands[BANDS.past] = band(70, 1, 0.6, 1.1, 3.0); ok(score(r7).items.P3.pass, false, 'sched not cut');
  const r11 = good(); r11.arms.V.bands[BANDS.past] = band(70, 1, 0.6, 0.2, 3.5); ok(score(r11).items.P3.pass, false, 'V more layouts past the end');
  const r12 = good(); r12.arms.V.bands[BANDS.past] = band(70, 1, 0.6, 0.2, 2.0); ok(score(r12).items.P3.pass, true, 'V fewer layouts is fine');
  const r8 = good(); r8.arms.C2.bands[BANDS.hero] = band(80, 70, 1.1, 1.0, 3.2); r8.arms.V.bands[BANDS.hero] = band(80, 70, 1.15, 1.0, 3.35); ok(score(r8).items.P4.pass, true, 'hero within tol from A/A spread');
  const r9 = good(); r9.arms.V.bands[BANDS.hero] = band(80, 70, 1.0, 1.0, 3.1); ok(score(r9).items.P4.pass, false, 'hero lay outside a zero tol');
  const r10 = good(); r10.arms.C.bands[BANDS.past].frames = 3; ok(score(r10).verdict, 'VOID', 'thin band');
  console.log(`SELFTEST ok (${n} checks)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/hero-park/score-park.mjs <sim-park.json> [--json out.json] | --selftest'); process.exit(a[0] ? 0 : 2); }
  const res = JSON.parse(readFileSync(a[0], 'utf8'));
  const out = score(res);
  out.label = res.label; out.file = a[0];
  for (const [k, i] of Object.entries(out.items || {})) console.log(`${k} ${i.pass ? 'in' : 'out'}${i.misses.length ? ': ' + i.misses.join('; ') : ''}`);
  for (const [b, s] of Object.entries(out.stats || {})) console.log(`  ${b}: ` + Object.entries(s).map(([k, x]) => `${k} C ${x.c.map((v) => v.toFixed(3)).join('/')} tol ${x.tol.toFixed(3)} V ${x.v.toFixed(3)}`).join(' | '));
  if (out.why.length) console.log(`  ${out.why.join('; ')}`);
  console.log(`PART1 ${out.verdict} (label ${res.label})`);
  if (a.includes('--json')) writeFileSync(a[a.indexOf('--json') + 1], JSON.stringify(out, null, 1));
  process.exit({ PASS: 0, FAIL: 1, INSUFFICIENT: 2, VOID: 3 }[out.verdict]);
}
