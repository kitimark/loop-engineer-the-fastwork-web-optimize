#!/usr/bin/env node
// nav-earn (T-148): DOM probe of the top nav through the end-of-page morph, no timing claims.
// Arms (overlay dirs): A = fixes/v8-best/overlay (v8), B = fixes/nav-earn/overlay (v8 + fix). Per arm and viewport:
// load, settle, instant scroll to the page end, then
//  pass 1 (real speed): per-rAF samples of the nav (classes, --morph, Join waitlist width / max-width / padding /
//    opacity, language-switch right inset, logo left inset) through morph open (synthetic wheel deltaY +120, the
//    page's own capture listener) and close (wheel -120);
//  pass 2 (slow motion x0.1: CDP Animation.setPlaybackRate for CSS, page performance.now / rAF timestamps scaled for
//    the JS spring) stills of the nav strip at fixed morph times, and full-frame stills for the outside-nav pixel check.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-earn -- \
//     node fixes/nav-earn/probe/earn-probe.mjs [phone,tall,desktop] [A,B]
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
  tall: { width: 430, height: 932, dpr: 3, mobile: true },
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false },
};
const vpNames = (process.argv[2] || 'phone,tall,desktop').split(',');
const ARMS = (process.argv[3] || 'A,B').split(',');
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), A2: join(WT, 'fixes/v8-best/overlay'), B: join(WT, 'fixes/nav-earn/overlay'), B2: join(WT, 'fixes/nav-earn/overlay'), O: join(WT, 'out/nav-earn/empty-overlay') }; // O = the plain baseline
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `probe-${tag}`); mkdirSync(OUT, { recursive: true }); mkdirSync(DIRS.O, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const STILL_MS = [0, 16, 33, 50, 67, 100, 150, 200, 300, 450, 700, 1000];
// stills are frozen frames: see the still loop
const RATE = +(process.env.EP_RATE || 0.02);
const FULL_MS = new Set([0, 50, 200, 1000]);

const SAMPLER = `(() => {
  const nav = document.querySelector('header.start-selling-top-nav'); if (!nav) return 'no nav';
  const q = (s) => nav.querySelector(s);
  const earn = q('.start-selling-top-nav-btn.is-earn'), lang = q('.start-selling-language-switch'), logo = q('.start-selling-top-nav-logo'), acts = q('.start-selling-top-nav-actions');
  const raf = window.__fwRawRaf || (window.__fwRawRaf = window.requestAnimationFrame.bind(window));
  const pn = window.__fwRawNow || (window.__fwRawNow = performance.now.bind(performance));
  window.__ep = []; window.__epOn = true;
  const r2 = (v) => Math.round(v * 100) / 100;
  const tick = () => {
    if (!window.__epOn) return;
    const n = nav.getBoundingClientRect(), e = earn.getBoundingClientRect(), l = lang.getBoundingClientRect(), g = logo.getBoundingClientRect(), a = acts.getBoundingClientRect();
    const cs = getComputedStyle(earn), gs = getComputedStyle(logo);
    window.__ep.push({ t: r2(pn()), morph: nav.style.getPropertyValue('--morph'), cls: nav.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').trim(),
      earnW: r2(e.width), earnMaxW: cs.maxWidth, earnPadL: cs.paddingLeft, earnOp: cs.opacity, earnFilter: cs.filter,
      actsW: r2(a.width), actsRight: r2(n.right - a.right), langRight: r2(n.right - l.right), langW: r2(l.width),
      logoLeft: r2(g.left - n.left), logoW: r2(g.width), logoOrigin: gs.transformOrigin, logoPos: gs.position,
      navL: r2(n.left), navW: r2(n.width), navH: r2(n.height), navTop: r2(n.top) });
    raf(tick);
  };
  raf(tick); return 'ok';
})()`;
const WHEEL = (dy) => `(window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })), 1)`;
// OBSERVED (Chrome headless, in our setup): after CDP Animation.setPlaybackRate, rAF timestamps follow
// document.timeline.currentTime (scaled), performance.now() does not; so performance.now is pointed at the timeline
// and the page's JS spring (rAF stamp minus performance.now at start) runs at the same rate as the CSS transitions.
const SLOW = `(() => { const pn = window.__fwRawNow || (window.__fwRawNow = performance.now.bind(performance)); performance.now = () => Number(document.timeline.currentTime); return 1; })()`;
const UNSLOW = `(() => { performance.now = window.__fwRawNow; return 1; })()`;
const NAVBOX = `(() => { const r = document.querySelector('header.start-selling-top-nav').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`;

async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', DIRS[arm], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

const res = { tool: 'fixes/nav-earn/probe/earn-probe.mjs', startedAt: new Date().toISOString(), load1: loadavg()[0], rate: RATE, stillMs: STILL_MS, runs: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-earn/chrome'), 'probe'), headless: true, windowSize: '1440,982' });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
try {
  for (const vn of vpNames) {
    const vp = VPS[vn];
    for (const arm of ARMS) {
      const s = await server(arm); const run = { vp: vn, ...vp, arm, errors: [], failed404: [] }; res.runs.push(run);
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
        await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
        if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await page.send('Animation.enable');
        await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(2500);
        const end = await page.eval('document.documentElement.scrollHeight - innerHeight');
        await page.eval(`(scrollTo({ top: ${end}, behavior: 'instant' }), 1)`); await sleep(2500);
        run.endY = await page.eval('Math.round(scrollY)');
        // pass 1: real speed
        run.sampler = await page.eval(SAMPLER); await sleep(300);
        const tOpen = await page.eval(`(${WHEEL(120)}, performance.now())`); await sleep(1500);
        const tClose = await page.eval(`(${WHEEL(-120)}, performance.now())`); await sleep(1500);
        await page.eval('(window.__epOn = false, 1)');
        run.tOpen = tOpen; run.tClose = tClose; run.samples = await page.eval('window.__ep');
        // pass 2: slow motion stills (open only), nav strip + full frame
        await sleep(500);
        const stripH = vp.width <= 640 ? 110 : 130;
        const sy = await page.eval('scrollY'); // Page.captureScreenshot clips are in document coordinates
        const shot = async (name, clip) => { if (clip) clip = { ...clip, y: clip.y + sy }; const { data } = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); const f = join(OUT, `${vn}-${arm}-${name}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return f; };
        run.stills = [];
        const before = await shot('strip-before', { x: 0, y: 0, width: vp.width, height: stripH }); run.stills.push({ ms: -1, strip: before, nav: await page.eval(NAVBOX) });
        await page.send('Animation.setPlaybackRate', { playbackRate: RATE });
        await page.eval(SLOW);
        const w0 = Date.now(); const v0 = await page.eval(`(${WHEEL(120)}, Number(document.timeline.currentTime))`);
        for (const ms of STILL_MS) {
          // run at RATE until the document timeline reaches v0 + ms, then freeze it (playback rate 0: CSS transitions
          // and, through the rAF stamps, the JS spring stop at the same instant), let a frame paint, shoot, resume
          const due = w0 + ms / RATE; const wait = due - Date.now() - 300; if (wait > 0) await sleep(wait);
          while ((await page.eval('Number(document.timeline.currentTime)')) - v0 < ms) {}
          await page.send('Animation.setPlaybackRate', { playbackRate: 0 }); await sleep(200);
          const at = (await page.eval('Number(document.timeline.currentTime)')) - v0;
          const nav = await page.eval(NAVBOX); const morph = await page.eval(`document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph')`);
          const strip = await shot(`strip-${String(ms).padStart(4, '0')}`, { x: 0, y: 0, width: vp.width, height: stripH });
          const full = FULL_MS.has(ms) ? await shot(`full-${String(ms).padStart(4, '0')}`) : null;
          const atEnd = (await page.eval('Number(document.timeline.currentTime)')) - v0;
          run.stills.push({ ms, at: +at.toFixed(2), atEnd: +atEnd.toFixed(2), morph, nav, strip, full });
          await page.send('Animation.setPlaybackRate', { playbackRate: RATE });
        }
        await page.eval(UNSLOW); await page.send('Animation.setPlaybackRate', { playbackRate: 1 });
        await page.close();
      } finally { s.p.kill(); }
      // summary
      const S = run.samples || []; const m = (x) => +x.morph || 0;
      const open = S.filter((x) => x.t >= run.tOpen && x.t < run.tClose);
      const pre = S.filter((x) => x.t < run.tOpen).at(-1);
      const f02 = open.find((x) => m(x) >= 0.2), fMorph = open.find((x) => /is-morphing/.test(x.cls));
      const w0 = open.find((x) => x.earnW <= 0.5);
      const preMorph = open.filter((x) => !/is-morphing/.test(x.cls)).at(-1) || pre;
      run.summary = {
        served: run.served, pre: pre && { earnW: pre.earnW, langRight: pre.langRight, logoLeft: pre.logoLeft, logoW: pre.logoW, actsRight: pre.actsRight },
        morph02AtMs: f02 && Math.round(f02.t - run.tOpen), earnZeroAtMs: w0 ? Math.round(w0.t - run.tOpen) : null,
        lagMs: f02 && w0 ? Math.round(w0.t - f02.t) : null,
        earnWAtMorph02: f02?.earnW, langRightAtMorph02: f02?.langRight,
        logoJumpPx: fMorph && preMorph ? Math.round((fMorph.logoLeft - preMorph.logoLeft) * 100) / 100 : null,
        logoLeftBefore: preMorph?.logoLeft, logoLeftFirstMorphing: fMorph?.logoLeft,
        errors: run.errors.length, http4xx: run.failed404.length,
      };
      console.log(`${vn} ${arm} served ${run.served?.js}/${run.served?.css} ${JSON.stringify(run.summary)}`);
    }
  }
} finally { cdp.close(); await chrome.close(); }
res.load1End = loadavg()[0];
writeFileSync(join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
console.log('OUT', OUT);
