// T-106: one Try-it host for every Try-it page (tools/lib/tryit.mjs). Registry in a temp state dir; the host runs in this
// process on 127.0.0.1 with injected clock and mounts; one test mounts the real mirror handler on the fixture baseline.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import { tempDir, request, sleep } from '../helpers.mjs';
import { portBusy } from '../../tools/lib/port-probe.mjs';
import { makeFixtureHome, PAGE_JS, PAGE_CSS } from '../fixtures/baseline.mjs';

let T, fx, ov, base;
const hosts = [];
before(async () => {
  const home = tempDir('fw-tryit-home-');
  fx = makeFixtureHome(home);
  process.env.FW_MIRROR_HOME = home;
  process.env.FW_STATE_DIR = join(tempDir('fw-tryit-state-'), 'state');
  // I-193: this file's own port-claims file (its fake probe calls every port free, and it expects exact ports); the
  // claims are still shared by every registry of this run, so the two-registry test below sees them
  process.env.FW_TRYIT_CLAIMS = join(tempDir('fw-tryit-claims-'), 'claims.json');
  T = await import('../../tools/lib/tryit.mjs');
  ov = join(home, 'ov');
  mkdirSync(join(ov, PAGE_JS, '..'), { recursive: true });
  writeFileSync(join(ov, PAGE_JS), '/* try-it overlay */\n');
  // I-195: never in the OS's ephemeral range (macOS 49152-65535; freePort() handed out one there): every parallel
  // listen(0) and outgoing connection takes the ports right after it, so a range there met another run's listener
  base = 20000 + Math.floor(Math.random() * 20000);
});
after(() => { for (const h of hosts) h.close(); });
const free = async () => null; // registry-only tests: nothing listens, exact ports
const probe = (p) => portBusy(p); // tests whose host listens: the real probe, so a port another process listens on is skipped (I-195)
const range = () => ({ from: base, to: base + 9 });

test('registry: names, ports (lowest free, kept on update, explicit, never 5173/5559 or another build\'s), stop and remove', async () => {
  const a = await T.addBuild({ name: 'best-build', overlays: [ov], range: range(), busy: free, by: 'test' });
  assert.equal(a.created, true);
  assert.equal(a.entry.port, base);
  assert.deepEqual([a.entry.root, a.entry.vendors, a.entry.latency, a.entry.stopped], ['site-pretty', 'local', 0, false]);
  const b = await T.addBuild({ name: 'site-pretty', range: range(), busy: async (p) => (p === base + 1 ? '127.0.0.1' : null) });
  assert.equal(b.entry.port, base + 2, 'a port in use is skipped');
  const same = await T.addBuild({ name: 'best-build', overlays: [ov], range: range(), busy: free });
  assert.deepEqual([same.created, same.updated, same.entry.port], [false, false, base]);
  const upd = await T.addBuild({ name: 'best-build', overlays: [ov], latency: 150, range: range(), busy: free });
  assert.deepEqual([upd.updated, upd.entry.port], [true, base], 'an update keeps the port');
  await assert.rejects(T.addBuild({ name: 'x', port: base + 2, busy: free }), /already the Try-it build "site-pretty"/);
  for (const port of [5173, 5559, 80]) await assert.rejects(T.addBuild({ name: 'x', port, busy: free }), /port: 1024-65535, not 5173\/5559/);
  for (const name of ['', '../x', 'a b', '.hidden']) await assert.rejects(T.addBuild({ name, busy: free }), /bad Try-it build name/);
  await assert.rejects(T.addBuild({ name: 'x', overlays: [join(fx.home, 'nope')], busy: free }), /is not a directory/);
  await assert.rejects(T.addBuild({ name: 'x', root: '/etc', busy: free }), /root: site-pretty or site/);
  assert.equal(T.setStopped('best-build', true).stopped, true);
  assert.equal(T.getBuild('best-build').stopped, true);
  assert.equal((await T.addBuild({ name: 'best-build', overlays: [ov], latency: 150, range: range(), busy: free })).entry.stopped, false, 'adding again serves it again');
  assert.deepEqual(T.listBuilds().map((e) => e.name), ['best-build', 'site-pretty']);
  assert.equal(T.removeBuild('site-pretty').port, base + 2);
  assert.equal(T.getBuild('site-pretty'), null);
  assert.doesNotMatch(readFileSync(join(T.tryitDir(), 'builds', 'best-build.json'), 'utf8'), /\b(?:192\.168\.|10\.\d+\.\d+\.\d+)/, 'no address in the registry');
  T.removeBuild('best-build');
});

