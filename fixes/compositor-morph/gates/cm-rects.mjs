// compositor-morph (arch-compositor-morph): DOM parity probe, Chrome, no timing. For each overlay dir (C, V, ...), load
// the page at 430xH DPR 3 mobile/touch (hover none, pointer coarse), walk it, hold a synthetic touch, and at each m stop
// read the visual rects (getBoundingClientRect) of the nav's parts and a few computed values. Prints per stop the parts
// whose rect differs between the first dir and the others by more than 0.25 css px.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 120 --owner arch-compositor-morph -- \
//     node fixes/compositor-morph/gates/cm-rects.mjs --dirs out/cm/C,fixes/compositor-morph/overlay [--ms 0.1,0.5,1]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIRS = arg('--dirs', 'out/cm/C,fixes/compositor-morph/overlay').split(',').map((d) => resolve(WT, d));
const MS = arg('--ms', '0.02,0.1,0.5,0.9,1').split(',').map(Number);
const H = Number(arg('--h', '775'));
const OUT = join(WT, 'out/compositor-morph'); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PARTS = { bar: '.start-selling-top-nav-bar', logo: '.start-selling-top-nav-logo', logoSvg: '.start-selling-top-nav-logo svg', act: '.start-selling-top-nav-actions', lang: '.start-selling-top-nav-actions > .start-selling-language-switch-wrap', earn: '.start-selling-top-nav-btn.is-earn', panel: '.start-selling-morph-panel', title: '.start-selling-morph-title', ctr: '.start-selling-morph-center', ftr: '.start-selling-morph-footer', bd: '.start-selling-morph-backdrop', col0: '.start-selling-morph-col', veil: '.start-selling-morph-veil', c0: '[data-fw-cm="c0"]', c1: '[data-fw-cm="c1"]', c2: '[data-fw-cm="c2"]', c3: '[data-fw-cm="c3"]', u3: '[data-fw-cm="u3"]' };
const READ = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const o = {};
  const P = ${JSON.stringify(PARTS)};
  for (const [k, s] of Object.entries(P)) { const e = h.querySelector(s); if (!e) continue; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    o[k] = { r: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(2)), t: cs.transform, tr: cs.translate, op: cs.opacity, f: cs.filter, to: cs.transformOrigin, an: e.getAnimations().map((a) => a.animationName + ':' + a.playState + (a.pending ? '*' : '')).join(',') }; }
  const hr = h.getBoundingClientRect(); o.header = { r: [hr.x, hr.y, hr.width, hr.height].map((v) => +v.toFixed(2)), radius: getComputedStyle(h).borderRadius };
  return o; })())`;
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(OUT, 'chrome'), 'cmrects'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const res = { dirs: DIRS, ms: MS, loads: [] };
try {
  for (const d of DIRS) {
    const st = join(OUT, `serve-rects-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { dir: d, stops: {} };
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1000, maxMs: 30000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 500; scrollTo(0, y); y < document.documentElement.scrollHeight ? setTimeout(step, 50) : setTimeout(() => res(1), 1500); }; step(); })`);
      const g = await page.eval(`(() => { const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, endStart: max - t }; })()`);
      await page.eval(`(scrollTo(0, ${g.endStart - 400}), 1)`); await sleep(800);
      await page.eval(TOUCH);
      for (const m of MS) {
        await page.eval(`(scrollTo(0, ${Math.round(g.endStart + m * g.t)}), 1)`); await sleep(900);
        load.stops[m] = JSON.parse(await page.eval(READ));
      }
      await page.close();
    } catch (e) { load.error = String(e.stack || e); console.log('error', load.error); }
    finally { p.kill(); rmSync(st, { force: true }); res.loads.push(load); }
  }
  const [A, ...rest] = res.loads;
  for (const m of MS) for (const V of rest) {
    const a = A.stops[m] || {}, v = V.stops[m] || {}; const diffs = [];
    for (const k of Object.keys(a)) { if (!v[k]) { diffs.push(`${k}: missing`); continue; } const dr = a[k].r.map((x, i) => +(v[k].r[i] - x).toFixed(2)); if (dr.some((x) => Math.abs(x) > 0.25)) diffs.push(`${k} d[x,y,w,h]=${JSON.stringify(dr)}`); }
    console.log(`m ${m}: ${diffs.length ? diffs.join(' | ') : 'all rects within 0.25 css px'}`);
  }
} finally {
  const f = join(OUT, `rects-${new Date().toISOString().replace(/[:.]/g, '-')}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); console.log('WROTE', f);
}
