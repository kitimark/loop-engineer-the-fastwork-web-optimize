#!/usr/bin/env node
// panel-height (fix-panel-height, user T-204 #20): Simulator (fw-sim 15 Pro Max, Safari) COUNTS, GEOMETRY and SHOTS
// only, no timing (Simulator ms are never judged, F-084; memory defer-timing-focus-call-tree). Structure adapted from
// fix-end-morph's em-sim.mjs (fixes/end-morph-p1/em-sim.mjs, credit): own server per arm, plain http, --no-cache.
// Per arm (an overlay dir; out/ph/{A,S,D} from fixes/panel-height/build.mjs):
//   1. load, walk the page (scripted scrolls never move Safari's toolbar), scroll to the end (m = 1, toolbar SHOWN):
//      geometry (innerHeight, visualViewport, 100vh/svh/lvh/dvh probe heights, nav and panel rects, overflow =
//      nav bottom - visible bottom), Date.now frozen + CSS animations paused, two screenshots (A/A).
//   2. from endStart - 300, finger strokes up 380 px into the end (Safari collapses its toolbar while the content scrolls): the same
//      geometry and two shots, toolbar COLLAPSED. Animations resumed after the shots.
//   3. Count phases with WebKit Timeline on (record counts only) and a rAF logger (innerHeight, scrollY, the nav's
//      --morph, its height from a ResizeObserver; no layout reads):
//        endShow   at the end, toolbar collapsed: finger down 160 px (Safari shows the toolbar; the page scrolls up a bit, the panel starts to close)
//        endHide   finger up 380 px (back to the end, toolbar collapses)   (endShow/endHide x2)
//        midShow / midHide   the same two strokes at scrollY ~2400 (pill state, m = 0): P1b's probe still exists there
//      Per phase: RenderingFrame count, Layout / RecalculateStyles / Paint (count, kpx) records, ObserverCallback
//      records by type, script records; logger: frames, toolbar-moving frames (min < innerHeight < max), distinct
//      nav heights, frames with 0.001 < m < 1.
//   4. (--probe, once per run, on the first arm) the lead's decisive dvh check: fixed hidden probes 100dvh / 100svh /
//      100lvh / 100vh, getBoundingClientRect per rAF plus a ResizeObserver, during midHide + midShow strokes: distinct
//      heights and RO callbacks per transition.
// Run (functional Simulator session, shared slot; WDA-sim must be started inside it):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-panel-height -- \
//     node tools/sim.mjs session --functional --owner fix-panel-height -- sh -c \
//     'node tools/sim.mjs wda start && node fixes/panel-height/ph-sim.mjs --arms A,D [--probe] [--label x]'
// Output: out/ph/sim-<label>-<stamp>/ (ph.json, tl-<arm>.json, shots <arm>-<state>-<k>.png). Gitignored.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
const wda = await import(join(WT, 'tools/lib/wda.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--arms') || 'A,S,D').split(',').filter(Boolean);
const PROBE = process.argv.includes('--probe');
const CYCLES = Number(arg('--cycles', '2'));
const MIDC = Number(arg('--mid-cycles', String(CYCLES)));
const LABEL = arg('--label', ARMS.join(''));
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/ph', `sim-${LABEL}-${STAMP}`); mkdirSync(OUT, { recursive: true });
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const UDID = process.env.FW_SIM_UDID;
if (!UDID) throw new Error('run inside sim.mjs session (FW_SIM_UDID unset)');
const WDA_BASE = `http://127.0.0.1:${process.env.FW_SIM_WDA_PORT || 8101}`;
const F = 1791115200500; // frozen Date.now for the shots (as em-p1-px.mjs)

