#!/usr/bin/env node
// chrome_scroll.mjs — scripted-scroll jank probe + CPU microbenchmark runner over raw CDP.
// Node >= 22 (global WebSocket/fetch). No npm deps. Launches its OWN Chrome on its own port with a
// FRESH temporary profile per run (cold HTTP cache, no cookies/storage), then closes it and deletes
// the profile. It refuses to start if the port is already in use, so it never attaches to
// another Chrome instance.
//
// Scroll mode (default):
//   node chrome_scroll.mjs --viewport desktop|mobile --rate 4 --runs 3 --out data/chrome/desktop-4x
//     -> <out>.run1.json ... (per-run: summary + optional raw frames) and <out>.summary.json (mean/sd)
// Bench mode:
//   node chrome_scroll.mjs --bench --rates 1,2,4,6,10,20 --runs 3 --out data/chrome/bench
//     -> runs tools/cpu_bench.js on a blank standards-mode data: page at each rate
//
// Flags:
//   --url URL            page to probe (default https://fastwork.com/)
//   --viewport P         desktop (1440x900 dpr1) | mobile (430x932 dpr3, mobile+touch, iPhone UA)
//   --rate N             Emulation.setCPUThrottlingRate (1 = none)
//   --runs N             sequential runs, fresh Chrome + profile each (default 1)
//   --out PREFIX         output path prefix (default ./chrome_scroll)
//   --port N             remote-debugging port (default 9335)
//   --scroll-cap-ms N    stop the scroll phase after N ms (default 60000); reported as scroll.capped
//   --load-timeout-ms N  max wait for the load event (default 120000)
//   --no-frames          do not embed raw frame / LoAF arrays in per-run JSON
//   --trace              (or TRACE=1) record a lightweight trace of idle+scroll+bottom to --trace-dir
//   --trace-dir DIR      where raw traces go (default: $SCRATCH or os.tmpdir())
//   --bench, --rates     see above
//
// Scroll script semantics (keep identical to the iPhone side for comparability):
//   wait for load event, +8 s; then 3 s idle; then every 300 ms window.scrollBy({top:250,behavior:'smooth'})
//   until scrollY >= maxY-5 (maxY = scrollHeight-innerHeight measured at scroll start); then 3 s at bottom.
//   A rAF loop logs [t, dt, scrollY] per frame; a PerformanceObserver logs long-animation-frame entries.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------- args ----------------
const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf('--' + name); if (i < 0) return def; const v = argv[i + 1]; return (v === undefined || v.startsWith('--')) ? true : v; };
const URL_ = flag('url', 'https://fastwork.com/');
const VIEWPORT = flag('viewport', 'desktop');
const RATE = Number(flag('rate', '1'));
const RUNS = Number(flag('runs', '1'));
const OUT = flag('out', './chrome_scroll');
const PORT = Number(flag('port', '9335'));
const SCROLL_CAP = Number(flag('scroll-cap-ms', '60000'));
const LOAD_TIMEOUT = Number(flag('load-timeout-ms', '120000'));
const KEEP_FRAMES = !argv.includes('--no-frames');
const TRACE = argv.includes('--trace') || process.env.TRACE === '1';
const TRACE_DIR = flag('trace-dir', process.env.SCRATCH || os.tmpdir());
const BENCH = argv.includes('--bench');
const RATES = String(flag('rates', '1,2,4,6,10,20')).split(',').map(Number);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BENCH_SRC = path.join(HERE, 'cpu_bench.js');

const VIEWPORTS = {
  desktop: {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false},
  mobile: {width: 430, height: 932, deviceScaleFactor: 3, mobile: true, touch: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'},
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------- chrome / cdp ----------------
async function portInUse(port) {
  try { await fetch(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(500)}); return true; } catch { return false; }
}

async function launchChrome() {
  if (await portInUse(PORT)) throw new Error(`port ${PORT} already in use — refusing to attach to a foreign Chrome`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-calib-profile-'));
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    '--disable-background-networking', '--disable-component-update',
    // keep rAF/timers running even if the window gets occluded by other windows
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--window-size=1500,1000', '--window-position=40,40', 'about:blank'], {stdio: 'ignore'});
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); }
  }
  if (!targets) { proc.kill('SIGKILL'); throw new Error('chrome did not start'); }
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const page = targets.find(t => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  const close = async () => {
    try { const b = await connect(version.webSocketDebuggerUrl); await Promise.race([b.send('Browser.close'), sleep(3000)]); b.ws.close(); } catch {}
    cdp.ws.close();
    const exited = await Promise.race([new Promise(r => proc.once('exit', () => r(true))), sleep(5000).then(() => proc.exitCode !== null)]);
    if (!exited) proc.kill('SIGKILL');
    await sleep(500);
    fs.rmSync(profile, {recursive: true, force: true});
  };
  return {cdp, close, version: version.Browser};
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(); const listeners = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method) for (const fn of listeners.get(m.method) || []) fn(m.params);
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id: i, method, params})); })
    .then(m => { if (m.error) throw new Error(method + ': ' + m.error.message); return m.result; });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  const once = (method, timeout) => new Promise(r => { let done = false; on(method, p => { if (!done) { done = true; r(p); } }); if (timeout) setTimeout(() => { if (!done) { done = true; r(null); } }, timeout); });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (res.exceptionDetails) throw new Error('evaluate: ' + JSON.stringify(res.exceptionDetails).slice(0, 500));
    return res.result.value;
  };
  return {ws, send, on, once, evaluate};
}

