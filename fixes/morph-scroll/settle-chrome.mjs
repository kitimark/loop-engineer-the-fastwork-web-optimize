// morph-scroll rev 4 mechanism check (headless Chrome, touch emulation; no timing): the settle waits while a finger is
// down and starts after it lifts. Per case: jump to p0, drag with CDP touch events (slow, no fling), HOLD the finger
// for 1.2 s (p must not move), release, sample p for 2 s (must end at the expected end).
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 \
//   --owner fix-hero-exit-threaded -- node fixes/morph-scroll/settle-chrome.mjs --snap <abs snapshot dir>
// Output: out/morph-scroll/settle-chrome-<stamp>.json. --flicks: the rev 7 fast-short-flick cases instead (below).
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
// [name, p0, drag as a share of the extra screen (+ = finger up = scroll down), expected end, px per 16 ms step,
//  hold (still steps + 1.2 s finger down before lift) or release while moving]
// --flicks (rev 7, user review of rev 6: fast short swipes are hard to open/close): a short touch (0-3 moves of 24 px,
// 16 ms apart), lift, then an emulated iOS glide (Chrome emulation has no momentum after a raw touchEnd): an in-page
// rAF loop scrolls by v x dt with v x 0.998^dt per frame (UIScrollView normal deceleration), and stops as soon as
// scrollY is not where it put it (the page's own settle scroll took over) or at the page end.
// [name, p0, moves, v0 px/ms (+ = page scrolls down = opening), expected end (1 open, 0 closed or left the extra screen)]
const FLICKS = [
  ['open from closed, page not moved before lift, glide 1.0', 0, 0, 1.0, 1],
  ['open from closed, 1 move, glide 0.8', 0, 1, 0.8, 1],
  ['open from closed, 1 move, glide 2.5', 0, 1, 2.5, 1],
  ['open from closed, 3 moves, glide 1.5', 0, 3, 1.5, 1],
  ['close from open, page not moved before lift, glide -1.0', 1, 0, -1.0, 0],
  ['close from open, 1 move, glide -0.8', 1, 1, -0.8, 0],
  ['close from open, 1 move, glide -2.5', 1, 1, -2.5, 0],
  ['close from open, 3 moves, glide -1.5', 1, 3, -1.5, 0],
  // rev 7b, from the user's own swipes (C-049): at the end with Safari's toolbar shown the page rests at p 0.95 (0.05 at
  // closed), and the page scrolls only after the touchend (async scrolling); and a commit that something knocks back
  // (on the phone: the toolbar-time scroll, cause UNRESOLVED) must be re-aimed, not re-decided by position.
  // extra fields: finger px per move (8 ms apart when < 24), and kick: an instant scroll to that p 150 ms after the lift
  ['close from 0.95, small finger flick, page moves only after lift, glide -1.5', 0.95, 2, -1.5, 0, 8],
  ['open from 0.05, small finger flick, page moves only after lift, glide 1.5', 0.05, 2, 1.5, 1, 8],
  ['close from open, 2 moves, glide -1.5, knocked back to 0.95 at +150 ms', 1, 2, -1.5, 0, 24, 0.95],
  ['open from closed, 2 moves, glide 1.5, knocked back to 0.05 at +150 ms', 0, 2, 1.5, 1, 24, 0.05],
];
const GLIDE = (v0) => `(() => { let v = ${v0}, y = scrollY, last = performance.now(); window.__glide = { frames: 0, why: null };
  // the page's smooth scrollTo replaces the glide (as on iOS); an instant scrollTo from this loop would cancel it in Chrome
  const own = window.__ownScrollTo || (window.__ownScrollTo = window.scrollTo.bind(window));
  window.scrollTo = (...a) => { if (a[0] && a[0].behavior === 'smooth') window.__glide.stop = 1; return own(...a); };
  const max = document.documentElement.scrollHeight - innerHeight;
  const step = (now) => { if (window.__glide.stop || Math.abs(scrollY - Math.round(y)) > 2) return void (window.__glide.why = 'taken over');
    const dt = now - last; last = now; y += v * dt; v *= Math.pow(0.998, dt);
    if (y >= max || y <= 0) { own({ top: Math.min(max, Math.max(0, y)), behavior: 'instant' }); return void (window.__glide.why = 'page end'); }
    if (Math.abs(v) < 0.02) return void (window.__glide.why = 'stopped');
    own({ top: Math.round(y), behavior: 'instant' }); window.__glide.frames++; requestAnimationFrame(step); };
  requestAnimationFrame(step); return 0; })()`;
