// Chrome scroll-jank probe over raw CDP (no MCP, no tracing).
// Usage: node chrome_scroll.mjs <url> <desktop|mobile> <cpuRate> <out.json>
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url = 'https://fastwork.com/', mode = 'desktop', rate = '4', out = 'chrome_scroll.json'] = process.argv.slice(2);
const PORT = 9334, PROFILE = path.join(os.tmpdir(), 'chrome-probe-profile');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
   '--window-size=1500,1000', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id: i, method, params})); })
  .then(m => { if (m.error) throw new Error(method + ': ' + m.error.message); return m.result; });
const evaluate = async (expr) => (await send('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true})).result.value;

const LOGGER = `(() => {
  const fp = window.__fp = {frames: [], loaf: []};
  let last = performance.now();
  const loop = t => { fp.frames.push([Math.round(t), Math.round((t - last) * 10) / 10, Math.round(scrollY)]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  new PerformanceObserver(l => { for (const e of l.getEntries()) fp.loaf.push({
    start: Math.round(e.startTime), dur: Math.round(e.duration), y: Math.round(scrollY),
    styleLayout: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
    scripts: e.scripts.map(s => ({type: s.invokerType, inv: String(s.invoker).slice(0, 50), src: (s.sourceURL || '').replace(/^https?:\\/\\/[^/]+/, ''), fn: s.sourceFunctionName, pos: s.sourceCharPosition, dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration)}))
  }); }).observe({type: 'long-animation-frame', buffered: true});
})();`;

await send('Page.enable'); await send('Runtime.enable');
if (mode === 'mobile') {
  await send('Emulation.setDeviceMetricsOverride', {width: 430, height: 932, deviceScaleFactor: 3, mobile: true});
  await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  await send('Emulation.setUserAgentOverride', {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
} else {
  await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
}
await send('Emulation.setCPUThrottlingRate', {rate: Number(rate)});
await send('Page.addScriptToEvaluateOnNewDocument', {source: LOGGER});
await send('Page.navigate', {url});
await sleep(8000);

const TRACE = process.env.TRACE === '1';
const traceEvents = [];
let traceDone;
if (TRACE) {
  const prev = ws.onmessage;
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.method === 'Tracing.dataCollected') traceEvents.push(...m.params.value);
    else if (m.method === 'Tracing.tracingComplete') traceDone();
    else prev(e); };
  await send('Tracing.start', {transferMode: 'ReportEvents', traceConfig: {includedCategories: [
    'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
    'blink.user_timing', 'v8.execute', 'cc', 'gpu', 'viz', 'disabled-by-default-devtools.timeline.invalidationTracking']}});
}
const result = await evaluate(`(async () => {
  const fp = window.__fp; const sleep = ms => new Promise(r => setTimeout(r, ms));
  const marks = {};
  fp.frames = []; fp.loaf = [];
  marks.idle = [performance.now()]; await sleep(3000); marks.idle.push(performance.now());
  marks.scroll = [performance.now()];
  const maxY = document.documentElement.scrollHeight - innerHeight;
  while (scrollY < maxY - 5 && performance.now() - marks.scroll[0] < 45000) { window.scrollBy({top: 250, behavior: 'smooth'}); await sleep(300); }
  marks.scroll.push(performance.now());
  marks.bottom = [performance.now()]; await sleep(3000); marks.bottom.push(performance.now());
  const secs = [...document.querySelectorAll('section, footer')].filter(e => e.offsetHeight > 100).map(e => {
    const r = e.getBoundingClientRect(); return {id: e.id, cls: String(e.className).replace(/svelte-\\w+/g, '').trim().slice(0, 40), top: Math.round(r.top + scrollY), h: Math.round(r.height)}; });
  return {marks, maxY, vw: innerWidth, vh: innerHeight, secs, frames: fp.frames, loaf: fp.loaf};
})()`);
if (TRACE) {
  const done = new Promise(r => traceDone = r);
  await send('Tracing.end'); await done;
  result.timeOriginTs = await evaluate('performance.timeOrigin');
  fs.writeFileSync(out.replace('.json', '.trace.json'), JSON.stringify({traceEvents}));
  console.log('trace events', traceEvents.length);
}
fs.writeFileSync(out, JSON.stringify(result));
console.log(`saved ${out}: frames=${result.frames.length} loaf=${result.loaf.length} maxY=${result.maxY} vw=${result.vw}`);
ws.close(); chrome.kill();
process.exit(0);
