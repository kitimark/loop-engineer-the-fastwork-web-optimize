// morph-scroll rev 4 mechanism check (headless Chrome, touch emulation; no timing): the settle waits while a finger is
// down and starts after it lifts. Per case: jump to p0, drag with CDP touch events (slow, no fling), HOLD the finger
// for 1.2 s (p must not move), release, sample p for 2 s (must end at the expected end).
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 \
//   --owner fix-hero-exit-threaded -- node fixes/morph-scroll/settle-chrome.mjs --snap <abs snapshot dir>
// Output: out/morph-scroll/settle-chrome-<stamp>.json
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SNAP = arg('--snap');
if (!SNAP) throw new Error('--snap <abs snapshot dir>');
const VW = 430, VH = 932, DPR = 3;
const OUT = join(WT, 'out/morph-scroll'); mkdirSync(OUT, { recursive: true });
const tag = new Date().toISOString().replace(/[:.]/g, '-');
// [name, p0, drag as a share of the extra screen (+ = finger up = scroll down), expected end]
const CASES = [
  ['open from closed, drag 0.45, hold, release', 0, 0.45, 1],
  ['open from closed, drag 0.15, hold, release', 0, 0.15, 0],
  ['close from open, drag 0.45, hold, release', 1, -0.45, 0],
  ['close from open, drag 0.15, hold, release', 1, -0.15, 1],
];
async function serve() {
  const st = join(OUT, 'serve-settle-chrome.json'); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', SNAP, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null, snap: getComputedStyle(document.documentElement).scrollSnapType }; })()`;
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-scroll/chrome'), 'settle'), headless: true, windowSize: `${VW},${VH}` });
const cdp = await CDP.connect(chrome.wsUrl);
const srv = await serve();
const res = { tool: 'morph-scroll settle-chrome (fix-hero-exit-threaded)', snap: basename(SNAP), browser: chrome.browser, cases: [] };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
  for (const f of [0.25, 0.5, 0.75, 1]) { await page.eval(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(600); }
  const g = await page.eval(GEO);
  res.geo = g;
  console.log('geo', JSON.stringify(g));
  const touch = (type, y) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 215, y }] });
  const drag = async (dy) => {
    // finger moves up by dy (scrolls down) in 24 px steps every 16 ms, from a start that leaves room
    const y0 = dy > 0 ? 820 : 120; let y = y0;
    await touch('touchStart', y);
    const steps = Math.ceil(Math.abs(dy) / 24);
    for (let i = 0; i < steps; i++) { y = y0 - Math.sign(dy) * Math.min(Math.abs(dy), (i + 1) * 24); await touch('touchMove', y); await sleep(16); }
    for (let i = 0; i < 6; i++) { await touch('touchMove', y); await sleep(16); }   // stop moving before the hold: no fling
    return y;
  };
  // far from the end: an ordinary drag must not be followed by any settle
  await page.eval(`(window.scrollTo(0, ${Math.round(g.max * 0.5)}), 0)`); await sleep(500);
  { await drag(200); await touch('touchEnd'); await sleep(300); const a = await page.eval('scrollY'); await sleep(1500); const b = await page.eval('scrollY');
    res.midPage = { a, b, moved: a !== b }; console.log('mid page drag: moved after release', a !== b); }
  for (const [name, p0, share, want] of CASES) {
    await page.eval(`(window.scrollTo({ top: ${Math.round(g.max - g.t + p0 * g.t)}, behavior: 'instant' }), 0)`); await sleep(1200);
    const before = (await page.eval(GEO)).p;
    await drag(share * g.t);
    const held0 = (await page.eval(GEO)).p; await sleep(1200); const held1 = (await page.eval(GEO)).p;
    await touch('touchEnd');
    const samples = [];
    for (const ms of [100, 250, 500, 1000, 2000]) { await sleep(ms - (samples.at(-1)?.[0] ?? 0)); samples.push([ms, (await page.eval(GEO)).p]); }
    const end = samples.at(-1)[1], ok = Math.abs(end - want) < 0.01 && held0 === held1;
    res.cases.push({ name, before, held: [held0, held1], samples, end, want, ok });
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: p ${before}, held ${held0} -> ${held1} (1.2 s, finger down), after release ${samples.map((x) => x[0] + 'ms ' + x[1]).join(', ')}`);
  }
  await page.close();
} finally { srv.proc.kill(); cdp.close(); await chrome.close(); }
const f = join(OUT, `settle-chrome-${tag}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
