// morph-gpu rev 2 mechanism check in Chrome (fix-morph-gpu): does the reveal's setup leave the frame that starts a
// morph? Counts only (no timing is judged; trace durations are kept for reading, unthrottled). Headless Chrome 430x932
// DPR 3 mobile + touch. Per load: scroll to the end in 200 px steps, 2.5 s still (rev 2's __rvPrep runs after 300 ms),
// Tracing on (devtools.timeline + stack traces), the build's own M driver __fwMorphDrive({hold, cycles: 3}), Tracing off.
// Per open tween (O1, O3, O5; O3/O5 follow a full close, the phone's slow frames in P-092) and per close start, the trace
// is cut by the driver's rAF stamps (page clock via a user-timing mark): 'start' = [t(k-1), t(k)) where frame k is the
// first logged m > 0.001 (the switch-on frame's rendering), 'pre' the frame before it, 'next' the one after.
// Counted: UpdateLayoutTree (+ elementCount), Layout (+ dirtyObjects), forced ones (inside a JS event on the same
// thread: FunctionCall, FireAnimationFrame, TimerFire, EventDispatch, RunMicrotasks, v8.callFunction), Paint (+ area),
// PrePaint, Layerize, UpdateLayer, Commit. Layers: the newest LayerTree.layerTreeDidChange list before each open.
// Arms: M = best-build, R1 = rev 1 (rv-372b99478871), A = rev 2 without pre-promotion (newest rv2a-*), B = rev 2 (rv2b-*).
// Run (shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu \
//     -- node fixes/morph-gpu/rev2/tween-start-chrome.mjs [--order M,R1,A,B] [--hold 1500]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const hashOf = (dir, f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').slice(0, 12);
const newest = (re) => readdirSync(SNAP).filter((d) => re.test(d)).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const dirs = { M: join(SNAP, 'best-65052c4a3902'), R1: join(SNAP, 'rv-372b99478871'), A: process.env.RV2A || newest(/^rv2a-[0-9a-f]{12}$/), B: process.env.RV2B || newest(/^rv2b-[0-9a-f]{12}$/) };
const BUILDS = Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, { dir: d, js: hashOf(d, NODE), css: hashOf(d, CSS) }]));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = arg('--order', 'M,R1,A,B').split(',');
const HOLD = Number(arg('--hold', '1500')), CYCLES = 3;
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-gpu/rev2'); mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'blink.user_timing', 'v8'].join(',');
const JSEV = new Set(['FunctionCall', 'FireAnimationFrame', 'TimerFire', 'EventDispatch', 'RunMicrotasks', 'v8.callFunction', 'EvaluateScript']);
const COUNT = ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'Commit'];

