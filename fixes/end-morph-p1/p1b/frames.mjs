// P1b gate (b) frames (fix-end-morph-p1, lead GO 2026-10-06): frame spans over the approach band (m -1 -> 0, i.e. the
// end track's own height above its start) and the open's first frames, per arm, in HEADED Chrome (timing: run it in a
// normal chrome-measure hold, never --shared). 430 x H, DPR 3, mobile, touch held (Input.dispatchTouchEvent), CPU --cpu
// (default 6). Per arm one fresh Chrome and page load; the walk stops above the band; then --cycles times:
//   park     endStart - t - ih/2 (above the band: P1b (b) disarmed), 600 ms
//   approach park -> endStart in --approach frames (default 45; rAF-stepped instant scrolls): the first third is above the band (e -1.5 -> -1), so P1b (b)'s arming frame falls inside the run, not on its first scroll; 'band' counts the frames from e >= -1 on, 'approach' all of them
//   open     endStart -> max in --steps frames;  rest1 12 frames;  close max -> endStart in --steps frames;  rest0 12 frames
// Cycle 1 is the first open after load (cold), later cycles are repeat opens. Per rAF frame: the rAF timestamp (frame
// time), scrollY, the nav's is-on-dark / is-scroll-hidden / is-morphing classes, [data-fw-rv], --morph. Frame dt =
// difference of consecutive rAF timestamps; k = round(dt / 8.333); ">34" = k >= 5, ">50" = k >= 7 (CLAUDE.md, Chrome);
// legacy dt > 34 / > 50 ms too. No tracing, no CPU profile (they would load the main thread). --headless: states only
// (is-on-dark, [data-fw-rv], m per frame; headless renders at 60 Hz, its dt is no timing): run it in a --shared hold.
//   node tools/lock.mjs run chrome-measure --owner fix-end-morph-p1 --max-seconds 300 -- node fixes/end-morph-p1/p1b/frames.mjs \
//     --arm C=out/p153/snap/C --arm V=out/p153/snap/V --arm A=fixes/end-morph-p1b-a/overlay --arm AB=fixes/end-morph-p1b-ab/overlay
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const [n, d] = s.split('='); return { name: n, dir: resolve(WT, d) }; });
if (!ARMS.length) throw new Error('--arm NAME=overlayDir (repeatable)');
const H = Number(arg('--h', '775')), N = Number(arg('--steps', '40')), CPU = Number(arg('--cpu', '6')), NA = Number(arg('--approach', '45')), CY = Number(arg('--cycles', '3'));
const BASE = join(mirrorHome(), 'site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
async function serve(overlay) {
  const st = join(OUT, `serve-fr-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const touch = (page, type) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 215, y: 400, id: 1 }] });
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { y: scrollY, ih: innerHeight, t, max, endStart: max - t }; })()`;
// one phase: ys scroll targets (one per frame), then R frames at rest; per frame a sample taken at the top of the rAF callback
const RUN = (phase, ys, rest) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; const R = ${rest}; let k = 0; const h = document.querySelector('header.start-selling-top-nav'); const out = [];
  const f = (ts) => { const c = h.classList; out.push([Math.round(ts * 1000) / 1000, Math.round(scrollY), c.contains('is-on-dark') ? 1 : 0, c.contains('is-scroll-hidden') ? 1 : 0, c.contains('is-morphing') ? 1 : 0, h.hasAttribute('data-fw-rv') ? 1 : 0, h.style.getPropertyValue('--morph')]);
    if (k < ys.length) { window.scrollTo({ top: ys[k], behavior: 'instant' }); k++; requestAnimationFrame(f); } else if (k < ys.length + R) { k++; requestAnimationFrame(f); } else res(out); };
  requestAnimationFrame(f); })`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * (i + 1) / n));
const COLS = ['ts', 'y', 'onDark', 'scrollHidden', 'morphing', 'rv', 'm'];

const res = { tool: 'fixes/end-morph-p1/p1b/frames.mjs', headless: argv.includes('--headless'), h: H, steps: N, approach: NA, cycles: CY, cpu: CPU, cols: COLS, startedAt: new Date().toISOString(), load1: loadavg()[0], arms: {} };
for (const arm of ARMS) {
  const srv = await serve(arm.dir);
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'fr-' + arm.name), headless: argv.includes('--headless'), windowSize: `430,${H + 100}` });
  const cdp = await CDP.connect(chrome.wsUrl);
  const r = (res.arms[arm.name] = { overlay: arm.dir, cycles: [] });
  try {
    const page = await cdp.newIsolatedPage();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
    r.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
    r.ua = await page.eval('navigator.userAgent');
    // walk to the park position above the band (lazy content), never into the band
    await page.eval(`new Promise((res) => { let y = 0; const lim = () => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; return document.documentElement.scrollHeight - innerHeight - t - t - innerHeight / 2; };
      const step = () => { y = Math.min(y + 300, lim()); window.scrollTo({ top: y, behavior: 'instant' }); y < lim() ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
    let g = await page.eval(GEO); r.geo = g;
    r.revealElsBefore = await page.eval(`document.querySelectorAll('.fw-rv-dark, .fw-rv-glass').length`);
    r.sizeProbe = await page.eval(`!!document.querySelector('.fw-rv-size')`);
    if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await touch(page, 'touchStart');
    for (let c = 0; c < CY; c++) {
      g = await page.eval(GEO);
      await page.eval(`(window.scrollTo({ top: ${Math.round(g.endStart - g.t - g.ih / 2)}, behavior: 'instant' }), 1)`); await sleep(600);
      g = await page.eval(GEO);
      const cy = { geo: g };
      cy.approach = await page.eval(RUN('approach', lin(Math.round(g.endStart - g.t - g.ih / 2), g.endStart, NA), 0), { timeout: 60000 });
      cy.open = await page.eval(RUN('open', lin(g.endStart, g.max, N), 12), { timeout: 60000 });
      cy.close = await page.eval(RUN('close', lin(g.max, g.endStart, N), 12), { timeout: 60000 });
      r.cycles.push(cy);
      await sleep(300);
    }
    await touch(page, 'touchEnd');
    if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    r.errors = await page.eval(`(window.__frErr || []).length`).catch(() => null);
    await page.close();
  } finally { cdp.close(); await chrome.close(); srv.proc.kill(); }
  // summary: dt of each sample = its ts minus the previous sample's ts (the first approach frame uses no dt)
  const sum = (r.summary = []);
  r.cycles.forEach((cy, i) => {
    const seq = [...cy.approach.map((s) => ['a', s]), ...cy.open.map((s) => ['o', s]), ...cy.close.map((s) => ['c', s])];
    const dts = seq.map(([p, s], j) => [p, j ? s[0] - seq[j - 1][1][0] : null, s]);
    const appr = dts.filter(([p, d]) => p === 'a' && d != null), band = appr.filter(([, , s]) => s[1] >= cy.geo.endStart - cy.geo.t - 1);
    // the switch-on frame: the first sample (in approach or open) whose rv is 1 after a 0 (for C: none, use open[0])
    let sw = dts.findIndex(([, , s], j) => j > 0 && s[5] === 1 && dts[j - 1][2][5] === 0);
    const swF = sw >= 0 ? dts[sw] : dts.find(([p]) => p === 'o');
    // the switch-on sample's own dt is the frame that switched it on (a scroll in rAF k fires its scroll event, __msTick and __rvW in frame k+1, seen at sample k+2); C has no switch-on: its o2 (the same frame of the open) is used
    const swNext = sw >= 0 ? dts[sw] : dts[dts.findIndex(([p]) => p === 'o') + 2];
    const k = (d) => Math.round(d / 8.333);
    const cnt = (xs) => ({ n: xs.length, k5: xs.filter(([, d]) => k(d) >= 5).length, k7: xs.filter(([, d]) => k(d) >= 7).length, ms34: xs.filter(([, d]) => d > 34).length, ms50: xs.filter(([, d]) => d > 50).length,
      max: Math.round(Math.max(...xs.map(([, d]) => d)) * 10) / 10, med: Math.round(xs.map(([, d]) => d).sort((a, b) => a - b)[xs.length >> 1] * 10) / 10 });
    const open6 = dts.filter(([p]) => p === 'o').slice(0, 7).slice(1);
    sum.push({ cycle: i + 1, band: cnt(band), approach: cnt(appr), open6: cnt(open6), switchOnAt: sw >= 0 ? `${swF[0]}${dts.slice(0, sw).filter(([p]) => p === swF[0]).length}` : 'none (open[0])', switchOnDt: swNext ? Math.round(swNext[1] * 10) / 10 : null,
      openFirst: dts.filter(([p]) => p === 'o').slice(0, 4).map(([, d]) => Math.round(d * 10) / 10),
      onDark: dts.map(([, , s]) => s[2]).join(''), rv: dts.map(([, , s]) => s[5]).join(''), scrollHidden: dts.some(([, , s]) => s[3]) });
  });
  for (const s of sum) console.log(arm.name, 'cycle', s.cycle, 'band', JSON.stringify(s.band), 'approach', JSON.stringify(s.approach), 'open2-7', JSON.stringify(s.open6), 'switch-on', s.switchOnAt, 'switch-on dt', s.switchOnDt, 'open first dts', JSON.stringify(s.openFirst), 'scrollHidden', s.scrollHidden);
}
// is-on-dark per frame vs the first arm (same scripted y per frame index)
const ref = Object.values(res.arms)[0];
for (const [n, a] of Object.entries(res.arms)) a.onDarkVsRef = a.summary.map((s, i) => { const r0 = ref.summary[i]?.onDark || ''; let d = 0; for (let j = 0; j < Math.max(r0.length, s.onDark.length); j++) if (r0[j] !== s.onDark[j]) d++; return d; });
for (const [n, a] of Object.entries(res.arms)) console.log(n, 'is-on-dark frames differing from', Object.keys(res.arms)[0], JSON.stringify(a.onDarkVsRef));
res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
const f = join(OUT, `frames-${H}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
