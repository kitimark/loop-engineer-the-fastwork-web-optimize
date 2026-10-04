// I-132: the fake-DOM page loader (tests/fixtures/page-dom.mjs) used to wait a fixed 250 ms for a page to settle, so a
// page whose /api answer came later (a loaded npm test) was asserted half-rendered. loadPage and settle() now wait for
// what the page itself has in flight: its fetches and its short timers, until both are drained (or a timeout names
// what is still pending). An in-process server with a slow API stands in for a loaded console server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { loadPage } from '../fixtures/page-dom.mjs';

const SLOW = 600; // well past the old fixed 250 ms
const page = (script) => `<!doctype html><html><head><title>t</title></head><body><div id="out"></div><button id="go">go</button><script>${script}</script></body></html>`;
const PAGES = {
  // fetch, then a second fetch chained on the first answer, then a short timer that renders
  '/chain': page(`
    fetch('/api/slow?n=1').then(function (r) { return r.json(); }).then(function (a) {
      return fetch('/api/slow?n=2').then(function (r) { return r.json(); }).then(function (b) {
        setTimeout(function () { document.getElementById('out').textContent = a.n + '+' + b.n; }, 50);
      });
    });`),
  // a click posts, the answer renders
  '/click': page(`
    document.getElementById('go').addEventListener('click', function () {
      fetch('/api/slow?n=7', { method: 'POST', body: '{}' }).then(function (r) { return r.json(); }).then(function (j) { document.getElementById('out').textContent = 'sent ' + j.n; });
    });`),
  // a fetch that never answers
  '/hang': page(`fetch('/api/hang').then(function () { document.getElementById('out').textContent = 'never'; }).catch(function () {});`),
  // a long timer (a toast) is not waited for: the fake DOM drops timers over 100 ms
  '/toast': page(`setTimeout(function () { document.getElementById('out').textContent = 'late'; }, 6000); document.getElementById('out').textContent = 'now';`),
};
let srv, base;
const hung = [];

before(async () => {
  srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (PAGES[u.pathname]) { res.setHeader('content-type', 'text/html'); res.end(PAGES[u.pathname]); return; }
    if (u.pathname === '/api/slow') { req.resume(); setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ n: Number(u.searchParams.get('n')) })); }, SLOW); return; }
    if (u.pathname === '/api/hang') { hung.push(res); return; }
    res.statusCode = 404; res.end('no');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}/`;
});
after(async () => { for (const r of hung) r.destroy(); srv.closeAllConnections?.(); await new Promise((r) => srv.close(r)); });

test('loadPage waits for the page\'s own fetches (chained) and short timers, not a fixed time', async () => {
  const t0 = Date.now();
  const p = await loadPage(base, '/chain');
  assert.equal(p.document.getElementById('out').textContent, '1+2', 'rendered after both slow answers and the timer');
  assert.ok(Date.now() - t0 >= 2 * SLOW, 'it waited for both answers');
  assert.deepEqual(p.calls.map((c) => c.url), ['/api/slow?n=1', '/api/slow?n=2']);
});

test('settle() after a click waits for the request it started', async () => {
  const p = await loadPage(base, '/click');
  assert.equal(p.document.getElementById('out').textContent, '');
  p.fire(p.document.getElementById('go'), 'click');
  await p.settle();
  assert.equal(p.document.getElementById('out').textContent, 'sent 7');
});

test('a timer over 100 ms (a toast) is not waited for', async () => {
  const t0 = Date.now();
  const p = await loadPage(base, '/toast');
  assert.equal(p.document.getElementById('out').textContent, 'now');
  assert.ok(Date.now() - t0 < 3000);
});

test('a page that never settles: loadPage fails at its timeout and names what is pending', async () => {
  await assert.rejects(loadPage(base, '/hang', { settleTimeoutMs: 400 }), /did not settle in 400 ms: 1 fetch\(es\) pending \(\/api\/hang\)/);
});