// ---------------- in-page code ----------------
const LOGGER = `(() => {
  const fp = window.__fp = {frames: [], loaf: []};
  let last = performance.now();
  const loop = t => { fp.frames.push([Math.round(t), Math.round((t - last) * 10) / 10, Math.round(scrollY)]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) fp.loaf.push({
    start: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), y: Math.round(scrollY),
    styleLayout: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
    scripts: e.scripts.map(s => ({type: s.invokerType, inv: String(s.invoker).slice(0, 60), src: (s.sourceURL || '').replace(/^https?:\\/\\/[^/]+/, ''), fn: s.sourceFunctionName, pos: s.sourceCharPosition, dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration)}))
  }); }).observe({type: 'long-animation-frame', buffered: true}); } catch (e) {}
})();`;

const SCROLL = (cap) => `(async () => {
  const fp = window.__fp; const sleep = ms => new Promise(r => setTimeout(r, ms));
  const marks = {};
  fp.frames = []; fp.loaf = [];
  performance.mark('phase:idle');
  marks.idle = [performance.now()]; await sleep(3000); marks.idle.push(performance.now());
  performance.mark('phase:scroll');
  marks.scroll = [performance.now()];
  const maxY = document.documentElement.scrollHeight - innerHeight;
  let steps = 0, capped = false;
  while (scrollY < maxY - 5) {
    if (performance.now() - marks.scroll[0] >= ${cap}) { capped = true; break; }
    window.scrollBy({top: 250, behavior: 'smooth'}); steps++; await sleep(300);
  }
  marks.scroll.push(performance.now());
  performance.mark('phase:bottom');
  marks.bottom = [performance.now()]; await sleep(3000); marks.bottom.push(performance.now());
  performance.mark('phase:end');
  const secs = [...document.querySelectorAll('section, footer')].filter(e => e.offsetHeight > 100).map(e => {
    const r = e.getBoundingClientRect(); return {id: e.id, cls: String(e.className).replace(/svelte-\\w+/g, '').trim().slice(0, 40),
      h2: (e.querySelector('h1,h2,h3')?.textContent || '').trim().slice(0, 40), top: Math.round(r.top + scrollY), h: Math.round(r.height)}; });
  return {marks, maxY, steps, capped, finalY: Math.round(scrollY), scrollHeight: document.documentElement.scrollHeight,
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, secs, frames: fp.frames, loaf: fp.loaf};
})()`;

