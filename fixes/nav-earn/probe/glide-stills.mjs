#!/usr/bin/env node
// nav-earn rev 2 (T-154): frozen stills of the top bar during a slow-motion glide, no timing claims.
// The same glide as top-probe.mjs pass 0 (an in-page scroll from hero progress 0.50 to 0.80 over 1 s, then a hold),
// played at Animation.setPlaybackRate RATE with performance.now pointed at document.timeline (as earn-probe.mjs), so
// the glide, the page's spring and the CSS transitions all run in the same slowed time; at each still time the page is
// frozen (rate 0), the strip is shot and the Join button's width / opacity / mask and the scroll progress are read.
// What a 1 s scroll looks like frame by frame: in v8 the button trails the scroll; in rev 2 it follows it.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-earn -- \
//     node fixes/nav-earn/probe/glide-stills.mjs [phone,desktop] [A,B]
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
const vpNames = (process.argv[2] || 'phone,desktop').split(',');
const ARMS = (process.argv[3] || 'A,B').split(',');
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), B: join(WT, 'fixes/nav-earn/overlay'), R1: join(WT, 'fixes/nav-earn-r1/overlay') };
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `glide-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const STILL_MS = (process.env.GS_STILLS || '200,300,400,500,600,700,800,1000,1300,1600,2200').split(',').map(Number);
const RATE = +(process.env.GS_RATE || 0.05);
const P0 = 0.5, P1 = 0.8, GLIDE_MS = 1000;

const Y_AT = (p) => `(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); const top = r.top + scrollY; return Math.round(top + Math.max(1, r.height - innerHeight) * ${p}); })()`;
const PROG = `(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); return Math.round(Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight))) * 1000) / 1000; })()`;
const SLOW = `(() => { window.__fwRawNow = window.__fwRawNow || performance.now.bind(performance); performance.now = () => Number(document.timeline.currentTime); return 1; })()`;
const UNSLOW = `(() => { performance.now = window.__fwRawNow; return 1; })()`;
const READ = `(() => { const e = document.querySelector('.start-selling-top-nav-btn.is-earn'); const n = document.querySelector('header.start-selling-top-nav'); const cs = getComputedStyle(e);
  return { w: Math.round(e.getBoundingClientRect().width * 10) / 10, op: cs.opacity, mask: cs.maskPosition || cs.webkitMaskPosition, pill: /is-hero-pill/.test(n.className), p: ${PROG} }; })()`;

async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', DIRS[arm], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

const res = { tool: 'fixes/nav-earn/probe/glide-stills.mjs', startedAt: new Date().toISOString(), load1: loadavg()[0], rate: RATE, stillMs: STILL_MS, p0: P0, p1: P1, glideMs: GLIDE_MS, runs: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-earn/chrome'), 'glide'), headless: true, windowSize: '1440,982' });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
try {
  for (const vn of vpNames) {
    const vp = VPS[vn];
    for (const arm of ARMS) {
      const s = await server(arm); const run = { vp: vn, ...vp, arm, errors: [], failed404: [], stills: [] }; res.runs.push(run);
      try {
        const url = `http://localhost:${s.port}/`;
        run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
        const page = await cdp.newIsolatedPage();
        page.on((m) => {
          if (m.method === 'Runtime.exceptionThrown') run.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
          if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) run.failed404.push(m.params.response.status + ' ' + m.params.response.url.replace(url, '/'));
        });
        await page.send('Runtime.enable'); await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
        if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await page.send('Animation.enable');
        await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(2500);
        const yLo = await page.eval(Y_AT(P0)), yHi = await page.eval(Y_AT(P1));
        await page.eval(`(scrollTo({ top: ${yLo}, behavior: 'instant' }), 1)`); await sleep(2500);
        const stripH = vp.width <= 640 ? 90 : 110;
        const shot = async (name) => { const sy = await page.eval('scrollY'); const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: sy, width: vp.width, height: stripH, scale: 1 } }); const f = join(OUT, `${vn}-${arm}-${name}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return f; };
        run.stills.push({ ms: -1, ...(await page.eval(READ)), strip: await shot('strip-before') });
        await page.send('Animation.setPlaybackRate', { playbackRate: RATE }); await page.eval(SLOW);
        const w0 = Date.now();
        const v0 = await page.eval(`(() => { const pn = () => Number(document.timeline.currentTime); const s = pn(); const f = () => { const k = Math.min(1, (pn() - s) / ${GLIDE_MS}); scrollTo({ top: Math.round(${yLo} + (${yHi} - ${yLo}) * k), behavior: 'instant' }); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); return s; })()`);
        for (const ms of STILL_MS) {
          const wait = w0 + ms / RATE - Date.now() - 300; if (wait > 0) await sleep(wait);
          while ((await page.eval('Number(document.timeline.currentTime)')) - v0 < ms) {}
          await page.send('Animation.setPlaybackRate', { playbackRate: 0 }); await sleep(200);
          const at = (await page.eval('Number(document.timeline.currentTime)')) - v0;
          run.stills.push({ ms, at: +at.toFixed(1), ...(await page.eval(READ)), strip: await shot(`strip-${String(ms).padStart(4, '0')}`) });
          await page.send('Animation.setPlaybackRate', { playbackRate: RATE });
        }
        await page.eval(UNSLOW); await page.send('Animation.setPlaybackRate', { playbackRate: 1 });
        await page.close();
      } finally { s.p.kill(); }
      console.log(vn, arm, JSON.stringify(run.served), 'errors', run.errors.length, 'failed', run.failed404.length,
        run.stills.map((x) => `${x.ms}:p${x.p}${x.pill ? 'P' : ''} w${x.w} op${(+x.op).toFixed(2)}`).join(' | '));
    }
  }
} finally {
  writeFileSync(join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
  await cdp.close?.(); chrome.kill?.();
  console.log('OUT', OUT);
}
process.exit(0); // a served page's open sockets kept the event loop alive past the hold's max-seconds (A run, 2026-10-04)
