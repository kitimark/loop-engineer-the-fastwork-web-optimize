#!/usr/bin/env node
// A fake ios_webkit_debug_proxy + iPhone Safari for the default test suite, so tools/iphone.mjs and
// tools/lib/wip.mjs run end to end without the shared phone. One tab; `GET /json` lists it, its
// webSocketDebuggerUrl speaks just enough of the WebKit Inspector Protocol (Target.targetCreated,
// Target.sendMessageToTarget -> Runtime.evaluate, Target.dispatchMessageFromTarget) for iphone.mjs `open`.
//
// Navigation (`location.href = "<url>"`) behaves like a phone that does NOT trust the mirror's
// self-signed certificate (incident I-003): the fake loads <url> with Node's default TLS verification;
// if that fails, the tab stays on <url> but shows Safari's certificate warning page (title "This
// Connection Is Not Private", a same-origin request to /__mirror/info fails).
//
//   node tests/fixtures/fake-webkit-proxy.mjs --port=0 --url=<initial tab url>
//   prints FAKE_WIP_PORT=<port> once listening. Env: FAKE_WIP_LOG=<file> appends one JSON line per
//   evaluated expression / navigation.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const LOG = process.env.FAKE_WIP_LOG;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...o }) + '\n'); };

const tab = { url: arg('url') || 'about:blank', title: 'start', warning: false, gen: 1 };
async function load(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); // default TLS verification, like an untrusting phone
    const html = await r.text();
    Object.assign(tab, { url, title: (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1], warning: false });
  } catch (e) {
    const tls = /certificate|self.signed|CERT|DEPTH_ZERO/i.test(String(e.cause?.code || e.cause?.message || e.message));
    Object.assign(tab, { url, title: tls ? 'This Connection Is Not Private' : 'Failed to open page', warning: true });
  }
  tab.gen++;
  log({ navigated: url, warning: tab.warning, title: tab.title });
}

async function evaluate(expr) {
  const nav = expr.match(/location\.href = ("[^"]*")/);
  if (nav) { const u = JSON.parse(nav[1]); log({ navigate: u }); setTimeout(() => load(u), 50); return 'ok'; }
  if (expr.includes('/__mirror/info')) {
    let mirror = 0;
    if (!tab.warning) { try { mirror = (await fetch(new URL('/__mirror/info', tab.url), { signal: AbortSignal.timeout(5000) })).status; } catch {} }
    return { href: tab.url, title: tab.title, mirror };
  }
  if (expr === 'location.href') return tab.url;
  if (expr === 'document.readyState') return 'complete';
  if (expr === 'document.title') return tab.title;
  if (expr === '1') return 1;
  return undefined;
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
  if (req.url === '/json') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify([{ url: tab.url, title: tab.title, webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/1` }]));
  }
  res.statusCode = 404; res.end();
});
server.on('upgrade', (req, sock) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (o) => { if (!sock.destroyed) sock.write(frame(JSON.stringify(o))); };
  const targetId = `page-${tab.gen}`; // target ids change on every navigation, like iOS
  send({ method: 'Target.targetCreated', params: { targetInfo: { targetId, type: 'page' } } });
  const handle = async (msg) => {
    if (msg.method !== 'Target.sendMessageToTarget') return send({ id: msg.id, result: {} });
    send({ id: msg.id, result: {} });
    const inner = JSON.parse(msg.params.message);
    let result = {};
    if (inner.method === 'Runtime.evaluate') {
      const v = await evaluate(inner.params.expression);
      log({ evaluate: inner.params.expression.slice(0, 160) });
      result = { result: v === undefined ? { type: 'undefined' } : { type: typeof v, value: v } };
    }
    send({ method: 'Target.dispatchMessageFromTarget', params: { targetId, message: JSON.stringify({ id: inner.id, result }) } });
  };
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
      try { handle(JSON.parse(text)).catch((e) => log({ error: String(e) })); } catch (e) { log({ error: String(e) }); }
    }
  });
  sock.on('error', () => {});
});
server.listen(Number(arg('port') || 0), '127.0.0.1', () => console.log(`FAKE_WIP_PORT=${server.address().port}`));
