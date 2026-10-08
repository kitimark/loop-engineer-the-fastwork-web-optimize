#!/usr/bin/env node
// scrollcb-g0 Simulator approach counter (fix-scrollcb-g0, 2026-10-09). COUNTS ONLY: no Simulator ms is a verdict (F-084);
// durations are kept only to describe records. Question: over the approach (y 0 -> 4600, menu closed), how many style
// recalcs and layouts run, how many are forced inside script (a Layout / RecalculateStyles record nested in a script
// record), and which page function forces them, on C (g0.0f) and V (g0.0f + scroll-cb gate)?
// Arms from ./build.mjs (immutable snapshot copies, served hashes checked per load = VOID on mismatch).
// Drivers (--driver):
//   g  G-like: the g0 G program's approach strokes (fix-g0-box's eop-sim.mjs approachProgram: 520 px up in 1200 ms,
//      profile drag, x 215, 300 ms pause), N drags (--drags, default 10), played through WDA-sim (:8101) on this
//      connection's page (no second inspector client). Needs `node tools/sim.mjs wda start` in the session first.
//   w  W-like: the window run's stimulus in page script: scrollBy 250 px smooth every 300 ms until scrollY >= 4600, 1.5 s hold.
// Per load: fresh server (plain http, --vendors=local, --latency 150, --no-cache), `sim.mjs open`, readyState complete,
// 4 s idle at the top, counters installed (late wrap; the page looks the APIs up at call time): getBoundingClientRect,
// requestAnimationFrame, scrollY reads, keyed by the 2.DyWL8TcE.js line on the caller's stack -> top-level function.
// Timeline (Page.disable/enable, Timeline.start maxCallStackDepth 12) over the drive. A rAF logger keeps scrollY per frame;
// a MutationObserver logs class flips on the page (for the parity read: element, token, y).
// Counted over records whose time maps to y <= 4600 (the approach): RenderingFrame, RecalculateStyles, Layout, each split
// forced / not forced; forced records by initiator (the stack's first 2.DyWL8TcE.js frame -> function, else the enclosing
// script record's type); frames holding >= 2 Layout records ("stacked").
// usage (one functional Simulator session, shared lane, <= 300 s):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node tools/sim.mjs session --functional --owner fix-scrollcb-g0 -- sh -c 'node tools/sim.mjs wda start && \
//     node fixes/scrollcb-g0/sim-approach.mjs --driver g --out out/scrollcb-g0/sim-g.json C:1 V:1 V:2 C:2'
// --out accumulates loads; a load already in the file (same arm:rep) is skipped, so a next session resumes.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, sha, build } from './build.mjs';

