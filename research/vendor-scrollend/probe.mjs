#!/usr/bin/env node
// N11 vendor-scrollend: functional probe of the gtag scroll-depth deferral (no timing claims).
//
//   node tools/lock.mjs run chrome-measure --owner fix-vendor-scrollend --short --max-seconds 180 -- \
//     node research/vendor-scrollend/probe.mjs [--cpu 1] [--out research/vendor-scrollend/data]
//
// For the baseline and each variant overlay (fixes/vendor-scrollend*, served like fix.mjs ab:
// --vendors=local --https --latency 150), in one Chrome, mobile 430x932:
//   - which window 'scrollend'/'resize' listeners exist after load (DOMDebugger.getEventListeners),
//   - every analytics hit the vendors try to send (fetch / sendBeacon / XHR to a foreign origin, logged
//     on top of tools/vendor-shim.js, which still answers them locally) with the GA4 event names and
//     percent_scrolled, plus the shim's per-host counters,
//   - when gtm.scrollDepth is pushed (= when the tag's scroll-depth call ran) relative to the scroll,
//   in three scenarios:
//     A "scroll": verify.mjs's smooth scroll to the bottom, then a TAIL_S quiet tail, then leave the page;
//     B "leave":  jump to the bottom, leave the page 300 ms later (the hide flush must still send it);
//     C "back":   stop at the bottom, scroll back to the top 400 ms later, stay (depth must still be 90).
// A CPU profile of scenario A on the baseline attributes the tag's scrollend call (shares only).
// Chrome: holds the chrome-measure lock through lock.mjs run (short lane, counts only).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { launchChrome, CDP, gotoAndSettle, sleep } from '../../tools/lib/cdp.mjs';
import { REPO, resolveTree } from '../../tools/lib/paths.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const CPU = Number(opt('cpu', 1));
const TAIL_S = Number(opt('tail', 4));
const OUT = resolve(REPO, opt('out', 'research/vendor-scrollend/data'));
const ONLY = opt('only', '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const SITE = resolveTree('site');
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const BUDGET_S = Number(opt('budget', 135)); // stop starting new scenarios after this, so partial results are saved
// Every CDP step is bounded and logged, so a hang shows where it happened (the first real run hit the 180 s cap silently).
async function step(name, p, ms = 30000) {
  let to; const t = Date.now();
  try { return await Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`step "${name}" timed out after ${ms} ms`)), ms); })]); }
  finally { clearTimeout(to); if (Date.now() - t > 3000) log(`  step ${name}: ${((Date.now() - t) / 1000).toFixed(1)}s`); }
}

const VARIANTS = [
  { label: 'base', overlay: null, scenarios: ['A', 'B', 'C', 'D'] },
  { label: '01-task', overlay: 'vendor-scrollend--task', scenarios: ['A'] },
  { label: '02-idle', overlay: 'vendor-scrollend', scenarios: ['A', 'B', 'C', 'D'] },
  { label: '03-drop', overlay: 'vendor-scrollend--drop', scenarios: ['A'] },
  { label: '02-debug', overlay: 'vendor-scrollend--debug', scenarios: ['D', 'B'] }, // 02 + console markers, for diagnosis only
].filter((v) => !ONLY.length || ONLY.includes(v.label));

async function startServer(label, overlay) {
  const state = join(REPO, 'out', `probe-n11-${label}.json`);
  rmSync(state, { force: true });
  mkdirSync(join(REPO, 'out'), { recursive: true });
  const a = [join(REPO, 'tools', 'serve.mjs'), '--root', BASE, ...(overlay ? ['--overlay', join(REPO, 'fixes', overlay, 'overlay')] : []), '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'];
  const proc = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) {
    if (existsSync(state)) { try { return { proc, ...JSON.parse(readFileSync(state, 'utf8')) }; } catch {} }
    if (proc.exitCode !== null) throw new Error(`${label} server exited`);
    await sleep(100);
  }
  proc.kill(); throw new Error(`${label} server did not start`);
}

