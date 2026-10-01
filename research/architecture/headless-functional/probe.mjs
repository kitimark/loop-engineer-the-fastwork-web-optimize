#!/usr/bin/env node
// One-off research probe (ts-headless, 2026-10-02): what differs between headed and `--headless=new` Chrome on
// this Mac for FUNCTIONAL checks of the mirror. Not a tool: run it only inside a chrome-measure hold.
//
//   node probe.mjs probe headed|headless <out.json> <label=url>...   platform facts + functional state per URL
//   node probe.mjs diff <out.json> <a.png>:<b.png>...                 pixel diff (verify.mjs's canvas method), headless
//
// Per URL (fresh isolated context, 430x932 DPR 3 touch, unthrottled): pre-emulation devicePixelRatio and screen,
// the UA, GPU feature status (SystemInfo.getInfo), page state (verify.mjs's probe), visibility / focus, document
// animations (by play state, by timeline kind), animation-timeline support, an IntersectionObserver round trip,
// fonts (document.fonts + CSS.getPlatformFontsForNode on h1 and body), rAF rate over 2 s idle at the top, layer
// count (LayerTree), a top screenshot, then a stepped walk to the bottom and verify's touch morph gestures:
// console errors, first-party 4xx, morph state.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchChrome, CDP, gotoAndSettle, sleep } from '../../../tools/lib/cdp.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const MOBILE = { width: 430, height: 932, deviceScaleFactor: 3, mobile: true };

async function open(headless, profileDir) {
  const ch = await launchChrome({ port: 0, profileDir, headless });
  const cdp = await CDP.connect(ch.wsUrl);
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
  return { ch, cdp };
}

