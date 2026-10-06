#!/usr/bin/env node
// i219-hydrate (fix-i219-hydrate): does the page hydrate or re-mount, and what does the re-mount cost at load?
// COUNTS AND PIXELS ONLY: run it in a shared probe hold, nothing here is a timing result (durations are indicative).
// Server and console capture as int-v8's fixes/v10/console-probe.mjs (credit): plain http, --vendors=local,
// --latency 150, --no-cache, one server (own origin) and one isolated context per load.
//
//   cost  loads (default B C F C F), 430x932 DPR 3 mobile + touch, CPU 6x (the calibrated setting):
//         - console: "Failed to hydrate" / hydration_mismatch / errors;
//         - a MutationObserver from document start: element nodes added / removed (subtree sizes) before and after
//           DOMContentLoaded, and every big mutation (> 50 elements) with its time; at DOMContentLoaded every body
//           element goes into a WeakSet, and at the end the share of body elements that are still those nodes
//           ("ssr survivors": 100 % = hydrated, ~0 % = re-mounted);
//         - trace (devtools.timeline): Layout / UpdateLayoutTree / Paint / RunTask counts and summed ms from navigation
//           start to +1 s, +2 s, +3 s, load + 1 s, and end; the 3 longest tasks;
//         - Performance.getMetrics at the end (Nodes, LayoutCount, RecalcStyleCount, JSHeapUsedSize);
//         - a screencast (PNG frames, out/i219/cost-<stamp>/<load>/) with each frame's change against the previous one.
//   dom   loads C F C2 F2, 430x932 DPR 3, no throttle: settle, Date.now frozen, the page walked once to the bottom and
//         back, then the body serialized (elements, attributes, text; comments dropped; `style` kept apart) and
//         screenshots at whole-page stops (animations paused at 4000 ms, SMIL at 4 s), scored with
//         fixes/v9-best/gates/pxlib.mjs scoreStop (A = C, V = F; A~V beyond the A/A mask).
//
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 180 --owner fix-i219-hydrate -- \
//     node fixes/i219-hydrate/probe/hydrate-probe.mjs cost|dom [--builds B,C,F] [--c out/i219/C] [--f fixes/i219-hydrate/overlay]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, tempProfileDir, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels, scoreStop, line } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const MODE = argv[0];
if (!['cost', 'dom'].includes(MODE)) { console.error('usage: hydrate-probe.mjs cost|dom [--builds ...]'); process.exit(1); }
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const DIRS = { B: null, C: resolve(WT, arg('--c', 'out/i219/C')), F: resolve(WT, arg('--f', 'fixes/i219-hydrate/overlay')) };
const BUILDS = arg('--builds', MODE === 'cost' ? 'B,C,F,C,F' : 'C,F,C2,F2').split(',');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/i219', `${MODE}-${tag}`); mkdirSync(OUT, { recursive: true });
const frame0 = (st) => { const f = st?.callFrames?.[0]; return f ? `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}` : null; };
const FROZEN = Date.parse('2026-10-04T12:00:00Z') + 500;

const INIT = `(() => { const R = window.__i219 = { addedEls: 0, removedEls: 0, big: [], dcl: null }; const P = window.__i219parsed = new WeakSet();
  const sub = (n) => n.nodeType === 1 ? 1 + n.getElementsByTagName('*').length : 0;
  new MutationObserver((recs) => { let a = 0, r = 0; const parsing = document.readyState === 'loading';
    for (const m of recs) { for (const n of m.addedNodes) { a += sub(n); if (parsing && n.nodeType === 1) { P.add(n); for (const c of n.getElementsByTagName('*')) P.add(c); if (!window.__i219hdr0) window.__i219hdr0 = n.matches('header.start-selling-top-nav') ? n : n.querySelector('header.start-selling-top-nav'); } } for (const n of m.removedNodes) r += sub(n); }
    R.addedEls += a; R.removedEls += r; if (R.dcl !== null && (a > 50 || r > 50)) R.big.push({ t: Math.round(performance.now()), added: a, removed: r }); else if (r > 50) R.big.push({ t: Math.round(performance.now()), added: a, removed: r, beforeDcl: true }); })
    .observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { R.dcl = Math.round(performance.now()); R.addedAtDcl = R.addedEls; R.removedAtDcl = R.removedEls;
    const s = new WeakSet(); let n = 0; for (const e of document.body.getElementsByTagName('*')) { s.add(e); n++; } R.bodyAtDcl = n; window.__i219ssr = s;
    window.__i219hdr = document.querySelector('header.start-selling-top-nav'); });
})()`;
const END = `JSON.stringify((() => { const R = window.__i219, s = window.__i219parsed; let n = 0, kept = 0; for (const e of document.body.getElementsByTagName('*')) { n++; if (s && s.has(e)) kept++; }
  const b = document.querySelector('.start-selling-top-nav-btn.is-earn');
  return { ...R, timeOrigin: performance.timeOrigin, bodyNow: n, ssrSurvivors: kept, survivorPct: n ? +(100 * kept / n).toFixed(1) : null, headerSameNode: !!window.__i219hdr0 && window.__i219hdr0 === document.querySelector('header.start-selling-top-nav'),
    earn: b ? b.outerHTML.replace(/style="[^"]*"/g, 'style=…').slice(0, 400) : null, loadEnd: Math.round(performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0) }; })())`;