// Injected before any page script. Logs foreign fetch/sendBeacon/XHR on top of whatever the shim installs
// later (accessor properties keep the latest assigned function and wrap it on read), and dataLayer pushes.
const HOOK = `(() => {
  const L = window.__n11 = { hits: [], dl: [] };
  const foreign = (u) => { try { const x = new URL(String(u), location.href); return x.origin !== location.origin ? x.href : null; } catch { return null; } };
  const rec = (kind, u, body) => { if (String(u).indexOf('/__mirror/null?h=') === 0) u = 'https://' + decodeURIComponent(String(u).split('h=')[1]) + '/'; const f = foreign(u); if (!f) return; const b = body == null ? '' : typeof body === 'string' ? body : (body instanceof URLSearchParams ? body.toString() : '[' + (body && body.constructor && body.constructor.name) + ']');
    const e = { kind, url: f, body: b.slice(0, 4000), t: Math.round(performance.now()) }; L.hits.push(e); console.debug('__N11HIT__' + JSON.stringify(e)); };
  const mark = (ev) => { try { localStorage.setItem('n11dbg', (localStorage.getItem('n11dbg') || '') + '|hook ' + ev + '@' + Math.round(performance.now())); } catch (e) {} const e = { ev: '(' + ev + ')', t: Math.round(performance.now()), y: Math.round(scrollY) }; L.dl.push(e); console.debug('__N11DL__' + JSON.stringify(e)); };
  document.addEventListener('visibilitychange', () => mark('visibility:' + document.visibilityState), true);
  window.addEventListener('pagehide', () => mark('pagehide'), true);
  const wrapProp = (obj, name, kind, pick) => { let cur = obj[name]; const cache = new WeakMap();
    Object.defineProperty(obj, name, { configurable: true, enumerable: true, set(v) { cur = v; },
      get() { if (typeof cur !== 'function') return cur; let w = cache.get(cur); if (!w) { const f = cur; w = function () { if (!L.depth) { try { const [u, b] = pick(arguments); rec(kind, u, b); } catch {} } L.depth = (L.depth || 0) + 1; try { return f.apply(this, arguments); } finally { L.depth--; } }; cache.set(f, w); } return w; } }); };
  wrapProp(window, 'fetch', 'fetch', (a) => [a[0] && typeof a[0] === 'object' && 'url' in a[0] ? a[0].url : a[0], a[1] && a[1].body]);
  wrapProp(navigator, 'sendBeacon', 'beacon', (a) => [a[0], a[1]]);
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__n11u = u; return open.apply(this, arguments); };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (b) { rec('xhr', this.__n11u, b); return send.apply(this, arguments); };
  // dataLayer.push is replaced by GTM and wrapped again by gtag (which keeps the previous push):
  // wrap each assigned function once, and log only the outermost call so a push is logged once.
  let dl, depth = 0; const hookPush = (arr) => { if (!arr || arr.__n11) return; arr.__n11 = true; const wrap = (f) => function () {
      if (!depth) for (const m of arguments) { const ev = m && (m.event || (m[0] === 'event' ? 'gtag:' + m[1] : m[0])); if (ev) { const e = { ev: String(ev), t: Math.round(performance.now()), y: Math.round(scrollY) }; L.dl.push(e); console.debug('__N11DL__' + JSON.stringify(e)); } }
      depth++; try { return f.apply(this, arguments); } finally { depth--; } };
    let p = wrap(arr.push);
    Object.defineProperty(arr, 'push', { configurable: true, get() { return p; }, set(v) { p = v && v.__n11w ? v : wrap(v); p.__n11w = true; } }); };
  Object.defineProperty(window, 'dataLayer', { configurable: true, get() { return dl; }, set(v) { dl = v; hookPush(v); } });
})();`;

const SCROLL = `new Promise((res) => {
  const t0 = performance.now(); let still = 0, ticks = 0;
  const id = setInterval(() => {
    const y = scrollY; ticks++;
    window.scrollBy({ top: 250, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollY === y) still++; else still = 0;
      if (still >= 4 || ticks > 400) { clearInterval(id); res({ t0: Math.round(t0), tEnd: Math.round(performance.now()), ticks, y: scrollY, h: document.documentElement.scrollHeight }); }
    }, 280);
  }, 300);
})`;

