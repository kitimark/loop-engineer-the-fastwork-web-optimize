#!/usr/bin/env node
// scrollcb-g0 invalidator probe (fix-scrollcb-g0, lead 2026-10-09: "find the per-frame invalidators on the approach").
// COUNTS ONLY, no timing claim. Chrome headless, no CPU throttle, 430x775 DPR 3 mobile+touch (the iPhone's scripted
// geometry); arms from ../build.mjs, served hashes checked (VOID on mismatch). One fresh serve.mjs + Chrome per load.
// Driver: the approach only, y 0 -> --ymax (4600) in --step px (10) per frame, one scrollTo per frame from a
// MessageChannel task posted by a document-start rAF tick (as scb-probe.mjs).
// What it counts over the window:
//  1. Writes (document-start wrappers, keyed by the first 2.DyWL8TcE.js line on the caller's stack -> top-level function):
//     CSSStyleDeclaration setProperty / removeProperty / cssText and every camelCase style setter, Element setAttribute /
//     removeAttribute / className, DOMTokenList add / remove / toggle / replace. Each write is classed "changed" (the
//     element's style or class attribute text differs after the call) or "same" (an idempotent write).
//  2. Trace (devtools.timeline + invalidationTracking + stacks): UpdateLayoutTree and Layout passes, forced = inside a
//     FireAnimationFrame / FunctionCall / EventDispatch on the main thread; every invalidation-tracking event
//     (Schedule/StyleRecalc/StyleInvalidator/Layout InvalidationTracking) keyed by its JS writer (stack line -> function)
//     or "native:<reason>", with the node name. Each pass is charged to the distinct invalidation keys seen since the
//     previous pass of the same kind ("what dirtied it"), so forced passes get a list of their invalidators.
// usage (shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node fixes/scrollcb-g0/probe/inval-probe.mjs --out out/scrollcb-g0/inval-775.json C:1 V:1
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, JS, CSS } from '../build.mjs';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the mirror's self-signed cert, localhost only
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, screenInfoArg, headedUA } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const VALUED = ['--out', '--step', '--ymax', '--h', '--driver'];
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = argv.filter((a, i) => /^[A-Z]+:\d+$/.test(a) && !VALUED.includes(argv[i - 1]));
const DRIVER = arg('--driver', 'touch'); // touch: CDP synthesizeScrollGesture drags (native scroll, no script flush); task: scrollTo per frame
const STEP = +arg('--step', '10'), YMAX = +arg('--ymax', '4600'), H = +arg('--h', '775');
const OUTD = join(WT, 'out/scrollcb-g0'); mkdirSync(OUTD, { recursive: true });
const OUT = arg('--out', join(OUTD, 'inval.json'));
const BASE = resolveTree('site-pretty');
const ARMS = build({ quiet: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const vp = { w: 430, h: H, dpr: 3, mobile: true };
if (!ORDER.length) { console.error('usage: inval-probe.mjs [--out f] [--step 10] [--ymax 4600] [--h 775] C:1 V:1'); process.exit(2); }

const INIT = `(() => {
  const P = window.__inv = { frame: 0, w: {}, errors: [], on: false };
  addEventListener('error', (e) => P.errors.push(String(e.message || e.error)));
  const where = () => { const s = new Error().stack || ''; const m = s.match(/2\\.DyWL8TcE\\.js:(\\d+):(\\d+)/); return m ? m[1] : 'other'; };
  const gA = Element.prototype.getAttribute;
  const snap = (el) => el && el.nodeType === 1 ? (gA.call(el, 'style') || '') + '|' + (gA.call(el, 'class') || '') : '';
  const rec = (kind, el, fn) => { if (!P.on || P.inW) return fn(); P.inW = true; let before, r; try { before = snap(el); r = fn(); } finally { P.inW = false; }
    const k = kind + '@' + where() + (snap(el) === before ? ':same' : ':changed'); P.w[k] = (P.w[k] || 0) + 1; return r; };
  const owner = new WeakMap();
  const SD = CSSStyleDeclaration.prototype;
  const elOf = (decl) => owner.get(decl) || null;
  const sg = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
  Object.defineProperty(HTMLElement.prototype, 'style', { configurable: true, enumerable: true, get() { const d = sg.get.call(this); owner.set(d, this); return d; }, set(v) { return sg.set.call(this, v); } });
  for (const m of ['setProperty', 'removeProperty']) { const o = SD[m]; SD[m] = function (...a) { return rec('style.' + m + ' ' + a[0], elOf(this), () => o.apply(this, a)); }; }
  for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(SD))) {
    if (!d.set || name === 'parentRule') continue;
    Object.defineProperty(SD, name, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { return rec('style.' + name, elOf(this), () => d.set.call(this, v)); } });
  }
  const EP = Element.prototype;
  for (const m of ['setAttribute', 'removeAttribute']) { const o = EP[m]; EP[m] = function (...a) { return rec(m + ' ' + a[0], this, () => o.apply(this, a)); }; }
  const cn = Object.getOwnPropertyDescriptor(EP, 'className');
  Object.defineProperty(EP, 'className', { configurable: true, enumerable: true, get: cn.get, set(v) { return rec('className', this, () => cn.set.call(this, v)); } });
  const TL = DOMTokenList.prototype; const cl = Object.getOwnPropertyDescriptor(EP, 'classList');
  Object.defineProperty(EP, 'classList', { configurable: true, enumerable: true, get() { const l = cl.get.call(this); owner.set(l, this); return l; } });
  for (const m of ['add', 'remove', 'toggle', 'replace']) { const o = TL[m]; TL[m] = function (...a) { return rec('classList.' + m + ' ' + a[0], owner.get(this), () => o.apply(this, a)); }; }
  const oraf = window.requestAnimationFrame.bind(window);
  const tick = () => { P.frame++; if (P.queue && P.queue.length) P.ch.port2.postMessage(0); oraf(tick); };
  P.ch = new MessageChannel();
  P.ch.port1.onmessage = () => { const y = P.queue.shift(); if (y === undefined) return; if (y !== null) window.scrollTo({ top: y, behavior: 'instant' }); if (!P.queue.length) P.done = true; };
  oraf(tick);
})()`;

function serve(arm, tag) {
  return new Promise((resolve, reject) => {
    const st = join(OUTD, `serve-inv-${tag}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', arm.dir, '--https', '--no-http-twin', '--no-cache', '--vendors=local', '--quiet', '--port', 'auto', '--state', st], { cwd: WT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (existsSync(st)) { try { const s = JSON.parse(readFileSync(st, 'utf8')); clearInterval(poll); resolve({ proc: p, url: `https://localhost:${s.port}/` }); } catch {} }
      else if (Date.now() - t0 > 20000 || p.exitCode !== null) { clearInterval(poll); p.kill(); reject(new Error('serve failed: ' + err.slice(0, 300))); }
    }, 100);
  });
}
function fnIndex(src) {
  const starts = [];
  src.split('\n').forEach((l, i) => { const m = /^(?:async )?function (\w+)\(/.exec(l); if (m) starts.push([i + 1, m[1]]); });
  return (line) => { let lo = 0, hi = starts.length - 1, f = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m][0] <= line) { f = starts[m][1]; lo = m + 1; } else hi = m - 1; } return f || 'top'; };
}
const INV = /InvalidationTracking$/;
const SCRIPTEV = new Set(['FireAnimationFrame', 'FunctionCall', 'EventDispatch', 'TimerFire', 'FireIdleCallback', 'v8.callFunction']);

