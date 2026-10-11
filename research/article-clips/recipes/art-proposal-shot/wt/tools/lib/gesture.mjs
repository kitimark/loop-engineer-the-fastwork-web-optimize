// Gesture scripts for the real iPhone: compile a JSON script into W3C pointer action sequences that
// WebDriverAgent (XCUITest) plays back as real OS-level touches (research/architecture/finger-simulation.md
// §4.2). Pure: no I/O, no phone. tools/lib/wda.mjs sends the compiled strokes; tools/iphone.mjs `gesture`
// runs a compiled program (strokes over WDA, everything else over the WebKit Inspector Protocol).
//
// Script: {name, version, screen: [430, 932], params: {...}, steps: [...]}. Coordinates are screen points
// (= CSS px). Step types:
//   stroke  {dir: up|down (finger direction), px, ms, profile: minjerk|fling|still|drag, pressMs, holdMs, x, y}
//           drag: a slow constant-speed drag (U5): smooth 150 ms speed-up and slow-down (each covers half
//           the distance the plateau speed would) around a plateau of px / (ms - 150) px/ms for ms >= 600
//           (shorter: ramps of ms/4 each); ends at rest (no fling); kin.plateauPxPerS. 560 px in 4458 ms = 130 px/s
//   pause   {ms}                                  Mac-side sleep
//   until   {cond: atEnd|atTop|settled|"y>=N", timeoutMs, optional}   polls scrollY between strokes
//   reload  {scrollAfterMs}                       location.reload(), reconnect, wait, then scrollAfterMs
//   mark    {name}                                performance.mark in the page (and the recorder buffer)
//   repeat  {times, until?, steps}                without `until`: unrolled; with it: a runtime loop that
//                                                 stops as soon as the condition holds (checked before each pass)
// Any numeric field may be "$name" (a script param, overridable on the command line); any step may carry
// `when: {param: value, ...}` and is kept only when every listed param has that value (variants).
//
// Points (compiler v2, incident I-042): XCTest moves the finger linearly between the points of a path and
// emits its own touch samples in between (OBSERVED 2026-10-01: one 900 ms pointerMove gave touchmoves every
// 9 ms on the iPhone, every 17 ms on the Simulator). Each pointerMove costs XCTest ~120 ms of setup on the phone
// (~50 ms on the Simulator) before the touch starts, and segments shorter than ~25 ms are not played as written
// (17 ms: contact +31 %; 8 ms, compiler v1's one point per 120 Hz sample: the whole stroke collapsed into a
// ~50 ms flick, which is why every v1 G run was void). So a stroke is a piecewise-linear path: segments of at
// least SEG_MIN_MS (40), a new point only where a straight line would leave the profile by more than
// SEG_TOL_PX (1 px): ~15 points for a 900 ms minjerk, 4 for a 4.5 s drag (v1: 113 and 558).
//
// Guards (the compiler refuses the script):
// - safe zone x 140-290 / y 200-760: no edge swipes (back/forward), no status-bar tap (scroll to top),
//   no Safari bottom bar or home indicator;
// - pull-to-refresh: a `down` stroke (finger down, page scrolls up) needs a guaranteed scrollY >= max(300, px)
//   before it, from a static model of the script (reload/atTop -> 0, until y>=N -> N, an up drag of px adds
//   at least px - 15). The runner re-checks the real scrollY over WIP before every down stroke;
// - caps on px, ms, press/hold time and fling lift-off speed; px >= 40 so a stroke is never a tap.
import { createHash } from 'node:crypto';

