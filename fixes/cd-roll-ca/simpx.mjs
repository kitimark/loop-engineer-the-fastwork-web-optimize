// cd-roll-ca WebKit frozen and running frames on the iOS Simulator (counts and pixels only, no timing).
// Adapted from fix-cd-strip's fixes/cd-strip/simpx.mjs (its clock shim, crop calibration, PNG reader and LayerTree
// read are theirs, used with credit). Arms come from out/cd-roll-ca/snap/<arm> (hash-checked against HASHES.txt; a
// mismatch is VOID, exit 3). Order: arms, then the first arm again (A/A).
//
// The countdown's clocks are virtual (Date.now, performance.now, document.timeline.currentTime and rAF calls from the
// countdown's lines; its rAF frames are stepped by hand at 60 Hz, a tick lands at frame + FR/3). document.timeline
// .currentTime as the countdown reads it is the last stepped frame's stamp (the build reads it as "the last frame").
// - C (strip-rb, cd-strip): the rAF spring is stepped; one shot per chosen frame (stored under both keys below).
// - V (this build): a roll is Web Animations on the cells with a virtual startTime. At a chosen frame k every hero
//   cell animation is shot twice: "paused" (paused, currentTime = frame time - startTime: drawn from the main
//   thread's value) and "running" (the same currentTime, playbackRate 1e-6, play(): a compositor animation sampled
//   while running, n read back at capture time). All animations of a digit must share one startTime (checked).
// Frames: a dry run of every scenario on the first arm reads n per hero digit per frame and picks the frames just
// before, at and after every m change (round(n), where strip-rb re-tops its cells) and every cell-edge crossing
// (floor(n), a cell entering or leaving the clip), plus 10/30/50/70/90 % of the roll and frames 20/25/30/35. Every
// arm is shot at those frames. LayerTree (cell/strip layer count, backing MB, per-cell memory) at rest and mid-roll.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner cd-roll-ca -- \
//     node tools/sim.mjs session --functional --owner cd-roll-ca -- node fixes/cd-roll-ca/simpx.mjs C5,V6 fade50 wrap
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { READ } from './strip-read.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/cd-roll-ca/snap');
const ARMS = (process.argv[2] || 'C5,V6').split(',');
const PASSES = (process.argv[3] || 'fade50').split(',');
const SCENS = (process.argv[4] || 'wrap').split(',');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/cd-roll-ca/simpx'); const DIR = join(OUT, STAMP); mkdirSync(DIR, { recursive: true });
const UDID = process.env.FW_SIM_UDID;
if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const sha = (b) => createHash('sha256').update(b).digest('hex');
const HASHES = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h]));