async function probeUrl(cdp, label, url, outDir, mode, ua) {
  const t0 = performance.now();
  const page = await cdp.newIsolatedPage();
  // headless-ua*: the headed UA string (HeadlessChrome/ -> Chrome/), before anything loads
  if (ua) await page.send('Emulation.setUserAgentOverride', { userAgent: ua });
  const requests = [], errors = [];
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent') requests.push({ id: m.params.requestId, url: m.params.request.url });
    if (m.method === 'Network.responseReceived') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.status = m.params.response.status; }
    if (m.method === 'Network.loadingFailed') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.failed = m.params.blockedReason || m.params.errorText; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.source}: ${m.params.entry.text.slice(0, 160)}`);
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  const pre = await page.eval('({ dpr: devicePixelRatio, screen: [screen.width, screen.height], inner: [innerWidth, innerHeight], outer: [outerWidth, outerHeight], ua: navigator.userAgent, webdriver: navigator.webdriver, brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand) : null })');
  await page.send('Emulation.setDeviceMetricsOverride', MOBILE);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.bringToFront');
  const tLoad = performance.now();
  await gotoAndSettle(page, url, { quietMs: 2000 });
  const loadSec = (performance.now() - tLoad) / 1000;
  await sleep(1500);
  const state = await page.eval(`({
    kit: Object.keys(window).filter(k => k.startsWith('__sveltekit')),
    nav: document.querySelector('.start-selling-top-nav')?.className,
    hero: document.querySelector('.hero')?.className,
    h: document.documentElement.scrollHeight,
    shim: window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts.length } : null,
    vendors: { gtag: typeof gtag, amplitude: typeof amplitude, hj: typeof hj, dataLayer: (window.dataLayer||[]).length },
    visibility: document.visibilityState, focus: document.hasFocus(), dpr: devicePixelRatio, inner: [innerWidth, innerHeight],
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, hover: matchMedia('(hover: hover)').matches, pointer: matchMedia('(pointer: coarse)').matches,
    animTimelineSupported: CSS.supports('animation-timeline', 'view()'),
    elements: document.querySelectorAll('*').length,
  })`);
  // class-token set of the whole DOM (a structural fingerprint; animation-state classes can differ by timing)
  const dom = await page.eval(`(() => { const s = new Set(); for (const e of document.querySelectorAll('*')) { s.add(e.tagName); for (const c of e.classList) s.add('.' + c); } return [...s].sort(); })()`);
  const anims = await page.eval(`(() => { const a = document.getAnimations(); const by = {}; const tl = {}; for (const x of a) { by[x.playState] = (by[x.playState] || 0) + 1; const k = x.timeline ? x.timeline.constructor.name : 'null'; tl[k] = (tl[k] || 0) + 1; } return { total: a.length, byPlayState: by, byTimeline: tl, names: [...new Set(a.map((x) => x.animationName || x.constructor.name))].sort() }; })()`);
  const io = await page.eval(`new Promise((res) => { const els = [...document.querySelectorAll('section, .hero, footer')].slice(0, 40); let n = 0, vis = 0; const o = new IntersectionObserver((es) => { for (const e of es) { n++; if (e.isIntersecting) vis++; } }); els.forEach((e) => o.observe(e)); setTimeout(() => { o.disconnect(); res({ observed: els.length, entries: n, intersecting: vis }); }, 500); })`);
  const fonts = await page.eval(`document.fonts.ready.then(() => ({ status: document.fonts.status, faces: document.fonts.size, loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight + ' ' + f.style).sort() }))`);
  await page.send('DOM.enable'); await page.send('CSS.enable');
  const platformFonts = {};
  const { root } = await page.send('DOM.getDocument', { depth: 0 });
  for (const sel of ['h1', 'body', '.start-selling-top-nav']) {
    try { const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); if (nodeId) platformFonts[sel] = (await page.send('CSS.getPlatformFontsForNode', { nodeId })).fonts; } catch (e) { platformFonts[sel] = String(e.message); }
  }
  const raf = await page.eval(`new Promise((res) => { const f = []; let last = 0; const t0 = performance.now(); const tick = (t) => { if (last) f.push(t - last); last = t; if (t - t0 < 2000) requestAnimationFrame(tick); else { const s = [...f].sort((a, b) => a - b); res({ frames: f.length, fps: Math.round(10 * f.length / ((t - t0) / 1000)) / 10, p50: Math.round(s[Math.floor(s.length / 2)] * 100) / 100, max: Math.round(s[s.length - 1] * 10) / 10 }); } }; requestAnimationFrame(tick); })`);
  let layers = null;
  try {
    const got = page.waitFor((m) => m.method === 'LayerTree.layerTreeDidChange' && m.params.layers, 5000);
    await page.send('LayerTree.enable');
    const m = await got;
    layers = { count: m.params.layers.length, drawing: m.params.layers.filter((l) => l.drawsContent).length };
    await page.send('LayerTree.disable');
  } catch (e) { layers = { error: e.message }; }
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const shotFile = join(outDir, `${mode}-${label}-top.png`);
  writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));
  // walk to the bottom (verify's screenshot walk) and push past the end (verify's mobile morph gestures)
  await page.eval(`new Promise(async (res) => { const y = document.documentElement.scrollHeight; while (scrollY + innerHeight < document.documentElement.scrollHeight - 1) { window.scrollBy({ top: 300, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); } res(); })`, { timeout: 60000 });
  await sleep(1000);
  for (let i = 0; i < 4; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
  await sleep(2000);
  const morphState = await page.eval(`document.querySelector('.start-selling-top-nav')?.className`);
  await page.close();
  const firstParty = requests.filter((r) => { try { return new URL(r.url).origin === new URL(url).origin; } catch { return false; } });
  return {
    label, url, mode, pre, loadSec: Math.round(loadSec * 10) / 10, seconds: Math.round((performance.now() - t0) / 100) / 10,
    state, domTokens: dom.length, domHash: createHash('sha256').update(dom.join('\n')).digest('hex').slice(0, 16), domTokenList: dom,
    anims, io, fonts, platformFonts, raf, layers, shot: shotFile, morphState, morphReached: /is-morph/.test(morphState || ''),
    requests: requests.length, notFound: firstParty.filter((r) => r.status >= 400).map((r) => `${r.status} ${new URL(r.url).pathname}`),
    failed: requests.filter((r) => r.failed).map((r) => `${r.failed} ${r.url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):\d+/, '<origin>')}`),
    errors: [...new Set(errors.map((e) => e.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/g, '<origin>')))],
  };
}

async function diffPair(cdp, a, b) {
  const page = await cdp.newIsolatedPage();
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64'), db = 'data:image/png;base64,' + readFileSync(b).toString('base64');
  const res = await page.eval(`(async () => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]);
    const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let diff = 0, any = 0;
    for (let i = 0; i < pa.length; i += 4) { const d = Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]); if (d > 48) diff++; if (d > 0) any++; }
    return { aSize: [A.width, A.height], bSize: [B.width, B.height], diffPct: Math.round(10000 * diff / (w * h)) / 100, anyPct: Math.round(10000 * any / (w * h)) / 100 };
  })()`);
  await page.close();
  return { a, b, ...res };
}

async function main() {
  if (cmd === 'probe') {
    const [mode, out, ...targets] = rest;
    // headless | headless-ua (UA override) | headless-ua-screen (UA override; $CHROME wrapper adds --headless=new --screen-info)
    const headless = mode === 'headless' || mode === 'headless-ua';
    const outDir = dirname(out); mkdirSync(outDir, { recursive: true });
    const t0 = performance.now();
    const { ch, cdp } = await open(headless, join(outDir, `profile-${mode}`));
    const launchSec = (performance.now() - t0) / 1000;
    const ver = await cdp.send('Browser.getVersion');
    const sys = await cdp.send('SystemInfo.getInfo').catch((e) => ({ error: e.message }));
    const gpu = sys.gpu ? { featureStatus: sys.gpu.featureStatus, gl: sys.gpu.auxAttributes?.glImplementationParts ?? sys.gpu.auxAttributes?.glImplementation ?? null, glRenderer: sys.gpu.auxAttributes?.glRenderer ?? null, displayType: sys.gpu.auxAttributes?.displayType ?? null, skiaBackend: sys.gpu.auxAttributes?.skiaBackendType ?? null } : sys;
    const results = [];
    const ua = mode.startsWith('headless-ua') ? ver.userAgent.replace('HeadlessChrome/', 'Chrome/') : null;
    try {
      for (const t of targets) { const i = t.indexOf('='); results.push(await probeUrl(cdp, t.slice(0, i), t.slice(i + 1), outDir, mode, ua)); }
    } finally { cdp.close(); await ch.close(); }
    writeFileSync(out, JSON.stringify({ mode, product: ver.product, userAgent: ver.userAgent, gpu, launchSec: Math.round(launchSec * 10) / 10, wallSec: Math.round((performance.now() - t0) / 100) / 10, results }, null, 1));
    console.log(`${mode}: ${ver.product} gl=${JSON.stringify(gpu.gl)} ${results.map((r) => `${r.label}: ${r.seconds}s errors ${r.errors.length} 404 ${r.notFound.length} morph ${r.morphReached} raf ${r.raf.fps} dpr0 ${r.pre.dpr} layers ${r.layers?.count}`).join(' | ')}`);
  } else if (cmd === 'diff') {
    const [out, ...pairs] = rest;
    const { ch, cdp } = await open(true, join(dirname(out), 'profile-diff'));
    const res = [];
    try { for (const p of pairs) { const [a, b] = p.split(':'); res.push(await diffPair(cdp, a, b).catch((e) => ({ a, b, error: e.message }))); } } finally { cdp.close(); await ch.close(); }
    writeFileSync(out, JSON.stringify(res, null, 1));
    for (const r of res) console.log(`${r.a.split('/').pop()} vs ${r.b.split('/').pop()}: ${r.error || `${r.diffPct} % (>48), ${r.anyPct} % (any), sizes ${r.aSize} ${r.bSize}`}`);
  } else { console.error('usage: probe.mjs probe headed|headless <out.json> <label=url>... | diff <out.json> <a:b>...'); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
