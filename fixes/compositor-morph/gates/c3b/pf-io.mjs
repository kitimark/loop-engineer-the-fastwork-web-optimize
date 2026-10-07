// c3b gate (#2; arch-compositor-morph): #platform's is-platform-shrinking from the IntersectionObserver against the old
// rule, read fresh: card bottom < 0.83 x innerHeight (n(): a > 0.04 with r = 0.85 ih, i = 0.35 ih). The page is stepped
// through the range where the card's bottom crosses that line (#platform is sticky under html.fw-ms, so the crossing is
// found by a coarse scan over the whole page (40 px), then walked in 1 px steps around each change), 3 frames + 50 ms after each step, and the
// class is compared with the rule. Chrome 430xH DPR 3 touch, or (--sim) iOS Simulator Safari: one scan with the
// toolbar as loaded, one after a WDA stroke that collapses it (innerHeight recorded). Functional (shared slot).
//   node fixes/compositor-morph/gates/c3b/pf-io.mjs --arms A=out/cm/snap160/V,B=out/cm/c3b [--h 775] [--sim]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SIM = argv.includes('--sim');
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const H = Number(arg('--h', '775'));
const OUT = join(WT, 'out/cm/pfio-' + (SIM ? 'sim-' : '') + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// one step, polled (WIP evaluate does not await): scroll, 3 rAF + 50 ms, then the class and the rule, read fresh
const STEP = (y) => `(window.__ps = 0, scrollTo({ top: ${y}, behavior: 'instant' }), requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
  const sec = document.querySelector('.start-selling-platform'), c = document.querySelector('.start-selling-platform-card'); const b = c.getBoundingClientRect().bottom;
  window.__ps = JSON.stringify([Math.round(scrollY), sec.classList.contains('is-platform-shrinking') ? 1 : 0, b < 0.83 * innerHeight ? 1 : 0, +b.toFixed(2), innerHeight]); }, 50)))), 1)`;
async function scan(ev) {
  const step = async (y) => { await ev(STEP(y)); for (let i = 0; i < 60; i++) { await sleep(SIM ? 60 : 20); const v = await ev('window.__ps'); if (v) return JSON.parse(v); } return null; };
  const max = await ev('document.documentElement.scrollHeight - innerHeight');
  const rows = [];
  for (let y = 0; y <= max; y += 40) { const r = await step(y); r && rows.push(r); }
  const fine = [];
  for (let i = 1; i < rows.length; i++) if (rows[i][2] !== rows[i - 1][2] || rows[i][1] !== rows[i - 1][1]) fine.push([rows[i - 1][0], rows[i][0]]);
  for (const [a, b] of fine) for (let y = a - 12; y <= b + 12; y++) { const r = await step(y); r && rows.push(r); }
  return rows;
}
const res = { h: H, sim: SIM, arms: {} };
let chrome = null, cdp = null, C = null, wip = null, S = null, simlib = null, wda = null;
if (SIM) { wip = await import(join(WT, 'tools/lib/wip.mjs')); wda = await import(join(WT, 'tools/lib/wda.mjs')); simlib = await import(join(WT, 'tools/lib/sim.mjs')); S = await wda.createSession({ base: `http://127.0.0.1:${simlib.ports().wda}`, simulator: true }); }
else { C = await import(join(WT, 'tools/lib/cdp.mjs')); chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmpfio'), headless: true, windowSize: `430,${H}` }); cdp = await C.CDP.connect(chrome.wsUrl); }
const stroke = (y0, y1, ms) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 30 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, { type: 'pointerUp', button: 0 }] }] });
try {
  for (const A of ARMS) {
    const st = join(OUT, `serve-${A.k}.json`); rmSync(st, { force: true });
    const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let page = null, tab = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      let ev;
      if (SIM) {
        execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
        await sleep(1500); tab = await wip.openTab(`localhost:${s.port}`);
        for (let i = 0; i < 40 && (await tab.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
        await sleep(2500); ev = (x) => tab.evaluate(x);
      } else {
        page = await cdp.newIsolatedPage();
        await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
        await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
        ev = (x) => page.eval(x);
      }
      await ev(`(window.__wd = 0, (() => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => (window.__wd = 1), 2500); }; step(); })(), 1)`);
      for (let i = 0; i < 120 && !(await ev('window.__wd')); i++) await sleep(500);
      const scans = [];
      scans.push({ label: 'as loaded', rows: await scan(ev) });
      if (SIM) { await S.actions(stroke(600, 350, 300)); await sleep(1200); scans.push({ label: 'after a stroke (toolbar collapsed?)', rows: await scan(ev) }); }
      res.arms[A.k] = scans;
      for (const sc of scans) {
        const ih = [...new Set(sc.rows.map((r) => r[4]))].join('/'), mis = sc.rows.filter((r) => r[1] !== r[2]);
        console.log(`== ${A.k} ${sc.label}: innerHeight ${ih}, ${sc.rows.length} steps, ${sc.rows.filter((r) => r[1]).length} shrinking, mismatches ${mis.length}`);
        for (const r of mis.slice(0, 12)) console.log(`  y ${r[0]} class ${r[1]} rule ${r[2]} bottom ${r[3]} line ${(0.83 * r[4]).toFixed(2)}`);
      }
    } finally { try { page && (await page.close()); } catch {} try { tab && tab.close(); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
} finally {
  writeFileSync(join(OUT, 'pf-io.json'), JSON.stringify(res));
  try { S && (await S.close()); } catch {}
  try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {}
  console.log('wrote', join(OUT, 'pf-io.json'));
}
