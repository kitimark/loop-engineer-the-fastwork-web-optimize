#!/usr/bin/env node
// A fake "Chrome" for the default test suite: speaks just enough of the DevTools protocol over a
// hand-rolled WebSocket server (no deps) for tools/lib/cdp.mjs + tools/verify.mjs to run end to end.
// Used via $CHROME (tools/lib/cdp.mjs chromePath()). It never loads pages: Runtime.evaluate answers
// are canned by recognising the expressions verify.mjs sends, with deterministic frame/LoAF data, so
// the summaries in verify's result JSON can be checked exactly.
//
// Env: FAKE_CHROME_LOG=<file>  append one JSON line per CDP command ({pid, method, params, sessionId})
//      FAKE_CHROME_CRASH_AT=<method>  exit abruptly (no reply) when this CDP method arrives, like a browser crash
import http from 'node:http';
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

function evaluate(expr) {
  if (expr.includes('kit: Object.keys(window)')) return { kit: ['__sveltekit_fake'], nav: 'start-selling-top-nav', hero: 'hero', h: 3000, shim: null, vendors: { gtag: 'undefined', amplitude: 'undefined', hj: 'undefined', dataLayer: 1 } };
  if (expr.includes('window.__perf.frames.length=0')) { input = false; return true; }
  if (expr.includes("window.scrollBy({ top: 250, behavior: 'smooth' })") && expr.includes('still >= 4')) { input = true; return { ms: 5000, ticks: 16, y: 2068, h: 3000 }; }
  if (expr.includes('p.on = false')) return input ? { frames: FRAMES, loaf: LOAF, on: false } : { frames: IDLE_FRAMES, loaf: IDLE_LOAF, on: false };
  if (expr.includes("document.querySelector('.start-selling-top-nav')?.className")) return 'start-selling-top-nav is-morph';
  if (expr.includes('document.documentElement.scrollHeight - innerHeight')) return 2068;
  if (expr.includes('OffscreenCanvas')) return { w: 430, h: 932, diffPct: 0.12 };
  if (expr.includes('__mirrorVendorShim ? {')) return null;
  return undefined;
}

let n = 0;
function handle(msg, send) {
  const { id, method, params = {}, sessionId } = msg;
  log({ method, params: method === 'Runtime.evaluate' ? { expression: params.expression.slice(0, 120) } : params, sessionId });
  if (process.env.FAKE_CHROME_CRASH_AT === method) { log({ method: '(crash)', params: {} }); process.exit(1); }
  const reply = (result) => send({ id, result, ...(sessionId ? { sessionId } : {}) });
  const event = (m, p) => send({ method: m, params: p, sessionId });
  if (method.startsWith('Input.')) input = true;
  switch (method) {
    case 'Target.createBrowserContext': return reply({ browserContextId: `ctx${++n}` });
    case 'Target.createTarget': return reply({ targetId: `target${++n}` });
    case 'Target.attachToTarget': return reply({ sessionId: `session${++n}` });
    case 'Page.captureScreenshot': return reply({ data: PNG });
    case 'Runtime.evaluate': {
      const v = evaluate(params.expression);
      return reply({ result: v === undefined ? { type: 'undefined' } : { type: typeof v, value: v } });
    }
    case 'Page.navigate': {
      reply({ frameId: 'frame' });
      const u = params.url;
      setTimeout(() => {
        event('Network.requestWillBeSent', { requestId: 'r1', request: { url: u, method: 'GET' }, type: 'Document' });
        event('Network.responseReceived', { requestId: 'r1', response: { status: 200 } });
        event('Network.requestWillBeSent', { requestId: 'r2', request: { url: new URL('/_app/immutable/nodes/2.fixture.js', u).href, method: 'GET' }, type: 'Script' });
        event('Network.responseReceived', { requestId: 'r2', response: { status: 200 } });
        event('Network.loadingFinished', { requestId: 'r2' });
        event('Page.loadEventFired', { timestamp: Date.now() / 1000 });
      }, 10);
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
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { log({ method: '(exit)', params: { signal: s } }); process.exit(0); });
// Safety net only: exit 15 s after the launching process is gone. A real Chrome would stay; the tests
// check within a few seconds that verify.mjs itself stops its browser, which this grace keeps visible.
const parent = process.ppid;
const wd = setInterval(() => { try { process.kill(parent, 0); } catch { clearInterval(wd); setTimeout(() => process.exit(0), 15000); } }, 500);
