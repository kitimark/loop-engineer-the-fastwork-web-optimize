// P-097 rev 4.1 shared library (counts and pixels only, no timing): arms from the immutable snapshot, servers with a
// served-hash check, the countdown code ranges, the Latin-square order, the M4 trace attribution (Chrome) and the
// page logger (step 2, Chrome and Simulator alike). Used by p097-census.mjs, p097-px.mjs, p097-sim.mjs, p097-score.mjs.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { READ } from './strip-read.mjs';

export { WT };
export const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
export const SNAP = join(WT, process.env.P097_SNAP || 'out/p097/snap-5c203b483c18');
export const OUT = join(WT, 'out/p097');
// registered in the addendum (rev 4.1 M4): $E's first line .. the line before `function fD(`, 1-based
export const RANGES = { C: [4215, 4559], V: [4215, 4598] };
// two rotated Latin squares, twice: rep 1..6 -> arm order
export const SQUARE = [['C', 'V', 'C2'], ['V', 'C2', 'C'], ['C2', 'C', 'V']];
export const orderOf = (rep) => SQUARE[(rep - 1) % 3];
export const dirOf = (arm) => arm.replace(/2$/, ''); // C2 serves the C directory (its own server, its own port)
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const HASHES = () => Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h]));

// the countdown range read from an arm's file; must equal RANGES (else the tool refuses: exit 3)
export function rangeOf(arm) {
  if (arm === 'B') return [1, 0]; // tool smoke on the plain baseline (test only): no countdown range
  const d = dirOf(arm), lines = readFileSync(join(SNAP, d, NODE), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('function $E(')) + 1, b = lines.findIndex((l) => l.startsWith('function fD('));
  if (a !== RANGES[d][0] || b !== RANGES[d][1]) throw Object.assign(new Error(`${arm}: countdown range ${a}-${b} != registered ${RANGES[d]}`), { code: 3 });
  return RANGES[d];
}

// a server on the snapshot copy: https (Chrome) or plain http (Simulator), port 0, --vendors=local, no latency (the
// frame-audit census conditions int-v8 used); served JS/CSS sha256 must equal HASHES.txt, else VOID (throws code 3)
export async function server(arm, { https = true, tag = '' } = {}) {
  // arm B (tool smokes only, ops 2026-10-05): the plain baseline, no overlay, hashes recorded and not checked
  const d = dirOf(arm), st = join(OUT, `serve-${arm}${tag}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), ...(arm === 'B' ? [] : ['--overlay', join(SNAP, d)]), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--no-cache', ...(https ? ['--https', '--no-http-twin'] : [])];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null;
  for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await new Promise((r) => setTimeout(r, 100)); }
  if (!s) { p.kill(); throw new Error(arm + ' server did not start'); }
  const url = `${https ? 'https' : 'http'}://localhost:${s.port}/`;
  if (https) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local self-signed mirror cert; hash check only
  const H = HASHES(), served = {};
  for (const f of [NODE, CSS]) {
    served[f] = sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer()));
    if (arm !== 'B' && served[f] !== H[`${d}/${f}`]) { p.kill(); throw Object.assign(new Error(`VOID ${arm}: serves ${f} ${served[f].slice(0, 12)} != ${String(H[`${d}/${f}`]).slice(0, 12)}`), { code: 3 }); }
  }
  return { p, url, port: s.port, served: { js: served[NODE].slice(0, 12), css: served[CSS].slice(0, 12) } };
}

// ---- M4 attribution on a Chrome trace (rev 4.1, applied to the trace alone) ----
// events: trace events (ph X for the timed ones). range: [lo, hi] 1-based lines of the countdown code. wins: [{label, a, b}]
// in trace us. Returns per window: census-rule counts (all threads), the page renderer main thread's frames split into
// countdown / other, countdown rAF callbacks, unframed tasks.
export const JSURL = /nodes\/2\.DyWL8TcE\.js/;
export function pageMain(events) {
  const names = new Map(); for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name);
  const n = new Map(); for (const e of events) if (e.name === 'FunctionCall' && JSURL.test(e.args?.data?.url || '')) { const k = `${e.pid}:${e.tid}`; n.set(k, (n.get(k) || 0) + 1); }
  const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { key: best[0], name: names.get(best[0]) || null } : null;
}
const TASKS = new Set(['TimerFire', 'FireAnimationFrame', 'FireIdleCallback', 'FunctionCall']);
export function attribute(events, range, wins) {
  const pm = pageMain(events); const K = pm ? pm.key : null;
  const on = (e) => `${e.pid}:${e.tid}` === K;
  const X = events.filter((e) => e.ph === 'X' && on(e));
  const isCdFc = (e) => e.name === 'FunctionCall' && JSURL.test(e.args?.data?.url || '') && e.args.data.lineNumber >= range[0] && e.args.data.lineNumber <= range[1];
  const cdFcs = X.filter(isCdFc).sort((a, b) => a.ts - b.ts);
  const within = (o, e) => e.ts >= o.ts && e.ts + (e.dur || 0) <= o.ts + (o.dur || 0);
  const hasCd = (o) => { // binary search the first countdown FunctionCall at or after o.ts
    let lo = 0, hi = cdFcs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cdFcs[m].ts < o.ts) lo = m + 1; else hi = m; }
    for (let i = lo; i < cdFcs.length && cdFcs[i].ts <= o.ts + (o.dur || 0); i++) if (within(o, cdFcs[i])) return true;
    return false;
  };
  // top-level tasks: TimerFire / FireAnimationFrame / FireIdleCallback / FunctionCall not inside another of them
  const cand = X.filter((e) => TASKS.has(e.name)).sort((a, b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0));
  const top = [];
  for (const e of cand) { const l = top[top.length - 1]; if (l && within(l, e)) continue; top.push(e); } // one thread: tasks nest, never overlap
  const prePage = X.filter((e) => e.name === 'PrePaint').sort((a, b) => a.ts - b.ts);
  const all = (name, a, b) => events.filter((e) => e.name === name && e.ts >= a && e.ts < b && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i')).length;
  const out = [];
  for (const w of wins) {
    const { a, b } = w, per = 1e6 / (b - a);
    const frames = prePage.filter((e) => e.ts >= a && e.ts < b);
    const cdFrames = new Set(); let unframed = 0, cdTasks = 0, cdUnframed = 0;
    for (const t of top) {
      const end = t.ts + (t.dur || 0); if (end < a || end >= b) continue; // a task belongs to its window by its end
      const cd = hasCd(t); if (cd) cdTasks++;
      const f = frames.find((p) => p.ts >= end);
      if (!f) { unframed++; if (cd) cdUnframed++; continue; }
      if (cd) cdFrames.add(f);
    }
    const cdRaf = X.filter((e) => e.name === 'FireAnimationFrame' && e.ts >= a && e.ts < b && hasCd(e)).length;
    const r1 = (n) => +(n * per).toFixed(2);
    out.push({ label: w.label, ms: Math.round((b - a) / 1000),
      census: { mainFrames: r1(all('PrePaint', a, b)), styleRecalc: r1(all('UpdateLayoutTree', a, b)), paint: r1(all('Paint', a, b)), rafFire: r1(all('FireAnimationFrame', a, b)), timerFire: r1(all('TimerFire', a, b)) },
      page: { mainFrames: r1(frames.length), countdownFrames: r1(cdFrames.size), otherFrames: r1(frames.length - cdFrames.size) },
      countdownRaf: cdRaf, countdownRafPer4s: +(cdRaf * 4e6 / (b - a)).toFixed(2), countdownTasks: cdTasks, unframed, countdownUnframed: cdUnframed });
  }
  return { pageMain: pm, windows: out };
}