const CASES = [
  ['open from closed, drag 0.45, hold, release', 0, 0.45, 1, 24, true],
  ['open from closed, drag 0.15, hold, release', 0, 0.15, 0, 24, true],
  ['close from open, drag 0.45, hold, release', 1, -0.45, 0, 24, true],
  ['close from open, drag 0.15, hold, release', 1, -0.15, 1, 24, true],
  ['open from closed, slow swipe 0.35, lift while moving', 0, 0.35, 1, 8, false],
  ['close from open, slow swipe 0.35, lift while moving', 1, -0.35, 0, 8, false],
  ['open from closed, medium swipe 0.3, lift while moving', 0, 0.3, 1, 24, false],
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
  const drag = async (dy, step = 24, still = true) => {
    // finger moves up by dy (scrolls down) in 24 px steps every 16 ms, from a start that leaves room
    const y0 = dy > 0 ? 820 : 120; let y = y0;
    await touch('touchStart', y);
    const steps = Math.ceil(Math.abs(dy) / step);
    for (let i = 0; i < steps; i++) { y = y0 - Math.sign(dy) * Math.min(Math.abs(dy), (i + 1) * step); await touch('touchMove', y); await sleep(16); }
    if (still) for (let i = 0; i < 6; i++) { await touch('touchMove', y); await sleep(16); }   // stop moving before the hold: no fling
    return y;
  };
  // far from the end: an ordinary drag must not be followed by any settle
  await page.eval(`(window.scrollTo(0, ${Math.round(g.max * 0.5)}), 0)`); await sleep(500);
  { await drag(200); await touch('touchEnd'); await sleep(300); const a = await page.eval('scrollY'); await sleep(1500); const b = await page.eval('scrollY');
    res.midPage = { a, b, moved: a !== b }; console.log('mid page drag: moved after release', a !== b); }
  if (argv.includes('--flicks')) for (const [name, p0, moves, v0, want, px = 24, kick = null] of FLICKS) {
    // px < 24: the page rests at p0 between the ends with its last move away from the target (phone: the toolbar
    // offset after reaching the other end): rest at the target end, finger down, instant jump to p0, 150 ms still
    const off = px < 24, top = (p) => Math.round(g.max - g.t + p * g.t);
    await page.eval(`(window.scrollTo({ top: ${top(off ? want : p0)}, behavior: 'instant' }), 0)`); await sleep(1200);
    const gap = off ? 8 : 16;
    let y = v0 > 0 ? 820 : 120; await touch('touchStart', y);
    if (off) { await page.eval(`(window.scrollTo({ top: ${top(p0)}, behavior: 'instant' }), 0)`); await sleep(150); }
    const before = (await page.eval(GEO)).p;
    await sleep(gap);
    for (let i = 0; i < moves; i++) { y -= Math.sign(v0) * px; await touch('touchMove', y); await sleep(gap); }
    const lift = (await page.eval(GEO)).p;
    await touch('touchEnd'); await page.eval(GLIDE(v0));
    if (kick != null) { await sleep(150); await page.eval(`((window.__ownScrollTo || window.scrollTo.bind(window))({ top: ${Math.round(g.max - g.t + kick * g.t)}, behavior: 'instant' }), 0)`); }
    const samples = [];
    for (const ms of [100, 200, 300, 400, 500, 700, 1000, 2000, 3000]) { await sleep(ms - (samples.at(-1)?.[0] ?? 0)); samples.push([ms, (await page.eval(GEO)).p]); }
    const at = (p) => (want ? p >= 0.99 : p <= 0.01), end = samples.at(-1)[1], ok = at(end);
    const doneAt = samples.find((x, i) => samples.slice(i).every((z) => at(z[1])))?.[0] ?? null;
    const glide = await page.eval('window.__glide');
    const rev = samples.some((x, i) => i > 0 && (want ? x[1] < samples[i - 1][1] - 0.01 : x[1] > samples[i - 1][1] + 0.01));
    res.cases.push({ name, before, lift, samples, end, want, ok, doneAt, glide, reversed: rev });
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: p ${before} -> lift ${lift}; glide ${glide.frames} frames (${glide.why}); end ${end} by ${doneAt} ms${rev ? ', TURNED BACK' : ''}; ${samples.map((x) => x[0] + 'ms ' + x[1]).join(', ')}`);
  }
  else for (const [name, p0, share, want, step, hold] of CASES) {
    await page.eval(`(window.scrollTo({ top: ${Math.round(g.max - g.t + p0 * g.t)}, behavior: 'instant' }), 0)`); await sleep(1200);
    const before = (await page.eval(GEO)).p;
    await drag(share * g.t, step, hold);
    const held0 = (await page.eval(GEO)).p; if (hold) await sleep(1200); const held1 = (await page.eval(GEO)).p;
    await touch('touchEnd');
    const samples = [];
    for (const ms of [100, 200, 300, 400, 500, 700, 1000, 2000, 4000]) { await sleep(ms - (samples.at(-1)?.[0] ?? 0)); samples.push([ms, (await page.eval(GEO)).p]); }
    const end = samples.at(-1)[1], ok = Math.abs(end - want) < 0.01 && held0 === held1;
    const doneAt = samples.find((x, i) => samples.slice(i).every((z) => Math.abs(z[1] - want) < 0.01))?.[0] ?? null;
    res.cases.push({ name, before, held: [held0, held1], samples, end, want, ok, doneAt });
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: p ${before}, held ${held0} -> ${held1} (${hold ? '1.2 s finger down' : 'no hold'}), at the end by ${doneAt} ms; after release ${samples.map((x) => x[0] + 'ms ' + x[1]).join(', ')}`);
  }
  await page.close();
} finally { srv.proc.kill(); cdp.close(); await chrome.close(); }
const f = join(OUT, `settle-chrome-${tag}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
