#!/usr/bin/env node
// Local static server for the mirrored homepage in ./site, close enough to production
// (Cloudflare) for performance work, reachable from other devices on the LAN.
//
//   node tools/serve.mjs                       # http://0.0.0.0:5173, third-party blocked (default)
//   node tools/serve.mjs --vendors=local       # run saved GTM/GA4/Amplitude/Hotjar/CF-beacon code, beacons neutered
//   node tools/serve.mjs --vendors=off         # also no-op the first-party /analytics.js
//   node tools/serve.mjs --https [--cert c.pem --key k.pem]  # HTTPS + HTTP/2 (mkcert certs, or auto self-signed)
//                                              # + a plain-http twin on a second port (same files) for the iPhone:
//                                              # iOS Safari stops at the self-signed cert warning on every new port
//                                              # (incident I-003); --no-http-twin turns it off
//   node tools/serve.mjs --compress=none|gzip|br           # default br (what production sends)
//   node tools/serve.mjs --no-cache            # send Cache-Control: no-store instead of production's
//   node tools/serve.mjs --root site-pretty    # serve another tree (e.g. an edited copy)
//   node tools/serve.mjs --latency 120         # add N ms before every response (rough CDN RTT emulation)
//   node tools/serve.mjs --root site-pretty --overlay fixes/<topic>/overlay   # baseline + one fix's files on top
//   node tools/serve.mjs --port auto|0|N       # auto = per-checkout port from 5200-5999 (default in a git worktree);
//                                              # 0 = any free port; N = exactly N (default 5173 in the main checkout)
//   node tools/serve.mjs --state out/serve.json  # write {url, port, pid, root, overlay, ...} once listening
//
// Baseline lookup: site/ and site-pretty/ are the snapshot committed on main; agent worktrees are sparse
// and have neither. `--root` names are resolved against this checkout first, then against the main
// checkout (tools/lib/paths.mjs), so a worktree serves the shared read-only baseline without copying it.
// At start serve.mjs refuses (exit 3, BASELINE-MODIFIED / -MISMATCH / ...) unless that baseline is the
// snapshot pinned by this checkout's baseline.json, unchanged (tools/lib/baseline.mjs; the state file
// and /__mirror/info record it as `baseline`). `--overlay` dirs (comma-separated,
// first wins) are checked before the root for every path: that is how a fix is served on top of the
// baseline. Overlay responses carry `x-mirror-source: overlay`.
//
// Served files are byte-identical to production except for the documented HTML rewrites
// in --vendors=local mode (see README "Rewrites").
import http from 'node:http';
import http2 from 'node:http2';
import os from 'node:os';
import zlib from 'node:zlib';
import { createHash, randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync, statSync, existsSync, appendFileSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, renameSync } from 'node:fs';
import { resolve, join, extname, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { REPO, mirrorHome, resolveTree, isLinkedWorktree, autoPortBase } from './lib/paths.mjs';
import { withGuard } from './lib/lock.mjs';
import { requireBaseline, baselineMeta } from './lib/baseline.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = REPO;
const HOME = mirrorHome(); // where the shared baseline (site/, site-pretty/) and out/certs live
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = args[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1]; };

const ROOT = resolveTree(opt('root', 'site'));
const MANIFEST_ROOT = resolveTree('site'); // headers/vendors always come from the byte-identical mirror
const OVERLAYS = (opt('overlay', '') || '').split(',').filter(Boolean).map((d) => resolve(process.cwd(), d));
for (const d of OVERLAYS) if (!existsSync(d)) { console.error(`--overlay ${d} does not exist`); process.exit(2); }
const PORT_OPT = String(opt('port', process.env.PORT || (isLinkedWorktree() ? 'auto' : 5173)));
const STATE_FILE = opt('state') ? resolve(process.cwd(), opt('state')) : null;
const HOST = opt('host', '0.0.0.0');
const VENDORS = opt('vendors', 'block'); // block | local | off
const COMPRESS = opt('compress', 'br'); // br | gzip | none
const NO_CACHE = flag('no-cache');
const QUIET = flag('quiet');
const HTTPS = flag('https');
const HTTP_TWIN = HTTPS && !flag('no-http-twin'); // plain-http listener next to --https, for the iPhone (I-003)
let SELF_SIGNED = false; // --https without --cert/--key: the auto-created cert no phone trusts
let TWIN_PORT = null;
const LATENCY = Number(opt('latency', 0)); // ms added before every response (rough CDN RTT emulation)
if (!['block', 'local', 'off'].includes(VENDORS)) { console.error('--vendors must be block|local|off'); process.exit(2); }

