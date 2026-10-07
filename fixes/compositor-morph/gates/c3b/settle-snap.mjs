// c3b gate (#6; arch-compositor-morph): the end screen's rest/settle behaviour is unchanged, and far from the end the
// per-frame rest timer is gone. Chrome 430xH DPR 3 touch (7c mode), no throttling, functional (shared, weight probe).
// (1) Releases: for each start m, a synthetic touchstart, scrollTo(m), touchend, then 1.6 s: where the page comes to
//     rest (m), both arms. (2) Far: a counter wraps setTimeout before load (delay 200 ms calls counted); the page is
//     stepped 60 frames through the middle of the page (far from the end), then 60 frames inside one viewport of the end
//     screen: 200 ms timers armed in each phase.
//   node fixes/compositor-morph/gates/c3b/settle-snap.mjs --arms A=out/cm/snap160/V,B=out/cm/c3b [--h 775]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const H = Number(arg('--h', '775'));
const OUT = join(WT, 'out/cm/settlesnap-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COUNT = `(() => { const st = window.setTimeout; window.__t200 = 0; window.setTimeout = function (f, d, ...a) { if (d === 200) window.__t200++; return st.call(this, f, d, ...a); }; })()`;
const TEV = (type, n) => `(() => { const ev = new Event('${type}'); const t = ${n} ? [{ clientX: 215, clientY: 400, identifier: 1 }] : []; const c = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: c }); Object.defineProperty(ev, 'timeStamp', { value: performance.now() }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
const STEPS = (ys) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; let i = 0; const f = () => { if (i >= ys.length) return res(1); scrollTo({ top: ys[i++], behavior: 'instant' }); requestAnimationFrame(f); }; requestAnimationFrame(f); })`;
const STARTS = [-0.05, 0.05, 0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85, 0.95];
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmsnap'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const res = { h: H, starts: STARTS, arms: {} };
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
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: COUNT });
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      const g = JSON.parse(await page.eval(GEO));
      // (2) far, then near
      const far0 = Math.round(g.endStart * 0.4), near0 = Math.round(g.endStart - 0.9 * g.ih);
      await page.eval(`(scrollTo({ top: ${far0}, behavior: 'instant' }), 1)`); await sleep(800);
      await page.eval('(window.__t200 = 0, 1)');
      await page.eval(STEPS(Array.from({ length: 60 }, (_, i) => far0 + i * 6))); await sleep(500);
      const farN = await page.eval('window.__t200');
      await page.eval(`(scrollTo({ top: ${near0}, behavior: 'instant' }), 1)`); await sleep(800);
      await page.eval('(window.__t200 = 0, 1)');
      await page.eval(STEPS(Array.from({ length: 60 }, (_, i) => near0 + i * 3))); await sleep(500);
      const nearN = await page.eval('window.__t200');
      // (1) releases
      const rel = [];
      for (const m of STARTS) {
        await page.eval(`(scrollTo({ top: ${Math.round(g.endStart - 0.6 * g.t)}, behavior: 'instant' }), 1)`); await sleep(700);
        await page.eval(TEV('touchstart', 1));
        await page.eval(STEPS([Math.round(g.endStart + (m - 0.02) * g.t), Math.round(g.endStart + m * g.t)]));
        await page.eval(TEV('touchend', 0));
        await page.eval(STEPS([Math.round(g.endStart + m * g.t)]));
        await sleep(1600);
        const y = await page.eval('scrollY');
        rel.push({ m, rest: +((y - g.endStart) / g.t).toFixed(3) });
      }
      res.arms[A.k] = { g, farN, nearN, rel };
      console.log(`== ${A.k}: 200 ms timers far ${farN} / near ${nearN}; rest after release: ${rel.map((r) => `${r.m}->${r.rest}`).join(' ')}`);
    } finally { try { page && (await page.close()); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
  const ks = Object.keys(res.arms);
  if (ks.length >= 2) {
    const [a, b] = ks.map((k) => res.arms[k].rel);
    const d = a.map((r, i) => ({ m: r.m, a: r.rest, b: b[i]?.rest })).filter((x) => Math.abs(x.a - x.b) > 0.01);
    console.log(`REST DIFF ${ks[0]} vs ${ks[1]}: ${d.length} of ${a.length} releases differ by > 0.01 ${JSON.stringify(d)}`);
  }
} finally {
  writeFileSync(join(OUT, 'settle-snap.json'), JSON.stringify(res, null, 1));
  try { cdp.close(); await chrome.close(); } catch {}
  console.log('wrote', join(OUT, 'settle-snap.json'));
}
