// carousel-leaver D2 (st6-rb2 follow-up, lead route on F-198): describes only. WebKit geometry of the avatar carousel
// (Simulator, `sim.mjs session --functional`). No timing, no pixels.
// Per arm (as simcrop.mjs): serve the snapshot with --no-cache, check the served hashes (VOID on mismatch), `sim.mjs
// open`, settle, centre the carousel at 0.5 vh (VOID if not in view). Then:
//   rest0   read once while no slide runs (polled with rAF until the carousel is not sliding, read in the same task);
//   t0, t100, t220   the caught slide (same pathname as the first arm, F-176), every carousel animation paused at t;
//   post, post300    after the held 220 ms timer is released (the swap), two rAFs, then 300 ms later (rotator held).
// Each state reads (one synchronous script, so one consistent frame of style and layout):
//   env: dpr, inner size, scroll, visualViewport;
//   carousel: rect (full precision), rect x dpr, computed transform / opacity / will-change / overflow;
//   ancestors up to <html>: class, rect left/top, transform, translate, opacity, filter, will-change, contain, isolation;
//   every carousel img: class, src pathname, naturalWidth/Height, complete, rect (full precision) and its device-px
//   origin (left x dpr, top x dpr) with fractional parts, computed transform, translate, scale, opacity, width,
//   flex-basis, margins, border width, object-fit/-position, will-change, image-rendering, decoding, loading;
//   the drawn content size (rect minus borders, x dpr) next to the natural size.
// Then LayerTree.layersForNode on #people (composited layers: nodeId, bounds, compositedBounds, paintCount, memory) and
// reasonsForCompositingLayer for each layer whose node is a carousel img, the carousel or one of its ancestors.
// node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-carousel-leaver -- \
//   node tools/sim.mjs session --functional --owner fix-carousel-leaver -- node fixes/carousel-leaver/probe/simgeo.mjs <out> base,S=<dir>,F=<dir>,base2,S2=<dir>
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const ARMS = process.argv[3].split(',').map((s) => { const [k, d] = s.split('='); return { k, dir: d || null }; });
const TS = [0, 100, 220];
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileOf = (arm, f) => (arm.dir && existsSync(join(arm.dir, f)) ? join(arm.dir, f) : join(BASE, f));
const CAR = `document.querySelector('#people .start-selling-avatars.is-carousel')`;
const PATH = `(i) => { try { return new URL(i.currentSrc || i.src).pathname; } catch (e) { return ''; } }`;
const HOLD = `(() => { if (window.__holdInstalled) return 1; window.__holdInstalled = 1; const st = window.setTimeout.bind(window); window.__hold = false; window.__held = [];
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st(fn, ms, ...a);
    return st(() => { if (window.__hold) window.__held.push(() => fn(...a)); else fn(...a); }, ms); }; return 1; })()`;
const SLIDING = `((c) => !!(c && (c.querySelector('img.is-exit') || c.classList.contains('is-sliding'))))(${CAR})`;
const LEAD = `((c) => c && c.querySelector('img.is-exit, img.st5-lead'))(${CAR})`;
const CATCH = (target, timeout) => `(window.__cc = null, new Promise((res) => { const P = ${PATH}; const t0 = performance.now(); let was = ${SLIDING};
  const tick = () => { const on = ${SLIDING}; const lead = ${LEAD};
    if (on && !was && lead && (${JSON.stringify(target)} === null || P(lead) === ${JSON.stringify(target)})) {
      const c = ${CAR}; window.__hold = true; window.__lead = lead;
      window.__anims = [...c.querySelectorAll('img')].flatMap((i) => i.getAnimations()); window.__anims.forEach((a) => a.pause());
      return res({ ok: true, lead: P(lead), srcs: [...c.querySelectorAll('img')].map(P), n: window.__anims.length, waited: Math.round(performance.now() - t0) }); }
    was = on; if (performance.now() - t0 > ${timeout}) return res({ ok: false }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }).then((r) => { window.__cc = JSON.stringify(r); }), 1)`;
