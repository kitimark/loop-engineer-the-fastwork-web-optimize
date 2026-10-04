// accent-ca shared helpers for chrome-counts.mjs (Chrome) and sim-counts.mjs (iOS Simulator, WebKit).
// Counts and frozen-frame pixels only, no timing. Arms are served from hashed, read-only snapshot copies in
// out/accent-ca/snap/<arm> (HASHES.txt; a mismatch is VOID, exit 3). The PNG reader, the crop and the marker
// calibration follow fixes/cd-roll-ca/simpx.mjs (fix-cd-strip's originals), used with credit.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';

export { WT };
export const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
export const SNAP = join(WT, 'out/accent-ca/snap');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export const HASHES = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h]));

// lines (1-based, inclusive) of the accent component HE in the served JS: `function HE(t, n) {` .. before `function HEflip`
export function heRange(arm) {
  const lines = readFileSync(join(SNAP, arm, NODE), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('function HE(t, n) {')) + 1;
  const b = lines.findIndex((l) => l.startsWith('function HEflip(')) + 1;
  if (a < 1 || b <= a) throw new Error('HE range not found for ' + arm);
  return [a, b - 1];
}

// serve one arm (baseline site-pretty + the arm's snapshot as overlay), no-cache, fresh port; hash-check what it serves
export async function serveArm(arm, outDir, { https = false } = {}) {
  const st = join(outDir, `serve-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'];
  if (https) args.push('--https');
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null;
  for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(arm + ' server did not start'); }
  const url = s.url || `${https ? 'https' : 'http'}://localhost:${s.port}/`;
  const get = async (f) => { const r = await fetch(new URL(f, url)); return sha(Buffer.from(await r.arrayBuffer())); };
  let served;
  try { served = { js: await get(NODE), css: await get(CSS) }; } catch (e) { p.kill(); throw e; }
  const ok = served.js === HASHES[`${arm}/${NODE}`] && served.css === HASHES[`${arm}/${CSS}`];
  return { p, port: s.port, url, ok, served: { js: served.js.slice(0, 12), css: served.css.slice(0, 12) } };
}

// ---- page side --------------------------------------------------------------------------------------------------
// Timer hold for HE's state machine (idle 1250/2200 ms -> draw-out 900 ms -> draw-in 900 ms). HE calls
// window.setTimeout / window.clearTimeout by name at every step, so a wrapper installed after load catches the next
// step. A call whose stack's first frames sit in HE's lines is kept in X.pending; while X.hold is on it is not started
// at all, and X.fire() runs it now (one state step). Every other setTimeout passes through untouched.
export const SHIM = (range) => `(() => { if (window.__acc) return 'again';
  const oST = window.setTimeout, oCT = window.clearTimeout;
  const X = window.__acc = { hold: false, pending: null, seq: 0, hits: 0, fired: 0 };
  const fromHE = () => { const m = /nodes\\/2\\.DyWL8TcE\\.js:(\\d+):/.exec(new Error().stack.split('\\n').slice(1, 5).join(' ')); return !!m && +m[1] >= ${range[0]} && +m[1] <= ${range[1]}; };
  window.setTimeout = function (fn, ms, ...a) {
    if (typeof fn === 'function' && fromHE()) { X.hits++; const rec = { id: 2e9 + ++X.seq, fn: () => fn(...a), ms };
      if (!X.hold) rec.real = oST.call(window, () => { if (X.pending === rec) X.pending = null; rec.fn(); }, ms);
      X.pending = rec; return rec.id; }
    return oST.call(window, fn, ms, ...a); };
  window.clearTimeout = function (id) { if (X.pending && X.pending.id === id) { if (X.pending.real) oCT.call(window, X.pending.real); X.pending = null; return; } return oCT.call(window, id); };
  X.fire = () => { const p = X.pending; if (!p) return false; if (p.real) oCT.call(window, p.real); X.pending = null; X.fired++; p.fn(); return true; };
  X.heldReady = () => !!X.pending && !X.pending.real;
  return 'ok'; })()`;

// accent helpers: state, the animations of the accent (inside em) and of its row (HEflip on the siblings), pausing
// at a time, running at 1e-6, the crop box (row + paint box, padded, clamped to the viewport)
export const HELP = `(() => { if (window.__ax) return 'again';
  const em = () => document.querySelector('em.script-accent');
  const cls = (t) => String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className || '');
  const all = () => { const e = em(); if (!e) return []; return document.getAnimations().filter((a) => { const t = a.effect && a.effect.target; return t && (e.contains(t) || (t.parentElement === e.parentElement && t !== e)); }); };
  const name = (a) => a.animationName || (a.effect && a.effect.target && a.effect.target.parentElement === em()?.parentElement ? 'flip' : a.id || 'waapi');
  const ofPhase = (ph) => all().filter((a) => (ph === 'idle') === /idle/.test(name(a)));
  window.__ax = {
    count: () => document.querySelectorAll('em.script-accent').length,
    st: () => { const e = em(); if (!e) return null; return { phase: e.classList.contains('is-idle') ? 'idle' : e.classList.contains('is-drawing-out') ? 'out' : e.classList.contains('is-drawing-in') ? 'in' : '?',
      label: e.getAttribute('aria-label'), svgs: e.querySelectorAll('svg').length, fills: e.querySelectorAll('.accent-fill').length }; },
    list: () => all().map((a) => [name(a), cls(a.effect.target).split(' ').slice(0, 2).join('.') || a.effect.target.tagName.toLowerCase(), a.playState]),
    finishAll: () => { let n = 0; for (const a of all()) { const end = a.effect.getComputedTiming().endTime; if (end !== Infinity) { a.playbackRate = 1; a.finish(); n++; } } return n; },
    pauseAt: (ph, t) => { const A = ofPhase(ph); A.forEach((a) => { a.pause(); a.currentTime = t; }); return A.length; },
    runSlow: (ph) => { let n = 0; for (const a of ofPhase(ph)) { const end = a.effect.getComputedTiming().endTime; if (a.currentTime < end) { a.playbackRate = 1e-6; a.play(); n++; } } return n; },
    states: (ph) => [...new Set(ofPhase(ph).map((a) => a.playState))],
    box: () => { const e = em(); const rs = [e.parentElement.getBoundingClientRect(), e.getBoundingClientRect(), e.querySelector('.paint').getBoundingClientRect()];
      const x0 = Math.max(0, Math.min(...rs.map((r) => r.left)) - 6), y0 = Math.max(0, Math.min(...rs.map((r) => r.top)) - 6);
      const x1 = Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + 6), y1 = Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)) + 6);
      return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - Math.floor(x0)), h: Math.ceil(y1 - Math.floor(y0)), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio }; },
    paintBox: () => { const r = em().querySelector('.paint').getBoundingClientRect(); return { w: r.width, h: r.height, dpr: devicePixelRatio }; },
    // computed style of everything in the accent (reduced-motion and frozen-frame cross-check)
    styles: () => { const e = em(); return [e, ...e.querySelectorAll('*')].map((n) => { const s = getComputedStyle(n); return [cls(n) || n.tagName, s.opacity, s.transform, s.strokeDashoffset, s.animationName, s.visibility, s.clipPath].join('|'); }); },
  };
  return 'ok'; })()`;

// the shot plan: (word, phase) targets in the order the cycle reaches them from the first word; times in ms
export const IDLE_T = [100, 199.9, 200.1, 300, 399.9, 400.1, 500, 599.9];
export const DRAW_T = [0, 150, 300, 450, 600, 750, 899];

// ---- pixels -----------------------------------------------------------------------------------------------------
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
// RGB crop {x, y, w, h} in image pixels
export function crop(img, r) {
  const out = Buffer.alloc(r.w * r.h * 3);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = ((r.y + y) * img.w + r.x + x) * img.bpp, j = (y * r.w + x) * 3; out[j] = img.px[i]; out[j + 1] = img.px[i + 1]; out[j + 2] = img.px[i + 2]; }
  return { w: r.w, h: r.h, px: out };
}
// tolerance report for one frame (research/pixel-tolerance §1): X old, Y new, X2 old again (A/A, or null).
// maxLevel over every pixel; beyond = channel diff > 8 where the A/A pixel differs by 8 or less; flat = 3x3
// neighbourhood in X varies by <= 2 levels; frameDevPx = whole viewport in device px; dpr for CSS px2.
export function tol(X, Y, X2, frameDevPx, dpr) {
  if (!X || !Y || X.w !== Y.w || X.h !== Y.h) return { sizeMismatch: [X && [X.w, X.h], Y && [Y.w, Y.h]] };
  const d = (A, B, i) => Math.max(Math.abs(A.px[i] - B.px[i]), Math.abs(A.px[i + 1] - B.px[i + 1]), Math.abs(A.px[i + 2] - B.px[i + 2]));
  const W = X.w, H = X.h; let max = 0, any = 0, beyond = 0, flat = 0, maxFlat = 0, maxEdge = 0, aaMax = 0, aaOver8 = 0; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const aaOk = X2 && X2.w === W && X2.h === H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, v = d(X, Y, i); if (v) any++; if (v > max) max = v;
    const a = aaOk ? d(X, X2, i) : 0; if (a > aaMax) aaMax = a; if (a > 8) aaOver8++;
    let lo = 255, hi = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = (yy * W + xx) * 3; for (let c = 0; c < 3; c++) { const q = X.px[j + c]; if (q < lo) lo = q; if (q > hi) hi = q; } }
    const isFlat = hi - lo <= 2;
    if (v) { if (isFlat) { if (v > maxFlat) maxFlat = v; } else if (v > maxEdge) maxEdge = v; }
    if (v > 8 && a <= 8) { beyond++; if (isFlat) flat++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return { maxLevel: max, diffPx: any, maxFlat, maxEdge, beyondPx: beyond, beyondFlatPx: flat, beyondPctFrame: +((100 * beyond) / frameDevPx).toFixed(5), beyondCssPx2: +(beyond / (dpr * dpr)).toFixed(1),
    bboxCss: beyond ? [x0, y0, x1, y1].map((v) => +(v / dpr).toFixed(1)) : null, aa: aaOk ? { maxLevel: aaMax, over8: aaOver8 } : null };
}
// worst-of summary over frames
export function summary(rows) {
  const R = rows.filter((r) => !r.sizeMismatch && r.maxLevel !== undefined);
  return { frames: rows.length, sizeMismatch: rows.length - R.length, framesDiffering: R.filter((r) => r.diffPx).length, framesBeyondAA: R.filter((r) => r.beyondPx).length,
    maxLevel: Math.max(0, ...R.map((r) => r.maxLevel)), maxFlat: Math.max(0, ...R.map((r) => r.maxFlat)), maxEdge: Math.max(0, ...R.map((r) => r.maxEdge)),
    maxBeyondPctFrame: Math.max(0, ...R.map((r) => r.beyondPctFrame)), maxBeyondCssPx2: Math.max(0, ...R.map((r) => r.beyondCssPx2)),
    aaMaxLevel: Math.max(0, ...R.map((r) => r.aa?.maxLevel || 0)) };
}

