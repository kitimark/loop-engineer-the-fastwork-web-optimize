// countdown-faces: can a digit that skipped its frames while out of sight land on the original's (base's) path by
// replaying them on resume? A model check of the spring math only, no browser. It runs GE from the baseline's node 2
// (cut out of the file) and REPLAY below, the resume replay of the round-2 draft (not shipped).
// Result (review round 2): the replay is exact only on a regular frame grid. Real Chrome stamps are not regular (120 Hz
// gaps of 7.4-9.4 ms on a 0.1 ms grid, probe.mjs pixels `stamps`), and with that jitter the replay misses base by up to
// ~1.6 px; with dropped frames by up to 30 px. So the shipped PoC does not replay: out of sight it keeps base's rAF
// spring running (same frames, same steps) and only skips the state write; `headless` below models that (0 px by
// construction: the same GE calls with the same arguments).
//
// Model of the original: a target change at time T0 (inside a frame interval); the first rAF frame after it has
// stamp o1 (the first grid point after T0) and steps o1 - T0; every later frame steps one frame gap. Frames come on a
// regular display grid (60 or 120 Hz), optionally with stamps coarsened like Chrome's DOMHighResTimeStamp (100 us, 5 us),
// optionally with dropped frames.
// Model of the PoC: the digit is out of sight from the change; one probe rAF learns o1; it comes back in frame K
// (in-frame resume: the hero's scroll callback, __cdReplay(L, stamp_K, incl)); the next frames replay from scratch at
// their real stamp once, then step like the original. Also: two target changes while out of sight (the second roll
// starts from the first one's value at the last frame before its own o1, replayed lazily).
// Output: max |PoC - base| in px at a 34 px cell, over every resume frame and the 40 frames after it.
//   node fixes/countdown-faces/chain.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTree } from '../../tools/lib/paths.mjs';

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const cut = (src, start) => { // a top-level function from its header to its matching brace
  const i = src.indexOf(start); if (i < 0) throw new Error('not found: ' + start);
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(i, j + 1);
};
const base = readFileSync(join(resolveTree('site-pretty'), NODE), 'utf8');
// the round-2 draft's replay (see the README, "Why no replay")
const REPLAY = `function __cdReplay(L, u, incl) {
  if (u - L.at > 1e3) return { state: { value: L.to, velocity: 0 }, done: !0 };
  let o1 = L.o1 ?? (u > L.at ? u : null),
    t = { value: typeof L.from == 'number' ? L.from : __cdReplay(L.from, o1 ?? u, o1 === null).state.value, velocity: 0 };
  if (o1 === null) return { state: t, done: !1 };
  let m = Math.round((u - o1) / (__cdFrame || 1e3 / 60)), n = incl ? m : m - 1, d = !1, p = o1;
  if (n < 0) return { state: t, done: !1 };
  let r = GE(t, L.to, o1 - L.at);
  ((t = r.state), (d = r.done));
  for (let k = 1; !d && k <= n; k++) { let o = o1 + (k * (u - o1)) / m; ((r = GE(t, L.to, o - p)), (p = o), (t = r.state), (d = r.done)); }
  return { state: t, done: d };
}`;
const code = `var UE = { stiffness: 280, damping: 18, mass: 0.3 }, WE = 16, __cdFrame = 0;
${cut(base, 'function GE(')}
${REPLAY}
return { GE, replay: __cdReplay, setFrame: (f) => (__cdFrame = f) };`;
if (!base.includes('var UE = { stiffness: 280, damping: 18, mass: 0.3 },\n  WE = 16;')) throw new Error('spring constants changed');
const { GE, replay, setFrame } = new Function(code)();

