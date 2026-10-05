#!/usr/bin/env node
// nav-hit-cache Chrome probe, COUNTS ONLY (no timing claim). Arms from ./build.mjs (C best build, V = C + this fix,
// VA = V + the DEBUG audit hook). Run from the worktree root inside a shared hold:
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph -- \
//     node fixes/nav-hit-cache/probe.mjs count|parity [--reps 2] [--vp mobile,desktop] [--cases mobile,desktop,...] [--out <json>]
// part "count" (arms C, V; mobile 430x932 DPR 3 touch and desktop 1440x900; no CPU throttle): one trace per load
//   (devtools.timeline + frame categories) over a scripted scroll top -> bottom, 10 px per rAF (the frame audit's
//   census step). Per scroll frame (= stepper step): PrePaint, UpdateLayoutTree, Layout, each split into "forced"
//   (inside a script event: FunctionCall / FireAnimationFrame / EventDispatch / TimerFire / RunMicrotasks) and the
//   frame's own lifecycle; plus getBoundingClientRect / getComputedStyle / elementsFromPoint calls, total and from the
//   nav block (call stack line inside the nav code region of the served file).
// part "parity" (arm VA; base v8, see build.mjs HOOK_V8): window.__nhcAudit = {t, n, lag, m, v, p}: t frames that ran
//   the real hit test, n frames that kept the cached answer, lag frames whose scroll-event position was not the live
//   scrollY, and per-frame disagreements with the original's own reads in the same frame: m theme (cached frames vs
//   F()), v profile-sticky (__nsEE vs ee()), p hero pill (cached offsets vs the live rect), each [__nsY, V, original,
//   scrollY]. Continuous scroll down then up, 10 px and 40 px per step, in 5 cases: mobile, desktop, desktop-rtl,
//   mobile-rtl, mobile-shift (a 300 px block inserted above the theme sections mid-page, no resize), in two step modes:
//     task  scrollTo in a task between frames (the scroll event precedes the engine's rAF callback, as with input)
//     raf   scrollTo inside a rAF callback (P-104's harness: the write lands after the frame's scroll event, so the
//           engine's callback sees the previous position; a one-frame lag that no input or page script produces)
//   The P-104 "states" part (settle at ~60 positions, compare C and V classes) is gone: its C-vs-C A/A disagreed at 5
//   positions (profile section transitions still running at the single settle frame), so it can't judge V.
// base best (--base best): the P-104 record, theme audit only, raf mode. base v8sc: the P-117 combined build (build.mjs).
// Each parity case records its load's served JS / CSS hashes (audit.<case>.served).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from './build.mjs';

