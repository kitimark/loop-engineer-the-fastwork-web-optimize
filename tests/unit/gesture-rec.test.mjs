// tools/lib/gesture-rec.mjs: the in-page gesture recorder (run in a node:vm fake window: frames in
// `iphone.mjs record`'s format, passive touch listeners, marks, idempotent install, read stops it) and the
// pure summaries (toolbar transitions, pin reversals, overscroll, touchmove prevented ratio, momentum tau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../helpers.mjs';
import { RECORDER_JS, READ_JS, STATE_JS, markJs, toolbarTransitions, pinReversals, overscroll, touchSequences, touchTime, touchmoveStats, momentumTau, frameBands, morphStats, summarizeRun, motionMetrics, motionTick, touchToScrollMs, countOnlySummary, countOnlyRun } from '../../tools/lib/gesture-rec.mjs';

function fakeWindow() {
  let now = 1000;
  const rafQ = [], listeners = [], marks = [];
  const win = {
    scrollY: 0, innerWidth: 430, innerHeight: 775,
    location: { href: 'http://192.168.0.2:5441/' },
    document: { documentElement: { scrollHeight: 5995 }, visibilityState: 'visible' },
    performance: { now: () => now, mark: (n) => marks.push(n) },
    requestAnimationFrame: (cb) => { rafQ.push(cb); return rafQ.length; },
    addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }),
    JSON, Math,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  return {
    win, listeners, marks,
    run: (js) => vm.runInContext(js, ctx),
    frame(dt = 16.7) { now += dt; const q = rafQ.splice(0); q.forEach((cb) => cb(now)); },
    advance(dt) { now += dt; },
    dispatch(type, { cancelable = true, prevent = false, touches = 1, y = 500, ts } = {}) {
      const e = { type, cancelable, defaultPrevented: false, touches: { length: touches }, changedTouches: [{ clientY: y }], ...(ts === undefined ? {} : { timeStamp: ts }) };
      // the page's own (non-passive) handler ran first, the recorder's bubble listener on window last
      if (prevent && cancelable) e.defaultPrevented = true;
      for (const l of listeners.filter((x) => x.type === type)) l.fn(e);
    },
  };
}

test('recorder: frames like `record`, passive touch listeners, marks, idempotent, READ stops it', () => {
  const w = fakeWindow();
  assert.equal(w.run(RECORDER_JS), 'installed');
  assert.equal(w.run(RECORDER_JS), 'already installed');
  assert.deepEqual(w.listeners.map((l) => [l.type, l.opts.passive, l.opts.capture]), [['touchstart', true, true], ['touchend', true, true], ['touchcancel', true, true], ['touchmove', true, false]]);
  // a morph logger installed later wraps requestAnimationFrame: the recorder keeps using the original
  let wrapped = 0;
  const orig = w.win.requestAnimationFrame;
  w.win.requestAnimationFrame = (cb) => { wrapped++; return orig(cb); };
  w.frame(16.7); w.win.scrollY = 10.4; w.frame(16.6);
  assert.equal(wrapped, 0);
  w.dispatch('touchstart');
  w.dispatch('touchmove', { prevent: true });
  w.win.scrollY = 40;
  w.dispatch('touchmove', { cancelable: false });
  w.dispatch('touchend', { touches: 0, y: 300, ts: 1012.34 }); // the event's own timeStamp (rounded like t); the others have none: null
  const t = w.run(markJs('hero'));
  assert.ok(typeof t === 'number');
  assert.deepEqual(w.marks, ['fwg:hero']);
  w.win.innerHeight = 815; w.frame(16.7);
  assert.deepEqual(JSON.parse(JSON.stringify(w.run(STATE_JS))), [40, 5995 - 815, 815, 1050, 'visible', 430]);
  const r = JSON.parse(w.run(READ_JS));
  assert.equal(r.v, 2);
  assert.equal(r.vh0, 775);
  assert.equal(r.docH, 5995);
  assert.deepEqual(r.frames.map((f) => f.length), [4, 4, 4], '[t, dt, scrollY, innerHeight] like iphone.mjs record');
  assert.deepEqual(r.frames.map((f) => [f[2], f[3]]), [[0, 775], [10, 775], [40, 815]]);
  assert.deepEqual(r.frames[1].slice(0, 2), [1033.3, 16.6]);
  assert.deepEqual(r.touches.map((e) => e.slice(1)), [['s', 1, 1, 0, 10, 500, null], ['m', 1, 1, 1, 10, 500, null], ['m', 1, 0, 0, 40, 500, null], ['e', 0, 1, 0, 40, 300, 1012.3]]);
  assert.deepEqual(r.marks, [[1033.3, 'hero']]);
  // stopped: no more frames, touches or marks; a new install starts a fresh buffer
  w.frame(); w.dispatch('touchstart'); w.run(markJs('late'));
  assert.equal(JSON.parse(w.run(READ_JS)).frames.length, 3);
  assert.equal(w.run(RECORDER_JS), 'installed');
});

