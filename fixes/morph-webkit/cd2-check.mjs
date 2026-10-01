// Countdown fix + P10 + stub mechanism check (Chrome, short lane; mechanism / parity only, no timing claim).
// - aw1-10e vs mw10e-cdwc (landable, no driver hook): wheel push past the end -> m=1 hold: panel faces' computed
//   will-change, LayerTree count; same-page parity on aw1-10e with the cdwc rule injected; wheel back -> m=0.
// - mw10e-g vs mw10e-g-cdwc (driver): faces + layers at the hold.
// - mw10e-gh-cdwc vs mw10e-gh-cdwc-a1 (driver, 2 cycles): the first logged m values of each tween (A1: start ± 0.0011,
//   then the ease-out from 16.67 ms).
// - mw10e-stub (driver): morph reaches 1 and 0, panel content not displayed, a hold screenshot.
// node tools/lock.mjs run chrome-measure --owner fix-nav-morph --short --max-seconds 280 -- node fixes/morph-webkit/cd2-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/cd2-check');
mkdirSync(OUT, { recursive: true });
const ov = (b) => join(WT, 'fixes', b, 'overlay');
const BASEOV = ov('aw1-10e');
const BUILDS = (process.env.BUILDS || 'aw1-10e,mw10e-cdwc,mw10e-g,mw10e-g-cdwc,mw10e-gh-cdwc,mw10e-gh-cdwc-a1,mw10e-stub').split(',');
const RULE = '.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c { will-change: auto; }';
const M = `+document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph') || 0`;
const FACES = `(() => { const f = [...document.querySelectorAll('.start-selling-morph-panel .waitlist-closing-countdown .face')];
  const other = [...document.querySelectorAll('.face')].filter((e) => !e.closest('.start-selling-morph-panel'));
  const disp = (s) => { const e = document.querySelector('.start-selling-top-nav ' + s); return e && getComputedStyle(e).display; };
  return { panelFaces: f.length, panelWcTransform: f.filter((e) => getComputedStyle(e).willChange === 'transform').length,
    otherFaces: other.length, otherWcTransform: other.filter((e) => getComputedStyle(e).willChange === 'transform').length,
    scene: document.querySelector('.start-selling-morph-panel')?.getAttribute('data-start-selling-scene'), morph: ${M},
    display: { backdrop: disp('.start-selling-morph-backdrop'), center: disp('.start-selling-morph-center'), footer: disp('.start-selling-morph-footer'), veil: disp('.start-selling-morph-veil') } }; })()`;
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = {}, shots = {};
const pngDiff = async (page, a, b) => {
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64'), db = 'data:image/png;base64,' + readFileSync(b).toString('base64');
  return page.eval(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]); const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let d = 0; for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) d++; return Math.round(10000 * d / (w * h)) / 100; })()`);
};
try {
  for (const b of BUILDS) {
    const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
    const chain = b === 'aw1-10e' ? BASEOV : `${ov(b)},${BASEOV}`;
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', chain, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    try {
      let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
      const page = await cdp.newIsolatedPage();
      const errors = []; let layers = 0; const lt = [];
      page.on((m) => {
        if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
        if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) { layers = m.params.layers.length; lt.push([Date.now(), layers]); }
      });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
      await page.send('Page.bringToFront');
      await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
      if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page ' + b);
      const hasDriver = await page.eval(`typeof window.__fwMorphDrive === 'function'`);
      await page.send('LayerTree.enable'); await sleep(800);
      const r = { hasDriver, atRest: { layers, faces: await page.eval(FACES) } };
      const waitM = async (pred, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = await page.eval(M); if (pred(m)) return Date.now() - t0; await sleep(50); } return -1; };
      const t0 = Date.now();
      if (!hasDriver) {
        // wheel path: scroll to the end, wait for the IO, push past the end
        await page.eval(`(window.scrollTo(0, document.documentElement.scrollHeight), 1)`); await sleep(1500);
        for (let i = 0; i < 3; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: 120 }); await sleep(120); }
      } else {
        await page.eval(`window.__fwMorphDrive({ hold: 2500, cycles: 2 }); 1`);
      }
      r.tHoldMs = await waitM((m) => m >= 0.999, 8000);
      await sleep(300);
      r.atHold = { layers, faces: await page.eval(FACES) };
      r.maxLayersToHold = Math.max(0, ...lt.filter((x) => x[0] >= t0).map((x) => x[1]));
      if (b === 'aw1-10e' || b === 'mw10e-stub') {
        await page.eval(`(document.getAnimations().forEach((a) => a.pause()), 1)`); await sleep(300);
        const shot = async (n) => { await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(200); const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); shots[n] = join(OUT, `${n}-hold.png`); writeFileSync(shots[n], Buffer.from(data, 'base64')); };
        if (b === 'aw1-10e') {
          await shot('aw');
          await page.eval(`(() => { const s = document.createElement('style'); s.id = '__cd'; s.textContent = ${JSON.stringify(RULE)}; document.head.append(s); return 1; })()`);
          await sleep(100);
          r.injectedFaces = await page.eval(FACES);
          await shot('cdwc-injected');
          await page.eval(`(document.getElementById('__cd').remove(), 1)`);
          await shot('aw-again');
        } else await shot('stub');
        await page.eval(`(document.getAnimations().forEach((a) => a.play()), 1)`);
      }
      if (!hasDriver) {
        for (let i = 0; i < 3; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: -120 }); await sleep(120); }
        r.tBackMs = await waitM((m) => m <= 0.001, 6000);
      } else {
        let md = null; for (let i = 0; i < 40 && !md; i++) { await sleep(500); md = await page.eval('window.__fwMD'); }
        md = md && JSON.parse(md);
        if (md) {
          // first logged m values of each tween: rows [t, dt, scrollY, m]; a tween starts where m leaves 0 or 1
          const f = md.frames, starts = [];
          for (let i = 1; i < f.length; i++) { const p = f[i - 1][3], m = f[i][3]; if ((p <= 0 && m > 0) || (p >= 1 && m < 1)) starts.push({ dir: p <= 0 ? 'fwd' : 'rev', m: f.slice(i, i + 4).map((x) => x[3]) }); }
          r.driver = { moving: md.moving, atOne: md.atOne, atZero: md.atZero, tweenStarts: starts, endsAt: f.at(-1)?.[3] };
        }
      }
      r.after = { layers, morph: await page.eval(M) };
      r.errors = errors.slice(0, 3);
      await page.send('LayerTree.disable');
      res[b] = r;
      console.log(b, JSON.stringify(r));
      await page.close();
    } finally { proc.kill(); }
  }
  if (shots.aw) {
    const page = await cdp.newIsolatedPage();
    const diff = {};
    for (const n of ['aw-again', 'cdwc-injected']) diff[n] = await pngDiff(page, shots.aw, shots[n]);
    console.log('aw1-10e hold screenshot diff, same page, rule injected %:', JSON.stringify(diff));
    res.parity = diff;
    await page.close();
  }
  writeFileSync(join(OUT, `cd2-check-${Date.now()}.json`), JSON.stringify(res, null, 1));
} finally { cdp.close(); await ch.close(); }
