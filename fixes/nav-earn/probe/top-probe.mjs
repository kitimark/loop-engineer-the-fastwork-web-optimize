#!/usr/bin/env node
// nav-earn rev 2 (T-154): DOM probe of the Join waitlist button appearing at the top of the page, no timing claims.
// The bar leaves its hero-pill state when the hero track is 72 % scrolled (JS 13010, `p`); the button then grows in
// (CSS 11477-11545: max-width / padding / opacity transitions, mask "unmask" sweep + sheen after 0.52 s).
// Per arm and viewport: load, settle, instant scroll to hero progress 0.66 (pill), settle, then
//  pass 1 (real speed): per-rAF samples of the bar (classes, Join width / opacity / mask position, its running
//    animations, language-switch inset) across an instant step to progress 0.78 (appear), hold 2.2 s, step back to
//    0.66 (disappear), hold 1.5 s; Performance.getMetrics layout / style counts per window, and a still control
//    window (no step) for the page's own idle work;
//  pass 2 (slow motion, frozen stills like earn-probe.mjs): the top strip at fixed times after the appear step.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-earn -- \
//     node fixes/nav-earn/probe/top-probe.mjs [phone,desktop] [A,B]
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
const vpNames = (process.argv[2] || 'phone,desktop').split(',');
const ARMS = (process.argv[3] || 'A,B').split(',');
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), A2: join(WT, 'fixes/v8-best/overlay'), B: join(WT, 'fixes/nav-earn/overlay'), B2: join(WT, 'fixes/nav-earn/overlay'), C: join(WT, 'fixes/nav-earn/overlay-c'), O: join(WT, 'out/nav-earn/empty-overlay'), R1: join(WT, 'fixes/nav-earn-r1/overlay') };
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `top-${tag}`); mkdirSync(OUT, { recursive: true }); mkdirSync(DIRS.O, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const STILL_MS = (process.env.TP_STILLS || '0,50,100,200,300,450,600,800,1000,1200,1500').split(',').map(Number);
const RATE = +(process.env.TP_RATE || 0.05);
const P_PILL = 0.66, P_BAR = 0.78;

const SAMPLER = `(() => {
  const nav = document.querySelector('header.start-selling-top-nav'); if (!nav) return 'no nav';
  const q = (s) => nav.querySelector(s);
  const earn = q('.start-selling-top-nav-btn.is-earn'), lang = q('.start-selling-language-switch'), acts = q('.start-selling-top-nav-actions');
  const raf = window.__fwRawRaf || (window.__fwRawRaf = window.requestAnimationFrame.bind(window));
  const pn = window.__fwRawNow || (window.__fwRawNow = performance.now.bind(performance));
  window.__tp = []; window.__tpOn = true;
  const r2 = (v) => Math.round(v * 100) / 100;
  const tick = () => {
    if (!window.__tpOn) return;
    const n = nav.getBoundingClientRect(), e = earn.getBoundingClientRect(), l = lang.getBoundingClientRect();
    const cs = getComputedStyle(earn);
    const anims = earn.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => (a.transitionProperty || a.animationName || '?').replace(/svelte-\\S+-start-selling-nav-/, ''));
    window.__tp.push({ t: r2(pn()), y: Math.round(scrollY), cls: nav.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').trim(),
      earnW: r2(e.width), earnOp: cs.opacity, earnMaxW: cs.maxWidth, earnPadL: cs.paddingLeft, mask: cs.maskPosition || cs.webkitMaskPosition, anims: anims.join(' '),
      langRight: r2(n.right - l.right), langLeft: r2(l.left - n.left), navW: r2(n.width), navOp: getComputedStyle(nav).opacity });
    raf(tick);
  };
  raf(tick); return 'ok';
})()`;
const Y_AT = (p) => `(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); const top = r.top + scrollY; return Math.round(top + Math.max(1, r.height - innerHeight) * ${p}); })()`;
const SLOW = `(() => { window.__fwRawNow = window.__fwRawNow || performance.now.bind(performance); performance.now = () => Number(document.timeline.currentTime); return 1; })()`;
const UNSLOW = `(() => { performance.now = window.__fwRawNow; return 1; })()`;
const METRICS = ['LayoutCount', 'RecalcStyleCount', 'LayoutObjects', 'Frames'];

async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', DIRS[arm], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

const res = { tool: 'fixes/nav-earn/probe/top-probe.mjs', startedAt: new Date().toISOString(), load1: loadavg()[0], rate: RATE, stillMs: STILL_MS, pPill: P_PILL, pBar: P_BAR, runs: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-earn/chrome'), 'top'), headless: true, windowSize: '1440,982' });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
try {
  for (const vn of vpNames) {
    const vp = VPS[vn];
    for (const arm of ARMS) {
      const s = await server(arm); const run = { vp: vn, ...vp, arm, errors: [], failed404: [], windows: {} }; res.runs.push(run);
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
        await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(2500);
        const yPill = await page.eval(Y_AT(P_PILL)), yBar = await page.eval(Y_AT(P_BAR)); run.yPill = yPill; run.yBar = yBar;
        const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.filter((m) => METRICS.includes(m.name)).map((m) => [m.name, m.value]));
        const win = async (name, ms) => { const a = await metrics(); await sleep(ms); const b = await metrics(); run.windows[name] = Object.fromEntries(METRICS.map((k) => [k, b[k] - a[k]])); };
        const go = (y) => page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), dispatchEvent(new Event('scroll')), performance.now())`);
        // control: still at the bar state (button shown, nothing changing in the bar)
        await go(yBar); await sleep(3000); await win('stillBar', 1500);
        await go(yPill); await sleep(3000); await win('stillPill', 1500);
        // pass 0 (glide): an in-page rAF scroll from progress 0.50 to 0.80 over 1 s, hold 1.6 s, back over 1 s, hold 1.6 s
        const yLo = await page.eval(Y_AT(0.5)), yHi = await page.eval(Y_AT(0.8));
        await go(yLo); await sleep(2500);
        run.sampler0 = await page.eval(SAMPLER); await sleep(200);
        run.glide = await page.eval(`new Promise((res) => { const raf = window.__fwRawRaf; const pn = window.__fwRawNow; const t0 = pn(); const seg = (a, b, d, next) => { const s = pn(); const f = () => { const k = Math.min(1, (pn() - s) / d); scrollTo({ top: Math.round(a + (b - a) * k), behavior: 'instant' }); k < 1 ? raf(f) : next(); }; raf(f); };
          seg(${yLo}, ${yHi}, 1000, () => setTimeout(() => seg(${yHi}, ${yLo}, 1000, () => setTimeout(() => res({ t0, t1: pn() }), 1600)), 1600)); })`);
        await page.eval('(window.__tpOn = false, 1)');
        run.glideSamples = await page.eval('window.__tp');
        await go(yPill); await sleep(2500);
        // pass 1
        run.sampler = await page.eval(SAMPLER); await sleep(300);
        run.tAppear = await go(yBar); await win('appear0to700', 700); await win('appear700to1600', 900); await sleep(600);
        run.tHide = await go(yPill); await win('hide0to700', 700); await sleep(800);
        await page.eval('(window.__tpOn = false, 1)');
        run.samples = await page.eval('window.__tp');
        // pass 2: frozen stills after the appear step
        await sleep(500);
        const stripH = vp.width <= 640 ? 90 : 110;
        const shot = async (name) => { const sy = await page.eval('scrollY'); const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: sy, width: vp.width, height: stripH, scale: 1 } }); const f = join(OUT, `${vn}-${arm}-${name}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return f; };
        run.stills = [{ ms: -1, strip: await shot('strip-before') }];
        await page.send('Animation.setPlaybackRate', { playbackRate: RATE }); await page.eval(SLOW);
        const w0 = Date.now(); const v0 = await page.eval(`(scrollTo({ top: ${yBar}, behavior: 'instant' }), dispatchEvent(new Event('scroll')), Number(document.timeline.currentTime))`);
        for (const ms of STILL_MS) {
          const wait = w0 + ms / RATE - Date.now() - 300; if (wait > 0) await sleep(wait);
          while ((await page.eval('Number(document.timeline.currentTime)')) - v0 < ms) {}
          await page.send('Animation.setPlaybackRate', { playbackRate: 0 }); await sleep(200);
          const at = (await page.eval('Number(document.timeline.currentTime)')) - v0;
          const st = await page.eval(`(() => { const e = document.querySelector('.start-selling-top-nav-btn.is-earn'); const cs = getComputedStyle(e); return { w: Math.round(e.getBoundingClientRect().width * 10) / 10, op: cs.opacity, mask: cs.maskPosition || cs.webkitMaskPosition }; })()`);
          run.stills.push({ ms, at: +at.toFixed(1), ...st, strip: await shot(`strip-${String(ms).padStart(4, '0')}`) });
          await page.send('Animation.setPlaybackRate', { playbackRate: RATE });
        }
        await page.eval(UNSLOW); await page.send('Animation.setPlaybackRate', { playbackRate: 1 });
        await page.close();
      } finally { s.p.kill(); }
      const S = run.samples || [];
      const ap = S.filter((x) => x.t >= run.tAppear && x.t < run.tHide), hd = S.filter((x) => x.t >= run.tHide);
      const t = (x) => (x ? Math.round(x.t - run.tAppear) : null), th = (x) => (x ? Math.round(x.t - run.tHide) : null);
      const fullW = ap.at(-1)?.earnW;
      const G = run.glideSamples || [], gf = G.findIndex((x) => !/is-hero-pill/.test(x.cls)), gFull = G.find((x) => x.earnW >= fullW - 0.5);
      const gBack = G.findIndex((x, i) => i > gf && gf >= 0 && /is-hero-pill/.test(x.cls));
      run.glideSummary = G.length ? {
        frames: G.length, flipY: gf >= 0 ? G[gf].y : null, earnWAtFlip: gf >= 0 ? [G[gf - 1]?.earnW, G[gf].earnW] : null,
        firstGrowY: G.find((x) => x.earnW > 0.5)?.y, fullY: gFull?.y, fullAfterFlipMs: gFull && gf >= 0 ? Math.round(gFull.t - G[gf].t) : null,
        maxStepPx: Math.max(0, ...G.slice(1).map((x, i) => Math.abs(x.earnW - G[i].earnW))),
        backFlipY: gBack >= 0 ? G[gBack].y : null, earnWAtBackFlip: gBack >= 0 ? [G[gBack - 1].earnW, G[gBack].earnW] : null,
        zeroAfterBackMs: gBack >= 0 ? (() => { const z = G.slice(gBack).find((x) => x.earnW <= 0.5); return z ? Math.round(z.t - G[gBack].t) : null; })() : null,
      } : null;
      run.summary = {
        flipMs: t(ap.find((x) => !/is-hero-pill/.test(x.cls))), fullW,
        widthFullMs: t(ap.find((x) => x.earnW >= fullW - 0.5)), langSettledMs: t(ap.find((x) => Math.abs(x.langRight - ap.at(-1).langRight) < 0.5)),
        opacity1Ms: t(ap.find((x) => +x.earnOp >= 0.999)), maskStartMs: t(ap.find((x) => /unmask/.test(x.anims))), animsEndMs: t(ap.findLast((x) => x.anims)),
        layoutFrames: ap.filter((x, i) => i && (x.earnW !== ap[i - 1].earnW || x.langRight !== ap[i - 1].langRight)).length,
        hideWidth0Ms: th(hd.find((x) => x.earnW <= 0.5)), hideAnimsEndMs: th(hd.findLast((x) => x.anims)),
        errors: run.errors.length, failed: run.failed404.length,
      };
      console.log(vn, arm, JSON.stringify(run.served), JSON.stringify(run.summary), JSON.stringify(run.glideSummary), JSON.stringify(run.windows));
    }
  }
} finally {
  writeFileSync(join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
  await cdp.close?.(); chrome.kill?.();
  console.log('OUT', OUT);
}
process.exit(0); // a served page's open sockets kept the event loop alive past the hold's max-seconds (A run, 2026-10-04)
