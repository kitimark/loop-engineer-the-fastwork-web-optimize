// compositor-morph (arch-compositor-morph): a copy of fix-end-morph's fixes/end-morph/em-sim.mjs (credit: fix-end-morph);
// changes: path depth, output under out/compositor-morph/, layer count + scroll-driven animation count per phase.
// Original header:
// end-morph (fix-end-morph, user T-204): the end-of-page morph in WebKit (Simulator), COUNTS ONLY (Simulator ms are
// never judged, F-084). Adapted from fixes/morph-gpu/close/close-cause-sim.mjs (wip Timeline, LayerTree paintCount diffs).
// Per arm (overlay dir[@css]): load, walk the page, then with WebKit Timeline + LayerTree on, rAF-stepped scrollTo phases
// (one scroll step per rAF, like em-chrome.mjs; no touch, so the 7d settle's 200 ms rest timer may fire after a phase):
//   approach  endStart - 1 ih -> endStart in 30 frames     open   m 0 -> 1 in N frames     restOpen   1.2 s
//   close     m 1 -> 0 in N frames                          restClosed 1.6 s (the header's 0.68 s width transition)
// Per phase: Timeline RenderingFrame count, and per frame Layout / RecalculateStyles / Paint (count, clip area) records,
// the top Paint rects, script records (FunctionCall/EventDispatch/TimerFire/FireAnimationFrame), and per composited
// layer the paintCount delta (LayerTree.layersForNode before/after the phase; layers named by element class).
// Run (functional Simulator session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-morph -- \
//     node tools/sim.mjs session --functional --owner fix-end-morph -- node fixes/end-morph/em-sim.mjs \
//     --arms <abs overlay dir>[@<css file>][,...] [--steps 40] [--label v92]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--arms') || '').split(',').filter(Boolean).map((x) => { const [dir, css] = x.split('@'); return { dir, css }; });
if (!ARMS.length) throw new Error('--arms <abs overlay dir>[@css][,...]');
const N = Number(arg('--steps', '40'));
const LABEL = arg('--label', 'v92');
const OUT = join(WT, 'out/compositor-morph'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...xs) - x), h: Math.round(Math.max(...ys) - y) }; };
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  const h = document.querySelector('header.start-selling-top-nav');
  return { t, max, ih: innerHeight, y: scrollY, endStart: max - t, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null, hdr: h ? h.className.replace(/svelte-\\w+/g, '').trim() : null,
    hdrH: h ? Math.round(h.getBoundingClientRect().height) : null, cm: document.documentElement.classList.contains('fw-cm'), sda: h ? h.getAnimations({ subtree: true }).filter((a) => a.timeline && a.timeline !== document.timeline).length : null }; })()`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * (i + 1) / n));
// rAF-stepped scroll; returns performance.now() at the first step (async: the phase runs after evaluate returns)
const RUN = (ys) => `(() => { const ys = ${JSON.stringify(ys)}; let k = 0; const f = () => { window.scrollTo({ top: ys[k], behavior: 'instant' }); k++; if (k < ys.length) requestAnimationFrame(f); else window.__emDone = performance.now(); };
  window.__emDone = 0; requestAnimationFrame(f); return performance.now(); })()`;

function phaseStats(recs, a, b) {
  const frames = []; const script = {};
  for (const r of recs) {
    if (r.type !== 'RenderingFrame') continue;
    const t = r.startTime * 1000; if (t < a || t >= b) continue;
    const o = { at: +(t - a).toFixed(1), paints: 0, kpx: 0, layouts: 0, styles: 0, composite: 0, rects: [] };
    const walk = (x) => {
      if (x.type === 'Paint') { o.paints++; if (x.data?.clip) { const q = box(x.data.clip); o.kpx += (q.w * q.h) / 1e3; o.rects.push(q); } }
      else if (x.type === 'Layout') o.layouts++;
      else if (x.type === 'RecalculateStyles') o.styles++;
      else if (x.type === 'Composite') o.composite++;
      else if (/^(FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|ObserverCallback|EvaluateScript)$/.test(x.type)) { const k = x.type + (x.data?.type ? ':' + x.data.type : '') + (x.data?.functionName ? ':' + x.data.functionName : ''); script[k] = (script[k] || 0) + 1; }
      for (const ch of x.children || []) walk(ch);
    };
    walk(r); o.kpx = Math.round(o.kpx); frames.push(o);
  }
  // rects: the biggest 6 per frame, keyed by size, counted over the phase
  const rectKinds = {};
  for (const f of frames) { for (const q of f.rects) { const k = `${q.w}x${q.h}@${q.x},${q.y}`; rectKinds[k] = (rectKinds[k] || 0) + 1; } delete f.rects; }
  const sum = (k) => frames.reduce((s, f) => s + f[k], 0);
  const med = (k) => { const s = frames.map((f) => f[k]).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  return { nFrames: frames.length, paints: sum('paints'), kpx: sum('kpx'), layouts: sum('layouts'), styles: sum('styles'), composite: sum('composite'),
    framesWithLayout: frames.filter((f) => f.layouts > 0).length, framesWithPaint: frames.filter((f) => f.paints > 0).length,
    median: { paints: med('paints'), kpx: med('kpx'), layouts: med('layouts'), styles: med('styles') },
    topRects: Object.fromEntries(Object.entries(rectKinds).sort((x, y) => y[1] - x[1]).slice(0, 14)), script: Object.fromEntries(Object.entries(script).sort((x, y) => y[1] - x[1]).slice(0, 14)), frames };
}

const res = { tool: 'fixes/compositor-morph/gates/cm-sim.mjs (from fix-end-morph em-sim.mjs)', label: LABEL, startedAt: new Date().toISOString(), steps: N, arms: [] };
for (const [i, arm] of ARMS.entries()) {
  const armCss = arm.css ? readFileSync(arm.css, 'utf8') : null;
  const st = join(OUT, `serve-ems-${i}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', arm.dir, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm: basename(arm.dir) + (arm.css ? '@' + basename(arm.css) : ''), cssSha: armCss ? sha(Buffer.from(armCss)) : null, phases: {} };
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(2000);
    if (armCss) await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'em-arm'; s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
    // applied check: #platform's filter at a test fade, the panel's filter/transform and the header width rule
    run.applied = await c.evaluate(`(() => { const p = document.querySelector('.start-selling-platform'); const old = p.style.getPropertyValue('--morph-fade');
      p.style.setProperty('--morph-fade', '0.5'); const pf = getComputedStyle(p).filter; old ? p.style.setProperty('--morph-fade', old) : p.style.removeProperty('--morph-fade');
      const pn = document.querySelector('header.start-selling-top-nav .start-selling-morph-panel'); const h = document.querySelector('header.start-selling-top-nav');
      return { armStyle: !!document.getElementById('em-arm'), platformFilterAtHalf: pf, panelFilter: pn ? getComputedStyle(pn).filter : null, panelTransform: pn ? getComputedStyle(pn).transform : null,
        pillW: h ? getComputedStyle(h).getPropertyValue('--pill-w') : null, safari: navigator.userAgent.replace(/.*Version\\/([\\d.]+).*/, '$1') }; })()`);
    console.log(basename(arm.dir) + (arm.css ? '@' + basename(arm.css) : ''), 'applied', JSON.stringify(run.applied));
    for (const f of [0.2, 0.4, 0.6, 0.8, 1]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(700); }
    let g = await c.evaluate(GEO);
    if (!g.t) throw new Error('no .fw-ms-end: the 7d mode is off in this build or device');
    run.geo0 = g;
    // warm-up: one open and close, then park before the approach
    await c.evaluate(`(window.scrollTo({ top: ${g.max}, behavior: 'instant' }), 0)`); await sleep(1500);
    await c.evaluate(`(window.scrollTo({ top: ${g.endStart}, behavior: 'instant' }), 0)`); await sleep(1500);
    await c.evaluate(`(window.scrollTo({ top: ${g.endStart - 2 * g.ih}, behavior: 'instant' }), 0)`); await sleep(1500);
    g = await c.evaluate(GEO);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await c.send('LayerTree.enable');
    const syncT = await c.evaluate(timelineSyncJs('ems-sync'));
    const names = new Map();
    const nameOf = async (l) => {
      if (l.pseudoElement) return `::${l.pseudoElement}`;
      if (l.isAnonymous) return '(anon)';
      if (!l.nodeId) return '(none)';
      if (names.has(l.nodeId)) return names.get(l.nodeId);
      let n = '?';
      try {
        const o = (await c.send('DOM.resolveNode', { nodeId: l.nodeId })).object;
        n = (await c.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: `function () { const k = typeof this.className === 'string' ? this.className : (this.className && this.className.baseVal) || ''; return (this.nodeName || '').toLowerCase() + (this.id ? '#' + this.id : '') + (k ? '.' + k.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : ''); }`, returnByValue: true })).result.value;
      } catch {}
      names.set(l.nodeId, n); return n;
    };
    const layers = async () => {
      const root = (await c.send('DOM.getDocument')).root.nodeId;
      const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
      return new Map(L.map((l) => [l.layerId, l]));
    };
    const diff = async (a, b) => {
      const out = [];
      for (const [id, l] of b) { const d = (l.paintCount || 0) - (a.get(id)?.paintCount || 0); if (d > 0 || !a.has(id)) out.push({ layer: await nameOf(l), d, isNew: !a.has(id), w: Math.round(l.bounds?.width || 0), h: Math.round(l.bounds?.height || 0) }); }
      const gone = []; for (const [id, l] of a) if (!b.has(id)) gone.push(await nameOf(l));
      return { nBefore: a.size, nAfter: b.size, painted: out.sort((x, y) => y.d - x.d).slice(0, 20), gone: gone.slice(0, 10) };
    };
    const waitDone = async () => { for (let k = 0; k < 100; k++) { const d = await c.evaluate('window.__emDone || 0'); if (d) return d; await sleep(100); } return null; };
    const phase = async (name, ys, restMs) => {
      const a = await layers();
      let t0, t1;
      if (ys) { t0 = await c.evaluate(RUN(ys)); t1 = await waitDone(); await sleep(150); }
      else { t0 = await c.evaluate('performance.now()'); await sleep(restMs); t1 = await c.evaluate('performance.now()'); }
      const b = await layers();
      run.phases[name] = { t0, t1, geo: await c.evaluate(GEO), layers: await diff(a, b) };
    };
    const { endStart, t, max, ih } = g;
    await phase('approach', lin(endStart - ih, endStart, 30));
    await phase('open', lin(endStart, max, N));
    await phase('restOpen', null, 1200);
    await phase('close', lin(max, endStart, N));
    await phase('restClosed', null, 1600);
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    await c.send('LayerTree.disable').catch(() => {});
    const syncTL = findTimeStamp(recs, 'ems-sync');
    if (syncTL == null) throw new Error('no sync');
    const off = syncTL * 1000 - syncT;
    for (const [name, ph] of Object.entries(run.phases)) {
      ph.tl = phaseStats(recs, ph.t0 + off, (ph.t1 ?? ph.t0) + off + (name.startsWith('rest') ? 0 : 50));
      const s = ph.tl;
      console.log(run.arm, name.padEnd(11), 'p', ph.geo.p, 'hdrH', ph.geo.hdrH, '| frames', s.nFrames, 'paints', s.paints, 'kpx', s.kpx, 'layouts', s.layouts, `(${s.framesWithLayout} fr)`, 'styles', s.styles,
        '| layers', ph.layers.nBefore, '->', ph.layers.nAfter, JSON.stringify(ph.layers.painted.slice(0, 8).map((x) => `${x.layer}${x.isNew ? '*' : ''}:${x.d} ${x.w}x${x.h}`)));
    }
    writeFileSync(join(OUT, `tl-ems-${i}-${STAMP}.json`), JSON.stringify({ offsetMs: off, recs }));
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(run.arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms.push(run);
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `em-sim-${LABEL}-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
