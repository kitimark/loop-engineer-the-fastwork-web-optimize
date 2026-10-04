#!/usr/bin/env node
// v9-best: copy of fixes/v8-best/gates/sim-ipad.mjs (int-v8); only the snapshot (V9_SNAP=out/v9/snap-<js12>, A = v8, V = v9 from
// fixes/v9-best/build.mjs), the output folder (out/v9) and the tool paths changed. The v8-era header below is kept as is.
// v8 (V) vs v7 (A) on the iPad Simulator (WebKit), frozen frames only, no timing: int-v8's copy of de-breakpoints-v7's
// research/breakpoints/sim-ipad.mjs (64a6b17a, with credit); only the arms (A, A2 = v7 from out/v9/snap/A; V, V2 = v8 from
// out/v9/snap/V, both hash-checked against HASHES.txt before every load), the paths and the tool name changed.
// Each load has its own server (port 0, --no-cache). Every arm gets the same TEST-ONLY
// scaffold overlay (never committed, written to <out>/errhook): index.html with `<script src="/__errhook.js">` first in
// head, which records window errors, resource-load failures (capture phase) and console.error calls from the very first
// script on (the page's CSP forbids inline scripts, hence a file). Per load: Date.now frozen at one value, 2.5 s, then
// per stop (top, hero, people, pain, commission, end): instant scroll, 1.6 s, running non-transition animations paused
// at 4000 ms and SMIL at 4 s, 0.6 s, `simctl io screenshot`. The countdown is NOT masked (Date.now is frozen the same in
// every arm, so its digits are comparable); the hero accent word follows a timer: its phase is the A/A noise.
// --hide <selectors>: visibility:hidden on them in every arm (the hero title: its accent word follows a timer, and the frozen Date.now
// stalls it differently per build); the countdown stays visible.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner int-v8 -- \
//     node tools/sim.mjs --device fw-ipad session --functional --owner int-v8 -- node fixes/v9-best/gates/sim-ipad.mjs [--orient landscape] [--out dir]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreStop, line, pngPixels } from './pxlib.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = process.env.V9_SNAP ? join(WT, process.env.V9_SNAP) : (() => { console.error('set V9_SNAP=out/v9/snap-<js12> (fixes/v9-best/build.mjs prints it)'); process.exit(2); })();
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const ARMS = ['A', 'V', 'A2', 'V2'];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const ORIENT = arg('--orient', 'portrait');
const SETTLE = Number(arg('--settle', 1600)); // ms after each scroll before the freeze (entrance transitions of 1.6 s must have ended: use 4000 for slow hosts)
const YOVR = arg('--ys', ''); // explicit scroll stops (CSS px), default: the six named stops of this load
const HIDE = arg('--hide', ''); // CSS selector(s) hidden (visibility) in every arm after load, e.g. '.hero-title' (the accent word's timer phase)
const OUT = resolve(arg('--out', join(WT, 'out/v9', `ipad-${ORIENT}-${tag}`))); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const cfg = S.readConfig();
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const UDID = process.env.FW_SIM_UDID || cfg.udid;

// scaffold overlay: baseline index.html + an error hook script, the same in every arm
const SCAF = join(OUT, 'errhook'); mkdirSync(SCAF, { recursive: true });
writeFileSync(join(SCAF, '__errhook.js'), `window.__bpErr = { exc: [], res: [], con: [] };
addEventListener('error', function (e) { if (e.target && e.target !== window && e.target.tagName) window.__bpErr.res.push(e.target.tagName + ' ' + (e.target.src || e.target.href || '')); else window.__bpErr.exc.push(String(e.message) + ' @' + e.lineno + ':' + e.colno); }, true);
addEventListener('unhandledrejection', function (e) { window.__bpErr.exc.push('rejection ' + String(e.reason)); });
var ce = console.error; console.error = function () { try { window.__bpErr.con.push([].slice.call(arguments).map(String).join(' ').slice(0, 200)); } catch (x) {} return ce.apply(console, arguments); };
`);
const idx = readFileSync(join(BASE, 'index.html'), 'utf8');
if (!idx.includes('<meta charset="utf-8" />')) throw new Error('index.html head changed: scaffold refused');
writeFileSync(join(SCAF, 'index.html'), idx.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n\t\t<script src="/__errhook.js"></script>'));

const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {}
  } for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const HITS = `JSON.stringify((() => { const out = []; const lab = (e) => { if (!e) return null; const sec = e.closest('section[id],section[class],[id]'); const c = (x) => x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className ? '.' + x.className.trim().split(/\\s+/).filter((k) => !k.startsWith('svelte-'))[0] : '') : ''; return c(sec) + ' > ' + c(e); };
  for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })())`;
const STOPS = `JSON.stringify((() => { const abs = (s, f = 0) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY + f * innerHeight) : null; };
  const max = document.documentElement.scrollHeight - innerHeight; const o = { top: 0, hero: abs('.hero-track', 0.5), people: abs('#people', 0.5), pain: abs('.pain'), commission: abs('.commission'), end: max };
  for (const k in o) if (o[k] != null) o[k] = Math.min(o[k], max); return o; })())`;
const MQ = { w600: '(min-width: 601px)', w861: '(min-width: 861px)', w1000: '(max-width: 1000px)', w1200: '(max-width: 1200px)', hoverNone: '(hover: none)', coarse: '(pointer: coarse)', maxDev500: '(max-device-width: 500px)', reduce: '(prefers-reduced-motion: reduce)',
  combo860: '(max-width: 860px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)', combo1000: '(max-width: 1000px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)' };
const MQJS = `JSON.stringify(Object.fromEntries(Object.entries(${JSON.stringify(MQ)}).map(([k, q]) => [k, matchMedia(q).matches])))`;

