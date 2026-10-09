#!/usr/bin/env node
// g0.0m gate copy (fix-reveal-paint, 2026-10-09; from fixes/g0-0l/gates/, credit fix-scrollcb-g0 and its lineage below): default
// snapshot out/g0-0m/snap (C = g0.0l, V = g0.0m; dir map A=C,V=V), output under out/g0-0m/. Stop tokens may end in 'u'
// (e.g. 300u): a revisit of y 300 after the stops before it, i.e. scrolling back up; scored as its own stop.
// g0.0l gate copy (fix-scrollcb-g0, 2026-10-09; from fixes/g0-box/gates/, credit fix-g0-box, fix-double-drive, int-v8):
// (g0.0l: default snapshot out/g0-0l/snap, C = g0.0k, V = g0.0l, output under out/g0-0l/.)
// g0-box P-168 gate 1 (copy of fixes/double-drive/gates/px-chrome.mjs, fix-double-drive, itself a copy of fixes/v8-best/gates/px-chrome.mjs, int-v8; arms, settle and extra stops changed) Chrome pixel A/A at rest (PR-010 "tolerance report", research/pixel-tolerance/README.md §1), FROZEN FRAMES ONLY,
// no timing. Arms from out/g0box/p168/snap ($PX_SNAP; dirs f = g0.0f, g = g0.0g, HASHES.txt lines "<sha256> <dir>/<path>"): A = g0.0f, V = g0.0g. Load order A, V, A2, V2: every
// load has its own server (port 0, --no-cache, own origin) and its own isolated browser context; the served JS/CSS are
// hash-checked against HASHES.txt before the load (a mismatch is VOID) and the page's own script URL list is recorded.
// Per load: settle, then Date.now frozen at one value F (both countdown clocks show the same time in every arm), 2.5 s
// for the countdown to reach it, then per stop: instant scroll, PX_SETTLE ms (default 2600), every running non-transition animation paused at
// currentTime 4000 ms and SMIL paused at 4 s, 0.5 s, screenshot, and a hit grid (element under points every 40 CSS px).
// Timer-driven loops (word rotators, avatar slider ticks, pain notes) are not frozen: their phase is the A/A noise.
// Scores (per stop): A~V beyond the A/A mask A~A2 (pixels > 8 levels in A~V where A~A2 is <= 8), and the second sample
// A2~V2 beyond V~V2; max level, % of frame, CSS px2, flat share (3x3 range in the old frame <= 2), clusters (16 CSS px
// cells, 8-connected) with bbox and the element under their centre.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-box -- \
//     node fixes/g0-box/gates/px-chrome.mjs mobile|desktop [A=A,V=V]
// Scoring: pxlib.mjs.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreStop, line } from '../../v8-best/gates/pxlib.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const VP = process.argv[2] || 'mobile';
const VPS = { mobile: { width: 430, height: 932, dpr: 3, mobile: true }, desktop: { width: 1440, height: 900, dpr: 1, mobile: false } };
const vp = VPS[VP]; if (!vp) { console.error('usage: px-chrome.mjs mobile|desktop [arms=A,V,A2,V2]'); process.exit(2); }
const ARMS = ['A', 'V', 'A2', 'V2'];
// optional dir map: A=P,V=V serves arm A (and A2) from snap dir P (a control other than v7, e.g. Q = accent-ca-v7)
const DIRMAP = Object.fromEntries((process.argv[3] || 'A=A,V=V').split(',').map((kv) => kv.split('=')));
const SNAP = join(WT, process.env.PX_SNAP || 'out/g0-0m/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/g0-0m', `px-${VP}${process.env.PX_RM === '1' ? '-rm' : ''}-${tag}`); mkdirSync(OUT, { recursive: true });

// PX_CAROUSEL=freeze (lead, P-168 wait): stall the people-section avatar carousel. Its loop (JS ~12379-12413 in g0.0f) waits
// with setTimeout(<helper>, 800 | 220); the helper's text (`n.indexOf(r)` ... `n.splice(e, 1), t()`) occurs once in the bundle.
// Installed right after load at y 0, where the row is inactive, so the index stays at its start value in every load. Only those
// timers are dropped; every other timer runs. Each stop records the row's image names and the stall count.
const CAROUSEL = process.env.PX_CAROUSEL === 'freeze';
const STALL = `(() => { if (window.__fwCarStall != null) return 'again'; const st = window.setTimeout; window.__fwCarStall = 0;
  window.setTimeout = function (fn, ms, ...a) { if ((ms === 800 || ms === 220) && typeof fn === 'function' && /indexOf\\(r\\)[\\s\\S]*splice\\(e, 1\\), t\\(\\)/.test(Function.prototype.toString.call(fn))) { window.__fwCarStall++; return 0; } return st.call(this, fn, ms, ...a); };
  return 'ok'; })()`;
