#!/usr/bin/env node
// EXPLORATORY, NOT SCORED (P-103 guard follow-up): scb-probe.mjs plus Paint events by painted element and by time bin.
// scroll-cb-phone probe (fix-scroll-cb). COUNTS AND STATE PARITY ONLY: no timing claim, nothing is judged in ms.
// Arms from ../build.mjs (immutable snapshot copies: C = best build, V = C + patch-on-best.diff). Loads in the order
// given (e.g. C:1 V:1 V:2 C:2); each load: its own serve.mjs (https, --vendors=local, no cache, --port auto) and a
// fresh headless Chrome (no CPU throttle; virtual screen and UA like tools/check.mjs).
// Viewports (--vp): phone 430x932 DPR 3 mobile+touch | phone775 430x775 | desk 1280x900 DPR 1 | desk900 900x900 DPR 1
// (commission compact, future/platform not) | resize (phone run; then mid-page, desktop 1280x900, 40 steps down; then
// phone again, 81 steps up).
// Driver: one scrollTo per frame, issued from a MessageChannel task posted by a document-start rAF tick (so the new
// offset is in place before the next frame's scroll event and rAF phase): top -> bottom -> top in --step px (10), then
// 21 instant jumps across the page, each held 3 frames.
// Per frame (the tick runs first in every frame): classes and style attributes of every element the four side jobs
// and the nav write, stored as changes [frame, step, key, value] (the state the page had after the previous frame).
// Counters (document-start wrappers): getBoundingClientRect, Range.getClientRects, getComputedStyle, scrollY reads,
// querySelector, elementsFromPoint, requestAnimationFrame, each keyed by the first 2.DyWL8TcE.js line on the
// caller's stack, then attributed to the top-level function that contains that line in the served JS (side jobs:
// AE commission, uM profile, mM future, GM platform, scbGate the V helper).
// Trace (devtools.timeline): FireAnimationFrame, PrePaint, UpdateLayoutTree, Layout, Paint per step; UpdateLayoutTree /
// Layout inside a FireAnimationFrame = forced, attributed by the JS line on their stack.
// usage (shared lane, one viewport per hold):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-scroll-cb -- \
//     node fixes/scroll-cb-phone/probe/scb-probe.mjs --vp phone --out out/scroll-cb-phone/counts-phone.json C:1 V:1 V:2 C:2
// (--out accumulates: loads are appended to an existing file, and parity is recomputed over all its loads)
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
const VALUED = ['--vp', '--out', '--step'];
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = argv.filter((a, i) => /^[A-Z]+:\d+$/.test(a) && !VALUED.includes(argv[i - 1]));
const VP = arg('--vp', 'phone');
const TRACE = !argv.includes('--no-trace');
const STEP = +arg('--step', '10');
const OUTD = join(WT, 'out/scroll-cb-phone'); mkdirSync(OUTD, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = arg('--out', join(OUTD, `probe-${VP}-${stamp}.json`));
const BASE = resolveTree('site-pretty');
const ARMS = build({ quiet: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const SIDE = ['AE', 'uM', 'mM', 'GM', 'scbGate'];
const VPS = {
  phone: { w: 430, h: 932, dpr: 3, mobile: true },
  phone775: { w: 430, h: 775, dpr: 3, mobile: true },
  desk: { w: 1280, h: 900, dpr: 1, mobile: false },
  desk900: { w: 900, h: 900, dpr: 1, mobile: false },
  resize: { w: 430, h: 932, dpr: 3, mobile: true },
};
const vp = VPS[VP];
if (!vp || !ORDER.length) { console.error('usage: scb-probe.mjs [--vp phone|phone775|desk|desk900|resize] [--out f.json] [--step 10] [--no-trace] C:1 V:1 V:2 C:2'); process.exit(2); }

const INIT = `(() => {
  const P = window.__scb = { frame: 0, counts: {}, log: [], last: {}, k: 0, errors: [] };
  addEventListener('error', (e) => P.errors.push(String(e.message || e.error)));
  addEventListener('unhandledrejection', (e) => P.errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
  const where = () => { const s = new Error().stack || ''; const m = s.match(/2\\.DyWL8TcE\\.js:(\\d+):(\\d+)/); return m ? m[1] : 'other'; };
  const bump = (k) => { if (!P.on) return; const w = k + '@' + where(); P.counts[w] = (P.counts[w] || 0) + 1; };
  const wrap = (obj, name, key) => { const o = obj[name]; obj[name] = function (...a) { bump(key); return o.apply(this, a); }; };
  wrap(Element.prototype, 'getBoundingClientRect', 'rect');
  wrap(Range.prototype, 'getClientRects', 'rangeRects');
  wrap(window, 'getComputedStyle', 'gcs');
  wrap(Document.prototype, 'querySelector', 'qs');
  wrap(Element.prototype, 'querySelector', 'qs');
  wrap(Document.prototype, 'elementsFromPoint', 'hit');
  const oraf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { bump('raf'); return oraf(cb); };
  for (const k of ['scrollY', 'pageYOffset']) { try { const d = Object.getOwnPropertyDescriptor(window, k); if (d && d.get) Object.defineProperty(window, k, { configurable: true, enumerable: true, get() { bump('scrollY'); return d.get.call(window); }, set: d.set ? function (v) { d.set.call(window, v); } : undefined }); } catch {} }
  const SEL = { nav: '.start-selling-top-nav', commission: 'section.commission', ccard: '.commission-card', runway: '.commission-runway',
    pain: '.pain', future: '#people', fcard: '.start-selling-future-card', platform: '#platform', pcard: '.start-selling-platform-card',
    profile: '.start-selling-profile', psticky: '.start-selling-profile-sticky', pshell: '.start-selling-profile-shell.is-active-shell' };
  const els = {};
  const qs = Document.prototype.querySelector;
  const get = (k) => { const e = els[k]; return e && e.isConnected ? e : (els[k] = qs.call(document, SEL[k])); };
  const snap = () => { const o = {}; for (const k in SEL) { const e = get(k); o[k] = e ? (e.getAttribute('class') || '') + ' | ' + (e.getAttribute('style') || '') : '-'; } return o; };
  P.snap = snap;
  const tick = () => {
    P.frame++;
    if (P.rec) { const s = snap(); for (const k in s) if (s[k] !== P.last[k]) { P.log.push([P.frame - 1, P.k, k, s[k]]); P.last[k] = s[k]; } }
    if (P.queue && P.queue.length) P.ch.port2.postMessage(0);
    oraf(tick);
  };
  P.ch = new MessageChannel();
  P.ch.port1.onmessage = () => { const y = P.queue.shift(); if (y === undefined) return; P.k++; if (y === 'mark') { P.marks.push(P.frame); } else if (y !== null) { P.y = y; window.scrollTo({ top: y, behavior: 'instant' }); } if (!P.queue.length) P.done = true; };
  P.marks = [];
  oraf(tick);
})()`;

function serve(arm, tag) {
  return new Promise((resolve, reject) => {
    const st = join(OUTD, `serve-${tag}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', arm.dir, '--https', '--no-http-twin', '--no-cache', '--vendors=local', '--quiet', '--port', 'auto', '--state', st], { cwd: WT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (existsSync(st)) { try { const s = JSON.parse(readFileSync(st, 'utf8')); clearInterval(poll); resolve({ proc: p, url: `https://localhost:${s.port}/` }); } catch {} }
      else if (Date.now() - t0 > 20000 || p.exitCode !== null) { clearInterval(poll); p.kill(); reject(new Error('serve failed: ' + err.slice(0, 300))); }
    }, 100);
  });
}

// top-level function containing each line of the served JS
function fnIndex(src) {
  const starts = [];
  src.split('\n').forEach((l, i) => { const m = /^(?:async )?function (\w+)\(/.exec(l); if (m) starts.push([i + 1, m[1]]); });
  return (line) => { let lo = 0, hi = starts.length - 1, f = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m][0] <= line) { f = starts[m][1]; lo = m + 1; } else hi = m - 1; } return f || 'top'; };
}