const SER = `(() => { const out = [], styles = []; const walk = (e, d) => { const at = [...e.attributes].filter((a) => a.name !== 'style').map((a) => a.name + '=' + JSON.stringify(a.value)).sort();
    let txt = ''; for (const c of e.childNodes) if (c.nodeType === 3) txt += c.nodeValue; txt = txt.replace(/\\s+/g, ' ').trim();
    out.push(' '.repeat(d) + e.tagName.toLowerCase() + (at.length ? ' ' + at.join(' ') : '') + (txt ? ' | ' + txt : '')); styles.push(' '.repeat(d) + e.tagName.toLowerCase() + ' style=' + (e.getAttribute('style') || ''));
    for (const c of e.children) walk(c, d + 1); }; walk(document.body, 0); return JSON.stringify({ dom: out.join('\\n'), styles: styles.join('\\n') }); })()`;
const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const RESUME = `(() => { for (const a of document.getAnimations()) { try { if (!(a instanceof CSSTransition) && a.playState === 'paused') a.play(); } catch {} } for (const svg of document.querySelectorAll('svg')) { try { svg.unpauseAnimations && svg.unpauseAnimations(); } catch {} } return 1; })()`;
const HITS = `JSON.stringify((() => { const out = []; const lab = (e) => { if (!e) return null; const sec = e.closest('section[id],section[class],[id]'); const c = (x) => x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : ''; return (sec && sec !== e ? c(sec) + ' > ' : '') + c(e); };
  for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })())`;

