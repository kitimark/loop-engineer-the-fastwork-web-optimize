// Incident I-043: wip.mjs connect() threw "no page target" without closing its websocket, so each openTab try left a
// socket to ios_webkit_debug_proxy open (up to 6 per `iphone.mjs open`) until the process exited. Every failure of
// connect() (open timeout, no page target) and of openTab's probe evaluate now closes the socket before it throws.
// An in-process fake proxy: /json plus a minimal websocket server that records the close frame or socket end.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { connect, openTab, sleep } from '../../tools/lib/wip.mjs';

const frame = (str) => { const p = Buffer.from(str); return Buffer.concat([Buffer.from([0x81, p.length < 126 ? p.length : 126]), p.length < 126 ? Buffer.alloc(0) : Buffer.from([p.length >> 8, p.length & 255]), p]); };
function decode(buf) { // one masked client frame, payload < 65536
  const op = buf[0] & 15;
  let len = buf[1] & 127, off = 2;
  if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
  const mask = buf.subarray(off, off + 4);
  off += 4;
  return { op, text: Buffer.from(buf.subarray(off, off + len).map((b, i) => b ^ mask[i % 4])).toString() };
}

// /devtools/page/silent: opens, never announces a page target (a locked phone, a background view)
// /devtools/page/error: announces a page target, answers every command with an error
// /devtools/page/hang: never completes the handshake
const sockets = [];
const server = http.createServer((req, res) => {
  if (req.url === '/json') {
    res.setHeader('content-type', 'application/json');
    const ws = `ws://127.0.0.1:${server.address().port}/devtools/page/error`;
    return res.end(JSON.stringify([{ url: 'http://192.0.2.7:5492/', title: 't', webSocketDebuggerUrl: ws, appId: 'PID:613' }]));
  }
  res.statusCode = 404; res.end();
});
server.on('upgrade', (req, sock) => {
  const rec = { path: req.url, closeFrame: false, ended: false, sock };
  sockets.push(rec);
  sock.on('error', () => {});
  sock.on('close', () => { rec.ended = true; });
  if (req.url.endsWith('/hang')) return;
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (req.url.endsWith('/error')) sock.write(frame(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'page-1', type: 'page' } } })));
  sock.on('data', (buf) => {
    const f = decode(buf);
    if (f.op === 8) { rec.closeFrame = true; sock.end(Buffer.from([0x88, 0])); return; }
    if (f.op !== 1 || !req.url.endsWith('/error')) return;
    const m = JSON.parse(f.text);
    const inner = JSON.parse(m.params.message);
    sock.write(frame(JSON.stringify({ id: m.id, result: {} })));
    sock.write(frame(JSON.stringify({ method: 'Target.dispatchMessageFromTarget', params: { targetId: 'page-1', message: JSON.stringify({ id: inner.id, error: { message: 'fake error' } }) } })));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
after(() => { for (const r of sockets) r.sock.destroy(); server.close(); });

async function closed(rec, what) {
  for (let i = 0; i < 40 && !(rec.closeFrame || rec.ended); i++) await sleep(50);
  assert.ok(rec.closeFrame || rec.ended, `${what}: the socket was closed by the client`);
}

test('I-043 connect: "no page target" closes the websocket before it throws', async () => {
  const n = sockets.length;
  await assert.rejects(connect(`ws://127.0.0.1:${PORT}/devtools/page/silent`), /no page target/);
  assert.equal(sockets.length, n + 1);
  await closed(sockets[n], 'no page target');
  assert.equal(sockets[n].closeFrame, true, 'a websocket close, not just a dropped TCP connection');
});

// An open timeout calls ws.close() too, but Node's WebSocket (undici, Node 24.14.0) did not end a half-open
// handshake's TCP connection after close() in CONNECTING, not even after a late 101 (OBSERVED in our setup, cause
// unknown), so that path is checked for its error only. The proxy answers handshakes at once; the leak was "no page target".
test('I-043 connect: an open timeout rejects; a connect that succeeds leaves no open-timeout timer behind', async () => {
  await assert.rejects(connect(`ws://127.0.0.1:${PORT}/devtools/page/hang`, { timeoutMs: 300 }), /websocket open timeout/);
  const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  const before = timers();
  const c = await connect(`ws://127.0.0.1:${PORT}/devtools/page/error`);
  assert.equal(c.targets.page, 'page-1');
  assert.equal(timers(), before, 'the 15 s open timeout is cleared once the socket is open (it kept the process alive)');
  const n = sockets.length - 1;
  c.close();
  await closed(sockets[n], 'close()');
});

test('I-043 openTab: a tab whose probe evaluate fails leaves no socket open per try', async () => {
  const n = sockets.length;
  const err = console.error;
  console.error = () => {};
  try {
    await assert.rejects(openTab(() => true, { tries: 2, port: PORT, appId: null }), /BLOCKED: cannot reach Safari tab \(.*fake error/);
  } finally { console.error = err; }
  const mine = sockets.slice(n);
  assert.equal(mine.length, 2, 'one socket per try');
  for (const [i, rec] of mine.entries()) await closed(rec, `try ${i + 1}`);
});
