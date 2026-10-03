// cd-strip WebKit frozen-frame parity on the iOS Simulator (review round 1, B1; counts only, no timing).
// The countdown's own clocks are virtual (the pixels.mjs shim, installed after load: Date.now, performance.now,
// document.timeline.currentTime and requestAnimationFrame calls from the countdown's lines are redirected; its rAF
// frames are queued and stepped by this tool). Each shot is a real Simulator screenshot (`simctl io screenshot`, the
// composited screen, so WebKit's layers and backing stores are in it), cropped to the clock's rect (+4 CSS px).
// A magenta marker at a fixed CSS position calibrates the crop's screen offset for every pass.
// Passes: hero (y 0, rolling); panel at m = 1 and panelmid at m = 0.5 (__fwMorphDrive opens it, then m is set by
// hand and the panel's own transform/filter/opacity are pinned inline to the CSS rule's values for m; finite page
// animations finished, infinite ones paused at t = 0); fade50 / fade90 (hero scrolled to 0.5 / 0.9 of the viewport; fade50x = fade50 with 13 shots,
// clock fading out). Arms st6rb2, strip, then the first arm again (A/A), from out/cd-strip/snap/<arm> (hash-checked;
// a mismatch is VOID, exit 3); "<arm>+nowc" is a diagnostic arm (digit layer hints removed after load).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner cd-strip -- \
//     node tools/sim.mjs session --functional --owner cd-strip -- node fixes/cd-strip/simpx.mjs [arms] [passes]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/cd-strip/snap');
const ARMS = (process.argv[2] || 'st6rb2,strip').split(',');
const PASSES = (process.argv[3] || 'hero,panel,panelmid').split(',');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/cd-strip/simpx'); const DIR = join(OUT, STAMP); mkdirSync(DIR, { recursive: true });
const UDID = process.env.FW_SIM_UDID;
if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const sha = (b) => createHash('sha256').update(b).digest('hex');

