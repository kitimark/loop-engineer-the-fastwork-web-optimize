// In-page recorder for gesture runs on the iPhone (tools/iphone.mjs `gesture`), plus the pure summary
// functions over what it records. research/architecture/finger-simulation.md §4.2 "Pairing with the
// instruments".
//
// The recorder is `iphone.mjs record`'s frame log ([t, dt, scrollY, innerHeight] per rAF, same rounding)
// plus, new here, passive touch listeners and the gesture's marks, so strokes align to frames exactly:
//   touches: [t, kind, touches.length, cancelable, defaultPrevented, scrollY, clientY, timeStamp]
//            kind s = touchstart, m = touchmove, e = touchend, c = touchcancel; t = performance.now() in the
//            handler; timeStamp = the event's own e.timeStamp (when the OS delivered it, same clock). On a slow
//            page a handler runs up to one long frame after the event, so the summaries time touches by
//            timeStamp when it is sane (touchTime) and keep the handler time as the fallback (review-gesture-2 B1).
//   marks:   [t, name]   (also performance.mark("fwg:<name>"))
// All listeners are {passive: true}: they never block scrolling. touchstart/end/cancel listen in the capture
// phase on window (earliest timestamp); touchmove in the bubble phase on window, registered after the
// page's own listeners, so `defaultPrevented` says whether the page's handlers prevented it (a handler that
// stops propagation hides the event from us: the counts are then a lower bound).
// `iphone.mjs record` itself is unchanged (no touch listeners); this recorder is used by `gesture` only.

/** Install (idempotent while running). The rAF loop uses the rAF captured at install time, so a later
 *  morph logger that wraps window.requestAnimationFrame does not count the recorder as page work. */
export const RECORDER_JS = `(() => {
  if (window.__fwg && !window.__fwg.stop) return 'already installed';
  const R = (v) => Math.round(v * 10) / 10;
  const rAF = window.requestAnimationFrame.bind(window);
  const r = window.__fwg = {v: 2, href: location.href, vw: innerWidth, vh0: innerHeight, t0: R(performance.now()), docH: document.documentElement.scrollHeight, frames: [], touches: [], marks: [], stop: false};
  let last = performance.now();
  const loop = (t) => { if (r.stop) return; r.frames.push([R(t), R(t - last), Math.round(scrollY), innerHeight]); last = t; rAF(loop); };
  rAF(loop);
  const on = (type, kind, capture) => addEventListener(type, (e) => {
    if (r.stop) return;
    const ct = e.changedTouches && e.changedTouches[0];
    r.touches.push([R(performance.now()), kind, e.touches ? e.touches.length : 0, e.cancelable ? 1 : 0, e.defaultPrevented ? 1 : 0, Math.round(scrollY), ct ? Math.round(ct.clientY) : null, typeof e.timeStamp === 'number' ? R(e.timeStamp) : null]);
  }, {passive: true, capture});
  on('touchstart', 's', true); on('touchend', 'e', true); on('touchcancel', 'c', true); on('touchmove', 'm', false);
  return 'installed';
})()`;

/** Mark the timeline (page clock); returns the page's performance.now(). */
export const markJs = (name) => `(() => { const t = performance.now(); try { performance.mark(${JSON.stringify('fwg:' + name)}); } catch (e) {} if (window.__fwg && !window.__fwg.stop) window.__fwg.marks.push([Math.round(t * 10) / 10, ${JSON.stringify(name)}]); return t; })()`;

/** [scrollY, maxY, innerHeight, performance.now(), document.visibilityState, innerWidth]: polled between strokes
 *  (until, pull guard, clock sync) and before every stroke (visible? portrait?). */
export const STATE_JS = `[Math.round(scrollY), document.documentElement.scrollHeight - innerHeight, innerHeight, Math.round(performance.now() * 10) / 10, document.visibilityState, innerWidth]`;

