// tools/lib/served-get.mjs (ts-lock-bundle (d)): fix.mjs ab's served-file GET retries a transport failure (a server
// that does not answer within the timeout, a reset) on a fresh connection; any HTTP answer is returned as is (the
// check still compares status, source and hash), and a server that never answers still fails, naming the tries.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { servedGet } from '../../tools/lib/served-get.mjs';

const servers = [];
after(() => { for (const s of servers) s.close(); });
const serve = (handler) => new Promise((res) => {
  const s = http.createServer(handler);
  servers.push(s);
  s.listen(0, '127.0.0.1', () => res(`http://127.0.0.1:${s.address().port}`));
});

test('a first request that gets no answer within the timeout is retried on a new connection and the answer is returned', async () => {
  let n = 0;
  const ports = new Set();
  const url = await serve((req, res) => {
    ports.add(req.socket.remotePort);
    if (++n === 1) return; // stalls: never answers the first request
    res.writeHead(200, { 'x-mirror-source': 'overlay' });
    res.end('body-2');
  });
  const logs = [];
  const r = await servedGet(`${url}/_app/x.js`, { timeoutMs: 200, attempts: 3, log: (s) => logs.push(s) });
  assert.deepEqual([r.status, r.headers['x-mirror-source'], r.body.toString()], [200, 'overlay', 'body-2']);
  assert.equal(n, 2);
  assert.equal(ports.size, 2, 'the retry used a new connection');
  assert.deepEqual(logs, [`[served-file check] timeout ${url}/_app/x.js (connected to 127.0.0.1:${new URL(url).port}, no response headers): retry 2/3 on a new connection`]);
});

test('an HTTP error answer is returned as is, never retried (the check judges it)', async () => {
  let n = 0;
  const url = await serve((req, res) => { n++; res.writeHead(404); res.end('nope'); });
  const logs = [];
  const r = await servedGet(`${url}/missing.js`, { timeoutMs: 1000, log: (s) => logs.push(s) });
  assert.deepEqual([r.status, r.body.toString(), n, logs.length], [404, 'nope', 1, 0]);
});

test('a server that never answers fails after all tries; a reset is retried too', async () => {
  let n = 0;
  const url = await serve(() => { n++; });
  const logs = [];
  await assert.rejects(servedGet(`${url}/2.fixture.js`, { timeoutMs: 100, attempts: 3, log: (s) => logs.push(s) }), new RegExp(`^Error: timeout ${url}/2\\.fixture\\.js \\(connected to 127\\.0\\.0\\.1:\\d+, no response headers\\) \\[3 tries\\]$`));
  // nothing listening: refused, named as not connected
  const dead = await serve(() => {});
  servers.pop().close();
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(servedGet(`${dead}/x.js`, { timeoutMs: 500, attempts: 2, log: () => {} }), /ECONNREFUSED.*\(not connected, no response headers\) \[2 tries\]$/);
  // a headers-then-stall answer says how far it got
  const url3 = await serve((req, res) => { res.writeHead(200); res.write('abc'); });
  await assert.rejects(servedGet(`${url3}/y.js`, { timeoutMs: 150, attempts: 1, log: () => {} }), /\(connected to 127\.0\.0\.1:\d+, headers received, 3 body bytes\) \[1 tries\]$/);
  assert.deepEqual([n, logs.length], [3, 2]);
  let m = 0;
  const url2 = await serve((req, res) => { if (++m === 1) return req.socket.destroy(); res.end('ok'); });
  const r = await servedGet(`${url2}/a.js`, { timeoutMs: 1000, log: () => {} });
  assert.deepEqual([r.status, r.body.toString(), m], [200, 'ok', 2]);
});
