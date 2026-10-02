// countdown-faces probe (T-024): what the countdown clock costs to render, and what the PoC changes.
// Chrome mobile 430x932 DPR3 + touch, CPU 6x (the calibrated setting), fresh isolated context per page, servers
// started by this script (--vendors=local --https --latency 150). Arms are overlays built by arms.mjs.
//
//   node fixes/countdown-faces/probe.mjs counts  [arms=base,still,faces,poc] [runs=1]   COUNTS ONLY (shared lane)
//   node fixes/countdown-faces/probe.mjs profile [arms=base,still,poc] [runs=1]         CPU profile + trace durations (normal hold)
//   node fixes/countdown-faces/probe.mjs pixels  [arms=base,poc]                          frozen-frame diffs (counts lane: no timing)
//
// Run ONLY inside a chrome-measure hold, e.g.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner countdown-faces -- node fixes/countdown-faces/probe.mjs counts
//   node tools/lock.mjs run chrome-measure --owner countdown-faces --max-seconds 600 -- node fixes/countdown-faces/probe.mjs profile
// Output: out/countdown-faces/<mode>-<stamp>.json (+ pixel PNGs under out/countdown-faces/pixels-<stamp>/).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));

const MODE = process.argv[2] || 'counts';
const ARMS = (process.argv[3] || (MODE === 'pixels' ? 'base,poc' : MODE === 'profile' ? 'base,still,poc' : 'base,still,faces,poc')).split(',');
const RUNS = Number(process.argv[4] || 1);
const WHICH = process.argv[5] || 'both'; // counts/profile: iso | full | both
const OUT = join(WT, 'out/countdown-faces');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const DIRS = JSON.parse(readFileSync(join(OUT, 'arms/arms.json'), 'utf8'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const log = (...a) => console.log(...a);

// ---------- servers ----------
async function server(label, overlays) {
  const st = join(OUT, `serve-${label}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(overlays.length ? ['--overlay', overlays.join(',')] : []), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150', '--no-http-twin'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(label + ' server did not start');
}
// countdown code range (1-based lines) in an arm's node file: from the spring constants to the next component
function cdRange(arm) {
  const f = arm === 'base' ? join(BASE, NODE) : join(DIRS[arm], NODE);
  const lines = readFileSync(f, 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1;
  const b = lines.findIndex((l) => l.startsWith('var lD = h(')) + 1;
  if (a < 1 || b <= a) throw new Error('countdown range not found in ' + f);
  return [a, b - 1];
}

// ---------- page setup ----------
async function openPage(cdp, { inject } = {}) {
  const page = await cdp.newIsolatedPage();
  page.errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') page.errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') page.errors.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`.slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') page.errors.push(`console: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
  });
  await page.send('Log.enable');
  await page.send('Performance.enable');
  await page.send('DOM.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (inject) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: inject });
  await page.send('Page.bringToFront');
  return page;
}
const KEYS = ['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'RecalcStyleCount', 'LayoutCount', 'LayoutDuration'];
const metrics = async (page) => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.filter((m) => KEYS.includes(m.name)).map((m) => [m.name, m.value]));
const mdelta = (a, b) => Object.fromEntries(KEYS.map((k) => [k, /Duration/.test(k) ? +((b[k] - a[k]) * 1000).toFixed(1) : b[k] - a[k]]));

// Per-timer census: where each [role=timer] is, whether it can be seen, and why not.
const CENSUS = `(() => [...document.querySelectorAll('[role=timer]')].map((t, i) => {
  const r = t.getBoundingClientRect(); let op = 1, vis = 'visible', scene = null, cv = null;
  for (let e = t; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); op *= +cs.opacity;
    if (cs.visibility !== 'visible' && vis === 'visible') vis = cs.visibility; if (cs.display === 'none') vis = 'display:none';
    if (scene === null && e.hasAttribute('data-start-selling-scene')) scene = e.getAttribute('data-start-selling-scene');
    if (cv === null && cs.contentVisibility && cs.contentVisibility !== 'visible') cv = cs.contentVisibility; }
  const inViewport = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  return { i, inverse: t.classList.contains('inverse'), top: Math.round(r.top), h: Math.round(r.height), inViewport, opacity: +op.toFixed(3), visibility: vis, scene, contentVisibility: cv,
    canBeSeen: inViewport && op > 0 && vis === 'visible',
    faces: t.querySelectorAll('.face.svelte-1quva9c').length, digits: t.querySelectorAll('.digit.svelte-1quva9c').length,
    willChangeFaces: [...t.querySelectorAll('.face.svelte-1quva9c')].filter((f) => getComputedStyle(f).willChange.includes('transform')).length,
    elements: t.querySelectorAll('*').length + 1 }; }))()`;

// MutationObserver counters per timer (count mode only): face style writes, face text changes, nodes added/removed.
const MO = `(() => { const S = window.__cdf = { on: false, style: {}, text: {}, nodes: {} };
  const idx = (n) => { const t = (n.nodeType === 1 ? n : n.parentElement)?.closest?.('[role=timer]'); return t ? [...document.querySelectorAll('[role=timer]')].indexOf(t) : -1; };
  new MutationObserver((l) => { if (!S.on) return; for (const m of l) { const i = idx(m.target); if (i < 0) continue;
    if (m.type === 'attributes') S.style[i] = (S.style[i] || 0) + 1; else if (m.type === 'characterData') S.text[i] = (S.text[i] || 0) + 1; else S.nodes[i] = (S.nodes[i] || 0) + m.addedNodes.length + m.removedNodes.length; } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['style'], characterData: true, childList: true }); })();`;

// ---------- tracing ----------
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking'];
async function traced(page, fn, cats = CATS) {
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: cats, recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  const r = await fn();
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  await page.send('Tracing.end'); await done; off();
  return { r, events };
}
function analyzeTrace(events, range) {
  const names = new Map(); for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const byThread = new Map();
  for (const e of events) { const k = `${e.pid}:${e.tid}`; if (names.get(k) !== 'CrRendererMain') continue; if (!byThread.has(k)) byThread.set(k, []); byThread.get(k).push(e); }
  let main = null; for (const [k, list] of byThread) if (!main || list.filter((e) => e.name === 'UpdateLayoutTree').length > main[1].filter((e) => e.name === 'UpdateLayoutTree').length) main = [k, list];
  if (!main) return null;
  const ev = main[1].filter((e) => e.ph === 'X' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n');
  const isCd = (d) => d && /nodes\/2\.(DyWL8TcE|__cd)\.js/.test(d.url || '') && d.lineNumber >= range[0] - 1 && d.lineNumber <= range[1] + 1;
  const sum = (xs) => +(xs.reduce((a, e) => a + (e.dur || 0), 0) / 1000).toFixed(1);
  const pick = (n) => ev.filter((e) => e.name === n);
  const ult = pick('UpdateLayoutTree');
  const fc = pick('FunctionCall');
  const cdCalls = fc.filter((e) => isCd(e.args?.data));
  // outermost countdown calls only (no double counting of nested calls)
  const outer = cdCalls.filter((e) => !cdCalls.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur));
  const faf = pick('FireAnimationFrame');
  const cdFaf = faf.filter((f) => cdCalls.some((c) => c.ts >= f.ts && c.ts + c.dur <= f.ts + f.dur));
  const inv = ev.filter((e) => e.name === 'StyleRecalcInvalidationTracking');
  const invFace = inv.filter((e) => /face svelte-1quva9c/.test(e.args?.data?.nodeName || ''));
  const tasks = pick('RunTask');
  return {
    tasks: tasks.length, taskMs: sum(tasks),
    updateLayoutTree: ult.length, styleMs: sum(ult), elementsStyled: ult.reduce((a, e) => a + (e.args?.elementCount ?? e.args?.endData?.elementCount ?? 0), 0),
    layout: pick('Layout').length, layoutMs: sum(pick('Layout')),
    prePaint: pick('PrePaint').length, paint: pick('Paint').length, paintMs: sum(pick('Paint')), layerize: pick('Layerize').length, commit: pick('Commit').length,
    rafCallbacks: faf.length, cdRafCallbacks: cdFaf.length, cdRafMs: sum(cdFaf),
    cdFunctionCalls: outer.length, cdScriptMs: sum(outer), timerFires: pick('TimerFire').length,
    styleInvalidations: inv.length, faceStyleInvalidations: invFace.length,
    faceInvalidationReasons: [...new Set(invFace.map((e) => e.args?.data?.reason))].slice(0, 4),
  };
}

// ---------- layers ----------
async function faceBackendIds(page) {
  const { result } = await page.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('[role=timer] .face.svelte-1quva9c')].map((f) => [f, [...document.querySelectorAll('[role=timer]')].indexOf(f.closest('[role=timer]'))])`, returnByValue: false });
  const props = await page.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
  const out = new Map();
  for (const p of props.result) {
    if (!/^\d+$/.test(p.name)) continue;
    const pair = await page.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
    const el = pair.result.find((x) => x.name === '0'), ti = pair.result.find((x) => x.name === '1');
    const d = await page.send('DOM.describeNode', { objectId: el.value.objectId });
    out.set(d.node.backendNodeId, ti.value.value);
  }
  return out;
}
async function layerWindow(page, ms, faceIds) {
  const snaps = [];
  const off = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) snaps.push(m.params.layers); });
  await page.send('LayerTree.enable');
  await sleep(ms);
  await page.send('LayerTree.disable'); off();
  if (!snaps.length) return { total: null };
  const first = snaps[0], last = snaps[snaps.length - 1];
  const pc0 = new Map(first.map((l) => [l.layerId, l.paintCount || 0]));
  const faceLayers = last.filter((l) => faceIds.has(l.backendNodeId));
  const facePaints = faceLayers.reduce((a, l) => a + Math.max(0, (l.paintCount || 0) - (pc0.get(l.layerId) || 0)), 0);
  const perTimer = {}; for (const l of faceLayers) { const t = faceIds.get(l.backendNodeId); perTimer[t] = (perTimer[t] || 0) + 1; }
  const allPaints = last.reduce((a, l) => a + Math.max(0, (l.paintCount || 0) - (pc0.get(l.layerId) || 0)), 0);
  return { total: last.length, faceLayers: faceLayers.length, faceLayersPerTimer: perTimer, facePaints, allPaints, snapshots: snaps.length };
}

// ---------- modes ----------
const scrollTo = (page, y) => page.eval(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY)))))`);
const POSITIONS = `(() => { const H = document.documentElement.scrollHeight, vh = innerHeight, t = document.querySelector('.hero-track');
  const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh;
  return { top: 0, heroExit: Math.round(vh), pastHero: Math.round(tb + 1.2 * vh), mid: Math.round(H * 0.55), end: Math.max(0, H - vh) }; })()`;

async function countsFull(cdp, arm, url, range, win = 3000) {
  const page = await openPage(cdp, { inject: MO });
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(1000);
  const pos = await page.eval(POSITIONS);
  const out = { arm, positions: {} };
  for (const [name, y] of Object.entries(pos)) {
    const yy = await scrollTo(page, y); await sleep(1500);
    const census = await page.eval(CENSUS);
    const faceIds = await faceBackendIds(page);
    await page.eval(`(Object.assign(window.__cdf, { on: true, style: {}, text: {}, nodes: {} }), 0)`);
    const m0 = await metrics(page);
    const { events } = await traced(page, () => sleep(win));
    const m1 = await metrics(page);
    const mo = await page.eval(`(window.__cdf.on = false, { style: window.__cdf.style, text: window.__cdf.text, nodes: window.__cdf.nodes })`);
    const layers = await layerWindow(page, 1500, faceIds);
    const census2 = await page.eval(CENSUS);
    out.positions[name] = { y: yy, windowMs: win, census, censusAfter: census2, mutations: mo, metrics: mdelta(m0, m1), trace: analyzeTrace(events, range), layers };
    log(arm, name, 'y', yy, JSON.stringify({ seen: census.map((c) => c.canBeSeen), styleWrites: mo.style, text: mo.text, ult: out.positions[name].trace?.updateLayoutTree, els: out.positions[name].trace?.elementsStyled, cdRaf: out.positions[name].trace?.cdRafCallbacks, faceLayers: layers.faceLayers, facePaints: layers.facePaints }));
  }
  out.errors = page.errors; await page.close();
  return out;
}
async function countsIso(cdp, arm, url, range, win = 6000) {
  const page = await openPage(cdp, { inject: MO });
  await gotoAndSettle(page, url + '__cd/', { quietMs: 1500 }); await sleep(1000);
  const ok = await page.eval('!!window.__cdMounted && document.querySelectorAll("[role=timer]").length');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(1000);
  const census = await page.eval(CENSUS);
  const faceIds = await faceBackendIds(page);
  await page.eval(`(Object.assign(window.__cdf, { on: true, style: {}, text: {}, nodes: {} }), 0)`);
  const m0 = await metrics(page);
  const { events } = await traced(page, () => sleep(win));
  const m1 = await metrics(page);
  const mo = await page.eval(`(window.__cdf.on = false, { style: window.__cdf.style, text: window.__cdf.text, nodes: window.__cdf.nodes })`);
  const layers = await layerWindow(page, 2000, faceIds);
  const r = { arm, mounted: ok, windowMs: win, census, mutations: mo, metrics: mdelta(m0, m1), trace: analyzeTrace(events, range), layers, errors: page.errors };
  log(arm, 'iso', JSON.stringify({ mounted: ok, styleWrites: mo.style, text: mo.text, ult: r.trace?.updateLayoutTree, els: r.trace?.elementsStyled, layout: r.trace?.layout, paint: r.trace?.paint, cdRaf: r.trace?.cdRafCallbacks, layersTotal: layers.total, faceLayers: layers.faceLayers, facePaints: layers.facePaints }));
  await page.close();
  return r;
}

// CPU profile (JS sampling) + trace durations in one window; countdown share = samples whose stack holds a countdown frame
function analyzeProfile(p, range) {
  const byId = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map();
  for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const isCd = (cf) => /nodes\/2\.(DyWL8TcE|__cd)\.js/.test(cf.url) && cf.lineNumber + 1 >= range[0] && cf.lineNumber + 1 <= range[1];
  const memo = new Map();
  const cdOf = (id) => { if (memo.has(id)) return memo.get(id); let v = false; for (let x = id; x !== undefined; x = parent.get(x)) if (isCd(byId.get(x).callFrame)) { v = true; break; } memo.set(id, v); return v; };
  let total = 0, idle = 0, program = 0, gc = 0, cd = 0, cdSelf = 0; const top = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    const dt = (p.timeDeltas[i + 1] ?? 0) / 1000; const n = byId.get(p.samples[i]); const fn = n.callFrame.functionName;
    total += dt;
    if (fn === '(idle)') idle += dt; else if (fn === '(program)') program += dt; else if (fn === '(garbage collector)') gc += dt;
    else if (cdOf(n.id)) { cd += dt; if (isCd(n.callFrame)) cdSelf += dt; const k = `${fn || '(anon)'}:${n.callFrame.lineNumber + 1}`; top.set(k, (top.get(k) || 0) + dt); }
  }
  const r1 = (x) => +x.toFixed(1);
  return { sampledMs: r1(total), idleMs: r1(idle), programMs: r1(program), gcMs: r1(gc), jsMs: r1(total - idle - program - gc), countdownInclusiveMs: r1(cd), countdownSelfMs: r1(cdSelf),
    countdownShareOfBusy: +(cd / Math.max(1e-9, total - idle)).toFixed(4), countdownShareOfJs: +(cd / Math.max(1e-9, total - idle - program - gc)).toFixed(4),
    topCountdownFrames: [...top].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, r1(v)]) };
}
async function profileWindow(page, range, win) {
  await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 100 });
  const m0 = await metrics(page);
  const { r: prof, events } = await traced(page, async () => { await page.send('Profiler.start'); await sleep(win); return (await page.send('Profiler.stop')).profile; }, ['devtools.timeline', 'disabled-by-default-devtools.timeline']);
  const m1 = await metrics(page);
  await page.send('Profiler.disable');
  return { metrics: mdelta(m0, m1), profile: analyzeProfile(prof, range), trace: analyzeTrace(events, range) };
}
async function profileFull(cdp, arm, url, range, win = 6000) {
  const page = await openPage(cdp);
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(1000);
  const pos = await page.eval(POSITIONS);
  const out = { arm, positions: {} };
  for (const name of ['top', 'pastHero', 'end']) {
    const yy = await scrollTo(page, pos[name]); await sleep(1500);
    out.positions[name] = { y: yy, windowMs: win, ...(await profileWindow(page, range, win)) };
    const p = out.positions[name];
    log(arm, name, JSON.stringify({ busy: +(p.profile.sampledMs - p.profile.idleMs).toFixed(0), cdMs: p.profile.countdownInclusiveMs, share: p.profile.countdownShareOfBusy, styleMs: p.trace?.styleMs, els: p.trace?.elementsStyled }));
  }
  out.errors = page.errors; await page.close();
  return out;
}
async function profileIso(cdp, arm, url, range, win = 6000) {
  const page = await openPage(cdp);
  await gotoAndSettle(page, url + '__cd/', { quietMs: 1500 }); await sleep(1000);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(1000);
  const r = { arm, windowMs: win, ...(await profileWindow(page, range, win)), errors: page.errors };
  log(arm, 'iso', JSON.stringify({ busy: +(r.profile.sampledMs - r.profile.idleMs).toFixed(0), cdMs: r.profile.countdownInclusiveMs, styleMs: r.trace?.styleMs, els: r.trace?.elementsStyled, taskMs: r.trace?.taskMs }));
  await page.close();
  return r;
}

