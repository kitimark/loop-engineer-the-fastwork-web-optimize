#!/usr/bin/env node
// A fake "Chrome" for the default test suite: speaks just enough of the DevTools protocol over a
// hand-rolled WebSocket server (no deps) for tools/lib/cdp.mjs + tools/verify.mjs to run end to end.
// Used via $CHROME (tools/lib/cdp.mjs chromePath()). It never loads pages: Runtime.evaluate answers
// are canned by recognising the expressions verify.mjs sends, with deterministic frame/LoAF data, so
// the summaries in verify's result JSON can be checked exactly.
//
// Env: FAKE_CHROME_LOG=<file>  append one JSON line per CDP command ({pid, method, params, sessionId})
//      FAKE_CHROME_CRASH_AT=<method>  exit abruptly (no reply) when this CDP method arrives, like a browser crash
//      FAKE_CHROME_HANG_AT=<method>   never answer this CDP method (a hung browser; verify's watchdog, I-023)
//      FAKE_CHROME_EXIT_AFTER=<method>  answer it, then exit at the next command (a browser gone between runs, I-023)
//      FAKE_CHROME_IGNORE_SIGTERM=1     ignore SIGTERM (a browser that will not quit; close() must SIGKILL it)
//      FAKE_CHROME_APPEND_AT=<method> FAKE_CHROME_APPEND_FILE=<file>  append a line to <file> when this method
//                                       first arrives (a re-mirror of the baseline in the middle of a run)
//      FAKE_CHROME_TRACE=nocomplete,dataloss,bigchunk  Tracing.end: never send tracingComplete | report
//                                       dataLossOccurred | add one chunk of BIG_CHUNK events
//      FAKE_CHROME_PAINT=none          --paint-rects: LayerTree enabled, but no layerPainted events (I-032)
//      FAKE_CHROME_PAINT=count         --paint-rects as Chrome 148+: no layerPainted; every list carries paintCount
//      FAKE_CHROME_LAYER_SCALE=2,1     --paint-rects: the host DSF read before emulation, the next value per read
//                                       (cycled; default 2): runs at different layer scales (I-032 review B1)
//      FAKE_CHROME_METRICS=step         Performance.getMetrics: all of verify's counters (+ Timestamp) grow by
//                                       METRIC_STEP per read (I-018); default: the bench per-session six
//      FAKE_CHROME_BENCH=1  tools/bench.mjs mode: on Page.navigate, fetch <origin>/bench-fake.json from the
//        served page (so the baseline and the overlay can differ) and answer the bench probes from it:
//        {windows: {label: {probeId: n}}, probes: {probe: n} (any window), frames, snapshot, capped, errors, listeners, metricsStep: {name: n},
//         quiesceMs: n (each quiesce() answers after n ms, a slow page for the short-lane budget),
//         perfFrames: [dt] (the frame log a Tier B scenario collects, default FRAMES/IDLE_FRAMES; [null] makes
//         its p95 null, a non-finite gain metric, I-034)}
//      FAKE_CHROME_HEADLESS=1|0  the User-Agent of /json/version says HeadlessChrome (1) or Chrome (0); default: HeadlessChrome
//        exactly when launched with --headless=new, as a real Chrome (ts-headless; a $CHROME wrapper adding the flag = 1)
//      FAKE_CHROME_CHECK=1  tools/check.mjs mode: on Page.navigate, fetch <origin>/check-fake.json from the served page
//        and play it into the page: {errors: [text] (Runtime.exceptionThrown), logErrors: [text] (Log.entryAdded),
//        notFound: [path] (a first-party request answered 404), nav: <className> (the nav after the morph gestures)}
// The (started) line logs the launch argv (params.argv): the tests pin what a headed or headless launch passes.
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const port = Number(arg('remote-debugging-port') || 0);
const profile = arg('user-data-dir');
const LOG = process.env.FAKE_CHROME_LOG;
const HEADLESS = process.env.FAKE_CHROME_HEADLESS === '1' || (process.env.FAKE_CHROME_HEADLESS !== '0' && process.argv.includes('--headless=new'));
export const FAKE_UA = (headless) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ${headless ? 'HeadlessChrome' : 'Chrome'}/1.0.0.0 Safari/537.36`;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify({ pid: process.pid, t: Date.now(), ...o }) + '\n'); };

// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const FRAMES = [...Array(50).fill(16.7), 25, 40, 60, 120];
export const LOAF = [{ start: 100, duration: 120, blocking: 70, render: 30, styleLayout: 20,
  scripts: [{ url: 'http://localhost:1234/_app/immutable/nodes/2.fixture.js', fn: 'tick', pos: 10, invoker: 'FrameRequestCallback', type: 'user-callback', dur: 80, forced: 25, pause: 0 }] }];
// Returned instead of FRAMES/LOAF when a recording saw no input (no scroll script, no Input.* event)
// between its reset and its read-out, i.e. verify.mjs's idle phase.
export const IDLE_FRAMES = [...Array(100).fill(16.7), 30, 55];
export const IDLE_LOAF = [{ start: 50, duration: 55, blocking: 5, render: 10, styleLayout: 8,
  scripts: [{ url: 'http://localhost:1234/_app/immutable/nodes/2.fixture.js', fn: 'spring', pos: 42, invoker: 'FrameRequestCallback', type: 'user-callback', dur: 40, forced: 6, pause: 0 }] }];
let input = false; // any scroll script / Input.* event since the last recorder reset?
let frameLog = false; // the injected logger keeps [t, dt, scrollY] (verify.mjs --frame-log)
// Performance.getMetrics: cumulative counters that grow by one STEP per call, so every phase delta
// (one read at its start, one at its end) is exactly STEP (durations in s, as Chrome reports them).
export const METRIC_STEP = { ScriptDuration: 0.05, RecalcStyleDuration: 0.02, LayoutDuration: 0.01, TaskDuration: 0.2, RecalcStyleCount: 5, LayoutCount: 3, V8CompileDuration: 0.004, DevToolsCommandDuration: 0.001 };
let metricCalls = 0;
import { TRACE_TS, TRACE_EVENTS, TRACE_SYNC, TRACE_WINDOW, BIG_CHUNK } from './trace-fixture.mjs'; // --trace-frames: rAF timestamps + a synthetic trace

// ---- verify.mjs --paint-rects (I-032): LayerTree events + the per-frame binding --------------------------
// Every recording phase gets t0 = 10000 * n (RESET n). When the binding recorder is armed, a phase's read-out
// (COLLECT) first sends, as notifications, what the page would have sent during the phase: the layer list
// back to PAINT_LAYERS, then frames at t0+5, +21.7 (one paint of L1), +61.7 (a 40 ms frame: a 5th layer
// appears, L2 and L1 paint) and +78.4 with the logger already off (its paint L1 belongs to no phase).
// FAKE_CHROME_PAINT=count (as Chrome 148+): the same paints raise per-layer paintCounts instead, and a layer list
// with the counts follows each painting interval (the new L3 is listed with paintCount 1).
export const PAINT_LAYERS = [{ layerId: 'L0', width: 1290, height: 2796, backendNodeId: 1, drawsContent: true }, { layerId: 'L1', width: 1290, height: 300, backendNodeId: 2, drawsContent: true },
  { layerId: 'L2', width: 1290, height: 900, backendNodeId: 3, drawsContent: true }];
export const PAINT_NODES = { 1: { nodeName: 'HTML', localName: 'html', attributes: [] }, 2: { nodeName: 'NAV', localName: 'nav', attributes: ['class', 'start-selling-top-nav svelte-abc12'] },
  3: { nodeName: 'SECTION', localName: 'section', attributes: ['id', 'hero', 'class', 'hero svelte-x9 is-on'] } };
const PAINT_BINDING = '__fwPaintFrame';
let resets = 0, phaseT0 = 0, paintArmed = false, paintOn = false;
const COUNT = process.env.FAKE_CHROME_PAINT === 'count';
const LAYER_SCALES = (process.env.FAKE_CHROME_LAYER_SCALE || '2').split(',').map(Number);
let scaleReads = 0;
const paintCounts = { L0: 1, L1: 1, L2: 1 };
const L3 = { layerId: 'L3', width: 600, height: 600, backendNodeId: 4, drawsContent: true };
const layerList = (ls) => (COUNT ? ls.map((l) => ({ ...l, paintCount: paintCounts[l.layerId] ?? 1 })) : ls);
function paintPhase(event) {
  if (!paintArmed || !paintOn) return;
  const t0 = phaseT0, f = (t, on) => event('Runtime.bindingCalled', { name: PAINT_BINDING, payload: JSON.stringify([t0 + t, on, t0]), executionContextId: 1 });
  const paint = (id, width, height) => {
    if (COUNT) paintCounts[id] = (paintCounts[id] ?? 1) + 1;
    else if (process.env.FAKE_CHROME_PAINT !== 'none') event('LayerTree.layerPainted', { layerId: id, clip: { x: 0, y: 0, width, height } });
  };
  const list = (ls) => event('LayerTree.layerTreeDidChange', { layers: layerList(ls) });
  delete paintCounts.L3; // L3 leaves the list at the phase start and comes back as a new layer
  list(PAINT_LAYERS);
  f(5, true); paint('L1', 1290, 300); if (COUNT) list(PAINT_LAYERS);
  f(21.7, true);
  if (!COUNT) list([...PAINT_LAYERS, L3]);
  paint('L2', 1290, 900); paint('L1', 1290, 300); if (COUNT) list([...PAINT_LAYERS, L3]);
  f(61.7, true); paint('L1', 1290, 300); if (COUNT) list([...PAINT_LAYERS, L3]);
  f(78.4, false);
}

// ---- tools/bench.mjs mode (FAKE_CHROME_BENCH=1) ------------------------------------------------------
const BENCH = process.env.FAKE_CHROME_BENCH === '1';
const bench = new Map(); // sessionId -> {data, metrics}
function fetchJson(url) {
  return new Promise((res) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, headers: { 'accept-encoding': 'identity' } }, (r) => {
      const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => { try { res(r.statusCode === 200 ? JSON.parse(Buffer.concat(c).toString()) : {}); } catch { res({}); } });
    });
    req.on('error', () => res({}));
  });
}
function benchEvaluate(expr, sessionId) {
  const st = bench.get(sessionId) || { data: {} };
  const d = st.data;
  let m;
  if ((m = expr.match(/^window\.__bench\.reset\((.*)\)$/))) return true;
  if ((m = expr.match(/^window\.__bench\.read\((.*)\)$/))) { const label = JSON.parse(m[1]); const topic = label.split(':')[0]; return { label, counts: (d.windows || {})[label] || Object.fromEntries(Object.entries(d.probes || {}).map(([k, v]) => [`${topic}:${k}`, v])), frames: d.frames ?? 60, errors: [] }; }
  if (expr.startsWith('window.__bench.quiesce(')) return { frames: 2, capped: !!d.capped };
  if (expr.includes('function benchGeometry')) {
    const g = JSON.parse(expr.slice(expr.lastIndexOf('})(') + 3, -1));
    return { maxY: 2000, innerHeight: 900, segments: Object.fromEntries(Object.keys(g.segments || {}).map((k) => [k, { start: 0, end: 300 }])), spots: Object.fromEntries(Object.keys(g.spots || {}).map((k) => [k, { y: 0 }])) };
  }
  if (expr.includes('function benchSnapshot')) return d.snapshot || {};
  if (expr.includes('function benchSettle')) return { pendingImages: 0 };
  if (expr.startsWith('window.__bench ? window.__bench.errors')) return d.errors || [];
  if (d.perfFrames && expr.includes('p.on = false')) return { frames: d.perfFrames, loaf: [], on: false };
  return undefined;
}

// ---- tools/check.mjs mode (FAKE_CHROME_CHECK=1) ------------------------------------------------------
const CHECK = process.env.FAKE_CHROME_CHECK === '1';
const checkData = new Map(); // sessionId -> check-fake.json
function checkEvaluate(expr, sessionId) {
  const d = checkData.get(sessionId) || {};
  // the nav after the morph gestures (not verify's state probe, which reads the same className among others)
  if (d.nav !== undefined && expr.includes("document.querySelector('.start-selling-top-nav')?.className") && !expr.includes('kit: Object.keys(window)')) return d.nav;
  return undefined;
}

function evaluate(expr, event) {
  // tools/check.mjs: the host screen before emulation (--screen-info), the DOM fingerprint, the stepped walk (first: their bodies
  // contain substrings the verify.mjs answers below match)
  if (expr.includes('__fwCheckPre')) return { dpr: 2, screen: [1512, 982], ua: FAKE_UA(HEADLESS) };
  if (expr.includes('__fwCheckDom')) return { elements: 42, tokens: ['div.orbit', 'main.hero', 'nav.start-selling-top-nav'] };
  if (expr.includes('__fwCheckWalk')) return { y: 2068, maxY: 2068, h: 3000, steps: 7 };
  if (expr.includes('kit: Object.keys(window)')) return { kit: ['__sveltekit_fake'], nav: 'start-selling-top-nav', hero: 'hero', h: 3000, shim: null, vendors: { gtag: 'undefined', amplitude: 'undefined', hj: 'undefined', dataLayer: 1 } };
  if (expr.includes('window.__perf.frames.length=0')) { input = false; phaseT0 = 10000 * ++resets; return true; }
  if (expr.includes('window.__fwPaintScale = devicePixelRatio')) return LAYER_SCALES[scaleReads++ % LAYER_SCALES.length]; // the host DSF before emulation (layer px = CSS px x 2)
  if (expr.includes('if (window.__fwPaint) return false')) { paintArmed = paintOn = true; return true; }
  if (expr.includes('const S = window.__fwPaint; if (S) S.on = false')) { const was = paintArmed; paintOn = false; return { armed: was, w: 430, h: 932, dpr: 3 }; }
  if (expr.includes("window.scrollBy({ top: 250, behavior: 'smooth' })") && expr.includes('still >= 4')) { input = true; return { ms: 5000, ticks: 16, y: 2068, h: 3000 }; }
  if (expr.includes("performance.mark('__fw_trace_sync')")) return TRACE_SYNC;
  if (expr.includes('window.__fwTrace; S.on = false')) return { ts: TRACE_TS, ...TRACE_WINDOW };
  if (expr.includes('p.on = false')) {
    paintPhase(event);
    const fr = input ? FRAMES : IDLE_FRAMES;
    const r = input ? { frames: FRAMES, loaf: LOAF, on: false, t0: phaseT0 } : { frames: IDLE_FRAMES, loaf: IDLE_LOAF, on: false, t0: phaseT0 };
    // frame log: t from 1000 ms on, scrollY 10 px per frame while scrolling (0 when idle)
    if (frameLog) { let t = 1000; r.log = fr.map((dt, i) => { t += dt; return [Math.round(t * 10) / 10, dt, input ? 10 * (i + 1) : 0]; }); }
    return expr.includes('o.scrollY = scrollY') ? { ...r, scrollY: input ? 2068 : 0 } : r;
  }
  if (expr.includes("document.querySelector('.start-selling-top-nav')?.className")) return 'start-selling-top-nav is-morph';
  if (expr.includes('document.documentElement.scrollHeight - innerHeight')) return 2068;
  if (expr.includes('OffscreenCanvas')) return { w: 430, h: 932, diffPct: 0.12 };
  if (expr.includes('__mirrorVendorShim ? {')) return null;
  return undefined;
}

let n = 0, dying = false, appended = false;
function handle(msg, send) {
  const { id, method, params = {}, sessionId } = msg;
  log({ method, params: method === 'Runtime.evaluate' ? { expression: params.expression.slice(0, 120) } : params, sessionId });
  if (process.env.FAKE_CHROME_CRASH_AT === method) { log({ method: '(crash)', params: {} }); process.exit(1); }
  if (process.env.FAKE_CHROME_HANG_AT === method) { log({ method: '(hang)', params: {} }); return; } // never answers
  if (process.env.FAKE_CHROME_APPEND_AT === method && !appended) { appended = true; appendFileSync(process.env.FAKE_CHROME_APPEND_FILE, '\n// changed mid-run\n'); log({ method: '(append)', params: {} }); }
  // FAKE_CHROME_EXIT_AFTER: answer that method, then exit (unanswered) at the next command, like a browser
  // that went away between runs; deterministic, unlike a timer racing verify's next call
  if (dying) { log({ method: '(exit-after)', params: {} }); process.exit(0); }
  if (process.env.FAKE_CHROME_EXIT_AFTER === method) dying = true;
  const reply = (result) => send({ id, result, ...(sessionId ? { sessionId } : {}) });
  const event = (m, p) => send({ method: m, params: p, sessionId });
  if (method.startsWith('Input.')) input = true;
  switch (method) {
    case 'Target.createBrowserContext': return reply({ browserContextId: `ctx${++n}` });
    case 'Target.createTarget': return reply({ targetId: `target${++n}` });
    case 'Target.attachToTarget': return reply({ sessionId: `session${++n}` });
    case 'Page.captureScreenshot': return reply({ data: PNG });
    case 'Browser.getVersion': return reply({ product: 'FakeChrome/1.0' });
    case 'Page.addScriptToEvaluateOnNewDocument': frameLog = params.source.includes('S.log.push'); return reply({ identifier: '1' });
    case 'Performance.getMetrics': {
      if (process.env.FAKE_CHROME_METRICS !== 'step') { // tools/bench.mjs and lib/cdp.mjs helpers: per-session steps from the page data
        const st = bench.get(sessionId) || { data: {} };
        st.calls = (st.calls || 0) + 1;
        const step = st.data.metricsStep || {};
        return reply({ metrics: ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map((name) => ({ name, value: st.calls * (step[name] || 0) })) });
      }
      // FAKE_CHROME_METRICS=step (verify.mjs tests, I-018): every counter grows by METRIC_STEP per read
      metricCalls++;
      return reply({ metrics: [{ name: 'Timestamp', value: 1000 + metricCalls }, ...Object.entries(METRIC_STEP).map(([name, v]) => ({ name, value: Math.round(v * metricCalls * 1e6) / 1e6 }))] });
    }
    case 'LayerTree.enable': reply({}); return event('LayerTree.layerTreeDidChange', { layers: layerList(PAINT_LAYERS) });
    case 'LayerTree.compositingReasons': return reply({ compositingReasons: ['will-change'], compositingReasonIds: [`willChange:${params.layerId}`] });
    case 'DOM.describeNode': return PAINT_NODES[params.backendNodeId] ? reply({ node: { backendNodeId: params.backendNodeId, ...PAINT_NODES[params.backendNodeId] } }) : send({ id, error: { code: -32000, message: 'No node found' }, ...(sessionId ? { sessionId } : {}) });
    case 'DOMDebugger.getEventListeners': return reply({ listeners: (bench.get(sessionId)?.data.listeners) || [] });
    case 'Tracing.start': reply({}); return event('Tracing.bufferUsage', { percentFull: 0.123, eventCount: 42 });
    case 'Tracing.end': {
      reply({});
      // FAKE_CHROME_TRACE (comma list): nocomplete: the events, but never tracingComplete; dataloss: complete
      // with data loss; bigchunk: plus one chunk of BIG_CHUNK metadata events (more than a spread push takes)
      const mode = (process.env.FAKE_CHROME_TRACE || '').split(',');
      setTimeout(() => {
        event('Tracing.dataCollected', { value: TRACE_EVENTS.slice(0, 5) }); event('Tracing.dataCollected', { value: TRACE_EVENTS.slice(5) });
        if (mode.includes('bigchunk')) event('Tracing.dataCollected', { value: Array.from({ length: BIG_CHUNK }, () => ({ ph: 'M', name: 'x', pid: 9, tid: 9 })) });
        if (!mode.includes('nocomplete')) event('Tracing.tracingComplete', { dataLossOccurred: mode.includes('dataloss') });
      }, 10);
      return;
    }
    case 'Runtime.evaluate': {
      if (params.returnByValue === false) return reply({ result: { type: 'object', objectId: `obj${++n}` } });
      const v = (BENCH ? benchEvaluate(params.expression, sessionId) : undefined) ?? (CHECK ? checkEvaluate(params.expression, sessionId) : undefined) ?? evaluate(params.expression, event);
      const wait = BENCH && params.expression.startsWith('window.__bench.quiesce(') ? bench.get(sessionId)?.data.quiesceMs : 0;
      if (wait) return void setTimeout(() => reply({ result: { type: typeof v, value: v } }), wait);
      return reply({ result: v === undefined ? { type: 'undefined' } : { type: typeof v, value: v } });
    }
    case 'Page.navigate': {
      reply({ frameId: 'frame' });
      const u = params.url;
      const ready = BENCH ? fetchJson(new URL('/bench-fake.json', u).href).then((data) => { bench.set(sessionId, { data }); log({ method: '(bench-fake)', params: { url: u, data } , sessionId }); })
        : CHECK ? fetchJson(new URL('/check-fake.json', u).href).then((data) => { checkData.set(sessionId, data); log({ method: '(check-fake)', params: { url: u, data }, sessionId }); }) : Promise.resolve();
      ready.then(() => setTimeout(() => {
        event('Network.requestWillBeSent', { requestId: 'r1', request: { url: u, method: 'GET' }, type: 'Document' });
        event('Network.responseReceived', { requestId: 'r1', response: { status: 200 } });
        event('Network.requestWillBeSent', { requestId: 'r2', request: { url: new URL('/_app/immutable/nodes/2.fixture.js', u).href, method: 'GET' }, type: 'Script' });
        event('Network.responseReceived', { requestId: 'r2', response: { status: 200 } });
        event('Network.loadingFinished', { requestId: 'r2' });
        const cd = CHECK ? checkData.get(sessionId) || {} : {};
        (cd.notFound || []).forEach((p, i) => {
          event('Network.requestWillBeSent', { requestId: `nf${i}`, request: { url: new URL(p, u).href, method: 'GET' }, type: 'Script' });
          event('Network.responseReceived', { requestId: `nf${i}`, response: { status: 404 } });
        });
        for (const e of cd.errors || []) event('Runtime.exceptionThrown', { timestamp: Date.now(), exceptionDetails: { text: 'Uncaught', exception: { description: `${e}\n    at fixture.js:1:1` } } });
        for (const e of cd.logErrors || []) event('Log.entryAdded', { entry: { source: 'network', level: 'error', text: e } });
        event('Page.loadEventFired', { timestamp: Date.now() / 1000 });
      }, 10));
      return;
    }
    default: return reply({});
  }
}

// ---- minimal RFC 6455 server (text frames, close, ping) -----------------------------------------
function frame(str) {
  const p = Buffer.from(str);
  let h;
  if (p.length < 126) h = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
  return Buffer.concat([h, p]);
}
const server = http.createServer((req, res) => {
  if (req.url === '/json/version') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ Browser: 'FakeChrome/1.0', 'User-Agent': FAKE_UA(HEADLESS), webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/fake` }));
  }
  res.statusCode = 404; res.end();
});
server.on('upgrade', (req, sock) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (o) => { if (!sock.destroyed) sock.write(frame(JSON.stringify(o))); };
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i % 4])); }
      buf = buf.subarray(need);
      if (op === 8) { sock.end(Buffer.from([0x88, 0])); return; }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      parts.push(payload);
      if (!fin) continue;
      const text = Buffer.concat(parts).toString('utf8'); parts = [];
      try { handle(JSON.parse(text), send); } catch (e) { log({ error: String(e) }); }
    }
  });
  sock.on('error', () => {});
});
server.listen(port, '127.0.0.1', () => {
  const p = server.address().port;
  if (profile) writeFileSync(join(profile, 'DevToolsActivePort'), `${p}\n/devtools/browser/fake`);
  log({ method: '(started)', params: { port: p, profile, argv: process.argv.slice(2) } });
});
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => {
  if (s === 'SIGTERM' && process.env.FAKE_CHROME_IGNORE_SIGTERM) return log({ method: '(sigterm-ignored)', params: {} }); // a browser that will not quit
  log({ method: '(exit)', params: { signal: s } }); process.exit(0);
});
// Safety net only: exit 15 s after the launching process is gone. A real Chrome would stay; the tests
// check within a few seconds that verify.mjs itself stops its browser, which this grace keeps visible.
const parent = process.ppid;
const wd = setInterval(() => { try { process.kill(parent, 0); } catch { clearInterval(wd); setTimeout(() => process.exit(0), 15000); } }, 500);