export const COMPILER_VERSION = 2; // 2: piecewise-linear strokes of >= 40 ms segments (I-042); v1 hashes never compare
export const SCREEN = Object.freeze([430, 932]);
export const SAFE = Object.freeze({ x: Object.freeze([140, 290]), y: Object.freeze([200, 760]) });
export const SEG_MIN_MS = 40, SEG_TOL_PX = 1, SEG_GRID_MS = 4;
export const PULL_GUARD_Y = 300;
export const SLOP_PX = 15; // pan hysteresis: an up drag of px moves the page at least px - SLOP_PX
export const LIMITS = Object.freeze({
  px: [40, 560], ms: [40, 5000], pressMs: [0, 200], holdMs: [0, 4000], stillHoldMs: 150,
  liftoffPxPerS: 8000, contactMs: 8000, pauseMs: [0, 120000], untilTimeoutMs: [100, 60000],
  scrollAfterMs: [0, 10000], repeat: 50, ops: 2000,
});
export const DEFAULTS = Object.freeze({ x: 215, pressMs: 40, holdMs: 0, endY: 5000, untilTimeoutMs: 10000 });
const PROFILES = new Set(['minjerk', 'fling', 'still', 'drag']);
/** drag: each ramp lasts this long (at most a quarter of the stroke). */
export const DRAG_RAMP_MS = 150;
const STEP_TYPES = new Set(['stroke', 'pause', 'until', 'reload', 'mark', 'repeat']);

// ---- velocity profiles over normalised time u in [0, 1] (position as a fraction of px) ---------------
const mj = (u) => u * u * u * (10 - 15 * u + 6 * u * u); // minimum jerk (Flash & Hogan 1985)
const mjVel = (u) => 30 * u * u * (1 - u) * (1 - u);
const mjInt = (s) => s * s * s * s * (2.5 - 3 * s + s * s); // integral of mj over [0, s]; 1/2 at s = 1
const dragRamp = (ms) => Math.min(0.25, DRAG_RAMP_MS / (ms > 0 ? ms : 1));
// drag: velocity = vmax * mj(u / a) up the ramp, vmax on the plateau, mirrored down; vmax = 1 / (1 - a) so the
// area is 1 (a smoothstep ramp covers half of what the plateau speed would, like a linear one)
function dragPos(u, ms) {
  const a = dragRamp(ms), v = 1 / (1 - a);
  if (u < a) return v * a * mjInt(u / a);
  if (u > 1 - a) return 1 - v * a * mjInt((1 - u) / a);
  return v * (a / 2 + u - a);
}
function dragVel(u, ms) {
  const a = dragRamp(ms), v = 1 / (1 - a);
  if (u < a) return v * mj(u / a);
  if (u > 1 - a) return v * mj((1 - u) / a);
  return v;
}
/** Fraction of the stroke covered at u. fling = the first half of minjerk, stretched (peak speed at lift-off).
 *  drag needs the stroke's ms (its ramps are DRAG_RAMP_MS long). */
export function profilePos(profile, u, ms) {
  u = Math.min(1, Math.max(0, u));
  if (profile === 'drag') return dragPos(u, ms);
  return profile === 'fling' ? 2 * mj(u / 2) : mj(u);
}
/** d(position fraction)/du at u: minjerk/still/drag end at 0, fling peaks at u = 1 with 1.875, drag holds
 *  1 / (1 - a) on its plateau (a = the ramp's share of ms). */
export function profileVel(profile, u, ms) {
  u = Math.min(1, Math.max(0, u));
  if (profile === 'drag') return dragVel(u, ms);
  return profile === 'fling' ? mjVel(u / 2) : mjVel(u);
}

// ---- helpers ----------------------------------------------------------------------------------------
class ScriptError extends Error {}
const fail = (where, msg) => { throw new ScriptError(`gesture script: ${where}: ${msg}`); };
const r1 = (v) => Math.round(v * 10) / 10;

