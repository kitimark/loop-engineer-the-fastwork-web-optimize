#!/usr/bin/env node
// Compare scroll jank of the live site vs. the local mirror in a dedicated Chrome (CDP, no deps).
//
//   node tools/verify.mjs live=https://fastwork.com/ block=http://localhost:5173/ local=http://localhost:5174/
//        [--viewport desktop|mobile|both] [--cpu 4] [--runs 3] [--out out/verify] [--no-screens]
//        [--port 0] [--profile out/chrome-verify-profile] [--result file.json] [--owner name] [--no-lock]
//
// Parallel worktrees: the DevTools port defaults to 0 (Chrome picks a free one) and the profile dir
// is under this checkout's out/, so runs from different worktrees never collide. Every run takes the
// cross-worktree "chrome-measure" lock (tools/lib/lock.mjs, FIFO) before launching Chrome, so only one
// throttled measurement uses the Mac's CPU at a time; --no-lock skips that (don't, when agents run).
// With several targets, the order alternates per run (A B, B A, A B, ...) so drift hits all equally.
//
// For every target and run: fresh isolated browser context (cold cache), load, settle, then with
// CPU throttling a rAF frame logger + PerformanceObserver('long-animation-frame') record while the
// page is smooth-scrolled with window.scrollBy({top:250,behavior:'smooth'}) every 300 ms to the
// bottom ("scroll" phase), and then pushed past the end with wheel / touch gestures ("morph" phase,
// the scroll-jacked header morph). Screenshots at top/middle/bottom are compared pixel-wise.
// No Tracing is used (in-page LoAF attribution only).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import os from 'node:os';
import { launchChrome, CDP, gotoAndSettle, sleep } from './lib/cdp.mjs';
import { REPO, checkoutId } from './lib/paths.mjs';
import { acquire } from './lib/lock.mjs';

const ROOT = REPO;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const targets = argv.filter((a) => /^[\w-]+=https?:\/\//.test(a)).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
if (!targets.length) { console.error('usage: node tools/verify.mjs live=https://fastwork.com/ local=http://localhost:5173/ [--viewport both] [--runs 3]'); process.exit(2); }
const CPU = Number(opt('cpu', 4));
const RUNS = Number(opt('runs', 1));
const VIEWPORTS = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true } };
const vpSel = opt('viewport', 'desktop');
const vpList = vpSel === 'both' ? ['desktop', 'mobile'] : [vpSel];
const OUT = resolve(ROOT, opt('out', 'out/verify'));
const SCREENS = !flag('no-screens');
mkdirSync(OUT, { recursive: true });

// ---- injected before any page script ------------------------------------------------------------
const LOGGER = `(() => {
  const S = window.__perf = { frames: [], loaf: [], on: false };
  let last = 0;
  const tick = (t) => { if (S.on && last) S.frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      if (!S.on) return;
      for (const e of list.getEntries()) S.loaf.push({
        start: e.startTime, duration: e.duration, blocking: e.blockingDuration,
        render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
        styleLayout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
        scripts: e.scripts.map((s) => ({ url: s.sourceURL, fn: s.sourceFunctionName, pos: s.sourceCharPosition,
          invoker: s.invoker, type: s.invokerType, dur: s.duration, forced: s.forcedStyleAndLayoutDuration, pause: s.pauseDuration })),
      });
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) { S.noLoaf = String(e); }
})();`;

const SCROLL = `new Promise((res) => {
  const t0 = performance.now(); let still = 0, ticks = 0;
  const id = setInterval(() => {
    const y = scrollY; ticks++;
    window.scrollBy({ top: 250, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollY === y) still++; else still = 0;
      if (still >= 4 || ticks > 400) { clearInterval(id); res({ ms: performance.now() - t0, ticks, y: scrollY, h: document.documentElement.scrollHeight }); }
    }, 280);
  }, 300);
})`;

