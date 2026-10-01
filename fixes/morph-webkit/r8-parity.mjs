// R8 exactness check (Chrome, short lane, visual/state only): on mw10e-ghr8, morph frozen at m in {0.55, 0.7, 0.9, 1},
// animations paused, screenshot with `is-morph-covered` on (as R8 sets it) and off (blurs active as in the original);
// pixel diff inside the nav rect must be 0 %. Also: does the class toggle at the fade threshold during a real morph.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/r8-parity');
mkdirSync(OUT, { recursive: true });
const BUILD = process.env.BUILD || 'mw10e-ghr8';
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
try {
  const state = join(OUT, 'serve.json'); rmSync(state, { force: true });
  const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', `${join(WT, 'fixes', BUILD, 'overlay')},${join(WT, 'fixes/aw1-10e/overlay')}`, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
  const page = await cdp.newIsolatedPage();
  const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
  if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page');
  // real morph via the driver hook, sampling the class each frame
  await page.eval(`(() => { const L = window.__r8log = []; const h = document.querySelector('header.start-selling-top-nav'); const loop = () => { L.push([+h.style.getPropertyValue('--morph') || 0, h.classList.contains('is-morph-covered')]); if (!window.__r8stop) requestAnimationFrame(loop); }; requestAnimationFrame(loop); window.__fwMorphDrive({ hold: 1200, cycles: 1 }); return 1; })()`);
  let md = null; for (let i = 0; i < 30 && !md; i++) { await sleep(500); md = await page.eval('window.__fwMD'); }
  const toggle = await page.eval(`(() => { window.__r8stop = true; const L = window.__r8log; const on = L.filter((f) => f[1]); return { frames: L.length, onFrames: on.length, minMorphOn: on.length ? Math.min(...on.map((f) => f[0])) : null, offAbove055: L.filter((f) => !f[1] && f[0] >= 0.56).length, endOn: L.at(-1)[1], tracks: [...document.querySelectorAll('.start-selling-morph-col-track')].map((t) => getComputedStyle(t).willChange).join('|'), scene: [...document.querySelectorAll('[data-start-selling-scene]')].map((e) => e.dataset.startSellingScene).join('|') }; })()`);
  // frozen frames
  await page.eval(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`); await sleep(500);
  for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: 120 }); await sleep(40); }
  await sleep(2000);
  await page.eval(`document.getAnimations().forEach((a) => { a.currentTime = 0; a.pause(); }); 1`);
  const res = {};
  const PARTS = (process.env.PARTS || 'both').split(',');
  for (const part of PARTS) for (const m of [0.55, 0.7, 0.9, 1]) {
    const shot = async (on) => {
      const rect = await page.eval(`(() => { const h = document.querySelector('header.start-selling-top-nav'), p = document.querySelector('.start-selling-platform');
        h.style.setProperty('--morph', '${m}'); p.style.setProperty('--morph-fade', '0'); p.style.pointerEvents = 'none';
        h.classList.toggle('is-morph-covered', ${on} && '${part}' !== 'platform'); p.classList.toggle('is-morph-covered', ${on} && '${part}' !== 'nav');
        const v = document.querySelector('.start-selling-top-nav .start-selling-morph-veil'); if (v) { const Hf = v.parentElement.offsetHeight; v.style.transform = 'scaleY(' + ((52 + (Hf - 52) * ${m}) / Hf) + ')'; }
        window.__op = getComputedStyle(p).opacity + ' ' + getComputedStyle(p).visibility;
        const r = h.getBoundingClientRect(); return [Math.max(0, Math.floor(r.left)), Math.max(0, Math.floor(r.top)), Math.ceil(r.width), Math.ceil(r.height)]; })()`);
      await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(250);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const f = join(OUT, `${part}-m${m}-${on ? 'on' : 'off'}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return { f, rect };
    };
    const a = await shot(true), b = await shot(false); const op = await page.eval('window.__op');
    const da = 'data:image/png;base64,' + readFileSync(a.f).toString('base64'), db = 'data:image/png;base64,' + readFileSync(b.f).toString('base64');
    res[part + ' ' + m] = await page.eval(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
      const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]); const [x0, y0, w, h] = ${JSON.stringify(a.rect)};
      const c = new OffscreenCanvas(A.width, A.height), x = c.getContext('2d'); x.drawImage(A, 0, 0); const pa = x.getImageData(x0, y0, w, h).data; x.clearRect(0, 0, A.width, A.height); x.drawImage(B, 0, 0); const pb = x.getImageData(x0, y0, w, h).data;
      let d = 0, any = 0; for (let i = 0; i < pa.length; i += 4) { const s = Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]); s > 48 && d++; s > 0 && any++; }
      return { op: ${JSON.stringify(op)}, rect: [x0, y0, w, h], diffPct: Math.round(10000 * d / (w * h)) / 100, anyChangedPx: any }; })()`);
  }
  console.log(JSON.stringify({ build: BUILD, toggle, frozen: res, errors }));
  proc.kill();
} finally { cdp.close(); await ch.close(); }