const CARSTATE = `JSON.stringify({ stalled: window.__fwCarStall ?? null, imgs: [...document.querySelectorAll('.start-selling-avatars.is-carousel img')].map((i) => (i.currentSrc || i.src).split('/').pop() + (i.className ? ':' + i.className : '') + (i.complete ? '' : ':loading')) })`;
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
// double-drive: settle after each instant scroll (v8's 0.9 s transform transition plus the script's easing; int-v8 used 1600)
const SETTLE = +(process.env.PX_SETTLE || 2600);
const ANIMS = `JSON.stringify(document.getAnimations().filter((a) => { const t = a.effect && a.effect.target; if (!t || !t.getBoundingClientRect) return false; const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((a) => { const t = a.effect.target, tm = a.effect.getTiming(); return [t.tagName.toLowerCase() + (typeof t.className === 'string' ? '.' + t.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''), a.constructor.name, a.animationName || a.id || '', a.playState, Math.round(a.currentTime ?? -1), tm.duration, tm.iterations]; }))`;
const FREEZE = `(() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })()`;
const HITS = `(() => { const out = []; const lab = (e) => { if (!e) return null; const sec = e.closest('section[id],section[class],[id]'); const c = (x) => x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : ''; return (sec && sec !== e ? c(sec) + ' > ' : '') + c(e); };
  for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })()`;

// PX_ALIGN=1 (added 2026-10-04 for the desktop y 300 cluster): the hero accent's word rotator (setTimeout: idle 1250 ms,
// draw-out 900, draw-in 900, 7 words) is not frozen, so its state at a stop is load-time phase. With PX_ALIGN the probe
// waits at each stop where the accent is on screen for the moment it ENTERS idle showing the same word (svg viewBox)
// that load A showed there (A takes the first idle entry), then freezes at once (idle lasts 1250 ms). PX_YS=0,300 limits
// the stops.
const ALIGN = process.env.PX_ALIGN === '1'; const alignWord = {};
const ACC = `(() => { const em = document.querySelector('em.script-accent'); if (!em) return null; const r = em.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return null;
  const svg = em.querySelector('svg'); return [em.classList.contains('is-idle') ? 'idle' : 'draw', svg ? svg.getAttribute('viewBox') : ''] })()`;