/** Stop the recorder and return its buffer (JSON string), or null if it is not installed. */
export const READ_JS = `(() => { const r = window.__fwg; if (!r) return null; r.stop = true; r.docH1 = document.documentElement.scrollHeight; r.t1 = Math.round(performance.now() * 10) / 10; return JSON.stringify(r); })()`;

// ---- pure summaries ---------------------------------------------------------------------------------
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]; };
const median = (xs) => pct(xs, 50);
/** Same counters as `iphone.mjs record`. */
export const frameSum = (f) => ({ frames: f.length, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) });

const maxYOf = (seg) => (f) => (seg.docH1 ?? seg.docH) - f[3];

/** Moving frames (scrollY changed since the previous frame) split by where: hero y < 900, last screen, middle. */
export function frameBands(seg, { heroY = 900 } = {}) {
  const fr = seg.frames || [], mY = maxYOf(seg);
  const b = { hero: [], middle: [], lastScreen: [] };
  for (let i = 1; i < fr.length; i++) {
    const f = fr[i];
    if (f[2] === fr[i - 1][2]) continue;
    if (f[2] < heroY) b.hero.push(f[1]);
    else if (f[2] >= mY(f) - f[3]) b.lastScreen.push(f[1]);
    else b.middle.push(f[1]);
  }
  const all = fr.map((f) => f[1]);
  return { all: frameSum(all), hero: frameSum(b.hero), middle: frameSum(b.middle), lastScreen: frameSum(b.lastScreen) };
}

/** Toolbar collapse/expand: innerHeight runs from one stable level (min/max seen) to the other, with ms. */
export function toolbarTransitions(frames) {
  const hs = frames.map((f) => f[3]);
  if (!hs.length) return { levels: [], transitions: [], aborted: 0, medianMs: null };
  const lo = Math.min(...hs), hi = Math.max(...hs);
  if (lo === hi) return { levels: [lo], transitions: [], aborted: 0, medianMs: null };
  const out = [];
  let level = null, start = null, aborted = 0, prevT = null;
  for (const f of frames) {
    const h = f[3];
    if (h === lo || h === hi) {
      if (level !== null && start !== null) {
        if (h !== level) out.push({ t: start, from: level, to: h, ms: Math.round(f[0] - start) });
        else aborted++;
      } else if (level !== null && h !== level) out.push({ t: prevT, from: level, to: h, ms: Math.round(f[0] - prevT) }); // a jump within one frame
      level = h; start = null;
    } else if (level !== null && start === null) start = f[0];
    prevT = f[0];
  }
  const ms = out.map((x) => x.ms);
  return { levels: [lo, hi], transitions: out, aborted, medianMs: median(ms), minMs: ms.length ? Math.min(...ms) : null, maxMs: ms.length ? Math.max(...ms) : null };
}

/** Overscroll extremes: lowest scrollY (rubber band at the top < 0) and the most past maxY. */
export function overscroll(seg) {
  const fr = seg.frames || [], mY = maxYOf(seg);
  let minY = Infinity, maxOver = -Infinity, maxY = null;
  for (const f of fr) { minY = Math.min(minY, f[2]); const o = f[2] - mY(f); if (o > maxOver) { maxOver = o; maxY = f[2]; } }
  return fr.length ? { minY, maxOverPx: maxOver, atY: maxY } : { minY: null, maxOverPx: null, atY: null };
}

