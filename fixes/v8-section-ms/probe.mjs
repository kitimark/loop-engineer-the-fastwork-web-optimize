// v8-section-ms probe (user T-151, C-048 note): Chrome main-thread ms per page section, split script / style /
// layout / paint (+ other main-thread, compositor thread, raster), for the v7 and v8 builds (and the baseline).
// Calibrated setting: 430x932 DPR 3 + touch, CPU 6x, served --vendors=local --https --latency 150, fresh isolated
// context per page. One page per arm and run:
//   load + settle (as verify.mjs), section geometry (getBoundingClientRect of the top-level <section>s, at y 0),
//   CPU 6x, then
//   1. rest window "hero" at y 0 (6 s, in place of verify's idle phase), trace + JS CPU profile
//   2. scroll phase: verify.mjs's SCROLL (scrollBy 250 smooth every 300 ms to the bottom), trace + JS CPU profile,
//      rAF frame log [t, dt, scrollY] (lib/perf-page.mjs loggerSource({frameLog: true}), as verify --frame-log)
//   3. rest windows (6 s each, 2 s settle after an instant jump): end, then section tops going up
// Every main-thread instant is given to one bucket by self time (lib/trace-frames.mjs selfSegments + kindOf, the
// buckets of verify --trace-frames), and in the scroll phase to the section under the viewport's centre line at
// that instant (scrollY from the frame log). Tracing and profiling perturb timing: these numbers compare v7 and v8
// with each other only, never with untraced runs.
//
// Run ONLY inside a chrome-measure hold:
//   node tools/lock.mjs run chrome-measure --owner de-v8-section-ms --max-seconds 600 --doing "..." -- \
//     node --max-old-space-size=8192 fixes/v8-section-ms/probe.mjs run --arms A,V --runs 2 --tag h1
// Output: one JSON line per page in out/sec/pages.jsonl (summarize.mjs builds the tables).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { launchChrome, CDP, gotoAndSettle, sleep } from '../../tools/lib/cdp.mjs';
import { loggerSource, RESET, COLLECT } from '../../tools/lib/perf-page.mjs';
import { TRACE_CATEGORIES, TRACE_BUFFER_KB, selfSegments, kindOf, LAYER_EVENTS } from '../../tools/lib/trace-frames.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const ARMS = opt('arms', 'A,V').split(',');
const RUNS = Number(opt('runs', 1));
const START = Number(opt('start', 0)); // run index offset (alternation continues across holds)
const TAG = opt('tag', 'x');
const WIN_MS = Number(opt('win', 6000));
const SETTLE_MS = Number(opt('settle', 2000));
const RESTS = opt('rests', 'end,commission,pain,profile-showcase,people').split(',').filter(Boolean);
const OUT = join(WT, 'out/sec'); mkdirSync(OUT, { recursive: true });
const PAGES = join(OUT, opt('pages', 'pages.jsonl'));
const SNAP = join(OUT, 'snap');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
// expected sha256 (first 12) of the served node JS / CSS per arm; B = the pinned baseline's site-pretty files
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const EXPECT = {
  A: { js: '8c90da217745', css: '308f0da70c3a' }, // v7 (fixes/v7-best/results.json)
  V: { js: '3e3e94cb6e9f', css: 'f836404b3728' }, // v8 (fixes/v8-best)
  B: { js: sha(readFileSync(join(BASE, NODE))), css: sha(readFileSync(join(BASE, CSS))) },
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const r1 = (x) => Math.round(x * 10) / 10;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local self-signed mirror cert, used for the hash check only

// ---------- servers ----------
async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const overlay = arm === 'B' ? [] : ['--overlay', join(SNAP, arm)];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...overlay, '--port', '0', '--quiet', '--state', st,
    '--vendors=local', '--https', '--latency', '150', '--no-http-twin', '--owner', 'de-v8-section-ms', '--doing', 'v8 per-section ms probe'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(`${arm}: server did not start`); }
  const url = `https://localhost:${s.port}/`;
  const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer()));
  const css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
  if (js !== EXPECT[arm].js || css !== EXPECT[arm].css) { p.kill(); throw new Error(`VOID ${arm}: serves ${js}/${css}, expected ${EXPECT[arm].js}/${EXPECT[arm].css}`); }
  const src = readFileSync(arm === 'B' ? join(BASE, NODE) : join(SNAP, arm, NODE), 'utf8').split('\n');
  return { p, url, js, css, nav: navRange(src) };
}
// the top nav component (header.start-selling-top-nav): the first top-level function after its template, up to the
// next template (1-based lines, inclusive)
function navRange(lines) {
  const t = lines.findIndex((l) => l.includes('start-selling-top-nav-bar svelte-'));
  const a = lines.findIndex((l, i) => i > t && /^function [\w$]+\(/.test(l));
  const b = lines.findIndex((l, i) => i > a && /^var [\w$]+ = h\(/.test(l));
  if (t < 0 || a < 0 || b < 0) throw new Error('nav component not found');
  return [a + 1, b];
}

// ---------- page side ----------
const GEOM = `(() => {
  const secs = [...document.querySelectorAll('section')].filter((s) => !s.parentElement.closest('section'));
  const nav = document.querySelector('header.start-selling-top-nav');
  const nr = nav && nav.getBoundingClientRect();
  return { h: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth, y: scrollY,
    secs: secs.map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || s.classList[0], top: Math.round(r.top + scrollY), h: Math.round(r.height) }; }),
    marks: Object.fromEntries(['#people', '#profile-showcase', 'section.feed', 'section.pain', 'section.commission', '#platform'].map((q) => { const e = document.querySelector(q); const r = e && e.getBoundingClientRect(); return [q.replace(/^section\.|^#/, ''), r ? { top: Math.round(r.top + scrollY), h: Math.round(r.height) } : null]; })),
    nav: nr ? { top: Math.round(nr.top), h: Math.round(nr.height), position: getComputedStyle(nav).position } : null };
})()`;
// verify.mjs's scroll phase, verbatim
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
const MARK = (n) => `performance.mark('${n}').startTime`;

// ---------- trace + profile ----------
async function capture(page, fn) {
  const events = []; let bufMax = 0;
  const off = page.on((m) => {
    if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e);
    if (m.method === 'Tracing.bufferUsage' && typeof m.params.percentFull === 'number') bufMax = Math.max(bufMax, m.params.percentFull);
  });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: TRACE_BUFFER_KB, includedCategories: TRACE_CATEGORIES }, transferMode: 'ReportEvents', bufferUsageReportingInterval: 1000 });
  await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.send('Profiler.start');
  const r = await fn();
  const { profile } = await page.send('Profiler.stop');
  await page.send('Profiler.disable');
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 240000);
  await page.send('Tracing.end');
  const c = await done; off();
  return { r, events, profile, dataLoss: c.params?.dataLossOccurred ?? null, bufferPercentMax: r1(bufMax * 100) };
}

