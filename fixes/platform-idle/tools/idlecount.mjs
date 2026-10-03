// platform-idle (P-077) Chrome counter, COUNTS ONLY, no timing claim. One page load of one arm per call.
// Headless Chrome 430x932 DPR 3 mobile+touch, CPU 1x (the census setting of research/gpu-props). At each stop
// (scrollY 4660 and 5346, the gpu-props census positions of the platform tail) it settles 3 s, then counts trace events in
// a 20 s window: 20 s = 5 sweep cycles (4 s) = 4 glint cycles (5 s), so every window holds whole events of both.
// Counted: UpdateLayoutTree, PrePaint, Paint, Layout, Layerize, FunctionCall, BeginFrame, DrawFrame.
// Element checks (for the scorer's VOID rule): running animations in view, glint/sweep state, SMIL <animate> count.
// Served-file hashes: the page fetches its own JS node and CSS and hashes them (sha256, first 12 hex).
// usage: node fixes/platform-idle/tools/idlecount.mjs --state <serve.json> --arm C|V|B --rep N --out <records.json>
//   appends one load to <records.json> ({loads: [...]}, the ts-costcard (I-083) pre-cut shape, windows kind 'idle').
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../../tools/lib/cdp.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const state = JSON.parse(readFileSync(arg('--state'), 'utf8'));
const url = state.url || `https://localhost:${state.port}/`;
const arm = arg('--arm'), rep = Number(arg('--rep', '1')), outPath = arg('--out');
const STOPS = [4660, 5346], SETTLE = 3000, WIN = 20000;
const NAMES = { styleRecalcs: 'UpdateLayoutTree', prePaints: 'PrePaint', paints: 'Paint', layouts: 'Layout', layerizes: 'Layerize', functionCalls: 'FunctionCall', beginFrames: 'BeginFrame', drawFrames: 'DrawFrame' };
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(root, 'out', 'platform-idle', 'chrome'), 'pi-idlecount'), headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const load = { arm, rep, mode: 'full', engine: 'chrome', tool: 'fixes/platform-idle/tools/idlecount.mjs', startedAt: new Date().toISOString(), browser: chrome.browser, viewport: { width: 430, height: 932, dpr: 3, mobile: true }, windows: [] };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await sleep(2000);
  load.served = await page.eval(`(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return { js: await h(${JSON.stringify(JS)}), css: await h(${JSON.stringify(CSS)}) }; })()`);
  load.docH = await page.eval('document.documentElement.scrollHeight');
  const events = [];
  page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 400 * 1024, includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', '__metadata'] }, transferMode: 'ReportEvents' });
  const checks = [];
  for (const y of STOPS) {
    await page.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await sleep(SETTLE);
    await page.eval(`performance.mark('pi-start-${y}')`);
    await sleep(WIN);
    await page.eval(`performance.mark('pi-end-${y}')`);
    checks.push(await page.eval(`(() => { const vh = innerHeight, inView = (t) => { const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.width > 0; };
      const run = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && inView(a.effect.target));
      const dash = [...document.querySelectorAll('.start-selling-platform-secure-network-dash')];
      return { y: scrollY, running: run.map((a) => (a.animationName || a.transitionProperty || '?') + (a.effect.pseudoElement || '')),
        glintActive: document.querySelectorAll('.start-selling-platform-secure-network-dash-glint.is-active').length,
        smilAnimate: dash.reduce((n, d) => n + d.querySelectorAll('animate').length, 0), dashInView: dash.filter(inView).length,
        sweepTitlesInView: [...document.querySelectorAll('.start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized')].filter(inView).length,
        sweepPaused: document.querySelectorAll('.start-selling-platform [data-sweep-paused]').length }; })()`));
  }
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
  const marks = new Map();
  for (const e of events) if (e.cat && e.cat.includes('blink.user_timing') && /^pi-(start|end)-/.test(e.name)) marks.set(e.name, e.ts);
  for (const [i, y] of STOPS.entries()) {
    const a = marks.get(`pi-start-${y}`), b = marks.get(`pi-end-${y}`);
    const w = { kind: 'idle', y, scrollY: checks[i].y, ms: a && b ? Math.round((b - a) / 1000) : null, sweepCycles: 5, glintCycles: 4 };
    for (const [k, n] of Object.entries(NAMES)) w[k] = a && b ? events.filter((e) => e.name === n && e.ts >= a && e.ts < b).length : null;
    w.mainFrames = w.prePaints;
    w.check = checks[i];
    load.windows.push(w);
  }
  if (load.windows.some((w) => w.ms == null)) load.void = 'trace marks missing';
  await page.close();
} catch (e) { load.void = 'error: ' + String(e.message || e); } finally { cdp.close(); await chrome.close(); }
const rec = outPath && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
rec.loads.push(load);
if (outPath) { mkdirSync(dirname(outPath), { recursive: true }); writeFileSync(outPath, JSON.stringify(rec, null, 1)); }
console.log(arm, rep, JSON.stringify(load.served), load.void || '', load.windows.map((w) => `y${w.y} ms${w.ms} ULT${w.styleRecalcs} PP${w.prePaints} P${w.paints} L${w.layouts} FC${w.functionCalls} glint${w.check.glintActive} smil${w.check.smilAnimate} sweepInView${w.check.sweepTitlesInView}`).join(' | '));