function cdRange(arm) {
  const lines = readFileSync(join(SNAP, arm, NODE), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1;
  const b = lines.findIndex((l) => l.startsWith('var lD = h(')) + 1;
  if (a < 1 || b <= a) throw new Error('countdown range not found for ' + arm);
  return [a, b - 1];
}
// fix-cd-strip's shim (pixels.mjs), for a page that is already loaded
const freeze = (range) => `(() => { if (window.__step) return 'again'; const rDate = Date.now.bind(Date), rPerf = performance.now.bind(performance), rRaf = window.requestAnimationFrame.bind(window), rCaf = window.cancelAnimationFrame.bind(window);
  window.__vd = null; window.__vt = null; window.__vf = null; const Q = new Map(); let id = 1e9; window.__cdHits = 0;
  const fromCd = () => { const m = /nodes\\/2\\.DyWL8TcE\\.js:(\\d+):/.exec(new Error().stack.split('\\n').slice(1, 4).join(' ')); const ok = !!m && +m[1] >= ${range[0]} && +m[1] <= ${range[1]}; if (ok) window.__cdHits++; return ok; };
  Date.now = () => (window.__vd !== null && fromCd() ? window.__vd : rDate());
  performance.now = () => (window.__vt !== null && fromCd() ? window.__vt : rPerf());
  const tl = Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, 'currentTime');
  if (tl) Object.defineProperty(AnimationTimeline.prototype, 'currentTime', { configurable: true, get() { return window.__vf !== null && fromCd() ? window.__vf : tl.get.call(this); } });
  window.requestAnimationFrame = (cb) => { if (window.__vt !== null && fromCd()) { const k = ++id; Q.set(k, cb); return k; } return rRaf(cb); };
  window.cancelAnimationFrame = (k) => (Q.has(k) ? Q.delete(k) : rCaf(k));
  window.__step = (t) => { window.__vf = t; const cbs = [...Q.values()]; Q.clear(); for (const cb of cbs) cb(t); return cbs.length; };
  return 'ok'; })()`;
// page helpers: hero strips, n per digit (cells' computed place, strip-read.mjs), the hero cells' animations
const HELP = `(() => { if (window.__px) return 'again'; ${READ}
  const hero = () => [...document.querySelectorAll('.hero-copy [role=timer] .digit > .strip')];
  window.__px = {
    n: () => hero().map((s) => { const c = cell(s); return c > 0 ? +(-tyOf(s) / c).toFixed(5) : null; }),
    ty: () => hero().map((s) => +tyOf(s).toFixed(3)),
    // layout place of every cell in or near the clip: [k, rect top - digit top] in CSS px, unrounded (lead: the moved
    // cells' top M*c and the wrapper's -M*c must cancel to the LayoutUnit, 1/64 px, against cd-strip's rest place)
    rects: () => hero().map((s) => { const c = cell(s), d = s.parentElement.getBoundingClientRect().top;
      return cellsOf(s).map((el, k) => [k, el.getBoundingClientRect().top - d]).filter(([, y]) => Math.abs(y) < 1.5 * c); }),
    anims: () => hero().map((s) => cellsOf(s).flatMap((el) => el.getAnimations())),
    // a.__vst: the roll's startTime on the virtual clock, kept before pause()/play() (play() re-bases startTime on the
    // real timeline)
    info: () => window.__px.anims().map((A) => A.length ? { n: A.length, starts: [...new Set(A.map((a) => a.__vst ?? a.startTime))], states: [...new Set(A.map((a) => a.playState))], d: A[0].effect.getTiming().duration } : null),
    // V: paused at currentTime = t - startTime (or finished past the end); returns per digit what was done
    pauseAt: (t) => window.__px.anims().map((A) => { if (!A.length) return null; A.forEach((a) => { if (a.__vst === undefined) a.__vst = a.startTime; });
      const st = A[0].__vst, d = A[0].effect.getTiming().duration;
      const same = A.every((a) => a.__vst === st); const ct = t - st;
      if (ct >= d) { A.forEach((a) => { a.playbackRate = 1; a.finish(); }); return { st, ct, d, same, finished: true }; }
      A.forEach((a) => { a.pause(); a.currentTime = ct; }); return { st, ct, d, same, n: A.length }; }),
    runSlow: () => window.__px.anims().map((A) => { if (!A.length) return null; A.forEach((a) => { a.playbackRate = 1e-6; a.play(); }); return A.length; }),
    // rate check: play every hero roll at rate r from where it is paused; ct(): per digit [currentTime, duration] of a
    // rolling digit (all its cells share it); setCt(x): pause all at local time x; box(i): digit i's rect (CSS px)
    playAt: (r) => window.__px.anims().map((A) => { A.forEach((a) => { a.playbackRate = r; a.play(); }); return A.length; }),
    ct: () => window.__px.anims().map((A) => (A.length ? [A[0].currentTime, A[0].effect.getTiming().duration] : null)),
    setCt: (x) => window.__px.anims().map((A) => { A.forEach((a) => { a.pause(); a.currentTime = x; }); return A.length; }),
    box: (i) => { const r = hero()[i].parentElement.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; },
    // after a scenario: hand every roll back to the build (finish -> onfinish -> rest tops)
    finishAll: () => window.__px.anims().reduce((m, A) => { A.forEach((a) => { a.playbackRate = 1; try { a.finish(); } catch {} }); return m + A.length; }, 0),
  };
  return 'ok'; })()`;
const TARGET = Date.parse('2026-11-02T12:00:00+07:00');
const nowFor = (R) => TARGET - R * 1000 + 500;
const R = (d, h, m, s) => d * 86400 + h * 3600 + m * 60 + s;
const SCEN = {
  step: ['one step down (seconds 5 -> 4)', R(3, 4, 12, 35), R(3, 4, 12, 34)],
  wrap: ['ones 0 -> 9 (long roll back through 8..1) + tens 4 -> 3 (40 -> 39)', R(3, 4, 12, 40), R(3, 4, 12, 39)],
  wrapUp: ['ones 9 -> 0 (long roll through 8..1) + tens 3 -> 4 (39 -> 40, up)', R(3, 4, 12, 39), R(3, 4, 12, 40)],
  carry: ['multi-digit carry 4:13:00 -> 4:12:59 (seconds 00 -> 59, minutes 13 -> 12)', R(3, 4, 13, 0), R(3, 4, 12, 59)],
  two: ['two changes mid-roll (21 -> 20, then 20 -> 19 after 9 frames)', R(3, 4, 12, 21), R(3, 4, 12, 20), R(3, 4, 12, 19)],
};
const TIMER = `document.querySelector('.hero-copy [role=timer]')`;
const SCROLL = { hero: 0, fade50: 0.5, fade25: 0.25, fade75: 0.75 };
// rates for the real-time cross-check (SIMPX_RATES, comma list; '' = none); SIMPX_NOAA=1 skips the A/A arm
const RATES = (process.env.SIMPX_RATES ?? '0.001,1,1').split(',').filter(Boolean).map(Number);
const RATE_STEP = Number(process.env.SIMPX_RATE_STEP || 0.05);

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
function crop(img, r) {
  const out = Buffer.alloc(r.w * r.h * 3);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = ((r.y + y) * img.w + r.x + x) * img.bpp, j = (y * r.w + x) * 3; out[j] = img.px[i]; out[j + 1] = img.px[i + 1]; out[j + 2] = img.px[i + 2]; }
  return out;
}
const MARK = 40;
async function calibrate(ev, tag) {
  await ev(`(() => { const d = document.createElement('div'); d.id = '__cdmark'; d.style.cssText = 'position:fixed;left:${MARK}px;top:${MARK}px;width:${MARK}px;height:${MARK}px;background:#ff00ff;z-index:2147483647;pointer-events:none'; document.body.appendChild(d); return 0; })()`);
  await sleep(250);
  const { img } = screenshot('cal-' + tag);
  await ev(`(document.getElementById('__cdmark')?.remove(), 0)`); await sleep(200);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * img.bpp; if (img.px[i] > 200 && img.px[i + 1] < 90 && img.px[i + 2] > 200) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  if (x1 < 0) throw new Error('marker not found in ' + tag);
  const s = (x1 - x0 + 1) / MARK, sy = (y1 - y0 + 1) / MARK;
  return { ox: x0 - MARK * s, oy: y0 - MARK * sy, s, sy, screen: [img.w, img.h] };
}
// hero clock layers (strips, cells): count, backing MB, and per cell [digit, k, memory bytes] (LayerTree)
async function heroLayers(c) {
  try {
    await c.send('LayerTree.enable');
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const strips = (await c.send('DOM.querySelectorAll', { nodeId: root, selector: '.hero-copy [role=timer] .digit > .strip, .hero-copy [role=timer] .digit > .strip > .cdwrap' })).nodeIds;
    const cellIds = (await c.send('DOM.querySelectorAll', { nodeId: root, selector: '.hero-copy [role=timer] .digit > .strip .cell' })).nodeIds;
    const where = new Map(cellIds.map((id, j) => [id, [Math.floor(j / 11), j % 11]]));
    const ids = new Set([...strips, ...cellIds]);
    const L = ((await c.send('LayerTree.layersForNode', { nodeId: root })).layers || []).filter((l) => ids.has(l.nodeId));
    // why each backed cell layer is composited (WebKit LayerTree.reasonsForCompositingLayer): 'animation' = a running
    // accelerated animation on it (on top of will-change, which every cell has)
    const reasons = {};
    for (const l of L.filter((q) => where.has(q.nodeId) && q.memory > 0)) {
      try { const r = (await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId })).compositingReasons || {};
        reasons[where.get(l.nodeId).join(':')] = Object.keys(r).filter((k) => r[k]).sort().join(','); } catch (e) { reasons[where.get(l.nodeId).join(':')] = 'error ' + (e.message || e); } }
    return { n: L.length, memoryMB: +(L.reduce((a, l) => a + (l.memory || 0), 0) / 1048576).toFixed(3),
      cells: L.filter((l) => where.has(l.nodeId)).map((l) => [...where.get(l.nodeId), l.memory || 0]), stripLayers: L.filter((l) => !where.has(l.nodeId)).length, reasons };
  } catch (e) { return { error: String(e.message || e) }; }
}

