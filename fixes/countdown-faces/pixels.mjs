// countdown-faces (b) on the C stack (de-countdown): a copy of fixes/cd-roll-ca/pixels.mjs, used with credit (fix-cd-strip's
// harness, fix-cd-roll-ca's MOTION and RM modes). Changes: arms are out/countdown-faces/snap/C (main + morph-inherit +
// cd-strip strip-tc + cd-roll-ca: JS 3d70edb5bf31, CSS 982a747d9263) and /V (C + "hide while unseen"), output goes to
// out/countdown-faces/; panelmid adds m = 0.9 (lead: the st6-rb2 panel diff at m 0.9 / 1); two new passes:
//   hold      (real clocks, first in its run): per clock, the mutations on the timer's subtree over 4 s while it is
//             hidden (hero at pastHero; panel at the end pin with the morph closed, m = 0), and its opacity product.
//             C snaps every tick (writes); V holds (expected 0 strip writes; the aria-label still updates).
//   panelshow the panel's show frame: at the end pin, morph closed (m = 0, panel opacity 0), the clock changes 40 -> 39
//             (virtual clock: C snaps, V holds), then the page's own driver opens the morph; every real frame for ~2 s
//             records the panel's opacity and digit state. Pass: every frame with opacity > 0 shows the settled target.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner countdown-faces -- \
//     node fixes/countdown-faces/pixels.mjs C,V hold,panelshow
//
// cd-roll-ca copy of fix-cd-strip's fixes/cd-strip/pixels.mjs (frozen-frame identity harness; its clock shim, state
// read, PNG diff and A/A order are fix-cd-strip's and de-countdown's, used with credit). Changes for cd-roll-ca: arms are
// the hash-pinned snapshots out/cd-roll-ca/snap/<arm> (C8 = cd-strip strip-tc, V9 = C8 + cd-roll-ca), output goes to
// out/cd-roll-ca/. Used for the reduced-motion exact check (RM=1): under reduced motion the V build never starts a Web
// Animation (it snaps, like the original), so the virtual clocks drive both arms alike.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner cd-roll-ca -- \
//     env RM=1 node fixes/cd-roll-ca/pixels.mjs C8,V9 hero,panel
// env MOTION=1 (review round 4 B2: Chrome mid-roll A/A with motion on, hero clock only): V's roll is Web Animations
// whose startTime is the virtual change time (performance.now from the countdown's lines is virtual). Before every shot
// each hero cell animation is paused at currentTime = the last stepped frame's stamp - its startTime (as simpx.mjs does;
// at or past its end: its last keyframe = the inline rest place), so V shows its path at the same frame stamps at which
// C's rAF spring was stepped. document.timeline.currentTime read from the countdown's lines returns the last stepped
// frame (the build reads it as "the last frame"). Digit state is then read from computed transforms (the paused
// animation's value; the inline transform in C). Per-frame state and the resume passes are skipped (V's cells only move
// when paused at a shot). Per shot it records how many hero animations were paused and whether each digit's cells
// share one startTime.
//   ... -- env MOTION=1 node fixes/cd-roll-ca/pixels.mjs C8,V9 hero
//   ... -- env MOTION=1 VW=1440 VH=900 DPR=1 MOBILE=0 FREEZE=1 SETTLE=4000 node fixes/cd-roll-ca/pixels.mjs C8,V9 hero
//
// cd-strip frozen-frame identity harness (T-030). Adapted from de-countdown's fixes/countdown-faces/probe.mjs
// `pixels` mode (virtual clocks for the countdown's own code, its rAF frames queued and stepped by the harness; credit
// de-countdown). Changes: both clocks (hero, morph panel), the strip's state read next to the faces', the face state of
// EVERY stepped frame (not only shot frames), instant scrolls (html has scroll-behavior: smooth), the target change
// mid-frame everywhere (T1 = grid + FR/3), the first real frame after an instant jump, A B .. A order (last = A/A).
//
//   node fixes/cd-strip/pixels.mjs [arms=st6rb2,strip,strip-a] [clocks=hero,panel]
// Arms: st6rb2 = fixes/st6-rb2/overlay (control), strip = fixes/cd-strip/overlay, strip-a = fixes/cd-strip--a/overlay,
// strip-cl = out/cd-strip/snap/strip-cl (measurement arm: strip + one layer per cell), orig = the baseline (no overlay). Counts lane only (no timing): run inside a chrome-measure hold, e.g.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner cd-strip -- node fixes/cd-strip/pixels.mjs
// Output: out/cd-strip/pixels-<stamp>.json + PNGs under out/cd-strip/pixels-<stamp>/.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));