function gaEvents(hit) {
  // GA4 /g/collect: shared params in the URL, one event per body line (or the URL alone).
  let u; try { u = new URL(hit.url); } catch { return []; }
  if (!/\/g\/collect/.test(u.pathname)) return [];
  const lines = hit.body ? hit.body.split(/\r?\n/).filter(Boolean) : [''];
  return lines.map((l) => { const p = new URLSearchParams(l); const g = (k) => p.get(k) ?? u.searchParams.get(k);
    return { en: g('en'), pct: g('epn.percent_scrolled'), title: g('ep.page_title') || undefined, _et: g('_et') || undefined }; }).filter((e) => e.en);
}

async function listeners(page) {
  const { result } = await page.send('Runtime.evaluate', { expression: 'window' });
  const { listeners: ls } = await page.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  const scripts = page.scripts;
  return ls.filter((l) => ['scrollend', 'resize', 'visibilitychange', 'pagehide'].includes(l.type))
    .map((l) => `${l.type} ${(scripts.get(l.scriptId) || '?').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '')}:${l.lineNumber + 1}${l.useCapture ? ' capture' : ''}${l.passive ? ' passive' : ''}${l.once ? ' once' : ''}`);
}

async function scenario(cdp, v, url, sc, profile, hook = true) {
  log(`start ${v.label} ${sc}${hook ? '' : ' (no hook)'}`);
  const page = await cdp.newIsolatedPage();
  page.scripts = new Map();
  const hits = []; const dl = []; const errors = [];
  page.on((m) => {
    if (m.method === 'Debugger.scriptParsed') page.scripts.set(m.params.scriptId, m.params.url);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'debug') {
      const s = String(m.params.args?.[0]?.value || '');
      if (s.startsWith('__N11HIT__')) hits.push(JSON.parse(s.slice(10)));
      if (s.startsWith('__N11DL__')) dl.push(JSON.parse(s.slice(9)));
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  });
  await page.send('Network.enable');
  await page.send('Debugger.enable');
  await page.send('Debugger.setSkipAllPauses', { skip: true });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (hook) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await page.send('Page.bringToFront');
  await step('load', gotoAndSettle(page, url, { quietMs: 1500, maxMs: 15000 }), 20000);
  await sleep(800);
  const loc = await step('loc', page.eval('({ href: location.href, h: document.documentElement.scrollHeight, kit: Object.keys(window).some((k) => k.startsWith("__sveltekit")), dl: (window.dataLayer || []).length })'), 10000);
  log(`  loaded ${JSON.stringify(loc)}`);
  if (!hook) { await page.close(); return { variant: v.label, scenario: 'load-no-hook', loc }; }
  if (!/^https:\/\/localhost/.test(loc.href) || loc.h < 2000) throw new Error('page did not load: ' + JSON.stringify(loc));
  const ls = await step('listeners', listeners(page), 10000);
  await page.send('Debugger.disable');
  if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (profile) { await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 250 }); await page.send('Profiler.start'); }
  let scroll = null;
  if (sc === 'A') {
    scroll = await step('scroll', page.eval(SCROLL, { timeout: 120000 }), 60000);
    await sleep(TAIL_S * 1000);
  } else if (sc === 'B' || sc === 'D') {
    scroll = await step('jump', page.eval(`(async () => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await new Promise(r => setTimeout(r, 300)); return { y: scrollY, t: Math.round(performance.now()) }; })()`), 10000);
    if (sc === 'B') {
      // the visitor switches app 300 ms after the scroll: minimize the window -> visibilitychange(hidden), page stays alive
      const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: page.targetId });
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await sleep(1500);
      scroll.hidden = await step('hidden', page.eval('({ vis: document.visibilityState, dl: window.__n11.dl.slice(-5), hits: window.__n11.hits.length })'), 10000);
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
      await sleep(300);
    }
  } else if (sc === 'C') {
    scroll = await page.eval(`(async () => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); await new Promise(r => setTimeout(r, 400)); const yb = scrollY; window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 300)); return { yBottom: yb, y: scrollY, t: Math.round(performance.now()) }; })()`);
    await sleep(TAIL_S * 1000);
  }
  let prof = null;
  if (profile) { prof = (await step('profile', page.send('Profiler.stop'), 20000)).profile; await page.send('Profiler.disable'); }
  if (CPU > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const shim = await step('shim', page.eval('window.__mirrorVendorShim ? window.__mirrorVendorShim.neutered : null'), 10000);
  const dlBeforeLeave = dl.length; const hitsBeforeLeave = hits.length;
  // leave the page: visibilitychange(hidden) + pagehide, the vendors' unload flush
  await page.send('Page.navigate', { url: 'about:blank' });
  await sleep(1200);
  let afterLeave = null;
  if (v.label === '02-debug') { await page.send('Page.navigate', { url: url + 'robots.txt' }); await sleep(800); afterLeave = await step('afterLeave', page.eval("localStorage.getItem('n11dbg')"), 10000).catch((e) => String(e)); log('  localStorage n11dbg: ' + afterLeave); }
  await page.close();
  // a request passes several stacked fetch wrappers (shim, vendors): the hook can see it twice; count it once
  { const seen = new Set(); for (let i = hits.length - 1; i >= 0; i--) { const k = hits[i].url + '\u0000' + hits[i].body + '\u0000' + hits[i].t; if (seen.has(k)) hits.splice(i, 1); else seen.add(k); } }
  const events = hits.flatMap((h) => gaEvents(h).map((e) => ({ ...e, t: h.t, kind: h.kind, afterLeave: hits.indexOf(h) >= hitsBeforeLeave })));
  const hosts = {}; for (const h of hits) { const k = h.kind + ' ' + new URL(h.url).host; hosts[k] = (hosts[k] || 0) + 1; }
  return { variant: v.label, scenario: sc, listeners: ls, scroll, scrollDepthPushes: dl.filter((e) => e.ev === 'gtm.scrollDepth'), dlEvents: dl.map((e) => e.ev), dlBeforeLeave,
    afterLeave, gaEvents: events, hitHosts: hosts, shimNeutered: shim, errors: [...new Set(errors)].slice(0, 10), profile: prof };
}