async function alignAccent(page, y, load) {
  let prev = await page.eval(ACC); if (!prev) return;
  const want = alignWord[y]; const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await sleep(40); const cur = await page.eval(ACC); if (!cur) return;
    if (prev[0] !== 'idle' && cur[0] === 'idle' && (!want || cur[1] === want)) {
      if (!want) alignWord[y] = cur[1]; (load.aligned ||= {})[y] = { word: cur[1], waitMs: Date.now() - t0 }; return;
    }
    prev = cur;
  }
  (load.aligned ||= {})[y] = { timeout: true };
}
async function server(arm) {
  const d = DIRMAP[arm.replace(/\d+$/, '')];
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, d, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
const res = { reducedMotion: process.env.PX_RM === '1', carouselFreeze: CAROUSEL, tool: 'fixes/g0-0m/gates/px-chrome.mjs', viewport: VP, ...vp, arms: ARMS, dirs: DIRMAP, startedAt: new Date().toISOString(), load1: loadavg()[0], F, loads: [], stops: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/g0-0m/chrome'), 'px-' + VP), headless: true, windowSize: `${vp.width},${vp.height}` });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
const shots = {}; let YS = null;
try {
  for (const arm of ARMS) {
    const s = await server(arm); const load = { arm, build: s.d, errors: [], stops: [] }; res.loads.push(load);
    try {
      const url = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (load.served.js !== HX[`${s.d}/${NODE}`] || load.served.css !== HX[`${s.d}/${CSS}`]) { load.void = `served ${load.served.js} / ${load.served.css}`; console.log('VOID', arm, load.void); continue; }
      const page = await cdp.newIsolatedPage();
      page.on((m) => { if (m.method === 'Runtime.exceptionThrown') load.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200)); });
      await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
      if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      // PX_RM=1: prefers-reduced-motion: reduce (the page's own reduced-motion paths; g0.0l gate)
      if (process.env.PX_RM === '1') await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
      // PX_T0=<ms> (g0.0l gate): wait until the page's own clock (performance.now) reaches T0 before the carousel stall,
      // so every load freezes its self-animated content (hero accent, avatar carousel) at the same page time, whatever
      // network activity moved the settle (g0.0l's photo preload ends the network-quiet wait later). Settle and stall
      // page times are recorded per load.
      load.t = { settled: Math.round(await page.eval('performance.now()')) };
      if (process.env.PX_T0) { const w = +process.env.PX_T0 - load.t.settled; if (w > 0) await sleep(w); else load.t.late = true; }
      if (CAROUSEL) load.carouselStall = await page.eval(STALL); load.t.stall = Math.round(await page.eval('performance.now()')); await sleep(2000);
      load.scripts = await page.eval(`performance.getEntriesByType('resource').map((e) => e.name.replace(location.origin, '')).filter((n) => n.includes('${NODE}') || n.includes('${CSS}'))`);
      await page.eval(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`); await sleep(2500);
      if (!YS) {
        const g = await page.eval(`({ H: document.documentElement.scrollHeight, vh: innerHeight })`); res.docHeight = g.H;
        const end = g.H - g.vh, ys = new Set([0, 300, 548, 2796]); for (let i = 1; i <= 8; i++) ys.add(Math.round(g.vh + (end - g.vh) * i / 9)); ys.add(end);
        YS = [...ys].filter((y) => y <= end).sort((a, b) => a - b);
        if (process.env.PX_YS) YS = process.env.PX_YS.split(',');
        if (process.env.PX_EXTRA_YS) YS = [...new Set([...YS, ...process.env.PX_EXTRA_YS.split(",").map(Number)])].filter((y) => y <= end).sort((a, b) => a - b);
        res.ys = YS;
      }
      for (const tok of YS) {
        const y = parseFloat(tok);
        await page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(SETTLE);
        if (ALIGN) await alignAccent(page, y, load);
        const anims = JSON.parse(await page.eval(ANIMS)); const fr = await page.eval(FREEZE); await sleep(500);
        const yy = await page.eval('Math.round(scrollY)');
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        const hits = await page.eval(HITS);
        const f = join(OUT, `${arm}-y${tok}.png`); writeFileSync(f, Buffer.from(data, 'base64'));
        // PX_IMGS=1 (g0.0l gate): the #people images in view at this stop: [src tail, naturalWidth, complete, loading, css box]
        const imgs = process.env.PX_IMGS === '1' ? JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('#people img')].map((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 ? [i.currentSrc.split('/').slice(-2).join('/'), i.naturalWidth, i.complete, i.loading, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; }).filter(Boolean))`)) : undefined;
        (shots[tok] ||= {})[arm] = { file: f, hits }; load.stops.push({ y: tok, scrollY: yy, frozen: fr, anims, hits, ...(imgs ? { imgs } : {}), ...(CAROUSEL ? { carousel: JSON.parse(await page.eval(CARSTATE)) } : {}) });
      }
      await page.close();
    } finally { s.p.kill(); }
    console.log(`load ${arm}: ${load.stops.length} stops, ${load.errors.length} page errors, scripts ${JSON.stringify(load.scripts)}${load.aligned ? ' aligned ' + JSON.stringify(load.aligned) : ''}`);
  }
} finally { cdp.close(); await chrome.close(); }
// score (pxlib.mjs)
for (const y of YS || []) {
  const S = shots[y]; if (!S || !S.A || !S.V || !S.A2 || !S.V2) { res.stops.push({ y, void: 'missing arm' }); continue; }
  const row = { y, ...scoreStop(Object.fromEntries(['A', 'V', 'A2', 'V2'].map((a) => [a, S[a].file])), { V: S.V.hits, V2: S.V2.hits }, vp.dpr) };
  res.stops.push(row); console.log(line(y, row));
}
res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
writeFileSync(join(OUT, 'px.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'px.json'));