const ARMS = (process.argv[2] || 'C,V').split(',');
const CLOCKS = (process.argv[3] || 'hero,panel').split(',');
const OUT = join(WT, 'out/countdown-faces'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const SNAP = join(WT, 'out/countdown-faces/snap');
const DIRS = { orig: null };
for (const a of (process.argv[2] || 'C,V').split(',')) if (a !== 'orig') DIRS[a] = join(SNAP, a);
// every served file of an arm must match out/cd-roll-ca/snap/HASHES.txt (a mismatch stops the run, exit 3)
const HASHES = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h]));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const log = (...a) => console.log(...a);
const fileOf = (arm, f) => (DIRS[arm] && existsSync(join(DIRS[arm], f)) ? join(DIRS[arm], f) : join(BASE, f));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);

async function server(label, overlay) {
  const st = join(OUT, `serve-px-${label}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(overlay ? ['--overlay', overlay] : []), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150', '--no-http-twin', '--no-cache'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(label + ' server did not start');
}
function cdRange(arm) {
  const lines = readFileSync(fileOf(arm, NODE), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1;
  const b = lines.findIndex((l) => l.startsWith('var lD = h(')) + 1;
  if (a < 1 || b <= a) throw new Error('countdown range not found for ' + arm);
  return [a, b - 1];
}
async function openPage(cdp, inject) {
  const page = await cdp.newIsolatedPage();
  page.errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') page.errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') page.errors.push(`console: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
  });
  // review r2: other widths / device pixel ratios via env VW, VH, DPR (default 430x932 DPR 3, mobile)
  await page.send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.VW || 430), height: Number(process.env.VH || 932), deviceScaleFactor: Number(process.env.DPR || 3), mobile: process.env.MOBILE !== '0' });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  // env RM=1 (PR-010 T2 "reduced motion exact", lead 2026-10-04): emulate prefers-reduced-motion: reduce in every arm
  if (process.env.RM === '1') await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: inject });
  await page.send('Page.bringToFront');
  return page;
}
// virtual clocks for calls from the countdown's own lines (as in countdown-faces probe.mjs)
const freeze = (range) => `(() => { const rDate = Date.now.bind(Date), rPerf = performance.now.bind(performance), rRaf = window.requestAnimationFrame.bind(window), rCaf = window.cancelAnimationFrame.bind(window);
  window.__vd = null; window.__vt = null; window.__vf = null; const Q = new Map(); let id = 1e9;
  const fromCd = () => { const m = /nodes\\/2\\.DyWL8TcE\\.js:(\\d+):/.exec(new Error().stack.split('\\n').slice(2, 4).join(' ')); return !!m && +m[1] >= ${range[0]} && +m[1] <= ${range[1]}; };
  Date.now = () => (window.__vd !== null && fromCd() ? window.__vd : rDate());
  performance.now = () => (window.__vt !== null && fromCd() ? window.__vt : rPerf());
  const tl = Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, 'currentTime');
  Object.defineProperty(AnimationTimeline.prototype, 'currentTime', { configurable: true, get() { return window.__vf !== null && fromCd() ? window.__vf : tl.get.call(this); } });
  window.requestAnimationFrame = (cb) => { if (window.__vt !== null && fromCd()) { const k = ++id; Q.set(k, cb); return k; } return rRaf(cb); };
  window.cancelAnimationFrame = (k) => (Q.has(k) ? Q.delete(k) : rCaf(k));
  window.__step = (t) => { const cbs = [...Q.values()]; Q.clear(); for (const cb of cbs) cb(t); return cbs.length; };
  window.__hidden = false;
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__hidden }); })();`;
const TARGET = Date.parse('2026-11-02T12:00:00+07:00');
const nowFor = (R) => TARGET - R * 1000 + 500;
function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function pxDiff(a, b) {
  const A = pngPixels(a), B = pngPixels(b);
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < A.px.length; i += A.bpp) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    if (d) { n++; const p = i / A.bpp, x = p % A.w, y = (p - x) / A.w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } max = Math.max(max, d); }
  return { w: A.w, h: A.h, diffPixels: n, maxChannelDelta: max, ...(n ? { bbox: [x0, y0, x1, y1] } : {}) }; // bbox in shot px
}
function colours(b64) { const A = pngPixels(Buffer.from(b64, 'base64')); const s = new Set(); for (let i = 0; i < A.px.length && s.size < 40; i += A.bpp) s.add(A.px.readUIntBE(i, 3)); return s.size; }
const R = (d, h, m, s) => d * 86400 + h * 3600 + m * 60 + s;
const SCENARIOS = [
  ['one step down (seconds 5 -> 4)', R(3, 4, 12, 35), R(3, 4, 12, 34)],
  ['one step up (seconds 4 -> 5, clock set back)', R(3, 4, 12, 34), R(3, 4, 12, 35)],
  ['ones wrap 0 -> 9 + tens 4 -> 3 (40 -> 39)', R(3, 4, 12, 40), R(3, 4, 12, 39)],
  ['ones wrap 9 -> 0 + tens 3 -> 4 (39 -> 40, up)', R(3, 4, 12, 39), R(3, 4, 12, 40)],
  ['carry 4 units (3d 04h 00m 00s -> 3d 03h 59m 59s)', R(3, 4, 0, 0), R(3, 3, 59, 59)],
  ['tens carry 10 -> 09', R(3, 4, 12, 10), R(3, 4, 12, 9)],
  ['two changes mid-roll (21 -> 20, then 20 -> 19 after 9 frames)', R(3, 4, 12, 21), R(3, 4, 12, 20), R(3, 4, 12, 19)],
];
const PHASES = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 34, 60];
const PHASES120 = [0, 1, 2, 4, 8, 12, 20, 30, 45, 68];
const RESUME_PH = [0, 1, 2, 3, 5, 8, 12, 20, 40];
const POSITIONS = `(() => { const H = document.documentElement.scrollHeight, vh = innerHeight, t = document.querySelector('.hero-track');
  const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh;
  return { heroExit: Math.round(vh), pastHero: Math.round(tb + 1.2 * vh), end: Math.max(0, H - vh) }; })()`;
