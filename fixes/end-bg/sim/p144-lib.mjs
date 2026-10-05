// end-bg P-144 (Simulator Timeline paint attribution on the end screen): the FROZEN plan, frame filter, per-frame
// metrics, per-run summary and calls, shared by the driver (sim-p144.mjs), the n and applied-arm check (check-p144.mjs),
// the scorer (score-p144.mjs) and the self-test (p144-selftest.mjs). Pure: no I/O.
//
// Frames (sim.mjs gesture --out, gesture-rec.mjs): the recorded segment with the most frames; a frame is
// [t, dt, y, innerHeight, ...] in page ms; docH = seg.docH1 ?? seg.docH (the recorder's own convention).
// BAND-MOVING frame: innerHeight strictly between the run's min and max (the toolbar is moving) AND y >= docH - 2 ih (the
// last-screen band, P-137's lastScreen definition).
// A Timeline record belongs to a frame when its start lies in (t - dt, t]; Timeline s -> page ms: s * 1000 - tl.offsetMs.
// M1 (primary): paintMs = the summed duration of the Paint records in the frame (WebKit nests them in Composite).
// M2 (pre-registered fallback, see FALLBACK): compMs = the summed duration of the Composite records in the frame.
// Descriptive only: paint record count and painted area (clip quads) per frame.
export const ARMS = ['C', 'C2', 'nob', 'pic', 'tit'];
/** The in-page arm each step label maps to (C2 is C under another label: the A/A pair). */
export const ARM_CSS = { C: null, C2: null, nob: 'nobg.css', pic: 'sim/pictures-off.css', tit: 'sim/titles-off.css' };
// Three holds of 5 steps: each its own C pair and its own nob (positive control in every hold); pic, tit and C2 twice
// each, in two different holds, in rotated positions.
export const PLAN = {
  E1: ['C:H1', 'nob:H1', 'pic:H1', 'tit:H1', 'C:H2'],
  E2: ['C:H3', 'tit:H2', 'nob:H2', 'C2:H1', 'C:H4'],
  E3: ['C:H5', 'C2:H2', 'pic:H2', 'nob:H3', 'C:H6'],
};
// Pre-registered fallback plan (dry-run estimate x 5 + 30 > 500 s): six holds of 4 steps, nob in every hold, pic, tit
// and C2 twice each in two different holds, nob before and after the other arm in turn.
export const PLAN4 = {
  F1: ['C:H1', 'nob:H1', 'pic:H1', 'C:H2'], F2: ['C:H3', 'tit:H1', 'nob:H2', 'C:H4'], F3: ['C:H5', 'nob:H3', 'C2:H1', 'C:H6'],
  F4: ['C:H7', 'pic:H2', 'nob:H4', 'C:H8'], F5: ['C:H9', 'nob:H5', 'tit:H2', 'C:H10'], F6: ['C:H11', 'C2:H2', 'nob:H6', 'C:H12'],
};
export const BUDGET_S = 500, STEP_PAD_S = 10, HOLD_PAD_S = 30;
/** Plan choice from the dry run's mean step (s): 'E' (5-step holds), 'F' (4-step holds) or 'FAIL' (no data). */
export function planFor(dryMeanS) {
  const est = dryMeanS + STEP_PAD_S;
  if (est * 5 + HOLD_PAD_S <= BUDGET_S) return 'E';
  if (est * 4 + HOLD_PAD_S <= BUDGET_S) return 'F';
  return 'FAIL';
}
// Host-load rule (P-141 rev 1.1 style): a step may not start while load1 > HOST_MAX; the driver exits 28 (VOID-HOST).
// 200: the value the lead set for P-141 (just above the highest step-start load1, ~154, at which P-133 produced valid,
// replicating Simulator Timeline data on this host); not derived from any P-144 number (there is none).
export const HOST_MAX = 200;
export const hostWhy = (load1) => (load1 > HOST_MAX ? [`load1 ${load1} > ${HOST_MAX}`] : []);
export const N_MIN = 8, N_TARGET = 12, CYCLE_STROKES = 12;
export const LOC = 0.30, PART = 0.70, DRIFT = 0.30, GEOM_PX = 2;

