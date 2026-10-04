#!/usr/bin/env node
// nav-earn rev 3 (PR-021 rev 3, T-158): Chrome DOM probe of the Join waitlist button, no timing claims.
// Arms (overlay dirs): A = v8 (fixes/v8-best/overlay, the original look), R3 = rev 3 (fixes/nav-earn/overlay),
// B = rev 2 (fixes/nav-earn-r2/overlay), R1 = rev 1. Per arm and viewport, after load and settle:
//  counts (no sampler, nothing in the page reads layout except the page itself; a bare rAF counter counts frames):
//    Performance.getMetrics LayoutCount / RecalcStyleCount per window: still at the bar, still in the pill; the top
//    step (instant scroll hero progress 0.66 -> 0.78: appear 0-700 ms, 700-1600 ms; back: hide 0-700 ms); the top
//    glide (in-page rAF scroll 0.50 -> 0.80 over 1 s, hold 1.6 s; back over 1 s, hold 1.6 s); the end of the page
//    (morph open by synthetic wheel +120, 0-1500 ms; close by wheel -120, 0-1500 ms);
//  stills (slow motion, frozen frames, as earn-probe.mjs): the nav strip at fixed times after each of the four
//    triggers (top appear, top hide, end open, end close), for the A vs R3 look check (r3-pxdiff.mjs).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-earn -- \
//     node fixes/nav-earn/probe/r3-probe.mjs [phone|desktop] [A,R3] [counts,stills]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const VPS = {
  phone: { width: 430, height: 775, dpr: 3, mobile: true },
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false },
};
const vpNames = (process.argv[2] || 'phone').split(',');
const ARMS = (process.argv[3] || 'A,R3').split(',');
const PARTS = new Set((process.argv[4] || 'counts,stills').split(','));
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), R3: join(WT, 'fixes/nav-earn/overlay'), B: join(WT, 'fixes/nav-earn-r2/overlay'), R1: join(WT, 'fixes/nav-earn-r1/overlay') };
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `r3-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const RATE = +(process.env.R3_RATE || 0.1);
const STILLS = {
  topIn: [0, 100, 200, 300, 400, 500, 600, 700, 850, 1000, 1200, 1500],
  topOut: [0, 50, 100, 150, 200, 300, 450, 700],
  endOpen: [0, 50, 100, 150, 200, 300, 400, 500, 700],
  endClose: [0, 300, 600, 700, 750, 800, 900, 1000, 1200, 1400],
};
const METRICS = ['LayoutCount', 'RecalcStyleCount'];
const Y_AT = (p) => `(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); return Math.round(r.top + scrollY + Math.max(1, r.height - innerHeight) * ${p}); })()`;
const WHEEL = (dy) => `(window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })), 1)`;
// OBSERVED (Chrome headless, earn-probe.mjs): after CDP Animation.setPlaybackRate, rAF stamps follow the document
// timeline, performance.now() does not; pointing performance.now at the timeline keeps the morph tween in step.
const SLOW = `(() => { window.__fwRawNow = window.__fwRawNow || performance.now.bind(performance); performance.now = () => Number(document.timeline.currentTime); return 1; })()`;
const UNSLOW = `(() => { performance.now = window.__fwRawNow; return 1; })()`;
const FRAMES = `(() => { const raf = window.__r3Raf || (window.__r3Raf = requestAnimationFrame.bind(window)); window.__r3F = 0; window.__r3On = true; const f = () => { if (!window.__r3On) return; window.__r3F++; raf(f); }; raf(f); return 1; })()`;
const STATE = `(() => { const n = document.querySelector('header.start-selling-top-nav'), e = n.querySelector('.start-selling-top-nav-btn.is-earn'); const cs = getComputedStyle(e);
  return { cls: n.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').trim(), morph: n.style.getPropertyValue('--morph'), earnW: Math.round(e.getBoundingClientRect().width * 10) / 10, op: cs.opacity,
    anims: n.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => a.transitionProperty || a.animationName || (a.effect?.getKeyframes?.()[0] ? Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join('+') : '?')).join(' ') }; })()`;

async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', DIRS[arm], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

const res = { tool: 'fixes/nav-earn/probe/r3-probe.mjs', startedAt: new Date().toISOString(), load1: loadavg()[0], rate: RATE, stills: STILLS, runs: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-earn/chrome'), 'r3'), headless: true, windowSize: '1440,982' });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
try {
  for (const vn of vpNames) {
    const vp = VPS[vn];
    for (const arm of ARMS) {
      const s = await server(arm); const run = { vp: vn, ...vp, arm, errors: [], failed404: [], windows: {}, stills: {} }; res.runs.push(run);
      try {
        const url = `http://localhost:${s.port}/`;
        run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
        const page = await cdp.newIsolatedPage();
        page.on((m) => {
          if (m.method === 'Runtime.exceptionThrown') run.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') run.errors.push('console.error: ' + String(m.params.args?.[0]?.value ?? m.params.args?.[0]?.description ?? '').slice(0, 200));
          if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) run.failed404.push(m.params.response.status + ' ' + m.params.response.url.replace(url, '/'));
        });
        await page.send('Runtime.enable'); await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.send('Performance.enable');
        await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
        if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await page.send('Animation.enable');
        await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(2000);
        const yPill = await page.eval(Y_AT(0.66)), yBar = await page.eval(Y_AT(0.78)), yLo = await page.eval(Y_AT(0.5)), yHi = await page.eval(Y_AT(0.8));
        const yEnd = await page.eval('document.documentElement.scrollHeight - innerHeight');
        const go = (y) => page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), dispatchEvent(new Event('scroll')), 1)`);
        const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.filter((m) => METRICS.includes(m.name)).map((m) => [m.name, m.value]));
        const win = async (name, ms, during) => {
          await page.eval(FRAMES); const a = await metrics(); const p = during ? page.eval(during) : null; await sleep(ms); const b = await metrics();
          const frames = await page.eval('(window.__r3On = false, window.__r3F)'); if (p) await p;
          const w = { frames, layout: b.LayoutCount - a.LayoutCount, style: b.RecalcStyleCount - a.RecalcStyleCount };
          w.layoutPerFrame = frames ? +(w.layout / frames).toFixed(2) : null; w.stylePerFrame = frames ? +(w.style / frames).toFixed(2) : null;
          run.windows[name] = w;
        };
        if (PARTS.has('counts')) {
          await go(yBar); await sleep(2500); await win('stillBar', 1500); run.stateBar = await page.eval(STATE);
          await go(yPill); await sleep(2500); await win('stillPill', 1500); run.statePill = await page.eval(STATE);
          await page.eval(FRAMES); const a0 = await metrics(); await go(yBar); const a1 = await metrics(); await page.eval('(window.__r3On = false, 1)');
          run.windows.flipInSync = { layout: a1.LayoutCount - a0.LayoutCount, style: a1.RecalcStyleCount - a0.RecalcStyleCount };
          await win('topIn0to700', 700); run.stateIn300 = null; await win('topIn700to1600', 900); await sleep(600);
          await go(yPill); await win('topOut0to700', 700); await sleep(1500);
          // glide
          await go(yLo); await sleep(2500);
          const SEG = (a, b) => `new Promise((res) => { const raf = window.__r3Raf || requestAnimationFrame.bind(window); const s = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - s) / 1000); scrollTo({ top: Math.round(${a} + (${b} - ${a}) * k), behavior: 'instant' }); k < 1 ? raf(f) : res(1); }; raf(f); })`;
          await win('glideDown', 2600, SEG(yLo, yHi)); await win('glideUp', 2600, SEG(yHi, yLo));
          // end of the page
          await go(yEnd); await sleep(2500); await win('stillEnd', 1000);
          await win('endOpen0to1500', 1500, WHEEL(120)); run.stateOpen = await page.eval(STATE);
          await win('endClose0to1500', 1500, WHEEL(-120)); run.stateClosed = await page.eval(STATE);
        }
        if (PARTS.has('stills')) {
          const stripH = vp.width <= 640 ? 90 : 110;
          const shot = async (name) => { const sy = await page.eval('scrollY'); const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: sy, width: vp.width, height: stripH, scale: 1 } }); const f = join(OUT, `${vn}-${arm}-${name}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return f; };
          const seq = async (name, times, trigger) => {
            const list = (run.stills[name] = []);
            await page.send('Animation.setPlaybackRate', { playbackRate: RATE }); await page.eval(SLOW);
            const w0 = Date.now(); const v0 = await page.eval(`(${trigger}, Number(document.timeline.currentTime))`);
            for (const ms of times) {
              const wait = w0 + ms / RATE - Date.now() - 300; if (wait > 0) await sleep(wait);
              while ((await page.eval('Number(document.timeline.currentTime)')) - v0 < ms) {}
              await page.send('Animation.setPlaybackRate', { playbackRate: 0 }); await sleep(150);
              const at = (await page.eval('Number(document.timeline.currentTime)')) - v0;
              list.push({ ms, at: +at.toFixed(1), ...(await page.eval(STATE)), strip: await shot(`${name}-${String(ms).padStart(4, '0')}`) });
              await page.send('Animation.setPlaybackRate', { playbackRate: RATE });
            }
            await page.eval(UNSLOW); await page.send('Animation.setPlaybackRate', { playbackRate: 1 }); await sleep(1500);
          };
          await go(yPill); await sleep(2500);
          await seq('topIn', STILLS.topIn, `scrollTo({ top: ${yBar}, behavior: 'instant' }), dispatchEvent(new Event('scroll'))`);
          await sleep(1000);
          await seq('topOut', STILLS.topOut, `scrollTo({ top: ${yPill}, behavior: 'instant' }), dispatchEvent(new Event('scroll'))`);
          await go(yEnd); await sleep(2500);
          await seq('endOpen', STILLS.endOpen, WHEEL(120)); await sleep(1000);
          await seq('endClose', STILLS.endClose, WHEEL(-120));
        }
        await page.close();
      } finally { s.p.kill(); }
      console.log(vn, arm, JSON.stringify(run.served), JSON.stringify(run.windows), 'errors', run.errors.length, '4xx', run.failed404.length, run.errors.slice(0, 2).join(' | '));
    }
  }
} finally {
  writeFileSync(join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
  try { cdp.close(); await chrome.close(); } catch {}
  console.log('OUT', OUT);
}
process.exit(0);