/**
 * The pin fight at the end of the page (research/architecture/finger-simulation.md §2 "Rubber band": "the end
 * overscroll fights the pin: 5220<->5312/5334, 8-50 reversals per dwell"; §5(c) V1 "pin alternation ... >= 1 per
 * push block on aw1-10c, 0-1 on mw-g"), from the recorder's frames and touches (review-gesture 4).
 *
 * Two counts over the frames within `zone` px of maxY (maxY per frame, from its innerHeight):
 * - reversals: direction changes of scrollY by >= `minSwing` px (hysteresis: one counts when the page has moved
 *   minSwing back from the last extreme; the first move only sets the direction). One 5220 -> 5312 -> 5220
 *   cycle is up to 2 reversals.
 * - excursions: round trips out past maxY + minSwing (counted on the way out; the next one needs a return to
 *   <= maxY + 2 first). One cycle = 1 excursion.
 * Each is split by touch phase, from the passive touch listeners (a frame belongs to the phase at its time):
 * - touching: a finger is down (touchstart .. touchend/cancel of a sequence). A scripted stroke's finger moves
 *   one way only (or holds still), so every reversal here is the page moving against the finger: the morph's
 *   scrollTo pin fighting the drag/overscroll. This is the pin fight.
 * - afterLift: from a touchend to the next touchstart. iOS's rubber band after a lift (or a fling into the end)
 *   goes out and comes back once: <= 1 reversal and <= 1 excursion per lift window, a bounce. Anything more in
 *   one window is oscillation: `extraReversals` = sum of max(0, reversals - 1) per window.
 * - noTouch: before the first touch of the segment.
 * fight = touching.reversals + afterLift.extraReversals; bounces = after-lift windows with exactly 1 reversal.
 * The frames alone cannot tell a fight from a bounce (F2 in iphone-wave2: one 5260<->5412 bounce, judged by
 * hand); the touch split is what can.
 *
 * Relation to iphone-wave2's "8 reversals" (fixes/iphone-wave2/README.md §2b, column "pin fight (scrollY
 * reversals >= 20 px at the end)": E1 1, E1b 8, F1 0, F2 1, B2 ~50): those came from `record` frames only (no
 * touches) and count round trips, i.e. `excursions`. On the same frames (docH 6035) this function gives
 * excursions E1 2, E1b 7, F1 1, F2 2, B2 pass 2 46 (reversals 4, 13, 1, 2, 91). Compare the finger references
 * with `excursions` (or with reversals / 2), and the V1 "per push block" criterion with `perMark`.
 *
 * Returns {reversals, excursions, touching, afterLift, noTouch, fight, bounces, touchData, perTouch, perMark,
 * swings}. perTouch[k] (touch sequence k = stroke k when aligned): {touching, afterLift} reversal counts.
 * perMark: {<mark name>: {reversals, excursions, touching, afterLift}} for the frames from that mark to the next
 * ("(start)" before the first mark; a name used twice sums).
 */
export function pinReversals(seg, { minSwing = 20, zone = 150 } = {}) {
  const mY = maxYOf(seg);
  const seqs = touchSequences(seg);
  const marks = [...(seg.marks || [])].sort((a, b) => a[0] - b[0]);
  const touchData = (seg.touches || []).length > 0;
  const z = () => ({ reversals: 0, excursions: 0 });
  const out = { reversals: 0, excursions: 0, touching: z(), afterLift: { ...z(), windows: 0, extraReversals: 0 }, noTouch: z(), perTouch: seqs.map(() => ({ touching: 0, afterLift: 0 })), perMark: {}, swings: [] };
  // phase at frame time t (frames come in time order): k = the last sequence that started at or before t
  let k = -1;
  const phaseAt = (t) => {
    while (k + 1 < seqs.length && seqs[k + 1].start <= t) k++;
    if (k < 0) return ['noTouch', -1];
    return seqs[k].end === null || t <= seqs[k].end ? ['touching', k] : ['afterLift', k];
  };
  let mi = -1;
  const markAt = (t) => { while (mi + 1 < marks.length && marks[mi + 1][0] <= t) mi++; return mi < 0 ? '(start)' : marks[mi][1]; };
  const bump = (kind, t) => {
    out[kind]++;
    const [ph, q] = phaseAt(t);
    out[ph][kind]++;
    if (kind === 'reversals' && q >= 0) out.perTouch[q][ph]++;
    const m = (out.perMark[markAt(t)] ??= { reversals: 0, excursions: 0, touching: 0, afterLift: 0 });
    m[kind]++;
    if (kind === 'reversals' && ph !== 'noTouch') m[ph]++;
  };
  // dir 0: no direction yet (track min/max until the page has moved minSwing one way); then follow the
  // extreme in the current direction and count a reversal when the page is minSwing back from it.
  let dir = 0, ext = null, lo = null, hi = null, outside = false;
  for (const f of seg.frames || []) {
    const y = f[2], top = mY(f);
    if (y < top - zone) { dir = 0; ext = lo = hi = null; outside = false; continue; }
    if (!outside && y >= top + minSwing) { outside = true; bump('excursions', f[0]); } else if (outside && y <= top + 2) outside = false;
    if (dir === 0) {
      lo = lo === null ? y : Math.min(lo, y); hi = hi === null ? y : Math.max(hi, y);
      if (y - lo >= minSwing) { dir = 1; ext = y; } else if (hi - y >= minSwing) { dir = -1; ext = y; }
      continue;
    }
    if (dir * (y - ext) > 0) { ext = y; continue; }
    if (Math.abs(y - ext) >= minSwing) {
      bump('reversals', f[0]);
      if (out.swings.length < 60) out.swings.push([f[0], ext, y]);
      dir = -dir; ext = y;
    }
  }
  out.afterLift.windows = out.perTouch.filter((p) => p.afterLift > 0).length;
  out.afterLift.extraReversals = out.perTouch.reduce((a, p) => a + Math.max(0, p.afterLift - 1), 0);
  out.bounces = out.perTouch.filter((p) => p.afterLift === 1).length;
  out.fight = out.touching.reversals + out.afterLift.extraReversals;
  out.touchData = touchData;
  return out;
}