// a short WebKit Timeline window: rendering updates, style recalcs, layouts, paints and rAF callbacks in ms ms
const TL = { on: false, recs: [] };
async function tlWindow(c, ms) {
  TL.recs = []; await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  TL.on = true; await c.send('Timeline.start', { maxCallStackDepth: 1 }); await sleep(ms); await c.send('Timeline.stop'); await sleep(300); TL.on = false;
  await c.send('Timeline.disable').catch(() => {});
  const n = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, FireAnimationFrame: 0, framesWithRecalc: 0 };
  const walk = (r, F) => { if (r.type in n) n[r.type]++; if (r.type === 'RecalculateStyles' && F) F.recalc = true; for (const ch of r.children || []) walk(ch, F); };
  for (const r of TL.recs) { const F = r.type === 'RenderingFrame' ? {} : null; walk(r, F); if (F && F.recalc) n.framesWithRecalc++; }
  return { ms, ...n };
}
const FRAMES = {}; // pass|scenario -> frame list, from the first arm's dry run
function pickFrames(series) { // series[k] = n per digit at frame k (k = 0..K)
  const S = new Set(); let last = 0;
  const pre = (v) => (v === null ? null : ((v % 10) + 10) % 10);
  for (let k = 1; k < series.length; k++) for (let i = 0; i < series[k].length; i++) {
    const a = pre(series[k - 1][i]), b = pre(series[k][i]); if (a === null || b === null) continue;
    if (Math.abs(a - b) > 1e-6) last = k;
    if (Math.round(a) % 10 !== Math.round(b) % 10 || Math.floor(a + 1e-9) !== Math.floor(b + 1e-9)) [k - 1, k, k + 1].forEach((x) => S.add(x));
  }
  const L = last + 1;
  for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) S.add(Math.round(p * L));
  for (const f of [20, 25, 30, 35]) if (f <= L + 5) S.add(f);
  S.add(L + 2);
  return { frames: [...S].filter((x) => x >= 1).sort((a, b) => a - b), rollFrames: L };
}

