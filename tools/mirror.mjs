#!/usr/bin/env node
// Mirror https://fastwork.com/ (homepage + every same-origin resource it needs) into ./site/
// preserving URL paths, for local, personal performance experiments.
//
//   node tools/mirror.mjs                 # static discovery (HTML/CSS/JS/SVG/manifest parsing)
//   node tools/mirror.mjs --crawl         # + load the live page once in a dedicated Chrome, scroll it
//                                         #   to the bottom and add every same-origin request it made
//   node tools/mirror.mjs --crawl --vendors  # + save the third-party *scripts* (GTM, gtag, Amplitude,
//                                         #   Hotjar, Cloudflare beacon) for `serve --vendors=local`
//   node tools/mirror.mjs --refresh       # re-download even what is cached
//   node tools/mirror.mjs --missing       # also fetch paths the local server logged as 404
//   node tools/mirror.mjs --new-snapshot  # required once site/ is the committed baseline snapshot (see below)
//
// site/ is the study's frozen baseline snapshot, committed on main and pinned by baseline.json
// (tools/lib/baseline.mjs). Over a tracked site/ mirror.mjs refuses (exit 2, MIRROR-REFUSED) unless
// --new-snapshot is given: then it updates the working tree only, and the result is a git diff the user
// reviews and, if wanted, commits in the authorized form (CLAUDE.md "Baseline snapshot"). It never
// stages or commits anything. Taking a new snapshot is the user's decision, never an agent's.
//
// No dependencies (Node >= 22). Polite: honours robots.txt, sequential by default (--concurrency N),
// small delay between requests, caches everything already on disk (content-hashed files are never
// re-fetched; HTML/analytics.js/version.json are revalidated each run with If-None-Match).
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';

// I-152 N10 inline help: --help/-h (before any `--`) prints the header above and exits 0 before anything runs. Inline,
// not tools/lib/help.mjs: this tool also runs standalone (copied alone, as its tests do).
{
  const a = process.argv.slice(2), end = a.indexOf('--');
  if ((end < 0 ? a : a.slice(0, end)).some((x) => x === '--help' || x === '-h')) {
    const head = [];
    for (const l of readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1)) { if (!l.startsWith('//')) break; head.push(l.replace(/^\/\/ ?/, '')); }
    const b = Buffer.from(`${head.join('\n').trimEnd()}\n`);
    for (let off = 0; off < b.length;) { try { off += writeSync(1, b, off); } catch (e) { if (e.code !== 'EAGAIN') throw e; } }
    process.exit(0);
  }
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = args[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1]; };

const ORIGIN = opt('origin', 'https://fastwork.com');
const OUT = resolve(ROOT, opt('out', 'site'));
const META = join(OUT, '.mirror');
const PAGES = opt('pages', '/').split(',');
const CONCURRENCY = Number(opt('concurrency', 1));
const DELAY_MS = Number(opt('delay', 150));
const REFRESH = flag('refresh');
const UA = opt('ua', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');

// Browser-like Accept headers. They matter: Cloudflare only injects its Web Analytics
// <script ... beacon.min.js> into HTML responses when the request looks like a browser
// navigation (Accept: text/html...), so a bare curl-style request gets different bytes.
const ACCEPT = {
  document: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  style: 'text/css,*/*;q=0.1',
  image: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  other: '*/*',
};
const kindOf = (p) => {
  const e = extname(p).toLowerCase();
  if (p.endsWith('/') || e === '.html') return 'document';
  if (e === '.css') return 'style';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(e)) return 'image';
  return 'other';
};