export function analyzeTrace(events, a, b, fnOf) {
  const inW = (e) => e.ts >= a && e.ts < b;
  // main thread = the thread of the FireAnimationFrame events
  const tidCount = {}; for (const e of events) if (e.name === 'FireAnimationFrame') tidCount[e.tid] = (tidCount[e.tid] || 0) + 1;
  const main = +Object.entries(tidCount).sort((x, y) => y[1] - x[1])[0]?.[0];
  const ev = events.filter((e) => e.tid === main && inW(e)).sort((x, y) => x.ts - y.ts);
  // merged script intervals, binary search
  const iv = []; for (const s of ev) if (SCRIPTEV.has(s.name) && s.ph === 'X') { const e2 = s.ts + (s.dur || 0); const l = iv[iv.length - 1]; if (l && s.ts <= l[1]) l[1] = Math.max(l[1], e2); else iv.push([s.ts, e2]); }
  const inScript = (e) => { let lo = 0, hi = iv.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (iv[m][0] <= e.ts) { if (e.ts < iv[m][1]) return true; lo = m + 1; } else hi = m - 1; } return false; };
  const keyOf = (e) => {
    const d = e.args?.data || {};
    const st = d.stackTrace || [];
    const top = st.find((s) => /2\.DyWL8TcE\.js/.test(s.url || ''));
    const who = top ? `${fnOf(top.lineNumber + 1)}@${top.lineNumber + 1}` : `native:${d.reason || d.changedAttribute || d.changedPseudo || d.changedId || d.changedClass || '?'}`;
    return `${e.name.replace('InvalidationTracking', '')} ${who} ${String(d.nodeName || '').slice(0, 60)}`;
  };
  const inv = {}; const pend = { style: new Set(), layout: new Set() };
  const passes = { style: { all: 0, forced: 0, probe: 0 }, layout: { all: 0, forced: 0, probe: 0 } };
  const readers = { style: {}, layout: {} };
  const readerOf = (e) => { const st = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace || []; if (!st.length) return null; const top = st.find((f) => /2\.DyWL8TcE\.js/.test(f.url || '')); return top ? `${fnOf(top.lineNumber + 1)}@${top.lineNumber + 1}` : 'probe/other:' + (st[0].functionName || st[0].url || '?').slice(0, 40); };
  const charged = { style: {}, layout: {} }, chargedForced = { style: {}, layout: {} };
  for (const e of ev) {
    if (INV.test(e.name)) {
      const k = keyOf(e); inv[k] = (inv[k] || 0) + 1;
      (e.name === 'LayoutInvalidationTracking' ? pend.layout : pend.style).add(k);
      continue;
    }
    const kind = e.name === 'UpdateLayoutTree' ? 'style' : e.name === 'Layout' ? 'layout' : null;
    if (!kind || !(e.ph === 'X' || e.ph === 'B')) continue;
    const rd = inScript(e) ? readerOf(e) || 'nostack' : null;
    if (rd && rd.startsWith('probe/')) { passes[kind].probe++; pend[kind].clear(); continue; }
    const forced = !!rd;
    passes[kind].all++; if (forced) { passes[kind].forced++; readers[kind][rd] = (readers[kind][rd] || 0) + 1; }
    for (const k of pend[kind]) { charged[kind][k] = (charged[kind][k] || 0) + 1; if (forced) chargedForced[kind][k] = (chargedForced[kind][k] || 0) + 1; }
    if (!pend[kind].size) { charged[kind]['(none seen)'] = (charged[kind]['(none seen)'] || 0) + 1; if (forced) chargedForced[kind]['(none seen)'] = (chargedForced[kind]['(none seen)'] || 0) + 1; }
    pend[kind].clear();
  }
  const top = (o, n = 40) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n));
  return { passes, readers: { style: top(readers.style), layout: top(readers.layout) }, invalidations: top(inv, 80), chargedForced: { style: top(chargedForced.style), layout: top(chargedForced.layout) }, charged: { style: top(charged.style), layout: top(charged.layout) } };
}

