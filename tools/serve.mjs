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
//   node tools/serve.mjs --no-cache            # send Cache-Control: no-store on every file
//   node tools/serve.mjs --root site-pretty    # serve another tree (e.g. an edited copy)
//   node tools/serve.mjs --latency 120         # add N ms before every response (rough CDN RTT emulation)
//   node tools/serve.mjs --root site-pretty --overlay fixes/<topic>/overlay   # baseline + one fix's files on top
//   node tools/serve.mjs --port auto|fresh|0|N # auto = per-checkout port from 5200-5999 (default in a git worktree);
//                                              # fresh = the same walk in 6100-6399, a range no serve.mjs used before
//                                              # I-131 (the console's Try-it servers: no browser holds stale copies there);
//                                              # 0 = any free port; N = exactly N (default 5173 in the main checkout)
//   node tools/serve.mjs --state out/serve.json  # write {url, port, pid, root, overlay, ...} once listening
//   node tools/serve.mjs --frame-ancestors http://localhost:5559[,http://127.0.0.1:5559]   # opt-in (I-074): documents
//                                              # may be framed by these localhost origins (the user console's "Try it"
//                                              # panel): no x-frame-options, CSP frame-ancestors 'self' + the origins.
//                                              # Exact http(s)://localhost|127.0.0.1:<port> origins only, else exit 2.
//                                              # Without the flag every header stays as before (tools/lib/framing.mjs).
//   node tools/serve.mjs --owner <agent> --doing "<plain words>"   # T-106 #11: who runs it and what for, recorded in
//                                              # the shared servers registry (lib/servers.mjs; owner default $FW_AGENT,
//                                              # else "unknown") with its port, root/overlays, start and last request
//                                              # time: the console's Servers page. Nothing served changes.
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
//
// Cache-Control (incident I-131): production's recorded headers are NOT replayed where they grant freshness (230 files
// `public, max-age=31536000, immutable`, a few `max-age=86400`, the vendor scripts' `max-age=900`): those files go out as
// `no-cache` (plus the content ETag every file has), so a browser revalidates each use and never keeps another build's
// copy of a URL (an overlay changes hashed files in place; site-pretty differs from site/; ports are reused by other
// builds). The recorded value rides along as `x-mirror-prod-cache-control`. Values that already revalidate every use
// (the document's `max-age=0, must-revalidate`) are sent as recorded; --no-cache still sends no-store.
// Rule and references: tools/lib/cache-control.mjs.
//
// Byte ranges (incident I-054): files from the root or an overlay answer `Range: bytes=a-b | a- | -n` with
// 206 + Content-Range (416 + `Content-Range: bytes */size` when nothing is satisfiable) and send
// `Accept-Ranges: bytes` on their 200s, because iOS Safari plays <video> only from servers that support
// byte-range requests (Apple, Safari Web Content Guide, "Configuring Your Server"). Only one range is served:
// a multi-range request gets the full 200. Ranges apply only when the response body is the file's own bytes:
// a compressed (br/gzip) response, a rewritten body (the --vendors=local document) and the /__mirror and
// /__vendor routes neither advertise nor honour them (full 200, as nginx does for gzipped responses).
// If-None-Match is checked first (304); a non-matching If-Range gets the full 200. --latency delays a range
// request like any other.
import http from 'node:http';
import http2 from 'node:http2';
import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, mirrorHome, resolveTree, isLinkedWorktree, autoPortBase, freshPortBase } from './lib/paths.mjs';
import { withGuard } from './lib/lock.mjs';
import { requireBaseline, baselineMeta } from './lib/baseline.mjs';
import { lanInterfaces, isPhoneLan } from './lib/lan.mjs';
import { parseFrameAncestors } from './lib/framing.mjs';
import { createMirrorHandler } from './lib/mirror-handler.mjs';
import { probeHosts, portBusy } from './lib/port-probe.mjs';
import { recordServer, ownerOf } from './lib/servers.mjs';

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
let FRAME_ANCESTORS = null; // I-074: opt-in; null = production's framing headers, unchanged
if (args.some((a) => a === '--frame-ancestors' || a.startsWith('--frame-ancestors='))) {
  try { FRAME_ANCESTORS = parseFrameAncestors(opt('frame-ancestors')); } catch (e) { console.error(e.message); process.exit(2); }
}

