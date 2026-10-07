// Blink check (Chrome 430xH DPR 3, touch held, functional): does the nav jump when the morph switches on at m ~ 0
// (CM: is-morphing on = the wrappers draw the nav) and off again (fw-cm-out)? Settled screenshots of the top 200 css px
// at m = 0, 0.004, 0.008, 0.016, 0.03, then back 0.004, 0; pixel diffs of each step (max channel delta > 8 counts;
// > 48 big), with an m = 0 A/A pair. C (no CM) is the control: its morph is continuous.
//   node out/cm/switch-shot.mjs --arms C=<dir>,V12=<dir> [--h 815]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const src = readFileSync(join(WT, 'research/breakpoints/sim-vp.mjs'), 'utf8');
const pngPixels = new Function('inflateSync', src.slice(src.indexOf('function pngPixels'), src.indexOf('function cmp')) + 'return pngPixels;')(inflateSync);
const cmp = (a, b) => { const A = pngPixels(a), B = pngPixels(b); let tot = 0, big = 0, max = 0, box = [1e9, 1e9, -1, -1];
  for (let i = 0, p = 0; i < A.px.length; i += A.bpp, p++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    if (d > 8) { tot++; if (d > 48) big++; if (d > max) max = d; const y = Math.floor(p / A.w), x = p % A.w; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]; } }
  return { pct: +((100 * tot) / (A.w * A.h)).toFixed(3), big, max, box: tot ? box.join(',') : '-' }; };
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const H = Number(arg('--h', '815'));
const OUT = join(WT, 'out/cm/switch-' + H + '-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, endStart: max - t }; })())`;
const CLS = `(() => { const n = document.querySelector('header.start-selling-top-nav'); return document.documentElement.className + ' | ' + n.className.replace(/svelte-\\w+/g, '').trim(); })()`;
const MS = [['m0', 0], ['m0b', 0], ['m.004', 0.004], ['m.008', 0.008], ['m.016', 0.016], ['m.03', 0.03], ['m.004r', 0.004], ['m0r', 0]];
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmswitch'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
try {
  for (const A of ARMS) {
    const st = join(OUT, `serve-${A.k}.json`); rmSync(st, { force: true });
    const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let page = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      const g = JSON.parse(await page.eval(GEO));
      await page.eval(`(scrollTo({ top: ${g.endStart - 300}, behavior: 'instant' }), 1)`); await sleep(1500);
      await page.eval(TOUCH);
      const shots = {};
      for (const [nm, m] of MS) {
        await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + m * g.t)}, behavior: 'instant' }), 1)`); await sleep(900);
        const cls = await page.eval(CLS);
        const r = await page.send('Page.captureScreenshot', { format: 'png' });
        shots[nm] = Buffer.from(r.data, 'base64'); writeFileSync(join(OUT, `${A.k}-${nm}.png`), shots[nm]);
        console.log(`${A.k} ${nm} y ${Math.round(g.endStart + m * g.t)} ${cls}`);
      }
      const pairs = [['m0', 'm0b'], ['m0b', 'm.004'], ['m.004', 'm.008'], ['m.008', 'm.016'], ['m.016', 'm.03'], ['m.03', 'm.004r'], ['m.004r', 'm0r'], ['m0', 'm0r']];
      for (const [a, b] of pairs) console.log(`${A.k} ${a} -> ${b}: ${JSON.stringify(cmp(shots[a], shots[b]))}`);
    } finally { try { page && (await page.close()); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
} finally { try { cdp.close(); await chrome.close(); } catch {} }