const { openTab, sleep, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const VALUED = ['--driver', '--out', '--drags', '--ymax'];
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = argv.filter((a, i) => /^[A-Z]+:\d+$/.test(a) && !VALUED.includes(argv[i - 1]));
const DRIVER = arg('--driver', 'g');
const OUT = arg('--out');
const NDRAG = Number(arg('--drags', 10));
const YMAX = Number(arg('--ymax', 4600));
if (!argv.includes('--selftest') && (!OUT || !ORDER.length || !['g', 'w'].includes(DRIVER))) { console.error('usage: sim-approach.mjs --driver g|w --out <file> C:1 V:1 ...'); process.exit(1); }
const ARMS = build({ quiet: true });
const BASE = resolveTree('site-pretty');
const D = join(WT, 'out/scrollcb-g0/sim'); mkdirSync(D, { recursive: true });
const SCRIPT = new Set(['FunctionCall', 'FireAnimationFrame', 'EventDispatch', 'TimerFire', 'ObserverCallback', 'EvaluateScript']);
const BUDGET = Number(process.env.SCB_BUDGET_S || 270) * 1000, T0 = Date.now();
const PER_LOAD = DRIVER === 'g' ? (NDRAG * 1.6 + 25) * 1000 : 35000;

export function approachProgram(n) {
  const steps = [];
  for (let i = 0; i < n; i++) steps.push({ type: 'stroke', dir: 'up', px: 520, ms: 1200, profile: 'drag' }, { type: 'pause', ms: 300 });
  return { name: 'scb-approach-sim', version: 1, screen: [430, 932], params: { x: 215 }, steps };
}

const INSTALL = `(() => {
  if (window.__scbA) return 0;
  const P = window.__scbA = { on: false, counts: {}, f: [], t: [], m: [] };
  const where = () => { const m = (new Error().stack || '').match(/2\\.DyWL8TcE\\.js:(\\d+):/); return m ? m[1] : 'other'; };
  const bump = (k) => { if (!P.on) return; const w = k + '@' + where(); P.counts[w] = (P.counts[w] || 0) + 1; };
  const og = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { bump('rect'); return og.call(this); };
  const oraf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { bump('raf'); return oraf(cb); };
  // writes (lead 2026-10-09: find the per-frame invalidators): each style / class / attribute write by caller line,
  // classed changed (the element's style or class attribute text differs after the call) or same (idempotent)
  P.w = {};
  const gA = Element.prototype.getAttribute;
  const snapEl = (el) => el && el.nodeType === 1 ? (gA.call(el, 'style') || '') + '|' + (gA.call(el, 'class') || '') : '';
  const rec = (kind, el, fn) => { if (!P.on || P.inW) return fn(); P.inW = true; let before, r; try { before = snapEl(el); r = fn(); } finally { P.inW = false; }
    const k = kind + '@' + where() + (snapEl(el) === before ? ':same' : ':changed'); P.w[k] = (P.w[k] || 0) + 1; return r; };
  const owner = new WeakMap(); const SD = CSSStyleDeclaration.prototype;
  for (const C of [HTMLElement, SVGElement]) { const sg = Object.getOwnPropertyDescriptor(C.prototype, 'style'); if (sg && sg.get) Object.defineProperty(C.prototype, 'style', { configurable: true, enumerable: true, get() { const d = sg.get.call(this); owner.set(d, this); return d; }, set(v) { return sg.set.call(this, v); } }); }
  for (const m of ['setProperty', 'removeProperty']) { const o = SD[m]; SD[m] = function (...a) { return rec('style.' + m + ' ' + a[0], owner.get(this), () => o.apply(this, a)); }; }
  for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(SD))) { if (!d.set || name === 'parentRule') continue;
    Object.defineProperty(SD, name, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { return rec('style.' + name, owner.get(this), () => d.set.call(this, v)); } }); }
  const EP = Element.prototype;
  for (const m of ['setAttribute', 'removeAttribute']) { const o = EP[m]; EP[m] = function (...a) { return rec(m + ' ' + a[0], this, () => o.apply(this, a)); }; }
  const cn = Object.getOwnPropertyDescriptor(EP, 'className'); Object.defineProperty(EP, 'className', { configurable: true, enumerable: true, get: cn.get, set(v) { return rec('className', this, () => cn.set.call(this, v)); } });
  const TL = DOMTokenList.prototype; const cl = Object.getOwnPropertyDescriptor(EP, 'classList');
  Object.defineProperty(EP, 'classList', { configurable: true, enumerable: true, get() { const l = cl.get.call(this); owner.set(l, this); return l; } });
  for (const m of ['add', 'remove', 'toggle', 'replace']) { const o = TL[m]; TL[m] = function (...a) { return rec('classList.' + m + ' ' + a[0], owner.get(this), () => o.apply(this, a)); }; }

  for (const k of ['scrollY', 'pageYOffset']) { try { const d = Object.getOwnPropertyDescriptor(window, k) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), k);
    if (d && d.get) Object.defineProperty(window, k, { configurable: true, enumerable: true, get() { bump('scrollY'); return d.get.call(window); } }); } catch {} }
  const sy = Object.getOwnPropertyDescriptor(window, 'scrollY');
  const Y = () => (sy && sy.get ? sy.get.call(window) : 0);
  // y comes from scroll events (a passive listener added after the page's own, so the nav's scrollY read has already
  // flushed and this read finds a clean layout: no extra pass); the probe reads no layout inside rAF (a first rAF
  // reader pays whatever flush is pending, which would move the page's own forced passes onto the probe)
  addEventListener('scroll', () => { if (P.on) P.f.push([performance.now(), Y(), 0]); }, { passive: true });
  P.f0 = () => P.f.push([performance.now(), Y(), 0]);
  P.r = []; addEventListener('resize', () => { if (P.on) P.r.push([performance.now(), innerHeight]); }, { passive: true });
  for (const k of ['touchstart', 'touchend', 'touchcancel']) addEventListener(k, () => { if (P.on) P.t.push([performance.now(), k[5]]); }, { passive: true, capture: true });
  const nm = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''));
  new MutationObserver((ms) => { if (!P.on) return; const t = performance.now(), y = Y();
    for (const m of ms) { if (P.m.length >= 20000) return; const el = m.target;
      const o = new Set(String(m.oldValue || '').split(/\\s+/).filter(Boolean)), n = new Set(String(el.getAttribute('class') || '').split(/\\s+/).filter(Boolean));
      const d = [...n].filter((c) => !o.has(c)).map((c) => '+' + c).concat([...o].filter((c) => !n.has(c)).map((c) => '-' + c)).join(' ');
      if (d) P.m.push([t, y, nm(el), d]); } })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  return 1;
})()`;
// SCB_ANIM=1 (census only, perturbs: getAnimations() flushes style): at each W step, the running animations and transitions
// (target, name or property, the properties their keyframes set, play state), for the invalidator list
const ANIM = process.env.SCB_ANIM === '1';
const W_DRIVE = `(() => { const P = window.__scbA; window.__scbW = null; P.anim = [];
  const nm = (el) => !el ? '?' : (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).filter((c) => !/^svelte-/.test(c)).slice(0, 2).join('.') : (el.className && el.className.baseVal ? '.' + el.className.baseVal.trim().split(/\\s+/).slice(0, 2).join('.') : '')));
  const census = () => { const out = []; for (const a of document.getAnimations()) { if (a.playState !== 'running') continue; const e = a.effect; let props = [];
    try { props = [...new Set(e.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))]; } catch {}
    out.push([nm(e && e.target) + (e && e.pseudoElement ? e.pseudoElement : ''), a.animationName || a.transitionProperty || a.constructor.name, props.join(',')]); } P.anim.push([Math.round(scrollY), out]); };
  const go = () => {
  if (${ANIM ? 'true' : 'false'}) census();
  if (scrollY >= ${YMAX}) { setTimeout(() => { window.__scbW = { y: scrollY }; }, 1500); return; }
  scrollBy({ top: 250, behavior: 'smooth' }); setTimeout(go, 300); }; go(); return 1; })()`;

function fnIndex(src) {
  const starts = [];
  src.split('\n').forEach((l, i) => { const m = /^(?:async )?function (\w+)\(/.exec(l); if (m) starts.push([i + 1, m[1]]); });
  return (line) => { let lo = 0, hi = starts.length - 1, f = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m][0] <= line) { f = starts[m][1]; lo = m + 1; } else hi = m - 1; } return f || 'top'; };
}
const r1 = (x) => Math.round(x * 10) / 10;

