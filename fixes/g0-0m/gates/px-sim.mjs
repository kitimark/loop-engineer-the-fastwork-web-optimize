#!/usr/bin/env node
// g0.0m gate copy (fix-reveal-paint, 2026-10-09; from fixes/g0-0l/gates/, credit fix-scrollcb-g0 and its lineage below): default
// snapshot out/g0-0m/snap (C = g0.0l, V = g0.0m; dir map A=C,V=V), output under out/g0-0m/. Stop tokens may end in 'u'
// (e.g. 300u): a revisit of y 300 after the stops before it, i.e. scrolling back up; scored as its own stop.
// g0.0l gate copy (fix-scrollcb-g0, 2026-10-09; from fixes/g0-box/gates/, credit fix-g0-box, fix-double-drive, int-v8):
// (g0.0l: default snapshot out/g0-0l/snap, C = g0.0k, V = g0.0l, output under out/g0-0l/.)
// g0-box P-168 gate 1 (copy of fixes/double-drive/gates/px-sim.mjs, fix-double-drive, itself a copy of fixes/v8-best/gates/px-sim.mjs, int-v8; arms and settle changed) Simulator (WebKit) pixel A/A at rest, FROZEN FRAMES ONLY, no timing: the WebKit leg of px-chrome.mjs, with
// the load and freeze steps of fixes/gpu-preview/gates/sim-hero-counts.mjs `frames` (wi-gpu-bundle, used with credit).
// Arms from out/g0box/p168/snap ($PX_SNAP; A = g0.0f, V = g0.0g), order A, V, A2, V2, each on its own server and origin
// (port 0, plain http, --no-cache), served hashes checked against HASHES.txt (a mismatch is VOID). Per load: Date.now
// frozen at F, 2.5 s, then per stop: instant scroll, 1.6 s, running non-transition animations paused at 4000 ms + SMIL
// at 4 s, 0.6 s, `simctl io screenshot` (whole screen, 1290x2796), hit grid. The page's top edge in the shot is found
// once with a magenta calibration bar (fixed, top 0, 6 px) and used for the cluster labels only.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/gates/px-sim.mjs [ys]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreStop, line, pngPixels } from '../../v8-best/gates/pxlib.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, process.env.PX_SNAP || 'out/g0-0m/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const ARMS = ['A', 'V', 'A2', 'V2'];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
// PX_RESUME=<px-sim-... dir name> (g0.0m rev 3: a cold Simulator boot can leave too little session time for 4 loads):
// continue a run whose session ended early; loads already complete in its px-partial.json are kept, the rest run now.
const OUT = join(WT, 'out/g0-0m', process.env.PX_RESUME || `px-sim-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const cfg = S.readConfig();
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const SETTLE = +(process.env.PX_SETTLE || 2600); // double-drive: settle after each instant scroll (int-v8 used 1600)

// PX_CAROUSEL=freeze (lead, P-168 wait): stall the people-section avatar carousel. Its loop (JS ~12379-12413 in g0.0f) waits
// with setTimeout(<helper>, 800 | 220); the helper's text (`n.indexOf(r)` ... `n.splice(e, 1), t()`) occurs once in the bundle.
// Installed right after load at y 0, where the row is inactive, so the index stays at its start value in every load. Only those
// timers are dropped; every other timer runs. Each stop records the row's image names and the stall count.
const CAROUSEL = process.env.PX_CAROUSEL === 'freeze';
const STALL = `(() => { if (window.__fwCarStall != null) return 'again'; const st = window.setTimeout; window.__fwCarStall = 0;
  window.setTimeout = function (fn, ms, ...a) { if ((ms === 800 || ms === 220) && typeof fn === 'function' && /indexOf\\(r\\)[\\s\\S]*splice\\(e, 1\\), t\\(\\)/.test(Function.prototype.toString.call(fn))) { window.__fwCarStall++; return 0; } return st.call(this, fn, ms, ...a); };
  return 'ok'; })()`;
const CARSTATE = `JSON.stringify({ stalled: window.__fwCarStall ?? null, sliding: document.querySelectorAll('.is-sliding').length, imgs: [...document.querySelectorAll('.start-selling-avatars.is-carousel img')].map((i) => (i.currentSrc || i.src).split('/').pop() + (i.className ? ':' + i.className : '') + (i.complete ? '' : ':loading')) })`;
const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const HITS = `JSON.stringify((() => { const out = []; const lab = (e) => { if (!e) return null; const sec = e.closest('section[id],section[class],[id]'); const c = (x) => x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : ''; return (sec && sec !== e ? c(sec) + ' > ' : '') + c(e); };
  for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })())`;
const res = { carouselFreeze: CAROUSEL, tool: 'fixes/g0-box/gates/px-sim.mjs', engine: 'webkit-simulator', dpr: 3, arms: ARMS, startedAt: new Date().toISOString(), load1: loadavg()[0], F, loads: [], stops: [] };
let YS = process.argv[2] && process.argv[2] !== 'auto' ? process.argv[2].split(',') : null; const shots = {};
const PART = join(OUT, 'px-partial.json'), done = new Set();
if (process.env.PX_RESUME && existsSync(PART)) {
  const prev = JSON.parse(readFileSync(PART, 'utf8'));
  Object.assign(shots, prev.shots); res.top = prev.res.top; res.calibrationRow = prev.res.calibrationRow; res.resumedFrom = prev.res.startedAt;
  for (const l of prev.res.loads) if (!l.void && l.stops.length === (YS || prev.res.ys).length) { res.loads.push(l); done.add(l.arm); }
  YS = YS || prev.res.ys; console.log('resume', OUT, 'kept loads', [...done].join(','));
}
// optional dir map, as in px-chrome.mjs: A=P,V=V serves arm A (and A2) from snap dir Q (accent-ca-v7)
const DIRMAP = Object.fromEntries((process.argv[3] || 'A=A,V=V').split(',').map((kv) => kv.split('='))); res.dirs = DIRMAP;
for (const arm of ARMS) {
  if (done.has(arm)) continue;
  const d = DIRMAP[arm.replace(/\d+$/, '')];
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, build: d, stops: [] }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== HX[`${d}/${NODE}`] || load.served.css !== HX[`${d}/${CSS}`]) { load.void = 'served ' + JSON.stringify(load.served); console.log('VOID', arm, load.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    // PX_T0=<ms> (g0.0m, as px-chrome's g0.0l rule): wait until the page clock (performance.now) reaches T0 before the
    // carousel stall and the Date.now freeze, so the self-animated hero accent freezes at the same page time in every load
    load.t = { complete: Math.round(await c.evaluate('performance.now()')) };
    if (process.env.PX_T0) { const w = +process.env.PX_T0 - load.t.complete - 2500; if (w > 0) await sleep(w); else load.t.late = true; }
    if (CAROUSEL) load.carouselStall = await c.evaluate(STALL);
    await sleep(2500);
    load.t.freeze = Math.round(await c.evaluate('performance.now()'));
    await c.evaluate(`(() => { window.__pxErr = []; addEventListener('error', (e) => window.__pxErr.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__pxErr.push('rej ' + String(e.reason))); return 1; })()`);
    load.scripts = JSON.parse(await c.evaluate(`JSON.stringify(performance.getEntriesByType('resource').map((e) => e.name.replace(location.origin, '')).filter((n) => n.includes('${NODE}') || n.includes('${CSS}')))`));
    load.viewport = JSON.parse(await c.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, H: document.documentElement.scrollHeight })'));
    await c.evaluate(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`); await sleep(2500);
    if (res.top == null) { // magenta calibration: the page's top edge in the screenshot
      await c.evaluate(`(() => { const b = document.createElement('div'); b.id = '__pxcal'; b.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:6px;background:#ff00ff;z-index:2147483647'; document.body.appendChild(b); return 1; })()`); await sleep(400);
      const f = join(OUT, 'calibration.png'); S.simctl(['io', cfg.udid, 'screenshot', f]);
      await c.evaluate(`(document.getElementById('__pxcal').remove(), 1)`);
      const P = pngPixels(readFileSync(f)); let row = -1;
      for (let y = 0; y < P.h && row < 0; y++) { let m = 0; for (let x = 0; x < P.w; x++) { const i = (y * P.w + x) * P.bpp; if (P.px[i] > 230 && P.px[i + 1] < 40 && P.px[i + 2] > 230) m++; } if (m > P.w * 0.9) row = y; }
      res.top = row >= 0 ? row / 3 : 0; res.calibrationRow = row; await sleep(400);
    }
    if (!YS) { const v = load.viewport; const end = v.H - v.h; const ys = new Set([0, 300, 548, 2796]); for (let i = 1; i <= 8; i++) ys.add(Math.round(v.h + (end - v.h) * i / 9)); ys.add(end); YS = [...ys].filter((y) => y <= end).sort((a, b) => a - b); }
    res.ys = YS;
    for (const tok of YS) {
      const y = parseFloat(tok);
      await c.evaluate(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(SETTLE);
      const fr = JSON.parse(await c.evaluate(FREEZE)); await sleep(600);
      const yy = await c.evaluate('Math.round(scrollY)');
      const f = join(OUT, `${arm}-y${tok}.png`); const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
      const hits = JSON.parse(await c.evaluate(HITS));
      (shots[tok] ||= {})[arm] = { file: f, hits }; load.stops.push({ y: tok, scrollY: yy, frozen: fr, ok: r.status === 0, hits, ...(CAROUSEL ? { carousel: JSON.parse(await c.evaluate(CARSTATE)) } : {}) });
    }
    load.errors = JSON.parse(await c.evaluate('JSON.stringify(window.__pxErr || [])'));
  } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.loads.push(load); res.ys = YS; writeFileSync(PART, JSON.stringify({ res, shots })); }
  console.log(`load ${arm}: ${load.stops.length} stops, errors ${JSON.stringify(load.errors || [])}, viewport ${JSON.stringify(load.viewport)}, scripts ${JSON.stringify(load.scripts)}`);
}
for (const y of YS || []) {
  const Sx = shots[y]; if (!Sx || ARMS.some((a) => !Sx[a])) { res.stops.push({ y, void: 'missing arm' }); continue; }
  const row = { y, ...scoreStop(Object.fromEntries(ARMS.map((a) => [a, Sx[a].file])), { V: Sx.V.hits, V2: Sx.V2.hits }, 3, res.top || 0) };
  res.stops.push(row); console.log(line(y, row));
}
res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
writeFileSync(join(OUT, 'px.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'px.json'));
