// morph-scroll: what runs on the main thread after a lift at the end screen (PR-023 rev 3, user T-178 #6: "laggy after I
// let go", C-054). Call tree and layout/paint counts, not a timing verdict: headless Chrome, 430x932 DPR 3 touch, CPU 6x
// (the calibrated setting, main thread only), one Chrome trace over all cases. Per case: rest at the start end, a short
// finger flick (CDP touch), lift, then the emulated iOS glide from settle-chrome.mjs (the page's own smooth scrollTo takes
// over). A performance.mark per lift ties the trace to it. Output: per lift, every main-thread task in the 700 ms after
// it that is >= 4 ms (at 6x), with its own JS functions (FunctionCall name:line), style recalcs, layouts (forced ones with
// the JS stack that forced them), paints, and its time from the lift.
// Run (shared lane, counts only):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node fixes/morph-scroll/settle-trace.mjs --snap <abs overlay or snapshot dir> [--label x] [--reps 3]
// Output: out/morph-scroll/settle-trace-<label>-<stamp>.json (+ .trace.json, the raw events).
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
if (!SNAP) throw new Error('--snap <abs overlay or snapshot dir>');
const LABEL = arg('--label', basename(SNAP));
const REPS = +arg('--reps', 3);
const CPU = +arg('--cpu', 6);
const VW = 430, VH = 932, DPR = 3;
const OUT = join(WT, 'out/morph-scroll'); mkdirSync(OUT, { recursive: true });
const tag = new Date().toISOString().replace(/[:.]/g, '-');
// [name, p0 (start end), moves of 24 px 16 ms apart, glide v0 px/ms (+ = opening)]
const CASES = [
  ['close from open, 2 moves, glide -1.5', 1, 2, -1.5],
  ['open from closed, 2 moves, glide 1.5', 0, 2, 1.5],
  ['close from open, 1 move, glide -0.8', 1, 1, -0.8],
  ['open from closed, 1 move, glide 0.8', 0, 1, 0.8],
];
const GLIDE = (v0) => `(() => { let v = ${v0}, y = scrollY, last = performance.now(); window.__glide = { frames: 0, why: null };
  const own = window.__ownScrollTo || (window.__ownScrollTo = window.scrollTo.bind(window));
  window.scrollTo = (...a) => { if (a[0] && a[0].behavior === 'smooth') window.__glide.stop = 1; return own(...a); };
  const max = document.documentElement.scrollHeight - innerHeight;
  const step = (now) => { if (window.__glide.stop || Math.abs(scrollY - Math.round(y)) > 2) return void (window.__glide.why = 'taken over');
    const dt = now - last; last = now; y += v * dt; v *= Math.pow(0.998, dt);
    if (y >= max || y <= 0) { own({ top: Math.min(max, Math.max(0, y)), behavior: 'instant' }); return void (window.__glide.why = 'page end'); }
    if (Math.abs(v) < 0.02) return void (window.__glide.why = 'stopped');
    own({ top: Math.round(y), behavior: 'instant' }); window.__glide.frames++; requestAnimationFrame(step); };
  requestAnimationFrame(step); return 0; })()`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null }; })()`;
async function serve() {
  const st = join(OUT, `serve-settle-trace-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', SNAP, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack',
  'blink.user_timing', 'toplevel', 'v8.execute', 'disabled-by-default-devtools.timeline.frame'].join(',');
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-scroll/chrome'), 'settle-trace'), headless: true, windowSize: `${VW},${VH}` });
const cdp = await CDP.connect(chrome.wsUrl);
const srv = await serve();
const events = [];
const res = { tool: 'morph-scroll settle-trace (fix-hero-exit-threaded)', label: LABEL, snap: SNAP, cpu: CPU, reps: REPS, browser: chrome.browser, lifts: [] };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
  for (const f of [0.25, 0.5, 0.75, 1]) { await page.eval(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(600); }
  const g = await page.eval(GEO); res.geo = g;
  const top = (p) => Math.round(g.max - g.t + p * g.t);
  const touch = (type, y) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 215, y }] });
  await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  page.on((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
  let n = 0;
  for (let r = 0; r < REPS; r++) for (const [name, p0, moves, v0] of CASES) {
    await page.eval(`(window.scrollTo({ top: ${top(p0)}, behavior: 'instant' }), 0)`); await sleep(1500);
    let y = v0 > 0 ? 820 : 120; await touch('touchStart', y); await sleep(16);
    for (let i = 0; i < moves; i++) { y -= Math.sign(v0) * 24; await touch('touchMove', y); await sleep(16); }
    const id = `lift-${++n}`;
    await page.eval(`(performance.mark(${JSON.stringify(id)}), 0)`);
    await touch('touchEnd'); await page.eval(GLIDE(v0));
    await sleep(2000);
    const end = (await page.eval(GEO)).p, glide = await page.eval('window.__glide');
    res.lifts.push({ id, name, rep: r, end, glide });
    console.log(id, name, 'end p', end, 'glide', glide.frames, glide.why);
  }
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  await page.send('Tracing.end'); await done;
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
} finally { srv.proc.kill(); cdp.close(); await chrome.close(); }

// ---- analysis: main thread of the page renderer
const names = new Map(); for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
const marks = events.filter((e) => e.cat && e.cat.includes('blink.user_timing') && /^lift-\d+$/.test(e.name));
const markPid = marks[0]?.pid;
const mainKey = [...names].find(([k, v]) => v === 'CrRendererMain' && k.startsWith(`${markPid}:`))?.[0];
const onMain = events.filter((e) => `${e.pid}:${e.tid}` === mainKey && (e.ph === 'X' || e.ph === 'B' || e.ph === 'E'));
const tasks = onMain.filter((e) => e.ph === 'X' && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur >= 0);
const inside = (t, e) => e.ts >= t.ts && e.ts <= t.ts + t.dur;
const markTs = new Map(); for (const m of marks) if (!markTs.has(m.name)) markTs.set(m.name, m.ts);
for (const L of res.lifts) {
  const t0 = markTs.get(L.id); if (t0 == null) { L.tasks = null; continue; }
  const near = tasks.filter((t) => t.ts >= t0 - 20000 && t.ts <= t0 + 700000 && t.dur >= 4000);
  L.tasks = near.map((t) => {
    const kids = onMain.filter((e) => e !== t && inside(t, e));
    const fn = kids.filter((e) => e.name === 'FunctionCall').map((e) => { const d = e.args?.data || {}; return `${d.functionName || '(anon)'}:${d.lineNumber ?? '?'}@${basename(d.url || '')}`; });
    const forced = kids.filter((e) => (e.name === 'Layout' || e.name === 'UpdateLayoutTree') && e.args?.beginData?.stackTrace?.length)
      .map((e) => `${e.name} <- ` + e.args.beginData.stackTrace.slice(0, 4).map((s) => `${s.functionName || '(anon)'}:${s.lineNumber}`).join(' < '));
    const count = (n) => kids.filter((e) => e.name === n).length;
    return { atMs: +((t.ts - t0) / 1000).toFixed(1), durMs: +(t.dur / 1000).toFixed(1),
      kinds: [...new Set(kids.filter((e) => ['TimerFire', 'FireAnimationFrame', 'EventDispatch', 'FunctionCall', 'v8.callFunction'].includes(e.name)).map((e) => e.name === 'EventDispatch' ? `Event:${e.args?.data?.type}` : e.name))],
      fn: [...new Set(fn)].slice(0, 12), styleRecalcs: count('UpdateLayoutTree'), layouts: count('Layout'), paints: count('Paint'), prePaint: count('PrePaint'), layerize: count('Layerize'), forced: [...new Set(forced)].slice(0, 6) };
  });
}
const f = join(OUT, `settle-trace-${LABEL}-${tag}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
writeFileSync(f.replace(/\.json$/, '.trace.json'), JSON.stringify({ traceEvents: events }));
for (const L of res.lifts) {
  console.log(`\n${L.id} ${L.name} (end p ${L.end})`);
  for (const t of L.tasks || []) console.log(`  +${t.atMs} ms  ${t.durMs} ms  style ${t.styleRecalcs} layout ${t.layouts} paint ${t.paints}  ${t.kinds.join(',')}  ${t.fn.join(' ')}${t.forced.length ? '\n      forced: ' + t.forced.join(' | ') : ''}`);
}
console.log('WROTE', f);
