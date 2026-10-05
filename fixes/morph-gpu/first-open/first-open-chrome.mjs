// morph-gpu, the menu's first open after page load against the 2nd and 3rd (fix-morph-gpu, lead decision 2026-10-05).
// Counts and a call tree only, no timing gain claim. Headless Chrome 430x932 DPR 3 mobile + touch, CPU 6x during the
// traced part (the calibrated setting; durations are context, never a verdict).
// Per page load: scroll to the page end in 200 px steps WITHOUT opening the menu, wait for the panel's idle mount and
// 3 s of quiet, then trace 3 opens and 3 closes:
//   arm kind "m" (v8, no PR-018): window.__fwMorphDrive({ hold, cycles: 3 }) (the phone's M driver: E(1)/E(0) at the end);
//   arm kind "s" (PR-018 builds with .fw-ms-end): a 30-frame scroll glide from p 0 to p 1 and back, hold between.
// A MutationObserver marks each is-morphing flip on the header (open start / close end); the probe marks each glide
// start. Per window [open mark - 150 ms, + 1500 ms] (and the same for each close start):
//   - every trace event with a duration, summed per thread and name (count, total ms; top ones printed);
//   - UpdateLayoutTree count + elements, Layout count + dirty objects, Paint count + area (kpx device) by painted node;
//   - image decode and raster tasks on any thread; network requests started;
//   - CPU profile (Profiler domain, 200 us) self time per JS function in the window.
// Run (normal FIFO hold):
//   node tools/lock.mjs run chrome-measure --owner fix-morph-gpu -- node fixes/morph-gpu/first-open/first-open-chrome.mjs \
//     --arm m:<abs snapshot dir> --arm s:<abs snapshot dir> [--loads 2] [--hold 2500]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ARMS = args.flatMap((a, i) => (args[i - 1] === '--arm' ? [a] : [])).map((x) => { const [kind, dir] = [x.slice(0, 1), x.slice(2)]; return { kind, dir }; });
if (!ARMS.length || ARMS.some((a) => !'ms'.includes(a.kind) || !existsSync(a.dir))) throw new Error('--arm m:<abs dir> | s:<abs dir>');
const LOADS = +arg('--loads', 2), HOLD = +arg('--hold', 2500), THROTTLE = +arg('--cpu', 6), WIN = 1500, PRE = 150;
const OUT = join(WT, 'out/morph-gpu/first-open'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const area = (c) => (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]));
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'cc', 'v8'].join(',');
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null }; })()`;
const HDR = `document.querySelector('header.start-selling-top-nav')`;
const STATE = `(() => { const h = ${HDR}; const p = document.querySelector('.start-selling-morph-panel'); const im = p ? [...p.querySelectorAll('img')] : [];
  return { y: Math.round(scrollY), cls: h ? h.className : null, morph: h ? h.style.getPropertyValue('--morph') : null, panel: !!p,
    scene: p ? (p.closest('[data-start-selling-scene]') || p.querySelector('[data-start-selling-scene]'))?.getAttribute('data-start-selling-scene') ?? null : null,
    imgs: im.length, withSrc: im.filter((i) => i.getAttribute('src')).length, complete: im.filter((i) => i.complete && i.naturalWidth > 0).length,
    lazy: im.filter((i) => i.loading === 'lazy').length, decAsync: im.filter((i) => i.decoding === 'async').length }; })()`;
// MO marks: fo-on-<n> when is-morphing appears, fo-off-<n> when it goes.
const MO = `(() => { const h = ${HDR}; let on = h.classList.contains('is-morphing'), a = 0, b = 0; window.__foLog = [];
  new MutationObserver(() => { const now = h.classList.contains('is-morphing'); if (now === on) return; on = now;
    const id = now ? 'fo-on-' + a++ : 'fo-off-' + b++; performance.mark(id); window.__foLog.push([id, Math.round(performance.now())]); })
    .observe(h, { attributes: true, attributeFilter: ['class'] }); return on; })()`;
function spans(ev) {
  const out = [], open = new Map();
  for (const e of ev) {
    if (e.ph === 'X') out.push({ name: e.name, ts: e.ts, dur: e.dur ?? 0, pid: e.pid, tid: e.tid, args: e.args });
    else if (e.ph === 'B') { const k = e.pid + '|' + e.tid + '|' + e.name; (open.get(k) || open.set(k, []).get(k)).push(e); }
    else if (e.ph === 'E') { const k = e.pid + '|' + e.tid + '|' + e.name, st = open.get(k)?.pop(); if (st) out.push({ name: st.name, ts: st.ts, dur: e.ts - st.ts, pid: st.pid, tid: st.tid, args: { ...st.args, endData: e.args?.endData } }); }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'first-open'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'morph-gpu first-open-chrome (fix-morph-gpu)', browser: chrome.browser, startedAt: new Date().toISOString(), loads: LOADS, hold: HOLD, cpu: THROTTLE, win: [PRE, WIN], runs: [] };
try {
  for (const [ai, arm] of ARMS.entries()) for (let load = 0; load < LOADS; load++) {
    const st = join(OUT, `serve-fo-${ai}-${load}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', arm.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const run = { arm: arm.kind + ':' + basename(arm.dir), load, windows: [] };
    const page = await cdp.newIsolatedPage();
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Network.enable', {});
      const reqs = []; const offN = page.on((m) => { if (m.method === 'Network.requestWillBeSent') reqs.push({ ts: m.params.timestamp, url: m.params.request.url.replace(/^https?:\/\/[^/]+/, '') }); });
      await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
      run.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      run.files = { js: sha(readFileSync(join(arm.dir, NODE))), css: sha(readFileSync(join(arm.dir, CSS))) };
      if (run.served.js !== run.files.js || run.served.css !== run.files.css) throw new Error('VOID: served files differ from the snapshot');
      // To the page end without opening: m arms stop at the max scroll (a push past it opens), s arms at p 0.
      const target = async () => { const g = await page.eval(GEO); return arm.kind === 's' ? g.max - g.t : g.max; };
      for (let pass = 0; pass < 3; pass++) {
        const T = await target();
        await page.eval(`new Promise((res) => { let y = scrollY; const T = ${T}; const step = () => { y = Math.min(T, y + 200); window.scrollTo({ top: y, behavior: 'instant' }); y < T ? requestAnimationFrame(step) : setTimeout(res, 1500); }; requestAnimationFrame(step); })`);
      }
      const g = await page.eval(GEO); run.geo = g;
      if (arm.kind === 's' && !g.t) throw new Error('no .fw-ms-end: not a PR-018 build');
      if (arm.kind === 'm' && !(await page.eval(`typeof window.__fwMorphDrive === 'function'`))) throw new Error('no __fwMorphDrive');
      for (let k = 0; k < 100 && !(await page.eval(`!!document.querySelector('.start-selling-morph-panel')`)); k++) await sleep(100);
      await sleep(3000);
      run.before = await page.eval(STATE);
      if (/is-morphing/.test(run.before.cls || '')) throw new Error('menu already open before the trace');
      run.moStartOn = await page.eval(MO);
      await page.send('DOM.getDocument', { depth: 0 });
      await page.send('Profiler.enable', {}); await page.send('Profiler.setSamplingInterval', { interval: 200 });
      const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      await page.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      await page.send('Profiler.start', {});
      const reqFrom = reqs.length;
      if (arm.kind === 'm') {
        await page.eval(`(window.__fwMorphDrive({ hold: ${HOLD}, cycles: 3 }), 1)`);
        for (let k = 0; k < 400 && !(await page.eval(`!!window.__fwMD`)); k++) await sleep(100);
        run.driver = JSON.parse(await page.eval(`window.__fwMD || 'null'`));
        if (run.driver) delete run.driver.href;
      } else {
        const a = g.max - g.t, b = g.max;
        const glide = (from, to, id) => page.eval(`new Promise((res) => { performance.mark('${id}'); let n = 0; const st = () => { n++; window.scrollTo({ top: Math.round(${from} + (${to} - ${from}) * Math.min(1, n / 30)), behavior: 'instant' }); n < 30 ? requestAnimationFrame(st) : res(1); }; requestAnimationFrame(st); })`);
        for (let c = 0; c < 3; c++) { await glide(a, b, `fo-go-${c}`); await sleep(HOLD); await glide(b, a, `fo-gc-${c}`); await sleep(HOLD); }
      }
      await sleep(800);
      const prof = (await page.send('Profiler.stop', {})).profile;
      await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 90000);
      await page.send('Tracing.end'); await done; offT(); offN();
      run.after = await page.eval(STATE);
      run.moLog = await page.eval(`window.__foLog`);
      // raw data first, so an analysis bug never costs the hold again
      writeFileSync(join(OUT, `raw-${STAMP}-${ai}-${load}.json.gz`), gzipSync(JSON.stringify({ ev, prof, reqs: reqs.slice(reqFrom) })));
      // threads
      const tname = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') tname.set(e.pid + '|' + e.tid, e.args?.name);
      const sp = spans(ev);
      const mainKey = [...tname.entries()].find(([, n]) => n === 'CrRendererMain' )?.[0];
      // the renderer main thread of this page: the CrRendererMain that holds our user-timing marks' frame events
      const marks = ev.filter((e) => e.cat?.includes('user_timing') && /^fo-/.test(e.name) && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b' || e.ph === 'X'));
      const mainKeys = new Set(ev.filter((e) => e.name === 'UpdateLayoutTree' || e.name === 'Layout').map((e) => e.pid + '|' + e.tid));
      run.threads = { main: [...mainKeys].map((k) => tname.get(k) || k), firstRendererMain: mainKey ? tname.get(mainKey) : null };
      const markTs = (id) => marks.find((e) => e.name === id)?.ts;
      // profile sample times (same TimeTicks clock as the trace, checked below)
      const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
      const sampT = []; { let t = prof.startTime; for (const d of prof.timeDeltas) { t += d; sampT.push(t); } }
      let tMin = Infinity, tMax = -Infinity; for (const e of sp) { if (e.ts < tMin) tMin = e.ts; if (e.ts > tMax) tMax = e.ts; }
      run.profileClock = { startInTrace: prof.startTime >= tMin - 5e6 && prof.startTime <= tMax, start: prof.startTime, traceMin: tMin, traceMax: tMax };
      const names = new Map();
      const nameOf = async (bid) => {
        if (bid == null) return '(none)';
        if (names.has(bid)) return names.get(bid);
        let nm = '#' + bid;
        try {
          const o = (await page.send('DOM.resolveNode', { backendNodeId: bid })).object;
          nm = (await page.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: `function () { const k = typeof this.className === 'string' ? this.className : (this.className && this.className.baseVal) || ''; return (this.nodeName || '').toLowerCase() + (k ? '.' + k.trim().split(/\\s+/).slice(0, 2).join('.') : ''); }`, returnByValue: true })).result.value;
        } catch {}
        names.set(bid, nm); return nm;
      };
      const wins = [];
      if (arm.kind === 'm') {
        for (let c = 0; c < 3; c++) {
          const on = markTs(`fo-on-${c}`);
          if (on == null) { wins.push({ id: `open${c + 1}`, error: 'no fo-on mark' }); continue; }
          wins.push({ id: `open${c + 1}`, a: on - PRE * 1e3 });
          wins.push({ id: `close${c + 1}`, a: on + HOLD * 1e3 - PRE * 1e3 }); // E(0) comes HOLD after E(1) (driver schedule)
        }
      } else {
        for (let c = 0; c < 3; c++) {
          const go = markTs(`fo-go-${c}`), gc = markTs(`fo-gc-${c}`);
          wins.push(go == null ? { id: `open${c + 1}`, error: 'no mark' } : { id: `open${c + 1}`, a: go - PRE * 1e3 });
          wins.push(gc == null ? { id: `close${c + 1}`, error: 'no mark' } : { id: `close${c + 1}`, a: gc - PRE * 1e3 });
        }
      }
      for (const w of wins) {
        if (w.error) { run.windows.push(w); continue; }
        const b = w.a + (PRE + WIN) * 1e3;
        const o = { id: w.id, styles: 0, elems: 0, layouts: 0, dirty: 0, paints: 0, kpx: 0, decodes: 0, decodeMs: 0, rasters: 0, rasterMs: 0, byThread: {}, byPaint: {}, js: {}, reqs: [] };
        for (const e of sp) {
          if (e.ts < w.a || e.ts >= b) continue;
          const key = e.pid + '|' + e.tid, tn = tname.get(key) || 'tid' + e.tid, isMain = mainKeys.has(key);
          const q = ((o.byThread[isMain ? 'main' : tn] ||= {})[e.name] ||= { n: 0, ms: 0 }); q.n++; q.ms += e.dur / 1e3;
          if (/decode/i.test(e.name)) { o.decodes++; o.decodeMs += e.dur / 1e3; }
          if (e.name === 'RasterTask') { o.rasters++; o.rasterMs += e.dur / 1e3; }
          if (!isMain) continue;
          if (e.name === 'UpdateLayoutTree') { o.styles++; o.elems += e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0; }
          if (e.name === 'Layout') { o.layouts++; o.dirty += e.args?.beginData?.dirtyObjects ?? 0; }
          if (e.name === 'Paint') {
            o.paints++; const c = e.args?.data?.clip; const ar = c ? area(c) / 1e3 : 0; o.kpx += ar;
            const nm = await nameOf(e.args?.data?.nodeId); const z = (o.byPaint[nm] ||= { n: 0, kpx: 0 }); z.n++; z.kpx += ar;
          }
        }
        for (const [i, t] of sampT.entries()) {
          if (t < w.a || t >= b) continue;
          const n = nodes.get(prof.samples[i]); const cf = n?.callFrame; const d = (prof.timeDeltas[i + 1] ?? 0) / 1e3;
          const nm = cf ? `${cf.functionName || '(anon)'} ${cf.url ? cf.url.replace(/^https?:\/\/[^/]+/, '').split('/').pop() : ''}:${cf.lineNumber + 1}` : '?';
          if (/^\((idle|program|garbage collector)\)/.test(nm)) { o.js[nm.split(' ')[0]] = (o.js[nm.split(' ')[0]] || 0) + d; continue; }
          o.js[nm] = (o.js[nm] || 0) + d;
        }
        const wallA = w.a / 1e6, wallB = b / 1e6; // Network timestamps are seconds on the same monotonic clock
        o.reqs = reqs.slice(reqFrom).filter((r) => r.ts >= wallA && r.ts < wallB).map((r) => r.url);
        o.kpx = Math.round(o.kpx); o.decodeMs = +o.decodeMs.toFixed(1); o.rasterMs = +o.rasterMs.toFixed(1);
        for (const t of Object.values(o.byThread)) for (const [k, v] of Object.entries(t)) t[k] = { n: v.n, ms: +v.ms.toFixed(1) };
        for (const v of Object.values(o.byPaint)) v.kpx = Math.round(v.kpx);
        for (const k of Object.keys(o.js)) o.js[k] = +o.js[k].toFixed(1);
        run.windows.push(o);
        const mainTop = Object.entries(o.byThread.main || {}).sort((x, y) => y[1].ms - x[1].ms).slice(0, 8).map(([k, v]) => `${k} ${v.n}/${v.ms}`);
        const jsTop = Object.entries(o.js).filter(([k]) => !k.startsWith('(')).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`);
        const pTop = Object.entries(o.byPaint).sort((x, y) => y[1].kpx - x[1].kpx).slice(0, 5).map(([k, v]) => `${k}:${v.n}/${v.kpx}`);
        console.log(`${run.arm} L${load} ${o.id.padEnd(6)} styles ${o.styles} (${o.elems} el) layouts ${o.layouts} (${o.dirty} dirty) paints ${o.paints} / ${o.kpx} kpx | decodes ${o.decodes} ${o.decodeMs} ms raster ${o.rasters} ${o.rasterMs} ms | reqs ${o.reqs.length}`);
        console.log('   main:', mainTop.join(' | '));
        console.log('   js  :', jsTop.join(' | '));
        console.log('   paint:', pTop.join(' | '));
      }
      console.log(run.arm, 'L' + load, 'before', JSON.stringify(run.before), 'profileClock ok', run.profileClock.startInTrace, 'driver', run.driver ? JSON.stringify(run.driver.all) : '-');
    } catch (e) { run.error = String(e.stack || e.message || e); console.log(run.arm, 'error', run.error); }
    finally { await page.close().catch(() => {}); p.kill(); rmSync(st, { force: true }); res.runs.push(run); }
  }
} finally {
  res.endedAt = new Date().toISOString();
  const f = join(OUT, `first-open-chrome-${STAMP}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('WROTE', f);
}