function resolveNum(v, params, where, field) {
  if (typeof v === 'string' && v.startsWith('$')) {
    const k = v.slice(1);
    if (!(k in params)) fail(where, `${field} refers to unknown param "${k}"`);
    v = params[k];
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `${field} must be a number (got ${JSON.stringify(v)})`);
  return v;
}
function inRange(v, [lo, hi], where, field) {
  if (v < lo || v > hi) fail(where, `${field} ${v} is outside ${lo}-${hi}`);
  return v;
}
function parseCond(c, params, where) {
  if (c === 'atEnd' || c === 'atTop' || c === 'settled') return { kind: c };
  const m = typeof c === 'string' && c.match(/^y>=(\$?[A-Za-z0-9_]+)$/);
  if (m) {
    const n = resolveNum(/^\$/.test(m[1]) ? m[1] : Number(m[1]), params, where, 'cond y>=N');
    return { kind: 'yGte', y: inRange(n, [1, 100000], where, 'cond y>=N') };
  }
  fail(where, `cond must be atEnd, atTop, settled or y>=N (got ${JSON.stringify(c)})`);
}
const condText = (c) => (c.kind === 'yGte' ? `y>=${c.y}` : c.kind);

/** Merge CLI overrides ("k=v" strings or an object) into the script's params. Numbers stay numbers. */
export function resolveParams(script, overrides = {}) {
  const p = { ...DEFAULTS, ...(script.params || {}) };
  for (const [k, v] of Object.entries(overrides)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) fail('params', `bad param name "${k}"`);
    p[k] = typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return p;
}

// ---- one stroke -> W3C actions ----------------------------------------------------------------------
/**
 * The stroke's points in time (ms from the start of the move, 0 and ms included): a piecewise-linear path that
 * stays within SEG_TOL_PX of the profile (checked every SEG_GRID_MS), every segment >= SEG_MIN_MS (a stroke shorter
 * than 2 * SEG_MIN_MS is one segment). Greedy: each segment is made as long as the tolerance allows, on a
 * SEG_GRID_MS grid, leaving at least SEG_MIN_MS for the rest. I-042: XCTest interpolates each segment itself.
 */
export function segmentTimes(profile, px, ms) {
  const pos = (t) => px * profilePos(profile, t / ms, ms);
  const fits = (a, b) => {
    const pa = pos(a), pb = pos(b);
    for (let t = a + SEG_GRID_MS; t < b; t += SEG_GRID_MS) if (Math.abs(pa + ((pb - pa) * (t - a)) / (b - a) - pos(t)) > SEG_TOL_PX) return false;
    return true;
  };
  const ts = [0];
  let a = 0;
  while (ms - a >= 2 * SEG_MIN_MS) {
    let b = a + SEG_MIN_MS;
    while (b + SEG_GRID_MS <= ms - SEG_MIN_MS && fits(a, b + SEG_GRID_MS)) b += SEG_GRID_MS;
    ts.push(b);
    a = b;
  }
  ts.push(ms);
  return ts;
}

/**
 * Compile one stroke (already resolved numbers) to {actions, kin}. The finger touches down at the start,
 * waits pressMs, moves along the profile through the points of segmentTimes(), waits holdMs, lifts. `dir` is
 * the finger's direction: up = the page scrolls down (scrollY grows).
 */
