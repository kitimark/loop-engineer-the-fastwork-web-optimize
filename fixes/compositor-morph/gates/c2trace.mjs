// c2 parity check (arch-compositor-morph): the nav's state classes per frame while m steps across 0 / 0.08 / 0.2 in
// small one-frame steps (open from closed, back to closed, wiggles), touch held. In-page rAF driver: at each frame's
// rAF the nav's classes are recorded (the state the previous frame rendered), then the next scroll position is set.
// Arms are compared frame by frame: a c2 frame whose is-on-dark differs from v11's is listed. Chrome 430xH DPR 3,
// no throttling; functional (shared slot, weight probe). Also counts the forced re-test answers that changed g.
//   node out/cm/c2trace.mjs --arms A=<dir>,B=<dir> [--h 815] [--reps 2]
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
const H = Number(arg('--h', '815')), REPS = Number(arg('--reps', '2'));
const OUT = join(WT, 'out/cm/c2trace-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
// m sequence, one value per frame; holds repeat a value
const seg = (a, b, n) => Array.from({ length: n }, (_, i) => +(a + ((b - a) * (i + 1)) / n).toFixed(4));
const hold = (m, n) => Array(n).fill(m);
const one = [
  ...hold(-0.3, 4), ...seg(-0.3, 0, 6), ...hold(0, 4),
  ...seg(0, 0.05, 3), ...hold(0.05, 4), ...seg(0.05, 0, 2), ...hold(0, 4),
  ...seg(0, 0.12, 4), ...hold(0.12, 4), ...seg(0.12, 0.25, 4), ...hold(0.25, 4), ...seg(0.25, 0.15, 3), ...hold(0.15, 4),
  ...seg(0.15, 0, 4), ...hold(0, 6), 0.01, 0, 0.02, 0, 0.03, ...hold(0, 4),
  ...seg(0, 0.6, 8), ...hold(0.6, 4), ...seg(0.6, 0.18, 6), ...hold(0.18, 4), 0.22, 0.18, 0.22, 0.18, ...hold(0.18, 3),
  ...seg(0.18, 0, 4), ...hold(0, 6), ...seg(0, -0.3, 6), ...hold(-0.3, 4),
];
const SEQ = Array.from({ length: REPS }, () => one).flat();
const DRIVE = (endStart, t, seq) => `new Promise((res) => { const seq = ${JSON.stringify(seq)}; const out = []; let i = 0;
  const nav = document.querySelector('header.start-selling-top-nav');
  const f = () => { const c = nav.classList; out.push([i, Math.round(scrollY), c.contains('is-on-dark') ? 1 : 0, c.contains('is-morphing') ? 1 : 0, c.contains('is-earn-hidden') ? 1 : 0, c.contains('is-expanded') ? 1 : 0, c.contains('is-hero-pill') ? 1 : 0]);
    if (i >= seq.length) return res(JSON.stringify(out));
    window.scrollTo({ top: Math.round(${endStart} + seq[i] * ${t}), behavior: 'instant' }); i++; requestAnimationFrame(f); };
  requestAnimationFrame(f); })`;
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmc2trace'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const res = { h: H, seq: SEQ, arms: {} };
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
      await page.eval(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
      g = JSON.parse(await page.eval(GEO));
      await page.eval(TOUCH);
      await page.eval(`(scrollTo({ top: ${Math.round(g.endStart - 0.3 * g.t)}, behavior: 'instant' }), 1)`); await sleep(1200);
      const rows = JSON.parse(await page.eval(DRIVE(g.endStart, g.t, SEQ)));
      res.arms[A.k] = { geo: g, rows };
      const dark = rows.map((r) => r[2]).join('');
      console.log(`== ${A.k} frames ${rows.length} dark-frames ${rows.filter((r) => r[2]).length} morph-frames ${rows.filter((r) => r[3]).length}`);
      console.log(`  is-on-dark ${dark}`);
    } finally { try { page && (await page.close()); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
  const ks = Object.keys(res.arms);
  if (ks.length >= 2) {
    const [a, b] = ks.map((k) => res.arms[k].rows);
    const n = Math.min(a.length, b.length), diff = [];
    for (let i = 0; i < n; i++) for (const [j, name] of [[2, 'is-on-dark'], [3, 'is-morphing'], [4, 'is-earn-hidden'], [5, 'is-expanded'], [6, 'is-hero-pill']]) if (a[i][j] !== b[i][j]) diff.push({ frame: i, m: i > 0 ? SEQ[i - 1] : null, cls: name, [ks[0]]: a[i][j], [ks[1]]: b[i][j] });
    res.diff = diff;
    console.log(`DIFF ${ks[0]} vs ${ks[1]}: ${diff.length} frame-class differences over ${n} frames`);
    for (const d of diff.slice(0, 40)) console.log('  ' + JSON.stringify(d));
  }
} finally {
  writeFileSync(join(OUT, 'c2trace.json'), JSON.stringify(res, null, 1));
  try { cdp.close(); await chrome.close(); } catch {}
  console.log('wrote', join(OUT, 'c2trace.json'));
}
