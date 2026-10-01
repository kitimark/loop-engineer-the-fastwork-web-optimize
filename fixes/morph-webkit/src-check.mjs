// mw10e-src check (Chrome, short lane; mechanism/state only, no timing claim): base aw1-10e vs aw1-10e + idle panel src.
// Mobile 430x932 DPR3, CPU 6x from navigation. Reports per build:
//  - load/idle at y=0 (12 s): long tasks > 50 ms (start, duration), when the panel images all had src and were decoded
//    (complete && naturalWidth), img src writes in the last 3 s at y=0 (idle churn, F-030 style);
//  - scripted scroll 0 -> 2600 (+24 px per frame, instant): img src writes per frame with scrollY, long tasks in the scroll;
//  - the morph at the end (wheel push), animations paused: screenshot; pixel diff base vs src.
// Run: node tools/lock.mjs run chrome-measure --owner fix-nav-morph --short --max-seconds 240 -- node fixes/morph-webkit/src-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/src-check');
mkdirSync(OUT, { recursive: true });
const BASEOV = join(WT, 'fixes/aw1-10e/overlay');
const PRE = `(() => {
  const W = window.__sc = { lt: [], src: [], t0: performance.now() };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) W.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  new MutationObserver((rs) => { for (const r of rs) if (r.target.tagName === 'IMG' && r.target.closest('.start-selling-morph-panel')) W.src.push([Math.round(performance.now()), Math.round(scrollY), (r.target.getAttribute('src') || '').slice(-28)]); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['src'] });
})();`;
const PANEL = `(() => { const im = [...document.querySelectorAll('.start-selling-morph-panel img')]; return { n: im.length, withSrc: im.filter((i) => i.getAttribute('src')).length, decoded: im.filter((i) => i.complete && i.naturalWidth > 0).length }; })()`;
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = {}, shots = {};
try {
  for (const [label, ov] of [['base', BASEOV], ['src', `${join(WT, 'fixes/mw10e-src/overlay')},${BASEOV}`]]) {
    const state = join(OUT, `serve-${label}.json`); rmSync(state, { force: true });
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', ov, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
    const page = await cdp.newIsolatedPage();
    const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PRE });
    await page.send('Page.bringToFront');
    await gotoAndSettle(page, url, { quietMs: 2000 });
    const panelAt = [];
    for (let s = 0; s < 12; s++) { await sleep(1000); panelAt.push(await page.eval(PANEL)); }
    if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page ' + label);
    const idle = await page.eval(`(() => { const W = window.__sc, now = performance.now(); return { lt: W.lt.slice(), srcLast3s: W.src.filter((s) => s[0] > now - 3000).length, srcTotal: W.src.length }; })()`);
    await page.eval('window.__sc.src.length = 0; window.__sc.lt.length = 0; true');
    await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 24; window.scrollTo({ top: y, behavior: 'instant' }); y < 2600 ? requestAnimationFrame(step) : setTimeout(res, 500); }; requestAnimationFrame(step); })`, { timeout: 120000 });
    const scroll = await page.eval(`(() => { const W = window.__sc; const by = {}; for (const s of W.src) by[s[1]] = (by[s[1]] || 0) + 1; return { srcWrites: W.src.length, srcByScrollY: by, lt: W.lt.slice() }; })()`);
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.eval(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`); await sleep(1000);
    for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: 120 }); await sleep(40); }
    await sleep(2500);
    const atMorph = await page.eval(`(() => { document.getAnimations().forEach((a) => { a.currentTime = 0; a.pause(); }); return { morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph'), panel: ${PANEL} }; })()`);
    await sleep(500);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    shots[label] = join(OUT, `${label}-morph.png`); writeFileSync(shots[label], Buffer.from(data, 'base64'));
    res[label] = { panelAt, idle, scroll, atMorph, errors: errors.slice(0, 3) };
    console.log(label, JSON.stringify(res[label]));
    await page.close(); proc.kill();
  }
  const page = await cdp.newIsolatedPage();
  const da = 'data:image/png;base64,' + readFileSync(shots.base).toString('base64'), db = 'data:image/png;base64,' + readFileSync(shots.src).toString('base64');
  const diff = await page.eval(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]); const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let d = 0; for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) d++; return Math.round(10000 * d / (w * h)) / 100; })()`);
  console.log('morph screenshot diff base vs src %:', diff);
  writeFileSync(join(OUT, `src-check-${Date.now()}.json`), JSON.stringify({ res, diff }, null, 1));
} finally { cdp.close(); await ch.close(); }