// ---------------- metrics ----------------
const r1 = x => Math.round(x * 10) / 10;
const pct = (s, p) => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
function frameStats(fr, t0, t1) {
  const d = fr.map(f => f[1]).sort((a, b) => a - b);
  const dur = t1 - t0;
  return {
    duration_ms: Math.round(dur), frames: d.length, fps: r1(d.length / (dur / 1000)),
    median_ms: r1(pct(d, 0.5)), p95_ms: r1(pct(d, 0.95)), p99_ms: r1(pct(d, 0.99)), max_ms: r1(d.at(-1) || 0),
    gt20: d.filter(x => x > 20).length, gt34: d.filter(x => x > 34).length, gt50: d.filter(x => x > 50).length, gt100: d.filter(x => x > 100).length,
    smooth_pct: d.length ? r1(100 * d.filter(x => x <= 20).length / d.length) : 0,          // frames that met a 60 Hz budget (+tolerance)
    jank_ms: Math.round(d.reduce((s, x) => s + Math.max(0, x - 16.7), 0)),                     // time beyond a 60 Hz budget
    time_in_gt50_ms: Math.round(d.filter(x => x > 50).reduce((s, x) => s + x, 0)),
  };
}
function loafStats(lo) {
  return {count: lo.length, total_ms: lo.reduce((s, l) => s + l.dur, 0), blocking_ms: lo.reduce((s, l) => s + l.block, 0),
    max_ms: lo.reduce((m, l) => Math.max(m, l.dur), 0), styleLayout_ms: lo.reduce((s, l) => s + l.styleLayout, 0)};
}
function topScripts(lo, n = 12) {
  const agg = new Map();
  for (const l of lo) for (const s of l.scripts) {
    const k = `${s.src}|${s.fn}|${s.pos}|${s.type}`;
    const a = agg.get(k) || {src: s.src, fn: s.fn, pos: s.pos, type: s.type, inv: s.inv, count: 0, dur_ms: 0, forced_ms: 0, max_ms: 0};
    a.count++; a.dur_ms += s.dur; a.forced_ms += s.forced; a.max_ms = Math.max(a.max_ms, s.dur); agg.set(k, a);
  }
  return [...agg.values()].sort((a, b) => b.dur_ms - a.dur_ms).slice(0, n);
}
function sectionOf(secs, y, vh) {
  const c = y + vh / 2; let best = null;
  for (const s of secs) if (c >= s.top && c < s.top + s.h) { if (!best || s.h < best.h) best = s; } // innermost
  return best ? (best.id || best.h2 || best.cls || `@${best.top}`) : '(none)';
}
function summarize(raw) {
  const {marks, frames, loaf, secs, vh} = raw;
  const phases = {};
  for (const ph of ['idle', 'scroll', 'bottom']) {
    const [a, b] = marks[ph];
    const fr = frames.filter(f => f[0] >= a && f[0] <= b);
    const lo = loaf.filter(l => l.start >= a && l.start <= b);
    phases[ph] = {...frameStats(fr, a, b), loaf: loafStats(lo), topScripts: topScripts(lo, 8)};
  }
  // per-section jank during scroll phase (section = the one under the viewport centre)
  const [a, b] = marks.scroll;
  const bySec = new Map();
  const top = secs.filter(s => s.h < 20000);
  for (const f of frames) if (f[0] >= a && f[0] <= b) {
    const k = sectionOf(top, f[2], vh);
    const s = bySec.get(k) || {section: k, frames: 0, gt34: 0, gt50: 0, gt100: 0, max_ms: 0, jank_ms: 0, loaf: 0, loaf_ms: 0};
    s.frames++; if (f[1] > 34) s.gt34++; if (f[1] > 50) s.gt50++; if (f[1] > 100) s.gt100++;
    s.max_ms = Math.max(s.max_ms, f[1]); s.jank_ms += Math.max(0, f[1] - 16.7); bySec.set(k, s);
  }
  for (const l of loaf) if (l.start >= a && l.start <= b) {
    const k = sectionOf(top, l.y, vh); const s = bySec.get(k); if (s) { s.loaf++; s.loaf_ms += l.dur; }
  }
  const sections = [...bySec.values()].map(s => ({...s, jank_ms: Math.round(s.jank_ms)}));
  const whole = loaf.filter(l => l.start >= marks.idle[0] && l.start <= marks.bottom[1]);
  return {phases, sections, topScriptsAll: topScripts(whole, 15),
    scroll: {steps: raw.steps, capped: raw.capped, maxY: raw.maxY, finalY: raw.finalY, scrollHeight: raw.scrollHeight}};
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : 0;
function aggregate(sums) {
  const out = {};
  for (const ph of ['idle', 'scroll', 'bottom']) {
    out[ph] = {};
    for (const k of ['duration_ms', 'fps', 'median_ms', 'p95_ms', 'p99_ms', 'max_ms', 'gt20', 'gt34', 'gt50', 'gt100', 'smooth_pct', 'jank_ms', 'time_in_gt50_ms']) {
      const v = sums.map(s => s.phases[ph][k]); out[ph][k] = {mean: r1(mean(v)), sd: r1(sd(v)), values: v};
    }
    for (const k of ['count', 'total_ms', 'blocking_ms', 'max_ms', 'styleLayout_ms']) {
      const v = sums.map(s => s.phases[ph].loaf[k]); out[ph]['loaf_' + k] = {mean: r1(mean(v)), sd: r1(sd(v)), values: v};
    }
  }
  return out;
}

// ---------------- runs ----------------
async function scrollRun(runIdx) {
  const vp = VIEWPORTS[VIEWPORT]; if (!vp) throw new Error('unknown viewport ' + VIEWPORT);
  const {cdp, close, version} = await launchChrome();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile});
    if (vp.touch) await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
    if (vp.ua) await cdp.send('Emulation.setUserAgentOverride', {userAgent: vp.ua});
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: RATE});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source: LOGGER});
    const loaded = cdp.once('Page.loadEventFired', LOAD_TIMEOUT);
    const tNav = Date.now();
    await cdp.send('Page.navigate', {url: URL_});
    const lp = await loaded;
    const loadMs = Date.now() - tNav;
    log(`  run ${runIdx}: load ${lp ? loadMs + 'ms' : 'TIMEOUT'}; settle 8s`);
    await sleep(8000);

    let traceFile = null, traceDone = null, traceStream = null, nEvents = 0;
    if (TRACE) {
      traceFile = path.join(TRACE_DIR, `${path.basename(OUT)}.run${runIdx}.trace.json`);
      traceStream = fs.createWriteStream(traceFile); traceStream.write('{"traceEvents":[');
      let first = true;
      cdp.on('Tracing.dataCollected', p => { for (const ev of p.value) { traceStream.write((first ? '' : ',\n') + JSON.stringify(ev)); first = false; nEvents++; } });
      traceDone = cdp.once('Tracing.tracingComplete');
      await cdp.send('Tracing.start', {transferMode: 'ReportEvents', traceConfig: {includedCategories: [
        'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
        'blink.user_timing', 'v8.execute', 'cc', 'gpu', 'viz', 'toplevel']}});
    }
    const t0 = Date.now();
    const raw = await cdp.evaluate(SCROLL(SCROLL_CAP));
    const wallMs = Date.now() - t0;
    if (TRACE) {
      await cdp.send('Tracing.end'); await traceDone;
      traceStream.write(']}'); await new Promise(r => traceStream.end(r));
      log(`  trace: ${nEvents} events -> ${traceFile}`);
    }
    const summary = summarize(raw);
    const res = {
      meta: {tool: 'chrome_scroll.mjs', url: URL_, viewport: VIEWPORT, vp, rate: RATE, run: runIdx, chrome: version,
        host: `${os.cpus()[0].model} x${os.cpus().length}`, date: new Date().toISOString(), loadMs: lp ? loadMs : null,
        scrollCapMs: SCROLL_CAP, wallMs, profile: 'fresh temp profile per run (cold cache)', traceFile,
        page: {vw: raw.vw, vh: raw.vh, dpr: raw.dpr, ua: raw.ua}},
      marks: raw.marks, secs: raw.secs, ...summary,
    };
    if (KEEP_FRAMES) { res.frames = raw.frames; res.loaf = raw.loaf; }
    return res;
  } finally { await close(); }
}