function pct(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
const r1 = (x) => Math.round(x * 10) / 10;
function stripOrigin(u) { try { const x = new URL(u); return (x.host.includes('fastwork') || x.hostname === 'localhost' || /^\d+\./.test(x.hostname) ? '' : x.host) + x.pathname.replace(/^\/__vendor\/([^/]+)/, '$1'); } catch { return u || '(none)'; } }

function summarize(perf) {
  const f = perf.frames;
  const total = f.reduce((a, b) => a + b, 0);
  const loaf = perf.loaf;
  const scripts = new Map();
  let forced = 0;
  for (const e of loaf) for (const s of e.scripts) {
    forced += s.forced || 0;
    const key = `${stripOrigin(s.url)}:${s.pos} ${s.fn || ''} [${s.type}${s.invoker ? ' ' + String(s.invoker).slice(0, 40) : ''}]`;
    const v = scripts.get(key) || { key, dur: 0, forced: 0, n: 0 };
    v.dur += s.dur; v.forced += s.forced || 0; v.n++;
    scripts.set(key, v);
  }
  const byFile = new Map();
  for (const e of loaf) for (const s of e.scripts) { const k = stripOrigin(s.url); byFile.set(k, (byFile.get(k) || 0) + s.dur); }
  return {
    frames: f.length,
    seconds: r1(total / 1000),
    fps: r1(f.length / (total / 1000 || 1)),
    p50: r1(pct(f, 50)), p95: r1(pct(f, 95)), max: r1(Math.max(0, ...f)),
    gt20: f.filter((x) => x > 20).length, gt33: f.filter((x) => x > 33.4).length, gt34: f.filter((x) => x > 34).length,
    gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length,
    droppedPct: r1((100 * f.filter((x) => x > 20).length) / (f.length || 1)),
    loafCount: loaf.length,
    loafMs: Math.round(loaf.reduce((a, e) => a + e.duration, 0)),
    loafBlockingMs: Math.round(loaf.reduce((a, e) => a + e.blocking, 0)),
    loafRenderMs: Math.round(loaf.reduce((a, e) => a + e.render, 0)),
    loafScriptMs: Math.round(loaf.reduce((a, e) => a + e.scripts.reduce((b, s) => b + s.dur, 0), 0)),
    forcedLayoutMs: Math.round(forced),
    topScripts: [...scripts.values()].sort((a, b) => b.dur - a.dur).slice(0, 8).map((v) => ({ ...v, dur: Math.round(v.dur), forced: Math.round(v.forced) })),
    byFile: Object.fromEntries([...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, Math.round(v)])),
    noLoaf: perf.noLoaf,
  };
}