const FREEZE = `(() => { const F = ${F}; window.__phDN = window.__phDN || Date.now; Date.now = () => F; let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} } return n; })()`;
const RESUME = `(() => { if (window.__phDN) Date.now = window.__phDN; for (const a of document.getAnimations()) { try { if (!(a instanceof CSSTransition) && a.playState === 'paused') a.play(); } catch {} } return 1; })()`;
// geometry, read at rest (layout reads are fine here: no count phase runs)
const GEO = `JSON.stringify((() => {
  const mk = (u) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;height:100' + u; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return Math.round(h * 100) / 100; };
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top * 100) / 100, bottom: Math.round(b.bottom * 100) / 100, h: Math.round(b.height * 100) / 100, w: Math.round(b.width * 100) / 100 }; };
  const h = document.querySelector('header.start-selling-top-nav'); const vv = window.visualViewport;
  const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  const nav = r(h), visBottom = vv ? vv.offsetTop + vv.height : innerHeight;
  const probe = document.querySelector('.fw-rv-size');
  return { y: Math.round(scrollY * 10) / 10, max, endStart: max - t, t, ih: innerHeight, vvH: vv ? vv.height : null, vvTop: vv ? vv.offsetTop : null,
    units: { vh: mk('vh'), svh: mk('svh'), lvh: mk('lvh'), dvh: mk('dvh') }, m: h ? h.style.getPropertyValue('--morph') : null, rv: h ? h.hasAttribute('data-fw-rv') : null,
    panelH: h ? getComputedStyle(h).getPropertyValue('--panel-h').trim() : null, nav, overflow: nav ? Math.round((nav.bottom - visBottom) * 100) / 100 : null,
    gapTop: nav ? nav.top : null, gapBottom: nav ? Math.round((visBottom - nav.bottom) * 100) / 100 : null,
    footer: r(document.querySelector('header.start-selling-top-nav .start-selling-morph-footer')), panel: r(document.querySelector('header.start-selling-top-nav .start-selling-morph-panel')),
    probe: r(probe), glass: r(document.querySelector('.fw-rv-glass')) }; })())`;
// rAF logger: [t, innerHeight, scrollY, m, data-fw-rv]; RO on the nav (no layout read); __phMark for phases
const LOGGER = `(() => { if (window.__ph) return 'already'; const L = window.__ph = { f: [], ro: [], on: true }; const h = document.querySelector('header.start-selling-top-nav');
  const tick = () => { if (!L.on) return; L.f.push([+performance.now().toFixed(1), innerHeight, Math.round(scrollY), h ? h.style.getPropertyValue('--morph') : '', h && h.hasAttribute('data-fw-rv') ? 1 : 0]); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  if (h) new ResizeObserver((es) => { for (const x of es) { const b = x.borderBoxSize && x.borderBoxSize[0]; L.ro.push([+performance.now().toFixed(1), b ? Math.round(b.blockSize * 100) / 100 : Math.round(x.contentRect.height * 100) / 100]); } }).observe(h);
  return 'ok'; })()`;
// the lead's decisive dvh check: rect per rAF + RO, four probes
const PROBES = `(() => { const P = window.__php = { f: [], ro: [], on: true }; const els = {};
  for (const u of ['dvh', 'svh', 'lvh', 'vh']) { const d = document.createElement('div'); d.className = 'ph-probe-' + u; d.style.cssText = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;height:100' + u; document.body.appendChild(d); els[u] = d; }
  const ro = new ResizeObserver((es) => { P.ro.push([+performance.now().toFixed(1), es.map((x) => [x.target.className.slice(9), Math.round(x.contentRect.height * 100) / 100])]); });
  for (const u in els) ro.observe(els[u]);
  const tick = () => { if (!P.on) return; P.f.push([+performance.now().toFixed(1), innerHeight, ...['dvh', 'svh', 'lvh', 'vh'].map((u) => Math.round(els[u].getBoundingClientRect().height * 100) / 100)]); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  P.stop = () => { P.on = false; ro.disconnect(); for (const u in els) els[u].remove(); }; return 'ok'; })()`;

