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
//      FAKE_CHROME_BENCH=1  tools/bench.mjs mode: on Page.navigate, fetch <origin>/bench-fake.json from the
//        served page (so the baseline and the overlay can differ) and answer the bench probes from it:
//        {windows: {label: {probeId: n}}, probes: {probe: n} (any window), frames, snapshot, capped, errors, listeners, metricsStep: {name: n}}
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const port = Number(arg('remote-debugging-port') || 0);
const profile = arg('user-data-dir');
const LOG = process.env.FAKE_CHROME_LOG;
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
  return undefined;
}

function evaluate(expr) {
  if (expr.includes('kit: Object.keys(window)')) return { kit: ['__sveltekit_fake'], nav: 'start-selling-top-nav', hero: 'hero', h: 3000, shim: null, vendors: { gtag: 'undefined', amplitude: 'undefined', hj: 'undefined', dataLayer: 1 } };
  if (expr.includes('window.__perf.frames.length=0')) { input = false; return true; }
  if (expr.includes("window.scrollBy({ top: 250, behavior: 'smooth' })") && expr.includes('still >= 4')) { input = true; return { ms: 5000, ticks: 16, y: 2068, h: 3000 }; }
  if (expr.includes('p.on = false')) {
    const r = input ? { frames: FRAMES, loaf: LOAF, on: false } : { frames: IDLE_FRAMES, loaf: IDLE_LOAF, on: false };
    return expr.includes('o.scrollY = scrollY') ? { ...r, scrollY: input ? 2068 : 0 } : r;
  }
  if (expr.includes("document.querySelector('.start-selling-top-nav')?.className")) return 'start-selling-top-nav is-morph';
  if (expr.includes('document.documentElement.scrollHeight - innerHeight')) return 2068;
  if (expr.includes('OffscreenCanvas')) return { w: 430, h: 932, diffPct: 0.12 };
  if (expr.includes('__mirrorVendorShim ? {')) return null;
  return undefined;
}

let n = 0, dying = false;
function handle(msg, send) {
  const { id, method, params = {}, sessionId } = msg;
  log({ method, params: method === 'Runtime.evaluate' ? { expression: params.expression.slice(0, 120) } : params, sessionId });
  if (process.env.FAKE_CHROME_CRASH_AT === method) { log({ method: '(crash)', params: {} }); process.exit(1); }
  if (process.env.FAKE_CHROME_HANG_AT === method) { log({ method: '(hang)', params: {} }); return; } // never answers
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
    case 'Performance.getMetrics': {
      const st = bench.get(sessionId) || { data: {} };
      st.calls = (st.calls || 0) + 1;
      const step = st.data.metricsStep || {};
      return reply({ metrics: ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map((name) => ({ name, value: st.calls * (step[name] || 0) })) });
    }
    case 'DOMDebugger.getEventListeners': return reply({ listeners: (bench.get(sessionId)?.data.listeners) || [] });
    case 'Runtime.evaluate': {
      if (params.returnByValue === false) return reply({ result: { type: 'object', objectId: `obj${++n}` } });
      const v = (BENCH ? benchEvaluate(params.expression, sessionId) : undefined) ?? evaluate(params.expression);
      return reply({ result: v === undefined ? { type: 'undefined' } : { type: typeof v, value: v } });
    }
    case 'Page.navigate': {
      reply({ frameId: 'frame' });
      const u = params.url;
      const ready = BENCH ? fetchJson(new URL('/bench-fake.json', u).href).then((data) => { bench.set(sessionId, { data }); log({ method: '(bench-fake)', params: { url: u, data } , sessionId }); }) : Promise.resolve();
      ready.then(() => setTimeout(() => {
        event('Network.requestWillBeSent', { requestId: 'r1', request: { url: u, method: 'GET' }, type: 'Document' });
        event('Network.responseReceived', { requestId: 'r1', response: { status: 200 } });
        event('Network.requestWillBeSent', { requestId: 'r2', request: { url: new URL('/_app/immutable/nodes/2.fixture.js', u).href, method: 'GET' }, type: 'Script' });
        event('Network.responseReceived', { requestId: 'r2', response: { status: 200 } });
        event('Network.loadingFinished', { requestId: 'r2' });
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
    return res.end(JSON.stringify({ Browser: 'FakeChrome/1.0', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/fake` }));
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
  log({ method: '(started)', params: { port: p, profile } });
});
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => {
  if (s === 'SIGTERM' && process.env.FAKE_CHROME_IGNORE_SIGTERM) return log({ method: '(sigterm-ignored)', params: {} }); // a browser that will not quit
  log({ method: '(exit)', params: { signal: s } }); process.exit(0);
});
// Safety net only: exit 15 s after the launching process is gone. A real Chrome would stay; the tests
// check within a few seconds that verify.mjs itself stops its browser, which this grace keeps visible.
const parent = process.ppid;
const wd = setInterval(() => { try { process.kill(parent, 0); } catch { clearInterval(wd); setTimeout(() => process.exit(0), 15000); } }, 500);
