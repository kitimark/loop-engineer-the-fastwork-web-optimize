// P1b look check helper (fix-end-morph-p1): exact boxes of the nav's parts at one scroll position (default half an end
// track above the end, where P1b (b) is armed at m = 0), per arm. Headless, VALUES ONLY, no timing (shared probe hold).
//   node fixes/end-morph-p1/p1b/rects.mjs --arm C=out/p153/snap/C --arm AB=fixes/end-morph-p1b-ab/overlay [--e -0.5] [--h 775]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const [n, d] = s.split('='); return { name: n, dir: resolve(WT, d) }; });
const H = Number(arg('--h', '775')), E = Number(arg('--e', '-0.5'));
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
async function serve(overlay) {
  const st = join(OUT, `serve-rc-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const READ = `(() => { const h = document.querySelector('header.start-selling-top-nav'); const out = { rv: h.hasAttribute('data-fw-rv'), cls: h.className.replace(/svelte-\\w+/g, '').trim() };
  const sel = { nav: 'header.start-selling-top-nav', bar: '.start-selling-top-nav-bar', logo: '.start-selling-top-nav-logo', actions: '.start-selling-top-nav-actions', btns: '.start-selling-top-nav-actions > *', earn: '.start-selling-top-nav-btn.is-earn', earnBox: '.start-selling-top-nav-earn-box' };
  for (const [k, s] of Object.entries(sel)) { const els = [...h.parentNode.querySelectorAll(s)].filter((e) => e === h || h.contains(e)); out[k] = els.map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { r: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 1000) / 1000), translate: cs.translate, transform: cs.transform, left: cs.left, right: cs.right, wc: cs.willChange }; }); }
  return out; })()`;
const res = { tool: 'fixes/end-morph-p1/p1b/rects.mjs', h: H, e: E, arms: {} };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'rc'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const arm of ARMS) {
    const srv = await serve(arm.dir);
    try {
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const lim = () => { const e = document.querySelector('.fw-ms-end'); return document.documentElement.scrollHeight - innerHeight - 2 * (e ? e.offsetHeight : 0); }; const step = () => { y = Math.min(y + 400, lim()); scrollTo({ top: y, behavior: 'instant' }); y < lim() ? setTimeout(step, 40) : setTimeout(res, 2000); }; step(); })`, { timeout: 90000 });
      await page.eval(TOUCH);
      const g = await page.eval(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; return { t, endStart: document.documentElement.scrollHeight - innerHeight - t }; })()`);
      await page.eval(`(scrollTo({ top: ${Math.round(g.endStart + E * g.t)}, behavior: 'instant' }), 1)`); await sleep(1500);
      res.arms[arm.name] = await page.eval(READ);
      console.log(arm.name, JSON.stringify(res.arms[arm.name]));
      await page.close();
    } finally { srv.proc.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
const f = join(OUT, `rects-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