async function server(k) {
  const st = join(OUT, `serve-${k}.json`); rmSync(st, { force: true });
  const a = [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150', '--no-http-twin'];
  const d = DIRS[k.replace(/\d+$/, '')]; if (d) a.push('--overlay', d);
  const p = spawn(process.execPath, a, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(st)) { try { const s = JSON.parse(readFileSync(st, 'utf8')); return { p, url: `http://localhost:${s.port}/`, st }; } catch {} } await sleep(100); }
  p.kill(); throw new Error('server ' + k);
}
async function served(url) { return Promise.all([NODE, CSSF].map(async (f) => sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())))); }

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/i219/chrome'), 'i219-' + MODE), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/i219-hydrate/probe/hydrate-probe.mjs', mode: MODE, at: new Date().toISOString(), load1: loadavg()[0], dirs: DIRS, out: OUT.replace(WT + '/', ''), loads: [] };
const shots = {};
try {
  for (const k of BUILDS) {
    const srv = await server(k);
    const load = { k, served: await served(srv.url) };
    const page = await cdp.newIsolatedPage();
    const msgs = [];
    page.on((m) => {
      if (m.method === 'Runtime.consoleAPICalled') msgs.push({ kind: 'console.' + m.params.type, text: m.params.args.map((x) => x.value ?? x.description ?? '').join(' ').slice(0, 300), frame: frame0(m.params.stackTrace) });
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; msgs.push({ kind: 'exception', text: (d.exception?.description || d.text || '').slice(0, 300), frame: frame0(d.stackTrace) }); }
      if (m.method === 'Log.entryAdded') msgs.push({ kind: 'log.' + m.params.entry.level, text: (m.params.entry.text || '').slice(0, 300), url: m.params.entry.url });
    });
    await page.send('Log.enable').catch(() => {});
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    try {
      if (MODE === 'cost') {
        await page.send('Emulation.setCPUThrottlingRate', { rate: 6 });
        await page.send('Performance.enable', { timeDomain: 'timeTicks' }).catch(() => {});
        const evs = []; const offT = cdp.on((m) => { if (m.method === 'Tracing.dataCollected' && m.sessionId === page.sessionId) evs.push(...m.params.value); });
        await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'loading', 'toplevel'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
        const fdir = join(OUT, k + '-' + res.loads.length); mkdirSync(fdir, { recursive: true });
        const frames = []; let prev = null;
        const offS = page.on(async (m) => {
          if (m.method !== 'Page.screencastFrame') return;
          const { data, metadata, sessionId } = m.params; page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
          const buf = Buffer.from(data, 'base64'); const i = frames.length; const f = join(fdir, `f${String(i).padStart(3, '0')}.png`); writeFileSync(f, buf);
          let chg = null, luma = null; try { const P = pngPixels(buf); let s = 0, c = 0; const n = P.w * P.h; for (let p = 0, q = 0; p < n; p++, q += P.bpp) { s += (P.px[q] + P.px[q + 1] + P.px[q + 2]) / 3; if (prev && prev.w === P.w && prev.h === P.h) { const dd = Math.max(Math.abs(P.px[q] - prev.px[q]), Math.abs(P.px[q + 1] - prev.px[q + 1]), Math.abs(P.px[q + 2] - prev.px[q + 2])); if (dd > 8) c++; } }
            luma = +(s / n).toFixed(1); chg = prev ? +(100 * c / n).toFixed(2) : null; prev = P; } catch {}
          frames.push({ i, ts: metadata.timestamp, luma, chgPct: chg });
        });
        await page.send('Page.startScreencast', { format: 'png', maxWidth: 430, maxHeight: 932, everyNthFrame: 1 });
        await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 60000 });
        await sleep(3000);
        await page.send('Page.stopScreencast').catch(() => {}); offS();
        const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
        await page.send('Tracing.end'); await done; offT();
        load.end = JSON.parse(await page.eval(END));
        const met = Object.fromEntries(((await page.send('Performance.getMetrics')).metrics || []).map((x) => [x.name, x.value]));
        load.metrics = { Nodes: met.Nodes, LayoutCount: met.LayoutCount, RecalcStyleCount: met.RecalcStyleCount, LayoutDurationMs: Math.round(1000 * met.LayoutDuration), RecalcStyleDurationMs: Math.round(1000 * met.RecalcStyleDuration), ScriptDurationMs: Math.round(1000 * met.ScriptDuration), TaskDurationMs: Math.round(1000 * met.TaskDuration), JSHeapUsedMB: +(met.JSHeapUsedSize / 1048576).toFixed(1) };
        // trace windows, relative to the main frame's navigationStart
        const nav = evs.filter((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame).sort((a, b) => a.ts - b.ts).pop() || evs.find((e) => e.name === 'navigationStart');
        const t0 = nav ? nav.ts : Math.min(...evs.filter((e) => e.ts > 0).map((e) => e.ts));
        const pid = nav?.pid;
        const main = evs.filter((e) => e.ph === 'X' && (!pid || e.pid === pid) && e.ts >= t0);
        const mainTid = (() => { const c = {}; for (const e of main) if (e.name === 'Layout') c[e.tid] = (c[e.tid] || 0) + 1; return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]); })();
        const M = main.filter((e) => e.tid === mainTid);
        const loadMs = load.end.loadEnd;
        const win = (ms) => { const o = {}; for (const n of ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'RunTask', 'FunctionCall', 'ParseHTML']) { const L = M.filter((e) => e.name === n && (e.ts - t0) / 1000 <= ms); o[n] = { n: L.length, ms: Math.round(L.reduce((s, e) => s + (e.dur || 0), 0) / 1000) }; } return o; };
        load.trace = { events: evs.length, mainTid, windows: { s1: win(1000), s2: win(2000), s3: win(3000), load1: win(loadMs + 1000), all: win(1e9) } };
        load.trace.longTasks = M.filter((e) => e.name === 'RunTask').sort((a, b) => b.dur - a.dur).slice(0, 3).map((e) => ({ atMs: Math.round((e.ts - t0) / 1000), ms: Math.round(e.dur / 1000) }));
        const bigT = (load.end.big || []).filter((b) => b.removed > 50).map((b) => b.t);
        if (bigT.length) { const T = bigT[0] * 1000 + t0; const host = M.filter((e) => e.name === 'RunTask' && e.ts <= T && e.ts + e.dur >= T).sort((a, b) => a.dur - b.dur)[0];
          load.trace.remountTask = host ? { atMs: Math.round((host.ts - t0) / 1000), ms: Math.round(host.dur / 1000),
            layoutsIn: M.filter((e) => e.name === 'Layout' && e.ts >= host.ts && e.ts <= host.ts + host.dur).length } : null; }
        load.frames = { n: frames.length, dir: fdir.replace(WT + '/', ''), list: frames.map((f) => ({ i: f.i, tMs: Math.round(f.ts * 1000 - load.end.timeOrigin), luma: f.luma, chgPct: f.chgPct })) };
        writeFileSync(join(OUT, `${k}-${res.loads.length}-trace.json`), JSON.stringify({ t0, navs: evs.filter((e) => e.name === 'navigationStart').map((e) => ({ ts: e.ts, pid: e.pid, args: e.args })), traceEvents: evs }));
      } else {
        await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
        await sleep(2500);
        await page.eval(`(() => { const F = ${FROZEN}; Date.now = () => F; return 1; })()`);
        await page.eval(`new Promise((res) => { let y = 0; const L = document.documentElement.scrollHeight; const step = () => { y += 450; scrollTo({ top: y, behavior: 'instant' }); y < L ? setTimeout(step, 60) : setTimeout(() => { scrollTo({ top: 0, behavior: 'instant' }); res(1); }, 1500); }; step(); })`, { timeout: 60000 });
        await sleep(2000);
        load.end = JSON.parse(await page.eval(END));
        const s = JSON.parse(await page.eval(SER)); writeFileSync(join(OUT, `${k}-dom.txt`), s.dom + '\n'); writeFileSync(join(OUT, `${k}-style.txt`), s.styles + '\n');
        const geo = JSON.parse(await page.eval(`JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); return { max: document.documentElement.scrollHeight - innerHeight, t: e ? e.offsetHeight : 0, ih: innerHeight }; })())`));
        const endStart = geo.max - geo.t; load.geo = geo;
        const fr = [0, 0.04, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75];
        load.stops = [];
        for (const f of fr) {
          await page.eval(RESUME);
          const y = Math.round(f * (endStart - geo.ih)); await page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`);
          await sleep(1300); const z = JSON.parse(await page.eval(FREEZE)); await sleep(400);
          const file = join(OUT, `${k}-s${f}.png`); const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(data, 'base64'));
          (shots[f] ||= {})[k] = { file, hits: JSON.parse(await page.eval(HITS)) }; load.stops.push({ f, y, frozen: z });
        }
      }
    } catch (e) { load.void = String(e.stack || e); console.log(k, 'error', load.void); }
    load.hydrateMsgs = msgs.filter((m) => /hydrat|HierarchyRequestError/i.test(m.text));
    load.warnErr = msgs.filter((m) => /warn|error|exception/.test(m.kind));
    res.loads.push(load);
    const e = load.end || {};
    console.log(`${k}: served ${load.served.join('/')}; hydrate msgs ${load.hydrateMsgs.length}${load.hydrateMsgs[0] ? ' (' + load.hydrateMsgs[0].text.slice(0, 120) + ')' : ''}; warn/err ${load.warnErr.length}; ssr survivors ${e.survivorPct} % (${e.ssrSurvivors}/${e.bodyNow}), header same node ${e.headerSameNode}; elements added after DCL ${e.addedEls - e.addedAtDcl}, removed ${e.removedEls - e.removedAtDcl}; big ${JSON.stringify(e.big)}`);
    if (load.metrics) console.log(`   metrics ${JSON.stringify(load.metrics)}`);
    if (load.trace) { const w = load.trace.windows; for (const n of ['s1', 's2', 's3', 'load1', 'all']) console.log(`   ${n.padEnd(5)} ` + Object.entries(w[n]).map(([a, b]) => `${a} ${b.n}/${b.ms}ms`).join('  ')); console.log(`   longTasks ${JSON.stringify(load.trace.longTasks)} remountTask ${JSON.stringify(load.trace.remountTask)} frames ${load.frames.n}`); }
    for (const m of load.warnErr.slice(0, 6)) console.log(`   ${m.kind}: ${m.text.slice(0, 160)} @ ${m.frame}`);
    await page.close(); srv.p.kill(); rmSync(srv.st, { force: true });
  }
  if (MODE === 'dom') {
    res.stops = [];
    for (const [f, S] of Object.entries(shots)) {
      if (!['C', 'F', 'C2', 'F2'].every((a) => S[a])) { res.stops.push({ f, void: 'missing arm' }); continue; }
      const row = { f, ...scoreStop({ A: S.C.file, V: S.F.file, A2: S.C2.file, V2: S.F2.file }, { V: S.F.hits, V2: S.F2.hits }, 3, 0) };
      res.stops.push(row); console.log(line(f, row));
    }
  }
} finally {
  res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
  writeFileSync(join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', join(OUT, 'probe.json').replace(WT + '/', ''));
}