async function run(c, arm, range, isV, first) {
  const ev = (e) => c.evaluate(e);
  const res = { arm, shots: {}, state: {}, rects: {}, info: {}, v: {}, layers: {}, tl: {}, rate: [] };
  const step = (t) => ev(`(window.__step(${t}), 0)`);
  const tick = async (t, r) => { await ev(`(window.__vt = ${t}, window.__vd = ${nowFor(r)}, document.dispatchEvent(new Event('visibilitychange')), 0)`); await sleep(40); };
  let T = 5e6;
  const settle = async (r) => { if (isV) await ev('window.__px.finishAll()'); T += 1e6; await tick(T, r); await step(T + 1e4); await sleep(40); await step(T + 2e4); await sleep(40); if (isV) { await ev('window.__px.finishAll()'); await sleep(80); } };
  c.on((m) => { if (TL.on && m.method === 'Timeline.eventRecorded') TL.recs.push(m.params.record); });
  res.info.freeze = await ev(freeze(range));
  res.info.help = await ev(HELP);
  const FR = 1000 / 60;
  for (const pass of PASSES) {
    await ev(`(scrollTo({ top: Math.round(innerHeight * ${SCROLL[pass]}), behavior: 'instant' }), 0)`); await sleep(1500);
    const cal = await calibrate(ev, `${arm}-${pass}`);
    const rect = await ev(`(() => { const r = ${TIMER}.getBoundingClientRect(); let op = 1; for (let e = ${TIMER}; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity; return { r: [r.left, r.top, r.width, r.height], y: scrollY, op }; })()`);
    const [L, Tp, W, H] = rect.r;
    const box = { x: Math.floor(cal.ox + (L - 4) * cal.s), y: Math.floor(cal.oy + (Tp - 4) * cal.sy), w: Math.ceil((W + 8) * cal.s), h: Math.ceil((H + 8) * cal.sy) };
    res.info[pass] = { cal, rect, box }; res.box = { w: box.w, s: cal.s };
    if (box.x < 0 || box.y < 0 || box.x + box.w > cal.screen[0] || box.y + box.h > cal.screen[1]) throw new Error(`${pass}: clock off screen (${JSON.stringify(box)})`);
    for (const sk of SCENS) {
      const [name, r0, r1, r2] = SCEN[sk];
      const id = `${pass}|${sk}`;
      if (first) { // dry run: n per digit per frame
        await settle(r0);
        const G = T + 1e5; await tick(G + FR / 3, r1);
        const series = [await ev('window.__px.n()')];
        for (let k = 1; k <= 70; k++) {
          await step(G + k * FR); if (r2 !== undefined && k === 9) await tick(G + k * FR + FR / 3, r2);
          series.push(isV ? await ev(`(window.__px.pauseAt(${G + k * FR}), window.__px.n())`) : await ev('window.__px.n()'));
        }
        await step(G + 1e5); T = G + 1e5;
        FRAMES[id] = { ...pickFrames(series), series: series.map((r) => r.map((v) => (v === null ? null : +v.toFixed(4)))) };
      }
      const plan = FRAMES[id]; if (!plan) throw new Error('no frame plan for ' + id);
      await settle(r0);
      if (sk === SCENS[0]) res.layers[`${pass} rest`] = await heroLayers(c);
      const G = T + 1e5; await tick(G + FR / 3, r1);
      const mid = plan.frames.reduce((b, f) => (Math.abs(f - plan.rollFrames / 2) < Math.abs(b - plan.rollFrames / 2) ? f : b), plan.frames[0]);
      let k = 0;
      for (const ph of plan.frames) {
        while (k < ph) { k++; await step(G + k * FR); if (r2 !== undefined && k === 9) await tick(G + k * FR + FR / 3, r2); }
        const key = `${pass} @60Hz ${sk} | frame ${ph}`;
        if (!isV) {
          await sleep(150);
          const sh = crop(screenshot(`${arm}-${pass}-${sk}-f${ph}`).img, box), st = await ev('window.__px.ty()'), rc = await ev('window.__px.rects()');
          for (const m of ['paused', 'running']) { res.shots[`${key} | ${m}`] = sh; res.state[`${key} | ${m}`] = st; res.rects[`${key} | ${m}`] = rc; }
          if (ph === mid) { res.layers[`${id} mid f${ph}`] = await heroLayers(c); res.tl[`${id} mid f${ph} frozen`] = await tlWindow(c, 1000); }
        } else {
          const before = await ev('window.__px.info()');
          const p = await ev(`window.__px.pauseAt(${G + ph * FR})`);
          await sleep(150);
          res.shots[`${key} | paused`] = crop(screenshot(`${arm}-${pass}-${sk}-f${ph}-paused`).img, box); res.state[`${key} | paused`] = await ev('window.__px.ty()'); res.rects[`${key} | paused`] = await ev('window.__px.rects()');
          if (ph === mid) { res.layers[`${id} mid f${ph} paused`] = await heroLayers(c); res.tl[`${id} mid f${ph} paused`] = await tlWindow(c, 1000); }
          await ev('window.__px.runSlow()');
          await sleep(250); const n0 = await ev('window.__px.n()');
          res.shots[`${key} | running`] = crop(screenshot(`${arm}-${pass}-${sk}-f${ph}-running`).img, box); res.state[`${key} | running`] = await ev('window.__px.ty()'); res.rects[`${key} | running`] = await ev('window.__px.rects()');
          const after = await ev('window.__px.info()'), n1 = await ev('window.__px.n()');
          if (ph === mid) { res.layers[`${id} mid f${ph} running`] = await heroLayers(c); res.tl[`${id} mid f${ph} running 1e-6`] = await tlWindow(c, 1000); }
          res.v[key] = { before, paused: p, running: after, nRunning: [n0, n1] };
        }
      }
      while (k < plan.rollFrames + 10) { k++; await step(G + k * FR); }
      await step(G + 1e5); T = G + 1e5;
      if (isV) { await ev('window.__px.finishAll()'); await sleep(80); }
      // V, first scenario of the first pass: a roll played for real (rate r) from its start, one screenshot, its local
      // time read just before and just after it; then paused shots over that bracket find the time whose drawing
      // matches the running shot best (only the longest-rolling digit's box). Shows whether the compositor draws at a
      // running rate what the main thread draws at some time inside the bracket (and where in it)
      if (isV && sk === SCENS[0] && pass === PASSES[0]) for (const rate of RATES) {
        await settle(r0); const G2 = T + 1e5; await tick(G2 + FR / 3, r1); await step(G2 + FR); await ev(`window.__px.pauseAt(${G2 + FR / 3})`); await sleep(150);
        const cts = await ev('window.__px.ct()'); const i = cts.reduce((b, x, j) => (x && (b < 0 || x[1] > cts[b][1]) ? j : b), -1);
        if (i < 0) { res.rate.push({ rate, error: 'no roll' }); continue; }
        const db = await ev(`window.__px.box(${i})`);
        const rb = { x: Math.floor(cal.ox + db[0] * cal.s) - box.x, y: Math.floor(cal.oy + db[1] * cal.sy) - box.y, w: Math.ceil(db[2] * cal.s), h: Math.ceil(db[3] * cal.sy) };
        const dist = (a, b) => { let sum = 0, px = 0, mx = 0; for (let y = Math.max(0, rb.y); y < Math.min(box.h, rb.y + rb.h); y++) for (let x = Math.max(0, rb.x); x < Math.min(box.w, rb.x + rb.w); x++) { const q = (y * box.w + x) * 3; const d = Math.max(Math.abs(a[q] - b[q]), Math.abs(a[q + 1] - b[q + 1]), Math.abs(a[q + 2] - b[q + 2])); sum += d; if (d) px++; if (d > mx) mx = d; } return { sum, px, mx }; };
        await ev(`window.__px.playAt(${rate})`);
        const b0 = (await ev('window.__px.ct()'))[i], nb0 = await ev('window.__px.n()');
        const run = crop(screenshot(`${arm}-${pass}-${sk}-rate${rate}`).img, box);
        const b1 = (await ev('window.__px.ct()'))[i], nb1 = await ev('window.__px.n()');
        const left = await ev('window.__px.setCt(' + (b1 ? b1[0] : 0) + ')');
        if (!b0 || !b1 || !left[i] || b1[0] >= b1[1] - 1) { res.rate.push({ rate, error: 'roll ended before the pause', b0, b1 }); continue; }
        const lo = Math.max(0, b0[0] - 2), hi = Math.min(b0[1], b1[0] + 2); const tried = [];
        const at = async (x) => { await ev(`window.__px.setCt(${x})`); await sleep(150); const im = crop(screenshot(`${arm}-${pass}-${sk}-rate${rate}-ct${x.toFixed(2)}`).img, box); const d = dist(run, im); tried.push({ ct: +x.toFixed(3), ...d, n: (await ev('window.__px.n()'))[i] }); return d.sum; };
        let a = lo, b = hi, best = null;
        // 9-point levels, each narrowing to +-1 grid step (step / 4 per level) until the step is under SIMPX_RATE_STEP ms
        // (default 0.05: at rate 1 a fast roll moves ~0.4 px per ms, so a coarse grid misses the match basin); 3..8 levels
        const seen = new Map(); const at1 = async (x) => { const k = x.toFixed(4); if (!seen.has(k)) seen.set(k, await at(x)); return seen.get(k); };
        for (let lev = 0; lev < 8; lev++) { const pts = 9, xs = Array.from({ length: pts }, (_, j) => a + ((b - a) * j) / (pts - 1)); let bx = xs[0], bs = Infinity; for (const x of xs) { const v = await at1(x); if (v < bs) { bs = v; bx = x; } } const w = (b - a) / (pts - 1); a = Math.max(lo, bx - w); b = Math.min(hi, bx + w); best = bx; if (lev >= 2 && w < RATE_STEP) break; }
        const top = tried.slice().sort((p, q) => p.sum - q.sum)[0];
        res.rate.push({ rate, digit: i, bracket: [b0[0], b1[0]], nBracket: [nb0[i], nb1[i]], best: top, bestRelBracket: +((top.ct - b0[0]) / Math.max(1e-9, b1[0] - b0[0])).toFixed(3), tried });
        await ev('window.__px.finishAll()'); await sleep(80); await step(G2 + 1e5); T = G2 + 1e5;
      }
    }
  }
  res.info.cdHits = await ev('window.__cdHits');
  return res;
}

