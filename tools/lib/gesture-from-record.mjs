// A human finger record -> a gesture script for the robot finger, and how close a replay came (incident I-218, article
// clips T-211, research/article-clips/README.md §1). Pure: no I/O, no phone. CLI: tools/gesture-from-record.mjs.
//
// Input: an `iphone.mjs record --touches` record: frames [t, dt, scrollY, innerHeight] and touches in TOUCH_FIELDS
// order (lib/iphone-record.mjs; gesture-rec.mjs's touch rows plus clientX). A gesture run (`iphone.mjs gesture`, its
// run.segments[i].frames / touches) reads the same way, for the comparison.
//
// fromRecord(record) -> {script, strokes, dropped, notes, expected}:
// - contacts: touchstart .. touchend of one finger (a second finger marks the contact multi: dropped);
// - pieces: a contact is cut where the finger turns back (>= 10 px past its extreme): the robot lifts and presses again;
// - chunks: a piece longer than 560 px (the gesture guard, LIMITS.px) or 5 s is cut into equal-distance parts at the
//   finger's own times (the robot lifts between them: a pause the human did not make);
// - per chunk one stroke: the finger's lift-off speed over the last LIFT_WINDOW_MS >= FLING_MIN_PX_S -> profile fling,
//   ms = 1875 * px / speed so the robot lifts off at the finger's speed (its momentum matches), started so that it lifts
//   when the finger did; otherwise drag (ms >= 600) or minjerk, over the finger's own time, and a still finger before
//   the lift (>= 100 ms within 3 px) becomes holdMs. press 40 ms (the gesture default) comes off the finger's time;
//   chunks under 40 px (taps, jitter) are dropped and listed;
// - pull-to-refresh guard (gesture.mjs): a finger-down stroke needs scrollY >= max(300, px): one that started below 300
//   on the user's page is dropped, one longer than its scrollY is trimmed to it, and an `until y>=N` goes before any
//   down stroke the compiler's static model cannot prove safe (the runner waits there; it fails if the replay is off);
// - pauses keep the finger's timeline (stroke k starts at its planned time on the user's clock), minus --overhead-ms
//   per pause for the robot's own per-stroke start latency (WDA, 0.5-1.4 s on the Simulator, v8 kit; default 0); a
//   trailing pause covers the last momentum, so the recorder sees it.
// The script carries `source` (record, window, startScrollY, the strokes on the user's clock): ignored by the gesture
// compiler (not in the program hash), read by the comparison.
//
// Expected fidelity (the scroll curve the script should produce): a simple model, run on the script's strokes and on
// the user's own finger: scroll follows the finger past SLOP_PX (gesture.mjs's pan hysteresis), a lift at speed v
// coasts v*tau*(1-e^(-t/tau)) (tau: the median of the user's own flings, momentumTau; else 0.43 s, finger-simulation
// §4.1), a touch stops it, clamped to [0, the record's max scrollY]. It ignores the robot's start latency and the
// runner's wait for a still page before a down stroke. `floor` = the user's own finger through the same model: the
// model's own error; `score` - `floor` is roughly what the conversion loses. MODEL, not a measurement.
//
// compare(user, replay): the replay's scrollY(t) against the user's. Alignment: `strokes` (default when the touch
// sequences pair up: the script's strokes, else the user's contacts, with the replay's) gives each stretch from one
// touchstart to the next the offset of its own touchstart (the robot's latency sits before a stroke, the stroke itself
// plays in real time); `start` aligns the first touches only. Scored at the user's frames: max, mean, p95 |dy|, the
// start and end difference, the peak, per stroke the time and position of its touchstart in both, and the first time each
// curve reaches the --cross positions (raw times from each run's first touch: what a viewer sees).
import { profilePos, profileVel, LIMITS, SLOP_PX, PULL_GUARD_Y, DEFAULTS, SCREEN, compileScript } from './gesture.mjs';
import { touchTime, momentumTau } from './gesture-rec.mjs';