/**
 * When a recorded touch happened, on the frames' clock: the event's timeStamp (index 7) when it is sane (a
 * number in (0, handler time], at most 5 s before the handler: same performance.now() clock, not epoch ms),
 * else the handler time (index 0; also every recording from before v2). The handler can run a long frame
 * late on this page, which would move a lift's first rubber-band frames into `touching` (review-gesture-2 B1).
 */
export const touchTime = (e) => { const ts = e[7]; return typeof ts === 'number' && ts > 0 && ts <= e[0] && e[0] - ts <= 5000 ? ts : e[0]; };

/** Touch sequences (touchstart .. touchend/cancel) with their touchmove counts. start/end are touchTime;
 *  endLagMs = how late the touchend handler ran after the event (0 without a usable timeStamp). */
export function touchSequences(seg) {
  const seqs = [];
  let cur = null;
  for (const e of seg.touches || []) {
    const [, k, , cancelable, prevented, y] = e;
    const t = touchTime(e);
    if (k === 's') { if (!cur || e[2] <= 1) { cur = { start: t, end: null, startY: y, moves: 0, cancelable: 0, prevented: 0, firstMoveT: null, lastMoveT: null }; seqs.push(cur); } continue; }
    if (!cur) continue;
    if (k === 'm') { cur.moves++; cur.cancelable += cancelable; cur.prevented += prevented; cur.firstMoveT ??= t; cur.lastMoveT = t; }
    else if ((k === 'e' || k === 'c') && e[2] === 0) { cur.end = t; cur.endLagMs = Math.round((e[0] - t) * 10) / 10; cur.endY = y; cur.cancelled = k === 'c'; cur = null; }
  }
  for (const s of seqs) s.moveHz = s.moves > 1 && s.lastMoveT > s.firstMoveT ? Math.round(((s.moves - 1) * 1000) / (s.lastMoveT - s.firstMoveT)) : null;
  return seqs;
}

