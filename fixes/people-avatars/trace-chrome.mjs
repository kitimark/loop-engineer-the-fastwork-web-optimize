// people-avatars: Chrome call-tree trace of the "People" title's O (the avatar stack that grows out of the O) on the
// best build v7 (fix-hero-exit-threaded; user T-107 #1). Counts and per-event costs, no fps verdict (timing deferred).
// Headless Chrome 430x932 DPR 3 mobile + touch, CPU throttle --cpu (default 6, the calibrated phone stand-in).
// Arms: V = v7 as served; N = v7 + the People-O's transitions off (control: what the O's animation itself costs).
// Per load: scroll to 1.5 screens above the title, quiet 2 s, start the trace, scroll 200 px per frame until the title
// sits mid-screen, hold --hold s. Phase stamps from a MutationObserver on the O's class (is-stack, is-expanded).
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 \
//   --owner fix-hero-exit-threaded -- node fixes/people-avatars/trace-chrome.mjs --snap <abs snapshot dir> [--reps 2]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SNAP = arg('--snap');
if (!SNAP) throw new Error('--snap <abs snapshot dir> (e.g. out/snapshots/msbase-8c90da217745)');
const CPU = Number(arg('--cpu', '6')), HOLD = Number(arg('--hold', '5')), REPS = Number(arg('--reps', '2'));
const ARMS = arg('--arms', 'V,N').split(',');
const VW = 430, VH = 932, DPR = 3;
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/people-avatars', `trace-${tag}`); mkdirSync(OUT, { recursive: true });
const OFF = `.start-selling-future-people-o, .start-selling-future-people-o * { transition: none !important; }`;
const INIT = `(() => {
  window.__pplo = [];
  const hook = () => { const o = document.querySelector('.start-selling-future-people-o'); if (!o) return false;
    const note = () => { const s = (o.classList.contains('is-stack') ? 'S' : '') + (o.classList.contains('is-expanded') ? 'E' : '');
      if (window.__pplo.length && window.__pplo[window.__pplo.length - 1].s === s) return;
      window.__pplo.push({ s, t: performance.now() }); console.timeStamp('pplo:' + s); };
    new MutationObserver(note).observe(o, { attributes: true, attributeFilter: ['class'] }); note(); return true; };
  const mo = new MutationObserver(() => { if (hook()) mo.disconnect(); });
  document.addEventListener('DOMContentLoaded', () => { if (!hook()) mo.observe(document.body, { childList: true, subtree: true }); });
})();`;
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'blink.animations', 'blink.user_timing', 'loading', 'disabled-by-default-devtools.timeline.invalidationTracking', '__metadata'];

