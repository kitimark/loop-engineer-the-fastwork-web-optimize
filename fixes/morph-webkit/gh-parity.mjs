// Visual parity of the h-fixedpanel ablation (mw10e-gh) vs g (mw10e-g) in Chrome, mobile 430x932 (phone CSS
// query applies). Morph pinned at fixed values by overriding the nav's inline --morph after the morph settled,
// animations paused; for gh the veil scale is set as S() would. Pixel diff per value (verify.mjs's method).
// State/visual only, no timing. Run in the short lane: node tools/lock.mjs run chrome-measure --short ... -- node <this>
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/gh-parity');
mkdirSync(OUT, { recursive: true });
const BASEOV = join(WT, 'fixes/aw1-10e/overlay');
const MS = [0.15, 0.35, 0.6, 1];
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const shots = {};
try {
  for (const b of ['mw10e-g', 'mw10e-gh']) {
    const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', `${join(WT, 'fixes', b, 'overlay')},${BASEOV}`, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
    const page = await cdp.newIsolatedPage();
    const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
    await page.send('Page.bringToFront');
    await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
    if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page ' + b);
    await page.eval(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`); await sleep(800);
    for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: 120 }); await sleep(40); }
    await sleep(2000);
    const info = await page.eval(`(() => { document.getAnimations().forEach((a) => a.pause()); const p = document.querySelector('.start-selling-top-nav .start-selling-morph-panel'); return { morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph'), panelH: p && p.offsetHeight, panelW: p && p.offsetWidth }; })()`);
    shots[b] = { info, errors, files: {} };
    for (const m of MS) {
      await page.eval(`(() => { const h = document.querySelector('header.start-selling-top-nav'); h.style.setProperty('--morph', '${m}');
        const v = document.querySelector('.start-selling-top-nav .start-selling-morph-veil'); if (v && '${b}' === 'mw10e-gh') { const Hf = v.parentElement.offsetHeight; v.style.transform = 'scaleY(' + ((52 + (Hf - 52) * ${m}) / Hf) + ')'; } })()`);
      await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(300);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const f = join(OUT, `${b}-m${m}.png`); writeFileSync(f, Buffer.from(data, 'base64')); shots[b].files[m] = f;
    }
    await page.close(); proc.kill();
  }
  const page = await cdp.newIsolatedPage();
  const res = {};
  for (const m of MS) {
    const da = 'data:image/png;base64,' + readFileSync(shots['mw10e-g'].files[m]).toString('base64');
    const db = 'data:image/png;base64,' + readFileSync(shots['mw10e-gh'].files[m]).toString('base64');
    res[m] = await page.eval(`(async () => {
      const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
      const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]);
      const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
      x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
      x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
      let diff = 0, y0 = h, y1 = 0;
      for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) { diff++; const y = Math.floor(i / 4 / w); y < y0 && (y0 = y); y > y1 && (y1 = y); }
      return { diffPct: Math.round(10000 * diff / (w * h)) / 100, rows: diff ? [y0, y1] : null };
    })()`);
  }
  console.log(JSON.stringify({ g: shots['mw10e-g'].info, gh: shots['mw10e-gh'].info, errors: { g: shots['mw10e-g'].errors, gh: shots['mw10e-gh'].errors }, diffByMorph: res }));
} finally { cdp.close(); await ch.close(); }
