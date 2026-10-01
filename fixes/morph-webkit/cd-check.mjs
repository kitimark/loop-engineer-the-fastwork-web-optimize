// Countdown probe check (Chrome, short lane; mechanism / parity only, no timing claim): gh vs gh-cdwc vs gh-cdhid.
// Per build: drive one morph cycle (__fwMorphDrive hold 1500) and record the Chrome layer count (LayerTree) over time;
// at the m=1 hold: panel countdown faces whose computed will-change is `transform`, countdown visibility, a screenshot
// (animations paused) diffed against gh. Run:
// node tools/lock.mjs run chrome-measure --owner fix-nav-morph --short --max-seconds 240 -- node fixes/morph-webkit/cd-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/cd-check');
mkdirSync(OUT, { recursive: true });
const BASEOV = join(WT, 'fixes/aw1-10e/overlay');
const FACES = `(() => { const f = [...document.querySelectorAll('.start-selling-morph-panel .waitlist-closing-countdown .face')]; const all = document.querySelectorAll('.face').length;
  const cd = document.querySelector('.start-selling-morph-panel .waitlist-closing-countdown');
  return { panelFaces: f.length, wcTransform: f.filter((e) => getComputedStyle(e).willChange === 'transform').length, allFacesOnPage: all, cdVisibility: cd && getComputedStyle(cd).visibility,
    scene: document.querySelector('.start-selling-morph-panel')?.getAttribute('data-start-selling-scene'), morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph') }; })()`;
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = {}, shots = {};
try {
  for (const b of ['mw10e-gh', 'mw10e-gh-cdwc', 'mw10e-gh-cdhid']) {
    const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', `${join(WT, 'fixes', b, 'overlay')},${BASEOV}`, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
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
      await page.send('LayerTree.enable'); await sleep(800);
      const atRest = { layers, faces: await page.eval(FACES) };
      const t0 = Date.now();
      await page.eval(`window.__fwMorphDrive({ hold: 6000, cycles: 1 }); 1`);
      let tHold = 0; for (let i = 0; i < 150 && !tHold; i++) { await sleep(100); if (+(await page.eval(`document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph')`)) >= 0.999) tHold = Date.now() - t0; }
      await sleep(300);
      const atHold = { tHoldMs: tHold, layers, faces: await page.eval(FACES) };
      if (b === 'mw10e-gh') {
        // parity in ONE page (the countdown ticks between pages): freeze, shot, inject the cdwc rule, shot, remove, inject cdhid, shot
        await page.eval(`(window.__cdT = Date.now(), document.getAnimations().forEach((a) => a.pause()), 1)`); await sleep(300);
        const shot = async (n) => { await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(200); const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); shots[n] = join(OUT, `${n}-hold.png`); writeFileSync(shots[n], Buffer.from(data, 'base64')); };
        await shot('gh');
        await page.eval(`(() => { const s = document.createElement('style'); s.id = '__cd'; s.textContent = '.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c { will-change: auto !important; }'; document.head.append(s); return 1; })()`);
        await shot('cdwc-injected');
        await page.eval(`(document.getElementById('__cd').textContent = '.start-selling-morph-panel .waitlist-closing-countdown { visibility: hidden !important; }', 1)`);
        await shot('cdhid-injected');
        await page.eval(`(document.getElementById('__cd').remove(), 1)`);
        await shot('gh-again');
        await page.eval(`(document.getAnimations().forEach((a) => a.play()), 1)`);
      }
      let md = null; for (let i = 0; i < 30 && !(md && md.moving); i++) { await sleep(500); md = await page.eval('window.__fwMD'); }
      await sleep(800);
      const after = { layers, faces: await page.eval(FACES) };
      const maxLayers = Math.max(0, ...lt.filter((x) => x[0] >= t0).map((x) => x[1]));
      await page.send('LayerTree.disable');
      res[b] = { atRest, atHold, after, maxLayersInCycle: maxLayers, driver: md ? { moving: md.moving, atOne: md.atOne } : null, errors: errors.slice(0, 3) };
      console.log(b, JSON.stringify(res[b]));
      await page.close();
    } finally { proc.kill(); }
  }
  const page = await cdp.newIsolatedPage();
  const diff = {};
  for (const b of ['gh-again', 'cdwc-injected', 'cdhid-injected']) {
    const da = 'data:image/png;base64,' + readFileSync(shots.gh).toString('base64'), db = 'data:image/png;base64,' + readFileSync(shots[b]).toString('base64');
    diff[b] = await page.eval(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
      const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]); const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
      let d = 0; for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) d++; return Math.round(10000 * d / (w * h)) / 100; })()`);
  }
  console.log('hold screenshot diff vs gh, same page, rule injected %:', JSON.stringify(diff));
  writeFileSync(join(OUT, `cd-check-${Date.now()}.json`), JSON.stringify({ res, diff }, null, 1));
} finally { cdp.close(); await ch.close(); }