async function runLoad(armName, rep) {
  const arm = ARMS[armName];
  const tag = `${armName}${rep}`;
  const r = { arm: armName, rep, vp: VP, pinned: { js: arm.js, css: arm.css }, dir: arm.dir.replace(WT + '/', ''), startedAt: new Date().toISOString() };
  let srv, chrome, cdp;
  try {
    srv = await serve(arm, tag);
    const jsSrc = Buffer.from(await (await fetch(new URL(JS, srv.url))).arrayBuffer());
    const cssSrc = Buffer.from(await (await fetch(new URL(CSS, srv.url))).arrayBuffer());
    r.served = { js: sha(jsSrc), css: sha(cssSrc) };
    if (r.served.js !== arm.js || r.served.css !== arm.css) throw new Error(`VOID served ${r.served.js} / ${r.served.css}, pinned ${arm.js} / ${arm.css}`);
    const fnOf = fnIndex(jsSrc.toString('utf8'));
    chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/scroll-cb-phone/chrome'), 'scb-' + tag), headless: true, windowSize: `${Math.max(vp.w, 1280)},${Math.max(vp.h, 932)}`, args: ['--ignore-certificate-errors', screenInfoArg()] });
    cdp = await CDP.connect(chrome.wsUrl);
    const page = await cdp.newIsolatedPage();
    await page.send('Network.enable');
    const ua = await page.eval('navigator.userAgent');
    await page.send('Network.setUserAgentOverride', { userAgent: headedUA(ua) });
    let jsLoaded = 0; const pageErrors = [];
    page.on((m) => {
      if (m.method === 'Network.responseReceived' && m.params.response.url.includes(JS)) jsLoaded++;
      if (m.method === 'Runtime.exceptionThrown') pageErrors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text).split('\n')[0]);
    });
    await page.send('Runtime.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    const setVp = (v) => page.send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: v.mobile });
    await setVp(vp);
    if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, srv.url, { quietMs: 2000, maxMs: 45000 });
    await sleep(2500);
    r.url = await page.eval('location.href');
    r.docHeight = await page.eval('document.documentElement.scrollHeight');
    r.innerHeight = await page.eval('innerHeight');
    if (!jsLoaded || r.docHeight < 3 * vp.h) throw new Error(`VOID page did not render the app (node JS loads ${jsLoaded}, doc ${r.docHeight})`);
    r.geom = await page.eval(`(() => { const o = {}; const g = (k, s) => { const e = document.querySelector(s); if (!e) return; const b = e.getBoundingClientRect(); o[k] = [Math.round(b.top + scrollY), Math.round(b.bottom + scrollY)]; };
      g('heroTrack', '.hero-track'); g('pain', '.pain'); g('commission', 'section.commission'); g('ccard', '.commission-card'); g('profile', '.start-selling-profile'); g('future', '#people'); g('fcard', '.start-selling-future-card'); g('fheader', '.start-selling-future-header'); g('platform', '#platform'); g('pcard', '.start-selling-platform-card'); return o; })()`);
    const max = r.docHeight - r.innerHeight;
    const q = [];
    for (let y = 0; y <= max; y += STEP) q.push(y);
    q.push(max, null, null, null, null);
    for (let y = max; y >= 0; y -= STEP) q.push(y);
    q.push(0, null, null, null, null, 'mark');
    const jumps = [0.5, 0.1, 0.9, 0.3, 1, 0.45, 0.7, 0.2, 0.6, 0.05, 0.8, 0.35, 0.95, 0.55, 0.25, 0.65, 0.15, 0.75, 0.4, 0.85, 0];
    for (const f of jumps) q.push(Math.round(f * max), null, null, null);
    q.push('mark');
    let steps = q.filter((x) => typeof x === 'number').length;
    const events = [];
    let off = () => {};
    if (TRACE) {
      off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
      await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 600 * 1024,
        includedCategories: ['devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', '__metadata'] }, transferMode: 'ReportEvents' });
    }
    await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`);
    await sleep(800);
    await page.eval(`(() => { const P = window.__scb; P.y = 0; P.k = 0; P.last = P.snap(); P.log = []; P.counts = {}; P.f0 = P.frame; P.on = true; P.rec = true; P.done = false; P.marks = []; P.queue = ${JSON.stringify(q)}; performance.mark('scb-start'); })()`);
    const t0 = Date.now();
    while (!(await page.eval('window.__scb.done')) && Date.now() - t0 < 150000) await sleep(250);
    if (!(await page.eval('window.__scb.done'))) throw new Error('VOID scroll queue did not finish in 150 s');
    await sleep(300);
    if (VP === 'resize') {
      const mid = Math.round(max * 0.5);
      await page.eval(`(() => { const P = window.__scb; P.done = false; P.queue = [${mid}, null, null, null, null]; })()`);
      while (!(await page.eval('window.__scb.done'))) await sleep(100);
      await setVp(VPS.desk); await page.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await sleep(800);
      await page.eval(`(() => { const P = window.__scb; P.done = false; const q = []; for (let i = 1; i <= 40; i++) q.push(${mid} + i * ${STEP}); q.push(null, null, null, 'mark'); P.queue = q; })()`);
      while (!(await page.eval('window.__scb.done'))) await sleep(100);
      await setVp(vp); await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await sleep(800);
      await page.eval(`(() => { const P = window.__scb; P.done = false; const q = []; for (let i = 40; i >= -40; i--) q.push(${mid} + i * ${STEP}); q.push(null, null, null, 'mark'); P.queue = q; })()`);
      while (!(await page.eval('window.__scb.done'))) await sleep(100);
      await sleep(300);
      steps += 1 + 40 + 81;
    }
    const res = await page.eval(`(() => { const P = window.__scb; P.on = false; P.rec = false; performance.mark('scb-end'); return { frames: P.frame - P.f0, log: P.log, counts: P.counts, marks: P.marks.map((m) => m - P.f0), f0: P.f0, errors: P.errors }; })()`);
    r.steps = steps; r.frames = res.frames; r.marks = res.marks;
    const wantMarks = VP === 'resize' ? 4 : 2;
    if (res.marks.length !== wantMarks) throw new Error(`VOID marks ${res.marks.length}, want ${wantMarks}`);
    r.log = res.log.map(([f, k, key, v]) => [f - res.f0, k, key, v]);
    r.pageErrors = [...pageErrors, ...res.errors];
    const byFn = {};
    for (const [k, n] of Object.entries(res.counts)) { const [kind, line] = k.split('@'); const fn = line === 'other' ? 'other' : fnOf(+line); byFn[fn] ||= {}; byFn[fn][kind] = (byFn[fn][kind] || 0) + n; }
    r.calls = byFn;
    const side = {}; for (const fn of SIDE) for (const [kind, n] of Object.entries(byFn[fn] || {})) side[kind] = (side[kind] || 0) + n;
    const all = {}; for (const o of Object.values(byFn)) for (const [kind, n] of Object.entries(o)) all[kind] = (all[kind] || 0) + n;
    const per = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v / steps) * 1000) / 1000]));
    r.perStep = { side: per(side), all: per(all) };
    r.sideByFn = Object.fromEntries(SIDE.map((fn) => [fn, per(byFn[fn] || {})]));
    if (TRACE) {
      await sleep(300);
      await page.send('Tracing.end');
      await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 180000);
      off();
      let a, b; for (const e of events) { if (e.name === 'scb-start') a = e.ts; if (e.name === 'scb-end') b = e.ts; } const b0 = b;
      if (a === undefined || b === undefined) throw new Error('VOID trace marks missing');
      const inW = (e) => e.ts >= a && e.ts < b;
      const rafs = events.filter((e) => e.name === 'FireAnimationFrame' && e.ph === 'X' && inW(e));
      const byTid = new Map(); for (const p of rafs) { if (!byTid.has(p.tid)) byTid.set(p.tid, []); byTid.get(p.tid).push(p); }
      for (const l of byTid.values()) l.sort((x, y) => x.ts - y.ts);
      const inRaf = (e) => { const l = byTid.get(e.tid); if (!l) return false; let lo = 0, hi = l.length - 1, f = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (l[m].ts <= e.ts) { f = m; lo = m + 1; } else hi = m - 1; } return f >= 0 && e.ts <= l[f].ts + (l[f].dur || 0); };
      const tot = { fireAnimationFrame: rafs.length, prePaint: 0, updateLayoutTree: 0, layout: 0, paint: 0, forcedUpdateLayoutTree: 0, forcedLayout: 0, functionCallNode: 0, computeIntersections: 0 };
      const ioNames = {}; const paints = [];
      const forced = {}, fc = {};
      for (const e of events) {
        if (!inW(e)) continue;
        if (e.name === 'PrePaint' && e.ph === 'X') tot.prePaint++;
        if (e.name === 'Paint' && e.ph === 'X') { tot.paint++; const d = e.args?.data || {}; paints.push([e.ts, d.nodeId, d.layerId, (d.clip || []).join(',')]); }
        if (/ntersection/.test(e.name) && (e.ph === 'X' || e.ph === 'B')) { tot.computeIntersections++; ioNames[e.name] = (ioNames[e.name] || 0) + 1; } // N2: reported, not judged
        if (e.name === 'FunctionCall' && e.ph === 'X') { const d = e.args?.data || {}; if (/2\.DyWL8TcE\.js/.test(d.url || '')) { tot.functionCallNode++; const fn = fnOf((d.lineNumber || 0) + 1); fc[fn] = (fc[fn] || 0) + 1; } }
        if ((e.name === 'UpdateLayoutTree' || e.name === 'Layout') && (e.ph === 'X' || e.ph === 'B')) {
          const isU = e.name === 'UpdateLayoutTree';
          isU ? tot.updateLayoutTree++ : tot.layout++;
          if (inRaf(e)) {
            isU ? tot.forcedUpdateLayoutTree++ : tot.forcedLayout++;
            const st = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace || [];
            const top = st.find((s) => /2\.DyWL8TcE\.js/.test(s.url || ''));
            const k = `${isU ? 'style' : 'layout'}@${top ? fnOf(top.lineNumber + 1) : 'nostack'}`;
            forced[k] = (forced[k] || 0) + 1;
          }
        }
      }
      r.trace = { events: events.length, tot, perStep: per(tot), functionCallsByFn: fc, forcedByFn: forced, intersectionEventNames: ioNames };
      const desc = {};
      try { await page.send('DOM.getDocument', { depth: 0 }); } catch {}
      for (const id of new Set(paints.map((x) => x[1]))) {
        if (id === undefined) { desc[id] = 'none'; continue; }
        try { const { node } = await page.send('DOM.describeNode', { backendNodeId: id }); const at = node.attributes || []; const ci = at.indexOf('class'); const ii = at.indexOf('id'); desc[id] = `${node.nodeName}${ii >= 0 ? '#' + at[ii + 1] : ''}${ci >= 0 ? '.' + at[ci + 1].split(/\s+/).filter((c) => !/^svelte-/.test(c)).slice(0, 3).join('.') : ''}`; } catch { desc[id] = 'gone#' + id; }
      }
      const byEl = {}, bins = new Array(40).fill(0), elBins = {};
      for (const [ts, id] of paints) { const k = desc[id]; byEl[k] = (byEl[k] || 0) + 1; const b = Math.min(39, Math.floor(((ts - a) / (b0 - a)) * 40)); bins[b]++; (elBins[k] ||= new Array(40).fill(0))[b]++; }
      r.paintByEl = byEl; r.paintBins = bins; r.paintElBins = elBins;
    }
    await page.close();
  } catch (e) {
    r.void = String(e && e.message || e);
  } finally {
    try { cdp && cdp.close(); } catch {}
    try { chrome && (await chrome.close()); } catch {}
    try { srv && srv.proc.kill(); } catch {}
  }
  return r;
}

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { vp: VP, step: STEP, tool: 'fixes/scroll-cb-phone/probe/scb-probe.mjs', loads: [] };
for (const L of ORDER) {
  const [arm, rep] = L.split(':');
  if (!ARMS[arm]) throw new Error('unknown arm ' + arm);
  const r = await runLoad(arm, +rep);
  out.loads.push(r);
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  const t = r.trace?.perStep || {};
  console.log(`${arm}${rep} ${VP}: ${r.void ? r.void : `served ${r.served.js}/${r.served.css} steps ${r.steps} frames ${r.frames} doc ${r.docHeight} errors ${r.pageErrors.length}`}`);
  if (!r.void) console.log(`  side/step ${JSON.stringify(r.perStep.side)}  all/step raf ${r.perStep.all.raf} rect ${r.perStep.all.rect}  trace/step ${JSON.stringify(t)}`);
}
// parity: each valid load vs the first valid C load, step by step; a V difference that also shows between another
// C load and the first C load (same frame, key and value) is an A/A flake
const key = (l) => l.map(([, s, k, v]) => `${s}|${k}|${v}`); // keyed by driver step (one step per frame while the queue runs; sleeps around a resize keep the step)
const valid = out.loads.filter((l) => !l.void && l.log);
const c1 = valid.find((l) => l.arm === 'C');
if (c1) {
  const A = new Set(key(c1.log));
  const diff = (l) => { const B = new Set(key(l.log)); return [...[...A].filter((x) => !B.has(x)).map((x) => '-' + x), ...[...B].filter((x) => !A.has(x)).map((x) => '+' + x)]; };
  const flakes = new Set(valid.filter((l) => l.arm === 'C' && l !== c1).flatMap(diff));
  out.parity = valid.filter((l) => l !== c1).map((l) => { const d = diff(l); const real = l.arm === 'C' ? d : d.filter((x) => !flakes.has(x)); return { load: `${l.arm}${l.rep}`, vs: `C${c1.rep}`, changes: l.log.length, base: c1.log.length, diffs: d.length, beyondAA: l.arm === 'C' ? null : real.length, sample: (l.arm === 'C' ? d : real).slice(0, 16) }; });
  for (const p of out.parity) console.log(`  parity ${p.load} vs ${p.vs}: diffs ${p.diffs}${p.beyondAA === null ? ' (A/A)' : `, beyond A/A ${p.beyondAA}`}`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('wrote ' + OUT);
