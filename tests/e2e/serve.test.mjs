// tools/serve.mjs against a fixture baseline ($FW_MIRROR_HOME): ports (auto / 0 / fixed / occupied),
// --state + MIRROR_URL, overlays + x-mirror-source, /__mirror/info, manifest headers, ETag/304,
// compression, --https, --latency, vendor modes (incl. vendor scripts always from site/: the SRI
// regression), the CSP egress fence, fallbacks, 404/403 and path traversal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import http2 from 'node:http2';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, startServe, startProc, node, tool, SLOW_EXIT, signalTwiceDuringExit, request, freePort, sha256, REPO, TESTS } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS, PAGE_CSS, CHUNK_JS, VENDOR_KEY, CSP_LOCAL, LINK, PNG } from '../fixtures/baseline.mjs';

let fx, env, ovA, ovB;
const servers = [];
async function serve(args, opts = {}) { const s = await startServe(args, { env, ...opts }); servers.push(s); return s; }
before(() => {
  const home = tempDir('fw-serve-');
  fx = makeFixtureHome(home);
  env = { FW_MIRROR_HOME: home };
  // two overlays: A patches the page JS and adds a new file, B patches the page JS and the CSS
  ovA = join(home, 'ovA'); ovB = join(home, 'ovB');
  for (const [d, files] of [[ovA, { [PAGE_JS]: '/* overlay A */\n', '/new-file.js': 'console.log("new")\n' }], [ovB, { [PAGE_JS]: '/* overlay B */\n', [PAGE_CSS]: 'body{}\n' }]]) {
    for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); }
  }
});
after(async () => { await Promise.all(servers.map((s) => s.stop())); });

test('--port 0 --state: MIRROR_URL line and state file agree; state file removed on exit', async () => {
  const stateFile = join(fx.home, 'out', 'serve-state.json');
  const s = await serve(['--port', '0', '--state', stateFile]);
  assert.match(s.stdout(), /fastwork mirror\s+root=.*\/site$/m);
  assert.match(s.url, /^http:\/\/localhost:\d+\/$/);
  const st = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(st.url, s.url);
  assert.equal(st.port, s.port);
  assert.equal(st.pid, s.proc.pid);
  assert.equal(st.root, fx.site);
  assert.equal(st.vendors, 'block');
  assert.equal(st.https, false);
  assert.equal((await request(s.url)).status, 200);
  await s.stop();
  assert.equal(existsSync(stateFile), false);
});

test('--state is complete on disk before MIRROR_URL is printed, even when the write is slow (incident I-014)', async () => {
  // Contract: MIRROR_URL= is the readiness line agents and tests wait for; the state file must already
  // exist (and be whole JSON) at that moment. The preload makes the state write take 1.5 s.
  const stateFile = join(fx.home, 'out', 'slow-state.json');
  const p = await startProc(process.execPath, ['--import', join(TESTS, 'fixtures', 'slow-state-write.mjs'), tool('serve.mjs'), '--port', '0', '--quiet', '--state', stateFile],
    { env: { ...env, SLOW_STATE_MS: '1500' } });
  servers.push(p);
  const seen = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null; // checked the moment MIRROR_URL appeared
  assert.ok(seen, 'state file missing when MIRROR_URL was printed');
  assert.equal(seen.url, p.url);
  assert.equal(seen.pid, p.proc.pid);
  await p.stop();
  assert.equal(existsSync(stateFile), false);
});

test('--state: a second SIGTERM while serve.mjs is exiting does not skip the state-file cleanup (incident I-009)', async () => {
  // fix.mjs ab signals its servers twice (signal handler, then its 'exit' listener). With process.once the
  // listener was gone after the first signal, so the second one killed serve.mjs before cleanup ran.
  const stateFile = join(fx.home, 'out', 'serve-state-2sig.json');
  const dir = tempDir('fw-2sig-');
  const s = await startProc(process.execPath, ['--import', SLOW_EXIT, tool('serve.mjs'), '--port', '0', '--state', stateFile], { env: { ...env, SLOW_EXIT_DIR: dir } });
  servers.push(s);
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).pid, s.proc.pid);
  assert.deepEqual(await signalTwiceDuringExit(s.proc, dir), { code: 0, signal: null }, 'exited via its handler, not killed by the second SIGTERM');
  assert.equal(existsSync(stateFile), false, 'state file removed');
});

