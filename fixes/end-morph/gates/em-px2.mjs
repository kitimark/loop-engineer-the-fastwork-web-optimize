// end-morph (fix-end-morph): frozen-frame pixel gate of a JS+CSS candidate overlay V against a base overlay A, at morph
// positions in the end zone (7d), COUNTS/PIXELS ONLY, no timing. PR-010 multi-pair A/A: four loads in the order A, V, A2,
// V2 (each its own server/origin, plain http, --no-cache); per stop the score of fixes/v9-best/gates/pxlib.mjs scoreStop
// (A~V beyond A~A2, A2~V2 beyond V~V2, "consistent" = over 8 in all four cross pairs while neither A/A pair is).
// Freeze per load (as fixes/v9-best/gates/px-sim.mjs / px-chrome.mjs, int-v8): Date.now frozen at F after load; per stop:
// a synthetic held touch (an Event 'touchstart' with touches/changedTouches, dispatched on window: only the 7d settle's
// passive window listener sees it, so the page does not settle), instant scroll to endStart + m * t, wait, running
// non-transition animations paused at 4000 ms + SMIL at 4 s, shot, hit grid. Stops go up (open) then down (close).
//   Chrome:    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//                node fixes/end-morph/gates/em-px2.mjs --engine chrome --a <dir> --v <dir> [--h 775] [--label x]
//   Simulator: node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-morph -- \
//                node tools/sim.mjs session --functional --owner fix-end-morph -- node fixes/end-morph/gates/em-px2.mjs --engine sim --a <dir> --v <dir>
// Shots and px.json go to out/end-morph/px2-<engine>-<label>-<stamp>/ (gitignored).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { scoreStop, line, pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chrome');
const DIR = { A: resolve(WT, arg('--a', 'fixes/end-morph/overlay')), V: resolve(WT, arg('--v', '')) };
if (!arg('--v')) throw new Error('--v <overlay dir>');
const H = Number(arg('--h', '775'));
const LABEL = arg('--label', basename(DIR.V.replace(/\/overlay$/, '')));
const UP = arg('--ms', '0.02,0.05,0.1,0.15,0.19,0.25,0.4,0.5,0.54,0.6,0.8,0.95,0.99,1').split(',').map(Number);
const DOWN = arg('--down', '0.5,0.1,0').split(',').filter((x) => x !== '').map(Number);
const STOPS = [{ k: 'pre', m: null }, ...UP.map((m) => ({ k: `up${m}`, m })), ...DOWN.map((m) => ({ k: `dn${m}`, m }))];
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph', `px2-${ENGINE}-${LABEL}-${tag}`); mkdirSync(OUT, { recursive: true });
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const RESUME = `(() => { for (const a of document.getAnimations()) { try { if (!(a instanceof CSSTransition) && a.playState === 'paused') a.play(); } catch {} } for (const svg of document.querySelectorAll('svg')) { try { svg.unpauseAnimations && svg.unpauseAnimations(); } catch {} } return 1; })()`;
const HITS = `JSON.stringify((() => { const out = []; const lab = (e) => { if (!e) return null; const sec = e.closest('section[id],section[class],[id]'); const c = (x) => x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : ''; return (sec && sec !== e ? c(sec) + ' > ' : '') + c(e); };
  for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })())`;
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
const STATE = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const p = document.querySelector('.start-selling-platform');
  return { y: Math.round(scrollY), m: h ? h.style.getPropertyValue('--morph') : null, rv: h ? h.hasAttribute('data-fw-rv') : null, clip: h ? h.style.getPropertyValue('clip-path') : null,
    cls: h ? h.className.replace(/svelte-\\w+/g, '').trim() : null, onDark: h ? h.classList.contains('is-on-dark') : null, probe: (() => { if (!h) return null; const r = h.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height, 64) / 2; for (const e of document.elementsFromPoint(x, y)) if (!h.contains(e) || e.closest('.start-selling-top-nav-actions, .start-selling-morph-panel')) { const sec = e.closest('section[id],section[class],[id]'); const c = (q) => q ? q.tagName.toLowerCase() + (q.id ? '#' + q.id : '') + (typeof q.className === 'string' && q.className.trim() ? '.' + q.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : ''; return { y: Math.round(y * 10) / 10, hit: (sec && sec !== e ? c(sec) + ' > ' : '') + c(e) }; } return { y, hit: null }; })(), fade: p ? p.style.getPropertyValue('--morph-fade') : null, pOpacity: p ? getComputedStyle(p).opacity : null, pVis: p ? getComputedStyle(p).visibility : null }; })())`;

// engine adapters: open(url) -> { ev(js) -> value, shot(file), close() }
let sim = null, chrome = null, cdp = null, cfg = null;
if (ENGINE === 'sim') { sim = await import(join(WT, 'tools/lib/sim.mjs')); cfg = sim.readConfig(); }
else {
  const C = await import(join(WT, 'tools/lib/cdp.mjs'));
  chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/end-morph/chrome'), 'empx2'), headless: true, windowSize: `430,${H}` });
  cdp = await C.CDP.connect(chrome.wsUrl); chrome.C = C;
}
async function open(url, port) {
  if (sim) {
    const { execFileSync } = await import('node:child_process');
    const { openTab } = await import(join(WT, 'tools/lib/wip.mjs'));
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${port}`);
    return { ev: (js) => c.evaluate(js), shot: (f) => sim.simctl(['io', cfg.udid, 'screenshot', f]).status === 0, close: () => { try { c.close(); } catch {} } };
  }
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await chrome.C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
  return { ev: (js) => page.eval(js, { timeout: 90000 }), shot: async (f) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(data, 'base64')); return true; }, close: () => page.close() };
}

