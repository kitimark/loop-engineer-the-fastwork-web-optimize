// F3 rendering cost card, Chrome part (fix-nav-morph; user T-035 #8, layout: research/architecture/isolated-measurement
// README §6 by arch-isolated-measure). Counts only: no timing verdict, ms columns are printed and never judged.
// Builds: C aw1-10e, V mw10e-arm-scope-c (F3), D mw10e-arm-scope-d, C2 = a second C server (the A/A pair, §6 tol).
// Every load is cold: a fresh serve process on a new port, opened in a fresh isolated browser context. Per rep the
// builds run in the order given (default C,V,D,C2). FULL page only (§6 rule c).
// Per load: 430x932 DPR 3 mobile + touch; a document-start wrapper logs every touch/wheel listener add/remove (target,
// passive incl. the DOM default-passive rule, capture) as console.timeStamp markers; scroll to the end; then, inside one
// trace: 'start' (the up-swipe on #platform that starts the morph), 1.2 s, N pin pushes (up-swipes at the pin, 300 ms
// apart), then a 4 s idle 'hold'. Events are cut at the probe's own timeStamp markers (§6 rule a): start, push-1 (the
// first pin push after the cold load), push-n (pushes 2..N, median per load), hold-frame (per BeginMainThreadFrame).
// After the trace: the layer census (LayerTree; panel/nav/platform layers, memory estimate w*h*4 in device px) and the
// prevented share of the pin pushes' touchmoves (passive window bubble logger added after load, runs last).
// --coverage: one extra page per build (not cold, not traced): % of a 10 px viewport grid whose hit path (element ->
// ancestors -> document -> window) carries a non-passive touchmove (and touchstart) listener, pre-morph at the end of
// the page, ~200 ms into the tween, and at the pin (m = 1).
// Run (shared lane, <= 300 s):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph -- \
//     node fixes/nav-morph/costcard-chrome.mjs --reps 2 [--builds C,V,D,C2] [--pushes 9] [--coverage] [--out f.json]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const OUT = join(WT, 'out/costcard'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const AW = join(SNAP, 'aw1-10e-3e2f599a1632');
const BUILDS = {
  C: { overlays: [AW], js: '3e2f599a1632' },
  C2: { overlays: [AW], js: '3e2f599a1632' },
  V: { overlays: [join(SNAP, 'mw10e-arm-scope-c-c6d3590576a7'), AW], js: 'c6d3590576a7' },
  D: { overlays: [join(SNAP, 'mw10e-arm-scope-d-999c4497f37e'), AW], js: '999c4497f37e' },
};
const CSSH = 'c6aad94b455f';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = arg('--builds', 'C,V,D,C2').split(',');
const REPS = +arg('--reps', '2'), REP0 = +arg('--rep0', '0'), PUSHES = +arg('--pushes', '9'), COVER = argv.includes('--coverage');
const startedAt = new Date().toISOString();
const outFile = arg('--out', join(OUT, `costcard-chrome-${startedAt.replace(/[:.]/g, '-')}.json`));
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