const res = { tool: 'fixes/v9-best/gates/sim-ipad.mjs', engine: 'webkit-simulator', device: cfg.name || 'fw-ipad', orient: ORIENT, arms: ARMS, startedAt: new Date().toISOString(), F, loads: [], stops: [] };
if (ORIENT === 'landscape') {
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'wda', 'start'], { stdio: ['ignore', 'inherit', 'inherit'] });
  const o = execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'orient', 'landscape'], { encoding: 'utf8' }); console.log(o.trim());
}
let YS = null; const shots = {};
for (const arm of ARMS) {
  const d = arm.startsWith('V') ? 'V' : 'A';
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const ovl = d ? `${SCAF},${join(SNAP, d)}` : SCAF;
  const slog = join(OUT, `serve-${arm}.log`);
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ovl, '--port', '0', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', openSync(slog, 'a'), openSync(slog, 'a')] });
  const load = { arm, build: d || 'baseline', stops: [] }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    const want = { js: HX[`${d}/${NODE}`], css: HX[`${d}/${CSS}`] };
    if (load.served.js !== want.js || load.served.css !== want.css) { load.void = 'served ' + JSON.stringify(load.served) + ' want ' + JSON.stringify(want); console.log('VOID', arm, load.void); continue; }
    load.hook = (await (await fetch(new URL('/__errhook.js', url))).text()).length > 100;
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(2500);
    load.viewport = JSON.parse(await c.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, H: document.documentElement.scrollHeight, sw: screen.width, sh: screen.height, ua: navigator.userAgent.slice(0, 90) })'));
    load.mq = JSON.parse(await c.evaluate(MQJS));
    load.errors = JSON.parse(await c.evaluate('JSON.stringify(window.__bpErr || "no hook")'));
    load.scripts = JSON.parse(await c.evaluate(`JSON.stringify(performance.getEntriesByType('resource').map((e) => e.name.replace(location.origin, '')).filter((n) => n.includes('${NODE}') || n.includes('${CSS}')))`));
    if (HIDE) await c.evaluate(`(() => { const sh = new CSSStyleSheet(); sh.replaceSync(${JSON.stringify(HIDE + ' { visibility: hidden !important; }')}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh]; return 1; })()`);
    await c.evaluate(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`); await sleep(2500);
    if (res.top == null) { // magenta calibration: the page's top edge in the screenshot, in CSS px
      await c.evaluate(`(() => { const b = document.createElement('div'); b.id = '__pxcal'; b.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:6px;background:#ff00ff;z-index:2147483647'; document.body.appendChild(b); return 1; })()`); await sleep(600);
      const f = join(OUT, 'calibration.png'); S.simctl(['io', UDID, 'screenshot', f]);
      await c.evaluate(`(document.getElementById('__pxcal').remove(), 1)`);
      const P = pngPixels(readFileSync(f)); let row = -1;
      for (let y = 0; y < P.h && row < 0; y++) { let m = 0; for (let x = 0; x < P.w; x++) { const i = (y * P.w + x) * P.bpp; if (P.px[i] > 230 && P.px[i + 1] < 40 && P.px[i + 2] > 230) m++; } if (m > P.w * 0.9) row = y; }
      res.dpr = load.viewport.dpr; res.shot = [P.w, P.h]; res.top = row >= 0 ? row / res.dpr : 0; res.calibrationRow = row; await sleep(400);
    }
    if (!YS && YOVR) { YS = YOVR.split(',').map(Number); res.stopsMap = 'explicit'; }
    if (!YS) { const stops = JSON.parse(await c.evaluate(STOPS)); res.stopsMap = stops; YS = [...new Set(Object.values(stops).filter((v) => v != null))].sort((a, b) => a - b); }
    res.ys = YS;
    for (const y of YS) {
      await c.evaluate(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(SETTLE);
      const fr = JSON.parse(await c.evaluate(FREEZE)); await sleep(600);
      const yy = await c.evaluate('Math.round(scrollY)');
      const f = join(OUT, `${arm}-y${y}.png`); const r = S.simctl(['io', UDID, 'screenshot', f]);
      const hits = JSON.parse(await c.evaluate(HITS));
      (shots[y] ||= {})[arm] = { file: f, hits }; load.stops.push({ y, scrollY: yy, frozen: fr, ok: r.status === 0 });
    }
    load.errorsEnd = JSON.parse(await c.evaluate('JSON.stringify(window.__bpErr || "no hook")'));
  } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.loads.push(load); }
  const gets = existsSync(slog) ? readFileSync(slog, 'utf8').split('\n').filter((l) => /\b(404|40\d|50\d)\b/.test(l)).slice(0, 10) : [];
  load.serverErr = gets;
  console.log(`load ${arm}: ${load.stops.length} stops, errors ${JSON.stringify(load.errorsEnd || load.errors || [])}, viewport ${JSON.stringify(load.viewport)}, scripts ${JSON.stringify(load.scripts)}, server 4xx/5xx lines ${gets.length}`);
  console.log(`  mq ${JSON.stringify(load.mq)}`);
}
for (const y of YS || []) {
  const Sx = shots[y]; if (!Sx || ARMS.some((a) => !Sx[a])) { res.stops.push({ y, void: 'missing arm' }); continue; }
  const row = { y, ...scoreStop(Object.fromEntries(ARMS.map((a) => [a, Sx[a].file])), { V: Sx.V.hits, V2: Sx.V2.hits }, res.dpr || 2, res.top || 0) };
  res.stops.push(row); console.log(line(y, row));
}
res.endedAt = new Date().toISOString();
writeFileSync(join(OUT, 'px.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'px.json'));