export function compileStroke(s, where = 'stroke') {
  const { dir, px, ms, profile, pressMs, holdMs, x } = s;
  if (dir !== 'up' && dir !== 'down') fail(where, `dir must be up or down (got ${JSON.stringify(dir)})`);
  if (!PROFILES.has(profile)) fail(where, `profile must be minjerk, fling, still or drag (got ${JSON.stringify(profile)})`);
  inRange(px, LIMITS.px, where, 'px');
  inRange(ms, LIMITS.ms, where, 'ms');
  inRange(pressMs, LIMITS.pressMs, where, 'pressMs');
  inRange(holdMs, LIMITS.holdMs, where, 'holdMs');
  if (profile === 'still' && holdMs < LIMITS.stillHoldMs) fail(where, `profile still needs holdMs >= ${LIMITS.stillHoldMs} (got ${holdMs})`);
  inRange(x, SAFE.x, where, 'x (safe zone)');
  const sign = dir === 'up' ? -1 : 1; // screen y of the finger: up = decreasing
  const mid = (SAFE.y[0] + SAFE.y[1]) / 2;
  const y0 = s.y ?? (mid - sign * px / 2);
  const y1 = y0 + sign * px;
  inRange(y0, SAFE.y, where, 'start y (safe zone)');
  inRange(y1, SAFE.y, where, 'end y (safe zone)');
  const contactMs = pressMs + ms + holdMs;
  if (contactMs > LIMITS.contactMs) fail(where, `pressMs + ms + holdMs = ${contactMs} exceeds ${LIMITS.contactMs}`);
  const ts = segmentTimes(profile, px, ms);
  const n = ts.length - 1;
  const acts = [
    { type: 'pointerMove', duration: 0, x: r1(x), y: r1(y0) },
    { type: 'pointerDown', button: 0 },
  ];
  if (pressMs > 0) acts.push({ type: 'pause', duration: pressMs });
  let t = 0, prevY = y0, lastV = 0, peakV = 0;
  for (let i = 1; i <= n; i++) {
    const d = ts[i] - ts[i - 1];
    t = ts[i];
    const y = r1(y0 + sign * px * profilePos(profile, t / ms, ms));
    lastV = Math.abs(y - prevY) / d; // px per ms over this sample
    peakV = Math.max(peakV, lastV);
    acts.push({ type: 'pointerMove', duration: d, x: r1(x), y });
    prevY = y;
  }
  if (holdMs > 0) acts.push({ type: 'pause', duration: holdMs });
  acts.push({ type: 'pointerUp', button: 0 });
  const actions = { actions: [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: acts }] };
  // A fling lifts off at speed; a minjerk/still/drag stroke has (almost) stopped. The last sample's speed is what
  // UIKit's velocity estimate sees; the analytic peak is 1.875 * px / ms.
  const liftoffPxPerS = Math.round((holdMs > 0 ? 0 : lastV) * 1000);
  if (liftoffPxPerS > LIMITS.liftoffPxPerS) fail(where, `lift-off speed ${liftoffPxPerS} px/s exceeds ${LIMITS.liftoffPxPerS} (make it longer or shorter in px)`);
  const kin = {
    dir, px, ms, profile, pressMs, holdMs, x: r1(x), y0: r1(y0), y1: r1(y1), moves: n, contactMs,
    peakPxPerS: Math.round(peakV * 1000), analyticPeakPxPerS: Math.round(1875 * px / ms), liftoffPxPerS,
  };
  // only drag strokes get the extra field: every other stroke's kin, and so the hash of a script without
  // drags, stays exactly as before the drag profile existed (COMPILER_VERSION stays 1)
  if (profile === 'drag') kin.analyticPeakPxPerS = kin.plateauPxPerS = Math.round((px * 1000) / (ms * (1 - dragRamp(ms))));
  return { actions, kin };
}

// ---- static scroll model for the pull-to-refresh guard ----------------------------------------------
// {lo, hi}: a guaranteed lower and a possible upper bound of scrollY. endY: a lower bound of the page's maxY.
function modelStroke(st, k, endY) {
  const { dir, px, profile } = k;
  if (dir === 'up') return { lo: Math.min(st.lo + Math.max(0, px - SLOP_PX), endY), hi: profile === 'fling' ? Infinity : st.hi + px };
  return { lo: profile === 'fling' ? 0 : Math.max(0, st.lo - px), hi: Math.max(0, st.hi - Math.max(0, px - SLOP_PX)) };
}
const pullNeed = (px) => Math.max(PULL_GUARD_Y, px);

// ---- script -> program ------------------------------------------------------------------------------
/**
 * Validate and compile a script. Returns {name, version, compiler, screen, params, ops, strokes, estMs, hash}.
 * `ops` is what the runner executes; `hash` (sha256 of name, version, compiler and ops) identifies the exact
 * stimulus: gesture numbers compare only between runs with the same hash.
 */
