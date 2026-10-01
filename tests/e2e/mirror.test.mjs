// tools/mirror.mjs against a local fixture origin (never the live site): resource discovery from
// HTML / Link header / CSS / JS (imports, new URL, template literals) / SVG / webmanifest, robots.txt,
// NEVER-list, manifest headers + sha256, 404 + redirect bookkeeping, and the second run's caching
// (hashed files not re-fetched, HTML revalidated with If-None-Match -> 304), and the snapshot guard (a
// committed site/ is re-mirrored only with --new-snapshot, never staged or committed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, nodeAsync, tool, sha256, git } from '../helpers.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ROUTES = {
  '/robots.txt': ['text/plain', 'User-agent: *\nDisallow: /private/\nAllow: /private/ok.js\n'],
  '/': ['text/html; charset=utf-8', `<!doctype html><html><head>
<link rel="stylesheet" href="/_app/a.css"><link rel="canonical" href="/canonical-page"><link rel="manifest" href="/site.webmanifest">
<meta property="og:image" content="/og.png"><script type="module" src="/_app/entry.js"></script>
<script src="/private/secret.js"></script><script src="/private/ok.js"></script>
<script>import("/_app/dyn.js")</script>
<style>.hero{background:url(/img/bg.png)}</style></head>
<body><a href="/nav-link">x</a><img src="/img/a.png" srcset="/img/a.png 1x, /img/a@2x.png 2x">
<div style="background-image:url('/img/inline.png')"></div><img src="data:image/png;base64,AAAA">
<img src="https://cdn.example.com/other-origin.png"><img src="/img/moved.png"><img src="/img/gone.png"></body></html>`, { link: '</_app/pre.js>; rel="modulepreload"', 'content-security-policy': "default-src 'self'", etag: '"doc-v1"' }],
  '/_app/a.css': ['text/css', '@import "/_app/b.css";\n.a{background:url("/img/c.svg")}\n.d{background:url(data:image/svg+xml;utf8,<svg><use href="#x"/></svg>)}\n@font-face{src:url(/fonts/f.woff2) format("woff2")}\n', { 'cache-control': 'public, max-age=1, must-revalidate' }],
  '/_app/b.css': ['text/css', '.b{color:red}\n'],
  '/_app/entry.js': ['application/javascript', 'import{x}from"./chunk.js";const gD=`/selling`;const r=`${gD}/r1.jpg`;const w=new URL("./worker.js",import.meta.url);fetch("/api/data.json");const s="/__data.json";export{r,w};\n'],
  '/_app/chunk.js': ['application/javascript', 'export const x=1;\n'],
  '/_app/dyn.js': ['application/javascript', 'export default 1;\n'],
  '/_app/pre.js': ['application/javascript', 'export const pre=1;\n'],
  '/_app/worker.js': ['application/javascript', 'self.x=1;\n'],
  '/_app/version.json': ['application/json', '{"version":"1"}'],
  '/private/ok.js': ['application/javascript', 'window.ok=1;\n'],
  '/private/secret.js': ['application/javascript', 'window.secret=1;\n'],
  '/img/c.svg': ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><image href="/img/from-svg.png"/></svg>'],
  '/site.webmanifest': ['application/manifest+json', '{"icons":[{"src":"/icon-192.png"}]}'],
  '/selling/r1.jpg': ['image/jpeg', PNG, { 'cache-control': 'public, max-age=31536000, immutable' }],
  '/img/moved.png': null, // 301 -> /img/new-home.png
};
for (const p of ['/img/bg.png', '/img/a.png', '/img/a@2x.png', '/img/inline.png', '/img/from-svg.png', '/img/new-home.png', '/icon-192.png', '/fonts/f.woff2']) ROUTES[p] = ['image/png', PNG];