const manifestPath = join(MANIFEST_ROOT, '.mirror', 'manifest.json');
if (!existsSync(manifestPath)) { console.error(`No ${manifestPath} — run \`node tools/mirror.mjs\` in the main checkout first (or set FW_MIRROR_HOME).`); process.exit(1); }
if (!existsSync(ROOT)) { console.error(`--root ${ROOT} does not exist (site-pretty/ is built by \`node tools/prettify.mjs\` in the main checkout)`); process.exit(1); }
const BASELINE = baselineMeta(requireBaseline('serve.mjs')); // the pinned snapshot, unchanged; else exit 3
// T-106: the request handling lives in tools/lib/mirror-handler.mjs (moved verbatim; the Try-it host uses the same
// code). tests/e2e/serve-golden.test.mjs pins every status, header and body against a golden from before the move.
let mirror;
try {
  mirror = createMirrorHandler({ root: ROOT, manifestRoot: MANIFEST_ROOT, overlays: OVERLAYS, vendors: VENDORS, compress: COMPRESS, noCache: NO_CACHE, quiet: QUIET,
    latency: LATENCY, frameAncestors: FRAME_ANCESTORS, baseline: BASELINE, transport: () => ({ https: HTTPS, selfSigned: SELF_SIGNED, httpTwin: TWIN_PORT }) });
} catch (e) { console.error(e.message); process.exit(1); }
const { handler, listFiles, rewrites: REWRITES } = mirror;
let REC = null; // T-106 #11: this server's registry record (lib/servers.mjs), from the announcement on
const served = (req, res) => { REC?.hit(); return handler(req, res); }; // notes the time in memory only
const DOING = opt('doing') ? String(opt('doing')).replace(/[\x00-\x1f]/g, ' ').slice(0, 200) : null;