const manifestPath = join(MANIFEST_ROOT, '.mirror', 'manifest.json');
if (!existsSync(manifestPath)) { console.error(`No ${manifestPath} — run \`node tools/mirror.mjs\` in the main checkout first (or set FW_MIRROR_HOME).`); process.exit(1); }
if (!existsSync(ROOT)) { console.error(`--root ${ROOT} does not exist (site-pretty/ is built by \`node tools/prettify.mjs\` in the main checkout)`); process.exit(1); }
const BASELINE = baselineMeta(requireBaseline('serve.mjs')); // the pinned snapshot, unchanged; else exit 3
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/vnd.microsoft.icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.map': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg|image\/vnd\.microsoft\.icon|font\/ttf)/;

// Production response headers for the document (taken from the live response at mirror time).
// CSP: production's policy with every third-party origin removed, so in every mode nothing can
// reach GTM/GA/Amplitude/Hotjar/Cloudflare Insights from the mirror. 'self' still allows the
// same-origin /__vendor copies in --vendors=local.
function localCsp(prod) {
  if (!prod) return "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'none'";
  return prod.split(';').map((d) => {
    const parts = d.trim().split(/\s+/);
    const name = parts.shift();
    const kept = parts.filter((t) => !/^(https?|wss?):/.test(t) && !/^(https?|wss?):\/\//.test(t) && !/^\*\./.test(t));
    if (!kept.length) kept.push(name === 'frame-src' ? "'none'" : "'self'");
    if (name === 'img-src' && !kept.includes('blob:')) kept.push('blob:');
    return [name, ...kept].join(' ');
  }).join('; ');
}
const DOC_HEADERS = {
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'access-control-allow-origin': '*',
};

// ---- documented rewrites (only in --vendors=local / off) -------------------------------------
const REWRITES = [];
function rewriteHtml(html) {
  if (VENDORS === 'local') {
    const tag = '<script src="/analytics.js"></script>';
    if (html.includes(tag)) html = html.replace(tag, '<script src="/__mirror/vendor-shim.js"></script>' + tag);
    html = html.replace(/(<script[^>]+src=")https:\/\/static\.cloudflareinsights\.com\//g, '$1/__vendor/static.cloudflareinsights.com/');
  }
  return html;
}
if (VENDORS === 'local') REWRITES.push('index.html: + <script src="/__mirror/vendor-shim.js"> before /analytics.js', 'index.html: Cloudflare beacon src https://static.cloudflareinsights.com/… -> /__vendor/static.cloudflareinsights.com/…');
if (VENDORS === 'off') REWRITES.push('/analytics.js served as a no-op (GTM never requested)');

// ---- file cache (content + compressed variants), invalidated by mtime/size --------------------
const cache = new Map();
function load(file, transform) {
  const st = statSync(file);
  const key = file + (transform ? '#t' : '');
  let c = cache.get(key);
  if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
    let buf = readFileSync(file);
    if (transform) buf = Buffer.from(transform(buf.toString('utf8')));
    c = { mtimeMs: st.mtimeMs, size: st.size, buf, etag: '"' + createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"', enc: {} };
    cache.set(key, c);
  }
  return c;
}
function encoded(c, enc) {
  if (!c.enc[enc]) {
    c.enc[enc] = enc === 'br'
      ? zlib.brotliCompressSync(c.buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: c.buf.length } })
      : zlib.gzipSync(c.buf, { level: 9 });
  }
  return c.enc[enc];
}

const missingLog = join(MANIFEST_ROOT, '.mirror', 'missing-local.txt');
const missingSeen = new Set();
function recordMissing(p) {
  if (missingSeen.has(p)) return;
  missingSeen.add(p);
  try { mkdirSync(dirname(missingLog), { recursive: true }); appendFileSync(missingLog, p + '\n'); } catch {}
}

function send(req, res, status, headers, body, { compressible = false, etag } = {}) {
  if (etag) {
    headers.etag = etag;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  }
  let out = body;
  const len = body ? (body.__c ? body.__c.buf.length : body.length) : 0;
  if (compressible && len > 256 && COMPRESS !== 'none') {
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = COMPRESS === 'br' && /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
    if (enc) { out = typeof body === 'object' && body.__c ? encoded(body.__c, enc) : zlib[enc === 'br' ? 'brotliCompressSync' : 'gzipSync'](body); headers['content-encoding'] = enc; headers.vary = 'accept-encoding'; }
  }
  if (out && out.__c) out = out.__c.buf;
  headers['content-length'] = out ? out.length : 0;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : out);
}