const F = (t, y, h = 775, dt = 16.7) => [t, dt, y, h];

test('toolbarTransitions: 775 <-> 815 runs with their duration; a return to the same level is aborted', () => {
  const fr = [F(0, 0), F(10, 13, 781), F(40, 60, 793), F(300, 200, 814), F(320, 210, 815), F(400, 220, 815), F(500, 200, 803), F(800, 100, 775), F(900, 90, 787), F(950, 80, 775)];
  const r = toolbarTransitions(fr);
  assert.deepEqual(r.levels, [775, 815]);
  assert.deepEqual(r.transitions, [{ t: 10, from: 775, to: 815, ms: 310 }, { t: 500, from: 815, to: 775, ms: 300 }]);
  assert.equal(r.aborted, 1);
  assert.equal(r.medianMs, 300);
  assert.deepEqual(toolbarTransitions([F(0, 0), F(1, 5)]).transitions, []);
  // a jump within one frame counts, with the frame interval as its duration
  assert.deepEqual(toolbarTransitions([F(0, 0), F(17, 50), F(34, 150, 815), F(51, 160, 815)]).transitions, [{ t: 17, from: 775, to: 815, ms: 17 }]);
});

const END = { docH: 5995, vh0: 775 }; // maxY 5220 with the toolbar expanded, 5180 collapsed
test('pinReversals and overscroll at the end: 5220 <-> 5312 fights count, small jitter and mid-page moves do not', () => {
  const ys = [4000, 5000, 5220, 5230, 5312, 5300, 5220, 5225, 5334, 5220, 5215, 5222, 3000, 3100, 3000];
  const seg = { ...END, frames: ys.map((y, i) => F(i * 17, y)) };
  const p = pinReversals(seg);
  assert.equal(p.reversals, 3, JSON.stringify(p.swings)); // 5312->5220, 5220->5334, 5334->5220 (the first push up only sets the direction)
  assert.equal(p.excursions, 2, 'two round trips past maxY + 20: 5312, 5334');
  assert.deepEqual([p.touchData, p.noTouch, p.touching.reversals, p.fight], [false, { reversals: 3, excursions: 2 }, 0, 0], 'no touches recorded: all in noTouch');
  assert.deepEqual(p.perMark, { '(start)': { reversals: 3, excursions: 2, touching: 0, afterLift: 0 } });
  assert.deepEqual(pinReversals({ ...END, frames: [5220, 5230, 5221, 5229, 5222].map((y, i) => F(i, y)) }).reversals, 0, 'jitter < 20 px');
  assert.deepEqual(overscroll(seg), { minY: 3000, maxOverPx: 114, atY: 5334 });
  assert.equal(overscroll({ ...END, frames: [F(0, 10), F(1, -74), F(2, 0)] }).minY, -74);
});