const RAF2 = `(window.__r2 = 0, requestAnimationFrame(() => requestAnimationFrame(() => { window.__r2 = 1; })), 1)`;
// one synchronous read of everything (GEO), as a function body so the rest0 poll can call it in the same task
const GEOFN = `() => { const P = ${PATH}; const d = devicePixelRatio; const f = (v) => +v.toFixed(5); const fr = (v) => f(v - Math.floor(v + 1e-6));
  const R = (r) => ({ l: f(r.left), t: f(r.top), w: f(r.width), h: f(r.height), dl: f(r.left * d), dt: f(r.top * d), dlFrac: fr(r.left * d), dtFrac: fr(r.top * d), cssFrac: fr(r.left) });
  const c = ${CAR}; const cs = getComputedStyle(c); const vv = window.visualViewport;
  const anc = []; for (let e = c.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    anc.push({ el: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : ''), l: f(r.left), t: f(r.top), transform: s.transform, translate: s.translate, opacity: s.opacity, filter: s.filter, willChange: s.willChange, contain: s.contain, isolation: s.isolation, overflow: s.overflow }); }
  const imgs = [...c.querySelectorAll('img')].map((i, k) => { const s = getComputedStyle(i); const r = i.getBoundingClientRect(); const bw = parseFloat(s.borderLeftWidth) || 0;
    return { k, cls: i.className, src: P(i), nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete, decoding: i.decoding, loading: i.loading, rect: R(r),
      drawnDev: [f((r.width - 2 * bw) * d), f((r.height - 2 * bw) * d)], transform: s.transform, translate: s.translate, scale: s.scale, opacity: s.opacity,
      width: s.width, flexBasis: s.flexBasis, ml: s.marginLeft, mr: s.marginRight, bw: s.borderLeftWidth, of: s.objectFit, op: s.objectPosition,
      willChange: s.willChange, ir: s.imageRendering, origin: s.transformOrigin, offL: i.offsetLeft, offT: i.offsetTop, offW: i.offsetWidth,
      anims: i.getAnimations().map((a) => a.animationName + ':' + Math.round(a.currentTime ?? -1) + ':' + a.playState) }; });
  return { env: { dpr: d, iw: innerWidth, ih: innerHeight, sx: scrollX, sy: scrollY, vv: vv ? { ol: vv.offsetLeft, ot: vv.offsetTop, pl: vv.pageLeft, pt: vv.pageTop, s: vv.scale } : null },
    sliding: c.classList.contains('is-sliding') || !!c.querySelector('img.is-exit'),
    car: { cls: c.className, rect: R(c.getBoundingClientRect()), transform: cs.transform, opacity: cs.opacity, willChange: cs.willChange, overflow: cs.overflow }, anc, imgs }; }`;
const GEO = `JSON.stringify((${GEOFN})())`;
const REST0 = `(window.__g0 = null, new Promise((res) => { const t0 = performance.now(); const tick = () => { if (!${SLIDING}) return res((${GEOFN})());
  if (performance.now() - t0 > 5000) return res({ timeout: true }); requestAnimationFrame(tick); }; tick(); }).then((g) => { window.__g0 = JSON.stringify(g); }), 1)`;