/** touchmove totals, overall and at the end (scrollY within 2 px of maxY or past it). */
export function touchmoveStats(seg) {
  const mY = (seg.docH1 ?? seg.docH) - (seg.vh0 ?? 0);
  let total = 0, cancelable = 0, prevented = 0, endTotal = 0, endPrevented = 0;
  // maxY at the event: innerHeight from the nearest preceding frame
  const fr = seg.frames || [];
  let fi = 0;
  for (const e of seg.touches || []) {
    if (e[1] !== 'm') continue;
    while (fi + 1 < fr.length && fr[fi + 1][0] <= touchTime(e)) fi++;
    const maxY = fr.length ? (seg.docH1 ?? seg.docH) - fr[fi][3] : mY;
    total++; cancelable += e[3]; prevented += e[4];
    if (e[5] >= maxY - 2) { endTotal++; endPrevented += e[4]; }
  }
  const ratio = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  return { total, cancelable, prevented, preventedPct: ratio(prevented, total), atEnd: { total: endTotal, prevented: endPrevented, preventedPct: ratio(endPrevented, endTotal) } };
}

/**
 * Momentum after a lift-off at page time `tUp`: a log-linear fit of |scroll velocity| over the frames until
 * the next touch (or `maxMs`), stopping at the top/end or when it is nearly still. tau = -1/slope (s).
 * A native fling decays with tau ~0.43-0.5 s (finger median 0.43 s, UIKit normal deceleration 0.50 s).
 */
export function momentumTau(seg, tUp, { tNext = Infinity, maxMs = 3000, skipMs = 34, minV = 0.05, minPoints = 6 } = {}) {
  const fr = (seg.frames || []).filter((f) => f[0] >= tUp + skipMs && f[0] < Math.min(tNext, tUp + maxMs));
  const mY = maxYOf(seg);
  const pts = [];
  for (let i = 1; i < fr.length; i++) {
    const dt = fr[i][0] - fr[i - 1][0];
    if (dt <= 0) continue;
    const y = fr[i][2];
    if (y <= 0 || y >= mY(fr[i])) break; // bounce or rubber band: no longer free deceleration
    const v = Math.abs(fr[i][2] - fr[i - 1][2]) / dt;
    if (v < minV) break;
    pts.push([fr[i][0] - tUp, Math.log(v)]);
  }
  const travel = (() => { const a = (seg.frames || []).filter((f) => f[0] >= tUp && f[0] < Math.min(tNext, tUp + maxMs)); return a.length ? Math.abs(a[a.length - 1][2] - a[0][2]) : 0; })();
  if (pts.length < minPoints) return { tauS: null, points: pts.length, travelPx: travel };
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  return { tauS: slope < 0 ? Math.round(-1 / slope) / 1000 : null, points: n, v0PxPerS: Math.round(Math.exp(pts[0][1]) * 1000), travelPx: travel };
}

/**
 * Morph-active frames from fixes/morph-webkit/morph-log.mjs output, with that logger's own definitions so the
 * numbers compare with the finger runs' morph logs: active = --morph (frame[3]) > 0.001 or the nav class has
 * is-morphing (frame[4] includes "m"); the first frame is dropped; quantile = sorted[floor(p * n)].
 */
export function morphStats(morphFrames, { skipFirst = true } = {}) {
  const act = (morphFrames || []).slice(skipFirst ? 1 : 0).filter((f) => (f[3] ?? 0) > 0.001 || String(f[4] || '').includes('m')).map((f) => f[1]).sort((a, b) => a - b);
  const q = (p) => (act.length ? act[Math.min(act.length - 1, Math.floor(p * act.length))] : null);
  return { frames: act.length, p50: q(0.5), p95: q(0.95), gt50Pct: act.length ? Math.round((1000 * act.filter((x) => x > 50).length) / act.length) / 10 : null };
}

/** pinReversals() summaries of several segments added up (perMark by mark name). */
function sumPin(pins) {
  const add = (a, b) => { for (const [k, v] of Object.entries(b)) if (typeof v === 'number') a[k] = (a[k] || 0) + v; return a; };
  const r = { reversals: 0, excursions: 0, fight: 0, bounces: 0, touching: {}, afterLift: {}, noTouch: {}, perMark: {}, touchData: pins.length > 0 && pins.every((p) => p.touchData) };
  for (const p of pins) {
    for (const k of ['reversals', 'excursions', 'fight', 'bounces']) r[k] += p[k];
    for (const k of ['touching', 'afterLift', 'noTouch']) add(r[k], p[k]);
    for (const [m, v] of Object.entries(p.perMark)) add((r.perMark[m] ??= {}), v);
  }
  return r;
}

