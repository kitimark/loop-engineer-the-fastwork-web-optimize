// end-morph (fix-end-morph): probe 2 of the P1 residue at m = 0 after a close (em-px2 dn0: the "Join waitlist" label
// 1 css px off while the DOM geometry is identical, em-p1-dn0-probe.mjs). Is it a stale raster? Chrome headless, no
// timing. Per build (v9.2, P1), em-px2's path to dn0, then: shot 1; a forced repaint of the Join button only (an
// inline outline toggled for one frame each way); shot 2. Reports the label's first light column in each shot (row
// css y 42, as measured from the gate shots) and the button's compositing reasons (LayerTree).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/gates/em-p1-dn0-raster.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUILDS = { v92: join(WT, 'fixes/end-morph/overlay'), p1: join(WT, 'fixes/end-morph-p1/overlay') };
const OUT = join(WT, 'out/end-morph', `dn0-raster-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(OUT, { recursive: true });
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const FREEZE = `(() => { for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; } catch {} } return 1; })()`;
const navDiff = (a, b) => { const A = pngPixels(a), B = pngPixels(b); let n = 0; for (let y = 16 * 3; y < 68 * 3; y++) for (let x = 0; x < A.w; x++) { const i = (y * A.w + x) * A.bpp; let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(A.px[i + c] - B.px[i + c])); if (m > 8) n++; } return n; };
const firstLight = (buf) => { const P = pngPixels(buf); const y = 42 * 3; const out = []; let prev = null;
  for (let x = 600; x < P.w; x++) { const i = (y * P.w + x) * P.bpp; const d = (P.px[i] + P.px[i + 1] + P.px[i + 2]) / 3 < 70; if (d !== prev) { out.push((d ? 'D' : 'L') + (x / 3).toFixed(2)); prev = d; } }
  return out.slice(0, 4).join(' '); };
const res = {};
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/end-morph/chrome'), 'emras'), headless: true, windowSize: '430,775' });
const cdp = await C.CDP.connect(chrome.wsUrl);
try {
  for (const [name, dir] of Object.entries(BUILDS)) {
    const st = join(OUT, `serve-${name}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await sleep(2500);
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`, { timeout: 90000 });
      const g = JSON.parse(await page.eval(`JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`));
      await page.eval(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
      await page.eval(TOUCH);
      const shot = async (k) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); const b = Buffer.from(data, 'base64'); writeFileSync(join(OUT, `${name}-${k}.png`), b); return firstLight(b); };
      const out = (res[name] = {});
      await page.eval(`(scrollTo({ top: ${g.endStart - Math.round(g.ih / 2)}, behavior: 'instant' }), 1)`); await sleep(1300);
      await page.eval(FREEZE); await sleep(450); out.pre = await shot('pre');
      for (const m of [0.02, 0.1, 0.19, 0.25, 0.4, 0.5, 0.54, 0.6, 0.8, 0.95, 0.99, 1, 0.5, 0.1]) { await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + m * g.t)}, behavior: 'instant' }), 1)`); await sleep(400); }
      await page.eval(`(scrollTo({ top: ${g.endStart}, behavior: 'instant' }), 1)`); await sleep(1300);
      await page.eval(FREEZE); await sleep(450); out.dn0 = await shot('dn0');
      await page.eval(`new Promise((r) => { const b = document.querySelector('header.start-selling-top-nav .start-selling-top-nav-btn.is-earn'); b.style.outline = '0px solid transparent'; requestAnimationFrame(() => requestAnimationFrame(() => { b.style.outline = ''; requestAnimationFrame(() => requestAnimationFrame(() => r(1))); })); })`);
      await sleep(300); out.dn0Repaint = await shot('dn0-repaint');
      await page.eval(`new Promise((r) => { const h = document.querySelector('header.start-selling-top-nav'); h.style.outline = '0px solid transparent'; requestAnimationFrame(() => requestAnimationFrame(() => { h.style.outline = ''; requestAnimationFrame(() => requestAnimationFrame(() => r(1))); })); })`);
      await sleep(300); out.dn0RepaintNav = await shot('dn0-repaint-nav');
      await page.eval(`new Promise((r) => { document.querySelectorAll('.fw-rv-dark, .fw-rv-glass').forEach((e) => e.remove()); const h = document.querySelector('header.start-selling-top-nav'); h.style.outline = '0px solid transparent'; requestAnimationFrame(() => requestAnimationFrame(() => { h.style.outline = ''; requestAnimationFrame(() => requestAnimationFrame(() => r(1))); })); })`);
      await sleep(300); out.dn0NoRvEls = await shot('dn0-no-rv-els');
      out.rvEls = await page.eval(`document.querySelectorAll('.fw-rv-dark, .fw-rv-glass').length`);
      try { const L = await page.send('LayerTree.enable').then(() => sleep(600)).then(() => null); } catch {}
      try {
        await page.send('DOM.enable'); await page.send('LayerTree.enable'); await sleep(500);
        const root = (await page.send('DOM.getDocument', { depth: -1 })).root;
        const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'header.start-selling-top-nav .start-selling-top-nav-btn.is-earn' });
        out.btnNode = nodeId;
      } catch (e) { out.layerErr = String(e.message || e); }
      await page.close();
      console.log(name, JSON.stringify(out));
    } finally { p.kill(); rmSync(st, { force: true }); }
  }
  // nav band (css y 16-68) pixels over 8 levels against v9.2's own shots
  res.navDiff = {};
  for (const k of ['pre', 'dn0', 'dn0-repaint', 'dn0-repaint-nav', 'dn0-no-rv-els']) {
    const f = (b) => join(OUT, `${b}-${k}.png`);
    if (existsSync(f('p1')) && existsSync(f('v92'))) res.navDiff[k] = { vsV92Same: navDiff(readFileSync(f('v92')), readFileSync(f('p1'))), vsV92dn0: navDiff(readFileSync(join(OUT, 'v92-dn0.png')), readFileSync(f('p1'))) };
  }
  res.navDiff.v92Self = navDiff(readFileSync(join(OUT, 'v92-dn0.png')), readFileSync(join(OUT, 'v92-dn0-no-rv-els.png')));
  console.log('navDiff', JSON.stringify(res.navDiff));
} finally { writeFileSync(join(OUT, 'raster.json'), JSON.stringify(res, null, 1)); cdp.close(); await chrome.close(); console.log('WROTE', OUT); }