function cdRange(arm) {
  const lines = readFileSync(join(SNAP, arm, NODE), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1;
  const b = lines.findIndex((l) => l.startsWith('var lD = h(')) + 1;
  if (a < 1 || b <= a) throw new Error('countdown range not found for ' + arm);
  return [a, b - 1];
}
// the pixels.mjs shim, for a page that is already loaded (WebKit stacks have no "Error" line: frames 2-3 are the caller)
const freeze = (range) => `(() => { if (window.__step) return 'again'; const rDate = Date.now.bind(Date), rPerf = performance.now.bind(performance), rRaf = window.requestAnimationFrame.bind(window), rCaf = window.cancelAnimationFrame.bind(window);
  window.__vd = null; window.__vt = null; window.__vf = null; const Q = new Map(); let id = 1e9; window.__cdHits = 0;
  const fromCd = () => { const m = /nodes\\/2\\.DyWL8TcE\\.js:(\\d+):/.exec(new Error().stack.split('\\n').slice(1, 4).join(' ')); const ok = !!m && +m[1] >= ${range[0]} && +m[1] <= ${range[1]}; if (ok) window.__cdHits++; return ok; };
  Date.now = () => (window.__vd !== null && fromCd() ? window.__vd : rDate());
  performance.now = () => (window.__vt !== null && fromCd() ? window.__vt : rPerf());
  const tl = Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, 'currentTime');
  if (tl) Object.defineProperty(AnimationTimeline.prototype, 'currentTime', { configurable: true, get() { return window.__vf !== null && fromCd() ? window.__vf : tl.get.call(this); } });
  window.requestAnimationFrame = (cb) => { if (window.__vt !== null && fromCd()) { const k = ++id; Q.set(k, cb); return k; } return rRaf(cb); };
  window.cancelAnimationFrame = (k) => (Q.has(k) ? Q.delete(k) : rCaf(k));
  window.__step = (t) => { const cbs = [...Q.values()]; Q.clear(); for (const cb of cbs) cb(t); return cbs.length; };
  return 'ok'; })()`;
const TARGET = Date.parse('2026-11-02T12:00:00+07:00');
const nowFor = (R) => TARGET - R * 1000 + 500;
const R = (d, h, m, s) => d * 86400 + h * 3600 + m * 60 + s;
const SCEN = {
  step: ['one step down (seconds 5 -> 4)', R(3, 4, 12, 35), R(3, 4, 12, 34)],
  wrap: ['ones wrap 0 -> 9 + tens 4 -> 3 (40 -> 39)', R(3, 4, 12, 40), R(3, 4, 12, 39)],
  wrapUp: ['ones wrap 9 -> 0 + tens 3 -> 4 (39 -> 40, up)', R(3, 4, 12, 39), R(3, 4, 12, 40)],
  two: ['two changes mid-roll (21 -> 20, then 20 -> 19 after 9 frames)', R(3, 4, 12, 21), R(3, 4, 12, 20), R(3, 4, 12, 19)],
};
const PLAN = { hero: [['step', [0, 2, 4, 8, 15, 30]], ['wrap', [0, 3, 6, 12, 30]], ['wrapUp', [3, 8]], ['two', [4, 10, 14, 30]]],
  panel: [['step', [0, 3, 8, 30]], ['wrap', [4, 12]]], panelmid: [['step', [0, 3, 8, 30]], ['wrap', [4, 12]]],
  fade50: [['step', [0, 4, 30]], ['two', [4, 30]]], fade90: [['step', [0, 4, 30]], ['two', [4, 30]]],
  // fade50x: the decisive fade50 rerun (lead, 03:3xZ): 13 shots, two-f30 included
  fade50x: [['step', [0, 4, 8, 15, 30, 45]], ['two', [4, 10, 14, 30, 45]], ['wrap', [6, 30]]] };
const TIMER = { hero: `document.querySelector('.hero-copy [role=timer]')`, panel: `document.querySelector('.start-selling-morph-panel [role=timer]')` };
TIMER.panelmid = TIMER.panel; TIMER.fade50 = TIMER.fade50x = TIMER.fadehunt = TIMER.fade90 = TIMER.herostatic = TIMER.variants = TIMER.hero;
const STATE = (which) => `(() => { const t = ${TIMER[which]}; if (!t) return null; return [...t.querySelectorAll('.digit.svelte-1quva9c')].map((d) => { const h = d.offsetHeight; let v;
    const st = d.querySelector('.strip.svelte-1quva9c');
    if (st) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); v = [...st.querySelectorAll('.cell.svelte-1quva9c')].map((c) => [c.textContent, parseFloat(c.style.top) + (c.parentElement === st ? 0 : parseFloat(c.parentElement.style.top) || 0) + T]); }
    else v = [...d.querySelectorAll('.face.svelte-1quva9c')].map((f) => [f.textContent, Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(f.style.transform) || [])[1])]);
    return v.filter(([, y]) => Math.abs(y) < h - 0.001).map(([t, y]) => t + '@' + (Object.is(+y.toFixed(3), -0) ? 0 : +y.toFixed(3)).toFixed(3)).sort().join(' '); }).join(' | '); })()`;

function png(buf) {
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  let o = 8, w, h, bpp, depth, inter, idat = [];
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
let shotN = 0;
function screenshot(tag) {
  const f = join(DIR, `${String(++shotN).padStart(4, '0')}-${tag}.png`);
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: ['ignore', 'ignore', 'pipe'] });
  return { f, img: png(readFileSync(f)) };
}
function crop(img, r) { // r in screen px: {x, y, w, h}; RGB only
  const out = Buffer.alloc(r.w * r.h * 3);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = ((r.y + y) * img.w + r.x + x) * img.bpp, j = (y * r.w + x) * 3; out[j] = img.px[i]; out[j + 1] = img.px[i + 1]; out[j + 2] = img.px[i + 2]; }
  return out;
}
const MARK = 40; // CSS px
async function calibrate(ev, tag) {
  await ev(`(() => { const d = document.createElement('div'); d.id = '__cdmark'; d.style.cssText = 'position:fixed;left:${MARK}px;top:${MARK}px;width:${MARK}px;height:${MARK}px;background:#ff00ff;z-index:2147483647;pointer-events:none'; document.body.appendChild(d); return 0; })()`);
  await sleep(250);
  const { img } = screenshot('cal-' + tag);
  await ev(`(document.getElementById('__cdmark')?.remove(), 0)`); await sleep(200);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * img.bpp; if (img.px[i] > 200 && img.px[i + 1] < 90 && img.px[i + 2] > 200) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  if (x1 < 0) throw new Error('marker not found in ' + tag);
  const s = (x1 - x0 + 1) / MARK, sy = (y1 - y0 + 1) / MARK;
  return { ox: x0 - MARK * s, oy: y0 - MARK * sy, s, sy, marker: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], screen: [img.w, img.h] };
}

