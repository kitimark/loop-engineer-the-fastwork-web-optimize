// end-bg images (fix-end-bg, user T-193 #28): per arm, what every image costs in one load + one scripted scroll.
// Chrome headless, 430 x H DPR 3 mobile + touch, hover:none/pointer:coarse, no CPU throttle. COUNTS AND BYTES ONLY:
// nothing here is a timing verdict (RasterTask ms are logged as a work proxy, never judged).
// Per run: network bytes per image URL (encodedDataLength, mime), trace counts per phase (load, scroll): PaintImage per URL
// (with drawn size vs source size), image decode events, Paint, RasterTask; and which <img> / CSS-image hosts ever
// intersect the viewport during the scroll (IntersectionObserver), i.e. "can a phone see it".
// Arms: --arms C=fixes/end-bg/overlay[,opt=out/end-bg/opt/overlay,...] (each is an overlay dir over the baseline, own server).
// --runs N (default 2, arms alternate), --height 775, --step 40 (px per rAF in the scroll).
// Run (shared lane, probe weight):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-bg -- \
//     node fixes/end-bg/img-scroll.mjs --arms C=fixes/end-bg/overlay
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', 'C=fixes/end-bg/overlay').split(',').map((a) => { const [name, dir] = a.split('='); return { name, dir: resolve(WT, dir) }; });
const RUNS = Number(arg('--runs', '2'));
const H = Number(arg('--height', '775'));
const STEP = Number(arg('--step', '40'));
const BASE = join(mirrorHome(), 'site-pretty');
const OUT = join(WT, 'out/end-bg/images'); mkdirSync(OUT, { recursive: true });
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame'].join(',');
const IMG_RE = /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i;
const short = (u) => { try { return new URL(u).pathname; } catch { return String(u).slice(0, 200); } };