test('I-193: two registries on one Mac (two npm test runs, each its own $FW_STATE_DIR) never pick the same free port before either listens', async () => {
  const r = { from: base + 20, to: base + 29 }; // nothing listens yet: the probe calls every port free in both
  const mine = process.env.FW_STATE_DIR;
  const a = await T.addBuild({ name: 'run-a', range: r, busy: free });
  try {
    try {
      process.env.FW_STATE_DIR = join(tempDir('fw-tryit-state2-'), 'state');
      const b = await T.addBuild({ name: 'run-b', range: r, busy: free });
      assert.notEqual(b.entry.port, a.entry.port, 'the other registry\'s fresh pick counts as taken');
      const c = await T.addBuild({ name: 'run-c', range: r, busy: free });
      assert.equal(new Set([a.entry.port, b.entry.port, c.entry.port]).size, 3);
    } finally { process.env.FW_STATE_DIR = mine; }
    const again = await T.addBuild({ name: 'run-a2', range: r, busy: free });
    assert.notEqual(again.entry.port, a.entry.port, 'its own registry keeps run-a\'s port');
  } finally { T.removeBuild('run-a'); T.removeBuild('run-a2'); }
});

/** A host on 127.0.0.1 with a fake clock; mounts count, the handler answers with the build's name and mount number. */
function fakeHost(opts = {}) {
  let t = 1000; const mounts = [];
  const H = T.createTryitHost({
    host: '127.0.0.1', idleMs: 60000, now: () => t, retryMs: 0,
    mount: (e) => { mounts.push(e.name); const n = mounts.length; return { handler: (req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`${e.name} #${n} lat=${e.latency}`); } }; },
    ...opts,
  });
  hosts.push(H);
  return { H, mounts, tick: (ms) => { t += ms; } };
}
async function until(f, ms = 3000) { for (const end = Date.now() + ms; Date.now() < end; await sleep(20)) { const v = f(); if (v) return v; } throw new Error('timeout'); }

test('I-195: a build the host tests serve never lands on a port another process listens on, and their range is outside the OS ephemeral range', async () => {
  assert.ok(range().from >= 1024 && range().to < 49152, `range ${range().from}-${range().to}`);
  let occupied = null; const other = net.createServer(); // stands in for a parallel run's server
  for (let p = range().from; p <= range().to && occupied == null; p++) {
    if (await portBusy(p)) continue;
    if (await new Promise((done) => { other.once('error', () => done(false)); other.listen({ port: p, host: '0.0.0.0', exclusive: true }, () => done(true)); })) occupied = p;
  }
  assert.ok(occupied, 'a free port to occupy');
  const { H } = fakeHost();
  try {
    const { entry } = await T.addBuild({ name: 'i195', range: { from: occupied, to: range().to }, busy: probe });
    assert.notEqual(entry.port, occupied);
    H.poll();
    await until(() => H.status().i195?.listening);
  } finally { T.removeBuild('i195'); H.poll(); other.close(); }
});

test('host: a cheap listener per build; files mounted on the first request, dropped after idleMs, re-mounted on the next; config change drops the mount', async () => {
  const { H, mounts, tick } = fakeHost();
  const { entry } = await T.addBuild({ name: 'b1', overlays: [ov], range: range(), busy: probe });
  H.poll();
  await until(() => H.status().b1?.listening);
  assert.deepEqual(mounts, [], 'nothing mounted before a request');
  const url = `http://127.0.0.1:${entry.port}/`;
  assert.equal((await request(url)).text, 'b1 #1 lat=0');
  assert.equal((await request(url + 'x.js')).text, 'b1 #1 lat=0', 'one mount serves every request');
  assert.equal(H.status().b1.mounted, true);
  tick(59000); assert.deepEqual(H.sweep(), [], 'not idle yet');
  tick(1000); assert.deepEqual(H.sweep(), ['b1'], 'idle for idleMs: unmounted');
  assert.equal(H.status().b1.mounted, false);
  assert.equal(H.status().b1.listening, true, 'the port stays');
  assert.equal((await request(url)).text, 'b1 #2 lat=0', 'the next request mounts again');
  await T.addBuild({ name: 'b1', overlays: [ov], latency: 20, range: range(), busy: free });
  H.poll();
  assert.equal(H.status().b1.mounted, false, 'another config: the old mount is dropped');
  assert.equal((await request(url)).text, 'b1 #3 lat=20');
  T.removeBuild('b1');
  H.poll();
  assert.equal(H.status().b1, undefined);
  await assert.rejects(request(url), /ECONNREFUSED|socket hang up|ECONNRESET/);
});

test('host: a stopped build answers every page with a Start page (no-store); POST /__tryit/start serves it again and returns to the page', async () => {
  const { H, mounts } = fakeHost();
  const { entry } = await T.addBuild({ name: 'b2', overlays: [ov], range: range(), busy: probe, label: 'Best <build>' });
  T.setStopped('b2', true);
  H.poll();
  await until(() => H.status().b2?.listening);
  const url = `http://127.0.0.1:${entry.port}`;
  const r = await request(url + '/some/page?x=1');
  assert.equal(r.status, 503);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.text, /<form method="post" action="\/__tryit\/start"><input type="hidden" name="to" value="\/some\/page\?x=1"><button type="submit">Start<\/button>/);
  assert.match(r.text, /Best &#60;build&#62;/, 'the label is escaped');
  assert.deepEqual(mounts, [], 'a stopped build loads nothing');
  const s = await request(url + '/__tryit/start', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'to=%2Fsome%2Fpage%3Fx%3D1' });
  assert.equal(s.status, 303);
  assert.equal(s.headers.location, '/some/page?x=1');
  assert.equal(T.getBuild('b2').stopped, false, 'un-stopped in the registry');
  assert.equal((await request(url + '/some/page?x=1')).text, 'b2 #1 lat=0');
  const evil = await request(url + '/__tryit/start', { method: 'POST', body: 'to=%2F%2Fevil.example%2F' });
  assert.equal(evil.headers.location, '/', 'never redirects off the port');
  T.removeBuild('b2'); H.poll();
});

