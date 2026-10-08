#!/usr/bin/env node
// colpause (lead 16:2xZ, the f+B proposal): do the morph panel's columns keep their phase when the menu closes and
// re-opens? A functional probe, no timing. Per load: open the page, 6 s idle, start an rAF logger (per frame: the morph
// scene's data-start-selling-scene value and the translateY of the first 4 col tracks from their computed transform),
// then g0.0f's own morph driver (window.__fwMorphDrive: to the page end, open, hold, close, hold, x cycles), poll
// window.__fwMD until it ends. Per load it reports, over every scene change between two logged frames:
//   resume jump = |ty after - ty before| at paused -> active, pause jump the same at active -> paused (px, max over tracks),
//   paused drift = max |ty - ty at the pause| inside each paused stretch, and the median per-frame motion while active.
// The original (g0.0f) pauses the animation and resumes it where it was (jumps ~ one frame of motion); KO B (f-B) drops
// the animation while paused (ty 0) and restarts it from 0; f-B2 must behave like g0.0f.
// Arms are served by fixes/g0-box/phone/p168-serve.sh (out/p168/serve-<arm>.json).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-box -- \
//     node fixes/g0-box/gates/colphase.mjs chrome <loads> <arm> ...
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/gates/colphase.mjs sim <loads> <arm> ...
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const MODE = process.argv[2]; const LOADS = Number(process.argv[3] || 2); const ARMS = process.argv.slice(4);
if (!['chrome', 'sim'].includes(MODE) || !ARMS.length) { console.error('usage: colphase.mjs chrome|sim <loads> <arm> ...'); process.exit(2); }
const OUT = join(WT, 'out/g0box/colphase'); mkdirSync(OUT, { recursive: true });
const CYCLES = Number(process.env.CP_CYCLES || 3), HOLD = Number(process.env.CP_HOLD || 2500);

const START = `(() => { const L = window.__cp = { f: [], anc: 0 };
  const trs = [...document.querySelectorAll('.start-selling-morph-col-track')].slice(0, 4);
  const sc = trs[0] && trs[0].closest('[data-start-selling-scene]');
  let n = 0; for (let e = trs[0]; e; e = e.parentElement) if (e.hasAttribute && e.hasAttribute('data-start-selling-scene')) n++; L.anc = n; L.tracks = trs.length;
  const ty = (e) => { const t = getComputedStyle(e).transform; if (!t || t === 'none') return 0; return new DOMMatrixReadOnly(t).m42; };
  const loop = () => { if (L.stop) return; L.f.push([Math.round(performance.now()), sc ? sc.getAttribute('data-start-selling-scene') : null, ...trs.map((e) => Math.round(ty(e) * 100) / 100)]); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__fwMD = null; window.__fwMorphDrive({ hold: ${HOLD}, cycles: ${CYCLES} });
  return JSON.stringify({ tracks: trs.length, anc: n, scene: sc && sc.getAttribute('data-start-selling-scene') }); })()`;
const DONE = `(window.__fwMD != null)`;
const READ = `(() => { window.__cp.stop = 1; return JSON.stringify(window.__cp); })()`;

export function analyse(L) {
  const f = L.f; const k = (f[0] || []).length - 2; const out = { frames: f.length, tracks: k, resumes: [], pauses: [], drift: 0, motion: null };
  const steps = []; let pStart = null;
  for (let i = 1; i < f.length; i++) {
    const a = f[i - 1], b = f[i];
    const d = Math.max(...Array.from({ length: k }, (_, j) => Math.abs(b[2 + j] - a[2 + j])));
    if (a[1] === 'active' && b[1] === 'active') steps.push(d);
    if (a[1] !== b[1]) {
      if (b[1] === 'active') out.resumes.push(Math.round(d * 100) / 100);
      if (b[1] === 'paused') { out.pauses.push(Math.round(d * 100) / 100); pStart = i; }
    }
    if (b[1] === 'paused' && pStart != null && i > pStart) out.drift = Math.max(out.drift, ...Array.from({ length: k }, (_, j) => Math.abs(b[2 + j] - f[pStart][2 + j])));
  }
  steps.sort((x, y) => x - y); out.motion = steps.length ? steps[Math.floor(steps.length / 2)] : null;
  out.drift = Math.round(out.drift * 100) / 100;
  return out;
}

async function chromeLoads() {
  const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/g0box/chrome'), 'colphase'), headless: true, windowSize: '430,932' });
  const cdp = await CDP.connect(chrome.wsUrl); const res = [];
  try {
    for (const arm of ARMS) for (let n = 1; n <= LOADS; n++) {
      const port = JSON.parse(readFileSync(join(WT, `out/p168/serve-${arm}.json`), 'utf8')).port;
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await gotoAndSettle(page, `http://localhost:${port}/`, { quietMs: 1500, maxMs: 45000 }); await sleep(6000);
      const st = JSON.parse(await page.eval(START)); const t0 = Date.now();
      while (!(await page.eval(DONE)) && Date.now() - t0 < 60000) await sleep(500);
      const L = JSON.parse(await page.eval(READ)); const a = analyse(L);
      res.push({ arm, n, start: st, ...a }); writeFileSync(join(OUT, `chrome-${arm}-${n}.json`), JSON.stringify(L));
      console.log(`CPLINE chrome ${arm}-${n}: tracks ${st.tracks} scene-ancestors ${st.anc} | resume jumps ${JSON.stringify(a.resumes)} | pause jumps ${JSON.stringify(a.pauses)} | paused drift ${a.drift} | active motion/frame ${a.motion} px`);
      await page.close?.();
    }
  } finally { cdp.close(); await chrome.close(); }
  return res;
}

async function simLoads() {
  const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
  const res = [];
  for (const arm of ARMS) for (let n = 1; n <= LOADS; n++) {
    const port = JSON.parse(readFileSync(join(WT, `out/p168/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/`;
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${port}`);
    try {
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(6000);
      const st = JSON.parse(await c.evaluate(START)); const t0 = Date.now();
      while ((await c.evaluate(DONE)) !== true && Date.now() - t0 < 60000) await sleep(500);
      const L = JSON.parse(await c.evaluate(READ)); const a = analyse(L);
      res.push({ arm, n, start: st, ...a }); writeFileSync(join(OUT, `sim-${arm}-${n}.json`), JSON.stringify(L));
      console.log(`CPLINE sim ${arm}-${n}: tracks ${st.tracks} scene-ancestors ${st.anc} | resume jumps ${JSON.stringify(a.resumes)} | pause jumps ${JSON.stringify(a.pauses)} | paused drift ${a.drift} | active motion/frame ${a.motion} px`);
    } finally { try { c.close(); } catch {} }
  }
  return res;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const res = MODE === 'chrome' ? await chromeLoads() : await simLoads();
  const f = join(OUT, `${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
}