// ---- rev 4.2 Q2b′: the roll-window classifier (Chrome trace alone; post-smoke, F-277) ----
// Anchors, 1-based lines found by their text in each arm's served file (registered in the addendum; must lie in the
// countdown range): S = the roll's start-frame rAF callback (`R0.F = requestAnimationFrame((t) => {`, one call per
// roll), F = the roll's finish handler (`Q.A[0].onfinish = () => Q === __crRoll && __crStop();`, one call per roll
// that runs to its end).
export const ANCHORS = { C: { S: 4305, F: 4264 }, V: { S: 4332, F: 4270 } };
const ANCHOR_TEXT = { S: 'R0.F = requestAnimationFrame((t) => {', F: 'Q.A[0].onfinish = () => Q === __crRoll && __crStop();' };
export function anchorsOf(arm) {
  if (arm === 'B') return { S: -1, F: -1 };
  const d = dirOf(arm), lines = readFileSync(join(SNAP, d, NODE), 'utf8').split('\n'), got = {};
  for (const k of ['S', 'F']) {
    const at = lines.map((l, i) => (l.trim() === ANCHOR_TEXT[k] ? i + 1 : 0)).filter(Boolean);
    if (at.length !== 1 || at[0] !== ANCHORS[d][k] || at[0] < RANGES[d][0] || at[0] > RANGES[d][1]) throw Object.assign(new Error(`${arm}: anchor ${k} at ${at} != registered ${ANCHORS[d][k]}`), { code: 3 });
    got[k] = at[0];
  }
  return got;
}
// Rule (frames = PrePaint events on the page main thread, in time order from `from` (trace us) to the last window's end;
// a frame's tasks = the top-level tasks (as M4) whose end lies after the previous frame's PrePaint and at or before
// this one's; a frame is M4-countdown when one of its tasks holds a countdown-range FunctionCall):
//   state open = 0 (rolls started and not finished), after = false.
//   per frame f: (1) if f has a tick task (a TimerFire task holding a countdown FunctionCall) and open > 0: leak += 1,
//   open = 0, after = false (a roll that did not finish before the next tick). (2) f is a roll frame when f is not
//   M4-countdown, f has no task at all, and (open > 0 or after). (3) open += the S calls in f's tasks; then for each F
//   call: open > 0 ? open -= 1 (matched) : orphan += 1. (4) after = (f had a matched F call and open == 0).
//   So the roll frames are the script-free frames from the roll start's frame to its finish frame, plus the one
//   script-free frame right after the finish frame (the restyle after the cancel). Script-carrying frames are never
//   roll frames; the finish frame itself is M4-countdown already.
// Per window: frames, countdown (M4), roll, other′ = frames - countdown - roll (per s), plus leak and orphan counts
// over the whole walk. Q2b′ is VOID for a load with any leak (it would move frames that are not a roll's own into roll).
export function rollClassify(events, range, anchors, wins, from) {
  const pm = pageMain(events); const K = pm ? pm.key : null;
  const on = (e) => `${e.pid}:${e.tid}` === K;
  const end = Math.max(...wins.map((w) => w.b));
  const X = events.filter((e) => e.ph === 'X' && on(e) && e.ts >= from - 5e5 && e.ts < end + 5e5);
  const isJs = (e) => e.name === 'FunctionCall' && JSURL.test(e.args?.data?.url || '');
  const line = (e) => e.args.data.lineNumber;
  const within = (o, e) => e.ts >= o.ts && e.ts + (e.dur || 0) <= o.ts + (o.dur || 0);
  const cand = X.filter((e) => TASKS.has(e.name)).sort((a, b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0));
  const top = []; for (const e of cand) { const l = top[top.length - 1]; if (l && within(l, e)) continue; top.push(e); }
  const fcs = X.filter(isJs).sort((a, b) => a.ts - b.ts);
  const inside = (t) => fcs.filter((e) => e.ts >= t.ts && e.ts <= t.ts + (t.dur || 0) && within(t, e));
  const frames = X.filter((e) => e.name === 'PrePaint' && e.ts >= from && e.ts < end).sort((a, b) => a.ts - b.ts);
  let open = 0, after = false, leak = 0, orphan = 0, ti = 0, prev = from;
  while (ti < top.length && top[ti].ts + (top[ti].dur || 0) <= from) ti++;
  const cls = new Map();
  for (const f of frames) {
    const mine = []; while (ti < top.length && top[ti].ts + (top[ti].dur || 0) <= f.ts) { const t = top[ti++]; if (t.ts + (t.dur || 0) > prev) mine.push(t); }
    prev = f.ts;
    const calls = mine.map((t) => ({ t, c: inside(t) }));
    const cd = calls.some(({ c }) => c.some((e) => line(e) >= range[0] && line(e) <= range[1]));
    const tick = calls.some(({ t, c }) => t.name === 'TimerFire' && c.some((e) => line(e) >= range[0] && line(e) <= range[1]));
    if (tick && open > 0) { leak++; open = 0; after = false; }
    const roll = !cd && mine.length === 0 && (open > 0 || after);
    cls.set(f, cd ? 'countdown' : roll ? 'roll' : 'other');
    const nS = calls.reduce((a, { c }) => a + c.filter((e) => line(e) === anchors.S).length, 0);
    const nF = calls.reduce((a, { c }) => a + c.filter((e) => line(e) === anchors.F).length, 0);
    open += nS;
    let matched = 0; for (let k = 0; k < nF; k++) open > 0 ? (open--, matched++) : orphan++;
    after = matched > 0 && open === 0;
  }
  const out = wins.map((w) => {
    const per = 1e6 / (w.b - w.a), n = { countdown: 0, roll: 0, other: 0 };
    for (const [f, c] of cls) if (f.ts >= w.a && f.ts < w.b) n[c]++;
    const r1 = (x) => +(x * per).toFixed(2);
    return { label: w.label, frames: r1(n.countdown + n.roll + n.other), countdown: r1(n.countdown), roll: r1(n.roll), otherPrime: r1(n.other) };
  });
  return { anchors, leak, orphan, valid: leak === 0, windows: out };
}

