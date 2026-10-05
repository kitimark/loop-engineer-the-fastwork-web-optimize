#!/usr/bin/env node
// nav-hit-cache v9.3 prep: why U2 left two pixel spots on v9.2 (int-v8's px-chrome mobile, y 2120 nav bar, y 6278 morph
// CTA). Counts and states only, no timing. Follows px-chrome.mjs's load and stop procedure (fixes/v9-best/gates:
// isolated page, 430x932 DPR 3 touch, settle, Date.now frozen, the same ascending stops, instant scroll, 1.6 s, running
// non-transition animations paused at 4000 ms, 0.5 s) and records per stop: the nav's classes and --morph, the nav bar's
// and the morph CTA's computed styles, their running animations / transitions, and a sha of a screenshot clip of the
// two spots. Arms (dirs under out/snapshots): M = v9.2 minus U2, V = v9.2, N = V with U2's deferral line dead
// (`__h && !1 && C()`: V's bytes, Mnhc's behaviour). PNG clips go to out/nav-hit-cache/stopstate/.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph -- \
//     node fixes/nav-hit-cache/v93/stopstate.mjs M,V,N --out fixes/nav-hit-cache/v93/stopstate-1.json
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const DIRS = { M: 'v92m-30f6371751f4', V: 'nhcv92-6468db04395c', N: 'nhcv92n' };
const PIN = { M: '30f6371751f4', V: '6468db04395c', N: 'f368b7d1dd3b' };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (process.argv[2] || 'M,V,N').split(',');
const OUTF = join(WT, arg('--out', 'out/nav-hit-cache/stopstate.json'));
const SHOTS = join(WT, 'out/nav-hit-cache/stopstate'); mkdirSync(SHOTS, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const BASE = resolveTree('site-pretty');
const vp = { width: 430, height: 932, dpr: 3 };
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); } } catch {} } return n; })()`;
const STATE = `JSON.stringify((() => {
  const nav = document.querySelector('.start-selling-top-nav'), bar = document.querySelector('.start-selling-top-nav-bar'), cta = document.querySelector('button.start-selling-morph-cta');
  const cs = (e, ps) => e ? Object.fromEntries(ps.map((p) => [p, getComputedStyle(e).getPropertyValue(p)])) : null;
  const an = (e) => e ? e.getAnimations({ subtree: true }).map((a) => [a.constructor.name, a.animationName || a.transitionProperty || '', a.playState, Math.round(a.currentTime ?? -1), (a.effect && a.effect.target && a.effect.target.className && String(a.effect.target.className).slice(0, 40)) || '']) : null;
  return { nav: nav && nav.className, navStyle: nav && nav.getAttribute('style'), barCls: bar && bar.className,
    bar: cs(bar, ['background-color', 'color', 'opacity', 'backdrop-filter', 'box-shadow', 'transform', 'border-bottom-color']),
    ctaCls: cta && cta.className, cta: cs(cta, ['opacity', 'color', 'background-color', 'transform', 'filter', 'box-shadow', 'border-color']),
    ctaStyle: cta && cta.getAttribute('style'), anNav: an(nav), anCta: an(cta && cta.parentElement), root: document.documentElement.className };
})())`;
const CLIPS = { 2120: { x: 48, y: 0, width: 144, height: 24 }, 6278: { x: 112, y: 568, width: 224, height: 96 } };

async function server(arm) {
  const st = join(SHOTS, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, DIRS[arm]), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
const res = { tool: 'fixes/nav-hit-cache/v93/stopstate.mjs', arms: ARMS, dirs: DIRS, startedAt: new Date().toISOString(), loads: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-hit-cache/chrome'), 'stopstate'), headless: true, windowSize: `${vp.width},${vp.height}` });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
let YS = null;
try {
  for (const [i, arm] of ARMS.entries()) {
    const s = await server(arm); const load = { arm, i, errors: [], stops: [] }; res.loads.push(load);
    try {
      const url = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (load.served.js !== PIN[arm]) throw new Error(`arm ${arm} served ${load.served.js}, pinned ${PIN[arm]}`);
      const page = await cdp.newIsolatedPage();
      page.on((m) => { if (m.method === 'Runtime.exceptionThrown') load.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200)); });
      await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(2000);
      await page.eval(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`); await sleep(2500);
      if (!YS) {
        const g = await page.eval(`({ H: document.documentElement.scrollHeight, vh: innerHeight })`);
        const end = g.H - g.vh, ys = new Set([0, 300, 548, 2796]); for (let k = 1; k <= 8; k++) ys.add(Math.round(g.vh + (end - g.vh) * k / 9)); ys.add(end);
        YS = [...ys].filter((y) => y <= end).sort((a, b) => a - b); res.ys = YS; res.docHeight = g.H;
      }
      for (const y of YS) {
        await page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(1600);
        const pre = JSON.parse(await page.eval(STATE));
        const frozen = await page.eval(FREEZE); await sleep(500);
        const st = { y, scrollY: await page.eval('Math.round(scrollY)'), frozen, pre, state: JSON.parse(await page.eval(STATE)) };
        const c = CLIPS[y] || (y === YS[YS.length - 1] ? CLIPS[6278] : null);
        if (c || CLIPS[y]) {
          const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...(c || CLIPS[y]), scale: 1 } });
          const b = Buffer.from(data, 'base64'); st.clip = sha(b); writeFileSync(join(SHOTS, `${arm}${i}-y${y}.png`), b);
        }
        load.stops.push(st);
      }
      await page.close();
    } finally { s.p.kill(); }
    console.log(`load ${arm}${i}: ${load.stops.length} stops, ${load.errors.length} errors, served ${load.served.js}`);
  }
} finally { cdp.close(); await chrome.close(); }
res.endedAt = new Date().toISOString();
mkdirSync(dirname(OUTF), { recursive: true }); writeFileSync(OUTF, JSON.stringify(res, null, 1));
console.log('wrote', OUTF.replace(WT + '/', ''));