async function serve(dir, name) {
  const st = join(OUT, `serve-${name}-${tag}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(`server ${name} did not start`); }
  return { proc: p, url: s.url };
}

// page side: observe every <img> and every element (or its ::before/::after) with a url() background or mask
const OBSERVE = `(() => {
  const seen = window.__imSeen = new Map(); const hosts = [];
  const urlsOf = (cs) => { const out = []; for (const v of [cs.backgroundImage, cs.maskImage, cs.webkitMaskImage]) if (v && v !== 'none') for (const m of v.matchAll(/url\\("?([^")]+)"?\\)/g)) out.push(m[1]); return out; };
  for (const el of document.querySelectorAll('body *')) {
    const urls = [];
    if (el.tagName === 'IMG') urls.push(el.currentSrc || el.src);
    for (const p of [null, '::before', '::after']) urls.push(...urlsOf(getComputedStyle(el, p)).map((u) => u + (p ? ' ' + p : '')));
    if (urls.length) hosts.push([el, urls.filter(Boolean)]);
  }
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && e.intersectionRect.width * e.intersectionRect.height > 0) {
    for (const u of e.target.__imUrls) { const r = e.boundingClientRect; const s = seen.get(u) || { n: 0, maxW: 0, maxH: 0 }; s.n++; s.maxW = Math.max(s.maxW, Math.round(r.width)); s.maxH = Math.max(s.maxH, Math.round(r.height)); seen.set(u, s); } } });
  for (const [el, urls] of hosts) { el.__imUrls = urls; io.observe(el); }
  window.__imAll = () => hosts.map(([el, urls]) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { urls, tag: el.tagName, cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).replace(/svelte-\\w+/g, '').trim().slice(0, 80),
      display: cs.display, visibility: cs.visibility, w: Math.round(r.width), h: Math.round(r.height),
      img: el.tagName === 'IMG' ? { nw: el.naturalWidth, nh: el.naturalHeight, fit: cs.objectFit, loading: el.loading, decoding: el.decoding, srcset: !!el.srcset } : null }; });
  return hosts.length; })()`;

function summarize(ev, a, b) {
  const inW = ev.filter((e) => e.ts >= a && e.ts < b);
  const dur = (e) => (e.dur || 0) / 1000;
  const byUrl = {};
  for (const e of inW) if (e.name === 'PaintImage') { const d = e.args?.data || {}; const u = short(d.url || '(no url)');
    const s = (byUrl[u] ||= { paints: 0, drawW: 0, drawH: 0, srcW: d.srcWidth, srcH: d.srcHeight }); s.paints++; s.drawW = Math.max(s.drawW, Math.round(d.width || 0)); s.drawH = Math.max(s.drawH, Math.round(d.height || 0)); }
  const decodes = inW.filter((e) => /^(Decode Image|ImageDecodeTask|Decode LazyPixelRef)$/.test(e.name) && (e.ph === 'X' || e.ph === 'B'));
  const decByType = {}; for (const e of decodes) { const k = `${e.name}:${e.args?.imageType || e.args?.data?.imageType || ''}`; decByType[k] = (decByType[k] || 0) + 1; }
  const decUrls = {}; for (const e of decodes) { const u = e.args?.imageUrl || e.args?.data?.url || e.args?.data?.imageUrl; if (u) decUrls[short(u)] = (decUrls[short(u)] || 0) + 1; }
  const raster = inW.filter((e) => e.name === 'RasterTask' && e.ph === 'X');
  return { paintImage: byUrl, paintImageN: Object.values(byUrl).reduce((s, x) => s + x.paints, 0), decodes: decodes.length, decodeMs: +decodes.reduce((s, e) => s + dur(e), 0).toFixed(1), decByType, decUrls,
    decodeArgKeys: decodes.slice(0, 3).map((e) => Object.keys(e.args || {}).join('+')),
    paint: inW.filter((e) => e.name === 'Paint' && (e.ph === 'X' || e.ph === 'B')).length, raster: raster.length, rasterMs: +raster.reduce((s, e) => s + dur(e), 0).toFixed(1) };
}

async function run(cdp, srv, arm) {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  const net = new Map();
  const offN = page.on((m) => { const p = m.params;
    if (m.method === 'Network.responseReceived') { const u = p.response.url; if (p.type === 'Image' || IMG_RE.test(u)) net.set(p.requestId, { url: short(u), mime: p.response.mimeType, status: p.response.status, bytes: 0 }); }
    if (m.method === 'Network.loadingFinished' && net.has(p.requestId)) net.get(p.requestId).bytes = p.encodedDataLength; });
  const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
  await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
  await sleep(200);
  await page.eval(`(console.timeStamp('im:load'), 1)`).catch(() => {});
  const t0 = Date.now();
  await gotoAndSettle(page, srv.url, { quietMs: 2000, maxMs: 45000 });
  const loadMs = Date.now() - t0;
  await sleep(1000);
  const nHosts = await page.eval(OBSERVE);
  await page.eval(`(console.timeStamp('im:scroll'), 1)`);
  const geo = await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += ${STEP}; const max = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(y, max), behavior: 'instant' });
    y < max ? requestAnimationFrame(step) : setTimeout(() => res({ max, sh: document.documentElement.scrollHeight }), 2500); }; requestAnimationFrame(step); })`, { timeout: 120000 });
  await page.eval(`(console.timeStamp('im:end'), 1)`);
  const seen = await page.eval(`Object.fromEntries([...window.__imSeen])`);
  const all = await page.eval('__imAll()');
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 90000);
  await page.send('Tracing.end'); await done; offT(); offN();
  // name the nodes of PaintImage events without a URL (generated images: canvas, gradients-as-image, cross-fade, ...)
  const noUrl = {};
  for (const e of ev) if (e.name === 'PaintImage' && !(e.args?.data?.url)) { const id = e.args?.data?.nodeId || 0; noUrl[id] = (noUrl[id] || 0) + 1; }
  const noUrlNodes = [];
  await page.send('DOM.getDocument', { depth: 0 }).catch(() => {});
  for (const [id, n] of Object.entries(noUrl)) { let name = '(no node)';
    if (+id) try { const { node } = await page.send('DOM.describeNode', { backendNodeId: +id }); const at = node.attributes || []; const o = {}; for (let i = 0; i < at.length; i += 2) o[at[i]] = at[i + 1];
      name = `${node.localName || node.nodeName}${o.class ? '.' + String(o.class).split(/\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 3).join('.') : ''}${o.src ? ' src=' + String(o.src).slice(0, 60) : ''}`; } catch { name = '?'; }
    noUrlNodes.push({ id: +id, n, name, sample: JSON.stringify((ev.find((e) => e.name === 'PaintImage' && (e.args?.data?.nodeId || 0) === +id && !e.args?.data?.url) || {}).args || {}).slice(0, 300) }); }
  await page.close();
  const marks = Object.fromEntries(ev.filter((e) => e.name === 'TimeStamp' && /^im:/.test(e.args?.data?.message || '')).map((e) => [e.args.data.message.slice(3), e.ts]));
  let first = Infinity, last = 0; for (const e of ev) if (e.ts > 0) { if (e.ts < first) first = e.ts; if (e.ts > last) last = e.ts; } last += 1;
  const images = [...net.values()];
  return { arm: arm.name, loadMs, nHosts, geo, noUrlNodes, network: { n: images.length, bytes: images.reduce((s, x) => s + x.bytes, 0), images },
    load: summarize(ev, marks.load ?? first, marks.scroll), scroll: summarize(ev, marks.scroll, marks.end ?? last), seen, hosts: all };
}

const servers = {}; for (const a of ARMS) servers[a.name] = await serve(a.dir, a.name);
const profileDir = tempProfileDir(join(OUT, 'chrome'), 'im');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/end-bg/img-scroll.mjs', browser: chrome.browser, height: H, step: STEP, arms: ARMS, runs: [] };
try {
  for (let r = 0; r < RUNS; r++) for (const arm of (r % 2 ? [...ARMS].reverse() : ARMS)) {
    const R = await run(cdp, servers[arm.name], arm); R.run = r; res.runs.push(R);
    console.log(arm.name, 'run', r, 'img requests', R.network.n, 'bytes', R.network.bytes, '| load: PaintImage', R.load.paintImageN, 'decodes', R.load.decodes, 'raster', R.load.raster,
      '| scroll: PaintImage', R.scroll.paintImageN, 'decodes', R.scroll.decodes, 'raster', R.scroll.raster, 'paint', R.scroll.paint, '| seen', Object.keys(R.seen).length, 'of', R.nHosts, 'hosts');
  }
} finally {
  const f = join(OUT, `img-scroll-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); for (const s of Object.values(servers)) s.proc.kill();
  console.log('wrote', f);
}