// ---- the page logger (step 2), same text in Chrome and WebKit ----
// rAF callback only posts a MessageChannel message; the read runs in that message task (after the frame's rAF
// callbacks, their microtasks and the rendering update). Per read: frame stamp t (the logger's rAF argument), tl
// (document.timeline.currentTime at the read), tr (performance.now at the read), m (the panel's --morph as the page
// writes it), the panel clock's per-digit ty (computed: a running Web Animation counts), cell animations (running /
// any), the timer's aria-label (changes once per tick), scrollY, the header's own animations (descriptive). Every new
// panel cell animation is recorded once per digit roll with its keyframes as strip-equivalent px (Q6's path).
// Driver: scrollIn(y0, y1) 10 px per frame (optional hold at m >= holdM until resume()), then armPull(P): at the first
// read whose aria-label differs from the one at arming, a pull of P px up at 10 px per frame starts in the next frame.
export const LOGGER = String.raw`(() => { if (window.__p097) return 'again'; ${READ}
  const panel = document.querySelector('.start-selling-morph-panel'), timer = panel && panel.querySelector('[role=timer]'), nav = document.querySelector('.start-selling-top-nav');
  if (!timer) return 'no panel timer';
  const strips = () => [...timer.querySelectorAll('.digit > .strip')];
  const L = window.__p097 = { rows: [], rolls: [], on: true, label0: null, pullArmed: false, pullFrom: -1, pullDone: false, scrollDone: false, held: false, holdM: null, cal: performance.now() };
  try { console.timeStamp && console.timeStamp('p097-cal'); } catch {}
  const seen = new WeakSet(); const ch = new MessageChannel(); let tF = 0, drive = null;
  ch.port1.onmessage = () => {
    if (!L.on) return;
    const ss = strips(); let running = 0, live = 0;
    const ty = ss.map((s, i) => { const c = cell(s); const cs = cellsOf(s);
      cs.forEach((el, k) => { for (const a of el.getAnimations()) { live++; if (a.playState === 'running') running++;
        if (!seen.has(a)) { seen.add(a); const last = L.rolls[L.rolls.length - 1];
          if (!(last && last.i === i && last.st === a.startTime)) { const kf = a.effect.getKeyframes(); L.rolls.push({ i, st: a.startTime, d: a.effect.getTiming().duration, c, at: L.rows.length,
            kf: kf.map((f) => [f.computedOffset ?? f.offset, +(pxOf(f.transform) - k * c).toFixed(4), f.easing || 'linear']) }); } } } });
      return +tyOf(s).toFixed(3); });
    const na = nav ? nav.getAnimations() : [];
    const row = { t: tF, tl: document.timeline.currentTime, tr: performance.now(), m: panel.style.getPropertyValue('--morph'), ty, running, live,
      label: timer.getAttribute('aria-label'), y: scrollY };
    if (na.length) row.nav = na.map((a) => (a.transitionProperty || a.animationName || 'anim') + ':' + a.playState).join(',');
    L.rows.push(row);
    if (L.pullArmed && L.pullFrom < 0 && row.label !== L.label0) { L.pullFrom = L.rows.length - 1; L.pullStart(); }
  };
  const loop = (t) => { if (!L.on) return; tF = t; if (drive) drive(t); ch.port2.postMessage(0); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  L.scrollIn = (y0, y1) => { scrollTo({ top: y0, behavior: 'instant' }); let y = y0;
    drive = () => { if (L.held) return; if (L.holdM !== null) { const m = +panel.style.getPropertyValue('--morph'); if (m >= L.holdM) { L.held = true; L.holdM = null; L.heldAt = L.rows.length; return; } }
      y = Math.min(y1, y + 10); scrollTo({ top: y, behavior: 'instant' }); if (y >= y1) { drive = null; L.scrollDone = true; } }; return 0; };
  L.resume = () => { L.held = false; return 0; };
  L.armPull = (P) => { L.label0 = timer.getAttribute('aria-label'); L.pullArmed = true; L.pullP = P; return L.label0; };
  L.pullStart = () => { let left = L.pullP; drive = () => { const s = Math.min(10, left); left -= s; scrollTo({ top: scrollY - s, behavior: 'instant' }); if (left <= 0) { drive = null; L.pullDone = true; } }; };
  return 'ok'; })()`;