export function compileScript(script, { params: overrides = {} } = {}) {
  if (!script || typeof script !== 'object') fail('script', 'not an object');
  if (typeof script.name !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(script.name)) fail('script', 'name must be a short identifier');
  if (!Number.isInteger(script.version) || script.version < 1) fail('script', 'version must be a positive integer');
  if (!Array.isArray(script.screen) || script.screen[0] !== SCREEN[0] || script.screen[1] !== SCREEN[1]) fail('script', `screen must be [${SCREEN}] (iPhone 15 Pro Max points)`);
  if (!Array.isArray(script.steps) || !script.steps.length) fail('script', 'steps must be a non-empty array');
  const params = resolveParams(script, overrides);
  const endY = resolveNum(params.endY, params, 'params', 'endY');
  let nStroke = 0, nOps = 0;
  const strokes = [];

  const keep = (step, where) => {
    if (step.when === undefined) return true;
    if (!step.when || typeof step.when !== 'object') fail(where, 'when must be an object {param: value}');
    return Object.entries(step.when).every(([k, v]) => {
      if (!(k in params)) fail(where, `when refers to unknown param "${k}"`);
      return params[k] === v;
    });
  };

  // compile a list of steps from model state `st`; returns {ops, st}. `loop`: inside a runtime loop (a later
  // pass, whose down strokes the runner guards at run time). `dry`: only check and model, record nothing.
  function compileSteps(steps, st, path, loop, dry = false) {
    const ops = [];
    steps.forEach((step, i) => {
      const where = `${path}[${i}]${step && step.type ? ` (${step.type})` : ''}`;
      if (!step || typeof step !== 'object' || !STEP_TYPES.has(step.type)) fail(where, `unknown step type ${JSON.stringify(step && step.type)}`);
      if (!keep(step, where)) return;
      if (!dry && ++nOps > LIMITS.ops) fail(where, `more than ${LIMITS.ops} ops`);
      const num = (f, d) => (step[f] === undefined ? (d === undefined ? fail(where, `${f} is required`) : d) : resolveNum(step[f], params, where, f));
      switch (step.type) {
        case 'stroke': {
          const s = {
            dir: step.dir, px: num('px'), ms: num('ms'), profile: step.profile,
            pressMs: num('pressMs', resolveNum(params.pressMs, params, 'params', 'pressMs')),
            holdMs: num('holdMs', step.profile === 'still' ? Math.max(LIMITS.stillHoldMs, resolveNum(params.holdMs, params, 'params', 'holdMs')) : resolveNum(params.holdMs, params, 'params', 'holdMs')),
            x: num('x', resolveNum(params.x, params, 'params', 'x')),
            y: step.y === undefined ? undefined : num('y'),
          };
          const { actions, kin } = compileStroke(s, where);
          if (kin.dir === 'down' && st.lo < pullNeed(kin.px)) {
            if (!loop) fail(where, `pull-to-refresh guard: a down stroke of ${kin.px} px needs a guaranteed scrollY >= ${pullNeed(kin.px)} before it, but the script only guarantees ${Math.round(st.lo)} (precede it with until y>=N, or an up stroke)`);
            loop.runtimeGuarded = true; // later passes of a runtime loop: the runner's scrollY check ends the loop
          }
          if (!dry) {
            const id = `s${++nStroke}`;
            ops.push({ op: 'stroke', id, kin, minScrollY: kin.dir === 'down' ? pullNeed(kin.px) : null, actions });
            strokes.push({ id, ...kin });
          }
          st = modelStroke(st, kin, endY);
          break;
        }
        case 'pause':
          ops.push({ op: 'pause', ms: inRange(num('ms'), LIMITS.pauseMs, where, 'ms') });
          break;
        case 'until': {
          const cond = parseCond(step.cond, params, where);
          const timeoutMs = inRange(num('timeoutMs', resolveNum(params.untilTimeoutMs, params, 'params', 'untilTimeoutMs')), LIMITS.untilTimeoutMs, where, 'timeoutMs');
          const optional = step.optional === true;
          ops.push({ op: 'until', cond, timeoutMs, optional });
          if (!optional) {
            if (cond.kind === 'atTop') st = { lo: 0, hi: 0 };
            else if (cond.kind === 'atEnd') st = { lo: endY, hi: Infinity };
            else if (cond.kind === 'yGte') st = { lo: Math.max(st.lo, cond.y), hi: Math.max(st.hi, cond.y) };
          }
          break;
        }
        case 'reload':
          ops.push({ op: 'reload', scrollAfterMs: inRange(num('scrollAfterMs', 0), LIMITS.scrollAfterMs, where, 'scrollAfterMs') });
          st = { lo: 0, hi: 0 };
          break;
        case 'mark':
          if (typeof step.name !== 'string' || !/^[A-Za-z0-9:._-]{1,60}$/.test(step.name)) fail(where, 'name must be a short identifier');
          ops.push({ op: 'mark', name: step.name });
          break;
        case 'repeat': {
          const times = inRange(num('times'), [1, LIMITS.repeat], where, 'times');
          if (!Number.isInteger(times)) fail(where, 'times must be an integer');
          if (!Array.isArray(step.steps) || !step.steps.length) fail(where, 'steps must be a non-empty array');
          if (step.until === undefined) {
            for (let k = 0; k < times; k++) {
              const r = compileSteps(step.steps, st, `${where}#${k + 1}.steps`, loop, dry);
              ops.push(...r.ops); st = r.st;
            }
          } else {
            const until = parseCond(step.until, params, where);
            const ctx = { runtimeGuarded: false };
            const first = compileSteps(step.steps, st, `${where}.steps`, loop, dry); // first pass: statically checked
            // a later pass starts from the first pass's end state: down strokes that are no longer statically
            // safe are allowed there only because the runner checks scrollY first and ends the loop instead
            compileSteps(step.steps, first.st, `${where}.steps (pass 2)`, ctx, true);
            if (!dry) ops.push({ op: 'loop', max: times, until, runtimeGuarded: ctx.runtimeGuarded, body: first.ops });
            // after the loop: either the condition holds or up to `times` passes ran; keep the weaker bound
            const after = until.kind === 'atTop' ? { lo: 0, hi: first.st.hi } : first.st;
            st = { lo: Math.min(after.lo, first.st.lo, st.lo), hi: Math.max(after.hi, st.hi) };
          }
          break;
        }
      }
    });
    return { ops, st };
  }

  const { ops } = compileSteps(script.steps, { lo: 0, hi: 0 }, 'steps', null);
  if (!nStroke) fail('script', 'no strokes (check the when: variants)');
  const prog = { name: script.name, version: script.version, compiler: COMPILER_VERSION, screen: [...SCREEN], params, ops };
  prog.hash = createHash('sha256').update(JSON.stringify({ name: prog.name, version: prog.version, compiler: prog.compiler, ops })).digest('hex');
  prog.strokes = strokes;
  prog.estMs = estimateMs(ops);
  return prog;
}

/** Rough wall time of a program (strokes + pauses + 1 s per reload; until/loop count their minimum). */
export function estimateMs(ops) {
  let t = 0;
  for (const o of ops) {
    if (o.op === 'stroke') t += o.kin.contactMs + 60;
    else if (o.op === 'pause') t += o.ms;
    else if (o.op === 'reload') t += 3000 + o.scrollAfterMs;
    else if (o.op === 'loop') t += estimateMs(o.body);
  }
  return t;
}

/** Flat list of every action payload's pointer moves (for tests and the output's compiled-actions record). */
export function strokeOps(ops) {
  const out = [];
  for (const o of ops) { if (o.op === 'stroke') out.push(o); else if (o.op === 'loop') out.push(...strokeOps(o.body)); }
  return out;
}

export { ScriptError, condText };