const BASE = resolveTree('site-pretty');
const order = process.env.SIMPX_NOAA === '1' ? [...ARMS] : [...ARMS, ARMS[0]];
const out = { tool: 'cd-roll-ca simpx (adapted from fix-cd-strip simpx.mjs)', note: 'Simulator frozen + running frames, counts and pixels only', startedAt: new Date().toISOString(), order, passes: PASSES, scenarios: SCENS, dir: DIR, runs: [] };
const got = [];
for (let i = 0; i < order.length; i++) {
  const arm = order[i], label = arm + (i === order.length - 1 ? '-again' : '');
  const want = { js: HASHES[`${arm}/${NODE}`], css: HASHES[`${arm}/${CSS}`] };
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null; for (let j = 0; j < 300 && !s; j++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (!want.js || js !== want.js || css !== want.css) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; break; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await sleep(3000);
    const isV = !/^C/.test(arm);
    console.log(`== ${label}`, js.slice(0, 12), css.slice(0, 12), isV ? 'V' : 'C');
    try { const r = await run(c, label, cdRange(arm), isV, i === 0); r.served = { js: js.slice(0, 12), css: css.slice(0, 12) }; r.isV = isV; got.push(r); console.log(label, 'shots', Object.keys(r.shots).length, 'cdHits', r.info.cdHits); }
    catch (e) { out.runs.push({ arm: label, error: String(e.stack || e) }); console.error(label, e.message); }
    c.close();
  } finally { p.kill(); }
}
const cmp = (x, y) => {
  const rows = Object.keys(x.shots).map((k) => { const a = x.shots[k], b = y.shots[k]; if (!b) return { key: k, missing: true };
    if (a.length !== b.length) return { key: k, sizeMismatch: [a.length, b.length] };
    // bbox of pixels differing by more than 1, in CSS px from the crop's top left (the crop starts 4 css px before the timer)
    const W = x.box.w, S = x.box.s; let n = 0, o1 = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < a.length; i += 3) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) n++; if (d > max) max = d;
      if (d > 1) { o1++; const p = i / 3, px = p % W, py = Math.floor(p / W); if (px < x0) x0 = px; if (py < y0) y0 = py; if (px > x1) x1 = px; if (py > y1) y1 = py; } }
    const bbox = o1 ? [x0, y0, x1, y1].map((v) => +(v / S - 4).toFixed(1)) : null;
    const sa = x.state[k] || [], sb = y.state[k] || []; const dpx = Math.max(0, ...sa.map((v, j) => Math.abs(v - sb[j])));
    // layout: per digit, cells present in both at the same k; max |y diff|; cells in one only count as unmatched
    let rpx = 0, unmatched = 0; const ra = x.rects[k] || [], rb = y.rects[k] || [];
    ra.forEach((A, j) => { const B = new Map((rb[j] || []).map(([q, v]) => [q, v])); for (const [q, v] of A) { if (B.has(q)) rpx = Math.max(rpx, Math.abs(v - B.get(q))); else unmatched++; B.delete(q); } unmatched += B.size; });
    return { key: k, statePx: +dpx.toFixed(3), rectPx: +rpx.toFixed(5), rectUnmatched: unmatched, diffPixels: n, over1: o1, bboxCss: bbox, maxDelta: max }; });
  return { shots: rows.length, differ: rows.filter((r) => r.diffPixels || r.missing || r.sizeMismatch).length, stateOver0p01px: rows.filter((r) => r.statePx > 0.01).length,
    rectMaxPx: Math.max(0, ...rows.map((r) => r.rectPx || 0)), rectOverLayoutUnit: rows.filter((r) => r.rectPx >= 1 / 64).length, rectUnmatched: rows.reduce((a, r) => a + (r.rectUnmatched || 0), 0),
    rows: rows.filter((r) => r.diffPixels || r.missing || r.sizeMismatch || r.statePx > 0.01 || r.rectPx >= 1 / 64 || r.rectUnmatched) };
};
// V: one startTime per digit roll, playState running after runSlow
const vcheck = (g) => { const rows = Object.values(g.v); const digits = rows.flatMap((r) => (r.before || []).filter(Boolean));
  return { frames: rows.length, digitRolls: digits.length, sharedStart: digits.filter((d) => d.starts.length === 1).length, notShared: digits.filter((d) => d.starts.length !== 1).length,
    runningAfterPlay: rows.flatMap((r) => (r.running || []).filter(Boolean)).filter((d) => d.states.length === 1 && d.states[0] === 'running').length,
    otherStates: [...new Set(rows.flatMap((r) => (r.running || []).filter(Boolean)).flatMap((d) => d.states))] }; };