const CELL = 34;
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const coarsen = (t, q) => (q ? Math.floor(t / q) * q : t);
// frame stamps after time `from`: a regular grid of period F with phase g0, coarsened, with optional drops
function frames(g0, F, from, n, q, dropEvery, jitter = 0) {
  const out = []; let k = Math.ceil((from - g0) / F + 1e-9);
  while (out.length < n) { if (!(dropEvery && k % dropEvery === 3)) out.push(coarsen(g0 + k * F + (jitter ? (rnd() * 2 - 1) * jitter : 0), q)); k++; }
  return out;
}
// base: a roll per change; changes = [[T, to]]; returns the value at each stamp
function baseRun(from, changes, stamps) {
  let t = { value: from, velocity: 0 }, n = 0, done = true, ci = 0, to = from; const vals = new Map();
  for (const o of stamps) {
    while (ci < changes.length && changes[ci][0] < o) { // a change happens between frames: restart from the current value
      t = { value: t.value, velocity: 0 }; n = changes[ci][0]; to = changes[ci][1]; done = false; ci++;
    }
    if (!done) { const s = GE(t, to, o - n); n = o; t = s.state; done = s.done; }
    vals.set(o, t.value);
  }
  return vals;
}
// PoC: hidden from the first change until resume stamp R (in-frame), then visible
function pocRun(from, changes, stamps, R) {
  let L = null; const vals = new Map();
  for (const [T, to] of changes) { // hidden changes: from = number or the previous L (lazy)
    L = { from: L === null ? from : T - L.at > 1e3 ? L.to : L, to, at: T, o1: null };
    L.o1 = stamps.find((o) => o > T); // the probe rAF's stamp
  }
  let t = null, n = 0, done = false;
  for (const o of stamps) {
    if (o < R) continue;
    if (o === R) { const r = replay(L, o, true); vals.set(o, r.state.value); done = r.done; if (done) t = r.state; continue; } // sync, in-frame
    if (done) { vals.set(o, t.value); continue; }
    const r = t === null ? replay(L, o, true) : GE(t, L.to, o - n); // first chain frame: replay from scratch
    n = o; t = r.state; done = r.done; vals.set(o, t.value);
  }
  return vals;
}
// shipped PoC: the spring runs on every real frame out of sight too (no write); on resume the current value is shown
function headlessRun(from, changes, stamps, R) {
  const all = baseRun(from, changes, stamps), vals = new Map();
  for (const [o, v] of all) if (o >= R) vals.set(o, v);
  return vals;
}
const cases = [['one step 5->4', 5, [4]], ['one step up 4->5', 4, [5]], ['wrap 0->-1 (ones 0 -> 9)', 0, [-1]], ['wrap 10->0 (ones 9 -> 0)', 9, [0]],
  ['two changes while hidden 40->39->38 (ones 0->9->8)', 10, [9, 8]]];
const rep = {};
for (const [hz, F] of [['60Hz', 1000 / 60], ['120Hz', 1000 / 120]]) for (const [qn, q] of [['exact stamps', 0], ['stamps coarsened 5us', 0.005], ['stamps coarsened 100us', 0.1]]) for (const [dn, drop, jit] of [['', 0, 0], [', 1 frame dropped in 7', 7, 0], [', stamps jittered +-1 ms (as measured in Chrome, round 2)', 0, 1]]) {
  if ((drop || jit) && q !== (jit ? 0.1 : 0)) continue;
  for (const [name, from, tos] of cases) {
    let max = 0, worst = null, n = 0, hmax = 0;
    for (let trial = 0; trial < 300; trial++) {
      const g0 = 1e6 + rnd() * F, T0 = g0 + 50 * F + rnd() * F; // the change: anywhere inside a frame interval
      const changes = [[T0, tos[0]]]; if (tos[1] !== undefined) changes.push([T0 + (3 + Math.floor(rnd() * 25)) * F + rnd() * F, tos[1]]);
      const stamps = frames(g0, F, T0 - 2 * F, 160, q, drop, jit);
      setFrame(F); // learned from an earlier visible roll
      const after = stamps.filter((o) => o > changes.at(-1)[0]);
      const R = after[Math.floor(rnd() * Math.min(after.length - 1, 1.2 * (1000 / F) * 0.6))]; // resume within ~0.7 s of the last change
      const b = baseRun(from, changes, stamps), p = pocRun(from, changes, stamps, R), hl = headlessRun(from, changes, stamps, R);
      for (const [o, v] of p) { const d = Math.abs(v - b.get(o)) * CELL; n++; if (d > max) { max = d; worst = { resumeFrame: after.indexOf(R), atFrame: stamps.indexOf(o) - stamps.indexOf(R) }; } }
      for (const [o, v] of hl) hmax = Math.max(hmax, Math.abs(v - b.get(o)) * CELL);
    }
    rep[`${name} | ${hz}, ${qn}${dn}`] = { replayMaxPx: +max.toExponential(2), shippedMaxPx: hmax, frames: n, worst };
  }
}
console.log('case'.padEnd(110), 'replay (draft)', ' shipped');
for (const [k, v] of Object.entries(rep)) console.log(k.padEnd(110), String(v.replayMaxPx).padStart(10), 'px', String(v.shippedMaxPx).padStart(4), 'px');
console.log(JSON.stringify(rep));
