#!/usr/bin/env node
// de-frame-audit census (counts only, no timing claim). Adapted from fix-rest-script's census.mjs.
// One headless Chrome, 430x932 DPR 3 mobile + touch, no CPU throttle. Per window (rest at fixed y, or a scripted
// scroll top -> bottom at ~600 px/s): main frames (PrePaint), UpdateLayoutTree (+ elements restyled), Layout
// (+ dirty objects), Paint, rAF fires, timer fires, and every FunctionCall into 2.DyWL8TcE.js by line:col + name,
// split by what fired it (timer / raf / other).
// usage: node census.mjs --url <u> --arm <name> --out <json> [--ys 0,1400,2796,3800,end] [--idle 6000] [--settle 2000]
import { writeFileSync } from 'node:fs';
// Run from a checkout (worktree) root, inside a `lock.mjs run chrome-measure --shared --weight probe` hold, against a
// `serve.mjs --https --port 0` server (baseline) or one with `--overlay <dir>` (a patched build).
const WT = process.cwd();
const { launchChrome, CDP, gotoAndSettle, tempProfileDir } = await import(WT + '/tools/lib/cdp.mjs');
const { setTimeout: sleep } = await import('node:timers/promises');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('--url'), ARM = arg('--arm'), OUT = arg('--out');
const W = 430, VH = 932, DPR = 3;
const idleMs = Number(arg('--idle', '6000')), settleMs = Number(arg('--settle', '2000'));
const ys = arg('--ys', '0,1400,2796,3800,end').split(',');
const SCROLL_PX_PER_FRAME = 10;

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(WT + '/out/frame-audit/chrome', 'fa-' + ARM), headless: true, windowSize: `${W},${VH}`, args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
const result = { arm: ARM, url: URL_, w: W, vh: VH, dpr: DPR, idleMs, settleMs, browser: chrome.browser, windows: [] };
try {
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: VH, deviceScaleFactor: DPR, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await gotoAndSettle(page, URL_, { quietMs: 2000, maxMs: 45000 });
  await sleep(2000);
  result.docHeight = await page.eval(`document.documentElement.scrollHeight`);
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 400 * 1024,
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', '__metadata'] }, transferMode: 'ReportEvents' });
  const wins = [];
  for (const y of ys) {
    const target = y === 'end' ? `document.documentElement.scrollHeight - innerHeight` : y;
    await page.eval(`scrollTo({ top: ${target}, behavior: 'instant' })`);
    await sleep(settleMs);
    const yy = await page.eval(`Math.round(scrollY)`);
    const label = 'rest-' + y;
    await page.eval(`performance.mark('fa-start-${label}')`);
    await sleep(idleMs);
    await page.eval(`performance.mark('fa-end-${label}')`);
    wins.push({ label, kind: 'rest', y: yy, ms: idleMs });
  }
  // scripted scroll top -> bottom, SCROLL_PX_PER_FRAME per rAF
  await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(settleMs);
  await page.eval(`(() => { window.__faDone = false; performance.mark('fa-start-scroll');
    const max = document.documentElement.scrollHeight - innerHeight; let y = 0;
    const step = () => { y = Math.min(max, y + ${SCROLL_PX_PER_FRAME}); scrollTo({ top: y, behavior: 'instant' });
      if (y < max) requestAnimationFrame(step); else { performance.mark('fa-end-scroll'); window.__faDone = true; } };
    requestAnimationFrame(step); })()`);
  const t0 = Date.now();
  while (!(await page.eval(`window.__faDone`)) && Date.now() - t0 < 60000) await sleep(250);
  wins.push({ label: 'scroll', kind: 'scroll', y: 'top->end', ms: null });
  await sleep(500);
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
  off();
  const marks = new Map();
  for (const e of events) if (/^fa-(start|end)-/.test(e.name)) marks.set(e.name, e.ts);
  const parents = events.filter((e) => (e.name === 'TimerFire' || e.name === 'FireAnimationFrame' || e.name === 'FireIdleCallback') && e.ph === 'X');
  const byTid = new Map(); for (const p of parents) { if (!byTid.has(p.tid)) byTid.set(p.tid, []); byTid.get(p.tid).push(p); }
  for (const l of byTid.values()) l.sort((a, b) => a.ts - b.ts);
  const parentOf = (e) => { const l = byTid.get(e.tid); if (!l) return 'other'; let lo = 0, hi = l.length - 1, f = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (l[m].ts <= e.ts) { f = m; lo = m + 1; } else hi = m - 1; } return f >= 0 && e.ts <= l[f].ts + (l[f].dur || 0) ? (l[f].name === 'TimerFire' ? 'timer' : l[f].name === 'FireAnimationFrame' ? 'raf' : 'idle') : 'other'; };
  for (const w of wins) {
    const a = marks.get(`fa-start-${w.label}`), b = marks.get(`fa-end-${w.label}`);
    if (a === undefined || b === undefined) { w.error = 'marks missing'; continue; }
    w.ms = Math.round((b - a) / 1000);
    const per = 1e6 / (b - a);   // per second
    const r1 = (n) => +(n * per).toFixed(1);
    const inW = (e) => e.ts >= a && e.ts < b;
    const cnt = (name) => events.filter((e) => e.name === name && inW(e) && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i')).length;
    let elems = 0, dirty = 0;
    for (const e of events) {
      if (!inW(e)) continue;
      if (e.name === 'UpdateLayoutTree' && e.args?.elementCount) elems += e.args.elementCount;
      if (e.name === 'Layout' && e.args?.beginData?.dirtyObjects) dirty += e.args.beginData.dirtyObjects;
    }
    w.perSec = { mainFrames: r1(cnt('PrePaint')), styleRecalc: r1(cnt('UpdateLayoutTree')), elementsRestyled: r1(elems), layout: r1(cnt('Layout')), layoutDirtyObjects: r1(dirty),
      paint: r1(cnt('Paint')), rafFire: r1(cnt('FireAnimationFrame')), timerFire: r1(cnt('TimerFire')) };
    const fc = {};
    for (const e of events) {
      if (e.name !== 'FunctionCall' || !inW(e)) continue;
      const d = e.args?.data || {}; if (!/2\.DyWL8TcE\.js/.test(d.url || '')) continue;
      const k = `${d.lineNumber}:${d.columnNumber} ${d.functionName || '?'} /${parentOf(e)}`;
      fc[k] = (fc[k] || 0) + 1;
    }
    w.callsPerSec = Object.fromEntries(Object.entries(fc).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, v]) => [k, r1(v)]));
  }
  result.windows = wins;
  result.traceEvents = events.length;
} catch (e) {
  result.fatal = String(e && e.stack || e);
} finally {
  writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(`census ${ARM}: docHeight ${result.docHeight}${result.fatal ? ' FATAL ' + result.fatal.split('\n')[0] : ''}`);
  for (const w of result.windows) console.log(`  ${w.label} y${w.y} ${w.ms}ms ${JSON.stringify(w.perSec)}`);
  cdp.close(); await chrome.close();
}