out.frames = FRAMES;
out.info = got.map((g) => [g.arm, g.served, g.info]);
out.layers = Object.fromEntries(got.map((g) => [g.arm, g.layers]));
out.state = Object.fromEntries(got.map((g) => [g.arm, g.state]));
out.rects = Object.fromEntries(got.map((g) => [g.arm, g.rects]));
out.tl = Object.fromEntries(got.map((g) => [g.arm, g.tl]));
out.rate = Object.fromEntries(got.filter((g) => g.isV).map((g) => [g.arm, g.rate]));
out.v = Object.fromEntries(got.filter((g) => g.isV).map((g) => [g.arm, { check: vcheck(g), perFrame: g.v }]));
out.compare = {};
for (let i = 1; i < got.length; i++) out.compare[`${got[0].arm} vs ${got[i].arm}`] = cmp(got[0], got[i]);
out.endedAt = new Date().toISOString();
const f = join(OUT, `simpx-${STAMP}.json`); writeFileSync(f, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.compare)) console.log('SIMPX', k, ': shots', v.shots, 'px-differ', v.differ, 'state>0.01px', v.stateOver0p01px, 'rect max', v.rectMaxPx, '>=1/64', v.rectOverLayoutUnit, 'unmatched', v.rectUnmatched, JSON.stringify(v.rows.slice(0, 8).map((r) => [r.key, r.diffPixels, r.over1, r.maxDelta, r.statePx, r.rectPx, r.bboxCss])));
for (const [k, v] of Object.entries(out.v)) console.log('VCHECK', k, JSON.stringify(v.check));
for (const [k, v] of Object.entries(out.layers)) console.log('LAYERS', k, JSON.stringify(Object.fromEntries(Object.entries(v).map(([x, y]) => [x, { n: y.n, MB: y.memoryMB, cellLayers: y.cells?.length, cellsWithBacking: y.cells?.filter((q) => q[2] > 0).length }]))));
for (const [k, v] of Object.entries(out.tl)) console.log('TL', k, JSON.stringify(v));
for (const [k, v] of Object.entries(out.rate)) console.log('RATE', k, JSON.stringify(v.map((r) => (r.error ? r : { rate: r.rate, digit: r.digit, bracket: r.bracket, nBracket: r.nBracket, best: { ct: r.best.ct, n: r.best.n, sum: r.best.sum, px: r.best.px, mx: r.best.mx }, bestRelBracket: r.bestRelBracket, shots: r.tried.length }))));
for (const [k, v] of Object.entries(out.layers)) for (const [x, y] of Object.entries(v)) if (y.reasons) console.log('REASONS', k, x, JSON.stringify(y.reasons));
console.log('wrote', f);