async function serve() {
  const st = join(OUT, 'serve.json'); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', SNAP, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}

function analyse(events, stamps) {
  const main = (() => { const c = new Map(); for (const e of events) if (e.name === 'UpdateLayoutTree' || e.name === 'Layout') c.set(e.tid, (c.get(e.tid) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; })();
  const ts = (n) => events.filter((e) => e.name === 'TimeStamp' && String(e.args?.data?.message || '').startsWith(n)).map((e) => e.ts);
  const tS = ts('pplo:S')[0], tE = ts('pplo:SE')[0], tScrollEnd = ts('scroll-end')[0], t0 = ts('trace-start')[0], tEnd = ts('trace-end')[0];
  const tLeave = ts('leave-start')[0], tShut = ts('pplo:').filter((t) => tE != null && t > tE && t > tLeave)[0];
  const tGrowEnd = tE != null ? Math.min(tE + 1500e3, tLeave) : null;
  const phases = [
    ['scroll in', t0, tScrollEnd], ['wait (title in view, before the O opens)', tScrollEnd, tS ?? tLeave],
    ['O: faces appear (is-stack)', tS, tE ?? tLeave], ['O: grows + faces fade in (1.5 s)', tE, tGrowEnd],
    ['still (O open)', tGrowEnd, tLeave], ['leave: scrolling, before the O closes', tLeave, tShut ?? tEnd],
    ['leave: O closes while scrolling (1 s)', tShut, tShut != null ? Math.min(tShut + 1000e3, tEnd) : null],
    ['after', tShut != null ? tShut + 1000e3 : null, tEnd],
  ].filter(([, a, b]) => a != null && b != null && b > a);
  const X = events.filter((e) => e.tid === main && e.ph === 'X');
  const rows = phases.map(([name, a, b]) => {
    const inn = (e) => e.ts >= a && e.ts < b;
    const lay = X.filter((e) => e.name === 'Layout' && inn(e));
    const ult = X.filter((e) => e.name === 'UpdateLayoutTree' && inn(e));
    const pre = X.filter((e) => (e.name === 'PrePaint' || e.name === 'Paint' || e.name === 'PaintImage') && inn(e));
    const dec = events.filter((e) => /Decode|ImageDecodeTask/.test(e.name) && e.ph === 'X' && inn(e));
    const frames = events.filter((e) => e.name === 'BeginMainThreadFrame' && e.tid === main && inn(e)).length;
    const sum = (l) => Math.round(l.reduce((s, e) => s + (e.dur || 0), 0) / 100) / 10;
    const tot = lay.map((e) => e.args?.beginData?.totalObjects || 0), dirty = lay.map((e) => e.args?.beginData?.dirtyObjects || 0);
    return { phase: name, ms: Math.round((b - a) / 1e3), mainFrames: frames,
      layout: { n: lay.length, ms: sum(lay), maxMs: Math.round(Math.max(0, ...lay.map((e) => e.dur || 0)) / 100) / 10,
        dirtyObjectsMedian: dirty.sort((x, y) => x - y)[dirty.length >> 1] ?? null, totalObjectsMax: Math.max(0, ...tot) },
      style: { n: ult.length, ms: sum(ult), elementsMax: Math.max(0, ...ult.map((e) => e.args?.elementCount || 0)) },
      paint: { n: pre.filter((e) => e.name === 'Paint').length, ms: sum(pre.filter((e) => e.name === 'Paint')), prePaintMs: sum(pre.filter((e) => e.name === 'PrePaint')) },
      decode: { n: dec.length, ms: sum(dec), names: [...new Set(dec.map((e) => e.name))] } };
  });
  // which animations ran on the O, and could they run on the compositor
  const anim = []; const open = new Map();
  for (const e of events.filter((x) => x.name === 'Animation').sort((a, b) => a.ts - b.ts)) {
    const id = e.id2?.local || e.id; const d = e.args?.data || {};
    if (e.ph === 'b') { const r = { ts: e.ts, node: d.nodeName || null, name: d.name ?? null, cf: [], unsupported: [] }; open.set(id, r); anim.push(r); }
    const r = open.get(id); if (!r) continue;
    if (d.nodeName && !r.node) r.node = d.nodeName;
    if (d.compositeFailed !== undefined) r.cf.push(d.compositeFailed);
    if (d.unsupportedProperties) r.unsupported.push(...d.unsupportedProperties);
  }
  const pplo = anim.filter((r) => /people-o/.test(r.node || '') && (tS == null || r.ts >= tS - 50e3));
  const byProp = {};
  for (const r of pplo) { const k = `${(r.node || '').replace(/.*people-o-?/, 'o-') || 'o'}|${r.name}`; const v = byProp[k] ||= { n: 0, compositeFailed: new Set(), unsupported: new Set() }; v.n++; r.cf.forEach((c) => v.compositeFailed.add(c)); r.unsupported.forEach((u) => v.unsupported.add(u)); }
  for (const v of Object.values(byProp)) { v.compositeFailed = [...v.compositeFailed]; v.unsupported = [...v.unsupported]; }
  // the image requests and their decode
  const imgs = events.filter((e) => e.name === 'ResourceSendRequest' && /people|sellers\/[^/]+\/avatar/.test(e.args?.data?.url || '')).map((e) => ({ url: e.args.data.url.replace(/^https?:\/\/[^/]+/, ''), atMs: Math.round((e.ts - t0) / 1e3) }));
  return { main, stamps: { O_stackMs: tS != null ? Math.round((tS - t0) / 1e3) : null, O_expandMs: tE != null ? Math.round((tE - t0) / 1e3) : null, scrollEndMs: Math.round((tScrollEnd - t0) / 1e3) }, phases: rows, animations: byProp, imageRequests: imgs, pageStamps: stamps };
}

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/people-avatars/chrome'), 'trace'), headless: true, windowSize: `${VW},${VH}` });
const cdp = await CDP.connect(chrome.wsUrl);
const srv = await serve();
const res = { tool: 'people-avatars trace-chrome (fix-hero-exit-threaded)', snap: SNAP.replace(WT + '/', ''), cpu: CPU, viewport: { w: VW, h: VH, dpr: DPR }, browser: chrome.browser, loads: [] };
try {
  for (let rep = 0; rep < REPS; rep++) for (const arm of ARMS) {
    const page = await cdp.newIsolatedPage();
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      if (arm === 'N') await page.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(OFF)}; document.head.append(s); })()`);
      const geo = await page.eval(`(() => { const h = document.getElementById('future-heading'); const r = h.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), h: Math.round(r.height) }; })()`);
      const target = Math.max(0, geo.top + geo.h / 2 - VH / 2), start = Math.max(0, target - 1.5 * VH);
      // reach the start like a reader: 200 px per frame from the top (lazy content and the hero run as usual)
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y = Math.min(y + 200, ${start}); scrollTo({ top: y, behavior: 'instant' }); y < ${start} ? requestAnimationFrame(step) : setTimeout(res, 2000); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      const events = [];
      const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
      await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 300 * 1024, includedCategories: CATS }, transferMode: 'ReportEvents' });
      await page.eval(`console.timeStamp('trace-start')`);
      await page.eval(`new Promise((res) => { let y = scrollY; const step = () => { y = Math.min(y + 200, ${target}); scrollTo({ top: y, behavior: 'instant' }); if (y < ${target}) requestAnimationFrame(step); else { console.timeStamp('scroll-end'); res(); } }; requestAnimationFrame(step); })`, { timeout: 60000 });
      await sleep(HOLD * 1000);
      // leave: scroll on down past the title (the O collapses once under 35 % of the title shows), then 1.5 s
      await page.eval(`console.timeStamp('leave-start')`);
      await page.eval(`new Promise((res) => { let y = scrollY; const end = y + ${VH}; const step = () => { y = Math.min(y + 100, end); scrollTo({ top: y, behavior: 'instant' }); if (y < end) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      await sleep(1500);
      await page.eval(`console.timeStamp('trace-end')`);
      await page.send('Tracing.end');
      await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
      off();
      if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const stamps = await page.eval(`window.__pplo`);
      const a = analyse(events, stamps);
      const f = join(OUT, `trace-${arm}-${rep}.json`); writeFileSync(f, JSON.stringify({ traceEvents: events }));
      const load = { arm, rep, geo, target, ...a, trace: f.replace(WT + '/', '') };
      res.loads.push(load);
      console.log(`LOAD ${arm} rep ${rep} title y ${geo.top} stamps ${JSON.stringify(a.stamps)}`);
      for (const r of a.phases) console.log(`  ${r.phase.padEnd(44)} ${String(r.ms).padStart(5)} ms, frames ${r.mainFrames}, layout ${r.layout.n} (${r.layout.ms} ms, max ${r.layout.maxMs}, dirty med ${r.layout.dirtyObjectsMedian}, total ${r.layout.totalObjectsMax}), style ${r.style.n} (${r.style.ms} ms, max el ${r.style.elementsMax}), paint ${r.paint.n} (${r.paint.ms} ms), decode ${r.decode.n} (${r.decode.ms} ms)`);
      console.log('  O animations', JSON.stringify(a.animations));
      console.log('  images', JSON.stringify(a.imageRequests));
    } finally { await page.close(); }
  }
} finally { srv.proc.kill(); cdp.close(); }
writeFileSync(join(OUT, 'trace.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'trace.json').replace(WT + '/', ''));
process.exit(0);