test('--port auto: per-checkout port in 5200-5999; two servers from one checkout do not collide', async () => {
  const { autoPortBase } = await import('../../tools/lib/paths.mjs');
  const base = autoPortBase();
  const [a, b] = await Promise.all([serve(['--port', 'auto', '--quiet']), serve(['--port', 'auto', '--quiet'])]);
  assert.notEqual(a.port, b.port);
  for (const s of [a, b]) {
    assert.ok(s.port >= base && s.port < base + 60, `${s.port} not in [${base}, ${base + 60})`);
    assert.notEqual(s.port, 5173);
    assert.equal((await request(s.url + 'index.html')).status, 200);
  }
  await Promise.all([a.stop(), b.stop()]);
});

// a plain-http listener on one address (like the console server on 127.0.0.1); null when the port is taken already
const holdPort = (port, host) => new Promise((done) => {
  const srv = net.createServer((c) => c.end('HTTP/1.1 418 not the mirror\r\nconnection: close\r\n\r\n'));
  srv.once('error', () => done(null));
  srv.listen(port, host, () => done(srv));
});

test('--port auto skips a port another process listens on at 127.0.0.1 or 0.0.0.0 (I-065: localhost reached the console server)', async () => {
  const { autoPortBase } = await import('../../tools/lib/paths.mjs');
  const base = autoPortBase();
  // on macOS a listen on 0.0.0.0:p succeeded beside 127.0.0.1:p (SO_REUSEADDR), and https://localhost:p/ then reached the other process
  const holders = [await holdPort(base, '127.0.0.1'), await holdPort(base + 1, '0.0.0.0')];
  // and one on a LAN address, where the iPhone would reach the other process (when this Mac has one)
  const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
  if (lan) holders.push(await holdPort(base + 2, lan));
  const first = lan ? base + 3 : base + 2;
  try {
    for (const https of [false, true]) {
      const s = await serve(['--port', 'auto', '--quiet', ...(https ? ['--https'] : [])]);
      assert.ok(s.port >= first && s.port < base + 60, `${s.port}: not past the held ports ${base} (127.0.0.1), ${base + 1} (0.0.0.0)${lan ? `, ${base + 2} (LAN)` : ''}`);
      const r = await request(s.url + '__mirror/info');
      assert.equal(r.status, 200, 'localhost reaches this mirror server (the holders answer 418)');
      assert.equal(JSON.parse(r.text).root, fx.site);
      await s.stop();
    }
  } finally { for (const h of holders) h?.close(); }
});

test('fixed --port N listens on exactly N; an occupied fixed port fails loudly instead of moving', async () => {
  const p = await freePort();
  const s = await serve(['--port', String(p), '--quiet']);
  assert.equal(s.port, p);
  await s.stop();

  const blocker = net.createServer().listen(0, '0.0.0.0');
  await new Promise((r) => blocker.once('listening', r));
  const busy = blocker.address().port;
  try {
    const r = node(join(REPO, 'tools/serve.mjs'), ['--port', String(busy)], { env, timeout: 10000 });
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, new RegExp(`port ${busy} is already in use`));
    assert.doesNotMatch(r.stdout, /MIRROR_URL=/);
  } finally { blocker.close(); }
  // held on 127.0.0.1 only (I-065): before, serve bound 0.0.0.0:N beside it and printed MIRROR_URL for a port localhost does not reach
  const lo = await holdPort(await freePort(), '127.0.0.1');
  try {
    const n = lo.address().port;
    const r = node(join(REPO, 'tools/serve.mjs'), ['--port', String(n)], { env, timeout: 10000 });
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, new RegExp(`port ${n} is already in use \\(something listens on 127\\.0\\.0\\.1:${n}`));
    assert.doesNotMatch(r.stdout, /MIRROR_URL=/);
  } finally { lo.close(); }
  const bad = node(join(REPO, 'tools/serve.mjs'), ['--port', 'eighty'], { env });
  assert.equal(bad.code, 2);
});

test('bad invocations: missing manifest, missing --root, missing --overlay, bad --vendors', () => {
  const empty = tempDir('fw-empty-');
  let r = node(join(REPO, 'tools/serve.mjs'), ['--port', '0'], { env: { FW_MIRROR_HOME: empty } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /No .*manifest\.json/);
  r = node(join(REPO, 'tools/serve.mjs'), ['--port', '0', '--root', join(empty, 'nope')], { env });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--root .* does not exist/);
  r = node(join(REPO, 'tools/serve.mjs'), ['--port', '0', '--overlay', join(empty, 'nope')], { env });
  assert.equal(r.code, 2);
  r = node(join(REPO, 'tools/serve.mjs'), ['--port', '0', '--vendors', 'maybe'], { env });
  assert.equal(r.code, 2);
});

