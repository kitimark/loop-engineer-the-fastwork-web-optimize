// T-106: the request handling of tools/serve.mjs, as a factory, so one process can serve several builds (the Try-it
// host, tools/tryit.mjs) with exactly the code the measurement servers use. Moved verbatim from serve.mjs (after the
// I-131 cache fix); serve.mjs keeps its CLI, TLS, ports and announcement and calls createMirrorHandler once.
// tests/e2e/serve-golden.test.mjs proves the move behaviour-neutral (status, headers and bodies of overlay and baseline
// files, every route, against a golden recorded before it).
//
// createMirrorHandler(opts) -> {handler(req, res), listFiles(dir), rewrites, manifest}
//   root            the tree served (absolute; site/ or site-pretty/ or a copy)
//   manifestRoot    the byte-identical mirror (site/): manifest, recorded headers, vendor scripts, missing-local.txt
//   overlays        absolute dirs checked before root, first wins (x-mirror-source: overlay|base)
//   vendors         block | local | off;  compress: br | gzip | none;  noCache: send no-store everywhere
//   quiet, log      a request log line per response unless quiet (default console.log)
//   latency         ms before every response;  frameAncestors: parsed origins (lib/framing.mjs) or null
//   baseline        what /__mirror/info reports as `baseline` (baselineMeta of the check the caller made)
//   transport()     {https, selfSigned, httpTwin} for /__mirror/info, read per request (serve.mjs sets them late)
// Throws (no exit) when the manifest or the root is missing or vendors is not one of the three: the caller decides.
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, extname, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRange } from './http-range.mjs';
import { allowFraming } from './framing.mjs';
import { mirrorCacheControl } from './cache-control.mjs';

const TOOLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createMirrorHandler({ root, manifestRoot, overlays = [], vendors = 'block', compress = 'br', noCache = false, quiet = false, log = console.log, latency = 0, frameAncestors = null, baseline = null, transport = () => ({ https: false, selfSigned: false, httpTwin: null }) } = {}) {
  const ROOT = root, MANIFEST_ROOT = manifestRoot, OVERLAYS = overlays, VENDORS = vendors, COMPRESS = compress;
  const NO_CACHE = !!noCache, QUIET = !!quiet, LOG = log, LATENCY = Number(latency) || 0, FRAME_ANCESTORS = frameAncestors, BASELINE = baseline;
  if (!['block', 'local', 'off'].includes(VENDORS)) throw new Error('--vendors must be block|local|off');
  const manifestPath = join(MANIFEST_ROOT, '.mirror', 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`No ${manifestPath} — run \`node tools/mirror.mjs\` in the main checkout first (or set FW_MIRROR_HOME).`);
  if (!existsSync(ROOT)) throw new Error(`--root ${ROOT} does not exist (site-pretty/ is built by \`node tools/prettify.mjs\` in the main checkout)`);
  for (const d of OVERLAYS) if (!existsSync(d)) throw new Error(`--overlay ${d} does not exist`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const transportInfo = () => { const t = transport() || {}; return { https: !!t.https, selfSigned: !!t.selfSigned, httpTwin: t.httpTwin ?? null }; };

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

  /** Writes the response and returns the status sent (304/206/416 can replace the one asked for). */
  function send(req, res, status, headers, body, { compressible = false, etag, ranges = false } = {}) {
    if (etag) {
      headers.etag = etag;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return 304; }
    }
    let out = body;
    const len = body ? (body.__c ? body.__c.buf.length : body.length) : 0;
    if (compressible && len > 256 && COMPRESS !== 'none') {
      const ae = String(req.headers['accept-encoding'] || '');
      const enc = COMPRESS === 'br' && /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
      if (enc) { out = typeof body === 'object' && body.__c ? encoded(body.__c, enc) : zlib[enc === 'br' ? 'brotliCompressSync' : 'gzipSync'](body); headers['content-encoding'] = enc; headers.vary = 'accept-encoding'; }
    }
    if (out && out.__c) out = out.__c.buf;
    // I-054: byte ranges only over the file's own bytes (never over a compressed or rewritten body)
    if (ranges && status === 200 && out && !headers['content-encoding']) {
      headers['accept-ranges'] = 'bytes';
      const ifRange = req.headers['if-range'];
      const r = ifRange === undefined || (etag && ifRange === etag) ? parseRange(req.headers.range, out.length) : null;
      if (r?.unsatisfiable) { status = 416; headers['content-range'] = `bytes */${out.length}`; out = null; }
      else if (r) { status = 206; headers['content-range'] = `bytes ${r.start}-${r.end}/${out.length}`; out = out.subarray(r.start, r.end + 1); }
    }
    headers['content-length'] = out ? out.length : 0;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : out);
    return status;
  }

  /** I-131: the Cache-Control for a recorded (production) value, never one that lets a browser skip revalidation. */
  function cacheHeaders(recorded) {
    const cc = mirrorCacheControl(recorded, { noStore: NO_CACHE });
    return cc === recorded || NO_CACHE ? { 'cache-control': cc } : { 'cache-control': cc, 'x-mirror-prod-cache-control': recorded };
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
    const done = (status) => { if (!QUIET) LOG(`${status} ${req.method} ${pathname}${url.search} ${(performance.now() - t0).toFixed(1)}ms`); };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // /cdn-cgi/rum (Cloudflare RUM beacon), /api/* (waitlist form): answered locally, never forwarded.
      req.resume();
      if (pathname.startsWith('/api/')) { done(503); return send(req, res, 503, { 'content-type': 'application/json' }, Buffer.from('{"message":"offline mirror: API not available"}')); }
      done(204); return send(req, res, 204, {}, null);
    }

    if (pathname === '/__mirror/vendor-shim.js') {
      const c = load(join(TOOLS_DIR, 'vendor-shim.js'));
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
      return send(req, res, 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, Buffer.from(JSON.stringify({ vendors: VENDORS, compress: COMPRESS, cache: NO_CACHE ? 'no-store' : 'revalidate', root: ROOT, baseline: BASELINE, overlays: OVERLAYS.map((d) => ({ dir: d, files: listFiles(d) })), latency: LATENCY, ...transportInfo(), rewrites: REWRITES, ...(FRAME_ANCESTORS && { frameAncestors: FRAME_ANCESTORS }) }, null, 1)));
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
      const vh = { 'content-type': v.type || 'text/javascript', ...cacheHeaders('public, max-age=900'), 'access-control-allow-origin': '*' };
      return send(req, res, 200, vh, { __c: c }, { compressible: true, etag: c.etag });
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
    Object.assign(headers, cacheHeaders(info.cacheControl || 'public, max-age=0, must-revalidate'));
    if (isHtml) {
      Object.assign(headers, DOC_HEADERS);
      headers['content-security-policy'] = localCsp(info.csp);
      if (FRAME_ANCESTORS) allowFraming(headers, FRAME_ANCESTORS); // I-074 (opt-in): the console may frame this document
      if (info.link) headers.link = info.link; // production's modulepreload Link header
    }
    const rewrite = isHtml && VENDORS === 'local' ? rewriteHtml : null;
    const c = load(hit.file, rewrite);
    return done(send(req, res, 200, headers, { __c: c }, { compressible: COMPRESSIBLE.test(type), etag: c.etag, ranges: !rewrite }));
  }

  return { handler, listFiles, rewrites: REWRITES, manifest };
}