test('pinReversals splits by touch phase and mark window: a fight while touching, a bounce after lift, oscillation after lift (review-gesture 4)', () => {
  const T = (t, k, n) => [t, k, n, 1, 0, 5220, 500];
  const seg = {
    ...END,
    marks: [[0, 'push1'], [75, 'push2']],
    touches: [T(1, 's', 1), T(55, 'e', 0), T(80, 's', 1), T(95, 'e', 0)],
    frames: [[0, 5220], [10, 5260], [20, 5312], [30, 5220], [40, 5312], [50, 5312], [60, 5250], [70, 5220], [90, 5225], [100, 5300], [110, 5220], [120, 5300], [130, 5220]].map(([t, y]) => F(t, y)),
  };
  const p = pinReversals(seg);
  // push 1: held at the end, the page alternates against the still finger (2 reversals touching), then one
  // return after the lift (a bounce); push 2: after its lift the page keeps oscillating (4 reversals)
  assert.deepEqual([p.reversals, p.excursions], [7, 4]);
  assert.deepEqual(p.touching, { reversals: 2, excursions: 2 });
  assert.deepEqual(p.afterLift, { reversals: 5, excursions: 2, windows: 2, extraReversals: 3 });
  assert.deepEqual(p.noTouch, { reversals: 0, excursions: 0 });
  assert.deepEqual(p.perTouch, [{ touching: 2, afterLift: 1 }, { touching: 0, afterLift: 4 }]);
  assert.equal(p.bounces, 1);
  assert.equal(p.fight, 5, 'touching 2 + after-lift reversals beyond one per lift 3');
  assert.equal(p.touchData, true);
  assert.deepEqual(p.perMark, { push1: { reversals: 3, excursions: 2, touching: 2, afterLift: 1 }, push2: { reversals: 4, excursions: 2, touching: 0, afterLift: 4 } });
  // summarizeRun: per stroke (aligned) and whole-run sums
  const kin = { profile: 'still', dir: 'up', px: 300, liftoffPxPerS: 0 };
  const r = summarizeRun([seg, seg], [0, 1, 0, 1].map((s, i) => ({ id: `s${i + 1}`, seg: s, kin })).sort((a, b) => a.seg - b.seg));
  assert.deepEqual(r.segments[0].perStroke.map((x) => [x.pinTouching, x.pinAfterLift]), [[2, 1], [0, 4]]);
  assert.deepEqual([r.pin.reversals, r.pin.excursions, r.pin.fight, r.pin.bounces, r.pin.touching.reversals, r.pin.afterLift.extraReversals], [14, 8, 10, 2, 4, 6]);
  assert.deepEqual(r.pin.perMark.push2, { reversals: 8, excursions: 4, touching: 0, afterLift: 8 });
});

test('pinReversals vs iphone-wave2\'s finger counts (frames only): excursions are its round trips, reversals about twice', (t) => {
  const raw = join(REPO, 'fixes', 'iphone-wave2', 'raw');
  if (!existsSync(join(raw, 'finger-E1b.json'))) return t.skip('fixes/iphone-wave2/raw/finger-*.json absent (the calibration data lives with that topic)');
  const count = (f) => JSON.parse(readFileSync(join(raw, f), 'utf8')).segments.map((s) => pinReversals({ docH: 6035, ...s })).reduce((a, p) => [a[0] + p.excursions, a[1] + p.reversals], [0, 0]);
  // wave2 README §2b: E1 1, E1b 8, F1 0, F2 1 (judged a bounce), B2 ~50 (pass 2)
  assert.deepEqual(count('finger-E1b.json'), [7, 13]);
  assert.deepEqual(count('finger-F1.json'), [1, 1]);
  assert.deepEqual(count('finger-F2.json'), [2, 2]);
  assert.deepEqual(count('finger-E1.json'), [2, 4]);
  const b2 = JSON.parse(readFileSync(join(raw, 'finger-B2.json'), 'utf8')).segments[1];
  const p = pinReversals({ docH: 6035, ...b2 });
  assert.deepEqual([p.excursions, p.reversals], [46, 91]);
});