async function measure(cdp, t, vpName, run) {
  const vp = VIEWPORTS[vpName];
  const loadBefore = os.loadavg()[0];
  const page = await cdp.newIsolatedPage();
  const requests = [];
  const errors = [];
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent') requests.push({ id: m.params.requestId, url: m.params.request.url, type: m.params.type, method: m.params.request.method });
    if (m.method === 'Network.responseReceived') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.status = m.params.response.status; }
    if (m.method === 'Network.loadingFailed') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.failed = m.params.blockedReason || m.params.errorText; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.source}: ${m.params.entry.text.slice(0, 160)}`);
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.send('Emulation.setDeviceMetricsOverride', vp);
  if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LOGGER });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, t.url, { quietMs: 2000 });
  await sleep(1500);
  const state = await page.eval(`({
    kit: Object.keys(window).filter(k => k.startsWith('__sveltekit')),
    nav: document.querySelector('.start-selling-top-nav')?.className,
    hero: document.querySelector('.hero')?.className,
    h: document.documentElement.scrollHeight,
    shim: window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts.length } : null,
    vendors: { gtag: typeof gtag, amplitude: typeof amplitude, hj: typeof hj, dataLayer: (window.dataLayer||[]).length },
  })`);

  await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await sleep(1000);
  await page.eval('window.__perf.frames.length=0; window.__perf.loaf.length=0; window.__perf.on=true');
  const scroll = await page.eval(SCROLL, { timeout: 600000 });
  await sleep(500);
  const scrollPerf = await page.eval('(() => { const p = window.__perf; p.on = false; return JSON.parse(JSON.stringify(p)); })()');

  // morph phase: push past the end (wheel on desktop, touch drag on mobile)
  await page.eval('window.__perf.frames.length=0; window.__perf.loaf.length=0; window.__perf.on=true');
  if (vp.mobile) {
    for (let i = 0; i < 4; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
  } else {
    for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 120 }); await sleep(100); }
  }
  await sleep(2000);
  const morphPerf = await page.eval('(() => { const p = window.__perf; p.on = false; return JSON.parse(JSON.stringify(p)); })()');
  const morphState = await page.eval(`document.querySelector('.start-selling-top-nav')?.className`);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const shots = {};
  if (SCREENS && run === 0) {
    // Screenshots from a fresh load (unthrottled), walking down the page in small steps so the
    // scroll-linked effects see a normal scroll, *before* any morph gesture.
    await gotoAndSettle(page, t.url, { quietMs: 1500 });
    await sleep(1500);
    const maxY = await page.eval('document.documentElement.scrollHeight - innerHeight');
    for (const [name, y] of [['top', 0], ['middle', Math.round(maxY * 0.45)], ['bottom', maxY]]) {
      await page.eval(`new Promise(async (res) => { while (Math.abs(scrollY - ${y}) > 1) { const d = ${y} - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); if (scrollY + innerHeight >= document.documentElement.scrollHeight - 1 && d > 0) break; } res(); })`, { timeout: 60000 });
      await sleep(2500);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = join(OUT, `${vpName}-${t.label}-${name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      shots[name] = file;
    }
  }
  const shimStats = await page.eval('window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts, neutered: window.__mirrorVendorShim.neutered } : null');
  await page.close();

  const origins = {};
  for (const r of requests) { try { const o = new URL(r.url).origin; const k = o + (r.failed ? ' (blocked/failed)' : ''); origins[k] = (origins[k] || 0) + 1; } catch {} }
  const firstParty = requests.filter((r) => { try { const u = new URL(r.url); return u.origin === new URL(t.url).origin; } catch { return false; } });
  return {
    label: t.label, url: t.url, viewport: vpName, run, loadavg1: { before: r1(loadBefore), after: r1(os.loadavg()[0]) }, state, scroll, morphState, shots, shimStats,
    scrollSummary: summarize(scrollPerf), morphSummary: summarize(morphPerf),
    requests: requests.length, origins,
    notFound: firstParty.filter((r) => r.status >= 400).map((r) => `${r.status} ${new URL(r.url).pathname}`),
    scripts: [...new Set(firstParty.filter((r) => r.type === 'Script').map((r) => new URL(r.url).pathname))].sort(),
    errors: [...new Set(errors)].slice(0, 30),
  };
}