// Every non-internal IPv4 address, in the OS's order; isPhoneLan picks the iPhone-reachable ones. One rule with
// tools/lan.mjs (lib/lan.mjs, incident I-073), which resolves the `lan` placeholder of phone URLs.
const lanAddresses = () => lanInterfaces();

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
    server = http2.createSecureServer({ ...pair, allowHTTP1: true }, served);
  } else {
    server = http2.createSecureServer({ cert: readFileSync(cert), key: readFileSync(key), allowHTTP1: true }, served);
  }
} else {
  server = http.createServer(served);
}
// The plain-http twin: same handler, any free port, started before the URLs are printed so the
// announcement (and the --state file) can name it. If it can't listen, serve on without it.
function onListening() {
  if (!HTTP_TWIN) return announce();
  const twin = http.createServer(served);
  twin.once('error', (e) => { console.error(`plain-http twin not started (${e.code || e.message}); serving https only`); announce(); });
  twin.listen(0, HOST, () => { TWIN_PORT = twin.address().port; announce(); });
}
function announce() {
  const PORT = server.address().port;
  const proto = HTTPS ? 'https' : 'http';
  const url = `${proto}://localhost:${PORT}/`;
  console.log(`\nfastwork mirror  root=${ROOT}`);
  for (const d of OVERLAYS) console.log(`  overlay: ${d}  (${listFiles(d).length} files, served before the root)`);
  console.log(`  vendors=${VENDORS}  compress=${COMPRESS}  cache=${NO_CACHE ? 'no-store' : 'revalidate (no-cache + ETag, I-131)'}${HTTPS ? '  (HTTP/2 + TLS)' : ''}${LATENCY ? `  latency=+${LATENCY}ms` : ''}`);
  if (REWRITES.length) console.log('  rewrites: ' + REWRITES.join(' | '));
  if (FRAME_ANCESTORS) console.log(`  framing: documents may be framed by ${FRAME_ANCESTORS.join(' ')} (no x-frame-options; CSP frame-ancestors)`);
  console.log(`\n  local:  ${url}`);
  if (TWIN_PORT) console.log(`  http twin: http://localhost:${TWIN_PORT}/  (plain http, same files: for the iPhone, whose Safari stops at the ${SELF_SIGNED ? 'self-signed ' : ''}certificate warning)`);
  if (HOST === '0.0.0.0' || HOST === '::') {
    const all = lanAddresses().filter((a) => !a.address.startsWith('169.254.'));
    const lan = all.filter(isPhoneLan);
    for (const a of lan) console.log(`  LAN:    ${proto}://${a.address}:${PORT}/   (${a.name})${TWIN_PORT ? '' : '  <- open this on the iPhone (same Wi-Fi)'}`);
    if (TWIN_PORT) for (const a of lan) console.log(`  iPhone: http://${a.address}:${TWIN_PORT}/   (${a.name})  <- open this on the iPhone (same Wi-Fi; iphone.mjs open also switches an https URL of this server to it)`);
    for (const a of all.filter((x) => !lan.includes(x))) console.log(`  other:  ${proto}://${a.address}:${PORT}/   (${a.name}, VPN/other interface)`);
  }
  // The state file is complete on disk before MIRROR_URL (the readiness line) is printed, and written
  // via a temp file + rename so a poller never reads half a JSON (incident I-014).
  if (STATE_FILE) {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ url, port: PORT, pid: process.pid, root: ROOT, overlays: OVERLAYS, vendors: VENDORS, https: HTTPS, httpTwin: TWIN_PORT, latency: LATENCY, checkout: ROOT_DIR, baseline: BASELINE, startedAt: new Date().toISOString(), ...(FRAME_ANCESTORS && { frameAncestors: FRAME_ANCESTORS }) }, null, 1));
    renameSync(tmp, STATE_FILE);
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; try { if (JSON.parse(readFileSync(STATE_FILE, 'utf8')).pid === process.pid) unlinkSync(STATE_FILE); } catch {} };
    process.on('exit', cleanup);
    // process.on, not once: a once-listener is removed before it runs, restoring the default action, so a
    // second signal (fix.mjs ab signals its servers twice) killed us before cleanup ran (incident I-009).
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
  }
  try {
    REC = recordServer({ kind: 'serve', port: PORT, httpTwin: TWIN_PORT, owner: ownerOf(opt('owner')), doing: DOING, root: ROOT, overlays: OVERLAYS,
      vendors: VENDORS, https: HTTPS, checkout: ROOT_DIR });
  } catch {} // best-effort: the registry never stops a server
  console.log(`\nMIRROR_URL=${url}`); // machine-readable (tools/fix.mjs and agents grep for it)
  console.log('');
}

// Ports: a fixed port fails loudly if taken (never silently serve on another one); "auto" starts at
// a port derived from this checkout's path and walks up until one is free; 0 lets the OS pick.
let candidates;
if (PORT_OPT === 'auto' || PORT_OPT === 'fresh') { const b = PORT_OPT === 'auto' ? autoPortBase() : freshPortBase(); candidates = Array.from({ length: 60 }, (_, i) => b + i); }
else if (/^\d+$/.test(PORT_OPT)) candidates = [Number(PORT_OPT)];
else { console.error(`--port must be a number, 0, auto or fresh (got ${PORT_OPT})`); process.exit(2); }
// A port counts as free only when nothing listens on it at ANY local address (I-065): Node sets SO_REUSEADDR, and on
// macOS a listen on 0.0.0.0:p succeeds beside another process's 127.0.0.1:p, after which "localhost" reaches that
// process, not this server (a fix.test fixture's auto port hashed to the lead's console server on 127.0.0.1:5559: its
// https request got plain http, EPROTO). Port choice only: nothing served changes.
// The LAN addresses too (the iPhone reaches the server by one): a listener on 192.168.x.y:p shadows it there.
const PROBE_HOSTS = probeHosts();
const busyOn = (port) => portBusy(port, PROBE_HOSTS); // lib/port-probe.mjs (moved there, T-106)
async function tryListen(i) {
  const port = candidates[i];
  const busy = port ? await busyOn(port) : null;
  if (busy) {
    if (candidates.length > 1 && i + 1 < candidates.length) return tryListen(i + 1);
    console.error(`port ${port} is already in use (something listens on ${busy}:${port}; another mirror server?). Use --port auto or --port 0.`);
    process.exit(1);
  }
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