test('a touchend handler 150 ms late (slow page): phases use the event timeStamp, so the return after the lift is a bounce, not a fight (review-gesture-2 B1)', () => {
  // [handler t, kind, n, cancelable, prevented, scrollY, clientY, e.timeStamp]
  const T = (t, k, n, ts) => [t, k, n, 1, 0, 5220, 500, ts];
  // finger down at 1, held at the end; lifted at 100 (event), its handler only runs at 250 (one long frame)
  const frames = [[0, 5220], [20, 5260], [50, 5312], [80, 5312], [120, 5280], [150, 5225], [200, 5222], [260, 5220], [300, 5220]].map(([t, y]) => F(t, y));
  const late = { ...END, frames, touches: [T(1.2, 's', 1, 1), T(250, 'e', 0, 100)] };
  const q = touchSequences(late);
  assert.deepEqual([q[0].start, q[0].end, q[0].endLagMs], [1, 100, 150]);
  const p = pinReversals(late);
  assert.equal(p.reversals, 1, JSON.stringify(p.swings));
  assert.deepEqual([p.touching.reversals, p.afterLift.reversals, p.bounces, p.fight], [0, 1, 1, 0], 'the return at 120 ms is after the lift at 100');
  // without a timeStamp (pre-v2 data, or an engine without one) the handler time is all there is: a fight
  const old = pinReversals({ ...late, touches: late.touches.map((e) => e.slice(0, 7)) });
  assert.deepEqual([old.touching.reversals, old.fight], [1, 1]);
  // momentumTau and contactMs start at the event too
  const kin = { profile: 'still', dir: 'up', px: 300, liftoffPxPerS: 0 };
  const ps = summarizeRun([late], [{ id: 's1', seg: 0, kin }]).segments[0].perStroke[0];
  assert.deepEqual([ps.contactMs, ps.endLagMs, ps.pinTouching, ps.pinAfterLift], [99, 150, 0, 1]);
  // a timeStamp that is not on the performance.now() clock or is later than the handler is ignored
  for (const ts of [0, -5, null, undefined, 1.7e12, 251, 250 - 5001, 'x']) assert.equal(touchTime([250, 'e', 0, 1, 0, 0, 0, ts]), 250, String(ts));
  assert.equal(touchTime([250, 'e', 0, 1, 0, 0, 0, 250]), 250);
  assert.equal(touchTime([250, 'e', 0, 1, 0, 0, 0]), 250);
});

test('touch sequences and touchmove stats: prevented ratio overall and at the end', () => {
  const T = (t, k, n, c, p, y) => [t, k, n, c, p, y, 500];
  const seg = {
    ...END, frames: [F(0, 5220), F(100, 5220)],
    touches: [T(1, 's', 1, 1, 0, 5000), T(2, 'm', 1, 1, 0, 5000), T(3, 'm', 1, 1, 0, 5100), T(4, 'e', 0, 1, 0, 5100),
      T(10, 's', 1, 1, 0, 5220), ...[11, 31, 51, 71].map((t) => T(t, 'm', 1, 1, 1, 5220)), T(81, 'm', 1, 1, 0, 5220), T(90, 'c', 0, 0, 0, 5220)],
  };
  const q = touchSequences(seg);
  assert.equal(q.length, 2);
  assert.deepEqual([q[0].moves, q[0].prevented, q[0].end], [2, 0, 4]);
  assert.deepEqual([q[1].moves, q[1].prevented, q[1].cancelled, q[1].moveHz], [5, 4, true, 57]);
  const s = touchmoveStats(seg);
  assert.deepEqual(s, { total: 7, cancelable: 7, prevented: 4, preventedPct: 57.1, atEnd: { total: 5, prevented: 4, preventedPct: 80 } });
});

test('momentumTau: recovers tau of an exponential decay; none after a stop; stops at the end', () => {
  const frames = [];
  const tau = 450, v0 = 5; // px/ms
  let y = 1000;
  for (let t = 0; t <= 2500; t += 16.7) { frames.push(F(1000 + t, Math.round(y))); y += v0 * Math.exp(-t / tau) * 16.7; }
  const m = momentumTau({ ...END, frames }, 1000);
  assert.ok(Math.abs(m.tauS - 0.45) < 0.03, JSON.stringify(m));
  assert.ok(m.points > 20 && m.travelPx > 2000);
  const still = momentumTau({ ...END, frames: [0, 17, 33, 50, 67, 83, 100].map((t) => F(1000 + t, 2000)) }, 1000);
  assert.deepEqual([still.tauS, still.travelPx], [null, 0]);
  // the next touch ends the window
  assert.equal(momentumTau({ ...END, frames }, 1000, { tNext: 1100 }).tauS, null);
  // hitting maxY ends the fit (rubber band, not free deceleration)
  const clipped = frames.map((f) => F(f[0], Math.min(f[2], 1400)));
  assert.ok(momentumTau({ ...END, frames: clipped }, 1000).points < 8);
});

