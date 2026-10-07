// c3b-d (a) (arch-compositor-morph): do the closed bar's items move near the end before the menu opens? At rest at
// m -1.2 .. 0.1 (0.05 steps; 700 ms rest each, so K's pre is on in (-1, 0]), the viewport rect (top, left, height; 2
// decimals, CSS px) of the bar, the logo, the language switch and the Join button (.is-earn), plus the nav's state.
// Prints per element the y at each stop and its drift from the first stop. Counts / geometry only, no timing, no pixels.
//   Chrome:    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-compositor-morph -- \
//                node fixes/compositor-morph/gates/c3b/navy.mjs --engine chrome --w 430 --h 775 C=out/cm/snap160/C V=out/cm/c3bk6
//   Simulator: node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//                node tools/sim.mjs session --functional --owner arch-compositor-morph -- node fixes/compositor-morph/gates/c3b/navy.mjs --engine sim C=... V=...
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chrome'), W = Number(arg('--w', '430')), H = Number(arg('--h', '775'));
const arms = argv.filter((a) => /^[A-Za-z]\w*=/.test(a)).map((a) => [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))]);
const MS = arg('--ms', '').split(',').filter(Boolean).map(Number);
const STOPS = MS.length ? MS : Array.from({ length: 27 }, (_, i) => +(-1.2 + i * 0.05).toFixed(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(WT, 'out/cm/navy'); mkdirSync(OUT, { recursive: true });
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, iw: innerWidth, endStart: max - t }; })())`;
const EL = { bar: '.start-selling-top-nav-bar', logo: '.start-selling-top-nav-logo', lang: '.start-selling-top-nav-actions > .start-selling-language-switch-wrap', join: '.start-selling-top-nav-btn.is-earn' };
const READ = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const o = { pre: h.classList.contains('fw-cm-pre'), morphing: h.classList.contains('is-morphing'), hidden: h.classList.contains('is-scroll-hidden'), m: h.style.getPropertyValue('--morph') || getComputedStyle(h).getPropertyValue('--morph') };
  for (const [k, s] of Object.entries(${JSON.stringify(EL)})) { const e = h.querySelector(s); if (!e) { o[k] = null; continue; } const r = e.getBoundingClientRect(); o[k] = [+r.top.toFixed(2), +r.left.toFixed(2), +r.height.toFixed(2), +r.width.toFixed(2)]; } return o; })())`;
let chrome = null, cdp = null, sim = null;
if (ENGINE === 'sim') sim = await import(join(WT, 'tools/lib/sim.mjs'));
else {
  const C = await import(join(WT, 'tools/lib/cdp.mjs'));
  chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmnavy'), headless: true, windowSize: `${W},${H}` });
  cdp = await C.CDP.connect(chrome.wsUrl); chrome.C = C;
}
async function open(url, port) {
  if (sim) {
    const { openTab } = await import(join(WT, 'tools/lib/wip.mjs'));
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(1500);
    const c = await openTab(`localhost:${port}`);
    return { ev: (js) => c.evaluate(js), close: () => { try { c.close(); } catch {} } };
  }
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: W, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await chrome.C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
  return { ev: (js) => page.eval(js, { timeout: 90000 }), close: () => page.close() };
}
const res = { tool: 'fixes/compositor-morph/gates/c3b/navy.mjs', engine: ENGINE, w: W, h: ENGINE === 'sim' ? null : H, arms: {} };
try {
  for (const [label, dir] of arms) {
    const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let c = null; const row = { dir, stops: [] };
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      c = await open(`http://localhost:${s.port}/?r=${Date.now()}`, s.port);
      for (let i = 0; i < 40 && (await c.ev('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      await c.ev(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      let g = JSON.parse(await c.ev(GEO)); if (!g.t) throw new Error('no .fw-ms-end');
      await c.ev(`(scrollTo({ top: ${g.endStart - 2 * g.t}, behavior: 'instant' }), 1)`); await sleep(1500);
      g = JSON.parse(await c.ev(GEO)); row.geo = g;
      for (const m of STOPS) {
        const y = Math.round(g.endStart + m * g.t);
        await c.ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(700);
        row.stops.push({ m, y, ...JSON.parse(await c.ev(READ)) });
      }
    } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
    finally { try { c && (await c.close()); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms[label] = row;
    console.log(`${label} (${ENGINE} ${W}x${row.geo?.ih}): ${row.stops.length} stops`);
    const s0 = row.stops[0];
    for (const k of Object.keys(EL)) {
      if (!s0 || !s0[k]) { console.log(`  ${k}: missing`); continue; }
      const d = row.stops.map((x) => (x[k] ? +(x[k][0] - s0[k][0]).toFixed(2) : null));
      const moved = row.stops.filter((x, i) => d[i] && Math.abs(d[i]) >= 0.1).map((x) => x.m);
      console.log(`  ${k.padEnd(4)} y0 ${s0[k][0]} | dy ${row.stops.map((x, i) => `${x.m}:${d[i]}`).join(' ')} | moves from m ${moved.length ? moved[0] : '-'}`);
    }
    console.log(`  state ${row.stops.map((x) => `${x.m}:${x.pre ? 'P' : x.morphing ? 'M' : '-'}${x.hidden ? 'h' : ''}`).join(' ')}`);
  }
} finally { try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {} }
const f = join(OUT, `navy-${ENGINE}-${W}x${H}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);