// the hero clock's composited layers (faces, strips, cells): bounds, composited bounds, backing memory (LayerTree)
async function heroLayers(c) {
  try {
    await c.send('LayerTree.enable');
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const ids = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: '.hero-copy [role=timer] .face.svelte-1quva9c, .hero-copy [role=timer] .strip.svelte-1quva9c, .hero-copy [role=timer] .cell.svelte-1quva9c' })).nodeIds);
    const L = ((await c.send('LayerTree.layersForNode', { nodeId: root })).layers || []).filter((l) => ids.has(l.nodeId));
    const r = (b) => b && [b.x, b.y, b.width, b.height].map((v) => +(+v).toFixed(3));
    return { n: L.length, memoryMB: +(L.reduce((a, l) => a + (l.memory || 0), 0) / 1048576).toFixed(3), sample: L.slice(0, 3).map((l) => ({ b: r(l.bounds), cb: r(l.compositedBounds), mem: l.memory })) };
  } catch (e) { return { error: String(e.message || e) }; }
}
async function run(c, arm, range) {
  const ev = (e) => c.evaluate(e);
  const res = { arm, shots: {}, state: {}, info: {} };
  const step = (t) => ev(`(window.__step(${t}), 0)`);
  const tick = async (t, r) => { await ev(`(window.__vt = ${t}, window.__vd = ${nowFor(r)}, document.dispatchEvent(new Event('visibilitychange')), 0)`); await sleep(40); };
  let T = 5e6;
  const settle = async (r) => { T += 1e6; await tick(T, r); await step(T + 1e4); await sleep(40); await step(T + 2e4); await sleep(40); };
  res.info.freeze = await ev(freeze(range));
  const FR = 1000 / 60;
  for (const pass of PASSES) {
    if (pass === 'hero' || pass === 'herostatic' || pass === 'variants') { await ev("(scrollTo({ top: 0, behavior: 'instant' }), 0)"); await sleep(1500); }
    else if (pass === 'fade50' || pass === 'fade50x' || pass === 'fadehunt' || pass === 'fade90') { await ev(`(scrollTo({ top: Math.round(innerHeight * ${pass === 'fade90' ? 0.9 : 0.5}), behavior: 'instant' }), 0)`); await sleep(1200); }
    else if (pass === 'panel' || pass === 'panelmid') {
      if (!res.info.panelReady) {
        await ev("(scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 0)"); await sleep(3000);
        res.info.morphDriven = await ev(`(typeof window.__fwMorphDrive === 'function' && (window.__fwMorphDrive({ hold: 1e9, cycles: 1 }), true))`);
        await sleep(6000); res.info.panelReady = true;
      }
      // m by hand on the element Svelte binds --morph to (the spring has settled, so nothing writes it again), then
      // every finite animation (the transitions that follow --morph) is finished and the infinite ones are paused at
      // t = 0. Round 1 paused everything at t = 0 instead, which froze a transition at its start (panel scale 0.997).
      // Round 2, run 2 showed that in WebKit the panel's computed transform stays where the driven spring left it
      // (scale 0.9969-0.9975, a different value in each arm and in the A/A) even with --morph 1 or 0.5 read back on
      // the nav (OBSERVED, cause unknown). So the panel also gets the CSS rule's own values for m inline (the same in
      // every arm): the comparison is then the clock content under one identical panel state.
      const m = pass === 'panel' ? 1 : 0.5, k = Math.min(1, Math.max(0, (m - 0.08) / 0.72));
      res.info['set-' + pass] = await ev(`(() => { const e = [...document.querySelectorAll('*')].find((x) => x.style.getPropertyValue('--morph') !== ''); if (!e) return null; const was = e.style.getPropertyValue('--morph'); e.style.setProperty('--morph', '${m}');
        const p = document.querySelector('.start-selling-morph-panel'); p.style.setProperty('--morph', '${m}'); p.style.transform = 'scale(${0.96 + 0.04 * m})'; p.style.filter = 'blur(${(1 - k) * 12}px)'; p.style.opacity = '${k}';
        return [e.className.toString().slice(0, 40), was]; })()`);
      for (let j = 0; j < 2; j++) {
        await sleep(700);
        res.info[`anims-${pass}-${j}`] = await ev(`(() => { const o = { finished: 0, paused: 0, kinds: {} }; for (const x of document.getAnimations()) { const k = x.constructor.name + ':' + (x.transitionProperty || x.animationName || ''); o.kinds[k] = (o.kinds[k] || 0) + 1;
          let fin = false; if (Number.isFinite(x.effect?.getComputedTiming().endTime)) try { x.finish(); fin = true; } catch {} if (fin) o.finished++; else { x.pause(); x.currentTime = 0; o.paused++; } } return o; })()`);
      }
      await sleep(300);
    }
    const cal = await calibrate(ev, `${arm}-${pass}`);
    const rect = await ev(`(() => { const r = ${TIMER[pass]}.getBoundingClientRect(); const p = document.querySelector('.start-selling-morph-panel'); const s = p && getComputedStyle(p);
      let op = 1; for (let e = ${TIMER[pass]}; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      const n = [...document.querySelectorAll('*')].find((x) => x.style.getPropertyValue('--morph') !== '');
      return { r: [r.left, r.top, r.width, r.height], y: scrollY, op, vh: innerHeight, dpr: devicePixelRatio, morph: n ? getComputedStyle(n).getPropertyValue('--morph') : null, panel: s ? [s.transform, s.filter, s.opacity] : null }; })()`);
    const [L, Tp, W, H] = rect.r;
    const box = { x: Math.floor(cal.ox + (L - 4) * cal.s), y: Math.floor(cal.oy + (Tp - 4) * cal.sy), w: Math.ceil((W + 8) * cal.s), h: Math.ceil((H + 8) * cal.sy) };
    res.info[pass] = { cal, rect, box };
    if (box.x < 0 || box.y < 0 || box.x + box.w > cal.screen[0] || box.y + box.h > cal.screen[1]) throw new Error(`${pass}: clock off screen (${JSON.stringify(box)})`);
    if (pass === 'variants') {
      // diagnostic, clocks at rest: geometry of every visible glyph (element and text rects, device px), then one shot
      // per strip-arm variant (applied, shot, undone; a no-op on the faces arm, so every shot compares to the faces)
      await settle(SCEN.step[1]); await sleep(300);
      res.info.geom = await ev(`(() => [...document.querySelectorAll('.hero-copy [role=timer] .digit.svelte-1quva9c')].map((d) => { const D = d.getBoundingClientRect(); const st = d.querySelector('.strip.svelte-1quva9c');
        let el; if (st) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); el = [...st.children].find((x) => Math.abs(parseFloat(x.style.top) + T) < 0.5); } else el = [...d.querySelectorAll('.face.svelte-1quva9c')].find((x) => /translateY\\(-?0px\\)/.test(x.style.transform));
        if (!el) return null; const E = el.getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(el); const R = r.getBoundingClientRect(); const S = st ? st.getBoundingClientRect() : null;
        const f = (v) => +(v * 3).toFixed(4); return { t: el.textContent, digit: [f(D.top), f(D.height), f(D.left), f(D.width)], el: [f(E.top), f(E.height)], text: [f(R.top), f(R.height), f(R.left), f(R.width)], strip: S && [f(S.top), f(S.height)], c: d.querySelector('.spacer')?.offsetHeight }; }))()`);
      const ONLY = (process.env.SIMPX_VARIANTS || '').split(',').filter(Boolean);
      const V = {
        served: ['0', '0'],
        // cells in normal flow (no RenderLayer of their own), pitch c from the spacer, as a candidate layout
        inflow: [`(() => { const s = document.createElement('style'); s.id = '__v'; s.textContent = '.hero-copy .cell.svelte-1quva9c { position: static !important; }'; document.head.appendChild(s);
          for (const d of document.querySelectorAll('.hero-copy [role=timer] .digit.svelte-1quva9c')) { const c = d.querySelector('.spacer').offsetHeight; for (const x of d.querySelectorAll('.cell.svelte-1quva9c')) x.style.height = c + 'px'; } return 0; })()`,
          `(() => { document.getElementById('__v').remove(); for (const x of document.querySelectorAll('.hero-copy .cell.svelte-1quva9c')) x.style.height = ''; return 0; })()`],
        singleCell: [`(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); for (const x of st.children) if (Math.abs(parseFloat(x.style.top) + T) >= 0.5) x.style.display = 'none'; } return 0; })()`,
          `(() => { for (const x of document.querySelectorAll('.hero-copy [role=timer] .cell.svelte-1quva9c')) x.style.display = ''; return 0; })()`],
        // only the visible cell, at top 0, strip at translateY(0): a one-cell layer with an identity transform
        singleCellIdentity: [`(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); st.dataset.vt = st.style.transform; for (const x of st.children) { x.dataset.vtop = x.style.top; if (Math.abs(parseFloat(x.style.top) + T) >= 0.5) x.style.display = 'none'; else x.style.top = '0px'; } st.style.transform = 'translateY(0px)'; } return 0; })()`,
          `(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { st.style.transform = st.dataset.vt; for (const x of st.children) { x.style.display = ''; x.style.top = x.dataset.vtop; } } return 0; })()`],
        // strip at translateY(0), the visible cell at top 0 and N - 1 cells below it, the rest hidden: a backing N cells
        // tall with an identity transform (does the raster change with the backing's size?)
        ...Object.fromEntries([2, 3, 4, 6, 8, 11].map((N) => [`tall${N}`, [`(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); const c = st.parentElement.querySelector('.spacer').offsetHeight; st.dataset.vt = st.style.transform;
            const cells = [...st.children]; const vis = cells.findIndex((x) => Math.abs(parseFloat(x.style.top) + T) < 0.5); let j = 1;
            cells.forEach((x, i) => { x.dataset.vtop = x.style.top; if (i === vis) x.style.top = '0px'; else if (j < ${N}) x.style.top = (j++ * c) + 'px'; else x.style.display = 'none'; }); st.style.transform = 'translateY(0px)'; } return 0; })()`,
          `(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { st.style.transform = st.dataset.vt; for (const x of st.children) { x.style.display = ''; x.style.top = x.dataset.vtop; } } return 0; })()`]])),
        // a 2-cell backing with a non-identity transform: strip at translateY(-c), the visible cell at top c, the rest hidden
        shift1: [`(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); const c = st.parentElement.querySelector('.spacer').offsetHeight; st.dataset.vt = st.style.transform;
            for (const x of st.children) { x.dataset.vtop = x.style.top; if (Math.abs(parseFloat(x.style.top) + T) < 0.5) x.style.top = c + 'px'; else x.style.display = 'none'; } st.style.transform = 'translateY(' + -c + 'px)'; } return 0; })()`,
          `(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { st.style.transform = st.dataset.vt; for (const x of st.children) { x.style.display = ''; x.style.top = x.dataset.vtop; } } return 0; })()`],
        // the strip's layer moved onto a whole device px (by the clock's sub-device-px remainder f), the cells moved
        // back by the same amount inside it, so the glyphs stay where they are (down: -f, up: +(1 - f))
        ...Object.fromEntries(['down', 'up'].map((dir) => [`remainder-${dir}`, [`(() => { const out = []; for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); const f = (st.parentElement.getBoundingClientRect().top * devicePixelRatio) % 1; const s = ${dir === 'down' ? '-f' : '(1 - f)'} / devicePixelRatio; out.push(+f.toFixed(4));
            st.dataset.vt = st.style.transform; st.style.transform = 'translateY(' + (T + s) + 'px)'; for (const x of st.children) { x.dataset.vtop = x.style.top; x.style.top = (parseFloat(x.style.top) - s) + 'px'; } } return out; })()`,
          `(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { st.style.transform = st.dataset.vt; for (const x of st.children) x.style.top = x.dataset.vtop; } return 0; })()`]])),
        stripClip: [`(() => { const s = document.createElement('style'); s.id = '__v'; s.textContent = '.hero-copy .strip.svelte-1quva9c { overflow: hidden !important; }'; document.head.appendChild(s); return 0; })()`, `(document.getElementById('__v').remove(), 0)`],
        cellLayers: [`(() => { const s = document.createElement('style'); s.id = '__v'; s.textContent = '.hero-copy .cell.svelte-1quva9c { will-change: transform; }'; document.head.appendChild(s); return 0; })()`, `(document.getElementById('__v').remove(), 0)`],
        noStripLayer: [`(() => { const s = document.createElement('style'); s.id = '__v'; s.textContent = '.hero-copy .strip.svelte-1quva9c { will-change: auto !important; } .hero-copy .face.svelte-1quva9c { will-change: transform; }'; document.head.appendChild(s); return 0; })()`, `(document.getElementById('__v').remove(), 0)`],
      };
      for (const [name, [apply, undo]] of Object.entries(V).filter(([n]) => !ONLY.length || ONLY.includes(n))) {
        if (/strip/.test(arm)) res.info[`applied ${name}`] = await ev(apply);
        await sleep(500);
        res.info[`layers ${name}`] = await heroLayers(c);
        res.shots[`variant ${name}`] = crop(screenshot(`${arm}-variant-${name}`).img, box);
        if (/strip/.test(arm)) await ev(undo);
        await sleep(300);
      }
      continue;
    }
    if (pass === 'fadehunt') {
      // diagnostic at fade50 (hero copy at opacity ~0.55), scenario "two" (21 -> 20 -> 19) frozen at frames 20-35: shot as
      // served, then (strip arms only; the faces arm is shot twice unchanged) "rebase": each hero strip's translateY
      // reduced to its fractional part -(n - m)*c, m = round(n), and every cell's top moved to (k - m)*c, so the glyphs
      // stay where they are but no large offsets cancel (does float precision in -n*c + k*c cause the delta?)
      const REBASE = `(() => { const out = []; for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); const c = st.parentElement.querySelector('.spacer').offsetHeight;
        const m = Math.round(-T / c); st.dataset.vt = st.style.transform; st.style.transform = 'translateY(' + (T + m * c) + 'px)'; [...st.children].forEach((x, k) => { x.dataset.vtop = x.style.top; x.style.top = ((k - m) * c) + 'px'; }); out.push([T, m]); } return out; })()`;
      const UNDO = `(() => { for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { st.style.transform = st.dataset.vt; for (const x of st.children) x.style.top = x.dataset.vtop; } return 0; })()`;
      const [name, r0, r1, r2] = SCEN.two;
      await settle(r0);
      const G = T + 1e5; await tick(G + FR / 3, r1);
      let k = 0;
      for (const ph of [20, 25, 30, 35]) {
        while (k < ph) { k++; await step(G + k * FR); if (k === 9) await tick(G + k * FR + FR / 3, r2); }
        await sleep(150);
        const key = `fadehunt @60Hz ${name} | frame ${ph}`;
        res.shots[key + ' | served'] = crop(screenshot(`${arm}-fadehunt-f${ph}-served`).img, box); res.state[key + ' | served'] = await ev(STATE(pass));
        if (/strip/.test(arm)) res.info[`rebase f${ph}`] = await ev(REBASE);
        await sleep(400);
        res.shots[key + ' | rebase'] = crop(screenshot(`${arm}-fadehunt-f${ph}-rebase`).img, box); res.state[key + ' | rebase'] = await ev(STATE(pass));
        if (/strip/.test(arm)) await ev(UNDO);
        await sleep(300);
      }
      while (k < 60) { k++; await step(G + k * FR); }
      await step(G + 1e5); T = G + 1e5;
      continue;
    }
    if (pass === 'herostatic') {
      // diagnostic, clocks at rest (no tick): shot 1 as served; shot 2 after moving each strip to translateY(0) with
      // its visible cell swapped to top 0 (the face's own geometry; a no-op on the faces arm). If shot 2 matches the
      // faces, the strip's offset (cell at n*c inside a strip moved by -n*c) is what WebKit paints differently.
      await settle(SCEN.step[1]); await sleep(300);
      res.shots['herostatic as served'] = crop(screenshot(`${arm}-herostatic-served`).img, box);
      res.info.cell0 = await ev(`(() => { let n = 0; for (const st of document.querySelectorAll('.hero-copy [role=timer] .strip.svelte-1quva9c')) { const T = Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(st.style.transform) || [])[1]); const cells = [...st.children]; const vis = cells.find((x) => Math.abs(parseFloat(x.style.top) + T) < 0.5); if (!vis) continue; const top = vis.style.top; cells[0].style.top = top; vis.style.top = '0px'; st.style.transform = 'translateY(0px)'; n++; } return n; })()`);
      await sleep(400);
      res.shots['herostatic cell at top 0, strip at 0'] = crop(screenshot(`${arm}-herostatic-cell0`).img, box);
      continue;
    }
    for (const [sk, phases] of PLAN[pass]) {
      const [name, r0, r1, r2] = SCEN[sk];
      await settle(r0);
      const G = T + 1e5; await tick(G + FR / 3, r1);
      let k = 0; const second = r2 !== undefined ? 9 : -1;
      for (const ph of phases) {
        while (k < ph) { k++; await step(G + k * FR); if (k === second) await tick(G + k * FR + FR / 3, r2); }
        await sleep(150);
        const key = `${pass} @60Hz ${name} | frame ${ph}`;
        const { img } = screenshot(`${arm}-${pass}-${sk}-f${ph}`);
        res.shots[key] = crop(img, box); res.state[key] = await ev(STATE(pass));
      }
      while (k < phases.at(-1) + 20) { k++; await step(G + k * FR); }
      await step(G + 1e5); T = G + 1e5;
    }
  }
  res.info.cdHits = await ev('window.__cdHits');
  return res;
}