/** Complete events (µs) of one thread: X with dur, and B/E pairs (as lib/trace-frames.mjs intervals()). */
function intervals(events, pid, tid) {
  const out = [], open = [];
  for (const e of events) {
    if (e.pid !== pid || e.tid !== tid) continue;
    if (e.ph === 'X' && e.dur > 0) out.push({ name: e.name, start: e.ts, end: e.ts + e.dur, args: e.args || {} });
    else if (e.ph === 'B') open.push(e);
    else if (e.ph === 'E') { for (let i = open.length - 1; i >= 0; i--) if (open[i].name === e.name || !e.name) { const b = open.splice(i, 1)[0]; if (e.ts > b.ts) out.push({ name: b.name, start: b.ts, end: e.ts, args: { ...(b.args || {}), ...(e.args || {}) } }); break; } }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}
/** Union of intervals, clipped to [a, b): sorted disjoint [start, end] pairs. */
function union(ivs, a, b) {
  const xs = ivs.map((v) => [Math.max(a, v.start), Math.min(b, v.end)]).filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [s, e] of xs) { const l = out[out.length - 1]; if (l && s <= l[1]) l[1] = Math.max(l[1], e); else out.push([s, e]); }
  return out;
}

const BK = ['script', 'style', 'layout', 'paint', 'other'];
const zero = () => ({ script: 0, style: 0, layout: 0, paint: 0, other: 0, layer: 0, hitTest: 0, compositor: 0, raster: 0, navJs: 0, js: 0, gc: 0, program: 0, styleElements: 0, layoutObjects: 0, wallMs: 0, frames: 0, k5: 0, k7: 0 });