const res = { tool: 'carousel-leaver simgeo (D2, describes only)', note: 'Simulator: computed geometry + LayerTree; no timing, no pixels', startedAt: new Date().toISOString(), ts: TS, arms: {} };
const save = () => writeFileSync(join(OUT, 'simgeo.json'), JSON.stringify(res, null, 1));
let TARGET = process.env.CL_TARGET || null;
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm.k}.json`); rmSync(st, { force: true });
  const ov = arm.dir ? ['--overlay', arm.dir] : [];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null;
  const R = (res.arms[arm.k] = { states: {} });
  try {
    let s = null;
    for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(`${arm.k} server did not start`);
    const url = `http://localhost:${s.port}/`;
    R.served = {};
    for (const f of [NODE, CSS]) {
      const got = sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())), want = sha(readFileSync(fileOf(arm, f)));
      if (got !== want) throw new Error(`VOID: ${arm.k} serves ${f} ${got.slice(0, 12)}, expected ${want.slice(0, 12)}`);
      R.served[f.split('/').pop()] = got.slice(0, 12);
    }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    const poll = async (expr, ms) => { let v = null; for (let i = 0; i < ms / 50 && !v; i++) { v = await ev(expr); if (!v) await sleep(50); } return v; };
    for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(4000);
    const geoJs = `JSON.stringify((() => { const c = ${CAR}; const r = c.getBoundingClientRect(); window.scrollBy({ top: r.top + r.height / 2 - 0.5 * innerHeight, behavior: 'instant' }); const q = c.getBoundingClientRect(); return { vh: innerHeight, vw: innerWidth, dpr: devicePixelRatio, y: scrollY, carTop: q.top, carLeft: q.left, carW: q.width, carH: q.height, inView: q.top >= 0 && q.bottom <= innerHeight }; })())`;
    R.geo = JSON.parse(await ev(geoJs)); await sleep(2500); R.geo2 = JSON.parse(await ev(geoJs));
    if (!R.geo2.inView) { R.void = 'VOID: carousel not in view'; console.log(`${arm.k} ${R.void} ${JSON.stringify(R.geo2)}`); continue; }
    await ev(REST0); const g0 = await poll('window.__g0', 7000); R.states.rest0 = g0 ? JSON.parse(g0) : { timeout: true };
    await ev(HOLD);
    await ev(CATCH(TARGET, 30000));
    const cc = await poll('window.__cc', 35000);
    R.catch = cc ? JSON.parse(cc) : { ok: false, timeout: true };
    console.log(`${arm.k} served ${JSON.stringify(R.served)} y ${R.geo2.y} catch ${JSON.stringify(R.catch)}`);
    if (!R.catch.ok) { R.void = 'VOID: no slide caught'; continue; }
    if (TARGET === null) TARGET = R.catch.lead;
    const raf2 = async () => { await ev(RAF2); await poll('window.__r2', 3000); };
    for (const t of TS) {
      await ev(`(() => { window.__anims.forEach((a) => { a.currentTime = ${t}; }); return 1; })()`);
      await raf2(); R.states['t' + t] = JSON.parse(await ev(GEO));
    }
    await ev(`(() => { window.__anims.forEach((a) => { a.currentTime = 220; }); window.__hold = false; const h = window.__held.splice(0); h.forEach((f) => f()); window.__hold = true; return h.length; })()`);
    await raf2(); R.states.post = JSON.parse(await ev(GEO));
    await sleep(300); R.states.post300 = JSON.parse(await ev(GEO));
    // composited layers under #people (WebKit LayerTree; bounds are page coordinates per the protocol)
    try {
      await c.send('LayerTree.enable');
      const doc = await c.send('DOM.getDocument', { depth: 1 });
      const sec = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#people' });
      const car = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#people .start-selling-avatars.is-carousel' });
      const imgIds = (await c.send('DOM.querySelectorAll', { nodeId: car.nodeId, selector: 'img' })).nodeIds || [];
      const L = (await c.send('LayerTree.layersForNode', { nodeId: sec.nodeId })).layers || [];
      const want = new Set([car.nodeId, ...imgIds]);
      R.layers = { carNodeId: car.nodeId, imgNodeIds: imgIds, count: L.length, all: L };
      R.layerReasons = {};
      for (const l of L) if (want.has(l.nodeId)) { try { const r = (await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId })).compositingReasons; R.layerReasons[l.layerId] = Object.keys(r).filter((k) => r[k]); } catch (e) { R.layerReasons[l.layerId] = 'error: ' + String(e.message || e); } }
      await c.send('LayerTree.disable').catch(() => {});
    } catch (e) { R.layers = { error: String(e.message || e) }; }
    const post = R.states.post;
    console.log(`${arm.k} post imgs ${post.imgs.map((i) => `${i.k}:${i.cls || '-'} x${i.rect.l} dl${i.rect.dl} fr${i.rect.dlFrac} n${i.nw}x${i.nh} tf${i.transform}`).join(' | ')} car ${JSON.stringify(post.car.rect)} layers ${R.layers.count ?? R.layers.error}`);
  } catch (e) {
    R.void = R.void || `VOID: ${String(e.message || e).slice(0, 200)}`; console.log(`${arm.k} ${R.void}`);
  } finally { try { c && c.close(); } catch {} p.kill(); save(); }
}
save(); console.log('EXIT-OK');
