// A tiny stand-in for the private mirror baseline, with the same structure as the real one:
//   <home>/site/                 byte-identical "production" files (minified JS/CSS)
//   <home>/site/.mirror/manifest.json   per-file headers (type, cache-control, csp, link) + vendors
//   <home>/site/__vendor/<host>/...     saved third-party script (loaded with SRI integrity)
//   <home>/site-pretty/          same tree with JS/CSS "prettified" (different bytes, same behaviour)
// Point the tools at it with FW_MIRROR_HOME=<home>, or put it into a temp repo's main checkout.
import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const PAGE_JS = '/_app/immutable/nodes/2.fixture.js';
export const PAGE_CSS = '/_app/immutable/assets/0.fixture.css';
export const CHUNK_JS = '/_app/immutable/chunks/util.fixture.js';
export const VENDOR_KEY = 'static.cloudflareinsights.com/beacon.min.js/v1fixture';
export const VENDOR_FILE = '__vendor/' + VENDOR_KEY;
// a 1x1 transparent PNG
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const MIN = {
  [PAGE_JS]: 'import{clamp as c}from"../chunks/util.fixture.js";function measure(){const e=document.querySelector(".hero");return e?e.getBoundingClientRect().top:0}function tick(){const n=document.querySelector(".start-selling-top-nav");if(n){const t=measure();n.style.transform="translateY("+c(t/10,-5,5)+"px)"}requestAnimationFrame(tick)}requestAnimationFrame(tick);addEventListener("scroll",()=>{const b=document.body;b.dataset.y=String(Math.round(scrollY))},{passive:!0});window.__fixturePage=!0;export{measure,tick};\n',
  [CHUNK_JS]: 'export function clamp(v,a,b){return Math.min(b,Math.max(a,v))}\n',
  [PAGE_CSS]: 'body{margin:0;font-family:sans-serif}.start-selling-top-nav{position:sticky;top:0;height:60px;background:#1a56db;color:#fff}.hero{height:1800px;background:linear-gradient(#fff,#9ab)}.orbit{width:40px;height:40px;background:#f60;animation:spin 2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}\n',
};
// "Prettier" output: same code, one statement per line (what fix agents read, grep and patch)
const PRETTY = {
  [PAGE_JS]: `import { clamp as c } from "../chunks/util.fixture.js";
function measure() {
  const e = document.querySelector(".hero");
  return e ? e.getBoundingClientRect().top : 0;
}
function tick() {
  const n = document.querySelector(".start-selling-top-nav");
  if (n) {
    const t = measure();
    n.style.transform = "translateY(" + c(t / 10, -5, 5) + "px)";
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
addEventListener(
  "scroll",
  () => {
    const b = document.body;
    b.dataset.y = String(Math.round(scrollY));
  },
  { passive: !0 },
);
window.__fixturePage = !0;
export { measure, tick };
`,
  [CHUNK_JS]: `export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
`,
  [PAGE_CSS]: `body {
  margin: 0;
  font-family: sans-serif;
}
.start-selling-top-nav {
  position: sticky;
  top: 0;
  height: 60px;
  background: #1a56db;
  color: #fff;
}
.hero {
  height: 1800px;
  background: linear-gradient(#fff, #9ab);
}
.orbit {
  width: 40px;
  height: 40px;
  background: #f60;
  animation: spin 2s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
`,
};
const VENDOR_MIN = 'window.__beacon=(window.__beacon||0)+1;\n';
const VENDOR_PRETTY = 'window.__beacon = (window.__beacon || 0) + 1;\n';
const ANALYTICS = 'window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"fixture"});\n';
// Runs in the page after the vendor shim (egress.html): every kind of third-party egress.
const EGRESS = `window.__egress = (async () => {
  const r = {};
  try { const f = await fetch('https://api2.amplitude.com/2/httpapi', { method: 'POST', body: '{}' }); r.fetch = { status: f.status, body: await f.text() }; } catch (e) { r.fetch = { error: String(e) }; }
  r.xhr = await new Promise((res) => { const x = new XMLHttpRequest(); x.open('POST', 'https://www.google-analytics.com/g/collect'); x.onload = () => res({ status: x.status, url: x.responseURL }); x.onerror = () => res({ error: 'xhr error' }); x.send('a=1'); });
  r.beacon = navigator.sendBeacon('https://cloudflareinsights.com/cdn-cgi/rum', 'x');
  const img = new Image(); img.src = 'https://www.facebook.com/tr?id=1'; r.img = img.src.slice(0, 22);
  const s = document.createElement('script'); s.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST'; r.script = s.getAttribute('src');
  const fr = document.createElement('iframe'); fr.src = 'https://td.doubleclick.net/x'; r.iframe = fr.getAttribute('src');
  r.ws = await new Promise((res) => { const w = new WebSocket('wss://ws.hotjar.com/api/v2/client/ws'); w.onopen = () => { w.send('hi'); res('open'); w.close(); }; setTimeout(() => res('timeout'), 2000); });
  r.sameOrigin = (await fetch('/_app/version.json')).status;
  r.stats = window.__mirrorVendorShim;
  return r;
})();
`;