/**
 * Whole-run summary. `segments`: recorder buffers (one per page load); `strokes`: the runner's per-stroke
 * records in execution order, each with `seg` (segment index) and `kin` (compiled kinematics).
 */
export function summarizeRun(segments, strokes = [], { morph = [] } = {}) {
  const segOut = segments.map((seg, i) => {
    const seqs = touchSequences(seg);
    const mine = strokes.filter((s) => s.seg === i);
    const aligned = seqs.length === mine.length;
    const pin = pinReversals(seg);
    const perStroke = mine.map((s, k) => {
      const q = aligned ? seqs[k] : null;
      const next = aligned && seqs[k + 1] ? seqs[k + 1].start : Infinity;
      const m = q && q.end !== null ? momentumTau(seg, q.end, { tNext: next }) : null;
      return { id: s.id, profile: s.kin.profile, dir: s.kin.dir, px: s.kin.px, liftoffPxPerS: s.kin.liftoffPxPerS, touchStart: q?.start ?? null, contactMs: q && q.end !== null ? Math.round(q.end - q.start) : null, endLagMs: q?.endLagMs ?? null, touchmoves: q?.moves ?? null, prevented: q?.prevented ?? null, moveHz: q?.moveHz ?? null, startY: q?.startY ?? null, tauS: m?.tauS ?? null, postReleaseTravelPx: m?.travelPx ?? null, pinTouching: aligned ? pin.perTouch[k].touching : null, pinAfterLift: aligned ? pin.perTouch[k].afterLift : null };
    });
    const { perTouch, swings, ...pinSum } = pin;
    return {
      href: seg.href, frames: (seg.frames || []).length, bands: frameBands(seg), toolbar: toolbarTransitions(seg.frames || []), overscroll: overscroll(seg), pin: { ...pinSum, swings: swings.slice(0, 20) },
      touchmove: touchmoveStats(seg), touchSequences: seqs.length, strokes: mine.length, aligned, perStroke,
    };
  });
  const flings = segOut.flatMap((s) => s.perStroke).filter((p) => p.profile === 'fling' && p.tauS !== null).map((p) => p.tauS);
  const tm = segOut.reduce((a, s) => ({ total: a.total + s.touchmove.total, prevented: a.prevented + s.touchmove.prevented, endTotal: a.endTotal + s.touchmove.atEnd.total, endPrevented: a.endPrevented + s.touchmove.atEnd.prevented }), { total: 0, prevented: 0, endTotal: 0, endPrevented: 0 });
  const tb = segOut.flatMap((s) => s.toolbar.transitions.map((x) => x.ms));
  return {
    segments: segOut,
    touchmove: { ...tm, preventedPct: tm.total ? Math.round((1000 * tm.prevented) / tm.total) / 10 : null, endPreventedPct: tm.endTotal ? Math.round((1000 * tm.endPrevented) / tm.endTotal) / 10 : null },
    toolbar: { transitions: tb.length, medianMs: median(tb), minMs: tb.length ? Math.min(...tb) : null, maxMs: tb.length ? Math.max(...tb) : null },
    pin: sumPin(segOut.map((s) => s.pin)),
    overscroll: { minY: Math.min(...segOut.map((s) => s.overscroll.minY ?? Infinity)), maxOverPx: Math.max(...segOut.map((s) => s.overscroll.maxOverPx ?? -Infinity)) },
    momentum: { flings: flings.length, tauMedianS: median(flings), tauS: flings },
    morph: morph.length ? morphStats(morph.flatMap((m) => (m.frames || []).slice(1)), { skipFirst: false }) : null,
  };
}