const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...xs) - x), h: Math.round(Math.max(...ys) - y) }; };
function tlStats(recs, a, b) {
  const o = { frames: 0, layouts: 0, styles: 0, paints: 0, kpx: 0, framesWithLayout: 0, framesWithStyle: 0, framesWithPaint: 0, observer: {}, script: {}, bigPaints: {} };
  for (const r of recs) {
    if (r.type !== 'RenderingFrame') continue;
    const t = r.startTime * 1000; if (t < a || t >= b) continue;
    o.frames++; let L = 0, S = 0, P = 0;
    const walk = (x) => {
      if (x.type === 'Paint') { P++; if (x.data?.clip) { const q = box(x.data.clip); o.kpx += (q.w * q.h) / 1e3; if (q.w * q.h >= 100000) { const k = `${q.w}x${q.h}`; o.bigPaints[k] = (o.bigPaints[k] || 0) + 1; } } }
      else if (x.type === 'Layout') L++;
      else if (x.type === 'RecalculateStyles') S++;
      else if (x.type === 'ObserverCallback') { const k = x.data?.type || '?'; o.observer[k] = (o.observer[k] || 0) + 1; }
      else if (/^(FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|EvaluateScript)$/.test(x.type)) { const k = x.type + (x.data?.type ? ':' + x.data.type : ''); o.script[k] = (o.script[k] || 0) + 1; }
      for (const ch of x.children || []) walk(ch);
    };
    walk(r);
    o.layouts += L; o.styles += S; o.paints += P; if (L) o.framesWithLayout++; if (S) o.framesWithStyle++; if (P) o.framesWithPaint++;
  }
  o.kpx = Math.round(o.kpx);
  return o;
}
// ObserverCallback can also sit outside RenderingFrame records (top level): count those too
function topObservers(recs, a, b) { const o = {}; for (const r of recs) { if (r.type !== 'ObserverCallback') continue; const t = r.startTime * 1000; if (t < a || t >= b) continue; const k = r.data?.type || '?'; o[k] = (o[k] || 0) + 1; } return o; }
function logStats(L, a, b) {
  const f = L.f.filter((x) => x[0] >= a && x[0] < b), ro = L.ro.filter((x) => x[0] >= a && x[0] < b);
  const ihs = f.map((x) => x[1]); const lo = Math.min(...ihs), hi = Math.max(...ihs);
  return { frames: f.length, ihMin: lo, ihMax: hi, toolbarMoving: f.filter((x) => x[1] > lo && x[1] < hi).length, ihDistinct: new Set(ihs).size,
    yFrom: f[0]?.[2], yTo: f.at(-1)?.[2], mFrom: f[0]?.[3], mTo: f.at(-1)?.[3], morphingFrames: f.filter((x) => +x[3] > 0.001 && +x[3] < 1).length, rvFrames: f.filter((x) => x[4]).length,
    navRO: ro.length, navHeights: [...new Set(ro.map((x) => x[1]))].slice(0, 30) };
}
const shot = (name) => { const f = join(OUT, `${name}.png`); execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: 'ignore' }); return f; };
const stroke = (dir, px, ms = 500, x = 215) => {
  const y0 = dir === 'up' ? 600 : 300, y1 = dir === 'up' ? y0 - px : y0 + px, n = Math.max(2, Math.round(ms / 50)); const acts = [{ type: 'pointerMove', duration: 0, x, y: y0 }, { type: 'pointerDown', button: 0 }];
  for (let i = 1; i <= n; i++) { const p = i / n, e = p * p * (3 - 2 * p); acts.push({ type: 'pointerMove', duration: Math.round(ms / n), x, y: Math.round(y0 + (y1 - y0) * e) }); }
  acts.push({ type: 'pause', duration: 120 }, { type: 'pointerUp', button: 0 }); // ends at rest (no fling)
  return { actions: [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: acts }] };
};