// ---------- pixels: frozen frames ----------
// Virtual clocks: Date.now (the countdown value) and performance.now (the spring's start time) are frozen while
// window.__vt is set; the countdown's spring rAF callbacks (recognised by their source, `GE(`) are queued instead of
// scheduled, and __step(t) runs them with timestamp t. Everything else on the page runs normally.
const FREEZE = `(() => { const rDate = Date.now.bind(Date), rPerf = performance.now.bind(performance), rRaf = window.requestAnimationFrame.bind(window), rCaf = window.cancelAnimationFrame.bind(window);
  window.__vd = null; window.__vt = null; const Q = new Map(); let id = 1e9; const src = new WeakMap();
  const fromCd = () => /nodes\\/2\\.DyWL8TcE\\.js:3[89]\\d\\d:/.test(new Error().stack.split('\\n').slice(2, 4).join(' '));
  Date.now = () => (window.__vd !== null && fromCd() ? window.__vd : rDate());
  performance.now = () => (window.__vt !== null && fromCd() ? window.__vt : rPerf());
  window.requestAnimationFrame = (cb) => { let s = src.get(cb); if (s === undefined) { s = String(cb).includes('GE('); src.set(cb, s); }
    if (s && window.__vt !== null) { const k = ++id; Q.set(k, cb); return k; } return rRaf(cb); };
  window.cancelAnimationFrame = (k) => (Q.has(k) ? Q.delete(k) : rCaf(k));
  window.__step = (t) => { const cbs = [...Q.values()]; Q.clear(); for (const cb of cbs) cb(t); return cbs.length; };
  window.__queued = () => Q.size;
  // a background tab, emulated: visibilityState follows window.__hidden, and the harness steps no queued frame meanwhile
  window.__hidden = false;
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__hidden }); })();`;
const TARGET = Date.parse('2026-11-02T12:00:00+07:00');
// remaining seconds R -> a Date.now that gives exactly R (rD uses ceil((t - now) / 1000))
const nowFor = (R) => TARGET - R * 1000 + 500;
function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function pxDiff(a, b) {
  const A = pngPixels(a), B = pngPixels(b);
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let n = 0, max = 0, colours = new Set();
  for (let i = 0; i < A.px.length; i += A.bpp) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c])); if (d) n++; max = Math.max(max, d); if (colours.size < 4) colours.add(A.px.readUIntBE(i, 3)); }
  return { w: A.w, h: A.h, diffPixels: n, maxChannelDelta: max, blank: colours.size < 2 };
}
// scenarios: [name, R before, R after]; R = remaining seconds (d*86400 + h*3600 + m*60 + s)
const R = (d, h, m, s) => d * 86400 + h * 3600 + m * 60 + s;
const SCENARIOS = [
  ['one step down (seconds 5 -> 4)', R(3, 4, 12, 35), R(3, 4, 12, 34)],
  ['one step up (seconds 4 -> 5, clock set back)', R(3, 4, 12, 34), R(3, 4, 12, 35)],
  ['ones wrap 0 -> 9 + tens 4 -> 3 (40 -> 39)', R(3, 4, 12, 40), R(3, 4, 12, 39)],
  ['ones wrap 9 -> 0 + tens 3 -> 4 (39 -> 40, up)', R(3, 4, 12, 39), R(3, 4, 12, 40)],
  ['carry 4 units (3d 04h 00m 00s -> 3d 03h 59m 59s)', R(3, 4, 0, 0), R(3, 3, 59, 59)],
  ['tens carry 10 -> 09', R(3, 4, 12, 10), R(3, 4, 12, 9)],
];
const PHASES = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 34, 60];
async function pixels(cdp, arm, url, dir) {
  const page = await openPage(cdp, { inject: FREEZE });
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(2500);
  const shots = {}, state = {};
  // what the digits show, as numbers: per digit, the faces inside the cell (|offset| < 1 cell): [digit, translateY px]
  const FACES = `[...document.querySelector('[role=timer]').querySelectorAll('.digit.svelte-1quva9c')].map((d) => { const h = d.offsetHeight;
    return [...d.querySelectorAll('.face.svelte-1quva9c')].map((f) => [f.textContent, Number((/translateY\\((-?[\\d.e-]+)px\\)/.exec(f.style.transform) || [])[1])]).filter(([, y]) => Math.abs(y) < h - 0.001).map(([t, y]) => t + '@' + y.toFixed(3)).sort().join(' '); })`;
  const clip = await page.eval(`(() => { const r = document.querySelector('[role=timer]').getBoundingClientRect(); return { x: r.left + scrollX - 4, y: r.top + scrollY - 4, width: r.width + 8, height: r.height + 8, scale: 1 }; })()`);
  const T0 = 5e6, FR = 1000 / 60;
  for (const [name, r0, r1] of SCENARIOS) {
    // freeze at r0, settle every digit at rest
    await page.eval(`(window.__vt = ${T0}, window.__vd = ${nowFor(r0)}, document.dispatchEvent(new Event('visibilitychange')), 0)`);
    await page.eval(`new Promise((res) => setTimeout(() => { window.__step(${T0 + 1e4}); setTimeout(res, 50); }, 50))`);
    await page.eval(`new Promise((res) => setTimeout(() => { window.__step(${T0 + 2e4}); setTimeout(res, 50); }, 50))`);
    // change to r1 at virtual time T1, then walk the spring frame by frame (60 Hz steps)
    const T1 = T0 + 1e5;
    await page.eval(`(window.__vt = ${T1}, window.__vd = ${nowFor(r1)}, document.dispatchEvent(new Event('visibilitychange')), 0)`);
    await page.eval('new Promise((r) => setTimeout(r, 30))');
    let k = 0;
    for (const ph of PHASES) {
      while (k < ph) { k++; await page.eval(`(window.__step(${T1 + k * FR}), 0)`); }
      await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20))))');
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
      const key = `${name} | frame ${ph}`;
      shots[key] = data; state[key] = await page.eval(FACES);
      writeFileSync(join(dir, `${arm}-${SCENARIOS.findIndex((s) => s[0] === name)}-f${String(ph).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
    }
    await page.eval(`(window.__step(${T1 + 1e5}), 0)`);
  }
  // resume frames: the clock goes out of sight, its target changes, K frames later it comes back mid-frame
  // (K*FR + FR/2 after the change); shots at the resume instant and on the frames after it
  const pos = await page.eval(POSITIONS);
  const twoFrames = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))';
  const go = (y) => page.eval(`(window.scrollTo(0, ${y}), ${twoFrames})`);
  const HIDES = {
    'fade-in (hero faded to opacity 0 at y=vh, then back)': { hide: () => go(pos.heroExit), show: () => go(0) },
    'scroll back (hero > 1 viewport off-screen, then back)': { hide: () => go(pos.pastHero), show: () => go(0) },
    'tab switch (hidden tab: no frames run; new second on return)': { tab: true },
  };
  const RESUME_PH = [0, 1, 2, 3, 5, 8, 12, 20, 40];
  let T = T0 + 1e6;
  for (const [hname, h] of Object.entries(HIDES)) for (const K of [6, 15, 40]) {
    const [r0, r1, r2] = [R(3, 4, 12, 40), R(3, 4, 12, 39), R(3, 4, 12, 38)];
    const name = `resume: ${hname}, back ${K} frames after 40 -> 39`;
    T += 1e6;
    await page.eval(`(window.__vt = ${T}, window.__vd = ${nowFor(r0)}, document.dispatchEvent(new Event('visibilitychange')), 0)`);
    await page.eval(`new Promise((res) => setTimeout(() => { window.__step(${T + 1e4}); setTimeout(res, 50); }, 50))`);
    await page.eval(`new Promise((res) => setTimeout(() => { window.__step(${T + 2e4}); setTimeout(res, 50); }, 50))`);
    const T1 = T + 1e5;
    if (h.tab) await page.eval(`(window.__vt = ${T1 - 1e3}, window.__hidden = true, document.dispatchEvent(new Event('visibilitychange')), ${twoFrames})`);
    else await h.hide();
    await page.eval(`(window.__vt = ${T1}, window.__vd = ${nowFor(r1)}, document.dispatchEvent(new Event('visibilitychange')), 0)`);
    await page.eval('new Promise((r) => setTimeout(r, 30))');
    if (!h.tab) for (let k = 1; k <= K; k++) await page.eval(`(window.__step(${T1 + k * FR}), 0)`);
    const Tr = T1 + K * FR + FR / 2;
    if (h.tab) await page.eval(`(window.__vt = ${Tr}, window.__vd = ${nowFor(r2)}, window.__hidden = false, document.dispatchEvent(new Event('visibilitychange')), ${twoFrames})`);
    else { await page.eval(`(window.__vt = ${Tr}, 0)`); await h.show(); }
    await page.eval('new Promise((r) => setTimeout(r, 1500))'); // the rest of the page (hero copy fade-in) settles; the countdown's clock is frozen
    let k = 0;
    for (const ph of RESUME_PH) {
      while (k < ph) { k++; await page.eval(`(window.__step(${T1 + (K + k) * FR}), 0)`); }
      await page.eval(twoFrames);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
      shots[`${name} | +${ph}`] = data; state[`${name} | +${ph}`] = await page.eval(FACES);
      writeFileSync(join(dir, `${arm}-resume-${Object.keys(HIDES).indexOf(hname)}-K${K}-p${String(ph).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
    }
    await page.eval(`(window.__step(${T1 + 1e5}), 0)`);
  }
  const values = await page.eval(`[...document.querySelectorAll('[role=timer]')].map((t) => [...t.querySelectorAll('[data-testid=sliding-number]')].map((n) => n.dataset.value).join(':'))`);
  const errors = page.errors; await page.close();
  return { arm, clip, shots, state, values, errors };
}