let server, origin;
const hits = [];
before(async () => {
  server = http.createServer((req, res) => {
    const path = req.url;
    hits.push({ path, inm: req.headers['if-none-match'], ua: req.headers['user-agent'], accept: req.headers.accept });
    if (path === '/img/moved.png') { res.writeHead(301, { location: '/img/new-home.png' }); return res.end(); }
    const r = ROUTES[path];
    if (!r) { res.writeHead(404); return res.end('nope'); }
    const [type, body, extra = {}] = r;
    if (extra.etag && req.headers['if-none-match'] === extra.etag) { res.writeHead(304, { etag: extra.etag }); return res.end(); }
    res.writeHead(200, { 'content-type': type, ...extra });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

let out;
const mirror = (...a) => nodeAsync(tool('mirror.mjs'), ['--origin', origin, '--out', out, '--delay', '0', ...a]);
const manifest = () => JSON.parse(readFileSync(join(out, '.mirror', 'manifest.json'), 'utf8'));

test('first run: discovers every resource, honours robots.txt, records headers and hashes', async () => {
  out = join(tempDir('fw-mirror-'), 'site');
  const r = await mirror();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /robots\.txt \(200\): Disallow \/private\/, Allow \/private\/ok\.js/);
  const m = manifest();
  assert.equal(m.origin, origin, 'a new manifest records the origin it was mirrored from');
  const expected = ['/', '/_app/a.css', '/_app/b.css', '/_app/entry.js', '/_app/chunk.js', '/_app/dyn.js', '/_app/pre.js', '/_app/worker.js', '/_app/version.json',
    '/private/ok.js', '/img/c.svg', '/img/from-svg.png', '/fonts/f.woff2', '/site.webmanifest', '/icon-192.png', '/selling/r1.jpg',
    '/img/bg.png', '/img/a.png', '/img/a@2x.png', '/img/inline.png', '/img/new-home.png', '/robots.txt'];
  for (const p of expected) {
    assert.equal(m.files[p]?.status, 200, `${p} should be mirrored`);
    const f = join(out, p === '/' ? 'index.html' : p.slice(1));
    assert.ok(existsSync(f), f);
    assert.equal(m.files[p].sha256, sha256(readFileSync(f)), p);
    assert.equal(m.files[p].size, readFileSync(f).length);
  }
  // never fetched: robots-disallowed, <a href>, canonical, og:image, NEVER-list (api, __data.json), other origins, data:
  const fetched = new Set(hits.map((h) => h.path));
  for (const p of ['/private/secret.js', '/nav-link', '/canonical-page', '/og.png', '/api/data.json', '/__data.json', '/other-origin.png']) assert.ok(!fetched.has(p), `${p} must not be requested`);
  assert.match(r.stdout, /robots\.txt disallows \/private\/secret\.js/);
  // production headers replayed later by serve.mjs
  assert.equal(m.files['/'].type, 'text/html; charset=utf-8');
  assert.equal(m.files['/'].link, '</_app/pre.js>; rel="modulepreload"');
  assert.equal(m.files['/'].csp, "default-src 'self'");
  assert.equal(m.files['/'].etag, '"doc-v1"');
  assert.equal(m.files['/_app/a.css'].cacheControl, 'public, max-age=1, must-revalidate');
  assert.equal(m.files['/_app/a.css'].csp, undefined, 'CSP only recorded for documents');
  assert.equal(m.files['/selling/r1.jpg'].cacheControl, 'public, max-age=31536000, immutable');
  // redirects and 404s are bookkept
  assert.deepEqual(m.files['/img/moved.png'], { status: 301, location: '/img/new-home.png' });
  assert.equal(m.missing['/img/gone.png'], 404);
  assert.equal(m.missing['/_app/env.js'], 404);
  // source-map probe
  assert.equal(m.sourceMaps['/_app/entry.js'], 'none');
  assert.equal(m.missing['/_app/entry.js.map'], 404);
  // browser-like request headers (Cloudflare only injects its beacon for browser-looking requests)
  const doc = hits.find((h) => h.path === '/');
  assert.match(doc.ua, /Chrome\//);
  assert.match(doc.accept, /^text\/html/);
});

test('second run: cached hashed files are not re-fetched, HTML is revalidated (304), 404s not retried', async () => {
  hits.length = 0;
  const r = await mirror();
  assert.equal(r.code, 0, r.out);
  const paths = hits.map((h) => h.path);
  assert.ok(!paths.includes('/_app/entry.js'), 'immutable-ish assets come from the cache');
  assert.ok(!paths.includes('/selling/r1.jpg'));
  assert.ok(!paths.includes('/img/gone.png'), 'known 404s are not retried without --missing');
  const doc = hits.find((h) => h.path === '/');
  assert.equal(doc.inm, '"doc-v1"', 'the document is revalidated with If-None-Match');
  assert.match(r.stdout, /304 1/);
  assert.ok(paths.includes('/robots.txt'));
  assert.equal(manifest().files['/'].sha256, sha256(readFileSync(join(out, 'index.html'))));
});

test('--refresh re-downloads everything', async () => {
  hits.length = 0;
  const r = await mirror('--refresh', '--no-sourcemap-probe');
  assert.equal(r.code, 0, r.out);
  const paths = hits.map((h) => h.path);
  assert.ok(paths.includes('/_app/entry.js'));
  assert.equal(hits.find((h) => h.path === '/').inm, undefined);
});

test('a committed site/ (the baseline snapshot) is only re-mirrored with --new-snapshot, into the working tree, never committed', async () => {
  const repo = tempDir('fw-mirror-snap-');
  git(repo, 'init', '-q', '-b', 'main');
  cpSync(tool('mirror.mjs'), join(repo, 'tools', 'mirror.mjs'));
  cpSync(out, join(repo, 'site'), { recursive: true });
  git(repo, 'add', 'site');
  git(repo, 'commit', '-q', '-m', 'snapshot');
  const head = git(repo, 'rev-parse', 'HEAD');
  const run = (...a) => nodeAsync(join(repo, 'tools', 'mirror.mjs'), ['--origin', origin, '--delay', '0', '--no-sourcemap-probe', ...a], { cwd: repo });
  hits.length = 0;
  const no = await run();
  assert.equal(no.code, 2, no.out);
  assert.match(no.stderr, /^MIRROR-REFUSED: .*site is the committed baseline snapshot \(\d+ tracked files/);
  assert.match(no.stderr, /node tools\/mirror\.mjs --new-snapshot/);
  assert.deepEqual(hits, [], 'refused before any request');
  assert.equal(git(repo, 'status', '--porcelain', '--', 'site'), '', 'site/ untouched');
  const yes = await run('--new-snapshot');
  assert.equal(yes.code, 0, yes.out);
  assert.match(yes.stdout, /NEW SNAPSHOT CANDIDATE in .*site \(working tree only; nothing staged or committed\)/);
  assert.match(yes.stdout, /FW_BASELINE_UPDATE=<id printed by pin> git commit/);
  assert.ok(hits.length > 0);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head, 'never commits');
  assert.equal(git(repo, 'diff', '--cached', '--name-only'), '', 'never stages');
  assert.match(git(repo, 'status', '--porcelain', '--', 'site'), /site\/\.mirror\/manifest\.json/, 'the result is a git diff to review');
});