function vendorLookup(pathWithQuery) {
  // /__vendor/<host>/<path>?<query>
  const key = pathWithQuery.replace(/^\/__vendor\//, '');
  const v = manifest.vendors || {};
  if (v[key]) return v[key];
  const noQ = key.split('?')[0];
  for (const [k, info] of Object.entries(v)) if (k.split('?')[0] === noQ) return info; // e.g. gtag cache-buster changed
  return null;
}

function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  const candidates = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
  for (const c of candidates) {
    for (const [dir, source] of [...OVERLAYS.map((d) => [d, 'overlay']), [ROOT, 'base']]) {
      const f = resolve(dir, '.' + c);
      if (f !== dir && !f.startsWith(dir + sep)) return null;
      if (existsSync(f) && statSync(f).isFile()) return { file: f, path: c, source };
    }
  }
  return null;
}

function listFiles(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) listFiles(f, base, out); else out.push('/' + relative(base, f).split(sep).join('/'));
  }
  return out;
}

function handler(req, res) {
  if (LATENCY > 0 && !req.__delayed) { req.__delayed = true; setTimeout(() => handler(req, res), LATENCY); return; }
  const t0 = performance.now();
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  const done = (status) => { if (!QUIET) console.log(`${status} ${req.method} ${pathname}${url.search} ${(performance.now() - t0).toFixed(1)}ms`); };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // /cdn-cgi/rum (Cloudflare RUM beacon), /api/* (waitlist form): answered locally, never forwarded.
    req.resume();
    if (pathname.startsWith('/api/')) { done(503); return send(req, res, 503, { 'content-type': 'application/json' }, Buffer.from('{"message":"offline mirror: API not available"}')); }
    done(204); return send(req, res, 204, {}, null);
  }

  if (pathname === '/__mirror/vendor-shim.js') {
    const c = load(join(TOOLS, 'vendor-shim.js'));
    done(200);
    return send(req, res, 200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }, { __c: c }, { compressible: true });
  }
  if (pathname === '/__mirror/null') {
    done(204);
    const h = url.searchParams.get('h') || '';
    if (/amplitude\.com$/.test(h) && !/sr-client-cfg/.test(h)) return send(req, res, 200, { 'content-type': 'application/json' }, Buffer.from('{"code":200,"events_ingested":1}'));
    return send(req, res, 204, {}, null);
  }
  if (pathname === '/__mirror/info') {
    done(200);
    return send(req, res, 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, Buffer.from(JSON.stringify({ vendors: VENDORS, compress: COMPRESS, root: ROOT, baseline: BASELINE, overlays: OVERLAYS.map((d) => ({ dir: d, files: listFiles(d) })), latency: LATENCY, https: HTTPS, selfSigned: SELF_SIGNED, httpTwin: TWIN_PORT, rewrites: REWRITES }, null, 1)));
  }
  if (pathname.startsWith('/cdn-cgi/')) { done(204); return send(req, res, 204, {}, null); }

  if (pathname.startsWith('/__vendor/')) {
    const v = VENDORS === 'local' ? vendorLookup(pathname + url.search) : null;
    if (!v) { if (VENDORS === 'local') recordMissing(pathname + url.search); done(404); return send(req, res, 404, { 'content-type': 'text/plain' }, Buffer.from('vendor script not mirrored (run mirror.mjs --crawl --vendors) or --vendors!=local')); }
    // Vendor scripts always come from the byte-identical mirror (or an overlay): some are loaded with
    // SRI `integrity` (Cloudflare beacon, Amplitude via GTM), so site-pretty's reformatted copies would
    // be refused by the browser and silently drop that vendor's cost from the measurement.
    const vf = [...OVERLAYS.map((d) => resolve(d, v.file)), resolve(MANIFEST_ROOT, v.file)].find((f) => existsSync(f)) || resolve(MANIFEST_ROOT, v.file);
    const c = load(vf);
    done(200);
    return send(req, res, 200, { 'content-type': v.type || 'text/javascript', 'cache-control': NO_CACHE ? 'no-store' : 'public, max-age=900', 'access-control-allow-origin': '*' }, { __c: c }, { compressible: true, etag: c.etag });
  }

  if (VENDORS === 'off' && pathname === '/analytics.js') {
    done(200);
    return send(req, res, 200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' }, Buffer.from('/* mirror: analytics disabled (--vendors=off) */\n'));
  }

  const hit = resolveFile(pathname);
  if (!hit) {
    if (!pathname.startsWith('/.well-known/')) recordMissing(pathname);
    done(404);
    return send(req, res, 404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, Buffer.from('404 not mirrored: ' + pathname));
  }
  if (hit.file.includes('/.mirror/')) { done(403); return send(req, res, 403, {}, Buffer.from('forbidden')); }

  const key = hit.path.endsWith('/index.html') ? hit.path.slice(0, -'index.html'.length) : hit.path;
  const info = manifest.files[key] || manifest.files[hit.path] || {};
  const isHtml = extname(hit.file) === '.html';
  const type = (info.type && !isHtml ? info.type : null) || MIME[extname(hit.file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': type };
  if (OVERLAYS.length) headers['x-mirror-source'] = hit.source;
  headers['cache-control'] = NO_CACHE ? 'no-store' : info.cacheControl || (isHtml ? 'public, max-age=0, must-revalidate' : 'public, max-age=0, must-revalidate');
  if (isHtml) {
    Object.assign(headers, DOC_HEADERS);
    headers['content-security-policy'] = localCsp(info.csp);
    if (info.link) headers.link = info.link; // production's modulepreload Link header
  }
  const c = load(hit.file, isHtml && VENDORS === 'local' ? rewriteHtml : null);
  done(200);
  return send(req, res, 200, headers, { __c: c }, { compressible: COMPRESSIBLE.test(type), etag: c.etag });
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  return out;
}

/** {cert, key} buffers if both files exist and the key belongs to the certificate, else null. */
function readSelfSigned(certFile, keyFile) {
  try {
    const pair = { cert: readFileSync(certFile), key: readFileSync(keyFile) };
    return new X509Certificate(pair.cert).checkPrivateKey(createPrivateKey(pair.key)) ? pair : null;
  } catch { return null; }
}

let server;
if (HTTPS) {
  let cert = opt('cert'), key = opt('key');
  if (!cert || !key) {
    // No cert given: use (or create once) a self-signed cert for localhost + this machine's LAN IPs.
    // Browsers will warn; prefer mkcert (see README) so the iPhone trusts it without a warning.
    const dir = resolve(HOME, 'out', 'certs'); // shared by every worktree
    cert = join(dir, 'selfsigned-cert.pem'); key = join(dir, 'selfsigned-key.pem');
    // Several servers can start at once (fix.mjs ab starts two): read the pair once and use only bytes
    // that belong together; create (or replace a missing/partial/mismatched pair) under a cross-process
    // guard, generating into temp files that are renamed into place, so no reader sees a half-written pair.
    let pair = readSelfSigned(cert, key);
    if (!pair) {
      const ok = await withGuard('selfsigned-cert', () => {
        if (readSelfSigned(cert, key)) return true; // another server created it while we waited
        mkdirSync(dir, { recursive: true });
        const tag = `.${process.pid}.${randomBytes(3).toString('hex')}.tmp`, tmpKey = key + tag, tmpCert = cert + tag;
        const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanAddresses().map((a) => 'IP:' + a.address)].join(',');
        const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '397', '-subj', '/CN=fastwork-mirror.local',
          '-addext', `subjectAltName=${san}`, '-keyout', tmpKey, '-out', tmpCert], { stdio: 'ignore' });
        if (r.status !== 0 || !readSelfSigned(tmpCert, tmpKey)) {
          for (const f of [tmpKey, tmpCert]) try { unlinkSync(f); } catch {}
          return false;
        }
        renameSync(tmpKey, key); renameSync(tmpCert, cert);
        return true;
      });
      if (!ok) { console.error('openssl failed; pass --cert/--key (e.g. from mkcert) instead'); process.exit(2); }
      pair = readSelfSigned(cert, key);
      if (!pair) { console.error(`${cert} and ${key} do not form a valid key/cert pair; pass --cert/--key instead`); process.exit(2); }
    }
    console.log(`using self-signed certificate ${cert} (browsers will warn; see README for mkcert)`);
    SELF_SIGNED = true;
    server = http2.createSecureServer({ ...pair, allowHTTP1: true }, handler);
  } else {
    server = http2.createSecureServer({ cert: readFileSync(cert), key: readFileSync(key), allowHTTP1: true }, handler);
  }
} else {
  server = http.createServer(handler);
}
// The plain-http twin: same handler, any free port, started before the URLs are printed so the
// announcement (and the --state file) can name it. If it can't listen, serve on without it.
function onListening() {
  if (!HTTP_TWIN) return announce();
  const twin = http.createServer(handler);
  twin.once('error', (e) => { console.error(`plain-http twin not started (${e.code || e.message}); serving https only`); announce(); });
  twin.listen(0, HOST, () => { TWIN_PORT = twin.address().port; announce(); });
}
function announce() {
  const PORT = server.address().port;
  const proto = HTTPS ? 'https' : 'http';
  const url = `${proto}://localhost:${PORT}/`;
  console.log(`\nfastwork mirror  root=${ROOT}`);
  for (const d of OVERLAYS) console.log(`  overlay: ${d}  (${listFiles(d).length} files, served before the root)`);
  console.log(`  vendors=${VENDORS}  compress=${COMPRESS}  cache=${NO_CACHE ? 'no-store' : 'production headers'}${HTTPS ? '  (HTTP/2 + TLS)' : ''}${LATENCY ? `  latency=+${LATENCY}ms` : ''}`);
  if (REWRITES.length) console.log('  rewrites: ' + REWRITES.join(' | '));
  console.log(`\n  local:  ${url}`);
  if (TWIN_PORT) console.log(`  http twin: http://localhost:${TWIN_PORT}/  (plain http, same files: for the iPhone, whose Safari stops at the ${SELF_SIGNED ? 'self-signed ' : ''}certificate warning)`);
  if (HOST === '0.0.0.0' || HOST === '::') {
    const all = lanAddresses().filter((a) => !a.address.startsWith('169.254.'));
    const lan = all.filter((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) && !/^(utun|tun|tap|ppp|wg)/.test(a.name));
    for (const a of lan) console.log(`  LAN:    ${proto}://${a.address}:${PORT}/   (${a.name})${TWIN_PORT ? '' : '  <- open this on the iPhone (same Wi-Fi)'}`);
    if (TWIN_PORT) for (const a of lan) console.log(`  iPhone: http://${a.address}:${TWIN_PORT}/   (${a.name})  <- open this on the iPhone (same Wi-Fi; iphone.mjs open also switches an https URL of this server to it)`);
    for (const a of all.filter((x) => !lan.includes(x))) console.log(`  other:  ${proto}://${a.address}:${PORT}/   (${a.name}, VPN/other interface)`);
  }
  // The state file is complete on disk before MIRROR_URL (the readiness line) is printed, and written
  // via a temp file + rename so a poller never reads half a JSON (incident I-014).
  if (STATE_FILE) {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ url, port: PORT, pid: process.pid, root: ROOT, overlays: OVERLAYS, vendors: VENDORS, https: HTTPS, httpTwin: TWIN_PORT, latency: LATENCY, checkout: ROOT_DIR, baseline: BASELINE, startedAt: new Date().toISOString() }, null, 1));
    renameSync(tmp, STATE_FILE);
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; try { if (JSON.parse(readFileSync(STATE_FILE, 'utf8')).pid === process.pid) unlinkSync(STATE_FILE); } catch {} };
    process.on('exit', cleanup);
    // process.on, not once: a once-listener is removed before it runs, restoring the default action, so a
    // second signal (fix.mjs ab signals its servers twice) killed us before cleanup ran (incident I-009).
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
  }
  console.log(`\nMIRROR_URL=${url}`); // machine-readable (tools/fix.mjs and agents grep for it)
  console.log('');
}

// Ports: a fixed port fails loudly if taken (never silently serve on another one); "auto" starts at
// a port derived from this checkout's path and walks up until one is free; 0 lets the OS pick.
let candidates;
if (PORT_OPT === 'auto') { const b = autoPortBase(); candidates = Array.from({ length: 60 }, (_, i) => b + i); }
else if (/^\d+$/.test(PORT_OPT)) candidates = [Number(PORT_OPT)];
else { console.error(`--port must be a number, 0 or auto (got ${PORT_OPT})`); process.exit(2); }
function tryListen(i) {
  const port = candidates[i];
  const onErr = (e) => {
    server.off('listening', onOk);
    if (e.code === 'EADDRINUSE' && i + 1 < candidates.length) return tryListen(i + 1);
    console.error(e.code === 'EADDRINUSE' ? `port ${port} is already in use (another mirror server?). Use --port auto or --port 0.` : e.message);
    process.exit(1);
  };
  const onOk = () => { server.off('error', onErr); onListening(); };
  server.once('error', onErr);
  server.once('listening', onOk);
  server.listen(port, HOST);
}
tryListen(0);