/** analysis of one load's records (exported for the selftest) */
export function analyze(recs, off, L, fnOf, ymax) {
  const yAt = (pm) => { let y = null; for (const [ts, v] of L.f) { if (ts > pm) break; y = v; } return y; };
  const t0 = L.f.length ? L.f[0][0] : 0;
  const lineOf = (r) => { const fs = r.stackTrace?.callFrames || r.stackTrace || []; for (const fr of fs) { const u = fr.url || ''; if (/2\.DyWL8TcE\.js/.test(u)) return fr.lineNumber + (fr.lineNumber === 0 ? 1 : 0); } return fs.some((fr) => fr.url === '' && fr.functionName && fr.functionName !== 'scrollY') ? 'probe' : null; };
  const n = { frames: 0, style: 0, styleForced: 0, layout: 0, layoutForced: 0, stacked2: 0, stacked3: 0, layout5: 0, layout5Forced: 0 };
  const bigs = []; const T = L.t || []; const touchAt = (pm) => { let st = null, down = false; for (const [ts, k] of T) { if (ts > pm) break; if (k === 's') { st = ts; down = true; } else down = false; } return [down, st == null ? null : Math.round(pm - st)]; };
  const R = L.r || []; const resizeNear = (pm) => R.some(([ts]) => Math.abs(ts - pm) < 40);
  const byInit = {}; const byY = {}; let inWin = 0;
  const bin = (y) => Math.floor(y / 500) * 500;
  for (const rf of recs) {
    if (rf.type !== 'RenderingFrame' && !SCRIPT.has(rf.type) && rf.type !== 'Layout' && rf.type !== 'RecalculateStyles') continue;
    const pm = rf.startTime * 1000 - off;
    if (pm < t0) continue;
    const y = yAt(pm); if (y == null || y > ymax) continue;
    inWin++;
    if (rf.type === 'RenderingFrame') n.frames++;
    let lays = 0;
    const walk = (x, initiator, fc) => {
      const isS = SCRIPT.has(x.type);
      if (x.type === 'FunctionCall' && /2\.DyWL8TcE\.js/.test(x.data?.scriptName || '')) fc = x;
      if (x.type === 'Layout' || x.type === 'RecalculateStyles') {
        const forced = !!initiator;
        const big = ((x.endTime ?? x.startTime) - x.startTime) * 1000 >= 5;
        if (x.type === 'Layout' && big && bigs.length < 400) { const pmx = x.startTime * 1000 - off; const [dn, since] = touchAt(pmx); bigs.push([Math.round(y), dn ? 1 : 0, since, initiator ? initiator.type : rf.type, resizeNear(pmx) ? 1 : 0]); }
        if (x.type === 'Layout') { n.layout++; lays++; if (forced) n.layoutForced++; if (big) { n.layout5++; if (forced) n.layout5Forced++; } }
        else { n.style++; if (forced) n.styleForced++; }
        const b = bin(y); byY[b] ||= { L: 0, Lf: 0, S: 0, Sf: 0 };
        byY[b][x.type === 'Layout' ? 'L' : 'S']++; if (forced) byY[b][x.type === 'Layout' ? 'Lf' : 'Sf']++;
        if (forced) {
          const ln = lineOf(x) ?? (fc?.data?.scriptLine || null);
          const k = `${x.type === 'Layout' ? 'L' : 'S'} ${ln === 'probe' ? 'probe' : ln ? fnOf(ln) + '@' + ln : initiator.type}`;
          byInit[k] = (byInit[k] || 0) + 1;
        }
      }
      for (const c of x.children || []) walk(c, initiator || (isS ? x : null), fc);
    };
    walk(rf, null, null);
    if (rf.type === 'RenderingFrame') { if (lays >= 2) n.stacked2++; if (lays >= 3) n.stacked3++; }
  }
  const top = Object.entries(byInit).sort((a, b) => b[1] - a[1]).slice(0, 25);
  const yEnd = L.f.length ? L.f[L.f.length - 1][1] : null;
  return { counts: n, records: inWin, forcedBy: Object.fromEntries(top), byY, yEnd, bigs };
}