test('baseline files are byte-identical; manifest MIME + cache headers; document headers + local CSP', async () => {
  const s = await serve(['--port', '0', '--quiet']);
  const js = await request(s.url + PAGE_JS.slice(1), { headers: { 'accept-encoding': 'identity' } });
  assert.equal(js.status, 200);
  assert.equal(js.body.toString(), fx.min[PAGE_JS]);
  assert.equal(js.headers['content-type'], 'application/javascript');
  assert.equal(js.headers['cache-control'], 'public, max-age=1, must-revalidate');
  assert.equal(js.headers['x-mirror-source'], undefined, 'no overlay header without --overlay');
  const png = await request(s.url + 'img/logo.png');
  assert.deepEqual(png.body, PNG);
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal(png.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(png.headers['content-encoding'], undefined, 'images are not compressed');

  const doc = await request(s.url);
  assert.equal(doc.text, fx.html);
  assert.equal(doc.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(doc.headers['cache-control'], 'public, max-age=0, must-revalidate');
  assert.equal(doc.headers.link, LINK);
  assert.equal(doc.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(doc.headers['cross-origin-opener-policy'], 'same-origin');
  // egress fence: production CSP minus every third-party origin
  assert.equal(doc.headers['content-security-policy'], CSP_LOCAL);
  assert.doesNotMatch(doc.headers['content-security-policy'], /https?:|wss?:|\*\./);

  const nc = await serve(['--port', '0', '--quiet', '--no-cache']);
  assert.equal((await request(nc.url + PAGE_JS.slice(1))).headers['cache-control'], 'no-store');
  await Promise.all([s.stop(), nc.stop()]);
});

test('ETag / If-None-Match -> 304; ETag changes when the file changes', async () => {
  const s = await serve(['--port', '0', '--quiet', '--root', 'site-pretty']);
  const r1 = await request(s.url + CHUNK_JS.slice(1));
  assert.match(r1.headers.etag, /^"[\w-]{20}"$/);
  const r2 = await request(s.url + CHUNK_JS.slice(1), { headers: { 'if-none-match': r1.headers.etag } });
  assert.equal(r2.status, 304);
  assert.equal(r2.raw.length, 0);
  const r3 = await request(s.url + CHUNK_JS.slice(1), { headers: { 'if-none-match': '"stale"' } });
  assert.equal(r3.status, 200);
  await s.stop();
});

test('compression: br by default, gzip when asked, none with --compress=none; decoded bytes identical', async () => {
  const s = await serve(['--port', '0', '--quiet']);
  const br = await request(s.url + PAGE_CSS.slice(1), { headers: { 'accept-encoding': 'gzip, deflate, br' } });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(br.headers.vary, 'accept-encoding');
  assert.equal(br.body.toString(), fx.min[PAGE_CSS]);
  const gz = await request(s.url + PAGE_CSS.slice(1), { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(gz.body.toString(), fx.min[PAGE_CSS]);
  const none = await serve(['--port', '0', '--quiet', '--compress=none']);
  const n = await request(none.url + PAGE_CSS.slice(1), { headers: { 'accept-encoding': 'br' } });
  assert.equal(n.headers['content-encoding'], undefined);
  await Promise.all([s.stop(), none.stop()]);
});

test('overlays: first overlay wins, then the next, then the root; x-mirror-source says which', async () => {
  const s = await serve(['--port', '0', '--quiet', '--root', 'site-pretty', '--overlay', `${ovA},${ovB}`]);
  const js = await request(s.url + PAGE_JS.slice(1));
  assert.equal(js.text, '/* overlay A */\n');
  assert.equal(js.headers['x-mirror-source'], 'overlay');
  assert.equal(js.headers['content-type'], 'application/javascript', 'manifest headers still apply to overlay files');
  const css = await request(s.url + PAGE_CSS.slice(1));
  assert.equal(css.text, 'body{}\n');
  assert.equal(css.headers['x-mirror-source'], 'overlay');
  const chunk = await request(s.url + CHUNK_JS.slice(1));
  assert.equal(chunk.text, fx.prettyFiles[CHUNK_JS]);
  assert.equal(chunk.headers['x-mirror-source'], 'base');
  const added = await request(s.url + 'new-file.js');
  assert.equal(added.status, 200);
  assert.equal(added.headers['x-mirror-source'], 'overlay');

  const info = JSON.parse((await request(s.url + '__mirror/info')).text);
  assert.equal(info.root, fx.pretty);
  assert.equal(info.vendors, 'block');
  assert.equal(info.latency, 0);
  assert.equal(info.https, false);
  assert.deepEqual(info.overlays.map((o) => o.dir), [ovA, ovB]);
  assert.deepEqual(info.overlays[0].files.sort(), ['/_app/immutable/nodes/2.fixture.js', '/new-file.js']);
  await s.stop();
});

test('fallbacks, 404 (logged for mirror.mjs --missing), 403 on .mirror/, path traversal, POST handling', async () => {
  const s = await serve(['--port', '0', '--quiet']);
  assert.match((await request(s.url + 'sub')).text, /sub index/);
  assert.match((await request(s.url + 'sub/')).text, /sub index/);
  assert.match((await request(s.url + 'page')).text, /page html/);
  const nf = await request(s.url + 'nope/missing.js');
  assert.equal(nf.status, 404);
  assert.equal(nf.headers['cache-control'], 'no-store');
  assert.match(nf.text, /404 not mirrored: \/nope\/missing\.js/);
  assert.match(readFileSync(join(fx.site, '.mirror', 'missing-local.txt'), 'utf8'), /^\/nope\/missing\.js$/m);
  assert.equal((await request(s.url + '.mirror/manifest.json')).status, 403);
  // escaping the root (to /etc or to the sibling site-pretty/ tree) is a 404; re-entering it is fine
  for (const p of ['%2e%2e/%2e%2e/etc/passwd', '..%2f..%2f..%2fetc%2fpasswd', '%2e%2e%2fsite-pretty%2findex.html']) {
    const r = await request(s.url + p);
    assert.equal(r.status, 404, p);
    assert.doesNotMatch(r.text, /root:|<html/);
  }
  assert.equal((await request(s.url + '%2e%2e%2fsite%2f.mirror%2fmanifest.json')).status, 403);
  const api = await request(s.url + 'api/waitlist', { method: 'POST', body: '{}' });
  assert.equal(api.status, 503);
  assert.match(api.text, /offline mirror/);
  assert.equal((await request(s.url + 'cdn-cgi/rum', { method: 'POST', body: 'x' })).status, 204);
  assert.equal((await request(s.url + 'cdn-cgi/anything')).status, 204);
  const amp = await request(s.url + '__mirror/null?h=api2.amplitude.com');
  assert.equal(amp.status, 200);
  assert.match(amp.text, /events_ingested/);
  assert.equal((await request(s.url + '__mirror/null?h=www.google-analytics.com')).status, 204);
  const head = await request(s.url + PAGE_JS.slice(1), { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.raw.length, 0);
  await s.stop();
});

test('--vendors=block (default): no vendor scripts, HTML untouched', async () => {
  const s = await serve(['--port', '0', '--quiet']);
  assert.equal((await request(s.url + '__vendor/' + VENDOR_KEY)).status, 404);
  assert.doesNotMatch((await request(s.url)).text, /vendor-shim/);
  await s.stop();
});

test('--vendors=local: shim injected, beacon src rewritten, vendor script always from byte-identical site/ (SRI)', async () => {
  const s = await serve(['--port', '0', '--quiet', '--vendors=local', '--root', 'site-pretty', '--overlay', ovA]);
  const doc = (await request(s.url)).text;
  assert.ok(doc.includes('<script src="/__mirror/vendor-shim.js"></script><script src="/analytics.js"></script>'), doc);
  assert.ok(doc.includes(`src="/__vendor/${VENDOR_KEY}"`));
  assert.ok(!doc.includes('src="https://static.cloudflareinsights.com'));
  const shim = await request(s.url + '__mirror/vendor-shim.js');
  assert.equal(shim.status, 200);
  assert.equal(shim.text, readFileSync(join(REPO, 'tools', 'vendor-shim.js'), 'utf8'));
  // the regression: --root site-pretty must NOT serve the reformatted vendor copy (SRI would fail)
  const v = await request(s.url + '__vendor/' + VENDOR_KEY);
  assert.equal(v.status, 200);
  assert.equal(v.text, fx.vendorMin);
  assert.notEqual(v.text, fx.vendorPretty);
  assert.equal(v.headers['content-type'], 'text/javascript;charset=UTF-8');
  assert.equal(sha256(v.body), sha256(readFileSync(join(fx.site, '__vendor', VENDOR_KEY))));
  // a changed cache-buster query still finds the saved script
  assert.equal((await request(s.url + '__vendor/' + VENDOR_KEY + '?v=2')).status, 200);
  // unknown vendor script -> 404 and logged
  assert.equal((await request(s.url + '__vendor/unknown.example.com/x.js')).status, 404);
  assert.match(readFileSync(join(fx.site, '.mirror', 'missing-local.txt'), 'utf8'), /^\/__vendor\/unknown\.example\.com\/x\.js$/m);
  const info = JSON.parse((await request(s.url + '__mirror/info')).text);
  assert.equal(info.vendors, 'local');
  assert.equal(info.rewrites.length, 2);
  await s.stop();
});

test('--vendors=off: first-party /analytics.js becomes a no-op', async () => {
  const s = await serve(['--port', '0', '--quiet', '--vendors=off']);
  assert.match((await request(s.url + 'analytics.js')).text, /analytics disabled/);
  await s.stop();
});

test('--https: self-signed cert created under the mirror home, HTTP/1.1 fallback works', async () => {
  const s = await serve(['--port', '0', '--https', '--quiet']);
  assert.match(s.url, /^https:\/\/localhost:\d+\/$/);
  assert.ok(existsSync(join(fx.home, 'out', 'certs', 'selfsigned-cert.pem')));
  assert.ok(existsSync(join(fx.home, 'out', 'certs', 'selfsigned-key.pem')));
  const r = await request(s.url + PAGE_JS.slice(1));
  assert.equal(r.status, 200);
  assert.equal(r.text, fx.min[PAGE_JS]);
  const info = JSON.parse((await request(s.url + '__mirror/info')).text);
  assert.equal(info.https, true);
  await s.stop();
});

test('--https also serves a plain-http twin of the same files for the iPhone; --no-http-twin turns it off (incident I-003)', async () => {
  // iOS Safari stops at its certificate warning for a self-signed cert on every new port, so the
  // iPhone needs a plain-http URL of the same server (tools/iphone.mjs open switches to it).
  const stateFile = join(fx.home, 'out', 'serve-twin.json');
  const s = await serve(['--port', '0', '--https', '--state', stateFile]);
  const info = JSON.parse((await request(s.url + '__mirror/info')).text);
  assert.equal(info.https, true);
  assert.equal(info.selfSigned, true);
  assert.ok(Number.isInteger(info.httpTwin) && info.httpTwin > 0 && info.httpTwin !== s.port, JSON.stringify(info));
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).httpTwin, info.httpTwin);
  const twin = `http://localhost:${info.httpTwin}/`;
  assert.match(s.stdout(), new RegExp(`^  http twin: ${twin.replace(/[./]/g, '\\$&')} `, 'm'));
  assert.match(s.stdout(), /^MIRROR_URL=https:/m); // the machine-readable URL stays the https one (Chrome A/B)
  const [a, b] = await Promise.all([request(s.url + PAGE_JS.slice(1)), request(twin + PAGE_JS.slice(1))]);
  assert.equal(b.status, 200);
  assert.equal(b.text, a.text);
  assert.equal(JSON.parse((await request(twin + '__mirror/info')).text).httpTwin, info.httpTwin);
  await s.stop();
  await assert.rejects(request(twin), (e) => e.code === 'ECONNREFUSED'); // the twin goes away with the server

  const off = await serve(['--port', '0', '--https', '--quiet', '--no-http-twin']);
  assert.equal(JSON.parse((await request(off.url + '__mirror/info')).text).httpTwin, null);
  const plain = await serve(['--port', '0', '--quiet']);
  const pi = JSON.parse((await request(plain.url + '__mirror/info')).text);
  assert.equal(pi.httpTwin, null);
  assert.equal(pi.selfSigned, false);
  await Promise.all([off.stop(), plain.stop()]);
});

test('--latency N delays every response by about N ms', async () => {
  const [fast, slow] = await Promise.all([serve(['--port', '0', '--quiet']), serve(['--port', '0', '--quiet', '--latency', '300'])]);
  await request(fast.url); await request(slow.url); // warm up
  const f = await request(fast.url + CHUNK_JS.slice(1));
  const sl = await request(slow.url + CHUNK_JS.slice(1));
  assert.ok(sl.ms >= 290, `slow ${sl.ms} ms`);
  assert.ok(f.ms < 250, `fast ${f.ms} ms`);
  assert.match(slow.stdout(), /latency=\+300ms/);
  await Promise.all([fast.stop(), slow.stop()]);
});

test('HTTP Range (incident I-054): 206 for bytes=a-b / a- / -n on overlay and baseline files, 416, Accept-Ranges, HEAD', async () => {
  // iOS Safari plays <video> media only from servers that answer byte-range requests (Apple, Safari Web
  // Content Guide, "Configuring Your Server"); without them an overlay mp4 never fired loadeddata.
  const ovV = join(fx.home, 'ovV');
  const MP4 = Buffer.from(Array.from({ length: 1000 }, (_, i) => (i * 7) & 0xff));
  mkdirSync(join(ovV, 'media'), { recursive: true });
  writeFileSync(join(ovV, 'media', 'clip.mp4'), MP4);
  const s = await serve(['--port', '0', '--overlay', ovV]);
  const clip = s.url + 'media/clip.mp4';

  const full = await request(clip);
  assert.equal(full.status, 200);
  assert.deepEqual(full.body, MP4);
  assert.equal(full.headers['accept-ranges'], 'bytes', 'a 200 advertises ranges');
  assert.equal(full.headers['content-type'], 'video/mp4');
  assert.equal(full.headers['x-mirror-source'], 'overlay');

  const probe = await request(clip, { headers: { range: 'bytes=0-1' } }); // Safari's first media request
  assert.equal(probe.status, 206);
  assert.equal(probe.headers['content-range'], 'bytes 0-1/1000');
  assert.equal(probe.headers['content-length'], '2');
  assert.equal(probe.headers['accept-ranges'], 'bytes');
  assert.equal(probe.headers['content-type'], 'video/mp4');
  assert.equal(probe.headers['x-mirror-source'], 'overlay');
  assert.equal(probe.headers['cache-control'], full.headers['cache-control']);
  assert.equal(probe.headers.etag, full.headers.etag);
  assert.deepEqual(probe.body, MP4.subarray(0, 2));

  for (const [range, start, end] of [['bytes=100-199', 100, 199], ['bytes=900-', 900, 999], ['bytes=-50', 950, 999], ['bytes=990-5000', 990, 999], ['bytes=-5000', 0, 999]]) {
    const r = await request(clip, { headers: { range } });
    assert.equal(r.status, 206, range);
    assert.equal(r.headers['content-range'], `bytes ${start}-${end}/1000`, range);
    assert.equal(r.headers['content-length'], String(end - start + 1), range);
    assert.deepEqual(r.body, MP4.subarray(start, end + 1), range);
  }

  for (const range of ['bytes=1000-', 'bytes=5000-6000', 'bytes=-0']) {
    const r = await request(clip, { headers: { range } });
    assert.equal(r.status, 416, range);
    assert.equal(r.headers['content-range'], 'bytes */1000', range);
    assert.equal(r.raw.length, 0, range);
  }
  // ignored (full 200): multi-range (documented choice), invalid syntax, other units, a stale If-Range
  for (const headers of [{ range: 'bytes=0-1,10-11' }, { range: 'bytes=5-2' }, { range: 'items=0-1' }, { range: 'bytes=0-1', 'if-range': '"stale"' }]) {
    const r = await request(clip, { headers });
    assert.equal(r.status, 200, JSON.stringify(headers));
    assert.deepEqual(r.body, MP4, JSON.stringify(headers));
  }
  assert.equal((await request(clip, { headers: { range: 'bytes=0-1', 'if-range': full.headers.etag } })).status, 206, 'a matching If-Range keeps the range');
  assert.equal((await request(clip, { headers: { range: 'bytes=0-1', 'if-none-match': full.headers.etag } })).status, 304, 'If-None-Match still wins');

  const head = await request(clip, { method: 'HEAD', headers: { range: 'bytes=10-19' } });
  assert.equal(head.status, 206);
  assert.equal(head.headers['content-range'], 'bytes 10-19/1000');
  assert.equal(head.headers['content-length'], '10');
  assert.equal(head.raw.length, 0);
  const head200 = await request(clip, { method: 'HEAD' });
  assert.equal(head200.status, 200);
  assert.equal(head200.headers['accept-ranges'], 'bytes');
  assert.equal(head200.headers['content-length'], '1000');
  assert.equal(head200.raw.length, 0);
  const head416 = await request(clip, { method: 'HEAD', headers: { range: 'bytes=2000-' } });
  assert.equal(head416.status, 416);
  assert.equal(head416.headers['content-range'], 'bytes */1000');

  // a baseline (root) file gets ranges too
  const png = await request(s.url + 'img/logo.png', { headers: { range: 'bytes=1-3' } });
  assert.equal(png.status, 206);
  assert.equal(png.headers['x-mirror-source'], 'base');
  assert.equal(png.headers['content-range'], `bytes 1-3/${PNG.length}`);
  assert.equal(png.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.deepEqual(png.body, PNG.subarray(1, 4));
  assert.match(s.stdout(), /^206 GET \/media\/clip\.mp4 /m, 'the log line names the real status');
  assert.match(s.stdout(), /^416 GET \/media\/clip\.mp4 /m);
  await s.stop();
});

test('HTTP Range (incident I-054): compressed and rewritten bodies neither advertise nor honour ranges; https and --latency still apply', async () => {
  const s = await serve(['--port', '0', '--quiet', '--vendors=local', '--https', '--latency', '200']);
  // a compressed response (br) is another representation: Range is ignored and no Accept-Ranges is sent (as nginx's gzip filter)
  const br = await request(s.url + PAGE_CSS.slice(1), { headers: { 'accept-encoding': 'br', range: 'bytes=0-3' } });
  assert.equal(br.status, 200);
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(br.headers['accept-ranges'], undefined);
  assert.equal(br.body.toString(), fx.min[PAGE_CSS]);
  // the same file sent uncompressed is the file's own bytes: ranges apply (over https too)
  const id = await request(s.url + PAGE_CSS.slice(1), { headers: { 'accept-encoding': 'identity', range: 'bytes=0-3' } });
  assert.equal(id.status, 206);
  assert.equal(id.headers['content-encoding'], undefined);
  assert.equal(id.headers['accept-ranges'], 'bytes');
  assert.equal(id.text, fx.min[PAGE_CSS].slice(0, 4));
  assert.ok(id.ms >= 190, `--latency applies to range responses (${id.ms} ms)`);
  // the same over HTTP/2 (what Safari and Chrome speak to --https)
  const h2 = await new Promise((res, rej) => {
    const session = http2.connect(s.url, { rejectUnauthorized: false });
    session.on('error', rej);
    const st = session.request({ ':path': '/img/logo.png', range: 'bytes=-4' });
    const chunks = []; let hdrs;
    st.on('response', (h) => { hdrs = h; });
    st.on('data', (c) => chunks.push(c));
    st.on('end', () => { session.close(); res({ headers: hdrs, body: Buffer.concat(chunks) }); });
    st.on('error', rej);
  });
  assert.equal(h2.headers[':status'], 206);
  assert.equal(h2.headers['content-range'], `bytes ${PNG.length - 4}-${PNG.length - 1}/${PNG.length}`);
  assert.deepEqual(h2.body, PNG.subarray(PNG.length - 4));
  // the rewritten document (vendor-shim injection) never advertises or honours ranges, compressed or not
  for (const ae of ['identity', 'br']) {
    const doc = await request(s.url, { headers: { 'accept-encoding': ae, range: 'bytes=0-3' } });
    assert.equal(doc.status, 200, ae);
    assert.equal(doc.headers['accept-ranges'], undefined, ae);
    assert.match(doc.text, /vendor-shim\.js/, ae);
  }
  const shim = await request(s.url + '__mirror/vendor-shim.js', { headers: { 'accept-encoding': 'identity', range: 'bytes=0-3' } });
  assert.equal(shim.status, 200);
  assert.equal(shim.headers['accept-ranges'], undefined);
  await s.stop();
});

// ---- I-074: --frame-ancestors (the console's "Try it" panel frames the mirror) ----------------------------------------
// serve.mjs is measurement-adjacent: without the flag every response must stay byte-for-byte what it was.
const PINNED_DOC_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=0, must-revalidate',
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'access-control-allow-origin': '*',
  'content-security-policy': CSP_LOCAL,
  link: LINK,
  'accept-ranges': 'bytes',
};
const VOLATILE = ['date', 'connection', 'etag', 'content-length', 'keep-alive'];
const stable = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !VOLATILE.includes(k)));

test('I-074: without --frame-ancestors the document headers are unchanged (pinned list, in order) and there is no framing line or state key', async () => {
  const stateFile = join(fx.home, 'out', 'serve-noframe.json');
  const s = await serve(['--port', '0', '--state', stateFile]);
  const doc = await request(s.url, { headers: { 'accept-encoding': 'identity' } });
  assert.deepEqual(stable(doc.headers), PINNED_DOC_HEADERS);
  assert.deepEqual(Object.keys(stable(doc.headers)), Object.keys(PINNED_DOC_HEADERS), 'same header order');
  assert.doesNotMatch(s.stdout(), /framing:/);
  assert.equal('frameAncestors' in JSON.parse(readFileSync(stateFile, 'utf8')), false);
  assert.equal('frameAncestors' in JSON.parse((await request(s.url + '__mirror/info')).text), false);
  await s.stop();
});

test('I-074: --frame-ancestors drops x-frame-options and names the origins in the document CSP; nothing else changes', async () => {
  const stateFile = join(fx.home, 'out', 'serve-frame.json');
  const [plain, framed, one] = await Promise.all([
    serve(['--port', '0', '--quiet']),
    serve(['--port', '0', '--state', stateFile, '--frame-ancestors', 'http://localhost:5559,http://127.0.0.1:5559']),
    serve(['--port', '0', '--quiet', '--frame-ancestors=http://127.0.0.1:6001', '--overlay', ovA]),
  ]);
  const want = "frame-ancestors 'self' http://localhost:5559 http://127.0.0.1:5559";
  for (const path of ['', 'sub/', 'page.html']) {
    const a = await request(plain.url + path, { headers: { 'accept-encoding': 'identity' } });
    const b = await request(framed.url + path, { headers: { 'accept-encoding': 'identity' } });
    assert.equal(b.status, 200, path);
    assert.equal(b.headers['x-frame-options'], undefined, path);
    const csp = b.headers['content-security-policy'];
    assert.equal((csp.match(/frame-ancestors/g) || []).length, 1, `${path}: one frame-ancestors directive (a second is ignored)`);
    assert.ok(csp.includes(want), `${path}: ${csp}`);
    // the CSP is the plain one with only that directive replaced (or appended when the page had none)
    const plainCsp = a.headers['content-security-policy'];
    assert.equal(csp, /frame-ancestors/.test(plainCsp) ? plainCsp.replace("frame-ancestors 'self'", want) : `${plainCsp}; ${want}`, path);
    const rest = (h) => { const x = stable(h); delete x['x-frame-options']; delete x['content-security-policy']; return x; };
    assert.deepEqual(rest(b.headers), rest(a.headers), `${path}: every other header as without the flag`);
    assert.equal(b.text, a.text, `${path}: same body`);
  }
  // non-documents: identical with and without the flag
  for (const path of [PAGE_JS.slice(1), 'img/logo.png', 'nope']) {
    const a = await request(plain.url + path), b = await request(framed.url + path);
    assert.equal(b.status, a.status, path);
    assert.deepEqual(stable(b.headers), stable(a.headers), path);
  }
  assert.match(framed.stdout(), /framing: documents may be framed by http:\/\/localhost:5559 http:\/\/127\.0\.0\.1:5559/);
  assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).frameAncestors, ['http://localhost:5559', 'http://127.0.0.1:5559']);
  assert.deepEqual(JSON.parse((await request(framed.url + '__mirror/info')).text).frameAncestors, ['http://localhost:5559', 'http://127.0.0.1:5559']);
  // the = form, with an overlay
  const o = await request(one.url);
  assert.equal(o.headers['x-frame-options'], undefined);
  assert.match(o.headers['content-security-policy'], /frame-ancestors 'self' http:\/\/127\.0\.0\.1:6001(;|$)/);
  assert.equal((await request(one.url + PAGE_JS.slice(1))).headers['x-mirror-source'], 'overlay');
  await Promise.all([plain.stop(), framed.stop(), one.stop()]);
});

test('I-074: --frame-ancestors accepts only exact localhost / 127.0.0.1 origins with a port (else exit 2, nothing served)', () => {
  for (const bad of [[], ['--quiet'], ['http://evil.example:5559'], ['http://localhost'], ['http://localhost:5559/'], ['http://localhost:5559/proposals'],
    ['*'], ["'none'"], ['http://localhost:70000'], ['http://localhost:0'], ['localhost:5559'], ['ws://localhost:5559'], ['http://192.168.1.2:5559'],
    ['http://localhost:5559,https://evil.example:1'], ['http://localhost.evil.example:5559']]) {
    const r = node(join(REPO, 'tools/serve.mjs'), ['--port', '0', '--frame-ancestors', ...bad], { env, timeout: 10000 });
    assert.equal(r.code, 2, `${JSON.stringify(bad)}: ${r.out}`);
    assert.match(r.stderr, /--frame-ancestors/, JSON.stringify(bad));
    assert.doesNotMatch(r.stdout, /MIRROR_URL=/, JSON.stringify(bad));
  }
});
