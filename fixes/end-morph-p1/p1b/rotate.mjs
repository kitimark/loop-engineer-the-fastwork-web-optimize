// A (P1 + P1b (a)) gate, lead ruling 09:35Z (fix-end-morph-p1): rotation and install checks. COUNTS/VALUES ONLY,
// headless, no timing. Per arm:
//   install  the size probe (.fw-rv-size) after load: how many, where; at 1280 x 800 desktop (no touch) there is none;
//            the server's nav node survived (hydration did not re-mount it);
//   rotate   phone 430 x 932 portrait, page walked to the end, a held synthetic touch, the reveal on (m ~ 0.5 of the end
//            track); then landscape 932 x 430 (wider than the reveal's 640 px query) and back to portrait, a probe
//            3 frames + 400 ms after each change: the nav's / glass's data-fw-rv, every inline style property the reveal
//            writes on the header subtree, the glass and the dark layer, m, and on portrait the clip against the nav's
//            current size (inset 4 (1 - m) on top/right/left, height 52 + (H - 52) m); finally the page at m = 0 (top
//            of the end track) and m = 1 (bottom) settled;
//   errors   window 'error' events (a ResizeObserver loop error comes as one), console errors, uncaught exceptions;
//            callbacks of every ResizeObserver that observes a .fw-rv-size node (counted by wrapping the constructor).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 180 --owner fix-end-morph-p1 -- \
//     node fixes/end-morph-p1/p1b/rotate.mjs --arm C=out/p1b/snapi/C1 --arm V=out/p1b/snapi/V1 --arm A=out/p1b/snapi/A1
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const ARMS = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const [n, d] = s.split('='); return { name: n, dir: resolve(WT, d) }; });
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
async function serve(overlay) {
  const st = join(OUT, `serve-rot-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const INIT = `(() => { const E = (window.__rotErr = []); addEventListener('error', (e) => E.push(String(e.message || e.type)), true);
  window.__rotHdr0 = null; const mo = new MutationObserver(() => { if (!window.__rotHdr0) window.__rotHdr0 = document.querySelector('header.start-selling-top-nav'); if (document.readyState !== 'loading') mo.disconnect(); });
  mo.observe(document, { childList: true, subtree: true });
  const RO = window.ResizeObserver; if (!RO) return; window.__rotRO = { n: 0, observers: 0 };
  window.ResizeObserver = class extends RO { constructor(cb) { let probe = false; super((es, o) => { if (probe) window.__rotRO.n++; return cb(es, o); }); this.__p = () => { if (!probe) { probe = true; window.__rotRO.observers++; } }; }
    observe(t, o) { if (t && t.classList && t.classList.contains('fw-rv-size')) this.__p(); return super.observe(t, o); } }; })()`;
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })()`;
const INSTALL = `(() => { const h = document.querySelector('header.start-selling-top-nav'); const z = document.querySelectorAll('.fw-rv-size');
  return { probes: z.length, inNav: !!(h && h.querySelector(':scope > .fw-rv-size')), ariaHidden: z[0] ? z[0].getAttribute('aria-hidden') : null, glass: document.querySelectorAll('.fw-rv-glass').length,
    navSameNode: !!window.__rotHdr0 && window.__rotHdr0 === h, roObservers: window.__rotRO ? window.__rotRO.observers : null, roCallbacks: window.__rotRO ? window.__rotRO.n : null, errors: window.__rotErr || [] }; })()`;
// one state read, 3 frames after the last change
const STATE = `new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
  const h = document.querySelector('header.start-selling-top-nav'), g = document.querySelector('.fw-rv-glass'), d = document.querySelector('.fw-rv-dark');
  const names = (el) => (el ? [...el.style].filter((k) => k !== '--morph').sort() : null);
  const sub = {}; for (const el of [h, ...h.querySelectorAll('[style]')]) { const n = names(el); if (n && n.length) { let k0 = (el === h ? 'header' : (el.className && el.className.baseVal === undefined ? String(el.className).split(' ')[0] : el.tagName.toLowerCase())), k = k0; for (let i = 2; k in sub; i++) k = k0 + '#' + i; sub[k] = n; } }
  const m = parseFloat(h.style.getPropertyValue('--morph')) || 0, c = h.style.getPropertyValue('clip-path'), rv = h.hasAttribute('data-fw-rv');
  const out = { vw: innerWidth, ih: innerHeight, y: Math.round(scrollY), m, rv, glassRv: g ? g.hasAttribute('data-fw-rv') : null, glassStyle: names(g), dark: d ? d.style.getPropertyValue('opacity') : null, clip: c || null, inline: sub,
    navW: h.offsetWidth, navH: h.offsetHeight, probe: (() => { const z = h.querySelector('.fw-rv-size'); if (!z) return null; const r = z.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
    roCallbacks: window.__rotRO ? window.__rotRO.n : null, errors: (window.__rotErr || []).slice() };
  const n = (c.match(/-?[\\d.]+px/g) || []).map(parseFloat);
  if (rv && n.length >= 4) { const H = h.offsetHeight, [t, r, b] = n, l = n.length >= 5 ? n[3] : r; const side = 4 * (1 - m), hh = 52 + (H - 52) * m;
    out.clipOk = Math.abs(t - side) < 0.01 && Math.abs(r - side) < 0.01 && Math.abs(l - side) < 0.01 && Math.abs(H - t - b - hh) < 0.02; out.probeEqNav = !!out.probe && out.probe[0] === h.offsetWidth && out.probe[1] === h.offsetHeight; }
  res(out); }))))`;
const res = { tool: 'fixes/end-morph-p1/p1b/rotate.mjs', startedAt: new Date().toISOString(), arms: {} };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'rot'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const PORTRAIT = { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932, screenOrientation: { type: 'portraitPrimary', angle: 0 } };
const LANDSCAPE = { width: 932, height: 430, deviceScaleFactor: 3, mobile: true, screenWidth: 932, screenHeight: 430, screenOrientation: { type: 'landscapePrimary', angle: 90 } };
async function open(url, metrics, touch) {
  const page = await cdp.newIsolatedPage(); const cons = [];
  await page.send('Runtime.enable');
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') cons.push('exception: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) cons.push(m.params.type + ': ' + m.params.args.map((x) => x.value ?? x.description ?? '').join(' ').slice(0, 200)); });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  await page.send('Emulation.setDeviceMetricsOverride', metrics);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: touch ? 'none' : 'hover' }, { name: 'pointer', value: touch ? 'coarse' : 'fine' }] }).catch(() => {});
  await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
  await sleep(800);
  return { page, cons };
}
try {
  for (const arm of ARMS) {
    const srv = await serve(arm.dir); const r = (res.arms[arm.name] = { overlay: arm.dir, steps: [] });
    try {
      // desktop: no probe
      { const { page, cons } = await open(srv.url, { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, false);
        r.desktop = await page.eval(INSTALL); r.desktop.console = cons; console.log(arm.name, 'desktop', JSON.stringify(r.desktop)); await page.close(); }
      const { page, cons } = await open(srv.url, PORTRAIT, true);
      r.install = await page.eval(INSTALL); console.log(arm.name, 'install', JSON.stringify(r.install));
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y = Math.min(y + 400, document.documentElement.scrollHeight); scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight - innerHeight ? setTimeout(step, 40) : setTimeout(res, 2000); }; step(); })`, { timeout: 90000 });
      await page.eval(TOUCH);
      const step = async (name) => { const s = await page.eval(STATE); s.step = name; r.steps.push(s); console.log(arm.name, name, JSON.stringify(s)); return s; };
      const toM = async (e) => { const g = await page.eval(GEO); await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + e * g.t)}, behavior: 'instant' }), 1)`); await sleep(900); };
      await toM(-1); await toM(0.5);
      await step('portrait m~0.5');
      await page.send('Emulation.setDeviceMetricsOverride', LANDSCAPE); await sleep(400);
      await step('landscape after rotate');
      await sleep(1200);
      await step('landscape +1.2 s');
      await page.send('Emulation.setDeviceMetricsOverride', PORTRAIT); await sleep(400);
      await step('portrait after rotate back');
      await toM(0.5);
      await step('portrait m~0.5 again');
      await toM(-0.6); await sleep(600);
      await step('portrait m=0 (above the end track)');
      await toM(1.2); await sleep(600);
      await step('portrait m=1 (bottom)');
      r.console = cons;
      await page.close();
    } finally { srv.proc.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `rotate-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