// Q6 path: a roll's strip-equivalent offset (px) at timeline time t (keyframes with linear or per-keyframe
// cubic-bezier(1/3, y1, 2/3, y2) easing; x(s) = s for these control points, so y(s) is the Bernstein form)
export function pathAt(roll, t) {
  const x = Math.min(1, Math.max(0, (t - roll.st) / roll.d)), K = roll.kf;
  if (x <= K[0][0]) return K[0][1];
  for (let j = 1; j < K.length; j++) if (x < K[j][0] || j === K.length - 1) {
    const [x0, v0, e] = K[j - 1], s = Math.min(1, (x - x0) / (K[j][0] - x0)); let y = s;
    const m = /cubic-bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)/.exec(e);
    if (m) { const y1 = +m[2], y2 = +m[4]; y = 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s; }
    return v0 + (K[j][1] - v0) * y;
  }
  return K[K.length - 1][1];
}

// Q3 / Q6 from a logger record (rows, rolls). mid frames: m strictly between 0 and 1. hand-off: the first row with
// m < 1 in the pull whose previous row had a running panel cell animation; jump per rolling digit = |ty - path(t)|
// at that frame's stamp t (the roll the previous row ran, path from its keyframes). modelCheck: |ty - path(tl)| on the
// previous row (does the keyframe evaluation reproduce the computed value).
export function passFacts(L) {
  const rows = L.rows || [], mid = (r) => { const m = +r.m; return r.m !== '' && m > 0 && m < 1; };
  const midRows = rows.filter(mid);
  const segs = []; let cur = null;
  rows.forEach((r, i) => { if (mid(r)) { if (!cur) cur = { from: i, prevTr: i ? rows[i - 1].tr : null }; cur.to = i; cur.lastTr = r.tr; } else if (cur) { segs.push(cur); cur = null; } });
  if (cur) segs.push(cur);
  const out = { rows: rows.length, midRows: midRows.length, midRunning: midRows.reduce((a, r) => a + (r.running > 0 ? 1 : 0), 0), midLive: midRows.reduce((a, r) => a + (r.live > 0 ? 1 : 0), 0),
    segments: segs.map((s) => ({ from: s.from, to: s.to, prevTr: s.prevTr, lastTr: s.lastTr })), rolls: (L.rolls || []).length, pullFrom: L.pullFrom ?? -1 };
  const p0 = L.pullFrom ?? -1; out.handoff = null;
  if (p0 >= 0) for (let i = Math.max(1, p0); i < rows.length; i++) {
    if (!(+rows[i].m < 1)) continue;
    const prev = rows[i - 1];
    if (!(prev.running > 0)) { out.handoff = { row: i, met: false, why: 'no running roll in the frame before the first m < 1' }; break; }
    const rolls = (L.rolls || []).filter((r) => r.at <= i - 1).reduce((m, r) => m.set(r.i, r), new Map());
    const per = [...rolls.values()].filter((r) => r.st + r.d > prev.tl - 1e-6).map((r) => ({ digit: r.i, c: r.c, jumpPx: +Math.abs(rows[i].ty[r.i] - pathAt(r, rows[i].t)).toFixed(4),
      modelCheckPx: +Math.abs(prev.ty[r.i] - pathAt(r, prev.tl)).toFixed(4), runningAfter: rows[i].running }));
    out.handoff = { row: i, met: per.length > 0, m: rows[i].m, digits: per, maxJumpPx: per.length ? Math.max(...per.map((d) => d.jumpPx)) : null };
    break;
  }
  return out;
}

// ---- self-test (synthetic, no browser): M4 rules, pass facts, path evaluation ----
// sha256 prefixes (12) of every file a load's numbers depend on; every output records them, and the scorer voids a
// platform's reps when they change between rep 1 and the last rep (rev 4 voids: measurement code)
export const TOOL_FILES = ['fixes/cd-roll-ca/p097-lib.mjs', 'fixes/cd-roll-ca/p097-census.mjs', 'fixes/cd-roll-ca/p097-px.mjs', 'fixes/cd-roll-ca/p097-sim.mjs',
  'fixes/cd-roll-ca/strip-read.mjs', 'tools/serve.mjs', 'tools/lib/cdp.mjs', 'tools/lib/wip.mjs', 'tools/sim.mjs'];
export const toolShas = () => Object.fromEntries(TOOL_FILES.map((f) => [f, existsSync(join(WT, f)) ? sha(readFileSync(join(WT, f))).slice(0, 12) : null]));

