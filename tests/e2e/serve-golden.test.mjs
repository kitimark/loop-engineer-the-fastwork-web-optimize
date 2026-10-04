// T-106: the request handling of tools/serve.mjs lives in tools/lib/mirror-handler.mjs (shared with the Try-it host,
// tools/tryit.mjs). Moving it must not change one byte of what the measurement servers (serve.mjs, fix.mjs serve/ab,
// verify.mjs, bench.mjs) send. This test serves the fixture baseline in several configurations, sends a fixed list of
// requests (overlay and baseline files, br/gzip/identity, ranges, ETag revalidation, HEAD, POST, the /__mirror and
// /__vendor routes, 404/403/traversal) and compares status, headers (minus Date/Connection/Keep-Alive) and the sha256
// of the raw body with tests/fixtures/serve-golden.json, recorded from serve.mjs BEFORE the extraction (main @ the
// I-131 fix). Paths of the temp fixture and ephemeral ports are normalized. FW_UPDATE_GOLDEN=1 rewrites the file (only
// for a deliberate change of what serve.mjs sends: say so in the commit, it affects A/B comparability).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, startServe, request, sha256, TESTS } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS, PAGE_CSS, CHUNK_JS, VENDOR_KEY } from '../fixtures/baseline.mjs';

const GOLDEN = join(TESTS, 'fixtures', 'serve-golden.json');
const CONFIGS = {
  plain: ['--root', 'site'],
  overlays: ['--root', 'site-pretty', '--overlay', '<ovA>,<ovB>', '--vendors=local'],
  off: ['--vendors=off', '--no-cache'],
  gzipFramed: ['--root', 'site-pretty', '--vendors=local', '--compress=gzip', '--frame-ancestors', 'http://localhost:5559,http://127.0.0.1:5559'],
  none: ['--compress=none', '--overlay', '<ovA>'],
  https: ['--https', '--overlay', '<ovB>', '--latency', '5'], // HTTP/2 + TLS (self-signed, made in the fixture home) + the http twin
};
const REQS = [
  ['GET', '/', {}],
  ['GET', '/', { 'accept-encoding': 'br, gzip' }],
  ['HEAD', '/', { 'accept-encoding': 'gzip' }],
  ['GET', '/index.html', { 'accept-encoding': 'gzip' }],
  ['GET', '/sub/', {}],
  ['GET', '/page', {}],
  ['GET', PAGE_JS, { 'accept-encoding': 'br' }],
  ['GET', PAGE_JS, { 'accept-encoding': 'gzip' }],
  ['GET', PAGE_JS, {}],
  ['GET', PAGE_JS, { range: 'bytes=0-9' }],
  ['GET', PAGE_JS, { range: 'bytes=999999-' }],
  ['GET', PAGE_JS, { 'if-none-match': '<etag>' }],
  ['GET', PAGE_CSS, { 'accept-encoding': 'br, gzip' }],
  ['GET', CHUNK_JS, { 'accept-encoding': 'br' }],
  ['GET', '/new-file.js', {}],
  ['GET', '/img/logo.png', { range: 'bytes=-5' }],
  ['GET', '/img/logo.png', { 'if-range': '"nope"', range: 'bytes=0-3' }],
  ['GET', '/_app/version.json', {}],
  ['GET', '/analytics.js', { 'accept-encoding': 'br' }],
  ['POST', '/api/waitlist', {}],
  ['POST', '/cdn-cgi/rum', {}],
  ['GET', '/cdn-cgi/x', {}],
  ['GET', '/__mirror/vendor-shim.js', { 'accept-encoding': 'br' }],
  ['GET', '/__mirror/null?h=api2.amplitude.com', {}],
  ['GET', '/__mirror/null?h=x.example', {}],
  ['GET', '/__mirror/info', {}],
  ['GET', `/__vendor/${VENDOR_KEY}`, { 'accept-encoding': 'gzip' }],
  ['GET', `/__vendor/${VENDOR_KEY}?v=2`, {}],
  ['GET', '/__vendor/nope.example/x.js', {}],
  ['GET', '/missing.js', {}],
  ['GET', '/.well-known/x', {}],
  ['GET', '/.mirror/manifest.json', {}],
  ['GET', '/%2e%2e/%2e%2e/etc/passwd', {}],
  ['GET', '/%E0%A4%A', {}],
];
const DROP = new Set(['date', 'connection', 'keep-alive', 'transfer-encoding']);

let fx, env, ovA, ovB;
const servers = [];
before(() => {
  const home = tempDir('fw-golden-');
  fx = makeFixtureHome(home);
  env = { FW_MIRROR_HOME: home };
  ovA = join(home, 'ovA'); ovB = join(home, 'ovB');
  for (const [d, files] of [[ovA, { [PAGE_JS]: '/* overlay A */\n'.repeat(40), '/new-file.js': 'console.log("new")\n' }], [ovB, { [PAGE_JS]: '/* overlay B */\n', [PAGE_CSS]: 'body{}\n'.repeat(60) }]]) {
    for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); }
  }
});
after(async () => { await Promise.all(servers.map((s) => s.stop())); });

const norm = (s) => String(s).split(fx.home).join('<HOME>').replace(/("snapshot": )"[^"]*"/, '$1"<SNAPSHOT>"').replace(/("httpTwin": )\d+/, '$1"<PORT>"');

async function record(args) {
  const s = await startServe(['--port', '0', '--quiet', ...args.map((a) => a.replace('<ovA>', ovA).replace('<ovB>', ovB))], { env });
  servers.push(s);
  const out = [];
  let etag = null;
  for (const [method, path, h] of REQS) {
    const headers = { ...h };
    if (headers['if-none-match'] === '<etag>') headers['if-none-match'] = etag || '"none"';
    const r = await request(s.url.replace(/\/$/, '') + path, { method, headers, decode: false });
    if (path === PAGE_JS && method === 'GET' && !h.range && !h['if-none-match']) etag = r.headers.etag || etag;
    const hd = Object.fromEntries(Object.entries(r.headers).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, norm(v)]).sort(([a], [b]) => a.localeCompare(b)));
    const body = path === '/__mirror/info' ? norm(r.raw.toString('utf8')) : null;
    out.push({ req: `${method} ${path} ${JSON.stringify(h)}`, status: r.status, headers: hd, body: body ?? sha256(r.raw) });
  }
  await s.stop();
  return out;
}

test('serve.mjs sends byte-identical responses (status, headers, bodies) to the recorded golden for overlay and baseline files (T-106 extraction is behaviour-neutral)', async () => {
  const got = {};
  for (const [name, args] of Object.entries(CONFIGS)) got[name] = await record(args);
  if (process.env.FW_UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n');
    if (process.env.FW_UPDATE_GOLDEN !== '1') assert.fail(`${GOLDEN} did not exist: recorded now; commit it and rerun`);
    return;
  }
  const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  for (const name of Object.keys(CONFIGS)) {
    assert.equal(got[name].length, want[name]?.length, `${name}: request count`);
    for (let i = 0; i < got[name].length; i++) assert.deepEqual(got[name][i], want[name][i], `${name}: ${got[name][i].req}`);
  }
  // the overlay config really serves overlay and baseline files (the golden covers both sources)
  const src = got.overlays.map((r) => r.headers['x-mirror-source']).filter(Boolean);
  assert.ok(src.includes('overlay') && src.includes('base'), `both sources covered: ${src}`);
});