const TIMER = { hero: `document.querySelector('.hero-copy [role=timer]')`, panel: `document.querySelector('.start-selling-morph-panel [role=timer]')` };
// review round 1 (B2): the hero clock at partial exit opacity (scrolled to a fraction of vh) and the panel clock mid-tween
// (--morph set by hand on the element that carries it, after the driven open; scale 0.96-1 and blur follow it)
TIMER.herofade = TIMER.hero; TIMER.panelmid = TIMER.panel; TIMER.heroresize = TIMER.hero; TIMER.hold = TIMER.hero; TIMER.panelshow = TIMER.panel;
// heroresize (de-breakpoints, T-034): load at VW/VH/DPR, then change the viewport live to each of env RESIZE
// ("375x812x3,1440x900x1x0": w x h x dpr [x mobile 0/1]) in turn, back at the top, then the short scenarios (cell size c
// changes with the breakpoint: 31 / 36 / 52 px; the strip must follow it without a reload)
const RESIZE = (process.env.RESIZE || '375x812x3,1440x900x1x0').split(',');
const VARIANTS = { hold: [null], panelshow: [null], hero: [null], panel: [null], herofade: process.env.FADES ? process.env.FADES.split(',').map(Number) : [0.25, 0.5, 0.75, 0.9], panelmid: process.env.MIDS ? process.env.MIDS.split(',').map(Number) : [0.25, 0.5, 0.75, 0.9], heroresize: RESIZE };
const EXTRA_SCEN = [0, 2, 6]; // one step down, ones wrap + tens, two changes mid-roll; 60 Hz only in the extra passes
// what the digits show: per digit, the faces/cells inside the cell (|offset| < 1 cell) as digit@offset px (3 decimals)
const STATE = (which) => `(() => { const t = ${TIMER[which]}; if (!t) return null; return [...t.querySelectorAll('.digit.svelte-1quva9c')].map((d) => { const h = d.offsetHeight; let v;
    const st = d.querySelector('.strip.svelte-1quva9c');
    if (st) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); const ty = (x) => Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(x.style.transform) || [])[1] || 0); v = [...st.querySelectorAll('.cell.svelte-1quva9c')].map((c) => [c.textContent, (parseFloat(c.style.top) || 0) + ty(c) + (c.parentElement === st ? 0 : (parseFloat(c.parentElement.style.top) || 0) + ty(c.parentElement)) + T]); }
    else v = [...d.querySelectorAll('.face.svelte-1quva9c')].map((f) => [f.textContent, Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(f.style.transform) || [])[1])]);
    return v.filter(([, y]) => Math.abs(y) < h - 0.001).map(([t, y]) => t + '@' + (Object.is(+y.toFixed(3), -0) ? 0 : +y.toFixed(3)).toFixed(3)).sort().join(' '); }).join(' | '); })()`;
