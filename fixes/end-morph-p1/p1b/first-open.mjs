// P1b attribution (fix-end-morph-p1, lead order 07:05Z): what the reveal's switch-on costs in the first frames of the
// first open after page load, C (v9-final + F1 + U2) against V (C + P1), Chrome. ATTRIBUTION ONLY: event counts and
// main-thread durations per frame window are read to find WHERE the work sits; no verdict is drawn from Chrome ms.
// Built from em-chrome.mjs (same server, page walk, rAF-stepped scroll with one console.timeStamp per frame).
// Per arm (fresh Chrome page per arm): load, walk the page, park 2 ih above the end track, then, touch held:
//   approach  endStart - 1 ih -> endStart in 30 frames
//   open1     m 0 -> 1 in N frames (the FIRST open after load; the reveal switches on here for the first time)
//   rest1     20 frames at m 1;  close1 m 1 -> 0 in N frames;  rest0 40 frames at m 0
//   open2     m 0 -> 1 in N frames (a repeat open: the reveal's elements already exist)
// For approach[-3..], open1[0..5] and open2[0..5]: per frame, main-thread totals by event (UpdateLayoutTree with element
// count, Layout with dirty/total objects, PrePaint, Paint by owner node + area, Layerize, Commit, FireAnimationFrame,
// FunctionCall by function), forced style/layout with their JS stacks, CPU-profile self samples (100 us) by function
// inside the window, and the compositor's RasterTask count. CPU throttle: --cpu (default 6, the calibrated setting).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph-p1 -- \
//     node fixes/end-morph-p1/p1b/first-open.mjs --arm C=out/p153/snap/C --arm V=out/p153/snap/V [--h 775] [--steps 40]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = argv.flatMap((a, i) => (argv[i - 1] === '--arm' ? [a] : [])).map((s) => { const [n, d] = s.split('='); return { name: n, dir: resolve(WT, d) }; });
if (!ARMS.length) throw new Error('--arm NAME=overlayDir (repeatable)');
const H = Number(arg('--h', '775')), N = Number(arg('--steps', '40')), CPU = Number(arg('--cpu', '6')), K = Number(arg('--frames', '6'));
const BASE = join(mirrorHome(), 'site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1/p1b'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack', 'blink.user_timing', 'cc', 'viz'].join(',');

async function serve(overlay) {
  const st = join(OUT, `serve-${tag}-${Math.random().toString(36).slice(2, 7)}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const touch = (page, type) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 215, y: 400, id: 1 }] });
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { y: scrollY, ih: innerHeight, t, max, endStart: max - t }; })()`;
const RUN = (phase, ys, rest) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; let k = 0; const R = ${rest};
  const f = () => { if (k < ys.length) { console.timeStamp('fo:${phase}:' + k); window.scrollTo({ top: ys[k], behavior: 'instant' }); k++; requestAnimationFrame(f); }
    else if (k < ys.length + R) { console.timeStamp('fo:${phase}:' + k); k++; requestAnimationFrame(f); } else { console.timeStamp('fo:${phase}:end'); res(k); } };
  requestAnimationFrame(f); })`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * (i + 1) / n));
const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
const isDur = (e) => e.ph === 'X';
const stackPath = (st) => Array.isArray(st) ? st.slice(0, 4).map((f) => `${f.functionName || '(anon)'}:${(f.lineNumber ?? -1) + 1}`).join(' < ') : null;
const fnKey = (d) => d ? `${d.functionName || '(anon)'}:${(d.lineNumber ?? -1) + 1}` : '?';
const ms = (us) => Math.round(us / 10) / 100;

function windowStats(evs, mainTid, prof) {
  const w = { ms: {}, n: {}, styleEls: 0, dirty: 0, total: 0, paintBy: {}, fn: {}, forced: [], raster: 0, rasterMs: 0, selfMs: {} };
  for (const e of evs) {
    if (e.name === 'RasterTask' && isDur(e)) { w.raster++; w.rasterMs += (e.dur || 0) / 1000; continue; }
    if (e.tid !== mainTid || !isDur(e)) continue;
    const n = e.name, a = e.args || {};
    if (!['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'FireAnimationFrame', 'FunctionCall', 'EventDispatch', 'HitTest', 'IntersectionObserverController::computeIntersections', 'UpdateLayer', 'ScrollLayer'].includes(n)) continue;
    w.n[n] = (w.n[n] || 0) + 1; w.ms[n] = (w.ms[n] || 0) + (e.dur || 0) / 1000;
    if (n === 'UpdateLayoutTree') { w.styleEls += a.elementCount ?? 0; const st = a.beginData?.stackTrace; if (st?.length) w.forced.push(`style ${a.elementCount ?? '?'} els ${ms(e.dur)} ms < ${stackPath(st)}`); }
    if (n === 'Layout') { w.dirty += a.beginData?.dirtyObjects ?? 0; w.total = Math.max(w.total, a.beginData?.totalObjects ?? 0); const st = a.beginData?.stackTrace; if (st?.length) w.forced.push(`layout ${a.beginData?.dirtyObjects ?? '?'}/${a.beginData?.totalObjects ?? '?'} ${ms(e.dur)} ms < ${stackPath(st)}`); }
    if (n === 'Paint') { const d = a.data || {}; const b = d.clip ? box(d.clip) : null; const ar = b && b.w * b.h < 1e8 ? b.w * b.h : 0; const k = d.nodeId || 0; const p = (w.paintBy[k] ||= { n: 0, kpx: 0, ms: 0 }); p.n++; p.kpx += ar / 1000; p.ms += (e.dur || 0) / 1000; }
    if (n === 'FunctionCall') { const k = fnKey(a.data); w.fn[k] = (w.fn[k] || 0) + (e.dur || 0) / 1000; }
  }
  // CPU profile self samples inside the window (timestamps in us, same clock as the trace)
  if (prof && evs.length) {
    const t0 = evs[0].ts, t1 = evs[evs.length - 1].ts;
    for (const [ts, key] of prof) if (ts >= t0 && ts < t1) w.selfMs[key] = (w.selfMs[key] || 0) + 0.1;
  }
  const r2 = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  w.ms = r2(w.ms); w.fn = r2(w.fn); w.selfMs = r2(w.selfMs); w.rasterMs = Math.round(w.rasterMs * 100) / 100;
  for (const p of Object.values(w.paintBy)) { p.kpx = Math.round(p.kpx); p.ms = Math.round(p.ms * 100) / 100; }
  return w;
}
function windows(ev, phase, mainTid, prof) {
  const marks = ev.filter((e) => e.name === 'TimeStamp' && (e.args?.data?.message || '').startsWith(`fo:${phase}:`)).map((e) => e.ts).sort((a, b) => a - b);
  const out = []; for (let i = 0; i + 1 < marks.length; i++) { const a = marks[i], b = marks[i + 1]; out.push({ spanMs: ms(b - a), ...windowStats(ev.filter((e) => e.ts >= a && e.ts < b && e.name !== 'TimeStamp'), mainTid, prof) }); }
  return out;
}

const res = { tool: 'fixes/end-morph-p1/p1b/first-open.mjs', h: H, steps: N, cpu: CPU, arms: {} };
for (const arm of ARMS) {
  const srv = await serve(arm.dir);
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'fo-' + arm.name), headless: true, windowSize: `430,${H}` });
  const cdp = await CDP.connect(chrome.wsUrl);
  const r = (res.arms[arm.name] = { overlay: arm.dir });
  try {
    const page = await cdp.newIsolatedPage();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
    r.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
    console.log(arm.name, 'served', JSON.stringify(r.served));
    // --cold: the walk stops 2 ih above the end track, so open1 is the first time the morph moves after load (as on the
    // phone's first swipe); default: the walk goes to the page bottom (the morph, and the reveal, ran once in the walk)
    const COLD = argv.includes('--cold');
    await page.eval(`new Promise((res) => { let y = 0; const lim = () => { const e = document.querySelector('.fw-ms-end'); return ${COLD} ? document.documentElement.scrollHeight - innerHeight - (e ? e.offsetHeight : 0) - 2 * innerHeight : document.documentElement.scrollHeight; };
      const step = () => { y = Math.min(y + 300, lim()); window.scrollTo({ top: y, behavior: 'instant' }); y < lim() ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
    r.cold = COLD;
    let g = await page.eval(GEO);
    await page.eval(`(window.scrollTo({ top: ${g.endStart - 2 * g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
    g = await page.eval(GEO); r.geo = g;
    r.revealElsBefore = await page.eval(`document.querySelectorAll('.fw-rv-dark, .fw-rv-glass').length`);
    if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
    await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 100 });
    await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
    await sleep(300); await page.send('Profiler.start');
    await touch(page, 'touchStart');
    await page.eval(RUN('approach', lin(g.endStart - g.ih, g.endStart, 30), 0), { timeout: 60000 });
    await page.eval(RUN('open1', lin(g.endStart, g.max, N), 0), { timeout: 60000 });
    r.revealElsAfterOpen1 = await page.eval(`document.querySelectorAll('.fw-rv-dark, .fw-rv-glass').length`);
    await page.eval(RUN('rest1', [], 20), { timeout: 60000 });
    await page.eval(RUN('close1', lin(g.max, g.endStart, N), 0), { timeout: 60000 });
    await page.eval(RUN('rest0', [], 40), { timeout: 60000 });
    await page.eval(RUN('open2', lin(g.endStart, g.max, N), 0), { timeout: 60000 });
    await touch(page, 'touchEnd');
    const prof = (await page.send('Profiler.stop')).profile;
    const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 90000);
    await page.send('Tracing.end'); await done; offT();
    if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // sample timeline: [ts, function:line] for self samples
    const nodes = new Map(prof.nodes.map((n) => [n.id, n])); const smp = []; let t = prof.startTime;
    for (let i = 0; i < prof.samples.length; i++) { t += prof.timeDeltas[i]; const c = nodes.get(prof.samples[i]).callFrame; smp.push([t, `${c.functionName || '(' + (c.url ? 'anon' : 'native') + ')'}:${c.lineNumber + 1}`]); }
    const fa = ev.find((e) => e.name === 'FireAnimationFrame'); const mainTid = fa ? fa.tid : null;
    const aw = windows(ev, 'approach', mainTid, smp), o1 = windows(ev, 'open1', mainTid, smp), o2 = windows(ev, 'open2', mainTid, smp);
    r.approachFirst = aw.slice(0, 3); r.approachLast = aw.slice(-3); r.open1 = o1.slice(0, K); r.open2 = o2.slice(0, K);
    // name paint owners
    const ids = new Set(); for (const w of [...r.approachFirst, ...r.approachLast, ...r.open1, ...r.open2]) for (const k of Object.keys(w.paintBy)) ids.add(k);
    await page.send('DOM.getDocument', { depth: 0 }); r.nodeNames = {};
    for (const k of ids) { if (!Number(k)) { r.nodeNames[k] = '(none)'; continue; }
      try { const { node } = await page.send('DOM.describeNode', { backendNodeId: Number(k) }); const at = node.attributes || []; const o = {}; for (let i = 0; i < at.length; i += 2) o[at[i]] = at[i + 1];
        r.nodeNames[k] = `${node.localName || node.nodeName}${o.id ? '#' + o.id : ''}${o.class ? '.' + o.class.split(/\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 3).join('.') : ''}`; } catch { r.nodeNames[k] = '?'; } }
    for (const [ph, ws] of [['approach0-2', r.approachFirst], ['approach-3', r.approachLast], ['open1', r.open1], ['open2', r.open2]])
      ws.forEach((w, i) => console.log(arm.name, ph, i, 'span', w.spanMs, 'ms', JSON.stringify(w.ms), 'els', w.styleEls, 'dirty', w.dirty, 'raster', w.raster, w.forced.length ? 'FORCED ' + w.forced.join(' | ') : ''));
    await page.close();
  } finally { cdp.close(); await chrome.close(); srv.proc.kill(); }
}
const f = join(OUT, `first-open-${H}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