test('host: a port in use is reported and retried; a mount that fails answers 503 with the reason; refuses hosts other than 0.0.0.0/127.0.0.1', async () => {
  const { H } = fakeHost({ busy: async () => '127.0.0.1', mount: () => { throw new Error('BASELINE-MODIFIED: test'); } });
  await T.addBuild({ name: 'b3', range: range(), busy: free });
  H.poll();
  await until(() => H.status().b3?.error);
  assert.match(H.status().b3.error, /port \d+ is in use \(something listens on 127\.0\.0\.1:\d+\)/);
  T.removeBuild('b3'); H.poll();
  const { H: H2 } = fakeHost({ mount: () => { throw new Error('BASELINE-MODIFIED: test'); } });
  const { entry } = await T.addBuild({ name: 'b4', range: range(), busy: probe });
  H2.poll();
  await until(() => H2.status().b4?.listening);
  const r = await request(`http://127.0.0.1:${entry.port}/`);
  assert.equal(r.status, 503);
  assert.match(r.text, /can't be served: BASELINE-MODIFIED: test/);
  assert.match(H2.status().b4.error, /BASELINE-MODIFIED/);
  T.removeBuild('b4'); H2.poll();
  assert.throws(() => T.createTryitHost({ host: '192.0.2.44' }), /0\.0\.0\.0 \(the Wi-Fi\) or 127\.0\.0\.1 \(tests\) only/);
});

test('host + the real mirror handler: overlay and baseline files, x-mirror-source, Cache-Control no-store on every file (I-131), /__mirror/info', async () => {
  const { H } = fakeHost({ mount: T.mountBuild });
  const { entry } = await T.addBuild({ name: 'real', overlays: [ov], range: range(), busy: probe });
  H.poll();
  await until(() => H.status().real?.listening);
  const url = `http://127.0.0.1:${entry.port}`;
  const o = await request(url + PAGE_JS);
  assert.equal(o.status, 200);
  assert.equal(o.text, '/* try-it overlay */\n');
  assert.equal(o.headers['x-mirror-source'], 'overlay');
  assert.equal(o.headers['cache-control'], 'no-store');
  const b = await request(url + PAGE_CSS, { headers: { 'accept-encoding': 'br' } });
  assert.equal(b.headers['x-mirror-source'], 'base');
  assert.equal(b.headers['cache-control'], 'no-store');
  assert.equal(b.text, readFileSync(join(fx.pretty, PAGE_CSS)).toString('utf8'));
  const doc = await request(url + '/');
  assert.equal(doc.headers['cache-control'], 'no-store');
  assert.match(doc.text, /__mirror\/vendor-shim\.js/, '--vendors=local rewrite');
  const info = JSON.parse((await request(url + '/__mirror/info')).text);
  assert.deepEqual([info.root, info.overlays.map((x) => x.dir), info.vendors, info.https, info.httpTwin], [fx.pretty, [ov], 'local', false, null]);
  T.removeBuild('real'); H.poll();
});

test('ensureHost/waitServed/buildRows: host.json names a live host; rows say served | idle | stopped | host-down', async () => {
  assert.equal(T.readHost(), null);
  assert.deepEqual(T.buildRows(), []);
  await T.addBuild({ name: 'r1', range: range(), busy: probe });
  assert.equal(T.buildRows()[0].state, 'host-down');
  // this process plays the host: host.json + status.json as runHost writes them
  const { H } = fakeHost({ onStatus: (builds) => writeFileSync(T.statusFile(), JSON.stringify({ pid: process.pid, builds })) });
  mkdirSync(T.tryitDir(), { recursive: true });
  writeFileSync(T.hostFile(), JSON.stringify({ pid: process.pid, startedAt: 'now' }));
  assert.deepEqual(await T.ensureHost(), { pid: process.pid, started: false }, 'a live host is reused, nothing spawned');
  H.poll();
  const { port } = await T.waitServed('r1', { timeoutMs: 3000 });
  assert.equal(port, T.getBuild('r1').port);
  assert.equal(T.buildRows()[0].state, 'idle');
  await request(`http://127.0.0.1:${port}/`);
  H.poll();
  assert.equal(T.buildRows()[0].state, 'served');
  T.setStopped('r1', true); H.poll();
  assert.equal(T.buildRows()[0].state, 'stopped');
  T.removeBuild('r1'); H.poll();
  writeFileSync(T.hostFile(), JSON.stringify({ pid: 2 ** 22 + 4321 }));
  assert.equal(T.readHost(), null, 'a dead pid is no host');
  assert.ok(!existsSync(join(T.tryitDir(), 'builds', 'r1.json')));
});