async function benchRun(rate, runIdx) {
  const {cdp, close, version} = await launchChrome();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    const vp = VIEWPORTS[VIEWPORT];
    await cdp.send('Emulation.setDeviceMetricsOverride', {width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile});
    const loaded = cdp.once('Page.loadEventFired', 10000);
    await cdp.send('Page.navigate', {url: 'data:text/html,<!doctype html><meta charset=utf-8><title>bench</title><body></body>'});
    await loaded; await sleep(1500);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate});
    await sleep(500);
    const r = await cdp.evaluate(fs.readFileSync(BENCH_SRC, 'utf8'));
    return {rate, run: runIdx, chrome: version, ...r};
  } finally { await close(); }
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), {recursive: true});
if (BENCH) {
  const all = [];
  for (const rate of RATES) for (let i = 1; i <= RUNS; i++) {
    const r = await benchRun(rate, i); all.push(r);
    log(`bench rate ${rate} run ${i}: total ${r.total_ms}ms ` + Object.entries(r.results).map(([k, v]) => `${k}=${v.median_ms}`).join(' '));
  }
  const curve = RATES.map(rate => {
    const rs = all.filter(r => r.rate === rate); const o = {rate};
    for (const k of ['total_ms', 'geomean_ms']) { const v = rs.map(r => r[k]); o[k] = {mean: r1(mean(v)), sd: r1(sd(v)), values: v}; }
    for (const b of Object.keys(rs[0].results)) { const v = rs.map(r => r.results[b].median_ms); o[b] = {mean: r1(mean(v)), sd: r1(sd(v)), values: v}; }
    return o;
  });
  fs.writeFileSync(OUT + '.json', JSON.stringify({meta: {tool: 'chrome_scroll.mjs --bench', viewport: VIEWPORT, runs: RUNS, date: new Date().toISOString()}, curve, runs: all}, null, 1));
  log('saved', OUT + '.json');
} else {
  const sums = [];
  for (let i = 1; i <= RUNS; i++) {
    log(`scroll ${VIEWPORT} rate ${RATE} run ${i}/${RUNS}`);
    const r = await scrollRun(i);
    fs.writeFileSync(`${OUT}.run${i}.json`, JSON.stringify(r));
    const s = r.phases.scroll;
    log(`  scroll: ${s.fps}fps med ${s.median_ms} p95 ${s.p95_ms} max ${s.max_ms} >50:${s.gt50} >100:${s.gt100} loaf ${s.loaf.count}/${s.loaf.total_ms}ms steps ${r.scroll.steps}${r.scroll.capped ? ' CAPPED' : ''}`);
    delete r.frames; delete r.loaf; sums.push(r);
  }
  fs.writeFileSync(`${OUT}.summary.json`, JSON.stringify({meta: {...sums[0].meta, run: undefined, runs: RUNS}, aggregate: aggregate(sums), runs: sums}, null, 1));
  log('saved', `${OUT}.summary.json`);
}
process.exit(0);
