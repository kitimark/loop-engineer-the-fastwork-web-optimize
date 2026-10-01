// Incident I-043: wip.mjs connect() threw "no page target" without closing its websocket, so each openTab try left a
// socket to ios_webkit_debug_proxy open (up to 6 per `iphone.mjs open`) until the process exited. Every failure of
// connect() (open timeout, no page target) and of openTab's probe evaluate now closes the socket before it throws.
// An in-process fake proxy: /json plus a minimal websocket server that records the close frame or socket end.
// Incident I-038: when the proxy answers a command with a close (code 1001, as ios_webkit_debug_proxy does once another
// inspector connection took the page), pending and later commands fail at once instead of timing out, and
// gesture-run's wipPage reconnects to the tab and retries an idempotent call once.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { connect, openTab, sleep } from '../../tools/lib/wip.mjs';
import { wipPage } from '../../tools/lib/gesture-run.mjs';
import { STATE_JS } from '../../tools/lib/gesture-rec.mjs';

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
// /devtools/page/kill: announces a page target and answers (location.href, STATE_JS, anything else 'v'), but closes the
//   connection with code 1001 instead of answering the expression 'die', or the next command after killNext is set;
//   never answers the expression 'hang'
const sockets = [];
let listed = 'error', killNext = false;
const server = http.createServer((req, res) => {
  if (req.url === '/json') {
    res.setHeader('content-type', 'application/json');
    const ws = `ws://127.0.0.1:${server.address().port}/devtools/page/${listed}`;
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
  if (/\/(error|kill)$/.test(req.url)) sock.write(frame(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'page-1', type: 'page' } } })));
  sock.on('data', (buf) => {
    const f = decode(buf);
    if (f.op === 8) { rec.closeFrame = true; sock.end(Buffer.from([0x88, 0])); return; }
    if (f.op !== 1 || !/\/(error|kill)$/.test(req.url)) return;
    const m = JSON.parse(f.text);
    const inner = JSON.parse(m.params.message);
    if (req.url.endsWith('/kill')) {
      const expr = inner.params.expression;
      if (expr === 'hang') return; // never answered (the reply went to another inspector client)
      if (expr === 'die' || killNext) { killNext = false; const why = Buffer.from('Page 9222/1 claimed by local'); sock.end(Buffer.concat([Buffer.from([0x88, 2 + why.length, 0x03, 0xe9]), why])); return; } // close 1001, no answer
      const value = expr === 'location.href' ? 'http://192.0.2.7:5492/' : expr === STATE_JS ? [0, 100, 775, 1, 'visible', 430] : 'v';
      sock.write(frame(JSON.stringify({ id: m.id, result: {} })));
      sock.write(frame(JSON.stringify({ method: 'Target.dispatchMessageFromTarget', params: { targetId: 'page-1', message: JSON.stringify({ id: inner.id, result: { result: { type: typeof value, value } } }) } })));
      return;
    }
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
  await assert.rejects(connect(`ws://127.0.0.1:${PORT}/devtools/page/silent`), /no page target \(phone locked \/ Safari backgrounded\? or is another inspector client attached to this tab, e\.g\. Safari's Web Inspector \(Develop menu\) on the Mac\? Close it: one remote inspector per page \(I-038\)\)/);
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
    await assert.rejects(openTab(() => true, { tries: 2, port: PORT, appId: null }), /BLOCKED: cannot reach Safari tab \(.*fake error.*close any Web Inspector attached to the tab on the Mac \(Safari's Develop menu; one remote inspector per page, I-038\)/);
  } finally { console.error = err; }
  const mine = sockets.slice(n);
  assert.equal(mine.length, 2, 'one socket per try');
  for (const [i, rec] of mine.entries()) await closed(rec, `try ${i + 1}`);
});

test('I-038 connect: a connection the proxy closes fails its pending and later commands at once, and says so', async () => {
  const c = await connect(`ws://127.0.0.1:${PORT}/devtools/page/kill`);
  assert.equal(await c.evaluate('1'), 'v');
  assert.equal(c.closed, null);
  const t0 = Date.now();
  const e = await c.evaluate('die').then(() => null, (x) => x);
  assert.ok(e && e.closed === true, String(e));
  assert.match(e.message, /inspector connection closed by the proxy \(code 1001 "Page 9222\/1 claimed by local"\): another inspector connection took this tab \(one per page, I-038\)/);
  assert.ok(Date.now() - t0 < 2000, 'not the 15 s command timeout');
  assert.equal(c.closed.code, 1001);
  assert.equal(c.closed.reason, 'Page 9222/1 claimed by local');
  assert.equal(c.closed.self, false);
  const t1 = Date.now();
  await assert.rejects(c.evaluate('1'), (x) => x.closed === true && /code 1001/.test(x.message));
  assert.ok(Date.now() - t1 < 100, 'a later command fails at once, before it is sent');
  // our own close() is told apart
  const d = await connect(`ws://127.0.0.1:${PORT}/devtools/page/kill`);
  d.close();
  for (let i = 0; i < 40 && !d.closed; i++) await sleep(25);
  assert.equal(d.closed?.self, true);
  await assert.rejects(d.evaluate('1'), /inspector connection closed \(by this tool\)/);
});

test('I-038 wipPage: reconnects after the proxy closed its connection, retries an idempotent call once, never an --inject one', async () => {
  const env = process.env.FW_IPHONE_PORT;
  process.env.FW_IPHONE_PORT = String(PORT);
  listed = 'kill';
  const logs = [];
  let page;
  try {
    page = await wipPage({ match: '192.0.2.7:5492', log: (x) => logs.push(x) }).connect();
    const n = sockets.length;
    // closed between calls: the next call reconnects first
    await assert.rejects(page.evaluate('die'), (x) => x.closed === true);
    assert.equal((await page.state()).y, 0);
    assert.deepEqual(page.reconnects.map((r) => [r.code, r.during]), [[1001, 'state']]);
    // closed while a call is in flight: an idempotent call is retried on a new connection ...
    killNext = true;
    assert.equal((await page.state()).ih, 775);
    assert.deepEqual(page.reconnects.map((r) => [r.code, r.during]), [[1001, 'state'], [1001, 'state']]);
    assert.equal(await page.href(), 'http://192.0.2.7:5492/');
    // ... an --inject expression is not (unknown code: it may have run)
    killNext = true;
    await assert.rejects(page.evaluate('x'), (x) => x.closed === true);
    assert.equal(page.reconnects.length, 2);
    assert.equal(await page.install(), 'v'); // reconnects first
    assert.equal(page.reconnects.length, 3);
    assert.equal(sockets.length, n + 3, 'one new connection per reconnect');
    assert.ok(logs.every((l) => /closed by the proxy \(code 1001\) before (state|install): reconnecting \(I-038\)/.test(l)), logs.join('\n'));
  } finally {
    page?.close();
    listed = 'error'; killNext = false;
    if (env === undefined) delete process.env.FW_IPHONE_PORT; else process.env.FW_IPHONE_PORT = env;
  }
});

test('I-038 connect: a command nobody answers times out naming the other-inspector cause', async () => {
  const c = await connect(`ws://127.0.0.1:${PORT}/devtools/page/kill`);
  try {
    await assert.rejects(c.send('Runtime.evaluate', { expression: 'hang' }, 'page', 200), /^Error: Runtime\.evaluate timed out after 200ms \(is another inspector client attached to this tab, e\.g\. Safari's Web Inspector \(Develop menu\) on the Mac\? Close it: one remote inspector per page \(I-038\)\)$/);
  } finally { c.close(); }
});