async function serve(label, i) {
  const st = join(OUT, `serve-${tag}-${label}${i}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[label].dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url, st };
}
const area = (c) => (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]));

// complete events (X, or B/E paired per thread) as {name, ts, dur, tid, args}
function spans(ev) {
  const out = [], open = new Map();
  for (const e of ev) {
    if (e.ph === 'X') out.push({ name: e.name, ts: e.ts, dur: e.dur ?? 0, tid: e.tid, args: e.args });
    else if (e.ph === 'B') { const k = e.tid + '|' + e.name; (open.get(k) || open.set(k, []).get(k)).push(e); }
    else if (e.ph === 'E') { const k = e.tid + '|' + e.name, st = open.get(k)?.pop(); if (st) out.push({ name: e.name, ts: st.ts, dur: e.ts - st.ts, tid: e.tid, args: { ...st.args, ...e.args, endData: e.args?.endData } }); }
  }
  return out.sort((a, b) => a.ts - b.ts);
}
function windowCounts(sp, jsSpans, a, b) {
  const o = { styles: 0, elems: 0, layouts: 0, dirty: 0, forcedStyles: 0, forcedLayouts: 0, paints: 0, paintMpx: 0, prePaint: 0, layerize: 0, updateLayer: 0, commit: 0, durMs: {} };
  for (const e of sp) {
    if (e.ts < a || e.ts >= b) continue;
    if (COUNT.includes(e.name) || JSEV.has(e.name)) o.durMs[e.name] = +((o.durMs[e.name] || 0) + e.dur / 1000).toFixed(2);
    const forced = (e.name === 'UpdateLayoutTree' || e.name === 'Layout') && jsSpans.some((j) => j.tid === e.tid && j.ts <= e.ts && e.ts < j.ts + j.dur);
    if (e.name === 'UpdateLayoutTree') { o.styles++; o.elems += e.args?.elementCount ?? e.args?.beginData?.elementCount ?? e.args?.endData?.elementCount ?? 0; forced && o.forcedStyles++; }
    if (e.name === 'Layout') { o.layouts++; o.dirty += e.args?.beginData?.dirtyObjects ?? 0; forced && o.forcedLayouts++; }
    if (e.name === 'Paint') { o.paints++; const c = e.args?.data?.clip; if (c) o.paintMpx += area(c) / 1e6; }
    if (e.name === 'PrePaint') o.prePaint++;
    if (e.name === 'Layerize') o.layerize++;
    if (e.name === 'UpdateLayer') o.updateLayer++;
    if (e.name === 'Commit') o.commit++;
  }
  o.paintMpx = +o.paintMpx.toFixed(3);
  return o;
}

const profileDir = tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'rv2');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-morph-gpu rev2 tween-start-chrome', builds: BUILDS, browser: chrome.browser, hold: HOLD, cycles: CYCLES, note: 'counts judged; durMs unthrottled, for reading only', runs: [] };
const f = join(OUT, `tween-start-chrome-${tag}.json`);
try {
  for (let i = 0; i < ORDER.length; i++) {
    const b = ORDER[i]; const srv = await serve(b, i); const page = await cdp.newIsolatedPage();
    const R = { build: b, i };
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      R.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      if (R.served.js !== BUILDS[b].js || R.served.css !== BUILDS[b].css) { R.void = JSON.stringify(R.served); console.log('VOID', b, R.void); continue; }
      await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 2500); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      R.navAttrs = await page.eval(`(() => { const n = document.querySelector('header.start-selling-top-nav'); return { rvp: n.hasAttribute('data-fw-rvp'), rv: n.hasAttribute('data-fw-rv'), dark: !!n.querySelector(':scope > .fw-rv-dark'), glass: !!document.querySelector('.fw-rv-glass') }; })()`);
      const layerLists = [];
      const offL = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange') layerLists.push({ at: Date.now(), n: m.params.layers ? m.params.layers.length : null }); });
      await page.send('LayerTree.enable').catch((e) => { R.layerTreeError = String(e.message || e); });
      const ev = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      const syncT = await page.eval(`performance.mark('rv2-sync').startTime`);
      const wall0 = Date.now(), page0 = await page.eval('performance.now()');
      await page.eval(`(window.__fwMorphDrive({ hold: ${HOLD}, cycles: ${CYCLES} }), 1)`);
      let md = null; for (let k = 0; k < 300 && !md; k++) { await sleep(100); md = await page.eval('window.__fwMD'); }
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      await page.send('Tracing.end'); await done; off(); offL();
      await page.send('LayerTree.disable').catch(() => {});
      const d = JSON.parse(md), fr = d.frames;
      const mk = ev.find((e) => e.name === 'rv2-sync');
      if (!mk) { R.error = 'no rv2-sync mark'; console.log(b, i, R.error); continue; }
      const toTs = (pageMs) => (pageMs - syncT) * 1000 + mk.ts;
      const sp = spans(ev), jsSpans = sp.filter((e) => JSEV.has(e.name));
      R.tweens = [];
      let k = 0;
      for (let q = 2; q + 1 < fr.length; q++) {
        const pm = fr[q - 1][3], m = fr[q][3];
        const kind = pm <= 0.001 && m > 0.001 ? 'open' : pm >= 0.999 && m < 0.999 ? 'close' : null;
        if (!kind) continue;
        k++;
        const w = (x, y) => windowCounts(sp, jsSpans, toTs(fr[x][0]), toTs(fr[y][0]));
        // layers: newest list before the 'pre' frame's start (page clock -> wall clock)
        const wallPre = wall0 + (fr[q - 2][0] - page0);
        const L = layerLists.filter((l) => l.at <= wallPre).at(-1);
        R.tweens.push({ id: (kind === 'open' ? 'O' : 'C') + k, kind, m: m, dt: fr[q][1], pre: w(q - 2, q - 1), start: w(q - 1, q), next: w(q, q + 1), layersBefore: L ? L.n : null });
      }
      R.driver = { moving: d.moving, atZero: d.atZero, atOne: d.atOne };
      for (const t of R.tweens) console.log(b, i, t.id, 'start', JSON.stringify({ s: t.start.styles, e: t.start.elems, fS: t.start.forcedStyles, l: t.start.layouts, fL: t.start.forcedLayouts, dirty: t.start.dirty, p: t.start.paints, mpx: t.start.paintMpx, lz: t.start.layerize, layers: t.layersBefore }));
    } catch (e) { R.error = String(e.stack || e.message || e); console.log(b, i, 'error', R.error); }
    finally { await page.close().catch(() => {}); srv.proc.kill(); rmSync(srv.st, { force: true }); res.runs.push(R); writeFileSync(f, JSON.stringify(res, null, 1)); }
  }
} finally {
  writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', f);
}