// Shoot the plan on a page whose SHIM + HELP are installed and whose HE timer is held (X.heldReady()). ev(expr) returns
// the value; shoot(box) returns an RGB crop {w, h, px} of the box (CSS px, viewport). targets: [[label, phase], ...]
// (phase idle | out | in). Per target and time: 'paused' (every animation of that phase paused at currentTime t: the
// main thread's value) and 'running' (the same, then playbackRate 1e-6 and play(): sampled by the compositor where
// the engine runs it there). onShot(key, crop) receives every shot. Returns per-target meta.
export async function shootPlan(ev, shoot, targets, onShot, { settle = 150, maxFires = 45, log = () => {} } = {}) {
  const done = new Set(), meta = {}; let fires = 0;
  const want = new Set(targets.map((t) => t.join('|')));
  while (done.size < want.size && fires <= maxFires) {
    const st = await ev('window.__ax.st()');
    const key = `${st.label}|${st.phase}`;
    if (want.has(key) && !done.has(key)) {
      const box = await ev('window.__ax.box()');
      const T = st.phase === 'idle' ? IDLE_T : DRAW_T; const m = { box, svgs: st.svgs, fills: st.fills, anims: await ev('window.__ax.list()'), perT: [] };
      for (const t of T) {
        const np = await ev(`window.__ax.pauseAt('${st.phase}', ${t})`); await sleep(settle);
        onShot(`${key}|${t}|paused`, await shoot(box));
        const nr = await ev(`window.__ax.runSlow('${st.phase}')`); await sleep(settle);
        const states = await ev(`window.__ax.states('${st.phase}')`);
        onShot(`${key}|${t}|running`, await shoot(box));
        m.perT.push([t, np, nr, states.join(',')]);
      }
      meta[key] = m; done.add(key); log(`shot ${key} (${T.length} x 2)`);
    }
    await ev('window.__ax.finishAll()');
    if (!(await ev('window.__acc.fire()'))) { log('no held timer to fire'); break; }
    fires++;
    for (let i = 0; i < 40 && !(await ev('window.__acc.heldReady()')); i++) await sleep(25);
    await sleep(settle);
  }
  return { meta, fires, missing: [...want].filter((k) => !done.has(k)) };
}
export const TARGETS = [['you', 'idle'], ['you', 'out'], ['คุณ', 'in'], ['คุณ', 'idle'], ['คุณ', 'out']];