export const FLING_MIN_PX_S = 200, LIFT_WINDOW_MS = 30, REVERSE_PX = 10, HOLD_STILL_PX = 3, HOLD_MIN_MS = 100, DRAG_MIN_MS = 600;
export const TAU_S = 0.43, UNTIL_TIMEOUT_MS = 5000, TAIL_MS = [1000, 10000], GRID_MS = 10;
const PRESS_MS = DEFAULTS.pressMs;
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- curves -------------------------------------------------------------------------------------------------------
/** [[t, y]] sorted by t -> y at t (linear between samples, held outside). */
export function yAt(curve, t) {
  if (!curve.length) return null;
  if (t <= curve[0][0]) return curve[0][1];
  if (t >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  let lo = 0, hi = curve.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (curve[m][0] <= t) lo = m; else hi = m; }
  const [ta, ya] = curve[lo], [tb, yb] = curve[hi];
  return tb > ta ? ya + ((yb - ya) * (t - ta)) / (tb - ta) : yb;
}

/** A record (frames at the top) or a gesture run (run.segments) -> {kind, frames, touches, curve [[t, y]]}. */
export function curveOf(doc, { seg = null } = {}) {
  let kind, s;
  if (doc && Array.isArray(doc.frames)) { kind = 'record'; s = doc; }
  else if (doc && doc.run && Array.isArray(doc.run.segments)) {
    kind = 'gesture';
    const segs = doc.run.segments;
    if (!segs.length) throw new Error('the gesture run recorded no segment');
    if (seg === null && segs.length > 1) throw new Error(`the gesture run has ${segs.length} segments (a reload): pick one with --seg <i>`);
    s = segs[seg ?? 0];
    if (!s) throw new Error(`the gesture run has no segment ${seg}`);
  } else throw new Error('not an iphone.mjs record or gesture run (no frames)');
  if (!Array.isArray(s.frames) || !s.frames.length) throw new Error(`no frame log in this ${kind}${doc.meta?.countOnly ? ' (a count-only run keeps counts only)' : ''}`);
  const curve = s.frames.map((f) => [f[0], f[2]]).sort((a, b) => a[0] - b[0]);
  return { kind, frames: s.frames, touches: Array.isArray(s.touches) ? s.touches : null, curve, partial: !!doc.partial };
}