/** WebKit's own invalidation records (PageTimelineAgent: InvalidateLayout = first invalidation of a clean renderer,
 *  ScheduleStyleRecalculation, ScheduleLayout; each with a call stack), keyed by writer (stack -> function@line, probe,
 *  or native) and node id; every Layout / RecalculateStyles record is charged to the distinct keys seen since the
 *  previous one of its kind. Exported for the selftest. */
export function invalidators(recs, off, L, fnOf, ymax) {
  const yAt = (pm) => { let y = null; for (const [ts, v] of L.f) { if (ts > pm) break; y = v; } return y; };
  const t0 = L.f.length ? L.f[0][0] : 0;
  const who = (r) => { const fs = r.stackTrace?.callFrames || r.stackTrace || []; for (const fr of fs) if (/2\.DyWL8TcE\.js/.test(fr.url || '')) return fnOf(fr.lineNumber) + '@' + fr.lineNumber;
    if (fs.some((fr) => fr.url === '' && fr.functionName && fr.functionName !== 'scrollY')) return 'probe'; return fs.length ? 'other:' + (fs[0].functionName || '?') : 'native'; };
  const flat = []; const walk = (r, sc) => { const isS = SCRIPT.has(r.type); flat.push([r, sc]); for (const c of r.children || []) walk(c, sc || (isS ? r : null)); };
  for (const r of recs) walk(r, null);
  flat.sort((a, b) => a[0].startTime - b[0].startTime);
  const inv = {}, nodes = {}, pend = { L: new Set(), S: new Set() }, charged = { L: {}, S: {} }, charged5 = {}, roots5 = {};
  for (const [r] of flat) {
    const pm = r.startTime * 1000 - off; if (pm < t0) continue; const y = yAt(pm); if (y == null || y > ymax) continue;
    if (r.type === 'InvalidateLayout' || r.type === 'ScheduleStyleRecalculation') {
      const k = (r.type === 'InvalidateLayout' ? 'IL ' : 'SS ') + who(r) + (r.type === 'InvalidateLayout' && r.data?.nodeId ? ' #' + r.data.nodeId : '');
      inv[k] = (inv[k] || 0) + 1; if (r.data?.nodeId) nodes[r.data.nodeId] = 1;
      (r.type === 'InvalidateLayout' ? pend.L : pend.S).add(k); continue;
    }
    const kind = r.type === 'Layout' ? 'L' : r.type === 'RecalculateStyles' ? 'S' : null; if (!kind) continue;
    const big = kind === 'L' && ((r.endTime ?? r.startTime) - r.startTime) * 1000 >= 5;
    for (const k of pend[kind]) { charged[kind][k] = (charged[kind][k] || 0) + 1; if (big) charged5[k] = (charged5[k] || 0) + 1; }
    if (big) { const rk = r.data?.nodeId ? '#' + r.data.nodeId : 'none'; roots5[rk] = (roots5[rk] || 0) + 1; nodes[r.data?.nodeId] = 1; }
    pend[kind].clear();
  }
  const top = (o, n = 30) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
  return { invalidations: top(inv, 60), chargedLayout: top(charged.L), chargedStyle: top(charged.S), chargedBigLayout: top(charged5), bigLayoutRoots: top(roots5, 10), nodeIds: Object.keys(nodes).filter((x) => x !== 'undefined').map(Number) };
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const fnOf = (l) => (l >= 100 ? 'AE' : 'x');
  const recs = [
    { type: 'RenderingFrame', startTime: 1.0, endTime: 1.06, children: [
      { type: 'FireAnimationFrame', startTime: 1.0, endTime: 1.02, children: [{ type: 'Layout', startTime: 1.001, endTime: 1.012, stackTrace: [{ url: 'http://x/_app/immutable/nodes/2.DyWL8TcE.js', lineNumber: 120 }] }] },
      { type: 'RecalculateStyles', startTime: 1.02, endTime: 1.03 }, { type: 'Layout', startTime: 1.03, endTime: 1.04 }] },
    { type: 'EventDispatch', startTime: 1.07, endTime: 1.08, children: [{ type: 'RecalculateStyles', startTime: 1.07, endTime: 1.075 }] },
    { type: 'FireAnimationFrame', startTime: 1.09, endTime: 1.1, children: [{ type: 'FunctionCall', startTime: 1.09, endTime: 1.1, data: { scriptName: 'http://x/_app/immutable/nodes/2.DyWL8TcE.js', scriptLine: 7 }, children: [{ type: 'Layout', startTime: 1.091, endTime: 1.092 }] }] },
    { type: 'RenderingFrame', startTime: 9.0, endTime: 9.01, children: [{ type: 'Layout', startTime: 9.0, endTime: 9.001 }] },
  ];
  const A = analyze(recs, 0, { f: [[900, 0], [1000, 640], [8000, 5000]] }, fnOf, 4600);
  ok(A.counts.frames === 1 && A.counts.layout === 3 && A.counts.layoutForced === 2 && A.counts.style === 2 && A.counts.styleForced === 1, 'counts ' + JSON.stringify(A.counts));
  ok(A.counts.stacked2 === 1 && A.counts.layout5 === 2 && A.counts.layout5Forced === 1, 'stack ' + JSON.stringify(A.counts));
  ok(A.forcedBy['L AE@120'] === 1 && A.forcedBy['S EventDispatch'] === 1 && A.forcedBy['L x@7'] === 1, 'init ' + JSON.stringify(A.forcedBy));
  ok(A.byY[500].L === 3 && A.byY[500].Sf === 1, 'byY ' + JSON.stringify(A.byY));
  const p = approachProgram(2); ok(p.steps.length === 4, 'program');
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (forced split, initiator by stack line, y window, stacked frames)');
  return bad.length ? 1 : 0;
}

