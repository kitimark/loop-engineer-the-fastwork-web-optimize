// c3b-K gate 4b (arch-compositor-morph): the nav's scroll-hidden slide near the end, v13 against K (Chrome 430xH, no touch,
// functional). At rest at m -0.6 (K: pre on after the 200 ms rest timer), then a scripted scroll down by 160 px over 8
// frames (hides the nav, if the page hides it there), 40 frames sampled, then back up by 160 px over 8 frames, 40 frames
// sampled. Per frame: ms since the first sample, is-scroll-hidden, is-morphing / fw-cm-pre, the bar's top (the visible
// pill moves with it in both builds), the nav's computed opacity and visibility. Prints both tracks side by side.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 200 --owner arch-compositor-morph -- \
//     node fixes/compositor-morph/gates/c3b/slide.mjs V13=out/cm/snap160/V K=out/cm/c3bk3 [--h 775]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const argv = process.argv.slice(2);
const H = argv.includes('--h') ? Number(argv[argv.indexOf('--h') + 1]) : 775;
const ARMS = argv.filter((a) => a.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), resolve(WT, x.slice(x.indexOf('=') + 1))]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, endStart: max - t }; })())`;
const RUN = (y0) => `new Promise((res) => { const h = document.querySelector('header.start-selling-top-nav'); const bar = h.querySelector('.start-selling-top-nav-bar'); const out = []; let t0 = 0, i = 0;
  const plan = []; for (let k = 1; k <= 8; k++) plan.push(${y0} + 20 * k); for (let k = 0; k < 40; k++) plan.push(null); for (let k = 1; k <= 8; k++) plan.push(${y0} + 160 - 20 * k); for (let k = 0; k < 40; k++) plan.push(null);
  const f = (ts) => { if (!t0) t0 = ts; const cs = getComputedStyle(h); out.push([Math.round(ts - t0), h.classList.contains('is-scroll-hidden') ? 'H' : '-', h.classList.contains('fw-cm-pre') ? 'P' : h.classList.contains('is-morphing') ? 'M' : '-', Math.round(bar.getBoundingClientRect().top * 10) / 10, (+cs.opacity).toFixed(2), cs.visibility[0]]);
    const y = plan[i++]; if (y != null) window.scrollTo({ top: y, behavior: 'instant' }); i <= plan.length ? requestAnimationFrame(f) : res(JSON.stringify(out)); }; requestAnimationFrame(f); })`;
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmslide'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const tracks = {};
try {
  for (const [k, d] of ARMS) {
    const st = join(WT, `out/cm/serve-slide-${k}.json`); rmSync(st, { force: true });
    const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let page = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      const g = JSON.parse(await page.eval(GEO));
      // where does the page hide the nav near the end? scan m -1.3 .. 0 in 8 px steps (at rest 120 ms each)
      const scan = JSON.parse(await page.eval(`new Promise((res) => { const h = document.querySelector('header.start-selling-top-nav'); const out = []; let y = ${Math.round(g.endStart - 1.3 * g.t)}; const step = () => { window.scrollTo({ top: y, behavior: 'instant' }); setTimeout(() => { out.push([y, h.classList.contains('is-scroll-hidden') ? 1 : 0, h.classList.contains('is-profile-sticky-hidden') ? 1 : 0]); y += 8; y <= ${g.endStart} ? step() : res(JSON.stringify(out)); }, 120); }; step(); })`, { timeout: 90000 }));
      const hid = scan.filter((x) => x[1]).map((x) => ((x[0] - g.endStart) / g.t).toFixed(3));
      console.log(`${k} scan m -1.3..0: ${scan.length} stops, is-scroll-hidden at ${hid.length} (m ${hid.length ? hid[0] + ' .. ' + hid[hid.length - 1] : '-'})`);
      const y0 = process.env.SLIDE_M ? Math.round(g.endStart + Number(process.env.SLIDE_M) * g.t) - 80 : Math.round(g.endStart - 0.6 * g.t) - 80;
      await page.eval(`(scrollTo({ top: ${g.endStart - 2 * g.t}, behavior: 'instant' }), 1)`); await sleep(1500);
      await page.eval(`(scrollTo({ top: ${y0}, behavior: 'instant' }), 1)`); await sleep(1500);
      tracks[k] = JSON.parse(await page.eval(RUN(y0), { timeout: 30000 }));
    } finally { try { page && (await page.close()); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
} finally { try { cdp.close(); await chrome.close(); } catch {} }
const ks = Object.keys(tracks);
console.log(`frame | ${ks.map((k) => `${k}: ms hidden state barTop opacity vis`).join(' | ')}`);
const n = Math.max(...ks.map((k) => tracks[k].length));
let diff = 0;
for (let i = 0; i < n; i++) {
  const row = ks.map((k) => (tracks[k][i] || []).join(' '));
  const a = tracks[ks[0]][i], b = tracks[ks[1]]?.[i];
  const d = a && b && (a[1] !== b[1] || Math.abs(a[3] - b[3]) > 1 || Math.abs(a[4] - b[4]) > 0.05 || a[5] !== b[5]);
  if (d) diff++;
  console.log(`${String(i).padStart(3)} | ${row.join(' | ')}${d ? '  <' : ''}`);
}
console.log(`SLIDE ${ks.join(' vs ')}: ${n} frames, ${diff} differ (hidden flag, bar top > 1 px, opacity > 0.05 or visibility; frame times differ by the page's own pace)`);