// ---- touches -> contacts -> pieces --------------------------------------------------------------------------------
/** Touch rows -> contacts {start, end, pts [[t, clientY, clientX]], startScrollY, endScrollY, multi, cancelled, open}. */
export function contactsOf(touches = []) {
  const out = [];
  let cur = null;
  const close = (c, t, open) => { c.end = t; if (open) c.open = true; };
  for (const e of touches || []) {
    const k = e[1], t = touchTime(e), y = e[6], x = e[8] ?? null;
    const pt = y === null || y === undefined ? null : [t, y, x];
    if (k === 's') {
      if (cur && e[2] > 1) { cur.multi = true; continue; } // a second finger
      if (cur) close(cur, cur.pts.length ? cur.pts[cur.pts.length - 1][0] : cur.start, true); // its end was never seen
      cur = { start: t, end: null, startScrollY: e[5], endScrollY: null, multi: e[2] > 1, cancelled: false, pts: pt ? [pt] : [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (e[2] > 1) cur.multi = true;
    if (k === 'm') { if (pt) cur.pts.push(pt); }
    else if ((k === 'e' || k === 'c') && e[2] === 0) {
      if (pt) cur.pts.push(pt);
      cur.endScrollY = e[5]; cur.cancelled = k === 'c';
      close(cur, t, false);
      cur = null;
    }
  }
  if (cur) close(cur, cur.pts.length ? cur.pts[cur.pts.length - 1][0] : cur.start, true);
  for (const c of out) { let m = -Infinity; for (const p of c.pts) { if (p[0] < m) p[0] = m; m = p[0]; } } // monotone
  return out;
}

/** Cut a finger path [[t, y, ...]] where it turns back by >= hyst px from its extreme; pieces share the turning point. */
export function splitReversals(pts, hyst = REVERSE_PX) {
  if (pts.length < 2) return [pts];
  const out = [];
  let from = 0, dir = 0, ext = 0;
  for (let i = 1; i < pts.length; i++) {
    const y = pts[i][1];
    if (dir === 0) { const d = y - pts[from][1]; if (Math.abs(d) >= hyst) { dir = Math.sign(d); ext = i; } continue; }
    const d = (y - pts[ext][1]) * dir;
    if (d >= 0) { if (d > 0) ext = i; continue; }
    if (-d >= hyst) { out.push(pts.slice(from, ext + 1)); from = ext; dir = -dir; ext = i; }
  }
  out.push(pts.slice(from));
  return out;
}

const fingerAt = (pts, t) => yAt(pts.map((p) => [p[0], p[1]]), t);

/** The finger's speed (px/s, >= 0) over the last `win` ms before t1. */
function liftSpeed(pts, t1, win = LIFT_WINDOW_MS) {
  const a = fingerAt(pts, t1 - win), b = fingerAt(pts, t1);
  return a === null || b === null ? 0 : Math.round((Math.abs(b - a) * 1000) / win);
}
/** ms the finger rested (within HOLD_STILL_PX of its last position) before the lift at t1; 0 under HOLD_MIN_MS. */
function holdBefore(pts, t1) {
  if (!pts.length) return 0;
  const yEnd = pts[pts.length - 1][1];
  let j = pts.length - 1;
  while (j > 0 && Math.abs(pts[j - 1][1] - yEnd) <= HOLD_STILL_PX) j--;
  const ms = t1 - pts[j][0];
  return ms >= HOLD_MIN_MS ? Math.round(ms) : 0;
}

// ---- record -> script ---------------------------------------------------------------------------------------------
/** Median tau (s) of the user's own fling lifts (momentumTau over the record's frames), or null. */
export function userTau(frames, contacts) {
  const seg = { frames, docH: Number.MAX_SAFE_INTEGER }; // no page height in a record: never "at the end"
  const taus = [];
  contacts.forEach((c, i) => {
    if (c.multi || liftSpeed(c.pts, c.end) < FLING_MIN_PX_S) return;
    const m = momentumTau(seg, c.end, { tNext: contacts[i + 1] ? contacts[i + 1].start : Infinity });
    if (m.tauS) taus.push(m.tauS);
  });
  if (!taus.length) return null;
  taus.sort((a, b) => a - b);
  return taus[Math.floor((taus.length - 1) / 2)];
}

const sanitizeName = (s) => String(s || 'finger').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'finger';

/**
 * A record -> {script, strokes, dropped, notes, expected}. opts: name, fromS/toS (seconds from the record's first
 * frame: contacts that START in the window), overheadMs (taken off every pause), flingMin (px/s), recordName.
 */
export function fromRecord(rec, { name, fromS = null, toS = null, overheadMs = 0, flingMin = FLING_MIN_PX_S, recordName = null } = {}) {
  const { curve, touches, frames, partial } = curveOf(rec);
  if (!touches) throw new Error('the record has no touches: record the finger with `iphone.mjs record --touches` (I-218)');
  const notes = [], dropped = [];
  if (partial) notes.push('the record is partial (PARTIAL, I-141): only the frames and touches up to its last poll');
  const tFirst = curve[0][0];
  const wFrom = fromS === null ? -Infinity : tFirst + fromS * 1000, wTo = toS === null ? Infinity : tFirst + toS * 1000;
  const all = contactsOf(touches);
  const contacts = all.filter((c) => c.start >= wFrom && c.start <= wTo);
  if (!contacts.length) throw new Error(`no finger contact${fromS !== null || toS !== null ? ` starts in the window ${fromS ?? 0}-${toS ?? 'end'} s` : ' in the record'} (${all.length} in the record)`);
  const yUser = (t) => yAt(curve, t);
  const yMax = Math.max(...curve.map((p) => p[1]));

  // contacts -> chunks on the user's clock
  const chunks = [];
  for (const c of contacts) {
    if (c.multi) { dropped.push({ atMs: c.start, why: 'multi: a second finger touched (pinch or a slip): not replayable with one finger', px: null }); continue; }
    if (c.open) notes.push(`a contact at ${Math.round(c.start - tFirst)} ms has no touchend in the record (it ends at its last touch)`);
    if (c.pts.length < 2) { dropped.push({ atMs: c.start, why: 'short: no finger movement logged', px: 0 }); continue; }
    const pieces = splitReversals(c.pts);
    pieces.forEach((pts, pi) => {
      const ta = pi === 0 ? c.start : pts[0][0];
      const tb = pi === pieces.length - 1 ? c.end : pts[pts.length - 1][0];
      const last = pi === pieces.length - 1;
      const y0 = pts[0][1], travel = pts[pts.length - 1][1] - y0, px = Math.abs(travel);
      const k = Math.max(1, Math.ceil(px / LIMITS.px[1]), Math.ceil((tb - ta) / LIMITS.ms[1]));
      const cuts = [ta];
      for (let j = 1; j < k; j++) {
        const target = (j * px) / k;
        let i = pts.findIndex((p) => Math.abs(p[1] - y0) >= target);
        if (i <= 0) i = 1;
        const [t1, v1] = pts[i - 1], [t2, v2] = pts[i];
        const d1 = Math.abs(v1 - y0), d2 = Math.abs(v2 - y0);
        cuts.push(d2 > d1 ? t1 + ((t2 - t1) * (target - d1)) / (d2 - d1) : t2);
      }
      cuts.push(tb);
      for (let j = 0; j < k; j++) {
        const a = cuts[j], b = cuts[j + 1], lastChunk = last && j === k - 1;
        const fa = fingerAt(pts, a), fb = fingerAt(pts, b);
        chunks.push({
          contactStart: c.start, ta: a, tb: b, dir: fb - fa < 0 ? 'up' : 'down', px: Math.abs(fb - fa),
          lift: lastChunk ? (holdBefore(pts, c.end) ? 0 : liftSpeed(pts, c.end)) : 0, hold: lastChunk ? holdBefore(pts, c.end) : 0,
          split: k > 1 ? `${j + 1}/${k}` : null, reversal: pieces.length > 1 ? `${pi + 1}/${pieces.length}` : null,
        });
      }
    });
  }

  // chunks -> strokes, with the pull guard and the planned starts (user clock, relative to the first contact)
  const T0 = contacts[0].start;
  const strokes = [];
  for (const ch of chunks) {
    let px = Math.round(ch.px);
    const at = Math.round(ch.ta - T0);
    if (px < LIMITS.px[0]) { dropped.push({ atMs: at, why: `short: ${px} px of finger travel (< ${LIMITS.px[0]}, a tap or a catch); a catch that stopped a coast is lost`, px }); continue; }
    const userStartY = Math.round(yUser(ch.ta));
    const userPx = px;
    if (ch.dir === 'down') {
      if (userStartY < PULL_GUARD_Y) { dropped.push({ atMs: at, why: `pull-guard: a finger-down stroke at scrollY ${userStartY} (< ${PULL_GUARD_Y}) would pull to refresh`, px }); continue; }
      if (px > userStartY) { notes.push(`stroke at ${at} ms: down ${px} px trimmed to ${userStartY} px (its scrollY; pull-to-refresh guard)`); px = userStartY; }
    }
    const userMs = ch.tb - ch.ta;
    let profile, ms, hold = ch.hold;
    if (ch.lift >= flingMin) {
      profile = 'fling'; hold = 0;
      ms = Math.round((1875 * px) / ch.lift);
      ms = clamp(ms, Math.max(LIMITS.ms[0], Math.ceil((1875 * px) / LIMITS.liftoffPxPerS)), LIMITS.ms[1]);
    } else {
      hold = Math.min(hold, LIMITS.holdMs[1]);
      ms = clamp(Math.round(userMs - PRESS_MS - hold), LIMITS.ms[0], LIMITS.ms[1]);
      hold = Math.max(0, Math.min(hold, LIMITS.contactMs - PRESS_MS - ms));
      profile = ms >= DRAG_MIN_MS ? 'drag' : 'minjerk';
    }
    const contact = PRESS_MS + ms + hold;
    // a fling lifts when the finger lifted (its momentum then starts on time); anything else starts when the finger did
    const planned = profile === 'fling' ? Math.round(ch.tb - T0 - contact) : at;
    strokes.push({ dir: ch.dir, px, ms, profile, holdMs: hold, contactMs: contact, plannedStartMs: planned, touchMs: at, userStartY, userPx, userMs: Math.round(userMs), userLiftPxPerS: ch.lift, split: ch.split, reversal: ch.reversal });
  }
  if (!strokes.length) throw new Error(`no replayable stroke: ${dropped.length} contact(s) dropped (${dropped.map((d) => d.why.split(':')[0]).join(', ')})`);

  // timeline: the script starts at the earliest planned start; strokes never overlap (a later one waits)
  const S0 = Math.min(...strokes.map((s) => s.plannedStartMs));
  const steps = [];
  let lo = 0, prevEnd = null;
  strokes.forEach((s, i) => {
    s.id = `s${i + 1}`;
    const start = prevEnd === null ? s.plannedStartMs : Math.max(s.plannedStartMs, prevEnd);
    if (prevEnd !== null) {
      const p = Math.round(start - prevEnd) - overheadMs;
      if (p >= 1) steps.push({ type: 'pause', ms: p });
    }
    s.scriptStartMs = start;
    s.lateMs = Math.round(start - s.plannedStartMs);
    if (s.lateMs > 100) notes.push(`${s.id} starts ${s.lateMs} ms after its planned time: the stroke before it is longer than the finger's (a fling at the finger's lift-off speed needs 1.875 x px / speed)`);
    if (s.dir === 'down') {
      const need = Math.max(PULL_GUARD_Y, s.px);
      if (lo < need) { steps.push({ type: 'until', cond: `y>=${need}`, timeoutMs: UNTIL_TIMEOUT_MS }); lo = need; s.until = need; }
    }
    steps.push({ type: 'stroke', dir: s.dir, px: s.px, ms: s.ms, profile: s.profile, ...(s.holdMs ? { holdMs: s.holdMs } : {}) });
    // gesture.mjs's static model (modelStroke): what the compiler will assume
    if (s.dir === 'up') lo = Math.min(lo + Math.max(0, s.px - SLOP_PX), DEFAULTS.endY);
    else lo = s.profile === 'fling' ? 0 : Math.max(0, lo - s.px);
    prevEnd = start + s.contactMs;
  });
  // the last coast: until the user's page rested (no 1 px change for 300 ms) after the last contact, within the window
  const lastEnd = Math.max(...contacts.map((c) => c.end));
  const after = curve.filter((p) => p[0] >= lastEnd && p[0] <= wTo);
  let settle = lastEnd;
  for (let i = 1; i < after.length; i++) if (Math.abs(after[i][1] - after[i - 1][1]) >= 1) settle = after[i][0];
  const tail = clamp(Math.round(settle - lastEnd + 300), TAIL_MS[0], TAIL_MS[1]);
  steps.push({ type: 'pause', ms: tail });

  const startScrollY = Math.round(yUser(T0 + S0));
  if (startScrollY > 0) notes.push(`the user's page was at scrollY ${startScrollY} when this gesture starts: position the page at scrollY ${startScrollY} before the replay (a script has no scrollTo)`);
  const script = {
    name: sanitizeName(name), version: 1, screen: [...SCREEN],
    source: {
      tool: 'gesture-from-record', incident: 'I-218', record: recordName, window: { fromS, toS }, firstTouchT: T0, scriptT0Ms: S0, startScrollY, overheadMs,
      strokes: strokes.map((s) => ({ id: s.id, userMs: s.scriptStartMs, touchMs: s.touchMs, userStartY: s.userStartY, userPx: s.userPx, userContactMs: s.userMs, userLiftPxPerS: s.userLiftPxPerS, ...(s.split ? { split: s.split } : {}), ...(s.reversal ? { reversal: s.reversal } : {}), ...(s.px !== s.userPx ? { trimmed: true } : {}) })),
      dropped,
    },
    steps,
  };
  compileScript(script); // throws (ScriptError) if the gesture compiler would refuse it: never hand out a script it rejects

  // expected fidelity: the model on the script's strokes, and on the user's own finger (the floor)
  const tau = userTau(frames, all) ?? TAU_S;
  const tEnd = Math.min(curve[curve.length - 1][0], T0 + Math.max(...strokes.map((s) => s.scriptStartMs + s.contactMs)) + tail);
  const y0 = yUser(T0 + S0);
  const scriptContacts = strokes.map((s) => {
    const sign = s.dir === 'up' ? 1 : -1; // finger up: scrollY grows
    return {
      start: T0 + s.scriptStartMs, end: T0 + s.scriptStartMs + s.contactMs,
      disp: (u) => (u <= PRESS_MS ? 0 : sign * s.px * profilePos(s.profile, (u - PRESS_MS) / s.ms, s.ms)),
      liftV: s.profile === 'fling' && !s.holdMs ? (sign * s.px * profileVel('fling', 1, s.ms)) / s.ms : 0,
    };
  });
  const fingerContacts = contacts.filter((c) => !c.multi && c.pts.length > 1).map((c) => {
    const f0 = c.pts[0][1], v = holdBefore(c.pts, c.end) ? 0 : liftSpeed(c.pts, c.end) / 1000;
    const lastDir = Math.sign(fingerAt(c.pts, c.end - LIFT_WINDOW_MS) - fingerAt(c.pts, c.end)); // finger moving up -> +
    return { start: c.start, end: c.end, disp: (u) => f0 - fingerAt(c.pts, c.start + u), liftV: v >= flingMin / 1000 ? lastDir * v : 0 };
  });
  const model = (cs) => modelCurve(cs, { t0: T0 + S0, t1: tEnd, y0, yMax, tauS: tau });
  const exp = model(scriptContacts), floor = model(fingerContacts);
  const userCurve = curve.filter((p) => p[0] >= T0 + S0 && p[0] <= tEnd);
  const expected = {
    tauS: tau, tauFrom: userTau(frames, all) ? 'the user\'s flings (median)' : `default ${TAU_S} s`,
    curve: exp.map(([t, y]) => [Math.round(t - T0), y]).filter((_, i) => i % 10 === 0), // every 100 ms, ms from the first touch
    score: scoreCurves(userCurve, exp), floor: scoreCurves(userCurve, floor),
  };
  return { script, strokes, dropped, notes, expected };
}

// ---- the model ----------------------------------------------------------------------------------------------------
/**
 * Scroll position over [t0, t1] every GRID_MS from contacts {start, end, disp(u) -> finger displacement (px, + = scrollY
 * grows) u ms after the touch, liftV px/ms}: scroll = position at the touch + the displacement past SLOP_PX; after a
 * lift it coasts liftV * tau * (1 - e^(-t/tau)); a touch stops the coast; clamped to [0, yMax].
 */
export function modelCurve(contacts, { t0, t1, y0 = 0, yMax = Infinity, tauS = TAU_S, gridMs = GRID_MS }) {
  const cs = [...contacts].sort((a, b) => a.start - b.start);
  const out = [];
  let y = y0, v = 0, active = null, base = y0, k = 0;
  const slop = (d) => Math.sign(d) * Math.max(0, Math.abs(d) - SLOP_PX);
  for (let t = t0; t <= t1 + 1e-9; t += gridMs) {
    if (!active && k < cs.length && t >= cs[k].start) { active = cs[k++]; base = y; v = 0; }
    if (active) {
      const u = Math.min(t, active.end) - active.start;
      y = clamp(base + slop(active.disp(u)), 0, yMax);
      if (t >= active.end) { v = active.liftV; active = null; }
    } else if (v) {
      y += v * gridMs;
      v *= Math.exp(-gridMs / (tauS * 1000));
      if (y <= 0 || y >= yMax) { y = clamp(y, 0, yMax); v = 0; }
      if (Math.abs(v) < 0.005) v = 0;
    }
    out.push([t, Math.round(y)]);
  }
  return out;
}

// ---- scoring ------------------------------------------------------------------------------------------------------
/** |dy| of `test` against `ref` at ref's samples (t -> map(t) on test's clock, within test's span). */
export function scoreCurves(ref, test, { map = (t) => t } = {}) {
  if (!ref.length || !test.length) return { n: 0, maxAbsDy: null, atMs: null, meanAbsDy: null, p95AbsDy: null, startDy: null, endDy: null };
  const tLo = test[0][0], tHi = test[test.length - 1][0];
  const ds = [];
  let max = -1, at = null;
  for (const [t, y] of ref) {
    const m = map(t);
    if (m < tLo || m > tHi) continue;
    const d = yAt(test, m) - y;
    ds.push([t, d]);
    if (Math.abs(d) > max) { max = Math.abs(d); at = t; }
  }
  if (!ds.length) return { n: 0, maxAbsDy: null, atMs: null, meanAbsDy: null, p95AbsDy: null, startDy: null, endDy: null };
  const abs = ds.map((d) => Math.abs(d[1])).sort((a, b) => a - b);
  return {
    n: ds.length, maxAbsDy: Math.round(max), atMs: Math.round(at - ref[0][0]), meanAbsDy: r1(abs.reduce((s, x) => s + x, 0) / abs.length),
    p95AbsDy: Math.round(abs[Math.min(abs.length - 1, Math.ceil(0.95 * abs.length) - 1)]), startDy: Math.round(ds[0][1]), endDy: Math.round(ds[ds.length - 1][1]),
  };
}

/** The first time (t) at or after `from` that the curve reaches y (from below or from above), or null. */
function reach(curve, y, from) {
  const pts = curve.filter((p) => p[0] >= from);
  if (!pts.length) return null;
  const side = Math.sign(pts[0][1] - y);
  if (side === 0) return pts[0][0];
  for (const p of pts) if (Math.sign(p[1] - y) !== side) return p[0];
  return null;
}

/**
 * Score a replay (gesture run or record) against the user's record. opts: script (the converter's output, for its
 * strokes on the user's clock), align auto|strokes|start, cross [y...], maxDy (verdict OK / MISS), seg (replay segment).
 */
export function compare(userDoc, replayDoc, { script = null, align = 'auto', cross = [], maxDy = null, seg = null } = {}) {
  const U = curveOf(userDoc), R = curveOf(replayDoc, { seg });
  const notes = [];
  const rStarts = contactsOf(R.touches || []).map((c) => c.start);
  const uContacts = contactsOf(U.touches || []).map((c) => c.start);
  let uAnch = null, why = null;
  if (script?.source?.strokes?.length) {
    const ss = script.source.strokes.map((s) => script.source.firstTouchT + s.userMs);
    if (ss.length === rStarts.length) { uAnch = ss; why = 'the script\'s strokes'; }
    else notes.push(`${rStarts.length} touch sequences in the replay, ${ss.length} strokes in the script: no stroke alignment (a stroke not played, or a run cut short?)`);
  }
  if (!uAnch && uContacts.length && uContacts.length === rStarts.length) { uAnch = uContacts; why = 'the user\'s contacts'; }
  else if (!uAnch && !script) notes.push(`${rStarts.length} touch sequences in the replay, ${uContacts.length} in the user's record: no stroke alignment (pass --script <the converter's script> when strokes were split or dropped)`);
  let mode = align === 'auto' ? (uAnch ? 'strokes' : 'start') : align;
  if (mode === 'strokes' && !uAnch) { notes.push('--align strokes: the touch sequences do not pair up; aligned at the first touch'); mode = 'start'; }
  const u0 = uAnch ? uAnch[0] : (uContacts[0] ?? U.curve[0][0]);
  const r0 = rStarts[0] ?? R.curve[0][0];
  if (!uContacts.length) notes.push('the user\'s record has no touches: aligned at its first frame');
  if (!rStarts.length) notes.push('the replay has no touches: aligned at its first frame');
  const offs = mode === 'strokes' ? uAnch.map((u, i) => [u, rStarts[i] - u]) : [[u0, r0 - u0]];
  // piecewise-constant offset: the robot's latency sits before each stroke; the stroke and its coast play in real time
  const map = (t) => { let o = offs[0][1]; for (const [u, d] of offs) { if (t >= u) o = d; else break; } return t + o; };
  const ref = U.curve.filter((p) => p[0] >= u0);
  const score = scoreCurves(ref, R.curve, { map });
  const peakOf = (c, from) => { let b = null; for (const p of c) if (p[0] >= from && (!b || p[1] > b[1])) b = p; return b ? { y: b[1], ms: Math.round(b[0] - from) } : null; };
  const out = {
    align: mode, alignedOn: mode === 'strokes' ? why : 'the first touch', anchors: mode === 'strokes' ? offs.length : 1, score,
    durationMs: { user: Math.round(U.curve[U.curve.length - 1][0] - u0), replay: Math.round(R.curve[R.curve.length - 1][0] - r0) },
    peak: { user: peakOf(U.curve, u0), replay: peakOf(R.curve, r0) },
    strokes: (uAnch && mode === 'strokes' ? uAnch : []).map((u, i) => {
      const r = rStarts[i], uy = yAt(U.curve, u), ry = yAt(R.curve, r);
      return { k: i + 1, userMs: Math.round(u - u0), replayMs: Math.round(r - r0), lagMs: Math.round(r - r0 - (u - u0)), userY: Math.round(uy), replayY: Math.round(ry), dy: Math.round(ry - uy) };
    }),
    crossings: cross.map((y) => {
      const tu = reach(U.curve, y, u0), tr = reach(R.curve, y, r0);
      return { y, userMs: tu === null ? null : Math.round(tu - u0), replayMs: tr === null ? null : Math.round(tr - r0), dMs: tu === null || tr === null ? null : Math.round(tr - r0 - (tu - u0)) };
    }),
    notes,
  };
  if (maxDy !== null) out.verdict = score.maxAbsDy !== null && score.maxAbsDy <= maxDy ? 'OK' : 'MISS';
  return out;
}