test('frameBands, morphStats and summarizeRun align strokes to touch sequences per segment', () => {
  const frames = [F(0, 0), F(17, 100, 775, 40), F(34, 950, 775, 60), F(51, 5100, 775, 120), F(68, 5100)];
  const b = frameBands({ ...END, frames });
  assert.deepEqual([b.hero.frames, b.middle.frames, b.lastScreen.frames], [1, 1, 1]);
  assert.deepEqual([b.hero.gt34, b.middle.gt50, b.lastScreen.gt100, b.all.max], [1, 1, 1, 120]);
  // morph-log.mjs's definitions: first frame dropped, active = --morph > 0.001 or nav class "m", sorted[floor(p n)]
  const mf = [[0, 99, 5220, 1, ''], [1, 20, 5220, 0.5, ''], [2, 60, 5220, 1, 'me'], [3, 30, 5220, null, 'm'], [4, 16, 5220, 0, ''], [5, 70, 5220, 0.0005, '']];
  assert.deepEqual(morphStats(mf), { frames: 3, p50: 30, p95: 60, gt50Pct: 33.3 });
  assert.deepEqual(morphStats(mf, { skipFirst: false }).frames, 4);
  const T = (t, k, n) => [t, k, n, 1, 0, 0, 500];
  const seg = { ...END, frames, touches: [T(1, 's', 1), T(2, 'm', 1), T(3, 'e', 0)] };
  const kin = { profile: 'fling', dir: 'up', px: 520, liftoffPxPerS: 6087 };
  const r = summarizeRun([seg, { ...END, frames: [], touches: [] }], [{ id: 's1', seg: 0, kin }, { id: 's2', seg: 1, kin }]);
  assert.equal(r.segments[0].aligned, true);
  assert.equal(r.segments[0].perStroke[0].touchStart, 1);
  assert.equal(r.segments[1].aligned, false, 'a stroke without a touch sequence is flagged, not mismatched');
  assert.equal(r.segments[1].perStroke[0].touchStart, null);
  assert.equal(r.touchmove.total, 1);
  assert.equal(r.morph, null);
});

// ---- motion metrics (de-unknowns-ux's perceptual metrics, research/design-engineering/unknowns-ux-metric.mjs) ----
const MOTION = [
  [0, 0, 0, 775], [16.7, 16.7, 10, 775], [33.4, 16.7, 20, 775],
  [83.4, 50, 70, 775], [116.7, 33.3, 100, 775], // a stutter run: k 6 then k 4 = 83.3 ms
  [133.4, 16.7, 110, 775], [150.1, 16.7, 110, 775], // on time, then still: both end a run
  [183.4, 33.3, 140, 775], [200.1, 16.7, 140, 775], // a second run (k 4)
  [400.1, 200, 140, 775], // a long frame on a still page: no gap of the motion
];