export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

export function longestSeg(g) {
  return [...(g?.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0] || null;
}
/** The band-moving frames of a gesture record: [{t, dt, y, ih}]. */
export function bandFrames(g) {
  const seg = longestSeg(g);
  if (!seg?.frames?.length) return { frames: [], ih: [null, null], docH: null };
  const ihs = seg.frames.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs);
  const docH = seg.docH1 ?? seg.docH;
  const frames = seg.frames.filter(([, , y, ih]) => ih > lo && ih < hi && y >= docH - 2 * ih).map(([t, dt, y, ih]) => ({ t, dt, y, ih }));
  return { frames, ih: [lo, hi], docH, docH0: seg.docH, docH1: seg.docH1 };
}
const quadArea = (q) => (Array.isArray(q) && q.length === 8 ? Math.abs((q[2] - q[0]) * (q[7] - q[1])) : 0);
/** Flatten Timeline records: [startPageMs, durMs, type, area]. */
export function timelineRecs(tl) {
  const out = [];
  const walk = (r) => {
    if ((r.type === 'Paint' || r.type === 'Composite') && r.endTime != null) out.push([r.startTime * 1000 - tl.offsetMs, (r.endTime - r.startTime) * 1000, r.type, r.type === 'Paint' ? quadArea(r.data?.clip) : 0]);
    (r.children || []).forEach(walk);
  };
  (tl?.recs || []).forEach(walk);
  return out;
}
/** Per-run summary from a gesture record and its Timeline. */
export function summarize(g, tl) {
  const b = bandFrames(g), recs = timelineRecs(tl);
  const per = b.frames.map(({ t, dt }) => {
    const inF = recs.filter((r) => r[0] > t - dt && r[0] <= t);
    const p = inF.filter((r) => r[2] === 'Paint'), c = inF.filter((r) => r[2] === 'Composite');
    return { paintMs: p.reduce((a, r) => a + r[1], 0), paints: p.length, area: p.reduce((a, r) => a + r[3], 0), compMs: c.reduce((a, r) => a + r[1], 0) };
  });
  const n = per.length;
  return {
    n, counted: n >= N_MIN, ih: b.ih, docH: [b.docH0 ?? null, b.docH1 ?? null],
    m1: r3(median(per.map((x) => x.paintMs))), m2: r3(median(per.map((x) => x.compMs))),
    paintFrames: per.filter((x) => x.paints > 0).length, compFrames: per.filter((x) => x.compMs > 0).length,
    medPaints: median(per.map((x) => x.paints)), medAreaK: r3((median(per.map((x) => x.area)) ?? 0) / 1000),
  };
}
export const callOf = (ratio) => (ratio == null ? 'INSUFFICIENT' : ratio <= LOC ? 'LOCATES' : ratio <= PART ? 'PARTIAL' : 'NONE');
/** Score one hold. runs: [{name, arm, applied (bool), ...summarize()}] in hold order; metric 'm1' | 'm2'. */
export function scoreHold(runs, metric = 'm1') {
  const C = runs.filter((r) => r.arm === 'C');
  const frames = metric === 'm1' ? 'paintFrames' : 'compFrames';
  const okC = (r) => r.applied && r.counted && r[metric] > 0 && r[frames] >= 0.5 * r.n;
  const replica = C.length > 0 && C.every(okC);
  const drift = C.length >= 2 && C[0][metric] ? r3(Math.abs(C[C.length - 1][metric] - C[0][metric]) / C[0][metric]) : null;
  const verdicts = {};
  runs.forEach((r, i) => {
    if (r.arm === 'C') return;
    const nb = [];
    for (let j = i - 1; j >= 0; j--) if (runs[j].arm === 'C') { nb.push(runs[j]); break; }
    for (let j = i + 1; j < runs.length; j++) if (runs[j].arm === 'C') { nb.push(runs[j]); break; }
    const cs = nb.filter(okC), cMean = cs.length ? cs.reduce((a, c) => a + c[metric], 0) / cs.length : null;
    const ratio = r.applied && r.counted && cMean ? r3(r[metric] / cMean) : null;
    const geom = nb.some((c) => Math.abs((c.docH[1] ?? c.docH[0]) - (r.docH[1] ?? r.docH[0])) > GEOM_PX);
    const call = !replica ? 'NO-REPLICA' : geom ? 'GEOMETRY' : !r.applied ? 'INSUFFICIENT' : callOf(ratio);
    verdicts[r.name] = { arm: r.arm, ratio, cMean: r3(cMean), neighbours: nb.map((c) => c.name), call };
  });
  const nob = Object.values(verdicts).find((v) => v.arm === 'nob');
  const control = nob ? (nob.call === 'LOCATES' || nob.call === 'PARTIAL') : false;
  const voidHold = drift != null && drift > DRIFT;
  return { metric, replica, drift, void: voidHold, control, verdicts };
}
/** Combine an arm's runs across holds (each already scored against its own hold's C runs). */
export function armCall(vs) {
  const rs = vs.filter((v) => v && v.ratio != null && (v.call === 'LOCATES' || v.call === 'PARTIAL' || v.call === 'NONE'));
  if (!rs.length) return { call: 'INSUFFICIENT', runs: 0, mean: null };
  const mean = r3(rs.reduce((a, v) => a + v.ratio, 0) / rs.length);
  if (rs.length === 1) return { call: rs[0].call, runs: 1, mean };
  const call = rs.every((v) => v.call === 'LOCATES') || mean <= LOC ? 'LOCATES' : mean <= PART ? 'PARTIAL' : 'NONE';
  return { call, runs: rs.length, mean };
}
/** The card-level reading from the scored holds: {status, reading, arms}. */
export function cardReading(holds) {
  if (!holds.length || holds.some((h) => !h.replica)) return { status: 'NOT REPRODUCED', reading: null, arms: {} };
  const usable = holds.filter((h) => h.control && !h.void);
  const pick = (arm) => armCall(usable.flatMap((h) => Object.values(h.verdicts).filter((v) => v.arm === arm)));
  const arms = { C2: pick('C2'), pic: pick('pic'), tit: pick('tit'), nob: armCall(holds.flatMap((h) => Object.values(h.verdicts).filter((v) => v.arm === 'nob'))) };
  if (!usable.length) return { status: 'CONTROL-FAILED', reading: null, arms };
  const c2runs = usable.flatMap((h) => Object.values(h.verdicts).filter((v) => v.arm === 'C2'));
  if (c2runs.some((v) => v.call === 'LOCATES' || v.call === 'PARTIAL')) return { status: 'AA-FAILED', reading: null, arms };
  const real = (c) => c === 'LOCATES' || c === 'PARTIAL';
  const p = arms.pic.call, t = arms.tit.call;
  let reading;
  if (p === 'INSUFFICIENT' || t === 'INSUFFICIENT') reading = 'INSUFFICIENT';
  else if (real(p) && !real(t)) reading = 'PICTURES';
  else if (real(t) && !real(p)) reading = 'TITLES';
  else if (real(t) && real(p)) reading = 'BOTH';
  else reading = 'JOINT';
  return { status: 'READ', reading, arms };
}
/** Pre-registered metric switch: M2 replaces M1 for the whole card only when M1's control fails in every hold that
 *  replicates on M1 and M2's control passes in every hold. */
export function chooseMetric(h1, h2) {
  const m1Fails = h1.length && h1.every((h) => !h.control);
  const m2Passes = h2.length && h2.every((h) => h.replica && h.control);
  return m1Fails && m2Passes ? 'm2' : 'm1';
}