// Files we are willing to treat as assets when found as string literals in JS.
const ASSET_EXT = /\.(?:m?js|css|json|webmanifest|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|txt|xml|map)$/i;
// Never fetch these even if referenced (APIs, beacons, SvelteKit remote functions).
const NEVER = [/^\/api(\/|$)/, /^\/cdn-cgi\//, /^\/__data\.json/];
// Always try these (SvelteKit / PWA plumbing the client may request at runtime).
const EXTRA = ['/_app/version.json', '/_app/env.js', '/site.webmanifest', '/favicon.ico', '/favicon.svg', '/icon-192.png', '/apple-touch-icon.png', '/robots.txt'];

// ---------------------------------------------------------------- the committed baseline snapshot
/** Number of git-tracked files under `dir` (0 when it doesn't exist or isn't in a git work tree). */
function trackedFiles(dir) {
  if (!existsSync(dir)) return 0;
  const r = spawnSync('git', ['ls-files', '--', '.'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean).length : 0;
}
const NEW_SNAPSHOT = flag('new-snapshot');
const TRACKED = trackedFiles(OUT);
if (TRACKED && !NEW_SNAPSHOT) {
  console.error(`MIRROR-REFUSED: ${OUT} is the committed baseline snapshot (${TRACKED} tracked files, pinned by baseline.json);
re-mirroring would change the baseline every agent measures. A new snapshot is the user's decision only:
  node tools/mirror.mjs --new-snapshot [--crawl --vendors]   # updates the working tree; never commits
  node tools/prettify.mjs --new-snapshot
then review it (git status --short site site-pretty; git diff --stat -- site site-pretty) and commit it in the
authorized form (CLAUDE.md "Baseline snapshot"), or discard it:
  git restore --source=HEAD --staged --worktree -- site site-pretty && git clean -fd -- site site-pretty`);
  process.exit(2);
}

mkdirSync(META, { recursive: true });
const manifestPath = join(META, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { origin: ORIGIN, files: {}, missing: {}, vendors: {} };
manifest.vendors ??= {};
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));

const log = (...a) => console.log(...a);
const stats = { fetched: 0, cached: 0, notModified: 0, missing: 0, skippedRobots: 0, bytes: 0 };

// ---------------------------------------------------------------- robots.txt
let robotsRules = [];
async function loadRobots() {
  const r = await fetch(ORIGIN + '/robots.txt', { headers: { 'user-agent': UA } });
  const txt = r.ok ? await r.text() : '';
  writeFileSync(join(META, 'robots.txt'), txt);
  let applies = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const [, k, v] = m;
    if (k.toLowerCase() === 'user-agent') applies = v === '*' || /mozilla|chrome/i.test(v);
    else if (applies && /^(dis)?allow$/i.test(k) && v) robotsRules.push({ allow: k.toLowerCase() === 'allow', path: v });
  }
  log(`robots.txt (${r.status}): ${robotsRules.length ? robotsRules.map((x) => (x.allow ? 'Allow ' : 'Disallow ') + x.path).join(', ') : 'no rules'}`);
}
function robotsAllowed(path) {
  let best = null;
  for (const r of robotsRules) {
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// ---------------------------------------------------------------- paths
function localFile(path) {
  // "/" -> index.html ; "/th/" -> th/index.html ; query strings are not used by same-origin assets.
  let p = decodeURIComponent(path.split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = resolve(OUT, '.' + p);
  if (!f.startsWith(OUT)) throw new Error('path escapes site/: ' + path);
  return f;
}
function normalize(ref, base) {
  ref = (ref || '').trim();
  if (!ref || /^(data:|blob:|mailto:|tel:|javascript:|#|%23|about:)/i.test(ref)) return null;
  // Reject unresolved template expressions / code fragments picked up by the JS string heuristics.
  if (/[{}<>`$\s,]|=>/.test(ref)) return null;
  let u;
  try { u = new URL(ref, base); } catch { return null; }
  if (u.origin !== ORIGIN) return null;
  return u.pathname + (u.search || '');
}

// ---------------------------------------------------------------- parsers
function refsFromCss(css, base) {
  const out = [];
  // drop inline data: URLs first (an SVG data URL can itself contain url(#id) references)
  css = css.replace(/url\(\s*"data:[^"]*"\s*\)|url\(\s*'data:[^']*'\s*\)|url\(\s*data:[^)]*\)/g, '');
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) out.push(normalize(m[2], base));
  for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/g)) out.push(normalize(m[2], base));
  return out;
}

function refsFromHtml(html, base) {
  const out = [];
  // Resources only: <a href>, <link rel=canonical|alternate> and <meta content> (og:image etc.) are
  // navigations/metadata, not things the page loads, so they are skipped.
  for (const t of html.matchAll(/<([a-zA-Z][\w:-]*)(\s[^>]*?)?\/?>/g)) {
    const tag = t[1].toLowerCase();
    const attrs = {};
    for (const a of (t[2] || '').matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) attrs[a[1].toLowerCase()] = a[3].replace(/&amp;/g, '&');
    if (tag === 'a' || tag === 'meta' || tag === 'form' || tag === 'base') continue;
    if (tag === 'link' && /\b(canonical|alternate|dns-prefetch|preconnect)\b/i.test(attrs.rel || '')) continue;
    for (const k of ['src', 'href', 'poster', 'data-src', 'xlink:href']) if (attrs[k]) out.push(normalize(attrs[k], base));
    for (const k of ['srcset', 'imagesrcset', 'data-srcset'])
      if (attrs[k]) for (const part of attrs[k].split(',')) out.push(normalize(part.trim().split(/\s+/)[0], base));
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push(...refsFromCss(m[1], base));
  for (const m of html.matchAll(/\sstyle\s*=\s*(["'])(.*?)\1/gi)) out.push(...refsFromCss(m[2].replace(/&quot;/g, '"'), base));
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) out.push(...refsFromJs(m[1], base));
  return out.filter(Boolean);
}

function refsFromLinkHeader(h, base) {
  if (!h) return [];
  return [...h.matchAll(/<([^>]+)>/g)].map((m) => normalize(m[1], base)).filter(Boolean);
}

// JS: static/dynamic imports, new URL(x, import.meta.url), plus every string literal that looks like
// a same-origin asset path. Template literals like `${gD}/reviewers/r1.jpg` are resolved against
// module-level constants (`var gD=\`/selling/sellers\``) collected across all chunks.
const jsConsts = new Map(); // name -> Set(values)
function collectJsConsts(js) {
  for (const m of js.matchAll(/(?:^|[,;{\s(])(?:var|let|const)?\s*([A-Za-z_$][\w$]*)\s*=\s*(`[^`\n]*`|"[^"\n]*"|'[^'\n]*')/g)) {
    const v = m[2].slice(1, -1);
    if (!v.startsWith('/') && !v.includes('${')) continue;
    if (!jsConsts.has(m[1])) jsConsts.set(m[1], new Set());
    jsConsts.get(m[1]).add(v);
  }
}
function expandTemplate(s, depth = 0) {
  const m = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(s);
  if (!m) return s.includes('${') ? [] : [s];
  if (depth > 6 || !jsConsts.has(m[1])) return [];
  const res = [];
  for (const v of jsConsts.get(m[1])) {
    if (v.includes('${' + m[1] + '}')) continue;
    for (const e of expandTemplate(s.slice(0, m.index) + v + s.slice(m.index + m[0].length), depth + 1)) res.push(e);
    if (res.length > 64) break;
  }
  return res;
}
function refsFromJs(js, base) {
  const out = [];
  for (const m of js.matchAll(/(?:\bimport\s*\(\s*|\bfrom\s*|\bimport\s*)(["'`])([^"'`]+?)\1/g)) out.push(normalize(m[2], base));
  for (const m of js.matchAll(/new URL\(\s*(["'`])([^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/g)) out.push(normalize(m[2], base));
  for (const m of js.matchAll(/(["'`])((?:\/|\.\.?\/|\$\{)[^"'`\s<>]*?)\1/g)) {
    for (const s of expandTemplate(m[2])) {
      if (!ASSET_EXT.test(s.split('?')[0])) continue;
      if (s.startsWith('/') && !s.startsWith('//')) out.push(normalize(s, base));
      else if (s.startsWith('./') || s.startsWith('../')) out.push(normalize(s, base));
    }
  }
  for (const m of js.matchAll(/\/\/[#@]\s*sourceMappingURL=(\S+)/g)) out.push(normalize(m[1], base));
  return out.filter(Boolean);
}
function refsFromSvg(svg, base) {
  const out = [];
  for (const m of svg.matchAll(/\s(?:xlink:)?href\s*=\s*(["'])(.*?)\1/g)) out.push(normalize(m[2], base));
  out.push(...refsFromCss(svg, base));
  return out.filter(Boolean);
}
function refsFromWebmanifest(txt, base) {
  try {
    const j = JSON.parse(txt);
    return [...(j.icons || []), ...(j.screenshots || [])].map((i) => normalize(i.src, base)).filter(Boolean);
  } catch { return []; }
}

// ---------------------------------------------------------------- fetch
const isRevalidated = (p) => p.endsWith('/') || p.endsWith('.html') || p === '/analytics.js' || p.startsWith('/_app/version.json') || p === '/_app/env.js' || p === '/robots.txt' || p === '/site.webmanifest';

async function get(path) {
  const url = ORIGIN + path;
  const file = localFile(path);
  const prev = manifest.files[path];
  if (!REFRESH && prev && existsSync(file) && !isRevalidated(path)) { stats.cached++; return { path, file, cached: true }; }
  if (!REFRESH && manifest.missing[path] && !flag('missing')) return null;
  const headers = {
    'user-agent': UA,
    accept: ACCEPT[kindOf(path)],
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'br, gzip',
    ...(kindOf(path) === 'document' ? { 'upgrade-insecure-requests': '1', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' } : {}),
  };
  if (!REFRESH && prev?.etag && existsSync(file)) headers['if-none-match'] = prev.etag;
  await sleep(DELAY_MS);
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { r = await fetch(url, { headers, redirect: 'manual' }); break; } catch (e) { if (attempt === 2) throw e; await sleep(1000 * (attempt + 1)); }
  }
  if (r.status === 304) { stats.notModified++; return { path, file, cached: true }; }
  if (r.status === 429 || r.status >= 500) { log(`  ! ${r.status} ${path} (backing off, not retrying this run)`); await sleep(5000); return null; }
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get('location');
    log(`  ↪ ${r.status} ${path} -> ${loc}`);
    manifest.files[path] = { status: r.status, location: loc };
    const n = normalize(loc, url);
    return n ? { path, redirect: n } : null;
  }
  if (!r.ok) {
    stats.missing++;
    manifest.missing[path] = r.status;
    delete manifest.files[path];
    log(`  × ${r.status} ${path}`);
    return null;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  delete manifest.missing[path];
  const h = (k) => r.headers.get(k) || undefined;
  manifest.files[path] = {
    status: r.status,
    type: h('content-type'),
    cacheControl: h('cache-control'),
    etag: h('etag'),
    link: h('link'),
    encoding: h('content-encoding'),
    csp: kindOf(path) === 'document' ? h('content-security-policy') : undefined,
    size: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    fetchedAt: new Date().toISOString(),
  };
  stats.fetched++; stats.bytes += buf.length;
  log(`  ✓ ${path} (${buf.length} B)`);
  return { path, file, buf, headers: r.headers };
}

function parseFile(path, file, headers) {
  const base = ORIGIN + path;
  const e = extname(localFile(path)).toLowerCase();
  const text = () => readFileSync(file, 'utf8');
  const refs = [];
  const link = headers?.get?.('link') ?? manifest.files[path]?.link;
  refs.push(...refsFromLinkHeader(link, base));
  if (e === '.html') refs.push(...refsFromHtml(text(), base));
  else if (e === '.css') refs.push(...refsFromCss(text(), base));
  else if (e === '.js' || e === '.mjs') refs.push(...refsFromJs(text(), base));
  else if (e === '.svg') refs.push(...refsFromSvg(text(), base));
  else if (e === '.webmanifest' || path.endsWith('manifest.json')) refs.push(...refsFromWebmanifest(text(), base));
  return refs;
}

// ---------------------------------------------------------------- crawl (optional, needs Chrome)
async function crawl() {
  const { launchChrome, CDP, gotoAndSettle, sleep: s } = await import('./lib/cdp.mjs');
  const profileDir = resolve(ROOT, opt('chrome-profile', 'out/chrome-crawl-profile'));
  log(`crawl: launching Chrome (port ${opt('port', 9333)}, profile ${profileDir}) and visiting ${ORIGIN}${PAGES[0]} once`);
  const ch = await launchChrome({ port: Number(opt('port', 9333)), profileDir });
  const cdp = await CDP.connect(ch.wsUrl);
  const seen = [];
  try {
    for (const vp of [{ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, { width: 430, height: 932, deviceScaleFactor: 3, mobile: true }]) {
      const page = await cdp.newIsolatedPage();
      await page.send('Network.enable');
      await page.send('Emulation.setDeviceMetricsOverride', vp);
      if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      page.on((m) => {
        if (m.method === 'Network.requestWillBeSent') seen.push({ url: m.params.request.url, method: m.params.request.method, type: m.params.type });
      });
      for (const p of PAGES) {
        await gotoAndSettle(page, ORIGIN + p);
        await page.eval(`new Promise(res => { let still=0; const id=setInterval(()=>{ const y=scrollY; window.scrollBy({top:250,behavior:'smooth'}); setTimeout(()=>{ if (scrollY===y) still++; else still=0; if (still>=4) { clearInterval(id); res(scrollY); } }, 280); }, 300); })`, { timeout: 180000 });
        // push past the end so the header "morph" panel opens (it is driven by wheel/touch, not scroll)
        for (let i = 0; i < 20; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 400, deltaX: 0, deltaY: 120 }); await s(80); }
        // open every profession tab in the profile showcase so its images are requested too
        await page.eval(`(async()=>{ for (const b of document.querySelectorAll('[data-selenium^="start-selling.profile-showcase.button"]')) { b.click(); await new Promise(r=>setTimeout(r,250)); } })()`).catch(() => {});
        await s(2500);
      }
      await page.close();
    }
  } finally { cdp.close(); await ch.close(); }
  writeFileSync(join(META, 'crawl.json'), JSON.stringify(seen, null, 1));
  log(`crawl: ${seen.length} requests recorded -> site/.mirror/crawl.json`);
}

function crawlRefs() {
  const f = join(META, 'crawl.json');
  if (!existsSync(f)) return { same: [], vendors: [] };
  const seen = JSON.parse(readFileSync(f, 'utf8'));
  const same = [], vendors = [];
  for (const r of seen) {
    if (r.method !== 'GET') continue;
    const u = new URL(r.url);
    if (u.origin === ORIGIN) { const n = normalize(r.url); if (n) same.push(n.split('?')[0] === '/' ? '/' : n); }
    else if (r.type === 'Script' && u.protocol === 'https:') vendors.push(r.url);
  }
  return { same: [...new Set(same)], vendors: [...new Set(vendors)] };
}

// Third-party scripts are stored under site/__vendor/<host>/<path>[.__q_<hash>] and looked up by
// tools/serve.mjs --vendors=local (the vendor shim rewrites their URLs to /__vendor/...).
async function getVendor(url) {
  const u = new URL(url);
  const key = u.host + u.pathname + u.search;
  const rel = '__vendor/' + u.host + u.pathname + (u.search ? '.__q_' + createHash('sha1').update(u.search).digest('hex').slice(0, 10) : '');
  const file = resolve(OUT, rel);
  if (!REFRESH && manifest.vendors[key] && existsSync(file)) { stats.cached++; return; }
  await sleep(DELAY_MS);
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', referer: ORIGIN + '/' } });
  if (!r.ok) { log(`  × vendor ${r.status} ${url}`); return; }
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  manifest.vendors[key] = { file: rel, type: r.headers.get('content-type') || 'text/javascript', size: buf.length, fetchedAt: new Date().toISOString() };
  log(`  ✓ vendor ${url.slice(0, 110)} (${buf.length} B)`);
}

// ---------------------------------------------------------------- main
async function main() {
  await loadRobots();
  if (flag('crawl')) await crawl();

  const queue = [];
  const seen = new Set();
  const enqueue = (p) => {
    if (!p) return;
    const clean = p.split('#')[0];
    if (seen.has(clean)) return;
    seen.add(clean);
    if (NEVER.some((re) => re.test(clean))) return;
    if (!robotsAllowed(clean)) { stats.skippedRobots++; log(`  robots.txt disallows ${clean}`); return; }
    queue.push(clean);
  };
  PAGES.forEach(enqueue);
  EXTRA.forEach(enqueue);
  const cr = crawlRefs();
  cr.same.forEach(enqueue);
  const missingLocal = flag('missing') && existsSync(join(META, 'missing-local.txt'))
    ? readFileSync(join(META, 'missing-local.txt'), 'utf8').split('\n').filter((l) => l.startsWith('/')) : [];
  missingLocal.filter((l) => !l.startsWith('/__vendor/')).forEach(enqueue);

  // Pass 1 collects module-level string constants from every JS file before template expansion,
  // so we iterate until the queue stops growing.
  const done = [];
  for (let round = 0; round < 4; round++) {
    const before = seen.size;
    while (queue.length) {
      const batch = queue.splice(0, CONCURRENCY);
      const results = await Promise.all(batch.map((p) => get(p).catch((e) => { log(`  ! ${p}: ${e.message}`); return null; })));
      for (const res of results) {
        if (!res) continue;
        if (res.redirect) { enqueue(res.redirect); continue; }
        done.push(res);
        if (/\.m?js$/.test(res.file)) collectJsConsts(readFileSync(res.file, 'utf8'));
        for (const ref of parseFile(res.path, res.file, res.headers)) enqueue(ref);
      }
    }
    // re-scan JS with the now-complete constant table
    for (const res of done) if (/\.m?js$/.test(res.file)) for (const ref of parseFile(res.path, res.file)) enqueue(ref);
    saveManifest();
    if (seen.size === before && !queue.length) break;
  }

  if (flag('vendors')) {
    // + vendor scripts the local server was asked for but did not have (serve --vendors=local logs them)
    const extra = missingLocal.filter((l) => l.startsWith('/__vendor/')).map((l) => 'https://' + l.slice('/__vendor/'.length));
    if (!cr.vendors.length && !extra.length) log('vendors: no crawl.json yet — run with --crawl --vendors');
    for (const v of [...new Set([...cr.vendors, ...extra])]) await getVendor(v).catch((e) => log(`  ! vendor ${v}: ${e.message}`));
  }

  // Source maps: SvelteKit/Vite only publishes them when build.sourcemap is on. Probe each JS/CSS.
  if (!flag('no-sourcemap-probe')) {
    const maps = {};
    for (const [p, info] of Object.entries(manifest.files)) {
      if (!/\.(m?js|css)$/.test(p) || info.status !== 200) continue;
      const f = localFile(p);
      const hasComment = existsSync(f) && /[#@]\s*sourceMappingURL=/.test(readFileSync(f, 'utf8').slice(-400));
      const mp = p + '.map';
      if (manifest.files[mp]) { maps[p] = 'mirrored'; continue; }
      if (manifest.missing[mp] && !REFRESH) { maps[p] = hasComment ? 'comment-but-404' : 'none'; continue; }
      const r = await get(mp);
      maps[p] = r ? 'mirrored' : hasComment ? 'comment-but-404' : 'none';
    }
    manifest.sourceMaps = maps;
    const n = Object.values(maps).filter((v) => v === 'mirrored').length;
    log(`source maps: ${n}/${Object.keys(maps).length} JS/CSS files have a public .map`);
  }

  manifest.lastRun = new Date().toISOString();
  saveManifest();
  const total = Object.values(manifest.files).filter((f) => f.status === 200).length;
  log(`\ndone: ${total} files in site/ (fetched ${stats.fetched} = ${(stats.bytes / 1e6).toFixed(2)} MB, cached ${stats.cached}, 304 ${stats.notModified}, 404 ${stats.missing}, robots-skipped ${stats.skippedRobots})`);
  log(`vendor scripts saved: ${Object.keys(manifest.vendors).length}`);
  if (TRACKED) {
    log(`\nNEW SNAPSHOT CANDIDATE in ${OUT} (working tree only; nothing staged or committed). Next, the user decides:`);
    log('  node tools/prettify.mjs --new-snapshot');
    log('  git status --short site site-pretty | head; git diff --stat -- site site-pretty   # review');
    log('  keep:    git add site site-pretty && node tools/baseline.mjs pin --prettier <exact version> && git add baseline.json');
    log('           FW_BASELINE_UPDATE=<id printed by pin> git commit -m "baseline: snapshot <id>"   # on main, nothing else staged');
    log('  discard: git restore --source=HEAD --staged --worktree -- site site-pretty && git clean -fd -- site site-pretty');
    log('Until then every agent tool refuses with BASELINE-MODIFIED (agents: node tools/baseline.mjs sparse --off).');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