function attribute(prof) {
  // Samples under the gtag scrollend listener (function c of QL in the served, minified gtag).
  const src = readFileSync(join(SITE, '__vendor/www.googletagmanager.com/gtag/js.__q_218232fe7c'), 'utf8');
  const pos = src.indexOf('function c(){OL(a,b);PL(c,!0)}');
  const pre = src.slice(0, pos); const line = pre.split('\n').length - 1; const col = pos - pre.lastIndexOf('\n') - 1;
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const dt = new Map(); prof.samples.forEach((s, i) => dt.set(s, (dt.get(s) || 0) + (prof.timeDeltas[i + 1] || 0)));
  const isRoot = (n) => /gtag\/js/.test(n.callFrame.url) && n.callFrame.functionName === 'c' && n.callFrame.lineNumber === line && Math.abs(n.callFrame.columnNumber - col) < 20;
  const roots = prof.nodes.filter(isRoot).map((n) => n.id);
  const under = new Set(); const walk = (id) => { under.add(id); for (const c of byId.get(id).children || []) walk(c); }; roots.forEach(walk);
  let total = 0; const self = new Map(); const byUrl = new Map();
  for (const id of under) { const n = byId.get(id); const t = dt.get(id) || 0; total += t; const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '')}:${f.lineNumber + 1}:${f.columnNumber + 1}`; self.set(k, (self.get(k) || 0) + t); const u = f.url ? f.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '') : `(${f.functionName || 'native'})`; byUrl.set(u, (byUrl.get(u) || 0) + t); }
  const pct = (x) => Math.round((1000 * x) / (total || 1)) / 10;
  return { listenerAt: `${line + 1}:${col + 1}`, invocations: roots.length, samplesUs: Math.round(total), selfTop: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${pct(v)}% ${k}`), byScript: [...byUrl.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${pct(v)}% ${k}`) };
}

const cpuLine = () => { const c = os.cpus(); const t = c.reduce((a, x) => { for (const k in x.times) a[k] = (a[k] || 0) + x.times[k]; return a; }, {}); return t; };
const c0 = cpuLine();
const host = { load1Before: os.loadavg()[0] };
const servers = {};
let chrome;
const file = join(OUT, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const save = () => writeFileSync(file, JSON.stringify(out, null, 1));
const out = { tool: 'research/vendor-scrollend/probe.mjs', cpu: CPU, tailS: TAIL_S, startedAt: new Date().toISOString(), host, runs: [] };
try {
  for (const v of VARIANTS) servers[v.label] = await startServer(v.label, v.overlay);
  log('servers', Object.fromEntries(Object.entries(servers).map(([k, s]) => [k, s.url])));
  chrome = await launchChrome({ port: 0, profileDir: join(REPO, 'out', 'chrome-probe-n11'), windowSize: '430,932' });
  const cdp = await CDP.connect(chrome.wsUrl);
  // allow the mirror's self-signed --https certificate (this dedicated Chrome only), as verify.mjs does
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true });
  // sanity: the plain baseline loads without the probe's hook (separates a hook problem from a load problem)
  const byLabel = Object.fromEntries(VARIANTS.map((v) => [v.label, v]));
  if (byLabel.base) { const r0 = await scenario(cdp, byLabel.base, servers.base.url, 'A', false, false); out.runs.push(r0); save(); }
  // most valuable first: A base (with the profile) and 02, the hide flush (B), back-scroll (C), then 01 and 03
  const ORDER = (opt('order') ? opt('order').split(',').map((x) => x.split(':')) : [['base', 'A'], ['02-idle', 'A'], ['02-idle', 'B'], ['base', 'B'], ['02-idle', 'D'], ['base', 'D'], ['02-idle', 'C'], ['base', 'C'], ['01-task', 'A'], ['03-drop', 'A']]);
  for (const [label, sc] of ORDER) {
    const v = byLabel[label];
    if (!v || !v.scenarios.includes(sc)) continue;
    if ((Date.now() - t0) / 1000 > BUDGET_S) { log(`budget ${BUDGET_S}s reached: skipping ${label} ${sc}`); out.skipped = [...(out.skipped || []), `${label} ${sc}`]; continue; }
    let r;
    try { r = await scenario(cdp, v, servers[v.label].url, sc, sc === 'A' && v.label === 'base'); }
    catch (e) { log(`${label} ${sc} FAILED: ${e.message}`); out.runs.push({ variant: label, scenario: sc, error: e.message }); save(); continue; }
    if (r.profile) { writeFileSync(join(REPO, 'out', 'probe-n11-base.cpuprofile'), JSON.stringify(r.profile)); r.attribution = attribute(r.profile); delete r.profile; }
    out.runs.push(r);
    save();
    log(`${v.label} ${sc}: scrollDepth pushes ${JSON.stringify(r.scrollDepthPushes)} scroll ${JSON.stringify(r.scroll)}; GA events ${r.gaEvents.map((e) => e.en + (e.pct ? '(' + e.pct + ')' : '') + (e.afterLeave ? '*' : '')).join(' ')}; errors ${r.errors.length}`);
  }
  cdp.close();
} catch (e) {
  out.error = String(e && e.stack || e);
  console.error(e);
} finally {
  if (chrome) await chrome.close();
  for (const s of Object.values(servers)) try { s.proc.kill(); } catch {}
  const c1 = cpuLine(); const tot = (t) => Object.values(t).reduce((a, b) => a + b, 0);
  host.load1After = os.loadavg()[0]; host.cpuIdlePct = Math.round((1000 * (c1.idle - c0.idle)) / (tot(c1) - tot(c0))) / 10;
  out.seconds = Math.round((Date.now() - t0) / 1000);
  save();
  log('wrote', file, JSON.stringify(host));
}