test('motionMetrics: MWFI = sum(dx dt) / sum(dx), longest gap and stutter runs (k >= 4) over moving frames only', () => {
  assert.deepEqual(motionMetrics(MOTION), { movingFrames: 6, movingMs: 166.7, mwfiMs: 35.7, longestGapMs: 50, stutterRuns: 2, stutterRunMaxMs: 83.3 });
  // a window [from, to) of frame indices: dx still comes from the frame before `from`
  assert.deepEqual(motionMetrics(MOTION, 3, 5), { movingFrames: 2, movingMs: 83.3, mwfiMs: 43.7, longestGapMs: 50, stutterRuns: 1, stutterRunMaxMs: 83.3 });
  assert.deepEqual(motionMetrics([[0, 0, 5, 775], [20, 20, 5, 775]]), { movingFrames: 0, movingMs: 0, mwfiMs: null, longestGapMs: null, stutterRuns: 0, stutterRunMaxMs: null });
  // null only when nothing moved (stats.mjs refuses null, so an empty window can't score as a perfect run);
  // motion without a stutter is a real 0
  assert.deepEqual(motionMetrics([[0, 0, 0, 775], [16.7, 16.7, 10, 775]]), { movingFrames: 1, movingMs: 16.7, mwfiMs: 16.7, longestGapMs: 16.7, stutterRuns: 0, stutterRunMaxMs: 0 });
  assert.deepEqual(motionMetrics([]), { movingFrames: 0, movingMs: 0, mwfiMs: null, longestGapMs: null, stutterRuns: 0, stutterRunMaxMs: null });
  // dx is |delta scrollY|: a move back up counts the same
  assert.equal(motionMetrics([[0, 0, 100, 775], [16.7, 16.7, 90, 775], [46.7, 30, 120, 775]]).mwfiMs, 26.7);
  // ticks as in tools/lib/stats.mjs: 37.5 ms is k 5 (a plain Math.round of 37.5 / 8.333 gives 4.499..., k 4)
  assert.equal(motionTick(37.5), 5);
  assert.equal(motionTick(29.1), 3);
  assert.equal(motionTick(29.2), 4);
});

test('motionMetrics agrees with de-unknowns-ux\'s reference (unknowns-ux-metric.mjs) on MWFI, STUT, RUNmax, LGGmax', async (t) => {
  const ref = join(REPO, 'research', 'design-engineering', 'unknowns-ux-metric.mjs');
  if (!existsSync(ref)) return t.skip('research/design-engineering/unknowns-ux-metric.mjs absent');
  const { metrics, finger } = await import(ref);
  const asRef = (fr) => fr.map((a, i) => ({ t: a[0], dt: i ? a[1] : 0, y: a[2], ih: a[3], dx: i ? Math.abs(a[2] - fr[i - 1][2]) : 0 }));
  const same = (mine, theirs, what) => {
    assert.equal(mine.mwfiMs, theirs.MWFI, `${what} MWFI`);
    assert.equal(mine.stutterRuns, theirs.STUT, `${what} STUT`);
    assert.equal(mine.stutterRunMaxMs, Math.round(theirs.RUNmax * 10) / 10, `${what} RUNmax`);
  };
  const m = motionMetrics(MOTION), r = metrics(asRef(MOTION));
  same(m, r, 'synthetic');
  assert.equal(m.longestGapMs, r.LGGmax, 'one gesture: its longest gap');
  const raw = join(REPO, 'fixes', 'iphone-wave2', 'raw');
  if (!existsSync(join(raw, 'finger-E1b.json'))) return t.skip('fixes/iphone-wave2/raw/finger-*.json absent');
  let n = 0;
  for (const f of ['finger-A2.json', 'finger-B2.json', 'finger-E1.json', 'finger-E1b.json', 'finger-F1.json', 'finger-F2.json']) {
    const segs = JSON.parse(readFileSync(join(raw, f), 'utf8')).segments;
    finger(f).forEach((theirs, i) => { same(motionMetrics(segs[i].frames), theirs.all, `${f}#${i}`); n++; });
  }
  assert.ok(n >= 6, `${n} finger segments compared`);
});