const { launchChrome, CDP, gotoAndSettle, tempProfileDir, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PART = process.argv[2];
if (!['count', 'parity', 'diag'].includes(PART)) { console.error('usage: probe.mjs count|parity|diag [--reps N] [--out f]'); process.exit(1); }
const REPS = Number(arg('--reps', '2'));
const OUTD = join(WT, 'out/nav-hit-cache'); mkdirSync(OUTD, { recursive: true });
const OUT = arg('--out', join(OUTD, `probe-${PART}-${Date.now()}.json`));
const BASE = resolveTree('site-pretty');
const BASE_NAME = arg('--base', 'v8');
const ARMS = build({ quiet: true, base: BASE_NAME });
const VP = {
  mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
};

function navRegion(dir) {
  const lines = readFileSync(join(dir, JS), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.includes('perf(nav-hit-test): same answer'));
  const b = lines.findIndex((l) => l.includes('let ne = dE(L, { manageAnimations: !1 });'));
  if (a < 0 || b < 0) throw new Error('nav region markers not found in ' + dir);
  return [a + 1, b + 1];
}
async function server(arm) {
  const state = join(OUTD, `serve-probe-${arm}.json`); rmSync(state, { force: true });
  const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS[arm].dir, '--port', '0', '--quiet',
    '--no-cache', '--state', state, '--vendors=local', '--https', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(state)) { try { const s = JSON.parse(readFileSync(state, 'utf8')); return { proc, url: s.url || `https://localhost:${s.port}/` }; } catch {} } await sleep(100); }
  proc.kill(); throw new Error('server ' + arm);
}
const COUNTER = (lo, hi) => `(() => {
  const C = window.__nc = { on: false, all: {}, nav: {} };
  const re = /2\\.DyWL8TcE\\.js:(\\d+):/g;
  const wrap = (obj, name, key) => { const f = obj[name]; obj[name] = function (...a) { if (C.on) { C.all[key] = (C.all[key] || 0) + 1; const s = new Error().stack || ''; let m, nav = false; re.lastIndex = 0; while ((m = re.exec(s))) { const ln = +m[1]; if (ln >= ${lo} && ln <= ${hi}) { nav = true; break; } } if (nav) C.nav[key] = (C.nav[key] || 0) + 1; } return f.apply(this, a); }; };
  wrap(Element.prototype, 'getBoundingClientRect', 'rect'); wrap(Element.prototype, 'getClientRects', 'rects');
  wrap(window, 'getComputedStyle', 'gcs'); wrap(Document.prototype, 'elementsFromPoint', 'efp'); wrap(Document.prototype, 'elementFromPoint', 'ef1');
})();`;
const RAF3 = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))';
// continuous scroll: from -> to in px per rAF; resolves with the step count
const SCROLL = (to, px, mode = 'raf') => { const next = mode === 'task' ? '() => setTimeout(step, 0)' : 'step';
  return `new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; const goal = Math.max(0, Math.min(max, ${to}));
  let y = scrollY, n = 0; const dir = goal >= y ? 1 : -1;
  const step = () => { y = dir > 0 ? Math.min(goal, y + ${px}) : Math.max(goal, y - ${px}); scrollTo({ top: y, behavior: 'instant' }); n++;
    if (y !== goal && n < 5000) requestAnimationFrame(${next}); else ${mode === 'task' ? 'requestAnimationFrame(() => requestAnimationFrame(() => res({ n, y: scrollY, max })))' : 'res({ n, y: scrollY, max })'}; };
  requestAnimationFrame(${next}); })`; };

