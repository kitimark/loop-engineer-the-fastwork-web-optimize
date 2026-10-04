#!/usr/bin/env node
// v7-best Simulator (WebKit) pixel A/A at rest, FROZEN FRAMES ONLY, no timing: the WebKit leg of px-chrome.mjs, with
// the load and freeze steps of fixes/gpu-preview/gates/sim-hero-counts.mjs `frames` (wi-gpu-bundle, used with credit).
// Arms from out/v7-best/snap (A = v6-best-br2, V = v7-best), order A, V, A2, V2, each on its own server and origin
// (port 0, plain http, --no-cache), served hashes checked against HASHES.txt (a mismatch is VOID). Per load: Date.now
// frozen at F, 2.5 s, then per stop: instant scroll, 1.6 s, running non-transition animations paused at 4000 ms + SMIL
// at 4 s, 0.6 s, `simctl io screenshot` (whole screen, 1290x2796), hit grid. The page's top edge in the shot is found
// once with a magenta calibration bar (fixed, top 0, 6 px) and used for the cluster labels only.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner wave-v7 -- \
//     node tools/sim.mjs session --functional --owner wave-v7 -- node fixes/v7-best/gates/px-sim.mjs [ys]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreStop, line, pngPixels } from './pxlib.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/v7-best/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const ARMS = ['A', 'V', 'A2', 'V2'];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/v7-best', `px-sim-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const cfg = S.readConfig();
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const HITS = `JSON.stringify((() => { const out = []; const lab = (e) => { if (!e) return null; const sec = e.closest('section[id],section[class],[id]'); const c = (x) => x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : ''; return (sec && sec !== e ? c(sec) + ' > ' : '') + c(e); };
  for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })())`;
const res = { tool: 'fixes/v7-best/gates/px-sim.mjs', engine: 'webkit-simulator', dpr: 3, arms: ARMS, startedAt: new Date().toISOString(), load1: loadavg()[0], F, loads: [], stops: [] };
let YS = process.argv[2] && process.argv[2] !== 'auto' ? process.argv[2].split(',').map(Number) : null; const shots = {};
// optional dir map, as in px-chrome.mjs: A=P,V=V serves arm A (and A2) from snap dir P (best + rest-script)
const DIRMAP = Object.fromEntries((process.argv[3] || 'A=A,V=V').split(',').map((kv) => kv.split('='))); res.dirs = DIRMAP;
for (const arm of ARMS) {
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
    await sleep(2500);
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
    for (const y of YS) {
      await c.evaluate(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(1600);
      const fr = JSON.parse(await c.evaluate(FREEZE)); await sleep(600);
      const yy = await c.evaluate('Math.round(scrollY)');
      const f = join(OUT, `${arm}-y${y}.png`); const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
      const hits = JSON.parse(await c.evaluate(HITS));
      (shots[y] ||= {})[arm] = { file: f, hits }; load.stops.push({ y, scrollY: yy, frozen: fr, ok: r.status === 0, hits });
    }
    load.errors = JSON.parse(await c.evaluate('JSON.stringify(window.__pxErr || [])'));
  } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.loads.push(load); }
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