test('summarizeRun: per-stroke motion (touchstart to the next touchstart), touch-to-first-scroll for U6, segment and run motion', () => {
  const fr = [[0, 0, 0, 775]];
  const at = (t, y) => fr.push([t, Math.round((t - fr[fr.length - 1][0]) * 10) / 10, y, 775]);
  for (let t = 20; t <= 120; t += 20) at(t, 0);
  at(140, 10); at(160, 30); at(210, 90); at(245, 130); at(265, 150); at(285, 160); // stroke 1: first move at 140
  for (let t = 300; t <= 600; t += 20) at(t, 160);
  at(620, 170); at(640, 200); at(700, 260); at(720, 270); // stroke 2: first move at 620
  for (let t = 740; t <= 800; t += 20) at(t, 270);
  // [handler t, kind, touches, cancelable, prevented, scrollY, clientY, timeStamp]
  const touches = [
    [95, 's', 1, 1, 0, 0, 700, 90], [100, 'm', 1, 1, 0, 0, 690, 98], [130, 'm', 1, 1, 0, 0, 650, 129], [300, 'e', 0, 0, 0, 160, 300, 299],
    [590.5, 's', 1, 1, 0, 160, 700, 590], [600, 'm', 1, 0, 0, 160, 690, 599], [750, 'e', 0, 0, 0, 270, 400, 749],
  ];
  const seg = { docH: 6000, vh0: 775, frames: fr, touches, marks: [] };
  const kin = (profile) => ({ profile, dir: 'up', px: 200, liftoffPxPerS: 0 });
  const r = summarizeRun([seg, { docH: 6000, vh0: 775, frames: [], touches: [] }], [{ id: 's1', seg: 0, kin: kin('minjerk') }, { id: 's2', seg: 0, kin: kin('drag') }]);
  const [p1, p2] = r.segments[0].perStroke;
  const pick = (p) => [p.movingFrames, p.mwfiMs, p.longestGapMs, p.stutterRuns, p.stutterRunMaxMs, p.touchToScrollMs, p.firstMoveCancelable];
  assert.deepEqual(pick(p1), [6, 35, 50, 1, 85, 50, 1]);
  assert.deepEqual(pick(p2), [4, 41.8, 60, 1, 60, 30, 0]);
  assert.deepEqual(r.segments[0].motion, { movingFrames: 10, movingMs: 285, mwfiMs: 37.8, longestGapMs: 60, stutterRuns: 2, stutterRunMaxMs: 85 });
  assert.deepEqual(r.segments[1].motion, { movingFrames: 0, movingMs: 0, mwfiMs: null, longestGapMs: null, stutterRuns: 0, stutterRunMaxMs: null });
  assert.deepEqual(r.motion, r.segments[0].motion, 'the run pools its segments (Σdx·dt / Σdx over all of them)');
  // touch-to-scroll needs a page at rest at the touchstart: during momentum it is null
  const moving = summarizeRun([{ ...seg, touches: touches.map((e) => (e[1] === 's' && e[0] < 100 ? [255, 's', 1, 1, 0, 130, 700, 250] : e)).filter((e) => e[0] !== 100 && e[0] !== 130) }], [{ id: 's1', seg: 0, kin: kin('fling') }, { id: 's2', seg: 0, kin: kin('fling') }]);
  assert.equal(moving.segments[0].perStroke[0].touchToScrollMs, null);
  assert.equal(moving.segments[0].perStroke[0].firstMoveCancelable, null, 'no touchmove in that sequence');
  // at rest = no move in the 100 ms before the touch (stillPair's rule), not just the last two frames: the tail
  // of a momentum (moved at 245, 265, 285; still at 300, 320) is not at rest at 330, and is at 390
  assert.equal(touchToScrollMs(seg, 330), null);
  assert.equal(touchToScrollMs(seg, 390), 230, 'at rest since 285: first move at 620');
  assert.equal(touchToScrollMs(seg, 590), 30);
  assert.equal(touchToScrollMs(seg, 590, { maxMs: 20 }), null, 'nothing moved within maxMs');
  assert.equal(touchToScrollMs({ frames: fr.slice(0, 1) }, 10), null, 'one frame: no rest to judge');
  // not aligned: no per-stroke windows
  const un = summarizeRun([seg], [{ id: 's1', seg: 0, kin: kin('minjerk') }]);
  assert.deepEqual(pick(un.segments[0].perStroke[0]), [null, null, null, null, null, null, null]);
});

// I-184: sim.mjs gesture --count-only runs without a timing hold (a functional session, a --no-timing hold): no host
// gate, so its record and its printed line carry counts only, never a timing number (no ms, no tau, no frame log)
const TIMING_KEY = /Ms$|[a-z]S$|Hz$|^p\d+$|^gt\d+|^bands$|^motion$|^swings$|^touchStart$|^sync$|^startWall$|^max$/;
function timingKeys(x, path = '') {
  if (Array.isArray(x)) return x.flatMap((v, i) => timingKeys(v, `${path}[${i}]`));
  if (!x || typeof x !== 'object') return [];
  return Object.entries(x).flatMap(([k, v]) => [...(TIMING_KEY.test(k) || (k === 'frames' && Array.isArray(v)) ? [`${path}.${k}`] : []), ...timingKeys(v, `${path}.${k}`)]);
}

