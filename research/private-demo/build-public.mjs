#!/usr/bin/env node
// build-public.mjs: recreate the private demo's static site (out/private-demo/public/) from the frozen baseline
// snapshot plus the accepted v10 build ("V"), with every analytics / observation script stripped.
//
// Usage (worktree root):
//   node research/private-demo/build-public.mjs --snapshot <dir with HASHES.txt and V/> [--out out/private-demo] [--base site-pretty|site]
//
// What it does, in order (each step refuses, exit 3, instead of guessing):
//   1. checks that the baseline is the snapshot pinned by baseline.json (tools/baseline.mjs status);
//   2. checks V's two files against the snapshot's HASHES.txt (sha256), before and after the copy;
//   3. copies the baseline tree (default site-pretty/, the tree V was measured and tried on: V's files are
//      Prettier-formatted) without .mirror/, __vendor/ (mirrored third-party tag scripts), analytics.js (the GTM
//      bootstrap) and robots.txt, then puts V's files on top;
//   4. edits index.html in the copy only (every edit must match exactly once): drops the analytics.js tag, the
//      GTM <noscript> iframe, the Cloudflare Web Analytics beacon, and the third-party origins from the meta CSP;
//      adds crossorigin="use-credentials" to the web-app manifest link (browsers fetch a manifest without
//      credentials, so behind HTTP Basic Auth it would get a 401 and log an error);
//   5. sweeps the result for anything that still names a tracking host or API, checks every inline script's
//      sha256 is listed in vercel.json's Content-Security-Policy, runs node --check on every JS file;
//   6. copies middleware.ts, vercel.json, .vercelignore, hash-password.mjs and README.md next to public/ and writes STRIPPED.txt.
// The baseline (site/, site-pretty/) and the snapshot are only read.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const die = (m) => { console.error('REFUSE: ' + m); process.exit(3); };

const { resolveTree, mainCheckout } = await import(join(REPO, 'tools', 'lib', 'paths.mjs'));
const SNAP = opt('snapshot') ? resolve(opt('snapshot')) : null;
if (!SNAP) die('--snapshot <dir> is required (the immutable v10 snapshot: HASHES.txt + V/)');
const OUT = resolve(opt('out', join(REPO, 'out', 'private-demo')));
const BASE_NAME = opt('base', 'site-pretty');
if (!['site', 'site-pretty'].includes(BASE_NAME)) die('--base must be site or site-pretty');
if (!OUT.startsWith(join(REPO, 'out') + sep)) die(`--out must lie under this checkout's gitignored out/ (got ${OUT})`);
void mainCheckout;

// 1. baseline pin
try { execFileSync(process.execPath, [join(REPO, 'tools', 'baseline.mjs'), 'status'], { stdio: 'pipe' }); }
catch (e) { die('baseline is not the pinned snapshot:\n' + String(e.stdout || '') + String(e.stderr || '')); }
const BASE = resolveTree(BASE_NAME);
if (!existsSync(join(BASE, 'index.html'))) die(`no ${BASE_NAME}/index.html at ${BASE}`);

// 2. V's files and their pinned hashes
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const hashesTxt = join(SNAP, 'HASHES.txt');
if (!existsSync(hashesTxt)) die(`no HASHES.txt in ${SNAP}`);
const V = [];
for (const line of readFileSync(hashesTxt, 'utf8').split('\n')) {
  const m = line.match(/^([0-9a-f]{64})\s+V\/(.+)$/);
  if (m) V.push({ hash: m[1], rel: m[2] });
}
if (V.length !== 2) die(`expected 2 V/ lines in HASHES.txt, found ${V.length}`);
for (const v of V) if (sha(join(SNAP, 'V', v.rel)) !== v.hash) die(`snapshot V/${v.rel} is not ${v.hash}`);