export const CSP_PROD = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'sha256-AAAA' https://*.googletagmanager.com https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com https://*.amplitude.com wss://*.hotjar.com; frame-src https://www.googletagmanager.com; frame-ancestors 'self'; base-uri 'self'";
export const CSP_LOCAL = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'sha256-AAAA'; connect-src 'self'; frame-src 'none'; frame-ancestors 'self'; base-uri 'self'";
export const LINK = `<${PAGE_JS}>; rel="modulepreload", <${CHUNK_JS}>; rel="modulepreload"`;

export function indexHtml() {
  const sri = 'sha384-' + createHash('sha384').update(VENDOR_MIN).digest('base64');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>fixture</title>
<link rel="stylesheet" href="${PAGE_CSS}">
<script src="/analytics.js"></script>
<script defer src="https://${VENDOR_KEY}" integrity="${sri}" crossorigin="anonymous"></script>
</head><body>
<nav class="start-selling-top-nav">nav</nav>
<main class="hero"><div class="orbit"></div><img src="/img/logo.png" alt=""></main>
<script type="module" src="${PAGE_JS}"></script>
</body></html>
`;
}

function put(root, rel, data) {
  const f = join(root, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, data);
}

/** Build the fixture under <home> (site/ + site-pretty/). Returns useful paths/contents. */
export function makeFixtureHome(home) {
  const site = join(home, 'site'), pretty = join(home, 'site-pretty');
  const html = indexHtml();
  const common = {
    'index.html': html,
    'sub/index.html': '<!doctype html><title>sub</title><p>sub index</p>\n',
    'page.html': '<!doctype html><title>page</title><p>page html</p>\n',
    'egress.html': '<!doctype html><html><head><meta charset="utf-8"><script src="/analytics.js"></script><script src="/egress.js"></script></head><body>egress</body></html>\n',
    'egress.js': EGRESS,
    'analytics.js': ANALYTICS,
    '_app/version.json': '{"version":"fixture"}',
    'img/logo.png': PNG,
    'favicon.ico': PNG,
    'robots.txt': 'User-agent: *\nAllow: /\n',
  };
  for (const [rel, data] of Object.entries(common)) { put(site, rel, data); put(pretty, rel, data); }
  for (const [p, data] of Object.entries(MIN)) put(site, p.slice(1), data);
  for (const [p, data] of Object.entries(PRETTY)) put(pretty, p.slice(1), data);
  put(site, VENDOR_FILE, VENDOR_MIN);
  put(pretty, VENDOR_FILE, VENDOR_PRETTY);
  const manifest = {
    origin: 'https://fastwork.com',
    files: {
      '/': { status: 200, type: 'text/html; charset=utf-8', cacheControl: 'public, max-age=0, must-revalidate', link: LINK, csp: CSP_PROD },
      [PAGE_JS]: { status: 200, type: 'application/javascript', cacheControl: 'public, max-age=1, must-revalidate' },
      [CHUNK_JS]: { status: 200, type: 'application/javascript', cacheControl: 'public, max-age=1, must-revalidate' },
      [PAGE_CSS]: { status: 200, type: 'text/css; charset=utf-8', cacheControl: 'public, max-age=1, must-revalidate' },
      '/img/logo.png': { status: 200, type: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
      '/_app/version.json': { status: 200, type: 'application/json', cacheControl: 'public, max-age=0, must-revalidate' },
    },
    missing: {},
    vendors: { [VENDOR_KEY]: { file: VENDOR_FILE, type: 'text/javascript;charset=UTF-8' } },
  };
  put(site, '.mirror/manifest.json', JSON.stringify(manifest, null, 1));
  cpSync(join(site, '.mirror'), join(pretty, '.mirror'), { recursive: true });
  return { home, site, pretty, manifest, html, min: MIN, prettyFiles: PRETTY, vendorMin: VENDOR_MIN, vendorPretty: VENDOR_PRETTY };
}
