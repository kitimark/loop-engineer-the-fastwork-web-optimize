// toolbar-resize I card, Chrome side: WHO invalidates layout (and style) per frame at a scroll position, with the hero
// live (finger down, CSS mode) or parked, with or without 775 -> 815 resize steps. COUNTS ONLY (headless, shared lane).
// usage: node fixes/toolbar-resize/probe-inval.mjs <out.json> [--webkit] [--live] [--resize] [--y 380] [--frames 20] NAME=<url> ...
// Trace categories devtools.timeline + disabled-by-default-devtools.timeline.invalidationTracking: LayoutInvalidationTracking
// {nodeName, reason} and StyleRecalcInvalidationTracking / ScheduleStyleInvalidationTracking per node, Layout (dirtyObjects).
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const OUT = args[0];
const has = (f) => args.includes(f);
const optv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const URLS = Object.fromEntries(args.filter((a) => /^[A-Za-z0-9_-]+=/.test(a)).map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const Y = Number(optv('--y', 380)), N = Number(optv('--frames', 20)), H0 = 775, H1 = 815;
const RAF = `new Promise((r) => requestAnimationFrame(() => r()))`;

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'toolbar-resize-inval');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const result = { y: Y, frames: N, webkit: has('--webkit'), live: has('--live'), resize: has('--resize'), arms: {} };
try {
  for (const arm of Object.keys(URLS)) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    const metrics = (h) => page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await metrics(H0);
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (has('--webkit')) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.GestureEvent = function GestureEvent() {};' });
    await gotoAndSettle(page, URLS[arm]); await sleep(7000);
    await page.eval(`window.scrollTo(0, ${Y})`); await sleep(900);
    if (has('--live')) { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 215, y: 400 }] }); await page.eval(`window.scrollBy(0, 1)`); await page.eval(RAF); await page.eval(RAF); }
    const live = await page.eval(`!!document.querySelector('.hero-track.he-css')`);
    const evs = [];
    const off = cdp.on((m) => { if (m.method === 'Tracing.dataCollected' && m.sessionId === page.sessionId) evs.push(...m.params.value); });
    await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
    for (let i = 1; i <= N; i++) { if (has('--resize')) await metrics(H0 + ((i % 11) * (H1 - H0)) / 10); await page.eval(RAF); }
    const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 30000);
    await page.send('Tracing.end'); await done; off();
    if (has('--live')) await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const agg = (name) => { const m = {}; for (const e of evs) if (e.name === name) { const d = e.args?.data || {}; const k = `${d.nodeName || '?'} | ${d.reason || d.invalidationSet ? (d.reason || 'set') : '?'}`; m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    let layouts = 0, dirty = 0; for (const e of evs) if (e.name === 'Layout' && (e.ph === 'X' || e.ph === 'B')) { layouts++; dirty += e.args?.beginData?.dirtyObjects || 0; }
    const r = result.arms[arm] = { live, layoutsPerFrame: +(layouts / N).toFixed(2), dirtyPerFrame: +(dirty / N).toFixed(1), layoutInval: agg('LayoutInvalidationTracking'), styleInval: agg('StyleRecalcInvalidationTracking'), schedInval: agg('ScheduleStyleInvalidationTracking') };
    console.log(`== ${arm} y${Y} live=${live} resize=${has('--resize')}: layouts/frame ${r.layoutsPerFrame}, dirty objects/frame ${r.dirtyPerFrame}`);
    console.log('  layout invalidations (node | reason) per ' + N + ' frames:'); for (const [k, v] of r.layoutInval.slice(0, 25)) console.log(`    ${v}  ${k}`);
    console.log('  style recalc invalidations:'); for (const [k, v] of r.styleInval.slice(0, 15)) console.log(`    ${v}  ${k}`);
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`wrote ${OUT}`);