// document-start wrapper: listener registry + timeStamp markers (the DOM default-passive rule:
// https://dom.spec.whatwg.org/#default-passive-value, touchstart/touchmove/wheel/mousewheel on window, document,
// documentElement, body default to passive when the option is not given)
const INIT = `(() => {
  const T = new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel']);
  const DP = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel']);
  const reg = new Map();
  const L = window.__cc = { ops: [], tm: [], reg };
  const desc = (t) => t === window ? 'window' : t === document ? 'document' : t && t.nodeType === 1 ? (t.id ? '#' + t.id : t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\\s+/)[0] : '')) : '?';
  const norm = (t, type, o) => { const capture = typeof o === 'boolean' ? o : !!(o && o.capture);
    const p = o && typeof o === 'object' && 'passive' in o ? !!o.passive : DP.has(type) && (t === window || t === document || t === document.documentElement || t === document.body);
    return { capture, passive: p }; };
  const oA = EventTarget.prototype.addEventListener, oR = EventTarget.prototype.removeEventListener;
  L.rawAdd = (t, type, cb, o) => oA.call(t, type, cb, o);
  EventTarget.prototype.addEventListener = function (type, cb, o) {
    if (T.has(type) && cb) { const n = norm(this, type, o); let a = reg.get(this); if (!a) reg.set(this, (a = []));
      if (!a.some((x) => x.type === type && x.cb === cb && x.capture === n.capture)) a.push({ type, cb, capture: n.capture, passive: n.passive });
      const m = 'fwcc add ' + type + ' ' + desc(this) + ' ' + (n.passive ? 'passive' : 'active') + ' ' + (n.capture ? 'capture' : 'bubble');
      L.ops.push([Math.round(performance.now()), m]); console.timeStamp(m); }
    return oA.call(this, type, cb, o); };
  EventTarget.prototype.removeEventListener = function (type, cb, o) {
    if (T.has(type) && cb) { const capture = typeof o === 'boolean' ? o : !!(o && o.capture); const a = reg.get(this);
      const i = a ? a.findIndex((x) => x.type === type && x.cb === cb && x.capture === capture) : -1;
      if (i >= 0) { const x = a.splice(i, 1)[0]; const m = 'fwcc remove ' + type + ' ' + desc(this) + ' ' + (x.passive ? 'passive' : 'active') + ' ' + (capture ? 'capture' : 'bubble');
        L.ops.push([Math.round(performance.now()), m]); console.timeStamp(m); } }
    return oR.call(this, type, cb, o); };
  L.cover = () => { const out = {};
    for (const types of [['touchmove'], ['touchstart']]) { let n = 0, act = 0;
      for (let y = 5; y < innerHeight; y += 10) for (let x = 5; x < innerWidth; x += 10) { n++;
        const el = document.elementFromPoint(x, y); const path = []; for (let e = el; e; e = e.parentNode) path.push(e); path.push(window);
        if (path.some((t) => (reg.get(t) || []).some((l) => types.includes(l.type) && !l.passive))) act++; }
      out[types[0]] = Math.round((1000 * act) / n) / 10; }
    return out; };
  L.listeners = () => { const o = {}; for (const [t, a] of reg) for (const l of a) { const k = desc(t) + ' ' + l.type + ' ' + (l.passive ? 'passive' : 'active') + ' ' + (l.capture ? 'capture' : 'bubble'); o[k] = (o[k] || 0) + 1; } return o; };
})()`;
const LOGGER = `(() => { const L = window.__cc; L.rawAdd(window, 'touchmove', (e) => L.tm.push([Math.round(performance.now()), e.cancelable, e.defaultPrevented]), { passive: true }); return 'ok'; })()`;
const MORPH = `+(document.querySelector('header.start-selling-top-nav')?.style.getPropertyValue('--morph') || 0)`;
const PANEL = { panel: '.start-selling-morph-panel', nav: 'header.start-selling-top-nav', platform: '.start-selling-platform' };

async function swipe(page, x, y0, dy, moves = 12) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= moves; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + i * dy }] }); await sleep(16); }
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const mark = (page, m) => page.eval(`(console.timeStamp('fwcc mark ${m}'), 0)`);

async function serve(label) {
  const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[label].overlays.join(','), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url, port: s.port };
}