// ---------- main ----------
const servers = {}; const ranges = {};
const iso = MODE !== 'pixels' && WHICH !== 'full';
const full = MODE === 'pixels' || WHICH !== 'iso';
for (const arm of ARMS) {
  ranges[arm] = cdRange(arm);
  if (full) servers[arm] = await server(arm, arm === 'base' ? [] : [DIRS[arm]]);
  if (iso) servers[`iso-${arm}`] = await server(`iso-${arm}`, [DIRS[`iso-${arm}`]]);
}
const ch = await launchChrome({ port: 0, profileDir: join(OUT, `chrome-profile-${MODE}`) });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { mode: MODE, arms: ARMS, runs: RUNS, ranges, browser: ch.browser, startedAt: new Date().toISOString(), load1: [loadavg()[0]], results: [] };
try {
  if (MODE === 'pixels') {
    const dir = join(OUT, `pixels-${STAMP}`); mkdirSync(dir, { recursive: true });
    const order = [...ARMS, ARMS[0]]; // A B A: the second A is the A/A control
    const got = [];
    for (let i = 0; i < order.length; i++) { got.push(await pixels(cdp, order[i] + (i === order.length - 1 ? '-again' : ''), servers[order[i]].url, dir)); }
    const cmp = (x, y) => Object.keys(x.shots).map((k) => ({ key: k, sameFaces: JSON.stringify(x.state[k]) === JSON.stringify(y.state[k]), ...(JSON.stringify(x.state[k]) === JSON.stringify(y.state[k]) ? {} : { faces: [x.state[k], y.state[k]] }), identicalBytes: x.shots[k] === y.shots[k], ...(x.shots[k] === y.shots[k] ? {} : pxDiff(Buffer.from(x.shots[k], 'base64'), Buffer.from(y.shots[k], 'base64'))) }));
    const blank = Object.entries(got[0].shots).filter(([, s]) => pxDiff(Buffer.from(s, 'base64'), Buffer.from(s, 'base64')).blank).map(([k]) => k);
    res.results = { values: got.map((g) => [g.arm, g.values]), errors: got.map((g) => [g.arm, g.errors]), clip: got[0].clip, blankShots: blank,
      [`${got[0].arm} vs ${got[1].arm}`]: cmp(got[0], got[1]), [`${got[0].arm} vs ${got[2].arm} (A/A)`]: cmp(got[0], got[2]) };
    for (const [k, v] of Object.entries(res.results)) if (Array.isArray(v) && v[0]?.key) log(k, ':', v.filter((x) => !x.identicalBytes).length, 'of', v.length, 'shots differ in pixels,', v.filter((x) => !x.sameFaces).length, 'in face state', JSON.stringify(v.filter((x) => !x.identicalBytes || !x.sameFaces).map((x) => [x.key, x.diffPixels, x.maxChannelDelta, x.faces])));
    log('blank shots', blank.length);
  } else {
    for (let run = 0; run < RUNS; run++) {
      const order = run % 2 ? [...ARMS].reverse() : ARMS;
      for (const arm of order) {
        const range = ranges[arm];
        if (MODE === 'counts') {
          if (iso) res.results.push({ run, iso: await countsIso(cdp, arm, servers[`iso-${arm}`].url, range) });
          if (full) res.results.push({ run, full: await countsFull(cdp, arm, servers[arm].url, range) });
        } else {
          if (iso) res.results.push({ run, iso: await profileIso(cdp, arm, servers[`iso-${arm}`].url, range) });
          if (full) res.results.push({ run, full: await profileFull(cdp, arm, servers[arm].url, range) });
        }
        res.load1.push(loadavg()[0]);
      }
    }
  }
} finally {
  cdp.close(); await ch.close(); for (const s of Object.values(servers)) s.p.kill();
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `${MODE}-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
log('wrote', f, 'load1', res.load1.map((x) => x.toFixed(1)).join(','));