test('I-184 countOnlySummary / countOnlyRun: counts kept (frames, touchmoves, prevented, toolbar transitions, pin, overscroll, flings), every timing number dropped', () => {
  const fr = [[0, 0, 5000, 775]];
  const at = (t, y, h = 775) => fr.push([t, Math.round((t - fr[fr.length - 1][0]) * 10) / 10, y, h]);
  at(20, 5000); at(40, 5100); at(90, 5250, 790); at(110, 5320, 815); at(130, 5240, 815); at(150, 5320, 815); at(200, 5230, 815); at(220, 5230, 815);
  const touches = [[30, 's', 1, 1, 0, 5000, 700, 29], [35, 'm', 1, 1, 1, 5000, 690, 34], [60, 'm', 1, 1, 0, 5100, 650, 59], [140, 'e', 0, 0, 0, 5240, 300, 139]];
  const seg = { docH: 6000, vh0: 775, href: 'http://127.0.0.1:5999/', frames: fr, touches, marks: [[25, 'go']], sync: { pageMs: 1 }, startWall: 2 };
  const strokes = [{ id: 's1', seg: 0, kin: { profile: 'fling', dir: 'up', px: 300, liftoffPxPerS: 900 }, sentAt: 1, returnedAt: 2, httpMs: 1 }];
  const full = summarizeRun([seg], strokes, { morph: [{ seg: 0, frames: [[0, 99, 5220, 1, ''], [1, 60, 5220, 1, 'm']] }] });
  assert.ok(timingKeys(full).length > 10, 'the full summary has timing numbers (the test would prove nothing otherwise)');
  const c = countOnlySummary(full);
  assert.deepEqual(timingKeys(c), [], 'no timing number in the count-only summary');
  assert.equal(c.countOnly, true);
  assert.deepEqual([c.segments[0].frames, c.segments[0].touchSequences, c.segments[0].strokes, c.segments[0].aligned], [full.segments[0].frames, 1, 1, true]);
  assert.deepEqual(c.touchmove, full.touchmove, 'touchmove counts and prevented ratios are counts');
  assert.deepEqual([c.toolbar.transitions, c.segments[0].toolbar.transitions, c.segments[0].toolbar.levels], [full.toolbar.transitions, full.segments[0].toolbar.transitions.length, full.segments[0].toolbar.levels]);
  assert.deepEqual([c.pin.reversals, c.pin.excursions, c.segments[0].pin.reversals], [full.pin.reversals, full.pin.excursions, full.segments[0].pin.reversals]);
  assert.ok(full.pin.reversals > 0, 'the fixture has a pin fight to count');
  assert.deepEqual(c.overscroll, full.overscroll);
  assert.deepEqual(c.momentum, { flings: full.momentum.flings });
  assert.deepEqual(c.morph, { frames: full.morph.frames }, 'morph: its frame count only');
  const p = c.segments[0].perStroke[0], q = full.segments[0].perStroke[0];
  assert.deepEqual([p.id, p.touchmoves, p.prevented, p.movingFrames, p.postReleaseTravelPx, p.firstMoveCancelable], [q.id, 2, 1, q.movingFrames, q.postReleaseTravelPx, 1]);
  // the raw run: no frame log (t, dt per rAF) and no morph frames; counts of both stay; touches and marks (event logs) stay
  const res = { segments: [seg], strokes, morph: [{ seg: 0, frames: [[0, 99]], summary: { p50: 1 } }], loops: 1, errors: [], aborted: null };
  const r = countOnlyRun(res);
  assert.deepEqual([r.segments[0].frames, r.segments[0].frameCount, r.segments[0].touches, r.segments[0].marks], [undefined, fr.length, touches, [[25, 'go']]]);
  assert.deepEqual(r.morph, [{ seg: 0, frameCount: 1 }]);
  assert.deepEqual(timingKeys(r.segments), []);
  assert.equal(res.segments[0].frames, fr, 'the input is not changed');
});