// 3. copy
const PUB = join(OUT, 'public');
rmSync(PUB, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const SKIP_TOP = new Set(['.mirror', '__vendor', 'analytics.js', 'robots.txt']);
const skipped = [];
cpSync(BASE, PUB, {
  recursive: true,
  filter: (src) => {
    const r = relative(BASE, src);
    if (r && SKIP_TOP.has(r.split(sep)[0])) { if (!r.includes(sep)) skipped.push(r); return false; }
    return !r.split(sep).includes('.DS_Store');
  },
});
for (const v of V) {
  const dst = join(PUB, v.rel);
  if (!existsSync(dst)) die(`V file ${v.rel} replaces nothing in ${BASE_NAME}/`);
  cpSync(join(SNAP, 'V', v.rel), dst);
  if (sha(dst) !== v.hash) die(`copied ${v.rel} is not ${v.hash}`);
}

// 4. index.html edits (copy only)
const htmlFile = join(PUB, 'index.html');
const orig = readFileSync(htmlFile, 'utf8');
let html = orig;
const removals = [];
const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;
function edit(what, re, replace) {
  const all = [...html.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (all.length !== 1) die(`${what}: expected exactly 1 match, found ${all.length}`);
  const oline = lineOf(orig, orig.indexOf(all[0][0].trim()));
  html = html.replace(re, replace);
  removals.push(`index.html:${oline}  ${what}`);
}
edit('removed <script src="/analytics.js"> (Google Tag Manager bootstrap; it loads GTM, which loads Google Analytics, Amplitude and Hotjar)',
  /\n[ \t]*<script src="\/analytics\.js"><\/script>/, '');
edit('removed the "Google Tag Manager (noscript)" comment',
  /\n[ \t]*<!-- Google Tag Manager \(noscript\) -->/, '');
edit('removed the GTM <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=..."> (no-JS tracking pixel)',
  /\n[ \t]*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=[^"]*"[^>]*><\/iframe><\/noscript>/, '');
edit('removed the "End Google Tag Manager (noscript)" comment',
  /\n[ \t]*<!-- End Google Tag Manager \(noscript\) -->/, '');
edit('removed the Cloudflare Web Analytics beacon <script src="https://static.cloudflareinsights.com/beacon.min.js/..." data-cf-beacon=...> (it POSTs to /cdn-cgi/rum)',
  /\n?[ \t]*<script [^>]*src="https:\/\/static\.cloudflareinsights\.com\/[^"]*"[^>]*><\/script>/, '');
// meta CSP: keep only same-origin sources and hashes (drops googletagmanager, google-analytics, hotjar, amplitude, cloudflareinsights)
let droppedCsp = [];
edit('meta Content-Security-Policy: removed every third-party origin from script-src (GTM, Google Analytics, Hotjar, Amplitude, Cloudflare Insights)',
  /<meta http-equiv="content-security-policy" content="([^"]*)">/,
  (_, c) => {
    const kept = c.split(';').map((d) => {
      const p = d.trim().split(/\s+/); const name = p.shift();
      const k = p.filter((t) => { const third = /^(https?|wss?):/i.test(t) || /^\*\./.test(t); if (third) droppedCsp.push(t); return !third; });
      return [name, ...(k.length ? k : ["'self'"])].join(' ');
    }).join('; ');
    return `<meta http-equiv="content-security-policy" content="${kept}">`;
  });
edit('web-app manifest link: added crossorigin="use-credentials" (not a removal: without it the browser fetches the manifest without the Basic Auth credentials and gets a 401)',
  /<link rel="manifest" href="\/site\.webmanifest"\/>/, '<link rel="manifest" href="/site.webmanifest" crossorigin="use-credentials"/>');
writeFileSync(htmlFile, html);

// 5. checks on the result
const files = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); e.isDirectory() ? walk(f) : files.push(f); } })(PUB);
const TRACK = /googletagmanager|google-analytics|analytics\.google|gtag\(|dataLayer|hotjar|amplitude|cloudflareinsights|cdn-cgi|sendBeacon|data-cf-beacon|\/analytics\.js|clarity\.ms|segment\.(io|com)|mixpanel|posthog|facebook\.net|fbq\(|doubleclick/i;
const hits = [];
for (const f of files) {
  if (!/\.(html|js|css|json|webmanifest|svg|txt)$/.test(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => { if (TRACK.test(l)) hits.push(`${relative(PUB, f)}:${i + 1}: ${l.trim().slice(0, 120)}`); });
}
if (hits.length) die('tracking references left:\n' + hits.join('\n'));
// every inline script must be allowed by vercel.json's CSP (and nothing else inline exists)
const vercel = JSON.parse(readFileSync(join(HERE, 'vercel.json'), 'utf8'));
const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key.toLowerCase() === 'content-security-policy')?.value || '';
const inline = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc=/.test(m[1] || ''));
for (const m of inline) {
  const h = `'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`;
  if (!csp.includes(h)) die(`inline script ${h} is not allowed by vercel.json's Content-Security-Policy: update it`);
}
const extScripts = [...html.matchAll(/<script\s[^>]*src="([^"]+)"/g)].map((m) => m[1]);
if (extScripts.some((s) => !s.startsWith('/'))) die('a script still loads from another host: ' + extScripts.join(', '));
for (const f of files) if (/\.m?js$/.test(f)) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
for (const v of V) if (sha(join(PUB, v.rel)) !== v.hash) die(`${v.rel} changed after the copy`);

// 6. kit files + report
for (const f of ['middleware.ts', 'vercel.json', 'hash-password.mjs', 'README.md', '.vercelignore']) cpSync(join(HERE, f), join(OUT, f));
const total = files.reduce((n, f) => n + statSync(f).size, 0);
const report = [
  `private demo public/ built ${new Date().toISOString()}`,
  `base: ${BASE_NAME}/ (baseline snapshot pinned by baseline.json), V from ${SNAP}`,
  ...V.map((v) => `V ${v.rel} sha256 ${v.hash} (= HASHES.txt)`),
  `files: ${files.length}, ${(total / 1048576).toFixed(1)} MB`,
  '',
  'Not copied:',
  ...skipped.sort().map((s) => `  ${s}${{ '.mirror': '  (mirror bookkeeping)', __vendor: '  (mirrored third-party tag scripts: GTM, gtag, Amplitude, Hotjar, Cloudflare beacon)', 'analytics.js': '  (GTM bootstrap + dataLayer events)', 'robots.txt': '  (asked: drop it; vercel.json sends X-Robots-Tag: noindex, nofollow instead)' }[s] || ''}`),
  '',
  'Edited (index.html in the copy; line = line in the baseline file):',
  ...removals.map((r) => '  ' + r),
  `  meta CSP sources dropped: ${droppedCsp.join(' ')}`,
  '',
  'Left in place on purpose (no request is made on the demo; vercel.json\'s CSP blocks third-party hosts anyway):',
  '  JS: the Cloudflare Turnstile loader (app chunk) runs only when /api/waitlist answers with a challenge; the demo has no /api',
  '  JS: the waitlist form posts to /api/waitlist (same origin only): the demo has no API, so a signup fails with 404 and goes nowhere',
  '  JS: eN({description}) "prepared analytics actions" are no-op descriptor functions (return undefined, no network)',
  '  HTML: og:/twitter: meta tags and canonical/hreflang links name https://fastwork.com (metadata only, never fetched by the page)',
  '',
  'Sweep for tracking hosts/APIs in all text files: 0 hits. Inline scripts all allowed by vercel.json CSP. node --check: all JS ok.',
].join('\n') + '\n';
writeFileSync(join(OUT, 'STRIPPED.txt'), report);
console.log(report);
console.log(`OK ${PUB}`);