if (argv.includes('--selftest')) process.exit(selftest());

let wda = null, prog = null;
if (DRIVER === 'g') {
  const { createSession } = await import(join(WT, 'tools/lib/wda.mjs'));
  const { compileScript } = await import(join(WT, 'tools/lib/gesture.mjs'));
  prog = compileScript(approachProgram(NDRAG));
  wda = await createSession({ base: process.env.SCB_WDA || 'http://127.0.0.1:8101', simulator: true });
}
try {
  for (const Lk of ORDER) {
    const [arm, rep] = Lk.split(':');
    if (!ARMS[arm]) throw new Error('unknown arm ' + arm);
    const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { driver: DRIVER, ymax: YMAX, tool: 'fixes/scrollcb-g0/sim-approach.mjs', loads: [] };
    if (prev.loads.some((l) => l.arm === arm && l.rep === Number(rep) && !l.void)) { console.log(`exists ${Lk}`); continue; }
    if (BUDGET - (Date.now() - T0) < PER_LOAD) { console.log(`STOP budget before ${Lk}`); break; }
    const st = join(D, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS[arm].dir, '--port', '0', '--quiet', '--no-cache',
      '--state', st, '--vendors=local', '--latency', '150', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, rep: Number(rep), driver: DRIVER, drags: DRIVER === 'g' ? NDRAG : null, startedAt: new Date().toISOString() };
    let c = null;
    try {
      let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
      if (!s) throw new Error('server did not start');
      const base = `http://localhost:${s.port}/`;
      const jsSrc = Buffer.from(await (await fetch(new URL(JS, base))).arrayBuffer());
      load.served = { js: sha(jsSrc), css: sha(Buffer.from(await (await fetch(new URL(CSS, base))).arrayBuffer())) };
      if (load.served.js !== ARMS[arm].js || load.served.css !== ARMS[arm].css) throw new Error('served ' + JSON.stringify(load.served) + ', pinned ' + ARMS[arm].js + ' / ' + ARMS[arm].css);
      const fnOf = fnIndex(jsSrc.toString('utf8'));
      const key = `scba=${arm}${rep}-${Date.now()}`;
      process.env.FW_TAB_HOST = `localhost:${s.port}`; // before the open: the child inherits it (a stale host from the last load made every later open fail)
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `${base}?${key}`], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, FW_TAB_HOST: `localhost:${s.port}` } });
      for (let i = 0; i < 8 && !c; i++) {
        let t; try { t = await openTab((u) => u.startsWith(base)); } catch (e) { if (i === 7) throw e; await sleep(1000); continue; }
        const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
        if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
      }
      if (!c) throw new Error('no fresh tab');
      for (let j = 0; j < 60 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(250);
      load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight, y: scrollY })');
      if (!(load.viewport.docH > 3 * load.viewport.height)) throw new Error('page did not render the app (doc ' + load.viewport.docH + ')');
      await c.evaluate(INSTALL);
      // SCB_KO_CSS (attribution knock-out only, changes the look): a style sheet added after settle, e.g. pausing a group of
      // animations, to see which invalidators the approach's style/layout passes depend on
      if (process.env.SCB_KO_CSS) { load.ko = process.env.SCB_KO_CSS; await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'scb-ko'; s.textContent = ${JSON.stringify(process.env.SCB_KO_CSS)}; document.head.appendChild(s); return 1; })()`); }
      await sleep(4000);
      const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      await c.send('DOM.getDocument', {}).catch(() => {});
      for (const [m, pr] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 12 }]]) await c.send(m, pr).catch(() => {});
      const syncT = await c.evaluate(timelineSyncJs('scbasync'));
      await c.evaluate('(window.__scbA.on = true, window.__scbA.f0(), 1)');
      if (DRIVER === 'g') {
        let sent = 0; for (const op of prog.ops) { if (op.op === 'stroke') { await wda.actions(op.actions); sent++; } else if (op.op === 'pause') await sleep(op.ms); }
        load.strokes = sent; await sleep(1500);
      } else {
        await c.evaluate(W_DRIVE);
        let w = null; for (let j = 0; j < 40 && !w; j++) { await sleep(1000); w = await c.evaluate('window.__scbW'); }
        if (!w) throw new Error('W drive did not reach ' + YMAX);
      }
      await c.evaluate('(window.__scbA.on = false, 1)');
      await c.send('Timeline.stop').catch(() => {}); await sleep(800);
      const Lg = JSON.parse(await c.evaluate('JSON.stringify({ r: window.__scbA.r, anim: window.__scbA.anim, w: window.__scbA.w, counts: window.__scbA.counts, f: window.__scbA.f, t: window.__scbA.t, m: window.__scbA.m })'));
      const syncTL = findTimeStamp(recs, 'scbasync'); if (syncTL == null) throw new Error('no Timeline sync mark');
      const A = analyze(recs, syncTL * 1000 - syncT, Lg, fnOf, YMAX);
      const I = invalidators(recs, syncTL * 1000 - syncT, Lg, fnOf, YMAX);
      const names = {};
      for (const id of I.nodeIds.slice(0, 80)) { try { const o = await c.send('DOM.resolveNode', { nodeId: id }); const oid = o?.object?.objectId; if (!oid) continue;
        const v = await c.send('Runtime.callFunctionOn', { objectId: oid, functionDeclaration: 'function () { const e = this.nodeType === 1 ? this : this.parentElement; if (!e) return String(this.nodeName); return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).filter((c) => !/^svelte-/.test(c)).slice(0, 3).join(".") : ""); }', returnByValue: true });
        names[id] = v?.result?.value; } catch {} }
      const nm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/#(\d+)/, (m, d) => '#' + d + ' ' + (names[d] || '?')), v]));
      load.inv = { invalidations: nm(I.invalidations), chargedLayout: nm(I.chargedLayout), chargedStyle: nm(I.chargedStyle), chargedBigLayout: nm(I.chargedBigLayout), bigLayoutRoots: nm(I.bigLayoutRoots) };
      const byFn = {};
      for (const [k, v] of Object.entries(Lg.counts)) { const [kind, line] = k.split('@'); const fn = line === 'other' ? 'other' : fnOf(+line); byFn[fn] ||= {}; byFn[fn][kind] = (byFn[fn][kind] || 0) + v; }
      const wr = {}; for (const [k, v] of Object.entries(Lg.w || {})) { const m = /^(.*)@(\w+):(same|changed)$/.exec(k); if (!m) continue; const kk = (m[2] === 'other' ? 'other' : fnOf(+m[2]) + '@' + m[2]) + ' ' + m[1]; wr[kk] ||= { changed: 0, same: 0 }; wr[kk][m[3]] += v; }
      if (Lg.anim && Lg.anim.length) load.anim = Lg.anim;
      Object.assign(load, A, { writes: Object.fromEntries(Object.entries(wr).sort((x, y) => (y[1].changed + y[1].same) - (x[1].changed + x[1].same))), calls: byFn, touches: Lg.t.length, flips: Lg.m.filter((m) => m[1] <= YMAX + 300).map(([t, y, el, d]) => [Math.round(y), el, d]),
        sampleStack: recs.flatMap(function f(r) { return [r, ...(r.children || []).flatMap(f)]; }).filter((r) => r.type === 'Layout' && r.stackTrace).slice(0, 2).map((r) => r.stackTrace) });
    } catch (e) { load.void = 'error: ' + String(e.message || e); }
    finally { try { c && c.close(); } catch {} p.kill(); }
    const rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : prev;
    rec.loads.push(load); writeFileSync(OUT, JSON.stringify(rec, null, 1));
    const k = load.counts || {};
    if (load.inv) console.log('  big layouts charged to', JSON.stringify(Object.entries(load.inv.chargedBigLayout).slice(0, 10)), 'roots', JSON.stringify(load.inv.bigLayoutRoots));
    console.log(`SCBA ${Lk} ${DRIVER} ${load.void || ''} served ${load.served?.js} yEnd ${load.yEnd} frames ${k.frames} style ${k.style} (forced ${k.styleForced}) layout ${k.layout} (forced ${k.layoutForced}; >=5ms ${k.layout5}/${k.layout5Forced}) stacked2 ${k.stacked2} top-forced ${JSON.stringify(Object.entries(load.forcedBy || {}).slice(0, 6))}`);
  }
} finally { if (wda) await wda.close().catch(() => {}); }