/**
 * Analyse one capture. `bandOf(pageMs)` names the band an instant belongs to (a section, or 'window'); window
 * [fromMs, toMs] in page ms. Main-thread self time by bucket and band; compositor / raster thread busy time; JS
 * CPU profile samples (navJs: a nav-component frame on the stack; top self functions per band).
 */
function analyse(cap, markName, markStart, { fromMs, toMs, bandOf, nav, url }) {
  const ev = cap.events;
  const mark = ev.find((e) => e.name === markName && e.cat?.includes('user_timing'));
  if (!mark) return { error: `mark ${markName} not in the trace (${ev.length} events)` };
  const off = mark.ts - markStart * 1000; // trace µs = page ms * 1000 + off
  const A = fromMs * 1000 + off, B = toMs * 1000 + off;
  const pms = (us) => (us - off) / 1000;
  const bands = {}; const get = (k) => (bands[k] ||= zero()); const topNames = {};
  // main thread
  const ivs = intervals(ev, mark.pid, mark.tid);
  const segs = selfSegments(ivs);
  for (const s of segs) {
    const a = Math.max(A, s.start), b = Math.min(B, s.end); if (b <= a) continue;
    const band = bandOf(pms((a + b) / 2)); const z = get(band); const ms = (b - a) / 1000;
    const tn = (topNames[band] ||= {}); const nk = `${s.kind}:${s.name}`; tn[nk] = (tn[nk] || 0) + ms;
    z[s.kind] += ms; if (s.kind === 'paint' && LAYER_EVENTS.test(s.name)) z.layer += ms; if (s.name === 'HitTest') z.hitTest += ms;
  }
  for (const iv of ivs) {
    if (iv.start < A || iv.start >= B) continue;
    if (iv.name === 'UpdateLayoutTree') get(bandOf(pms(iv.start))).styleElements += Number(iv.args.elementCount ?? iv.args.data?.elementCount ?? iv.args.endData?.elementCount ?? 0) || 0;
    if (iv.name === 'Layout') get(bandOf(pms(iv.start))).layoutObjects += Number(iv.args.beginData?.dirtyObjects ?? 0) || 0;
  }
  // event counts on the main thread (frames: BeginMainThreadFrame / Commit)
  const CNT = /^(BeginMainThreadFrame|Commit|Layerize|Paint|PrePaint|UpdateLayoutTree|Layout|HitTest|FireAnimationFrame)$/;
  for (const e of ev) { if (e.pid !== mark.pid || e.tid !== mark.tid || e.ph === 'E' || !CNT.test(e.name) || e.ts < A || e.ts >= B) continue; const c = (get(bandOf(pms(e.ts))).counts ||= {}); c[e.name] = (c[e.name] || 0) + 1; }
  // compositor + raster threads of the same renderer
  const names = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name' && e.pid === mark.pid) names.set(e.tid, e.args?.name || '');
  const threadBusy = {};
  for (const [tid, n] of names) {
    const key = n === 'Compositor' ? 'compositor' : /^CompositorTileWorker/.test(n) ? 'raster' : null; if (!key) continue;
    for (const [s, e] of union(intervals(ev, mark.pid, tid), A, B)) {
      // split at band changes coarsely: by the interval's midpoint (intervals are short)
      get(bandOf(pms((s + e) / 2)))[key] += (e - s) / 1000; threadBusy[key] = (threadBusy[key] || 0) + (e - s) / 1000;
    }
  }
  // JS CPU profile: sample timestamps share the trace clock (checked: jsInsideMainEvents)
  const p = cap.profile; const byId = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map();
  for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const isNode = (cf) => cf.url && cf.url.includes(NODE);
  const inNav = (cf) => isNode(cf) && cf.lineNumber + 1 >= nav[0] && cf.lineNumber + 1 <= nav[1];
  const memo = new Map();
  const navOf = (id) => { if (memo.has(id)) return memo.get(id); let v = false; for (let x = id; x !== undefined; x = parent.get(x)) if (inNav(byId.get(x).callFrame)) { v = true; break; } memo.set(id, v); return v; };
  const top = {}; const main = union(ivs, A, B); let jsIn = 0, jsAll = 0, mi = 0;
  let t = p.startTime;
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i]; const dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
    if (t < A || t >= B) continue;
    const n = byId.get(p.samples[i]); const fn = n.callFrame.functionName; const z = get(bandOf(pms(t)));
    if (fn === '(idle)') continue;
    if (fn === '(program)') { z.program += dt; continue; }
    if (fn === '(garbage collector)') { z.gc += dt; continue; }
    z.js += dt; if (navOf(n.id)) z.navJs += dt;
    const cf = n.callFrame; const k = !cf.url && cf.lineNumber > 0 ? `(injected frame logger):${cf.lineNumber + 1} ${fn}` : `${(cf.url || '').replace(url, '/').replace(/^.*\/(_app|__vendor)\//, '$1/')}:${cf.lineNumber + 1} ${fn || '(anon)'}`;
    const b = (top[bandOf(pms(t))] ||= {}); b[k] = (b[k] || 0) + dt;
    jsAll += dt; while (mi < main.length && main[mi][1] < t) mi++; if (mi < main.length && main[mi][0] <= t) jsIn += dt;
  }
  for (const [k, z] of Object.entries(bands)) { for (const f of Object.keys(z)) z[f] = typeof z[f] === 'number' ? r1(z[f]) : z[f]; z.topJs = Object.entries(top[k] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => [n, r1(v)]);
    z.topNames = Object.entries(topNames[k] || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => [n, r1(v)]); }
  return { bands, offUs: off, windowMs: r1(toMs - fromMs), events: ev.length, dataLoss: cap.dataLoss, bufferPercentMax: cap.bufferPercentMax,
    jsInsideMainEvents: jsAll ? +(jsIn / jsAll).toFixed(3) : null, threadBusy: Object.fromEntries(Object.entries(threadBusy).map(([k, v]) => [k, r1(v)])) };
}