async function runLoad(armName, rep) {
  const arm = ARMS[armName];
  const tag = `${armName}${rep}`;
  const r = { arm: armName, rep: Number(rep), vp, step: STEP, ymax: YMAX, startedAt: new Date().toISOString() };
  let srv, chrome, cdp;
  try {
    srv = await serve(arm, tag);
    const jsSrc = Buffer.from(await (await fetch(new URL(JS, srv.url))).arrayBuffer());
    const cssSrc = Buffer.from(await (await fetch(new URL(CSS, srv.url))).arrayBuffer());
    r.served = { js: sha(jsSrc), css: sha(cssSrc) };
    if (r.served.js !== arm.js || r.served.css !== arm.css) throw new Error(`VOID served ${r.served.js} / ${r.served.css}`);
    const fnOf = fnIndex(jsSrc.toString('utf8'));
    chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/scrollcb-g0/chrome'), 'inv-' + tag), headless: true, windowSize: `1280,932`, args: ['--ignore-certificate-errors', screenInfoArg()] });
    cdp = await CDP.connect(chrome.wsUrl);
    const page = await cdp.newIsolatedPage();
    await page.send('Network.enable');
    const ua = await page.eval('navigator.userAgent');
    await page.send('Network.setUserAgentOverride', { userAgent: headedUA(ua) });
    const pageErrors = [];
    page.on((m) => { if (m.method === 'Runtime.exceptionThrown') pageErrors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text).split('\n')[0]); });
    await page.send('Runtime.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    await page.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, srv.url, { quietMs: 2000, maxMs: 45000 });
    await sleep(2500);
    r.docHeight = await page.eval('document.documentElement.scrollHeight');
    if (r.docHeight < 3 * vp.h) throw new Error(`VOID doc ${r.docHeight}`);
    const q = []; for (let y = 0; y <= YMAX; y += STEP) q.push(y); q.push(null, null, null);
    r.steps = q.filter((x) => typeof x === 'number').length;
    const events = [];
    const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
    await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 800 * 1024,
      includedCategories: ['devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack',
        'disabled-by-default-devtools.timeline.invalidationTracking', '__metadata'] }, transferMode: 'ReportEvents' });
    await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`); await sleep(800);
    r.driver = DRIVER;
    if (DRIVER === 'task') {
      await page.eval(`(() => { const P = window.__inv; P.w = {}; P.f0 = P.frame; P.on = true; P.done = false; P.queue = ${JSON.stringify(q)}; performance.mark('inv-start'); })()`);
      const t0 = Date.now();
      while (!(await page.eval('window.__inv.done')) && Date.now() - t0 < 150000) await sleep(250);
      if (!(await page.eval('window.__inv.done'))) throw new Error('VOID queue did not finish');
    } else {
      // G-like: 520 px finger drags at ~430 px/s (the g0 G program's approach strokes), 300 ms apart, until y >= ymax
      await page.eval(`(() => { const P = window.__inv; P.w = {}; P.f0 = P.frame; P.on = true; performance.mark('inv-start'); })()`);
      let n = 0; while ((await page.eval('scrollY')) < YMAX && n < 20) { await page.send('Input.synthesizeScrollGesture', { x: 215, y: Math.round(H * 0.75), yDistance: -520, speed: 430, gestureSourceType: 'touch' }); n++; await sleep(300); }
      r.drags = n; await sleep(800);
    }
    await sleep(300);
    const res = await page.eval(`(() => { const P = window.__inv; P.on = false; performance.mark('inv-end'); return { frames: P.frame - P.f0, w: P.w, errors: P.errors, y: scrollY }; })()`);
    r.frames = res.frames; r.yEnd = res.y; r.pageErrors = [...pageErrors, ...res.errors];
    const wr = {};
    for (const [k, n] of Object.entries(res.w)) { const m = /^(.*)@(\w+):(same|changed)$/.exec(k); if (!m) continue; const fn = m[2] === 'other' ? 'other' : `${fnOf(+m[2])}@${m[2]}`; const kk = `${fn} ${m[1]}`; wr[kk] ||= { changed: 0, same: 0 }; wr[kk][m[3]] += n; }
    r.writes = Object.fromEntries(Object.entries(wr).sort((x, y) => (y[1].changed + y[1].same) - (x[1].changed + x[1].same)));
    await sleep(300);
    await page.send('Tracing.end');
    await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 180000);
    off();
    let a, b; for (const e of events) { if (e.name === 'inv-start') a = e.ts; if (e.name === 'inv-end') b = e.ts; }
    if (a === undefined || b === undefined) throw new Error('VOID trace marks missing');
    r.trace = analyzeTrace(events, a, b, fnOf);
    await page.close();
  } catch (e) { r.void = String(e && e.message || e); }
  finally { try { cdp && cdp.close(); } catch {} try { chrome && (await chrome.close()); } catch {} try { srv && srv.proc.kill(); } catch {} }
  return r;
}

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { tool: 'fixes/scrollcb-g0/probe/inval-probe.mjs', loads: [] };
for (const L of ORDER) {
  const [arm, rep] = L.split(':');
  if (!ARMS[arm]) throw new Error('unknown arm ' + arm);
  const r = await runLoad(arm, rep);
  out.loads.push(r); writeFileSync(OUT, JSON.stringify(out, null, 1));
  const p = r.trace?.passes;
  console.log(`INV ${L} ${r.void || ''} served ${r.served?.js} steps ${r.steps} frames ${r.frames} style ${p?.style.all} (forced ${p?.style.forced}) layout ${p?.layout.all} (forced ${p?.layout.forced}) errors ${r.pageErrors?.length}`);
  if (r.trace) {
    console.log('  forced readers:', JSON.stringify(r.trace.readers));
    console.log('  forced style charged to:', JSON.stringify(Object.entries(r.trace.chargedForced.style).slice(0, 8)));
    console.log('  forced layout charged to:', JSON.stringify(Object.entries(r.trace.chargedForced.layout).slice(0, 8)));
    console.log('  top changed writes:', JSON.stringify(Object.entries(r.writes).filter(([, v]) => v.changed).slice(0, 10)));
  }
}
console.log('wrote', OUT);