async function newPage(cdp) {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  await page.send('Page.bringToFront').catch(() => {});
  return page;
}
async function toEnd(page) {
  await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 1200); }; requestAnimationFrame(step); })`, { timeout: 60000 });
}

// ---- trace -> per-event counts ---------------------------------------------------------------------------------
const quadArea = (q) => { if (!Array.isArray(q) || q.length < 8) return 0; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
function analyze(events, nodeIds = {}) {
  const owner = new Map(); for (const [k, ids] of Object.entries(nodeIds)) for (const id of ids) if (!owner.has(id)) owner.set(id, k);
  const names = new Map(events.filter((e) => e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args?.name]));
  const score = new Map();
  for (const e of events) if (/^(UpdateLayoutTree|FireAnimationFrame|BeginMainThreadFrame|Paint|TimeStamp)$/.test(e.name)) { const k = `${e.pid}:${e.tid}`; score.set(k, (score.get(k) || 0) + 1); }
  const main = [...score].filter(([k]) => names.get(k) === 'CrRendererMain').sort((a, b) => b[1] - a[1])[0]?.[0];
  const comp = [...names].filter(([k, n]) => n === 'Compositor' && k.split(':')[0] === main?.split(':')[0]).map(([k]) => k);
  const M = events.filter((e) => `${e.pid}:${e.tid}` === main && e.ph !== 'M').sort((a, b) => a.ts - b.ts);
  const Cmp = events.filter((e) => comp.includes(`${e.pid}:${e.tid}`));
  const stamps = M.filter((e) => e.name === 'TimeStamp' && /^fwcc /.test(e.args?.data?.message || '')).map((e) => ({ ts: e.ts, m: e.args.data.message }));
  const marks = stamps.filter((s) => s.m.startsWith('fwcc mark ')).map((s) => ({ ts: s.ts, k: s.m.slice(10) }));
  const end = M.reduce((a, e) => Math.max(a, e.ts + (e.dur || 0)), 0);
  const wins = [];
  for (let i = 0; i < marks.length; i++) wins.push({ kind: marks[i].k, t0: marks[i].ts, t1: i + 1 < marks.length ? marks[i + 1].ts : end });
  const inW = (w, e) => e.ts >= w.t0 && e.ts < w.t1;
  const us = (a) => Math.round(a.reduce((n, e) => n + (e.dur || 0), 0) / 100) / 10; // ms, 0.1
  return wins.map((w) => {
    const E = M.filter((e) => inW(w, e)), n = (nm) => E.filter((e) => e.name === nm).length, X = (nm) => E.filter((e) => e.name === nm);
    const ops = stamps.filter((s) => s.ts >= w.t0 && s.ts < w.t1 && !s.m.startsWith('fwcc mark ')).map((s) => s.m.slice(5));
    const disp = {}; for (const e of X('EventDispatch')) { const t = e.args?.data?.type || '?'; disp[t] = (disp[t] || 0) + 1; }
    const fc = X('FunctionCall');
    return { kind: w.kind, ms: Math.round((w.t1 - w.t0) / 100) / 10,
      mainFrames: n('BeginMainThreadFrame'), styleRecalcs: n('UpdateLayoutTree'),
      styleElements: X('UpdateLayoutTree').reduce((a, e) => a + (e.args?.elementCount || e.args?.data?.elementCount || 0), 0),
      layouts: n('Layout'), prePaints: n('PrePaint'), paints: n('Paint'), paintArea: Math.round(X('Paint').reduce((a, e) => a + quadArea(e.args?.data?.clip), 0)),
      paintsBy: X('Paint').reduce((o, e) => { const k = owner.get(e.args?.data?.nodeId) || 'other'; o[k] = (o[k] || 0) + 1; return o; }, {}),
      layerizes: n('Layerize'), commits: Cmp.filter((e) => inW(w, e) && /^(Commit|ActivateLayerTree)$/.test(e.name)).length,
      compositorFrames: Cmp.filter((e) => inW(w, e) && /^(DrawFrame|SubmitCompositorFrame|Graphics\.Pipeline\.DrawAndSwap)$/.test(e.name)).length,
      functionCalls: fc.length, fcBy: fc.reduce((o, e) => { const d = e.args?.data || {}; const k = `${String(d.url || '').split('/').pop()}:${d.lineNumber}`; o[k] = (o[k] || 0) + 1; return o; }, {}), functionCallsNode2: fc.filter((e) => /nodes\/2\.DyWL8TcE\.js/.test(e.args?.data?.url || '')).length,
      eventDispatch: disp, timerFires: n('TimerFire'), rafFires: n('FireAnimationFrame'), listenerOps: ops,
      msUnjudged: { style: us(X('UpdateLayoutTree')), layout: us(X('Layout')), paint: us(X('Paint')), script: us(fc), dispatch: us(X('EventDispatch')) } };
  });
}

// backendNodeIds of the panel / nav / platform subtrees (a Paint's args.data.nodeId is the paint layer's node)
async function subtreeIds(page) {
  await page.send('DOM.enable'); const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: false });
  const out = { panel: [], nav: [], platform: [] };
  const cls = (n) => { const a = n.attributes || []; const i = a.indexOf('class'); return i >= 0 ? ' ' + a[i + 1] + ' ' : ''; };
  const walk = (n, inside) => {
    const c = cls(n), here = new Set(inside);
    if (c.includes(' start-selling-morph-panel ')) here.add('panel');
    if (n.localName === 'header' && c.includes(' start-selling-top-nav ')) here.add('nav');
    if (c.includes(' start-selling-platform ')) here.add('platform');
    for (const k of here) out[k].push(n.backendNodeId);
    for (const ch of n.children || []) walk(ch, here);
  };
  walk(root, new Set());
  return out;
}

async function census(page) {
  await page.send('DOM.enable'); await page.send('DOM.getDocument', { depth: 0 });
  // take the last full tree seen over 1.5 s (the first event after enable can be partial: C rep 1 once showed 12 layers)
  let layers = [];
  const offL = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers?.length) layers = m.params.layers; });
  await page.send('LayerTree.enable');
  for (let i = 0; i < 3; i++) { await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(500); }
  offL();
  const res = { layers: layers.length, drawing: layers.filter((l) => l.drawsContent).length, estBytes: 0, by: {} };
  for (const k of Object.keys(PANEL)) res.by[k] = { layers: 0, drawing: 0, estBytes: 0, paintCount: 0 };
  for (const l of layers) {
    const bytes = l.drawsContent ? Math.round(l.width * l.height * 4) : 0; res.estBytes += bytes;
    if (l.backendNodeId == null) continue;
    try {
      const { object } = await page.send('DOM.resolveNode', { backendNodeId: l.backendNodeId });
      const r = await page.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
        functionDeclaration: `function (sel) { const e = this.nodeType === 1 ? this : this.parentElement; return e ? Object.keys(sel).filter((k) => e.closest(sel[k])) : []; }`, arguments: [{ value: PANEL }] });
      for (const k of r.result.value || []) { const b = res.by[k]; b.layers++; if (l.drawsContent) { b.drawing++; b.estBytes += bytes; } b.paintCount += l.paintCount || 0; }
      await page.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {});
    } catch {}
  }
  await page.send('LayerTree.disable').catch(() => {});
  return res;
}

const profileDir = tempProfileDir(join(OUT, 'chrome'), 'costcard');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-nav-morph costcard-chrome', note: 'counts only; ms unjudged (§6)', startedAt, browser: chrome.browser, order: ORDER, reps: REPS, pushes: PUSHES, loads: [], coverage: {} };
const save = () => writeFileSync(outFile, JSON.stringify(res, null, 1));
try {
  for (let rep = REP0 + 1; rep <= REP0 + REPS; rep++) for (const b of ORDER.map((_, i) => ORDER[(i + rep - 1) % ORDER.length])) { // order rotates per rep (§6: alternate arms)
    const srv = await serve(b);
    const load = { rep, build: b, port: srv.port };
    const page = await newPage(cdp);
    try {
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      const js = sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`)));
      const css = sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`)));
      load.served = { js, css };
      if (js !== BUILDS[b].js || css !== CSSH) { load.void = `serves ${js} / ${css}`; console.log(`VOID ${b} rep ${rep}: ${load.void}`); continue; }
      await toEnd(page);
      await page.eval(LOGGER);
      load.listenersAtEnd = await page.eval('__cc.listeners()');
      load.y0 = Math.round(await page.eval('scrollY'));
      const events = [];
      const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
      await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 300 * 1024,
        includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'viz', '__metadata', 'toplevel'] }, transferMode: 'ReportEvents' });
      await sleep(300);
      await mark(page, 'start'); await swipe(page, 215, 600, -20); await sleep(1200);
      const mStart = await page.eval(MORPH);
      const tm0 = await page.eval('__cc.tm.length');
      for (let i = 1; i <= PUSHES; i++) { await mark(page, i === 1 ? 'push-1' : 'push-n'); await swipe(page, 215, 600, -20); await sleep(300); }
      const tm1 = await page.eval('__cc.tm.length');
      await mark(page, 'hold'); await sleep(4000); await mark(page, 'end');
      await page.send('Tracing.end');
      await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      off();
      const tm = JSON.parse(await page.eval(`JSON.stringify(__cc.tm.slice(${tm0}, ${tm1}))`));
      load.m = { afterStart: Math.round(mStart * 1000) / 1000, end: Math.round((await page.eval(MORPH)) * 1000) / 1000 };
      load.y = Math.round(await page.eval('scrollY'));
      load.pinTouchmoves = { n: tm.length, cancelable: tm.filter((e) => e[1]).length, prevented: tm.filter((e) => e[2]).length };
      const tf = join(OUT, `trace-${b}-r${rep}-${startedAt.replace(/[:.]/g, '-')}.json`);
      writeFileSync(tf, JSON.stringify({ traceEvents: events })); load.trace = tf;
      load.nodeIds = await subtreeIds(page);
      load.windows = analyze(events, load.nodeIds).filter((w) => w.kind !== 'end');
      load.census = await census(page);
      load.listenersAtPin = await page.eval('__cc.listeners()');
      console.log(`${b} rep ${rep}: y ${load.y} m ${JSON.stringify(load.m)} prevented ${load.pinTouchmoves.prevented}/${load.pinTouchmoves.n} | ` +
        load.windows.filter((w) => w.kind !== 'push-n').map((w) => `${w.kind} st ${w.styleRecalcs}/${w.styleElements} lay ${w.layouts} pt ${w.paints} fc ${w.functionCalls} ops ${w.listenerOps.length}`).join(' | ') +
        ` | census ${JSON.stringify(load.census.by)}`);
    } catch (e) { load.error = String(e.message || e); console.log(`${b} rep ${rep} error: ${load.error}`); }
    finally { await page.close(); srv.proc.kill(); res.loads.push(load); save(); }
  }
  if (COVER) for (const b of ORDER.filter((x) => x !== 'C2')) {
    const srv = await serve(b); const page = await newPage(cdp);
    try {
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 }); await toEnd(page);
      const pre = await page.eval('__cc.cover()');
      await swipe(page, 215, 600, -20); await sleep(200);
      const mid = await page.eval(`({ c: __cc.cover(), m: ${MORPH} })`);
      await sleep(1200);
      const pin = await page.eval(`({ c: __cc.cover(), m: ${MORPH} })`);
      res.coverage[b] = { preMorph: pre, midTween: mid.c, mMid: Math.round(mid.m * 1000) / 1000, pin: pin.c, mPin: Math.round(pin.m * 1000) / 1000 };
      console.log(`coverage ${b}: ${JSON.stringify(res.coverage[b])}`);
    } catch (e) { res.coverage[b] = { error: String(e.message || e) }; }
    finally { await page.close(); srv.proc.kill(); save(); }
  }
} finally { cdp.close(); await chrome.close(); save(); console.log('wrote', outFile); }