const BASE = resolveTree('site-pretty');
const order = [...ARMS, ARMS[0]];
const hashes = JSON.parse(readFileSync(join(SNAP, 'hashes.json'), 'utf8'));
const out = { tool: 'cd-strip simpx', note: 'Simulator frozen frames, counts only', startedAt: new Date().toISOString(), order, passes: PASSES, dir: DIR, runs: [] };
const got = [];
for (let i = 0; i < order.length; i++) {
  // an arm "<snap>+nowc" is a diagnostic: the same build with the digits' layer hint removed after load
  // (.face and .strip will-change: auto), to tell a layer-raster difference from a paint difference
  const [arm, mod] = order[i].split('+'), label = order[i] + (i === order.length - 1 ? '-again' : ''), want = hashes[arm];
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null; for (let j = 0; j < 300 && !s; j++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (js !== want.js || css !== want.css) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; break; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    if (mod === 'nowc') await c.evaluate(`(() => { const s = document.createElement('style'); s.textContent = '.face.svelte-1quva9c, .strip.svelte-1quva9c { will-change: auto !important; }'; document.head.appendChild(s); return 0; })()`);
    else if (mod) throw new Error('unknown arm modifier ' + mod);
    await sleep(3000);
    console.log(`== ${label}`, js.slice(0, 12), css.slice(0, 12));
    try { const r = await run(c, label, cdRange(arm)); r.served = { js: js.slice(0, 12), css: css.slice(0, 12) }; got.push(r); console.log(label, 'shots', Object.keys(r.shots).length, JSON.stringify(r.info.freeze), 'cdHits', r.info.cdHits); }
    catch (e) { out.runs.push({ arm: label, error: String(e.stack || e) }); console.error(label, e.message); }
    c.close();
  } finally { p.kill(); }
}
const cmp = (x, y) => {
  const rows = Object.keys(x.shots).map((k) => { const a = x.shots[k], b = y.shots[k]; if (!b) return { key: k, missing: true };
    if (a.length !== b.length) return { key: k, sizeMismatch: [a.length, b.length] };
    let n = 0, max = 0; for (let i = 0; i < a.length; i += 3) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) n++; if (d > max) max = d; }
    return { key: k, sameState: x.state[k] === y.state[k], diffPixels: n, maxDelta: max, ...(x.state[k] === y.state[k] ? {} : { states: [x.state[k], y.state[k]] }) }; });
  return { shots: rows.length, differ: rows.filter((r) => r.diffPixels || r.missing || r.sizeMismatch).length, stateDiffer: rows.filter((r) => r.sameState === false).length, rows: rows.filter((r) => r.diffPixels || r.missing || r.sizeMismatch || r.sameState === false) };
};
out.info = got.map((g) => [g.arm, g.served, g.info]);
out.compare = {};
for (let i = 1; i < got.length; i++) out.compare[`${got[0].arm} vs ${got[i].arm}`] = cmp(got[0], got[i]);
out.endedAt = new Date().toISOString();
const f = join(OUT, `simpx-${STAMP}.json`); writeFileSync(f, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.compare)) console.log('SIMPX', k, ': shots', v.shots, 'px-differ', v.differ, 'state-differ', v.stateDiffer, JSON.stringify(v.rows.slice(0, 6).map((r) => [r.key, r.diffPixels, r.maxDelta])));
console.log('wrote', f);
