// mw10e-noinert check (Chrome, short lane; mechanism / a11y / hit-test / parity only, no timing claim).
// Builds: base aw1-10e (pre-mounted panel, inert until the IO edge), mw10e-src, mw10e-noinert (src + no inert,
// tabindex guard). Mobile 430x932 DPR3, CPU 6x. Per build:
//  - idle at y=0 (12 s): long tasks > 50 ms; panel mounted / sourced;
//  - a11y + hit test at y=0 (before the edge) and at y=2600 (after it, before the morph): panel focusables that are
//    sequentially focusable (tabIndex >= 0, no inert ancestor), panel aria-hidden, any panel element hit by
//    elementFromPoint on a grid over the nav rect;
//  - scroll 0 -> 2600 (+24 px per frame): panel attribute mutations (inert, tabindex, src) with scrollY, long tasks;
//  - morph at the end, animations paused: screenshot; pixel diff vs base.
// Run: node tools/lock.mjs run chrome-measure --owner fix-nav-morph --short --max-seconds 280 -- node fixes/morph-webkit/noinert-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/noinert-check');
mkdirSync(OUT, { recursive: true });
const BASEOV = join(WT, 'fixes/aw1-10e/overlay');
const PRE = `(() => {
  const W = window.__nc = { lt: [], mut: [], listen: [] };
  for (const [fn, tag] of [['addEventListener', '+'], ['removeEventListener', '-']]) { const o = EventTarget.prototype[fn]; EventTarget.prototype[fn] = function (t, ...r) { if (/^(wheel|mousewheel|touch|gesture|pointer)/.test(t)) W.listen.push(tag + t + (this === window ? '' : this === document ? '[doc]' : '[' + (this.tagName || '?') + ']') + '@' + Math.round(scrollY)); return o.call(this, t, ...r); }; }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) W.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  new MutationObserver((rs) => { for (const r of rs) if (r.target.closest && r.target.closest('.start-selling-morph-panel')) W.mut.push([Math.round(scrollY), r.attributeName, r.target.tagName + '.' + (r.target.className.baseVal ?? r.target.className).split(' ')[0], r.oldValue, r.target.getAttribute(r.attributeName)]); })
    .observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['src', 'inert', 'tabindex'] });
})();`;
const A11Y = `(() => { const p = document.querySelector('.start-selling-morph-panel'); if (!p) return { panel: false };
  const f = [...p.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')];
  const tabbable = f.filter((e) => e.tabIndex >= 0 && !e.closest('[inert]')).map((e) => e.tagName + '.' + (e.className.baseVal ?? e.className).split(' ')[0]);
  const h = document.querySelector('header.start-selling-top-nav').getBoundingClientRect(); const hits = new Set();
  for (let x = h.left + 2; x < h.right; x += 12) for (let y = h.top + 2; y < h.bottom; y += 6) { const el = document.elementFromPoint(x, y); if (el && p.contains(el)) hits.add(el.tagName + '.' + (el.className.baseVal ?? el.className).split(' ')[0]); }
  return { panel: true, inert: p.inert, ariaHidden: p.getAttribute('aria-hidden'), focusables: f.length, tabbable, panelHits: [...hits], navRect: [Math.round(h.top), Math.round(h.height)] }; })()`;
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = {}, shots = {};
try {
  const BUILDS = (process.env.BUILDS || 'base,src,noinert').split(',');
  for (const [label, ov] of BUILDS.map((b) => [b, b === 'base' ? BASEOV : `${join(WT, 'fixes', b === 'src' || b === 'noinert' ? 'mw10e-' + b : b, 'overlay')},${BASEOV}`])) {
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
    await sleep(12000);
    if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page ' + label);
    const idle = await page.eval(`(() => { const W = window.__nc; return { lt: W.lt.slice(), listen: W.listen.slice(), mut: W.mut.length, sourced: [...document.querySelectorAll('.start-selling-morph-panel img')].filter((i) => i.getAttribute('src')).length }; })()`);
    const a11yTop = await page.eval(A11Y);
    await page.eval('window.__nc.mut.length = 0; window.__nc.lt.length = 0; window.__nc.listen.length = 0; true');
    await page.eval(`new Promise((res) => { let y = 0; let paused = !${JSON.stringify(!!process.env.PAUSE)}; const step = () => { y += 24; window.scrollTo({ top: y, behavior: 'instant' }); if (!paused && y >= 1200) { paused = true; return setTimeout(() => requestAnimationFrame(step), 1500); } y < 2600 ? requestAnimationFrame(step) : setTimeout(res, 800); }; requestAnimationFrame(step); })`, { timeout: 120000 });
    const scroll = await page.eval(`(() => { const W = window.__nc; const by = {}; for (const m of W.mut) { const k = m[1] + '@' + m[0]; by[k] = (by[k] || 0) + 1; } return { mutations: by, listen: W.listen.splice(0), lt: W.lt.slice() }; })()`);
    const a11yEdge = await page.eval(A11Y);
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.eval(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`); await sleep(1000);
    for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 215, y: 500, deltaX: 0, deltaY: 120 }); await sleep(40); }
    await sleep(2500);
    const atMorph = await page.eval(`(() => { document.getAnimations().forEach((a) => { a.currentTime = 0; a.pause(); }); return { morph: document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph'), a11y: ${A11Y} }; })()`);
    await sleep(500);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    shots[label] = join(OUT, `${label}-morph.png`); writeFileSync(shots[label], Buffer.from(data, 'base64'));
    res[label] = { idle, a11yTop, scroll, a11yEdge, atMorph, errors: errors.slice(0, 3) };
    console.log(label, JSON.stringify(res[label]));
    await page.close(); proc.kill();
  }
  const page = await cdp.newIsolatedPage();
  const diff = {};
  for (const l of BUILDS.filter((b) => b !== 'base')) {
    const da = 'data:image/png;base64,' + readFileSync(shots.base).toString('base64'), db = 'data:image/png;base64,' + readFileSync(shots[l]).toString('base64');
    diff[l] = await page.eval(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
      const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]); const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
      let d = 0; for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) d++; return Math.round(10000 * d / (w * h)) / 100; })()`);
  }
  console.log('morph screenshot diff vs base %:', JSON.stringify(diff));
  writeFileSync(join(OUT, `noinert-check-${Date.now()}.json`), JSON.stringify({ res, diff }, null, 1));
} finally { cdp.close(); await ch.close(); }