// ---- shot loads (step 4), shared by p097-px.mjs (Chrome) and p097-sim.mjs (WebKit) ----
export const MREAD = `(() => { const p = document.querySelector('.start-selling-morph-panel'); return p ? p.style.getPropertyValue('--morph') : null; })()`;
export const PTIMER = `document.querySelector('.start-selling-morph-panel [role=timer]')`;
// the frozen-clock shim's range: `var UE = { stiffness` .. the line before `var lD = h(` (the spring, $E, the roll helpers)
export const shimRange = (arm) => { const l = readFileSync(arm === 'B' ? join(resolveTree('site-pretty'), NODE) : join(SNAP, dirOf(arm), NODE), 'utf8').split('\n');
  const a = l.findIndex((x) => x.startsWith('var UE = { stiffness')) + 1, b = l.findIndex((x) => x.startsWith('var lD = h(')); if (a < 1 || b <= a) throw new Error('shim range'); return [a, b]; };
// fix-cd-strip's clock shim (pixels.mjs / simpx.mjs, credit there). from: the first stack line to read (Chrome 2: its
// stack starts with 'Error': lines 2-3; WebKit lines 1-3, as simpx.mjs). Installed before load (Chrome, addScriptToEvaluateOnNewDocument) or after (WebKit)
export const freezeJs = (range, from, to) => `(() => { if (window.__step) return 'again'; const rDate = Date.now.bind(Date), rPerf = performance.now.bind(performance), rRaf = window.requestAnimationFrame.bind(window), rCaf = window.cancelAnimationFrame.bind(window);
  window.__vd = null; window.__vt = null; window.__vf = null; const Q = new Map(); let id = 1e9; window.__cdHits = 0;
  const fromCd = () => { const m = /nodes\\/2\\.DyWL8TcE\\.js:(\\d+):/.exec(new Error().stack.split('\\n').slice(${from}, ${to}).join(' ')); const ok = !!m && +m[1] >= ${range[0]} && +m[1] <= ${range[1]}; if (ok) window.__cdHits++; return ok; };
  Date.now = () => (window.__vd !== null && fromCd() ? window.__vd : rDate());
  performance.now = () => (window.__vt !== null && fromCd() ? window.__vt : rPerf());
  const tl = Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, 'currentTime');
  if (tl) Object.defineProperty(AnimationTimeline.prototype, 'currentTime', { configurable: true, get() { return window.__vf !== null && fromCd() ? window.__vf : tl.get.call(this); } });
  window.requestAnimationFrame = (cb) => { if (window.__vt !== null && fromCd()) { const k = ++id; Q.set(k, cb); return k; } return rRaf(cb); };
  window.cancelAnimationFrame = (k) => (Q.has(k) ? Q.delete(k) : rCaf(k));
  window.__step = (t) => { window.__vf = t; const cbs = [...Q.values()]; Q.clear(); for (const cb of cbs) cb(t); return cbs.length; };
  return 'ok'; })()`;
export const TARGET = Date.parse('2026-11-02T12:00:00+07:00');
export const nowFor = (r) => TARGET - r * 1000 + 500;
const Rs = (d, h, m, s) => d * 86400 + h * 3600 + m * 60 + s;
// settle at 3d 04h 12m 40s, the change to ...39 (ones 0 -> 9, tens 4 -> 3); 60 Hz frames; shots at frame MID (mid-roll,
// not under reduced motion) and REST, in Chrome and the Simulator alike
export const R0 = Rs(3, 4, 12, 40), R1 = Rs(3, 4, 12, 39), FR = 1000 / 60, MID = 8, REST = 90;
// digit state from computed transforms (a paused animation's value counts), as pixels.mjs STATE_M
export const STATE = `(() => { const t = ${PTIMER}; if (!t) return null; const ty = (x) => { const s = getComputedStyle(x).transform; return s && s !== 'none' ? new DOMMatrixReadOnly(s).m42 : 0; };
  return [...t.querySelectorAll('.digit.svelte-1quva9c')].map((d) => { const h = d.offsetHeight; const st = d.querySelector('.strip.svelte-1quva9c'); if (!st) return '?';
    const T = ty(st) + (parseFloat(st.style.top) || 0);
    return [...st.querySelectorAll('.cell.svelte-1quva9c')].map((c) => [c.textContent, (parseFloat(c.style.top) || 0) + ty(c) + T]).filter(([, y]) => Math.abs(y) < h - 0.001)
      .map(([x, y]) => x + '@' + (Object.is(+y.toFixed(3), -0) ? 0 : +y.toFixed(3)).toFixed(3)).sort().join(' '); }).join(' | '); })()`;
// pause every panel cell animation at currentTime = t - its virtual startTime (clamped to its end)
export const PAUSE_AT = (t) => `(() => [...${PTIMER}.querySelectorAll('.digit.svelte-1quva9c')].map((d) => {
  const A = [...d.querySelectorAll('.cell.svelte-1quva9c')].flatMap((c) => c.getAnimations()); if (!A.length) return null;
  A.forEach((a) => { if (a.__vst === undefined) a.__vst = a.startTime; });
  const st = A[0].__vst, dur = A[0].effect.getTiming().duration, ct = Math.min(${t} - st, dur);
  A.forEach((a) => { a.pause(); a.currentTime = ct; }); return [A.length, A.every((a) => a.__vst === st), +ct.toFixed(3), +dur.toFixed(3)]; }))()`;
// every other page animation paused at 0 (not the timers'), in every arm
export const FREEZE_OTHERS = `(() => { let n = 0; for (const a of document.getAnimations()) { const g = a.effect && a.effect.target; if (g && g.closest && g.closest('[role=timer]')) continue; a.pause(); a.currentTime = 0; n++; } return n; })()`;
export const FINISH_ALL = `(() => { for (const a of ${PTIMER}.getAnimations({ subtree: true })) try { a.finish(); } catch {} return 0; })()`;