async function openPage(cdp, arm, url, vp, { pre = [], rtl = false } = {}) {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + JSON.stringify(m.params.args.map((a) => a.value)).slice(0, 140));
  });
  await page.send('Runtime.enable').catch(() => {});
  await page.send('Emulation.setDeviceMetricsOverride', VP[vp]);
  if (VP[vp].mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (rtl) pre = [...pre, `document.addEventListener('DOMContentLoaded', () => { document.documentElement.dir = 'rtl'; });`];
  for (const src of pre) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await sleep(1500);
  page.errors = errors;
  const ok = await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`);
  if (!ok) throw new Error(`blank or unexpected page (${arm}, ${vp}): no nav or no scroll range`);
  page.served = await page.eval(`Promise.all([${JSON.stringify(JS)}, ${JSON.stringify(CSS)}].map((p) => fetch('/' + p, { cache: 'no-store' }).then((r) => r.arrayBuffer()).then((b) => crypto.subtle.digest('SHA-256', b)).then((d) => [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12))))`);
  if (page.served.join() !== [ARMS[arm].js, ARMS[arm].css].join()) throw new Error(`arm ${arm} served ${page.served.join(' / ')}, pinned ${ARMS[arm].js} / ${ARMS[arm].css}`);
  return page;
}

const SCRIPT_PARENTS = new Set(['FunctionCall', 'FireAnimationFrame', 'EventDispatch', 'TimerFire', 'RunMicrotasks', 'v8.callFunction']);
async function countLoad(cdp, arm, url, region, vp) {
  const page = await openPage(cdp, arm, url, vp, { pre: [COUNTER(region[0], region[1])] });
  await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`); await sleep(1500);
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 400 * 1024,
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', '__metadata'] }, transferMode: 'ReportEvents' });
  await sleep(300);
  await page.eval(`(performance.mark('nhc-start'), (window.__nc.on = true))`);
  const sc = await page.eval(SCROLL('1e9', 10), { timeout: 120000 });
  await page.eval(`((window.__nc.on = false), performance.mark('nhc-end'))`);
  const api = await page.eval('JSON.parse(JSON.stringify(window.__nc))');
  await sleep(300);
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
  off();
  const mk = (n) => events.find((e) => e.name === n)?.ts;
  const a = mk('nhc-start'), b = mk('nhc-end');
  if (a === undefined || b === undefined) throw new Error('trace marks missing');
  // disjoint script intervals per tid
  const byTid = new Map();
  for (const e of events) if (e.ph === 'X' && SCRIPT_PARENTS.has(e.name) && e.ts < b && e.ts + (e.dur || 0) > a) { if (!byTid.has(e.tid)) byTid.set(e.tid, []); byTid.get(e.tid).push([e.ts, e.ts + (e.dur || 0)]); }
  for (const [t, l] of byTid) { l.sort((x, y) => x[0] - y[0]); const m = []; for (const iv of l) { const last = m[m.length - 1]; if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else m.push([...iv]); } byTid.set(t, m); }
  const inScript = (e) => { const l = byTid.get(e.tid); if (!l) return false; let lo = 0, hi = l.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (l[m][0] <= e.ts) { if (e.ts < l[m][1]) return true; lo = m + 1; } else hi = m - 1; } return false; };
  const c = {};
  for (const e of events) {
    if (e.ts < a || e.ts >= b || !(e.ph === 'X' || e.ph === 'B')) continue;
    if (!['PrePaint', 'UpdateLayoutTree', 'Layout', 'Paint'].includes(e.name)) continue;
    const k = e.name + (inScript(e) ? '.forced' : '.frame');
    c[k] = (c[k] || 0) + 1;
  }
  const n = sc.n, r2 = (x) => Math.round((x / n) * 1000) / 1000;
  const per = Object.fromEntries(Object.entries(c).sort().map(([k, v]) => [k, r2(v)]));
  const tot = (nm) => r2((c[nm + '.forced'] || 0) + (c[nm + '.frame'] || 0));
  const r = { arm, vp, served: page.served, steps: n, max: sc.max, ms: Math.round((b - a) / 1000), counts: c, perStep: per,
    prePaintPerStep: tot('PrePaint'), layoutPerStep: tot('Layout'), styleRecalcPerStep: tot('UpdateLayoutTree'),
    api: { all: api.all, nav: api.nav, navPerStep: Object.fromEntries(Object.entries(api.nav).map(([k, v]) => [k, r2(v)])) }, errors: page.errors.slice(0, 5) };
  console.log(`count ${arm} ${vp} steps ${n} PrePaint/step ${r.prePaintPerStep} Layout/step ${r.layoutPerStep} Style/step ${r.styleRecalcPerStep} forced ${JSON.stringify(Object.fromEntries(Object.entries(per).filter(([k]) => k.endsWith('.forced'))))} nav ${JSON.stringify(r.api.navPerStep)}${r.errors.length ? ' ERR ' + r.errors.join('; ') : ''}`);
  await page.close();
  return r;
}

