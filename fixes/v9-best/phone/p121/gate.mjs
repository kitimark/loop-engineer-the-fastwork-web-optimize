// P-121 path-matched G driver: the per-run path gates (pure; DRAFT until the pre-data read). Written AFTER H3a2's G
// records were seen (fixes/v9-best/README.md "P-121"). Input: an iphone.mjs gesture record (run.segments[]: frames
// [t, dt, y, ...], touches [t, s|m|e, ..., clientY at 6], marks [t, name], docH / docH1 / vh0; run.untils).
// A run that fails its gate is VOID ("path not covered" / "out stroke ..."), never scored; every result carries the
// part window length, moving frames, max y and the per-stroke report next to the gate.
//   gateM(j)            part M (flick-middle-v2): >= 5 traversals of [2200, 3800] and max y < 5000 in the window
//   gateE(j, speed)     part E (flick-end-v2, variant fast | slow), per out-fling (marks out1, out2):
//                       fast: the out stroke meets the release rule (Fv <= -fv OR finger travel >= travel) and the
//                             fling leaves the end: min y until the next mark <= maxScroll - leave (1600)
//                       slow: the out stroke meets neither condition (with margins), so the rule would catch it
//   strokes(seg)        rev 7c/7d's __msFv replayed (JS 14290-14300: EMA of (prevClientY - clientY) / dt, reset by a
//                       move > 50 ms after the last), finger travel since touchstart, flick at lift-off
export const BAND = [2200, 3800], MIN_TRAV_M = 5, MAX_Y_M = 5000, LEAVE_E = 1600;
// rev 7d's release rule for a close at lift-off; registered values come from rev 7d's final rule (P-122)
export const RULE = { fv: 5, travel: 300, fvMargin: 0.5, travelMargin: 20 };
const START = { M: 'mid1', E: 'into1' };

export function strokes(seg) {
  const out = []; let Fy = 0, Ft = 0, Fv = 0, Fn = 0, y0 = 0, ts = 0;
  for (const [t, ty, , , , , cy] of seg.touches || []) {
    if (ty === 's') { Fn = 0; Fv = 0; Fy = cy; Ft = t; y0 = cy; ts = t; }
    else if (ty === 'm') {
      if (t > Ft) { if (t - Ft > 50) { Fv = 0; Fn = 0; } else { Fv = (Fn ? 0.5 * Fv : 0) + ((Fn ? 0.5 : 1) * (Fy - cy)) / Math.max(1, t - Ft); Fn++; } Fy = cy; Ft = t; }
    } else out.push({ t: ts, end: t, dir: Fy < y0 ? 'up' : 'down', fv: +Fv.toFixed(2), travel: Math.round(Math.abs(Fy - y0)), flick: !!(Fn && t - Ft < 50 && Math.abs(Fv) >= 0.3) });
  }
  return out;
}
export function traversals(ys, [lo, hi] = BAND) {
  let side = null, n = 0;
  for (const y of ys) { const s = y < lo ? 'lo' : y > hi ? 'hi' : null; if (s && side && s !== side) n++; if (s) side = s; }
  return n;
}
function base(j, part) {
  const seg = (j?.run?.segments || []).find((s) => (s.marks || []).some((m) => m[1] === START[part]));
  if (!seg) return { err: `no ${START[part]} mark` };
  const mk = Object.fromEntries(seg.marks.map((x) => [x[1], x[0]]));
  const t0 = mk[START[part]], t1 = mk.end ?? Infinity;
  const fr = (seg.frames || []).filter((x) => x[0] >= t0 && x[0] <= t1);
  let moving = 0; for (let i = 1; i < fr.length; i++) if (fr[i][1] != null && fr[i][2] !== fr[i - 1][2]) moving++;
  const ys = fr.map((x) => x[2]);
  return {
    seg, mk, fr, ys, t0, t1,
    report: {
      windowS: +((Math.min(t1, fr.at(-1)?.[0] ?? t0) - t0) / 1000).toFixed(1), moving, maxY: ys.length ? Math.max(...ys) : null,
      maxScroll: Math.max(seg.docH ?? 0, seg.docH1 ?? 0) - (seg.vh0 ?? 0),
      settles: (j.run.untils || []).filter((u) => u.cond === 'settled').map((u) => u.y),
      strokes: strokes(seg).filter((s) => s.flick && s.t >= t0 && s.t <= t1).map(({ dir, fv, travel }) => ({ dir, fv, travel })),
    },
  };
}
const result = (why, report, extra = {}) => ({ ok: !why.length, why, ...extra, ...report });

export function gateM(j, { band = BAND, min = MIN_TRAV_M, maxY = MAX_Y_M } = {}) {
  const b = base(j, 'M'); if (b.err) return { ok: false, why: [b.err] };
  const n = traversals(b.ys, band), why = [];
  if (n < min) why.push(`path not covered: ${n} traversals of [${band}] < ${min}`);
  if (b.report.maxY >= maxY) why.push(`path not covered: max y ${b.report.maxY} >= ${maxY} (an end reached)`);
  return result(why, b.report, { traversals: n });
}

export function gateE(j, speed, { rule = RULE, leave = LEAVE_E } = {}) {
  if (speed !== 'fast' && speed !== 'slow') throw new Error(`gateE: speed fast|slow, got ${speed}`);
  const b = base(j, 'E'); if (b.err) return { ok: false, why: [b.err] };
  const all = strokes(b.seg), why = [], outs = [], marks = b.seg.marks.map((x) => [x[1], x[0]]);
  for (const name of ['out1', 'out2']) {
    const i = marks.findIndex((m) => m[0] === name);
    if (i < 0) { why.push(`no ${name} mark`); continue; }
    const tm = marks[i][1], tn = marks[i + 1]?.[1] ?? b.t1;
    const s = all.find((x) => x.t >= tm && x.t < tn);
    if (!s) { why.push(`${name}: no out stroke`); continue; }
    const byFv = s.fv <= -rule.fv, byTravel = s.travel >= rule.travel;
    const near = Math.abs(s.fv + rule.fv) <= rule.fvMargin || Math.abs(s.travel - rule.travel) <= rule.travelMargin;
    const ys = b.fr.filter((f) => f[0] >= tm && f[0] <= tn).map((f) => f[2]), minY = ys.length ? Math.min(...ys) : null;
    const o = { name, fv: s.fv, travel: s.travel, released: byFv || byTravel, by: [byFv && 'fv', byTravel && 'travel'].filter(Boolean), near, minY, fromEnd: minY === null ? null : b.report.maxScroll - minY };
    outs.push(o);
    if (speed === 'fast') {
      if (!o.released) why.push(`${name}: out stroke not released by the rule (Fv ${s.fv}, travel ${s.travel})`);
      if (o.fromEnd === null || o.fromEnd < leave) why.push(`${name}: path not covered: the fling left the end by ${o.fromEnd} < ${leave} px`);
    } else if (s.fv <= -(rule.fv - rule.fvMargin) || s.travel >= rule.travel - rule.travelMargin) {
      why.push(`${name}: out stroke too fast for the slow item (Fv ${s.fv}, travel ${s.travel})`);
    }
  }
  return result(why, b.report, { outs });
}
