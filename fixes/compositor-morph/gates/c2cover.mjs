// c2 coverage (arch-compositor-morph, lead's point 1 before P-159): c2 moves the nav hit test after an m <= 0.2 write
// from a microtask in the same frame (v11) to the next frame's rAF (__cmReTest). That can only show if the answer of
// F() differs between the two frames. This probe walks every scroll position where the re-test can fire (from
// endStart - 2 ih, i.e. a fling-up exit landing well above the end zone, to endStart + 0.2 t), in 4 px steps, down
// (from closed) and up (from m 0.6 back to closed, panel state on the way back), settles two rAFs at each, and logs
// (1) F()'s answer replicated in the page (same probe point, same skip rule, same dark lists, JS 13929-13967) plus the
// box it hit, (2) the nav's is-on-dark class (= g while m <= 0.2). Chrome 430xH DPR 3, touch held, no throttling;
// functional (shared slot, weight probe).
//   node out/cm/c2cover.mjs --arms A=<dir>,B=<dir> [--h 775] [--step 4]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const H = Number(arg('--h', '775')), STEP = Number(arg('--step', '4'));
const OUT = join(WT, 'out/cm/c2cover-' + H + '-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
// F() replica: u, d, j() and the skip rule copied from JS 13929-13967 (c2 = v11 there)
const WALK = (ys) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; const out = []; let i = 0;
  const T = document.querySelector('header.start-selling-top-nav');
  const u = ['.commission-card', '.start-selling-future-card', '.hero'], d = ['.pain', '.start-selling-platform-card', '.start-selling-platform'];
  const j = (e) => !e || u.some((t) => e.closest(t)) ? false : !!(d.some((t) => e.closest(t)) || e.closest('.commission.shrinking'));
  const nm = (e) => e ? (e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).trim().split(/\\s+/).slice(0, 2).join('.')).slice(0, 60) : 'null';
  const F = () => { const r = T.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height, 64) / 2;
    for (const e of document.elementsFromPoint(x, y)) if (!T.contains(e) || e.closest('.start-selling-top-nav-actions, .start-selling-morph-panel')) return [j(e) ? 1 : 0, nm(e), Math.round(y)];
    return [j(null) ? 1 : 0, 'null', Math.round(y)]; };
  const step = () => { window.scrollTo({ top: ys[i], behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(() => { const c = T.classList; const f = F();
      out.push([Math.round(scrollY), f[0], c.contains('is-on-dark') ? 1 : 0, c.contains('is-expanded') ? 1 : 0, c.contains('is-earn-hidden') ? 1 : 0, f[1], f[2]]);
      i++; i < ys.length ? step() : res(JSON.stringify(out)); })); };
  step(); })`;
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmc2cover'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const res = { h: H, step: STEP, arms: {} };
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
      let g = JSON.parse(await page.eval(GEO));
      const y0 = Math.round(g.endStart - 2 * g.ih), y1 = Math.round(g.endStart + 0.2 * g.t), yTop = Math.round(g.endStart + 0.6 * g.t);
      await page.eval(`(scrollTo({ top: ${y0 - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
      g = JSON.parse(await page.eval(GEO));
      await page.eval(TOUCH);
      await page.eval(`(scrollTo({ top: ${y0}, behavior: 'instant' }), 1)`); await sleep(1000);
      const down = []; for (let y = y0; y <= y1; y += STEP) down.push(y);
      const rowsDown = JSON.parse(await page.eval(WALK(down)));
      // up the morph to 0.6 (panel open), then back down through 0.2 to y0
      const open = []; for (let y = y1; y <= yTop; y += 24) open.push(y);
      await page.eval(WALK(open)); await sleep(800);
      const up = []; for (let y = y1; y >= y0; y -= STEP) up.push(y);
      const rowsUp = JSON.parse(await page.eval(WALK(up)));
      res.arms[A.k] = { geo: g, y0, y1, down: rowsDown, up: rowsUp };
      for (const [nmR, rows] of [['from-closed', rowsDown], ['back-from-open', rowsUp]]) {
        const fv = new Set(rows.map((r) => r[1])), cv = new Set(rows.map((r) => r[2])), hits = {};
        for (const r of rows) hits[r[5]] = (hits[r[5]] || 0) + 1;
        let flips = 0; for (let i = 1; i < rows.length; i++) if (rows[i][1] !== rows[i - 1][1]) flips++;
        const mism = rows.filter((r) => r[1] !== r[2]).length;
        console.log(`== ${A.k} h${H} ${nmR}: positions ${rows.length} y ${rows[0][0]}..${rows.at(-1)[0]} (endStart ${g.endStart}, t ${g.t}) F() values {${[...fv]}} flips ${flips}; is-on-dark values {${[...cv]}}; F != class at ${mism}; probe y ${rows[0][6]}; hits ${JSON.stringify(hits)}`);
        if (flips) for (let i = 1; i < rows.length; i++) if (rows[i][1] !== rows[i - 1][1]) console.log(`   flip at y ${rows[i - 1][0]} -> ${rows[i][0]}: ${rows[i - 1][1]}(${rows[i - 1][5]}) -> ${rows[i][1]}(${rows[i][5]})`);
      }
    } finally { try { page && (await page.close()); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
} finally {
  writeFileSync(join(OUT, 'c2cover.json'), JSON.stringify(res));
  try { cdp.close(); await chrome.close(); } catch {}
  console.log('wrote', join(OUT, 'c2cover.json'));
}