// ---- pixels (Q5) ----
// PNG read (8-bit RGB/RGBA, not interlaced; simpx.mjs's reader) and a plain RGB writer (filter 0) for crops
export function png(buf) {
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  let o = 8, w, h, bpp, depth, inter; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; bpp = d[9] === 6 ? 4 : d[9] === 2 ? 3 : 0; inter = d[12]; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  if (depth !== 8 || !bpp || inter) throw new Error(`PNG format not handled: depth ${depth}, bpp ${bpp}, interlace ${inter}`);
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255; } }
  return { w, h, bpp, px };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
export function pngRGB(img) { // img {w, h, bpp, px} -> PNG buffer (RGB)
  const raw = Buffer.alloc(img.h * (img.w * 3 + 1));
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * img.bpp, j = y * (img.w * 3 + 1) + 1 + x * 3; raw[j] = img.px[i]; raw[j + 1] = img.px[i + 1]; raw[j + 2] = img.px[i + 2]; }
  const chunk = (type, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(img.w, 0); ih.writeUInt32BE(img.h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export function crop(img, r) { // r {x, y, w, h} in image px -> {w, h, bpp: 3, px}
  const out = Buffer.alloc(r.w * r.h * 3);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = ((r.y + y) * img.w + r.x + x) * img.bpp, j = (y * r.w + x) * 3; out[j] = img.px[i]; out[j + 1] = img.px[i + 1]; out[j + 2] = img.px[i + 2]; }
  return { w: r.w, h: r.h, bpp: 3, px: out };
}
const d3 = (p, q, i, j) => Math.max(Math.abs(p.px[i] - q.px[j]), Math.abs(p.px[i + 1] - q.px[j + 1]), Math.abs(p.px[i + 2] - q.px[j + 2]));
// T0: identical pixels (same size; any channel difference counts)
export function exact(A, B) {
  if (A.w !== B.w || A.h !== B.h) return { exact: false, sizeMismatch: [[A.w, A.h], [B.w, B.h]] };
  let n = 0, max = 0; for (let k = 0; k < A.w * A.h; k++) { const d = d3(A, B, k * A.bpp, k * B.bpp); if (d) { n++; if (d > max) max = d; } }
  return { exact: n === 0, diffPixels: n, maxDelta: max };
}
// PR-010 five numbers (fivenum.mjs's rules): B vs A with the A/A A2 vs A; fill = A's 3x3 neighbourhood spans <= 8 levels
// in every channel, else edge; beyond A/A = d(B, A) > 8 where d(A2, A) <= 8; share = beyond / frameDevicePx (the
// viewport's device pixels, as fivenum.mjs); area in CSS px^2 = beyond / dpr^2. T2 (wide): fillMax <= 64, edgeMax <= 128,
// share <= 0.5 %.
export function fiveNum(A, B, A2, frameDevicePx, dpr) {
  if (A.w !== B.w || A.h !== B.h || A.w !== A2.w || A.h !== A2.h) return { sizeMismatch: true, t2: false };
  let maxAll = 0, maxAA = 0, beyond = 0, edgeMax = 0, fillMax = 0, maxBeyond = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.bpp, d = d3(B, A, (y * B.w + x) * B.bpp, i), da = d3(A2, A, (y * A2.w + x) * A2.bpp, i);
    if (da > maxAA) maxAA = da; if (!d) continue; if (d > maxAll) maxAll = d;
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (let yy = Math.max(0, y - 1); yy <= Math.min(A.h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(A.w - 1, x + 1); xx++) {
      const j = (yy * A.w + xx) * A.bpp; for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], A.px[j + c]); hi[c] = Math.max(hi[c], A.px[j + c]); } }
    if (hi.every((h, c) => h - lo[c] <= 8)) fillMax = Math.max(fillMax, d); else edgeMax = Math.max(edgeMax, d);
    if (d > 8 && da <= 8) { beyond++; if (d > maxBeyond) maxBeyond = d; }
  }
  const sharePct = +(100 * beyond / frameDevicePx).toFixed(4);
  return { maxAll, maxAA, maxBeyond, edgeMax, fillMax, beyond, sharePct, areaCss: +(beyond / (dpr * dpr)).toFixed(1), t2: fillMax <= 64 && edgeMax <= 128 && sharePct <= 0.5 };
}
// Chrome Q5 rest / reduced-motion (M2, the 10-04 form): B vs A inside the clip, M-bg = every pixel outside the digit
// cards of both shots (cards: [x, y, w, h] CSS px relative to the clip, device rect floor(x*dpr) .. ceil((x+w)*dpr),
// grown by 0). Returns (i) diffs outside M-bg, (ii) max channel diff inside M-bg, and whether M-bg has any difference.
export function maskCompare(A, B, cardsA, cardsB, dpr) {
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: true, ok: false };
  const card = new Uint8Array(A.w * A.h);
  for (const [x, y, w, h] of [...cardsA, ...cardsB]) {
    const x0 = Math.max(0, Math.floor(x * dpr)), y0 = Math.max(0, Math.floor(y * dpr)), x1 = Math.min(A.w, Math.ceil((x + w) * dpr)), y1 = Math.min(A.h, Math.ceil((y + h) * dpr));
    for (let yy = y0; yy < y1; yy++) card.fill(1, yy * A.w + x0, yy * A.w + Math.max(x0, x1));
  }
  let outside = 0, bgMax = 0, bgN = 0;
  for (let k = 0; k < A.w * A.h; k++) { const d = d3(A, B, k * A.bpp, k * B.bpp); if (!d) continue; if (card[k]) outside++; else { bgN++; if (d > bgMax) bgMax = d; } }
  return { outsideMbg: outside, mbgMax: bgMax, mbgDiffPixels: bgN, mbgAny: bgN > 0, ok: outside === 0 && bgMax <= 1 };
}