const res = { tool: 'fixes/panel-height/ph-sim.mjs', label: LABEL, startedAt: new Date().toISOString(), cycles: CYCLES, arms: [] };
const W = await wda.createSession({ base: WDA_BASE, simulator: true });
try {
  for (const [i, key] of ARMS.entries()) {
    const dir = join(WT, 'out/ph', key);
    const st = join(OUT, `serve-${key}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const run = { arm: key, dir, geo: {}, shots: {}, phases: {} };
    let c = null;
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/`;
      run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
      await sleep(2000);
      c = await openTab(`localhost:${s.port}`);
      for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
      await sleep(1500);
      run.ua = await c.evaluate(`navigator.userAgent.replace(/.*Version\\/([\\d.]+).*/, '$1')`);
      for (const f of [0.25, 0.5, 0.75]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(500); }
      const end = async () => { await c.evaluate(`(window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 0)`); await sleep(1500); };
      await end();
      // 1. toolbar shown, at the end
      run.geo.shown = JSON.parse(await c.evaluate(GEO));
      await c.evaluate(FREEZE); await sleep(400);
      run.shots.shown = [shot(`${key}-shown-1`), (await sleep(700), shot(`${key}-shown-2`))];
      run.geo.shownAfterShots = JSON.parse(await c.evaluate(GEO));
      await c.evaluate(RESUME);
      // 2. reach the end with the toolbar collapsed: at the page's max a stroke cannot scroll, so Safari keeps its
      // toolbar (run AD1); instead start above the morph zone and scroll into the end by finger strokes (the content
      // scrolls, so Safari collapses the toolbar on the way), up to 5 strokes until scrollY reaches the max
      { const g = run.geo.shown; await c.evaluate(`(window.scrollTo({ top: ${g.endStart - 300}, behavior: 'instant' }), 0)`); await sleep(1200);
        run.collapseStrokes = [];
        for (let k = 0; k < 5; k++) { await W.actions(stroke('up', 380)); await sleep(1500); const q = JSON.parse(await c.evaluate(`JSON.stringify([Math.round(scrollY), innerHeight, document.documentElement.scrollHeight - innerHeight])`)); run.collapseStrokes.push(q); if (q[0] >= q[2] - 1) break; } }
      run.geo.collapsed = JSON.parse(await c.evaluate(GEO));
      await c.evaluate(FREEZE); await sleep(400);
      run.shots.collapsed = [shot(`${key}-collapsed-1`), (await sleep(700), shot(`${key}-collapsed-2`))];
      run.geo.collapsedAfterShots = JSON.parse(await c.evaluate(GEO));
      await c.evaluate(RESUME);
      console.log(key, 'served', JSON.stringify(run.served), 'safari', run.ua, 'collapse strokes [y, ih, max]', JSON.stringify(run.collapseStrokes));
      for (const k of ['shown', 'collapsed']) { const g = run.geo[k]; console.log(key, k.padEnd(9), 'y', g.y, 'max', g.max, 'ih', g.ih, 'vv', g.vvH, 'units', JSON.stringify(g.units), 'm', g.m, 'rv', g.rv, 'nav', JSON.stringify(g.nav), 'overflow', g.overflow, 'gapBottom', g.gapBottom, 'footerBottom', g.footer?.bottom); }
      // 3. count phases (Timeline on)
      await c.evaluate(LOGGER);
      const recs = [];
      c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
      const syncT = await c.evaluate(timelineSyncJs('ph-sync'));
      const phase = async (name, fn) => { const t0 = await c.evaluate('performance.now()'); await fn(); await sleep(1500); const t1 = await c.evaluate('performance.now()'); run.phases[name] = { t0, t1 }; };
      for (let k = 1; k <= CYCLES; k++) {
        await phase(`endShow${k}`, () => W.actions(stroke('down', 160)));
        await phase(`endHide${k}`, () => W.actions(stroke('up', 380)));
      }
      await c.evaluate(`(window.scrollTo({ top: 2400, behavior: 'instant' }), 0)`); await sleep(1200);
      for (let k = 1; k <= MIDC; k++) {
        await phase(`midHide${k}`, () => W.actions(stroke('up', 300)));
        await phase(`midShow${k}`, () => W.actions(stroke('down', 140)));
      }
      await c.send('Timeline.stop').catch(() => {});
      await sleep(1200);
      const L = JSON.parse(await c.evaluate(`JSON.stringify({ f: window.__ph.f, ro: window.__ph.ro })`));
      await c.evaluate('(window.__ph.on = false, 1)');
      const syncTL = findTimeStamp(recs, 'ph-sync');
      if (syncTL == null) throw new Error('no Timeline sync mark');
      const off = syncTL * 1000 - syncT;
      for (const [name, ph] of Object.entries(run.phases)) {
        ph.tl = tlStats(recs, ph.t0 + off, ph.t1 + off); ph.topObservers = topObservers(recs, ph.t0 + off, ph.t1 + off); ph.log = logStats(L, ph.t0, ph.t1);
        const a = ph.tl, g = ph.log;
        console.log(key, name.padEnd(9), `y ${g.yFrom}->${g.yTo} m ${g.mFrom}->${g.mTo} ih ${g.ihMin}-${g.ihMax} moving ${g.toolbarMoving} morphing ${g.morphingFrames} rv ${g.rvFrames} | navRO ${g.navRO} heights ${JSON.stringify(g.navHeights.slice(0, 8))}`,
          `| TL frames ${a.frames} layouts ${a.layouts} (${a.framesWithLayout} fr) styles ${a.styles} (${a.framesWithStyle} fr) paints ${a.paints} kpx ${a.kpx} big ${JSON.stringify(a.bigPaints)} obs ${JSON.stringify(a.observer)} top-obs ${JSON.stringify(ph.topObservers)}`);
      }
      writeFileSync(join(OUT, `tl-${key}.json`), JSON.stringify({ offsetMs: off, recs, logger: L }));
      // 4. the decisive dvh check (once)
      if (PROBE && i === 0) {
        await c.evaluate(`(window.scrollTo({ top: 2400, behavior: 'instant' }), 0)`); await sleep(1000);
        await c.evaluate(PROBES); const pr = {};
        for (const [name, d, px] of [['hide', 'up', 300], ['show', 'down', 140], ['hide2', 'up', 300], ['show2', 'down', 140]]) {
          const t0 = await c.evaluate('performance.now()'); await W.actions(stroke(d, px)); await sleep(1500); const t1 = await c.evaluate('performance.now()');
          pr[name] = { t0, t1 };
        }
        const P = JSON.parse(await c.evaluate(`(() => { const P = window.__php; P.stop(); return JSON.stringify({ f: P.f, ro: P.ro }); })()`));
        for (const [name, w] of Object.entries(pr)) {
          const f = P.f.filter((x) => x[0] >= w.t0 && x[0] < w.t1), ro = P.ro.filter((x) => x[0] >= w.t0 && x[0] < w.t1);
          const col = (j) => [...new Set(f.map((x) => x[j]))];
          w.frames = f.length; w.ih = col(1); w.dvh = col(2); w.svh = col(3); w.lvh = col(4); w.vh = col(5);
          w.roCallbacks = ro.length; w.roDvh = ro.flatMap((x) => x[1].filter((e) => e[0] === 'dvh').map((e) => e[1])); w.roOther = ro.flatMap((x) => x[1].filter((e) => e[0] !== 'dvh').map((e) => e.join(':')));
          // per frame: does the dvh height track innerHeight in the same rAF?
          w.dvhEqualsIh = f.filter((x) => Math.abs(x[2] - x[1]) < 0.5).length;
          console.log('PROBE', name.padEnd(5), 'frames', w.frames, 'ih', JSON.stringify(w.ih), 'dvh', JSON.stringify(w.dvh), 'svh', JSON.stringify(w.svh), 'lvh', JSON.stringify(w.lvh), 'vh', JSON.stringify(w.vh), 'RO', w.roCallbacks, 'RO dvh', JSON.stringify(w.roDvh), 'other', JSON.stringify(w.roOther), 'dvh==ih frames', w.dvhEqualsIh);
        }
        run.probe = { windows: pr, raw: P };
      }
    } catch (e) { run.error = String(e.stack || e.message || e); console.log(key, 'error', run.error); }
    finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms.push(run);
  }
} finally { await W.close(); }
res.endedAt = new Date().toISOString();
writeFileSync(join(OUT, 'ph.json'), JSON.stringify(res, null, 1));
console.log('WROTE', join(OUT, 'ph.json'));