const MOTION = process.env.MOTION === '1';
// MOTION: the digit state from computed transforms (a paused animation's value counts; tops and the strip's transform too)
const STATE_M = (which) => `(() => { const t = ${TIMER[which]}; if (!t) return null; const ty = (x) => { const s = getComputedStyle(x).transform; return s && s !== 'none' ? new DOMMatrixReadOnly(s).m42 : 0; };
  return [...t.querySelectorAll('.digit.svelte-1quva9c')].map((d) => { const h = d.offsetHeight; const st = d.querySelector('.strip.svelte-1quva9c'); if (!st) return '?';
    const T = ty(st) + (parseFloat(st.style.top) || 0);
    return [...st.querySelectorAll('.cell.svelte-1quva9c')].map((c) => [c.textContent, (parseFloat(c.style.top) || 0) + ty(c) + T]).filter(([, y]) => Math.abs(y) < h - 0.001)
      .map(([x, y]) => x + '@' + (Object.is(+y.toFixed(3), -0) ? 0 : +y.toFixed(3)).toFixed(3)).sort().join(' '); }).join(' | '); })()`;
// MOTION: pause every hero cell animation at currentTime = t - its virtual startTime (clamped to its end); per digit
// [cells, one startTime?, currentTime]
const PAUSE_AT = (t) => `(() => [...document.querySelectorAll('.hero-copy [role=timer] .digit.svelte-1quva9c')].map((d) => {
  const A = [...d.querySelectorAll('.cell.svelte-1quva9c')].flatMap((c) => c.getAnimations()); if (!A.length) return null;
  A.forEach((a) => { if (a.__vst === undefined) a.__vst = a.startTime; });
  const st = A[0].__vst, dur = A[0].effect.getTiming().duration, ct = Math.min(${t} - st, dur);
  A.forEach((a) => { a.pause(); a.currentTime = ct; }); return [A.length, A.every((a) => a.__vst === st), +ct.toFixed(3)]; }))()`;
const OPACITY = (which) => `(() => { let op = 1; for (let e = ${TIMER[which]}; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity; return op; })()`;