const ARMS = ['A', 'V', 'A2', 'V2'];
const res = { tool: 'fixes/end-morph/gates/em-px2.mjs (fix-end-morph)', engine: ENGINE, h: ENGINE === 'sim' ? null : H, dpr: 3, dirs: DIR, arms: ARMS, startedAt: new Date().toISOString(), load1: loadavg()[0], F, loads: [], stops: [] };
const shots = {};
try {
  for (const arm of ARMS) {
    const d = DIR[arm.replace(/\d+$/, '')];
    const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, dir: d, stops: [] }; let c = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      c = await open(url, s.port);
      for (let i = 0; i < 40 && (await c.ev('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      await c.ev(`(() => { window.__pxErr = []; addEventListener('error', (e) => window.__pxErr.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__pxErr.push('rej ' + String(e.reason))); return 1; })()`);
      // walk the page (lazy content, mounts), then freeze the clock
      await c.ev(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      await c.ev(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`);
      let g = JSON.parse(await c.ev(GEO));
      if (!g.t) throw new Error('no .fw-ms-end (7d off)');
      await c.ev(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
      g = JSON.parse(await c.ev(GEO)); load.geo = g;
      await c.ev(TOUCH);
      for (const S of STOPS) {
        await c.ev(RESUME);
        const y = S.m == null ? g.endStart - Math.round(g.ih / 2) : Math.round(g.endStart + S.m * g.t);
        await c.ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(1300);
        const fr = JSON.parse(await c.ev(FREEZE)); await sleep(450);
        const state = JSON.parse(await c.ev(STATE));
        const f = join(OUT, `${arm}-${S.k}.png`); const ok = await c.shot(f);
        const hits = JSON.parse(await c.ev(HITS));
        (shots[S.k] ||= {})[arm] = { file: f, hits }; load.stops.push({ k: S.k, m: S.m, y, state, frozen: fr, ok });
      }
      load.errors = JSON.parse(await c.ev('JSON.stringify(window.__pxErr || [])'));
    } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
    finally { try { c && (await c.close()); } catch {} p.kill(); rmSync(st, { force: true }); res.loads.push(load); }
    console.log(`load ${arm}: served ${JSON.stringify(load.served)} ${load.stops.length} stops, errors ${JSON.stringify(load.errors || [])}`);
    for (const x of load.stops) console.log(`  ${x.k.padEnd(7)} y ${x.y} ${JSON.stringify(x.state)}`);
  }
  let top = 0;
  if (sim) { // the page's top edge in the shot: the shot height minus the viewport (status bar + toolbar) is not known; use 0 for labels
    top = 0;
  }
  for (const S of STOPS) {
    const Sx = shots[S.k]; if (!Sx || ARMS.some((a) => !Sx[a])) { res.stops.push({ k: S.k, void: 'missing arm' }); continue; }
    const row = { k: S.k, m: S.m, ...scoreStop(Object.fromEntries(ARMS.map((a) => [a, Sx[a].file])), { V: Sx.V.hits, V2: Sx.V2.hits }, 3, top) };
    res.stops.push(row); console.log(line(S.k, row));
  }
} finally {
  res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
  writeFileSync(join(OUT, 'px.json'), JSON.stringify(res, null, 1));
  try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {}
  console.log('wrote', join(OUT, 'px.json'));
}
