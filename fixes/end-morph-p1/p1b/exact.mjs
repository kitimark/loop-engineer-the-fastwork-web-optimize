// P1b gate (a) (fix-end-morph-p1, lead GO 2026-10-06): the cached panel size equals the one P1 read, exactly.
// COUNTS/VALUES ONLY, headless, no timing. Per arm and viewport height (430 x 775 / 815 / 932, DPR 3, mobile, touch):
//   size   the hidden probe's border box (.fw-rv-size, what the ResizeObserver hands over, rounded) against the nav's
//          offsetWidth / offsetHeight with [data-fw-rv] set (what P1 read in the switch-on frame);
//   clip   with the reveal on (m inside the end track, a held synthetic touch), the nav's inline clip-path against the
//          box the reveal must cut at the current m from the nav's CURRENT size: inset top = right = left = 4 (1 - m),
//          height between the insets = 52 + (H - 52) m; then the viewport height changes (775 -> 815 -> 932 -> 775,
//          as a toolbar or another phone would change 100dvh) and the check runs again 3 frames later;
//   armed  (arms with P1b (b) only) the same at m = 0 half a track above the end (the armed approach): pill 52 px high.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph-p1 -- \
//     node fixes/end-morph-p1/p1b/exact.mjs --arm V=out/p153/snap/V --arm A=fixes/end-morph-p1b-a/overlay --arm AB=fixes/end-morph-p1b-ab/overlay
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const ARMS = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const [n, d] = s.split('='); return { name: n, dir: resolve(WT, d) }; });
const HS = [775, 815, 932];
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
async function serve(overlay) {
  const st = join(OUT, `serve-ex-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })()`;
// the probe's box and the nav's own full size (attribute on for the read only when the reveal is off)
const SIZE = `(() => { const h = document.querySelector('header.start-selling-top-nav'); const z = h && h.querySelector('.fw-rv-size'); const had = h.hasAttribute('data-fw-rv');
  const tp = h.style.getPropertyValue('transition-property'); h.style.setProperty('transition-property', 'none'); had || h.setAttribute('data-fw-rv', ''); const W = h.offsetWidth, H = h.offsetHeight, Wx = h.getBoundingClientRect().width, Hx = h.getBoundingClientRect().height; had || h.removeAttribute('data-fw-rv'); void h.offsetWidth; tp ? h.style.setProperty('transition-property', tp) : h.style.removeProperty('transition-property');
  const r = z ? z.getBoundingClientRect() : null; return { ih: innerHeight, navW: W, navH: H, navWx: Wx, navHx: Hx, sizeW: r ? Math.round(r.width) : null, sizeH: r ? Math.round(r.height) : null, sizeWx: r && r.width, sizeHx: r && r.height,
    eq: r ? Math.round(r.width) === W && Math.round(r.height) === H : null }; })()`;
const CLIP = `new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { const h = document.querySelector('header.start-selling-top-nav');
  const rv = h.hasAttribute('data-fw-rv'), m = parseFloat(h.style.getPropertyValue('--morph')) || 0, c = h.style.getPropertyValue('clip-path');
  const n = (c.match(/-?[\\d.]+px/g) || []).map(parseFloat); const H = h.offsetHeight, W = h.offsetWidth;
  const out = { ih: innerHeight, y: Math.round(scrollY), rv, m, clip: c, navW: W, navH: H };
  if (rv && n.length >= 4) { const [t, r, b] = n, l = n.length >= 5 ? n[3] : r; const want = { side: 4 * (1 - m), h: 52 + (H - 52) * m }; out.box = { top: t, right: r, left: l, h: Math.round((H - t - b) * 1e4) / 1e4 }; out.want = { side: Math.round(want.side * 1e4) / 1e4, h: Math.round(want.h * 1e4) / 1e4 };
    out.ok = Math.abs(t - want.side) < 0.01 && Math.abs(r - want.side) < 0.01 && Math.abs(l - want.side) < 0.01 && Math.abs(H - t - b - want.h) < 0.02; }
  res(out); }))))`;
const res = { tool: 'fixes/end-morph-p1/p1b/exact.mjs', startedAt: new Date().toISOString(), arms: {} };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'ex'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const arm of ARMS) {
    const srv = await serve(arm.dir); const r = (res.arms[arm.name] = { overlay: arm.dir, size: {}, clip: [], armed: [] });
    try {
      for (const H of HS) {
        const page = await cdp.newIsolatedPage();
        const metrics = (h) => page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
        await metrics(H);
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
        await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
        await sleep(800);
        r.size[H] = await page.eval(SIZE);
        console.log(arm.name, H, 'size', JSON.stringify(r.size[H]));
        if (H !== 775) { await page.close(); continue; }
        // walk to the end (lazy content), then into the end track with a held touch
        await page.eval(`new Promise((res) => { let y = 0; const step = () => { y = Math.min(y + 400, document.documentElement.scrollHeight); scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight - innerHeight ? setTimeout(step, 40) : setTimeout(res, 2000); }; step(); })`, { timeout: 90000 });
        await page.eval(TOUCH);
        let g = await page.eval(GEO);
        // armed approach first (m = 0, half a track above the end), then m ~ 0.5
        for (const [kind, e] of [['armed', -0.5], ['clip', 0.5]]) {
          await page.eval(`(scrollTo({ top: ${g.endStart - 0.75 * g.t - g.ih}, behavior: 'instant' }), 1)`); await sleep(600);
          g = await page.eval(GEO);
          await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + e * g.t)}, behavior: 'instant' }), 1)`); await sleep(900);
          for (const h2 of [775, 815, 932, 775]) {
            if (h2 !== innerHeightOf(r, kind)) { await metrics(h2); await sleep(400); }
            const c = await page.eval(CLIP); c.vh = h2; r[kind].push(c);
            console.log(arm.name, kind, h2, JSON.stringify(c));
          }
          await metrics(775); await sleep(400); g = await page.eval(GEO);
        }
        await page.close();
      }
    } finally { srv.proc.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
function innerHeightOf(r, kind) { const a = r[kind]; return a.length ? a[a.length - 1].vh : 775; }
res.endedAt = new Date().toISOString();
const f = join(OUT, `exact-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