async function run(cdp, arm, url, dir, range) {
  const page = await openPage(cdp, freeze(range));
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(2500);
  // env SETTLE=<ms>: wait longer after load (desktop widths: the whole clock still moved by a sub-pixel between runs at
  // 2.5 s even with FREEZE=1, G14b 08-54Z; after a live resize, later in the page's life, it did not)
  if (process.env.SETTLE) await sleep(Number(process.env.SETTLE));
  const shots = {}, state = {}, frames = {}, firstVisible = {}, info = {};
  const twoFrames = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20))))';
  const go = (y) => page.eval(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), ${twoFrames})`);
  const pause = (ms) => page.eval(`new Promise((r) => setTimeout(r, ${ms}))`);
  const step = (t) => page.eval(`(${MOTION ? `window.__vf = ${t}, ` : ''}window.__step(${t}), 0)`);
  const tick = (t, r, extra = '') => page.eval(`(window.__vt = ${t}, window.__vd = ${nowFor(r)}, ${extra} document.dispatchEvent(new Event('visibilitychange')), new Promise((r) => setTimeout(r, 30)))`);
  const J = (k) => (((k * 7919) % 21) - 10) / 10; // frame jitter in [-1, 1] ms on a 0.1 ms grid
  let T = 5e6;
  const settle = async (r) => { T += 1e6; await tick(T, r); await step(T + 1e4); await pause(30); await step(T + 2e4); await pause(30); };
  const pos = await page.eval(POSITIONS); info.pos = pos;
  info.reducedMotion = await page.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
  if (process.env.RM === '1' && info.reducedMotion !== true) throw new Error(arm + ': RM=1 but the page does not match prefers-reduced-motion: reduce');
  for (const which of CLOCKS) for (const variant of VARIANTS[which]) {
    let clip;
    const vkey = variant === null ? which : `${which} v=${variant}`;
    if (which === 'hold') {
      // real clocks (no tick() has run in this page yet): mutations under each hidden timer over 4 s
      const MO = (sel) => `new Promise((res) => { const t = ${sel}; if (!t) return res(null); const c = { attr: {}, text: 0, list: 0 };
        const mo = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') { const k = (m.target.className && String(m.target.className).split(' ')[0]) + '@' + m.attributeName; c.attr[k] = (c.attr[k] || 0) + 1; } else if (m.type === 'characterData') c.text++; else c.list++; } });
        mo.observe(t, { subtree: true, attributes: true, characterData: true, childList: true }); setTimeout(() => { mo.disconnect(); res(c); }, 4000); })`;
      if (await page.eval('window.__vd') !== null) throw new Error('hold must run before any virtual clock');
      await go(pos.pastHero); await pause(1500);
      info.hold = { hero: { opacity: await page.eval(OPACITY('hero')), scrollY: await page.eval('scrollY'), mutations: await page.eval(MO(TIMER.hero)) } };
      // real-clock resume (the stopped clock's stored time is ~5.5 s old in a paused build): back to y 0, per real frame
      // the hero copy's opacity, the shown remaining seconds (data-value of the 4 numbers) minus the true remaining
      // seconds at that frame (ceil((target - now) / 1 s)); the original lags by 0 or 1 (its last 1 s fire); strips running
      // a Web Animation are counted (a roll through skipped seconds would show here)
      await page.eval(`(() => { window.__rf = []; const hc = document.querySelector('.hero-copy'); let n = 0;
        const rec = () => requestAnimationFrame(() => setTimeout(() => { const t = ${TIMER.hero}; const v = [...t.querySelectorAll('[data-value]')].map((x) => +x.getAttribute('data-value'));
          const shown = v.length === 4 ? v[0] * 86400 + v[1] * 3600 + v[2] * 60 + v[3] : null, now = Math.max(0, Math.ceil((${TARGET} - Date.now()) / 1e3));
          window.__rf.push([+getComputedStyle(hc).opacity, shown === null ? null : shown - now, [...t.querySelectorAll('.strip')].filter((s) => s.getAnimations({ subtree: true }).length).length]); if (++n < 60) rec(); }, 0)); rec(); return 0; })()`);
      await go(0); await pause(1200);
      const rf = await page.eval('window.__rf'), fi = rf.findIndex(([op]) => op > 0);
      info.hold.heroResume = { frames: rf.length, firstVisible: fi, lagAtFirstVisible: fi < 0 ? null : rf[fi][1], lags: [...new Set(rf.filter(([op]) => op > 0).map(([, l]) => l))], maxRollingStrips: Math.max(0, ...rf.filter(([op]) => op > 0).map(([, , r]) => r)) };
      await go(pos.end); await pause(3000); await go(pos.end); await pause(2500);
      info.hold.panel = { opacity: await page.eval(OPACITY('panel')), present: await page.eval(`!!${TIMER.panel}`), mutations: await page.eval(MO(TIMER.panel)) };
      log(arm, 'hold', JSON.stringify(info.hold));
      continue;
    }
    if (which === 'panelshow') {
      await go(pos.end); await pause(3000); await go(pos.end); await pause(2500);
      const [a0, a1] = [R(3, 4, 12, 40), R(3, 4, 12, 39)];
      await settle(a0);
      info.panelshow = { closedOpacity: await page.eval(OPACITY('panel')), before: await page.eval(STATE('panel')) };
      T += 1e6; await tick(T + 5, a1); await step(T + 1e4); await pause(30); await step(T + 2e4); await pause(30);
      info.panelshow.hiddenAfterChange = await page.eval(STATE('panel'));
      await page.eval(`(() => { window.__pf = []; let n = 0; const rec = () => requestAnimationFrame(() => setTimeout(() => { window.__pf.push([+(${OPACITY('panel')}).toFixed(4), ${STATE('panel')}]); if (++n < 150) rec(); }, 0)); rec();
        return typeof window.__fwMorphDrive === 'function' && (window.__fwMorphDrive({ hold: 1e9, cycles: 1 }), true); })()`);
      await pause(3500);
      // the virtual clock never advanced: a countdown rAF (a spring) would stay queued and freeze its start value; count them
      const pf = await page.eval('window.__pf');
      const vis = pf.filter(([op]) => op > 0);
      info.panelshow.frames = pf.length; info.panelshow.visibleFrames = vis.length;
      info.panelshow.firstVisible = pf.findIndex(([op]) => op > 0);
      info.panelshow.visibleStates = [...new Set(vis.map(([, st]) => st))];
      info.panelshow.allStates = [...new Set(pf.map(([, st]) => st))];
      info.panelshow.queuedCountdownRaf = await page.eval(`window.__step(${T + 3e4})`);
      log(arm, 'panelshow', JSON.stringify({ ...info.panelshow, allStates: undefined }));
      continue;
    }
    if (which === 'panel' || (which === 'panelmid' && !info.panelReady)) {
      // mount the panel and open the morph (end pin), then freeze the page's CSS/WAAPI animations at t=0 in every arm
      await go(pos.end); await pause(3000); await go(pos.end); await pause(2500);
      // open the morph and keep it open (m = 1: panel opacity 1, scale 1, no blur) through the page's own driver path
      // (E(1) after the pin; the hold outlasts the pass). Without it the panel stays at m = 0, invisible (opacity 0).
      info.morphDriven = await page.eval(`(typeof window.__fwMorphDrive === 'function' && (window.__fwMorphDrive({ hold: 1e9, cycles: 1 }), true))`);
      await pause(3500);
      // census of what gets frozen: kind, name (animation or transition property), target, play state
      info.panelAnimCensus = await page.eval(`(() => { const m = {}; for (const x of document.getAnimations()) { const t = x.effect && x.effect.target; const k = [x.constructor.name, x.animationName || x.transitionProperty || x.id || '', t ? (t.tagName + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(' ').slice(0, 2).join('.')) : '-', x.playState].join(' '); m[k] = (m[k] || 0) + 1; } return m; })()`);
      info.panelAnims = await page.eval(`(() => { const a = document.getAnimations(); for (const x of a) { x.pause(); x.currentTime = 0; } return a.length; })()`);
      await pause(300); info.panelReady = true;
    } else if (which === 'herofade') { await go(Math.round(variant * pos.heroExit)); await pause(300);
      // the hero scene's state here (scene-pause rule, review round 2 B1) and the strip/cell/face will-change
      info[vkey + ' scene'] = await page.eval(`(() => { const s = document.querySelector('.hero-copy') && document.querySelector('.hero-copy').closest('[data-start-selling-scene]'); const d = document.querySelector('.hero-copy .strip.svelte-1quva9c, .hero-copy .face.svelte-1quva9c'); const c = document.querySelector('.hero-copy .cell.svelte-1quva9c'); return [s && s.getAttribute('data-start-selling-scene'), s && s.getAttribute('data-start-selling-render'), d && getComputedStyle(d).willChange, c && getComputedStyle(c).willChange].join(' '); })()`); }
    else if (which === 'hero') await go(0);
    else if (which === 'heroresize') {
      const [w, h, dpr, mob] = String(variant).split('x').map(Number);
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: mob !== 0 });
      await pause(1500); await go(0); await pause(800);
      info[vkey + ' cell'] = await page.eval(`(() => { const t = ${TIMER.hero}; const d = t && t.querySelector('.digit.svelte-1quva9c'); return d ? [innerWidth, devicePixelRatio, d.offsetHeight] : null; })()`);
    }
    // env FREEZE=1: also pause the page's CSS/WAAPI animations at t=0 for the hero passes (desktop widths: animated
    // backdrop inside the clock's crop made even the A/A differ in 214 of 259 shots, G14 08-27Z)
    if (process.env.FREEZE === '1' && (which === 'hero' || which === 'herofade' || which === 'heroresize')) {
      info[vkey + ' frozen'] = await page.eval(`(() => { const a = document.getAnimations(); for (const x of a) { x.pause(); x.currentTime = 0; } return a.length; })()`);
      await pause(300);
    }
    if (which === 'panelmid') {
      // the open, frozen panel: set m by hand on the element that carries --morph, let any transition finish, freeze again
      info[vkey + ' set'] = await page.eval(`(() => { const e = [...document.querySelectorAll('*')].find((x) => x.style.getPropertyValue('--morph') !== ''); if (!e) return null; e.style.setProperty('--morph', '${variant}'); return e.className.toString().slice(0, 60); })()`);
      await pause(1500);
      info[vkey + ' running'] = await page.eval(`(() => { const a = document.getAnimations().filter((x) => x.playState === 'running'); for (const x of a) { x.pause(); x.currentTime = 0; } return a.length; })()`);
      await pause(300);
    }
    info[vkey] = { opacity: await page.eval(OPACITY(which)), present: await page.eval(`!!${TIMER[which]}`), scrollY: await page.eval('scrollY'),
      panel: which.startsWith('panel') ? await page.eval(`(() => { const p = document.querySelector('.start-selling-morph-panel'); if (!p) return null; const s = getComputedStyle(p); return { transform: s.transform, filter: s.filter, opacity: s.opacity }; })()`) : undefined };
    if (!info[vkey].present) { log(arm, vkey, 'timer not found'); continue; }
    clip = await page.eval(`(() => { const r = ${TIMER[which]}.getBoundingClientRect(); return { x: r.left + scrollX - 4, y: r.top + scrollY - 4, width: r.width + 8, height: r.height + 8, scale: 1 }; })()`);
    info[vkey].clip = clip;
    const fname = variant === null ? which : typeof variant === 'string' ? `${which}${variant}` : `${which}${Math.round(variant * 100)}`;
    const shot = async (key, file, ft) => {
      if (MOTION && ft !== undefined) (info.motion ||= {})[key] = await page.eval(PAUSE_AT(ft));
      await page.eval(twoFrames);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
      shots[key] = data; state[key] = await page.eval(MOTION ? STATE_M(which) : STATE(which));
      writeFileSync(join(dir, `${arm}-${fname}-${file}.png`), Buffer.from(data, 'base64'));
    };
    const fstep = async (key, t) => { await step(t); if (!MOTION) (frames[key] ||= []).push(await page.eval(STATE(which))); };
    const extra = variant !== null;
    for (const [hz, FR, phases] of extra ? [[60, 1000 / 60, [0, 2, 4, 8, 15, 30, 60]]] : [[60, 1000 / 60, PHASES], [120, 1000 / 120, PHASES120]]) {
      for (const [si, [name, r0, r1, r2]] of SCENARIOS.entries()) {
        if (extra ? !EXTRA_SCEN.includes(si) : hz === 120 && si >= 4 && si !== 6) continue;
        const key0 = `${vkey} @${hz}Hz ${name}`;
        await settle(r0);
        const G = T + 1e5; await tick(G + FR / 3, r1); // the change lands a third of a frame after a frame
        let k = 0;
        const second = r2 !== undefined ? (hz === 60 ? 9 : 18) : -1;
        for (const ph of phases) {
          while (k < ph) { k++; await fstep(key0, G + k * FR + J(k)); if (k === second) await tick(G + k * FR + FR / 3, r2); }
          await shot(`${key0} | frame ${ph}`, `${hz}-${si}-f${String(ph).padStart(3, '0')}`, ph === 0 ? G : G + ph * FR + J(ph));
        }
        while (k < phases.at(-1) + 20) { k++; await fstep(key0, G + k * FR + J(k)); }
        await step(G + 1e5); T = G + 1e5;
      }
    }
    if (which !== 'hero' || MOTION) continue;
    // resume: hide, change mid-frame, frames run, instant jump back; first real frame with the hero copy visible is read
    // right after it was produced; then shots at +0.. frames
    const REC = `(() => { window.__ff = []; const hc = document.querySelector('.hero-copy'); let n = 0;
      const rec = () => requestAnimationFrame(() => setTimeout(() => { window.__ff.push([+getComputedStyle(hc).opacity, ${STATE('hero')}]); if (++n < 12) rec(); }, 0)); rec(); return 0; })()`;
    const HIDES = { 'fade-out at y=vh': () => go(pos.heroExit), 'scroll away (past hero)': () => go(pos.pastHero) };
    const [a0, a1] = [R(3, 4, 12, 40), R(3, 4, 12, 39)];
    let ri = 0;
    for (const [hz, FR, Ks] of [[60, 1000 / 60, [6, 15, 40]], [120, 1000 / 120, [12, 40]]]) for (const [hname, hide] of Object.entries(HIDES)) for (const K of Ks) {
      const name = `hero resume @${hz}Hz: ${hname}, back ${K} frames after 40 -> 39`;
      T += 1e6; await tick(T + FR / 3, a0); for (let k = 1; k <= 40; k++) await step(T + k * FR); await step(T + 1e4); await pause(30); await step(T + 2e4); await pause(30);
      const G = T + 1e5; await hide(); await pause(200);
      await tick(G + FR / 3, a1);
      let k = 0; while (k < K) { k++; await step(G + k * FR + J(k)); }
      const vf = G + (K + 1) * FR + J(K + 1);
      await page.eval(`(window.__vf = ${vf}, window.__vt = ${vf + FR / 4}, window.__step(${vf}), ${REC})`); k = K + 1;
      await go(0); await pause(250);
      const ff = await page.eval('window.__ff'); const i = ff.findIndex(([op]) => op > 0);
      firstVisible[name] = i < 0 ? null : { frame: i, opacity: ff[i][0], faces: ff[i][1] };
      await page.eval('(window.__vf = null, 0)');
      await pause(800);
      const k0 = k;
      for (const ph of RESUME_PH) { while (k < k0 + ph) { k++; await step(G + k * FR + J(k)); } await shot(`${name} | +${ph}`, `resume-${String(ri).padStart(2, '0')}-p${String(ph).padStart(2, '0')}`); }
      await step(G + 1e5); T = G + 1e5; ri++;
    }
  }
  const errors = page.errors; await page.close();
  return { arm, shots, state, frames, firstVisible, info, errors };
}

// env ORDER=a,b,c,a,c,b,a: an explicit interleaved run order (arms may repeat; run i is labelled <arm>-r<i>), and every
// pair of runs is compared (not only run 0 vs the rest); without it: ARMS then ARMS[0] again (the A/A)
const ORDER = process.env.ORDER ? process.env.ORDER.split(',') : null;
const order = ORDER || [...ARMS, ARMS[0]];
const servers = {}, ranges = {}, served = {};
for (const arm of ARMS) { ranges[arm] = cdRange(arm); servers[arm] = await server(arm, DIRS[arm]); served[arm] = { js: sha(fileOf(arm, NODE)), css: sha(fileOf(arm, CSS)) };
  if (DIRS[arm]) for (const f of [NODE, CSS]) { const want = HASHES[`${arm}/${f}`]; const got = createHash('sha256').update(readFileSync(join(DIRS[arm], f))).digest('hex'); if (want !== got) { console.error(`VOID ${arm}/${f}: ${got.slice(0, 12)} != pinned ${String(want).slice(0, 12)}`); process.exit(3); } } }
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile-pixels') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { arms: ARMS, clocks: CLOCKS, viewport: { w: Number(process.env.VW || 430), h: Number(process.env.VH || 932), dpr: Number(process.env.DPR || 3), mobile: process.env.MOBILE !== "0" }, reducedMotion: process.env.RM === '1', motion: MOTION, ranges, served, browser: ch.browser, startedAt: new Date().toISOString(), load1: [loadavg()[0]] };
const dir = join(OUT, `pixels-${STAMP}`); mkdirSync(dir, { recursive: true });
const got = [];
try {
  for (let i = 0; i < order.length; i++) { const arm = order[i]; got.push(await run(cdp, ORDER ? `${arm}-r${i}` : arm + (i === order.length - 1 ? '-again' : ''), servers[arm].url, dir, ranges[arm])); res.load1.push(loadavg()[0]); }
} finally { cdp.close(); await ch.close(); for (const s of Object.values(servers)) s.p.kill(); }
const cmp = (x, y) => {
  const shots = Object.keys(x.shots).map((k) => ({ key: k, sameState: x.state[k] === y.state[k], ...(x.state[k] === y.state[k] ? {} : { states: [x.state[k], y.state[k]] }),
    identicalBytes: x.shots[k] === y.shots[k], ...(x.shots[k] === y.shots[k] ? {} : y.shots[k] ? pxDiff(Buffer.from(x.shots[k], 'base64'), Buffer.from(y.shots[k], 'base64')) : { missing: true }) }));
  let fN = 0, fDiff = []; for (const k of Object.keys(x.frames)) (x.frames[k] || []).forEach((s, i) => { fN++; if (s !== y.frames[k]?.[i]) fDiff.push([k, i, s, y.frames[k]?.[i]]); });
  const fv = Object.keys(x.firstVisible).map((k) => ({ key: k, same: JSON.stringify(x.firstVisible[k]) === JSON.stringify(y.firstVisible[k]), a: x.firstVisible[k], b: y.firstVisible[k] }));
  return { shots: shots.length, shotsDifferPx: shots.filter((s) => !s.identicalBytes).length, shotsDifferState: shots.filter((s) => !s.sameState).length, differing: shots.filter((s) => !s.identicalBytes || !s.sameState),
    frames: fN, framesDifferState: fDiff.length, frameDiffs: fDiff.slice(0, 20), firstVisible: fv.length, firstVisibleDiffer: fv.filter((f) => !f.same) };
};
res.blankShots = Object.entries(got[0].shots).filter(([, s]) => colours(s) < 2).map(([k]) => k);
res.info = got.map((g) => [g.arm, g.info]); res.errors = got.map((g) => [g.arm, g.errors]);
res.compare = {};
for (let i = 1; i < got.length; i++) res.compare[`${got[0].arm} vs ${got[i].arm}`] = cmp(got[0], got[i]);
if (ORDER) for (let i = 1; i < got.length; i++) for (let j = i + 1; j < got.length; j++) res.compare[`${got[i].arm} vs ${got[j].arm}`] = cmp(got[i], got[j]);
res.order = order;
res.endedAt = new Date().toISOString();
const f = join(OUT, `pixels-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res.compare)) log(k, ': shots', v.shots, 'px-differ', v.shotsDifferPx, 'state-differ', v.shotsDifferState, '| frames', v.frames, 'state-differ', v.framesDifferState, '| firstVisible', v.firstVisible, 'differ', v.firstVisibleDiffer.length,
  v.differing.length ? JSON.stringify(v.differing.slice(0, 6).map((d) => [d.key, d.diffPixels, d.maxChannelDelta, d.states])) : '');
log('blank shots', res.blankShots.length, 'errors', JSON.stringify(res.errors.filter(([, e]) => e.length)), 'info', JSON.stringify(res.info.map(([a, i]) => [a, i.hero?.opacity, i.panel?.opacity, i.panelAnims])));
log('wrote', f, 'load1', res.load1.map((x) => x.toFixed(1)).join(','));