// ---------- one page ----------
function cpuTimes() { return cpus().reduce((a, c) => { const t = c.times; a.busy += t.user + t.nice + t.sys + t.irq; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { busy: 0, all: 0 }); }
async function measure(cdp, arm, srv, run) {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
  await page.send('Network.enable'); await page.send('Log.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: loggerSource({ frameLog: true }) });
  await page.send('Page.bringToFront');
  const t0 = Date.now();
  await gotoAndSettle(page, srv.url, { quietMs: 2000 });
  await sleep(1500);
  const geom = await page.eval(GEOM);
  // bands: every top-level section plus the nested landmarks; the viewport's centre line belongs to the containing
  // landmark with the latest top (nested and overlapping ones win over their parent); none: above / footer
  const lm = new Map(geom.secs.map((s) => [s.id, [s.top, s.top + s.h]]));
  for (const [k, v] of Object.entries(geom.marks)) if (v && v.h > 0) lm.set(k, [v.top, v.top + v.h]);
  const tops = [...lm].map(([id, [a, b]]) => [id, a, b]).sort((x, y) => x[1] - y[1]);
  const maxY = geom.h - geom.vh;
  const sectionAt = (y) => { const c = y + geom.vh / 2; let k = null; for (const [id, a, b] of tops) if (c >= a && c < b) k = id; return k ?? (c < tops[0][1] ? 'above' : 'footer'); };
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await sleep(1000);
  const res = { tag: TAG, arm, run, js: srv.js, css: srv.css, nav: srv.nav, geom, load1: [loadavg()[0]], rests: {}, startedAt: new Date(t0).toISOString() };
  const rest = async (name) => {
    let ms0;
    const cap = await capture(page, async () => { ms0 = await page.eval(MARK('__sec_' + name)); await sleep(WIN_MS); return page.eval('[performance.now(), scrollY]'); });
    const [ms1, y] = cap.r;
    const a = analyse(cap, '__sec_' + name, ms0, { fromMs: ms0, toMs: ms1, bandOf: () => 'window', nav: srv.nav, url: srv.url });
    cap.events.length = 0;
    res.rests[name] = { y, section: sectionAt(y), ...a };
    const w = a.bands?.window || {};
    log(arm, run, 'rest', name, 'y', y, `script ${w.script} style ${w.style} layout ${w.layout} paint ${w.paint} other ${w.other} (ms in ${a.windowMs})`, 'jsIn', a.jsInsideMainEvents);
  };
  // 1. rest at the hero (y 0), in place of verify's idle phase
  await rest('hero');
  // 2. scroll phase
  const c0 = cpuTimes(); res.load1.push(loadavg()[0]);
  let sync, perfRes;
  const cap = await capture(page, async () => {
    sync = await page.eval(MARK('__sec_scroll'));
    await page.eval(RESET);
    const s = await page.eval(SCROLL, { timeout: 600000 });
    await sleep(500);
    perfRes = await page.eval(COLLECT);
    return s;
  });
  const c1 = cpuTimes();
  const fl = perfRes.log || [];
  const yAt = (ms) => { let lo = 0, hi = fl.length - 1; if (!fl.length) return 0; if (ms < fl[0][0]) return fl[0][2]; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fl[m][0] <= ms) lo = m; else hi = m - 1; } return fl[lo][2]; };
  const a = analyse(cap, '__sec_scroll', sync, { fromMs: perfRes.t0, toMs: fl.length ? fl[fl.length - 1][0] : perfRes.t0, bandOf: (ms) => sectionAt(yAt(ms)), nav: srv.nav, url: srv.url });
  cap.events.length = 0;
  // per-band wall time, frames and long frames (traced, so perturbed) from the frame log
  for (let i = 1; i < fl.length; i++) { const z = (a.bands[sectionAt(fl[i - 1][2])] ||= zero()); const dt = fl[i][0] - fl[i - 1][0]; z.wallMs = r1(z.wallMs + dt); z.frames++; const k = Math.round(dt / (1000 / 120)); if (k >= 5) z.k5++; if (k >= 7) z.k7++; }
  res.scroll = { ...cap.r, frames: fl.length, hostBusyPct: r1(100 * (c1.busy - c0.busy) / Math.max(1, c1.all - c0.all)), ...a };
  log(arm, run, 'scroll', `${cap.r.ticks} ticks ${r1(cap.r.ms / 1000)} s, h ${cap.r.h}, ${fl.length} frames, events ${a.events}, buf ${a.bufferPercentMax}%, dataLoss ${a.dataLoss}, jsIn ${a.jsInsideMainEvents}, host busy ${res.scroll.hostBusyPct}%`);
  for (const [k, z] of Object.entries(a.bands || {})) log('   ', k.padEnd(18), `script ${z.script} style ${z.style} layout ${z.layout} paint ${z.paint} other ${z.other} nav ${z.navJs} hit ${z.hitTest} comp ${z.compositor} raster ${z.raster} wall ${z.wallMs} k5 ${z.k5}`);
  res.geomAfter = await page.eval(GEOM);
  res.load1.push(loadavg()[0]);
  // 3. rest windows: the page end (already there), then section tops going up
  for (const name of RESTS) {
    if (name !== 'end') {
      const s = geom.marks[name]; if (!s) { res.rests[name] = { error: 'no such element' }; continue; }
      await page.eval(`window.scrollTo({ top: ${Math.min(s.top, maxY)}, behavior: 'instant' })`);
    }
    await sleep(SETTLE_MS);
    await rest(name);
  }
  res.load1.push(loadavg()[0]);
  res.errors = errors; res.ms = Date.now() - t0;
  await page.close();
  return res;
}

// ---------- main ----------
const servers = {};
for (const arm of ARMS) { servers[arm] = await server(arm); log('serve', arm, servers[arm].url, servers[arm].js, servers[arm].css, 'nav lines', servers[arm].nav.join('-')); }
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
log('chrome', ch.browser, 'load1', loadavg()[0].toFixed(1));
await sleep(10000); // like verify --chrome-warm 10: no run on a just-launched Chrome
try {
  for (let run = START; run < START + RUNS; run++) {
    const order = run % 2 ? [...ARMS].reverse() : ARMS;
    for (const arm of order) {
      const r = await measure(cdp, arm, servers[arm], run + 1);
      r.browser = ch.browser;
      appendFileSync(PAGES, JSON.stringify(r) + '\n');
      log('done', arm, 'run', run + 1, `${r1(r.ms / 1000)} s`, 'errors', r.errors.length);
    }
  }
} finally {
  cdp.close(); await ch.close(); for (const s of Object.values(servers)) s.p.kill();
}