const CASES = [['mobile', {}], ['desktop', {}], ['desktop-rtl', { rtl: true }], ['mobile-rtl', { rtl: true }], ['mobile-shift', { shift: true }]];
const SHIFT = `(() => { const c = document.querySelector('.commission') || document.querySelector('main > *:nth-child(2)'); const d = document.createElement('div'); d.style.height = '300px'; d.className = 'probe-shift'; c.parentNode.insertBefore(d, c); })()`;
async function doShift(page) {
  await page.eval(`window.scrollTo({ top: Math.round(document.documentElement.scrollHeight / 2), behavior: 'instant' })`);
  await page.eval(RAF3); await page.eval(SHIFT); await page.eval(RAF3);
}
async function audit(cdp, url, name, opt) {
  const vp = name.split('-')[0];
  const INIT = 'window.__nhcAudit = { t: 0, n: 0, lag: 0, m: [], v: [], p: [] }';
  const page = await openPage(cdp, 'VA', url, vp, { pre: [INIT + ';'], rtl: opt.rtl });
  if (opt.shift) await doShift(page);
  const out = {};
  for (const mode of BASE_NAME === 'best' ? ['raf'] : ['task', 'raf'])
    for (const px of [10, 40]) {
      await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`); await page.eval(RAF3);
      await page.eval(`(${INIT}, 0)`);
      const down = await page.eval(SCROLL('1e9', px, mode), { timeout: 120000 });
      const up = await page.eval(SCROLL('0', px, mode), { timeout: 120000 });
      await page.eval(RAF3);
      const A = await page.eval('JSON.parse(JSON.stringify(window.__nhcAudit))');
      // inSync: the frame's scroll-event position was the live scrollY (entries carry scrollY as their 4th field)
      const sync = (l) => l.filter((x) => x.length < 4 || x[0] === x[3]).length;
      out[mode + px] = { steps: down.n + up.n, tested: A.t, cached: A.n, lagFrames: BASE_NAME === 'best' ? null : A.lag,
        mismatches: A.m.length, mismatchesInSync: sync(A.m), first: A.m.slice(0, 10),
        sticky: A.v.length, stickyInSync: sync(A.v), stickyFirst: A.v.slice(0, 10),
        pill: A.p.length, pillInSync: sync(A.p), pillFirst: A.p.slice(0, 10) };
    }
  out.served = page.served; // this load's served JS / CSS hashes (checked against VA's pin in openPage)
  out.errors = page.errors.slice(0, 5);
  await page.close();
  console.log('audit', name, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, o]) => [k, k === 'errors' || k === 'served' ? o
    : { steps: o.steps, lag: o.lagFrames, theme: [o.mismatches, o.mismatchesInSync], sticky: [o.sticky, o.stickyInSync], pill: [o.pill, o.pillInSync], first: [...o.first, ...o.stickyFirst, ...o.pillFirst].slice(0, 3) }]))));
  return out;
}

// part "diag" (arm VA, task mode): replays the parity audit's task10 then task40 sequence and, at each 40 px step
// whose scrollY lies in --at <y>±<win> (both directions), records what the nav probe line hits: the hit chain under it
// (outside the nav), fresh edges near it, the theme section classes and running animations; tags the steps whose frame
// added an audit mismatch. Diagnosis only (no verdict).
const DIAG_REC = (lo, hi) => `(() => { const y = Math.round(scrollY); if (y < ${lo} || y > ${hi}) return null;
  const nav = document.querySelector('header.start-selling-top-nav'); const nr = nav.getBoundingClientRect();
  const cx = nr.left + nr.width / 2, py = nr.top + Math.min(nr.height, 64) / 2;
  const d = (e) => { const r = e.getBoundingClientRect(); return (e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 3).join('.')) + ' ' + Math.round(r.top + scrollY) + '..' + Math.round(r.bottom + scrollY); };
  const chain = document.elementsFromPoint(cx, py).filter((e) => !nav.contains(e) || e.closest('.start-selling-top-nav-actions, .start-selling-morph-panel')).slice(0, 4).map(d);
  const line = py + scrollY, edges = [];
  for (const e of document.querySelectorAll('.hero-track, .commission, .commission-card, .start-selling-future-card, .pain, .start-selling-platform-card, .start-selling-platform')) { const r = e.getBoundingClientRect(); for (const v of [r.top + scrollY, r.bottom + scrollY]) if (Math.abs(v - line) < 120) edges.push([[...e.classList][0], Math.round(v)]); }
  const cls = [...document.querySelectorAll('.commission, .start-selling-future, .start-selling-platform, .pain')].map((e) => e.className.replace(/svelte-[a-z0-9]+/g, '').trim());
  const anims = document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.effect?.target ? [...a.effect.target.classList][0] : '?') + ':' + (a.transitionProperty || a.animationName || 'wa')).slice(0, 8);
  return { y, line: Math.round(line), chain, edges, cls, anims, nav: nav.className.replace(/svelte-[a-z0-9]+/g, '').trim(), m: window.__nhcAudit.m.length }; })()`;
async function diag(cdp, url, name, at, win) {
  const vp = name.split('-')[0];
  const INIT = 'window.__nhcAudit = { t: 0, n: 0, lag: 0, m: [], v: [], p: [] }';
  const page = await openPage(cdp, 'VA', url, vp, { pre: [INIT + ';'] });
  const out = { name, at, win, steps: [] };
  for (const px of [10, 40]) {
    await page.eval(`scrollTo({ top: 0, behavior: 'instant' })`); await page.eval(RAF3);
    await page.eval(`(${INIT}, 0)`);
    for (const to of ['1e9', '0']) {
      const rec = px === 40 ? DIAG_REC(at - win, at + win) : 'null';
      const r = await page.eval(`new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; const goal = Math.max(0, Math.min(max, ${to}));
        let y = scrollY, n = 0; const dir = goal >= y ? 1 : -1; const L = [];
        const step = () => { const q = ${rec}; q && L.push({ dir, ...q }); y = dir > 0 ? Math.min(goal, y + ${px}) : Math.max(goal, y - ${px}); scrollTo({ top: y, behavior: 'instant' }); n++;
          if (y !== goal && n < 5000) requestAnimationFrame(() => setTimeout(step, 0)); else requestAnimationFrame(() => requestAnimationFrame(() => { const q2 = ${rec}; q2 && L.push({ dir, ...q2 }); res({ n, L, m: window.__nhcAudit.m }); })); };
        requestAnimationFrame(() => setTimeout(step, 0)); })`, { timeout: 120000 });
      if (px === 40) { out.steps.push(...r.L); out['m' + to] = r.m; }
    }
  }
  out.errors = page.errors.slice(0, 5);
  await page.close();
  return out;
}

const servers = [];
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/nav-hit-cache/chrome'), 'nhc-' + PART), headless: true, windowSize: '1440,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const result = { part: PART, date: new Date().toISOString(), browser: chrome.browser, arms: Object.fromEntries(Object.entries(ARMS).map(([k, a]) => [k, { js: a.js, css: a.css }])) };
const T0 = Date.now();
try {
  if (PART === 'count') {
    const S = { C: await server('C'), V: await server('V') }; servers.push(...Object.values(S));
    const region = { C: navRegion(ARMS.C.dir), V: navRegion(ARMS.V.dir) };
    result.regions = region; result.loads = [];
    for (let rep = 0; rep < REPS; rep++)
      for (const vp of arg('--vp', 'mobile,desktop').split(','))
        // --arms C: the harness smoke (C only, not scored)
        for (const arm of (rep % 2 ? ['V', 'C'] : ['C', 'V']).filter((a) => arg('--arms', 'C,V').split(',').includes(a))) result.loads.push({ rep, ...(await countLoad(cdp, arm, S[arm].url, region[arm], vp)) });
  } else if (PART === 'diag') {
    // --at mobile:2240,desktop:4960 [--win 160]
    const S = { VA: await server('VA') }; servers.push(...Object.values(S));
    result.base = BASE_NAME; result.diag = {};
    for (const spec of arg('--at', 'mobile:2240').split(',')) { const [name, at] = spec.split(':');
      result.diag[name] = await diag(cdp, S.VA.url, name, Number(at), Number(arg('--win', '160'))); }
  } else {
    const S = { VA: await server('VA') }; servers.push(...Object.values(S));
    result.base = BASE_NAME; result.audit = {};
    for (const [name, opt] of CASES.filter(([n]) => arg('--cases', CASES.map((c) => c[0]).join(',')).split(',').includes(n)))
      result.audit[name] = await audit(cdp, S.VA.url, name, opt);
  }
} catch (e) {
  result.fatal = String((e && e.stack) || e); console.error('FATAL', result.fatal.split('\n')[0]);
} finally {
  result.wallMs = Date.now() - T0;
  writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log('wrote', OUT.replace(WT + '/', ''), 'wallMs', result.wallMs);
  for (const s of servers) s.proc.kill();
  cdp.close(); await chrome.close();
}
