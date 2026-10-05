// end-morph-p1 (fix-end-morph-p1): copy of fix-end-morph's fixes/end-morph/em-chrome.mjs, with credit. Changes: output in
// out/end-morph-p1/; --overlay defaults to out/em1/v9f; an untraced pass at the end samples #platform's computed opacity
// in every frame of a stepped open and close (rev 3's guard: never 1 while the morph moves; counts of frames at >= 1).
// Original header:
// end-morph (fix-end-morph, user T-204): where the end-of-page morph's frames go on a build, Chrome, COUNTS ONLY.
// Headless Chrome 430 x H DPR 3, mobile + touch, hover:none / pointer:coarse (the 7d touch-phone gate), no CPU throttle,
// no timing judged. One scroll step per rAF (scrollTo inside the probe's rAF), each frame marked with console.timeStamp,
// so the trace splits into one window per frame. Phases (touch held unless named "lift"):
//   approach  y from endStart - 1.0 ih to endStart (m = 0), the sticky #platform rising into place
//   open      m 0 -> 1 in N steps        restOpen  N frames at m 1, no scroll
//   close     m 1 -> 0 in N steps        restClosed N frames at m 0
//   liftOpen  m 0 -> 0.45 in N/2 steps, lift (touchEnd), then 1.5 s (the 7d settle to open)
//   liftClose m 1 -> 0.55 in N/2 steps, lift, then 1.5 s (the settle to closed)
//   tb        (--toolbar) at m 0, 0.5 (held), 1: control window, height step H -> H2, control, step back (iOS toolbar)
// Per frame window: UpdateLayoutTree n + elements restyled, Layout n + dirty/total objects + roots, PrePaint, Paint n + area
// + owner node, RasterTask, FunctionCall (by function@line), events, rAF, timers, observer callbacks, forced (JS-stack)
// recalcs/layouts, and invalidation-tracking reasons (style, layout, paint) by node. A CPU profile (100 us) over
// approach..restClosed gives the call tree (self samples by function@line).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-morph -- \
//     node fixes/end-morph/em-chrome.mjs [--overlay fixes/end-morph/overlay] [--h 775] [--h2 815] [--steps 40] [--toolbar]
//     [--label v92] [--css <file appended as <style>>]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const H = Number(arg('--h', '775')), H2 = Number(arg('--h2', '815'));
const N = Number(arg('--steps', '40'));
const TOOLBAR = argv.includes('--toolbar');
const LABEL = arg('--label', 'x');
const OVERLAY = resolve(WT, arg('--overlay', 'out/em1/v9f'));
const CSSX = arg('--css', null); const CSSTXT = CSSX ? readFileSync(resolve(WT, CSSX), 'utf8') : null;
const BASE = join(mirrorHome(), 'site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/end-morph-p1'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline.invalidationTracking', 'disabled-by-default-blink.invalidation', 'blink.user_timing'].join(',');

async function serve() {
  const st = join(OUT, `serve-${tag}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', OVERLAY, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error('server did not start'); }
  return { proc: p, url: s.url };
}
const metricsFor = (h) => ({ width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
const touch = (page, type) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 215, y: 400, id: 1 }] });

const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  const hd = document.querySelector('header.start-selling-top-nav');
  return { y: scrollY, ih: innerHeight, t, max, endStart: max - t, m: t ? +((scrollY - (max - t)) / t).toFixed(4) : null, fwms: document.documentElement.classList.contains('fw-ms'),
    hdr: hd ? hd.className.replace(/svelte-\\w+/g, '').trim() : null, morph: hd ? getComputedStyle(hd).getPropertyValue('--morph') : null }; })()`;

// rAF-stepped scroll: ys[] one per frame, each frame marked before its scrollTo; then `rest` marked frames with no scroll
const RUN = (phase, ys, rest) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; let k = 0; const R = ${rest};
  const f = () => { if (k < ys.length) { console.timeStamp('em:${phase}:' + k); window.scrollTo({ top: ys[k], behavior: 'instant' }); k++; requestAnimationFrame(f); }
    else if (k < ys.length + R) { console.timeStamp('em:${phase}:' + k); k++; requestAnimationFrame(f); } else { console.timeStamp('em:${phase}:end'); res(k); } };
  requestAnimationFrame(f); })`;
const MARKS = (phase, n) => `new Promise((res) => { let k = 0; const f = () => { console.timeStamp('em:${phase}:' + k); k++; if (k < ${n}) requestAnimationFrame(f); else { console.timeStamp('em:${phase}:end'); res(k); } }; requestAnimationFrame(f); })`;
const ANIMS = `document.getAnimations().filter((a) => a.playState === 'running' && !(a.effect && a.effect.getComputedTiming().iterations === Infinity)).map((a) => { const t = a.effect && a.effect.target; const k = t ? (t.tagName.toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).replace(/svelte-\\w+/g, '').trim().split(/\\s+/).slice(0, 2).join('.')) : '?';
  return [a.constructor.name, a.transitionProperty || a.animationName || (a.effect && a.effect.getKeyframes().map((f) => Object.keys(f).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)).join('+'))[0]) || '?', k, Math.round(a.effect.getComputedTiming().duration), Math.round(a.currentTime)].join(' '); })`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * (i + 1) / n));

const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
const isDur = (e) => e.ph === 'X' || e.ph === 'B';
const short = (s, n = 90) => String(s ?? '').replace(/svelte-\w+/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const fnKey = (d) => d ? `${d.functionName || '(anon)'}@${(d.url || '').split('/').pop()}:${(d.lineNumber ?? -1) + 1}` : '?';
const topStack = (st) => { if (!Array.isArray(st) || !st.length) return null; const f = st[0]; return `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${(f.lineNumber ?? -1) + 1}`; };
const stackPath = (st) => Array.isArray(st) ? st.slice(0, 4).map((f) => `${f.functionName || '(anon)'}:${(f.lineNumber ?? -1) + 1}`).join(' < ') : null;

function windowStats(evs) {
  const w = { forcedStyleEls: 0, forcedDirty: 0, invNames: {}, style: 0, styleEls: 0, forcedStyle: 0, layout: 0, dirty: 0, total: 0, forcedLayout: 0, prePaint: 0, paint: 0, paintArea: 0, raster: 0, layerize: 0, commit: 0,
    raf: 0, timer: 0, fn: {}, ev: {}, obs: 0, paintBy: {}, inv: {}, forced: {}, layoutRoots: 0 };
  for (const e of evs) {
    const n = e.name, a = e.args || {};
    if (n === 'UpdateLayoutTree' && isDur(e)) { w.style++; w.styleEls += a.elementCount ?? a.endData?.elementCount ?? 0; const st = a.beginData?.stackTrace; if (st && st.length) { w.forcedStyle++; w.forcedStyleEls += a.elementCount ?? a.endData?.elementCount ?? 0; const k = 'style ' + stackPath(st); w.forced[k] = (w.forced[k] || 0) + 1; } }
    else if (n === 'Layout' && isDur(e)) { w.layout++; w.dirty += a.beginData?.dirtyObjects ?? 0; w.total = Math.max(w.total, a.beginData?.totalObjects ?? 0); w.layoutRoots += (a.endData?.layoutRoots || []).length;
      const st = a.beginData?.stackTrace; if (st && st.length) { w.forcedLayout++; w.forcedDirty += a.beginData?.dirtyObjects ?? 0; const k = 'layout ' + stackPath(st); w.forced[k] = (w.forced[k] || 0) + 1; } }
    else if (n === 'PrePaint' && isDur(e)) w.prePaint++;
    else if (n === 'Paint' && isDur(e)) { w.paint++; const d = a.data || {}; const b = d.clip ? box(d.clip) : null; const ar = b && b.w * b.h < 1e8 ? b.w * b.h : 0; w.paintArea += ar; const k = d.nodeId || 0; const p = (w.paintBy[k] ||= { n: 0, area: 0 }); p.n++; p.area += ar; }
    else if (n === 'RasterTask' && isDur(e)) w.raster++;
    else if (n === 'Layerize' && isDur(e)) w.layerize++;
    else if (n === 'Commit' && isDur(e)) w.commit++;
    else if (n === 'FireAnimationFrame' && isDur(e)) w.raf++;
    else if (n === 'TimerFire' && isDur(e)) w.timer++;
    else if (n === 'FunctionCall' && isDur(e)) { const k = fnKey(a.data); w.fn[k] = (w.fn[k] || 0) + 1; }
    else if (n === 'EventDispatch' && isDur(e)) { const k = a.data?.type || '?'; w.ev[k] = (w.ev[k] || 0) + 1; }
    else if (/IntersectionObserver|ResizeObserver/.test(n) && isDur(e)) w.obs++;
    if (/nvalidat/.test(n)) w.invNames[n] = (w.invNames[n] || 0) + 1;
    if (/InvalidationTracking$/.test(n)) { const d = a.data || {}; const k = `${n.replace('InvalidationTracking', '')} | ${short(d.reason || d.invalidationList?.[0]?.classes || '?', 40)} | ${short(d.nodeName, 60)}${d.extraData ? ' | ' + short(d.extraData, 40) : ''}`; w.inv[k] = (w.inv[k] || 0) + 1; }
  }
  return w;
}

function splitPhase(ev, phase) {
  const marks = ev.filter((e) => e.name === 'TimeStamp' && (e.args?.data?.message || '').startsWith(`em:${phase}:`)).map((e) => ({ ts: e.ts, msg: e.args.data.message })).sort((a, b) => a.ts - b.ts);
  const wins = [];
  for (let i = 0; i + 1 < marks.length; i++) { const a = marks[i].ts, b = marks[i + 1].ts; wins.push(windowStats(ev.filter((e) => e.ts >= a && e.ts < b && e.name !== 'TimeStamp'))); }
  return wins;
}

function summarize(wins) {
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const sum = (k) => wins.reduce((s, w) => s + w[k], 0);
  const merge = (k) => { const o = {}; for (const w of wins) for (const [x, v] of Object.entries(w[k])) o[x] = (o[x] || 0) + (typeof v === 'number' ? v : v.n); return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25)); };
  const paintBy = {}; for (const w of wins) for (const [x, v] of Object.entries(w.paintBy)) { const p = (paintBy[x] ||= { n: 0, area: 0 }); p.n += v.n; p.area += v.area; }
  return { frames: wins.length,
    perFrameMedian: Object.fromEntries(['style', 'styleEls', 'layout', 'dirty', 'prePaint', 'paint', 'paintArea', 'raster', 'raf'].map((k) => [k, Math.round(med(wins.map((w) => w[k])))])),
    totals: Object.fromEntries(['forcedStyleEls', 'forcedDirty', 'style', 'styleEls', 'forcedStyle', 'layout', 'dirty', 'forcedLayout', 'layoutRoots', 'prePaint', 'paint', 'paintArea', 'raster', 'layerize', 'commit', 'raf', 'timer', 'obs'].map((k) => [k, Math.round(sum(k))])),
    maxTotalObjects: Math.max(0, ...wins.map((w) => w.total)),
    fn: merge('fn'), ev: merge('ev'), invNames: merge('invNames'), inv: merge('inv'), forced: merge('forced'), paintBy,
    series: wins.map((w) => [w.style, w.styleEls, w.layout, w.dirty, w.paint, Math.round(w.paintArea / 1000), w.raster]) };
}

const srv = await serve();
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'em'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/end-morph-p1/em-chrome.mjs (from fix-end-morph)', label: LABEL, browser: chrome.browser, h: H, h2: H2, steps: N, overlay: OVERLAY, css: CSSX, cssSha: CSSTXT ? sha(Buffer.from(CSSTXT)) : null, phases: {}, nodeNames: {} };
try {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', metricsFor(H));
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await page.send('Network.enable');
  await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
  res.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSSF}').then((r) => r.text())`))) };
  if (CSSTXT) await page.eval(`(() => { const s = document.createElement('style'); s.id = 'em-arm'; s.textContent = ${JSON.stringify(CSSTXT)}; document.head.appendChild(s); return 1; })()`);
  console.log('served', JSON.stringify(res.served));
  // walk the page once (lazy sections, morph IO, panel mount), come back near the end
  await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
  let g = await page.eval(GEO); res.geo0 = g; console.log('geo', JSON.stringify(g));
  await page.eval(`(window.scrollTo({ top: ${g.endStart - 2 * g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
  g = await page.eval(GEO);
  const { endStart, t, max } = g;

  const ev = []; const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
  await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 100 });
  await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
  await sleep(300);
  await page.send('Profiler.start');
  await touch(page, 'touchStart');
  const geos = {};
  await page.eval(RUN('approach', lin(endStart - g.ih, endStart, 30), 0), { timeout: 30000 }); geos.approach = await page.eval(GEO);
  await page.eval(RUN('open', lin(endStart, max, N), 0), { timeout: 30000 }); geos.open = await page.eval(GEO);
  await page.eval(MARKS('restOpen', N), { timeout: 30000 }); geos.restOpen = await page.eval(GEO);
  await page.eval(RUN('close', lin(max, endStart, N), 0), { timeout: 30000 }); geos.close = await page.eval(GEO);
  res.animsAfterClose = await page.eval(ANIMS);
  await page.eval(MARKS('restClosed', N), { timeout: 30000 }); geos.restClosed = await page.eval(GEO);
  const prof = (await page.send('Profiler.stop')).profile;
  // released: the 7d settle
  await page.eval(RUN('liftOpenDrag', lin(endStart, endStart + 0.45 * t, N / 2), 0), { timeout: 30000 });
  await touch(page, 'touchEnd');
  await page.eval(MARKS('liftOpen', 90), { timeout: 30000 }); geos.liftOpen = await page.eval(GEO);
  await sleep(800);
  await touch(page, 'touchStart');
  await page.eval(RUN('liftCloseDrag', lin(max, max - 0.45 * t, N / 2), 0), { timeout: 30000 });
  await touch(page, 'touchEnd');
  await page.eval(MARKS('liftClose', 90), { timeout: 30000 }); geos.liftClose = await page.eval(GEO);
  await sleep(800);
  const tbPhases = [];
  if (TOOLBAR) {
    for (const [pos, y, hold] of [['m0', endStart, false], ['mhalf', endStart + t / 2, true], ['m1', max, false]]) {
      if (hold) await touch(page, 'touchStart');
      await page.eval(`new Promise((r) => { window.scrollTo({ top: ${Math.round(y)}, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(() => r(1))); })`);
      await sleep(hold ? 400 : 1500);
      geos['tb_' + pos] = await page.eval(GEO);
      for (const [kind, toH] of [['ctlA', null], ['up', H2], ['ctlB', null], ['down', H]]) {
        const ph = `tb_${pos}_${kind}`; tbPhases.push(ph);
        if (toH) await page.send('Emulation.setDeviceMetricsOverride', metricsFor(toH));
        await page.eval(MARKS(ph, 30), { timeout: 30000 });
        await sleep(200); // debounced resize jobs (120 ms) land in the trace but outside the marks: reported as "tail"
      }
      if (hold) await touch(page, 'touchEnd');
    }
  }
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 90000);
  await page.send('Tracing.end'); await done; offT();
  res.geos = geos;
  for (const ph of ['approach', 'open', 'restOpen', 'close', 'restClosed', 'liftOpenDrag', 'liftOpen', 'liftCloseDrag', 'liftClose', ...tbPhases]) {
    const wins = splitPhase(ev, ph); res.phases[ph] = summarize(wins);
    const s = res.phases[ph]; console.log(ph.padEnd(14), 'frames', s.frames, 'median/frame', JSON.stringify(s.perFrameMedian), 'forced', s.totals.forcedStyle, s.totals.forcedLayout);
  }
  // call tree from the CPU profile: self and total samples by function@line
  const nodes = new Map(prof.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const self = new Map(); for (const s of prof.samples) self.set(s, (self.get(s) || 0) + 1);
  const key = (n) => { const c = n.callFrame; return `${c.functionName || '(anon)'}@${(c.url || '').split('/').pop() || c.url}:${c.lineNumber + 1}`; };
  const selfBy = {}, totalBy = {};
  for (const [id, cnt] of self) { const n = nodes.get(id); selfBy[key(n)] = (selfBy[key(n)] || 0) + cnt; const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const k = key(nodes.get(x)); if (!seen.has(k)) { seen.add(k); totalBy[k] = (totalBy[k] || 0) + cnt; } } }
  const top = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
  res.profile = { samples: prof.samples.length, intervalUs: 100, self: top(selfBy, 40), total: top(totalBy, 60) };
  // name paint-owner nodes
  const ids = new Set(); for (const s of Object.values(res.phases)) for (const k of Object.keys(s.paintBy)) ids.add(k);
  await page.send('DOM.getDocument', { depth: 0 });
  for (const k of ids) { if (!Number(k)) { res.nodeNames[k] = '(none)'; continue; }
    try { const { node } = await page.send('DOM.describeNode', { backendNodeId: Number(k) }); const at = node.attributes || []; const o = {}; for (let i = 0; i < at.length; i += 2) o[at[i]] = at[i + 1];
      res.nodeNames[k] = `${node.localName || node.nodeName}${o.id ? '#' + o.id : ''}${o.class ? '.' + o.class.split(/\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 3).join('.') : ''}`; } catch { res.nodeNames[k] = '?'; } }
  // rev 3's guard (untraced, after the trace): #platform's computed opacity in every frame of a stepped open, a rest at
  // m 1, a stepped close and a rest at m 0 (touch held). Each sample is read in the rAF after the step's scroll.
  await touch(page, 'touchStart');
  await page.eval(`(window.scrollTo({ top: ${endStart}, behavior: 'instant' }), 1)`); await sleep(800);
  const OPS = (ys) => `new Promise((res) => { const ys = ${JSON.stringify(ys)}; const p = document.querySelector('.start-selling-platform'); const out = []; let k = 0;
    const f = () => { if (k > 0) out.push([Math.round(scrollY), +getComputedStyle(p).opacity, p.style.getPropertyValue('--morph-fade')]); if (k < ys.length) { window.scrollTo({ top: ys[k], behavior: 'instant' }); k++; requestAnimationFrame(f); } else res(JSON.stringify(out)); };
    requestAnimationFrame(f); })`;
  const ys = [...lin(endStart, max, N), ...Array(10).fill(max), ...lin(max, endStart, N), ...Array(10).fill(endStart)];
  const smp = JSON.parse(await page.eval(OPS(ys), { timeout: 60000 }));
  await touch(page, 'touchEnd');
  const ops = smp.map((s) => s[1]);
  res.platformOpacity = { frames: smp.length, atOrAbove1: ops.filter((o) => o >= 1).length, min: Math.min(...ops), max: Math.max(...ops),
    fadeAtOrAbove1: smp.filter((s) => +s[2] >= 1).length, distinct: [...new Set(ops)].length, samples: smp };
  console.log('platform opacity', JSON.stringify({ ...res.platformOpacity, samples: undefined }));
  await page.close();
} finally {
  const f = join(OUT, `em-${LABEL}-${H}-${tag}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); srv.proc.kill();
  console.log('wrote', f);
}