export function selftest() {
  const ok = [], fail = (m) => { throw new Error('SELFTEST ' + m); };
  const M = (pid, tid, name) => ({ ph: 'M', name: 'thread_name', pid, tid, args: { name } });
  const X = (name, ts, dur, extra = {}) => ({ ph: 'X', pid: 1, tid: 1, name, ts, dur, ...extra });
  const FC = (ts, dur, line) => X('FunctionCall', ts, dur, { args: { data: { url: 'https://x/_app/immutable/nodes/2.DyWL8TcE.js', lineNumber: line, columnNumber: 1 } } });
  const ev = [M(1, 1, 'CrRendererMain'), M(2, 1, 'CrRendererMain'),
    // frame 1: a countdown rAF (two countdown calls in one FireAnimationFrame count once), its PrePaint
    X('FireAnimationFrame', 1000, 100), FC(1010, 10, 4326), FC(1050, 10, 4300), X('PrePaint', 1200, 10),
    // a tick (timer, countdown) between frames -> marks frame 2; a non-countdown rAF in frame 2
    X('TimerFire', 2000, 50), FC(2010, 20, 4476), X('FireAnimationFrame', 3000, 50), FC(3010, 10, 9000), X('PrePaint', 3200, 10),
    // frame 3: only other work; an iframe's PrePaint on another pid (census rule counts it, the page split does not)
    X('FireAnimationFrame', 5000, 50), FC(5010, 10, 12000), X('PrePaint', 5200, 10), { ...X('PrePaint', 5300, 10), pid: 2 },
    // a countdown task after the last PrePaint of the window: unframed
    X('TimerFire', 7000, 20), FC(7005, 5, 4476),
    // outside range (fD start) is not countdown
    X('FireAnimationFrame', 8000, 10), FC(8001, 5, 4560), X('PrePaint', 8100, 10)];
  const r = attribute(ev, [4215, 4559], [{ label: 'w', a: 0, b: 7500 }, { label: 'w2', a: 7500, b: 9000 }]);
  const w = r.windows[0], w2 = r.windows[1];
  const per = 1e6 / 7500;
  if (r.pageMain.key !== '1:1') fail('page main thread ' + r.pageMain.key);
  if (w.countdownRaf !== 1) fail('countdownRaf ' + w.countdownRaf); ok.push('two countdown calls in one rAF count once');
  if (Math.abs(w.page.mainFrames - 3 * per) > 0.01) fail('page frames ' + w.page.mainFrames); ok.push('page frames on the page main thread only');
  if (Math.abs(w.census.mainFrames - 4 * per) > 0.01) fail('census frames ' + w.census.mainFrames); ok.push('census rule counts every PrePaint');
  if (Math.abs(w.page.countdownFrames - 2 * per) > 0.01) fail('countdown frames ' + w.page.countdownFrames); ok.push('a tick between frames marks the next frame');
  if (Math.abs(w.page.otherFrames - 1 * per) > 0.01) fail('other frames ' + w.page.otherFrames);
  if (w.unframed !== 1 || w.countdownUnframed !== 1) fail('unframed ' + w.unframed); ok.push('a task with no later PrePaint in its window is unframed');
  if (w2.countdownRaf !== 0 || w2.page.countdownFrames !== 0) fail('range end'); ok.push('line 4560 (fD) is outside the countdown range');
  // pass facts: a roll running at m = 1, the pull's first m < 1 row hands over at the path value
  const roll = { i: 0, st: 100, d: 400, c: 31, at: 1, kf: [[0, 0, 'cubic-bezier(0.3333333333333333, 0.2, 0.6666666666666666, 0.5333333333333333)'], [0.5, -20, 'linear'], [1, -31, 'linear']] };
  const rows = [{ t: 90, tl: 90, tr: 95, m: '1', ty: [0], running: 0, live: 0 }, { t: 110, tl: 110, tr: 115, m: '1', ty: [+pathAt(roll, 110).toFixed(3)], running: 3, live: 3 },
    { t: 130, tl: 130, tr: 135, m: '0.989', ty: [+pathAt(roll, 130).toFixed(3) + 0.2], running: 0, live: 0 }, { t: 150, tl: 150, tr: 155, m: '1', ty: [-31], running: 0, live: 0 }];
  const pf = passFacts({ rows, rolls: [roll], pullFrom: 1 });
  if (!pf.handoff || !pf.handoff.met || Math.abs(pf.handoff.maxJumpPx - 0.2) > 0.002) fail('handoff ' + JSON.stringify(pf.handoff)); ok.push('hand-off jump = |ty - path(t)| at the first m < 1 frame');
  if (pf.midRows !== 1 || pf.midRunning !== 0) fail('mid rows'); ok.push('mid rows: 0 < m < 1 only');
  if (Math.abs(pathAt(roll, 400) - (-20 + (-11) * 0.5)) > 1e-9) fail('linear segment'); ok.push('linear keyframe segment');
  const q = 0.3, s = 0.5, yb = 3 * (1 - s) ** 2 * s * (2 * q / 3) + 3 * (1 - s) * s * s * (1 / 3 + 2 * q / 3) + s ** 3, yq = 2 * q * s + (1 - 2 * q) * s * s;
  if (Math.abs(yb - yq) > 1e-12) fail('bezier = quadratic'); ok.push("cubic-bezier(1/3, 2Q/3, 2/3, 1/3+2Q/3) equals the build's quadratic segment");
  // rev 4.2 roll-window classifier (anchors S 4332, F 4270, range V). Synthetic page, frames every 16.7 ms:
  const A = { S: 4332, F: 4270 }, RV = [4215, 4598], PP = (ts) => X('PrePaint', ts, 5);
  const ev2 = [M(1, 1, 'CrRendererMain'),
    PP(100), // f0 before any roll: other
    X('TimerFire', 900, 20), FC(905, 10, 4512), X('FireAnimationFrame', 950, 20), FC(955, 5, A.S), PP(1000), // f1 tick + roll start: countdown
    PP(1017), // f2 start commit, script-free, open: roll
    PP(1400), PP(1417), PP(1433), // f3-f5 last 40 ms, script-free: roll
    X('FunctionCall', 1440, 5, { args: { data: { url: 'https://x/_app/immutable/nodes/2.DyWL8TcE.js', lineNumber: A.F, columnNumber: 1 } } }), PP(1450), // f6 finish: countdown
    PP(1467), // f7 restyle after the cancel: roll (after)
    PP(1483), // f8 script-free, closed: other
    X('FireAnimationFrame', 1490, 5), FC(1491, 2, 12000), PP(1500), // f9 other script: other
    // second roll whose window holds a non-countdown task frame (other, never roll) and that never finishes: leak at the next tick
    X('TimerFire', 1900, 20), FC(1905, 10, 4512), X('FireAnimationFrame', 1950, 20), FC(1955, 5, A.S), PP(2000), // f10 countdown
    X('FunctionCall', 2005, 5, { args: { data: { url: 'https://x/other.js', lineNumber: 1, columnNumber: 1 } } }), PP(2017), // f11 other (has a task)
    PP(2033), // f12 roll (open)
    X('TimerFire', 2900, 20), FC(2905, 10, 4512), PP(3000), // f13 tick while open: leak, countdown
    PP(3017)]; // f14 closed: other
  const rc = rollClassify(ev2, RV, A, [{ label: 'a', a: 0, b: 1600 }, { label: 'b', a: 1600, b: 3100 }], 0);
  const cnt = (w, k) => Math.round(rc.windows[w][k] * (rc.windows[w].label === 'a' ? 1600 : 1500) / 1e6);
  if (cnt(0, 'countdown') !== 2 || cnt(0, 'roll') !== 5 || cnt(0, 'otherPrime') !== 3) fail('roll window a ' + JSON.stringify(rc.windows[0])); ok.push('roll window: start commit, last-40-ms frames and the frame after the finish are roll; the finish frame is countdown; frames before and after are other');
  if (cnt(1, 'countdown') !== 2 || cnt(1, 'roll') !== 1 || cnt(1, 'otherPrime') !== 2) fail('roll window b ' + JSON.stringify(rc.windows[1])); ok.push('a script-carrying frame inside a roll window stays other');
  if (rc.leak !== 1 || rc.valid || rc.orphan !== 0) fail('leak ' + JSON.stringify({ leak: rc.leak, orphan: rc.orphan })); ok.push('a roll not finished by the next tick is a leak and voids Q2b′');
  const rc0 = rollClassify(ev2.filter((e) => !(e.args?.data?.lineNumber === A.S)), RV, A, [{ label: 'a', a: 0, b: 1600 }], 0);
  if (Math.round(rc0.windows[0].roll * 1600 / 1e6) !== 0 || rc0.orphan !== 1) fail('no start ' + JSON.stringify(rc0)); ok.push('no roll start (C\'s spring): no roll frames; a finish without a start is an orphan');
  // pixels: a 12x6 image, flat 100 with a 3x3 'card' of 0..255 edges at (3,3) CSS px 1x1 at dpr 3
  const img = (f) => { const px = Buffer.alloc(12 * 6 * 3); for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) { const v = f(x, y); px.fill(v, (y * 12 + x) * 3, (y * 12 + x) * 3 + 3); } return { w: 12, h: 6, bpp: 3, px }; };
  const base = (x, y) => (x >= 3 && x < 6 && y >= 3 && y < 6 ? (x === 4 ? 255 : 0) : 100);
  const A0 = img(base), rt = png(pngRGB(A0));
  if (!exact(A0, rt).exact) fail('png round trip'); ok.push('PNG write/read round trip is exact');
  const Bbg = img((x, y) => (x === 0 && y === 0 ? 101 : base(x, y))), Bcard = img((x, y) => (x === 4 && y === 4 ? 254 : base(x, y))), Bbg2 = img((x, y) => (x === 0 && y === 0 ? 102 : base(x, y)));
  const cards = [[1, 1, 1, 1]];
  const m1 = maskCompare(A0, Bbg, cards, cards, 3), m2 = maskCompare(A0, Bcard, cards, cards, 3), m3 = maskCompare(A0, Bbg2, cards, cards, 3);
  if (!(m1.ok && m1.mbgAny && m1.mbgMax === 1)) fail('mask bg 1 ' + JSON.stringify(m1)); ok.push('M-bg: a +-1 background pixel is allowed and counted');
  if (m2.ok || m2.outsideMbg !== 1) fail('mask card ' + JSON.stringify(m2)); ok.push('M-bg: any difference inside a digit card breaks T0');
  if (m3.ok || m3.mbgMax !== 2) fail('mask bg 2 ' + JSON.stringify(m3)); ok.push('M-bg: a background difference of 2 breaks T0');
  const fA = img((x, y) => (x < 6 ? 0 : 200)), fB = img((x, y) => (x === 9 && y === 2 ? 130 : x === 5 && y === 2 ? 129 : x < 6 ? 0 : 200)), fA2 = fA;
  const fn = fiveNum(fA, fB, fA2, 72, 3);
  if (fn.fillMax !== 70 || fn.edgeMax !== 129 || fn.beyond !== 2 || fn.t2) fail('fiveNum ' + JSON.stringify(fn)); ok.push('five numbers: fill vs edge from A\'s 3x3 span, beyond A/A, T2 wide limits');
  if (!exact(A0, A0).exact || exact(A0, Bbg).exact) fail('exact'); ok.push('T0 exact');
  return ok;
}