// Pixel diff of two PNGs, computed in the browser (canvas) to stay dependency-free.
async function diffImages(cdp, a, b) {
  const { readFileSync } = await import('node:fs');
  const page = await cdp.newIsolatedPage();
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64');
  const db = 'data:image/png;base64,' + readFileSync(b).toString('base64');
  const res = await page.eval(`(async () => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]);
    const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let diff = 0;
    for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) diff++;
    return { w, h, diffPct: Math.round(10000 * diff / (w * h)) / 100 };
  })()`);
  await page.close();
  return res;
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

async function main() {
  if (!flag('no-lock')) {
    await acquire('chrome-measure', { owner: opt('owner', process.env.FW_LOCK_OWNER || checkoutId()), kind: 'process', meta: { cmd: 'verify', targets: targets.map((t) => t.label + '=' + t.url), cpu: CPU, runs: RUNS, viewport: vpSel } });
  }
  const ch = await launchChrome({ port: Number(opt('port', 0)), profileDir: resolve(ROOT, opt('profile', 'out/chrome-verify-profile')) });
  const cdp = await CDP.connect(ch.wsUrl);
  // allow the mirror's self-signed --https certificate (this dedicated Chrome only)
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
  const results = [];
  try {
    for (const vpName of vpList) {
      for (let run = 0; run < RUNS; run++) {
        const order = run % 2 ? [...targets].reverse() : targets; // ABBA: cancel slow drift across a session
        for (const t of order) {
          process.stdout.write(`[${vpName} run ${run + 1}/${RUNS}] ${t.label} ${t.url} ... `);
          const r = await measure(cdp, t, vpName, run);
          results.push(r);
          const s = r.scrollSummary;
          console.log(`fps ${s.fps}  >20ms ${s.gt20}  >34ms ${s.gt34}  >50ms ${s.gt50}  >100ms ${s.gt100}  LoAF ${s.loafMs}ms  forced ${s.forcedLayoutMs}ms  morph LoAF ${r.morphSummary.loafMs}ms  (${r.notFound.length} 404s, ${r.errors.length} errors)`);
        }
      }
      if (SCREENS && targets.length > 1) {
        const ref = targets[0];
        for (const t of targets.slice(1)) for (const name of ['top', 'middle', 'bottom']) {
          const a = join(OUT, `${vpName}-${ref.label}-${name}.png`), b = join(OUT, `${vpName}-${t.label}-${name}.png`);
          const d = await diffImages(cdp, a, b).catch((e) => ({ error: e.message }));
          results.push({ diff: true, viewport: vpName, a: ref.label, b: t.label, shot: name, ...d });
        }
      }
    }
  } finally { cdp.close(); await ch.close(); }

  // ---- report ----------------------------------------------------------------------------------
  const rows = [];
  for (const vpName of vpList) for (const t of targets) {
    const rs = results.filter((r) => !r.diff && r.viewport === vpName && r.label === t.label);
    const m = (phase, k) => median(rs.map((r) => r[phase][k]));
    rows.push({
      viewport: vpName, target: t.label, runs: rs.length,
      fps: m('scrollSummary', 'fps'), p95: m('scrollSummary', 'p95'), gt20: m('scrollSummary', 'gt20'), gt34: m('scrollSummary', 'gt34'), gt50: m('scrollSummary', 'gt50'), gt100: m('scrollSummary', 'gt100'), max: m('scrollSummary', 'max'),
      loafMs: m('scrollSummary', 'loafMs'), loafScriptMs: m('scrollSummary', 'loafScriptMs'), forcedMs: m('scrollSummary', 'forcedLayoutMs'),
      morphFps: m('morphSummary', 'fps'), morphGt50: m('morphSummary', 'gt50'), morphLoafMs: m('morphSummary', 'loafMs'),
      scrollS: Math.round(median(rs.map((r) => r.scroll.ms)) / 100) / 10,
    });
  }
  console.log('\nmedians (scroll phase unless "morph"):');
  console.table(rows);
  const diffs = results.filter((r) => r.diff);
  if (diffs.length) { console.log('screenshot pixel diff vs ' + targets[0].label + ' (% of pixels differing):'); console.table(diffs.map(({ viewport, b, shot, diffPct, error }) => ({ viewport, target: b, shot, diffPct, error }))); }
  const file = opt('result') ? resolve(process.cwd(), opt('result')) : join(OUT, `verify-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ cpu: CPU, viewports: vpList, runs: RUNS, targets, host: { cpus: os.cpus().length, model: os.cpus()[0]?.model, loadavg: os.loadavg() }, rows, results }, null, 1));
  console.log('details: ' + file);
}

main().catch((e) => { console.error(e); process.exit(1); });
