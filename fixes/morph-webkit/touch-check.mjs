// Touch-driven morph check (Chrome, short lane; behaviour only): does a touch swipe at the end of the page start the
// morph, for a touch that starts on #platform and for one that starts above it (if any of the page shows above it)?
// Builds: aw1-10e (window listeners at the zone edge), mw10e-arm-load (F1, window, once at setup), mw10e-arm-scope
// (F3, touch listeners on #platform + nav header). Mobile 430x932 DPR1 with touch emulation, no throttling.
// Run: node tools/lock.mjs run chrome-measure --owner fix-nav-morph --short --max-seconds 200 -- node fixes/morph-webkit/touch-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/touch-check');
mkdirSync(OUT, { recursive: true });
const BASEOV = join(WT, 'fixes/aw1-10e/overlay');
const BUILDS = (process.env.BUILDS || 'base,mw10e-arm-load,mw10e-arm-scope').split(',');
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = {};
const MORPH = `+(document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph') || 0)`;
try {
  for (const b of BUILDS) {
    const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
    const ov = b === 'base' ? BASEOV : `${join(WT, 'fixes', b, 'overlay')},${BASEOV}`;
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', ov, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    try {
      let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
      const out = {};
      for (const where of ['platform', 'above']) {
        const page = await cdp.newIsolatedPage();
        const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); });
        await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Page.bringToFront');
        await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
        // to the end in steps so the IO fires as in a real scroll
        await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 1200); }; requestAnimationFrame(step); })`, { timeout: 60000 });
        const geo = await page.eval(`(() => { const p = document.querySelector('.start-selling-platform').getBoundingClientRect(); const h = document.querySelector('header.start-selling-top-nav').getBoundingClientRect(); return { pTop: Math.round(p.top), pBottom: Math.round(p.bottom), hBottom: Math.round(h.bottom), vh: innerHeight, scrollY: Math.round(scrollY), maxY: document.documentElement.scrollHeight - innerHeight }; })()`);
        const x = 215, y0 = where === 'platform' ? Math.min(geo.vh - 40, Math.max(geo.pTop + 60, geo.vh * 0.75)) : Math.max(geo.hBottom + 20, Math.min(geo.pTop - 30, geo.vh * 0.3));
        const startsOn = await page.eval(`(() => { const el = document.elementFromPoint(${x}, ${y0}); return el ? (el.closest('.start-selling-platform') ? 'platform' : el.closest('header.start-selling-top-nav') ? 'nav' : (el.tagName + '.' + String(el.className).split(' ')[0])) : null; })()`);
        await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
        for (let i = 1; i <= 12; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 20 }] }); await sleep(16); }
        await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        let maxM = 0; for (let i = 0; i < 15; i++) { await sleep(100); maxM = Math.max(maxM, await page.eval(MORPH)); }
        out[where] = { y0: Math.round(y0), startsOn, geo, morphAfterSwipe: Math.round(maxM * 1000) / 1000, errors: errors.slice(0, 3) };
        await page.close();
      }
      res[b] = out; console.log(b, JSON.stringify(out));
    } finally { proc.kill(); }
  }
  writeFileSync(join(OUT, `touch-check-${Date.now()}.json`), JSON.stringify(res, null, 1));
} finally { cdp.close(); await ch.close(); }
