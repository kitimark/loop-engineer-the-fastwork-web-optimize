#!/usr/bin/env node
// A fake ios_webkit_debug_proxy whose one Safari tab is the fake page of tests/fixtures/fake-run-dom.mjs, for
// `iphone.mjs run` end to end without the phone. GET /json lists the tab (its url is this server's own `/`), the
// tab's websocket speaks the WebKit Inspector Protocol subset tools/lib/wip.mjs uses (Target.targetCreated,
// Target.sendMessageToTarget -> Runtime.evaluate -> Target.dispatchMessageFromTarget); every expression runs in the
// page's vm context. location.reload() builds a new page (new target id, like iOS). The server also serves the
// page's one script, /_app/immutable/app.js, so the served-hash record can be checked.
//
//   node tests/fixtures/fake-run-proxy.mjs [--doc-height=2900] [--morph] [--cert-warning] [--port=N (default: any free port)]
//   prints FAKE_WIP_PORT=<port>. Env FAKE_WIP_LOG=<file>: one JSON line per evaluate ({evaluate: head, len}) and reload.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { createPage, APP_JS } from './fake-run-dom.mjs';

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const flag = (n) => process.argv.includes(`--${n}`);
const LOG = process.env.FAKE_WIP_LOG;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...o }) + '\n'); };

let gen = 1, page = null, base = null;
function newPage() {
  if (page) page.stop();
  page = createPage({ docHeight: Number(arg('doc-height') || 2900), morph: flag('morph'), href: base, resources: [base + '_app/immutable/app.js'],
    onReload: () => setTimeout(() => { gen++; log({ reload: gen }); newPage(); }, 100) });
}

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
    return res.end(JSON.stringify([{ url: base, title: flag('cert-warning') ? 'This Connection Is Not Private' : 'fake run page', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/1` }]));
  }
  if (req.url === '/_app/immutable/app.js') { res.setHeader('content-type', 'text/javascript'); return res.end(APP_JS); }
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end('<title>fake run page</title>'); }
  res.statusCode = 404; res.end();
});
server.on('upgrade', (req, sock) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (o) => { if (!sock.destroyed) sock.write(frame(JSON.stringify(o))); };
  const targetId = `page-${gen}`;
  send({ method: 'Target.targetCreated', params: { targetInfo: { targetId, type: 'page' } } });
  const handle = (msg) => {
    send({ id: msg.id, result: {} });
    if (msg.method !== 'Target.sendMessageToTarget') return;
    const inner = JSON.parse(msg.params.message);
    let result = {};
    if (inner.method === 'Runtime.evaluate') {
      const expr = inner.params.expression;
      log({ evaluate: expr.slice(0, 80), len: expr.length });
      try {
        const v = page.evaluate(expr);
        const j = v === undefined ? undefined : JSON.parse(JSON.stringify(v));
        result = { result: j === undefined ? { type: 'undefined' } : { type: typeof j, value: j } };
      } catch (e) { result = { wasThrown: true, result: { type: 'string', value: String(e) } }; }
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
      try { handle(JSON.parse(text)); } catch (e) { log({ error: String(e) }); }
    }
  });
  sock.on('error', () => {});
});
server.listen(Number(arg('port') || 0), '127.0.0.1', () => {
  base = `http://127.0.0.1:${server.address().port}/`;
  newPage();
  console.log(`FAKE_WIP_PORT=${server.address().port}`);
});
