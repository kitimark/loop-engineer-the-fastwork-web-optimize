// cd-strip WebKit mechanism counts on the iOS Simulator (counts only; Simulator ms never count, F-084).
// Adapted from de-countdown's fixes/countdown-faces/x1.mjs (install, Timeline summary, LayerTree census).
// Per arm, one page load:
//   1. top: hero clock visible and rolling. LayerTree census before/after a tick-aligned 4 s Timeline window: digit
//      layers (.face or .strip), their backing memory, paintCount deltas; Timeline Paint records by size class
//      (digit-sized: <= 1.5 x the digit box; strip-sized: digit width, 1.5-12 digit heights).
//   2. morph: at the end pin, the M driver (__fwMorphDrive, hold 2000, 2 cycles) under Timeline. Driver frames are
//      mapped onto Timeline time through a console.timeStamp calibration; per forward/reverse tween, the share of
//      rendering frames in the first 450 ms that carry a clock-sized Paint (P-017's measure, fix-nav-morph's ask), and
//      the same share during the holds at m = 1 (the roll at the pin). LayerTree census at the m = 1 hold (second
//      drive, no Timeline) and at m = 0 (scene paused).
// Usage (functional session, shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner cd-strip -- \
//     node tools/sim.mjs session --functional --owner cd-strip -- node fixes/cd-strip/sim.mjs st6rb2,strip,strip-a
// Arms are served from immutable copies out/cd-strip/snap/<arm> (hash-checked; a mismatch is VOID, exit 3).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/cd-strip/sim'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/cd-strip/snap');
const ARMS = (process.argv[2] || 'st6rb2,strip,strip-a').split(',');
const WIN = 4000;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const DIGITSEL = '.face.svelte-1quva9c, .strip.svelte-1quva9c, .cell.svelte-1quva9c';
const HEROSEL = '.hero-copy [role=timer] .face.svelte-1quva9c, .hero-copy [role=timer] .strip.svelte-1quva9c, .hero-copy [role=timer] .cell.svelte-1quva9c';
// SIM_PHASES (default top,morph): top = idle rolls at y 0; scroll = one scroll out of the hero and back (F-142 re-entry); morph = the pin
const PHASES = (process.env.SIM_PHASES || 'top,morph').split(',');

const INSTALL = `(() => {
  const hero = document.querySelector('.hero-copy [role=timer]'); const nums = [...hero.querySelectorAll('.number')];
  const X = window.__cs = { ticks: 0 };
  new MutationObserver(() => { X.ticks++; }).observe(nums[nums.length - 1], { attributes: true, attributeFilter: ['data-value'] });
  X.geom = (sel) => { const t = document.querySelector(sel); if (!t) return null; const d = t.querySelector('.digit').getBoundingClientRect(), r = t.getBoundingClientRect();
    return { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, dw: d.width, dh: d.height, timer: [r.left, r.top, r.width, r.height], ua: navigator.userAgent }; };
  return 'ok'; })()`;
// fix-nav-morph's pause-rule question: is the panel clock inside the paused scene, and what will-change does a strip get?
const ELPROBE = `(() => { const p = document.querySelector('.start-selling-morph-panel [role=timer]'); if (!p) return null;
  const s = p.querySelector('.strip.svelte-1quva9c, .face.svelte-1quva9c'); const sc = s && s.closest('[data-start-selling-scene]'); const panel = p.closest('.start-selling-morph-panel');
  const cs = s && getComputedStyle(s), ps = panel && getComputedStyle(panel);
  return { el: s && s.className, sceneAncestor: sc ? (sc.id || sc.className).toString().slice(0, 60) : null, scene: sc ? sc.dataset.startSellingScene : null,
    willChange: cs && cs.willChange, transform: cs && cs.transform,
    panelTransform: ps && ps.transform, panelWillChange: ps && ps.willChange, panelOpacity: ps && ps.opacity, panelRect: panel && [...Object.values(panel.getBoundingClientRect().toJSON())].map((v) => Math.round(v)) }; })()`;
const QB = (q) => (q && q.length >= 8 ? { x: Math.min(q[0], q[2], q[4], q[6]), y: Math.min(q[1], q[3], q[5], q[7]), w: Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h: Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]) } : null);
const sizeClass = (q, g) => (!q || !g ? 'other' : q.w <= 1.5 * g.dw && q.h <= 1.5 * g.dh ? 'digit' : q.w <= 1.5 * g.dw && q.h <= 12 * g.dh ? 'strip' : 'other');
const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
// flatten: every record with its RenderingFrame index (or -1)
function flatten(records) {
  const out = []; let fi = -1; const frames = [];
  const SCRIPT = /^(FireAnimationFrame|TimerFire|FunctionCall|EventDispatch|EvaluateScript)$/;
  const walk = (r, f, inScript = false) => { out.push({ type: r.type, start: r.startTime * 1000, dur: ms(r), data: r.data, frame: f, inScript }); for (const c of r.children || []) walk(c, f, inScript || SCRIPT.test(r.type)); };
  for (const r of records.slice().sort((a, b) => a.startTime - b.startTime)) { if (r.type === 'RenderingFrame') { fi = frames.length; frames.push({ start: r.startTime * 1000, dur: ms(r) }); walk(r, fi); } else walk(r, -1); }
  return { recs: out, frames };
}
function counts(recs, g) {
  // script: top-level script records (rAF callbacks, timers, other function calls, events) and their summed Sim ms
  // (orientation only, F-084)
  const c = { RecalculateStyles: 0, Layout: 0, Paint: 0, Composite: 0, digitPaint: 0, stripPaint: 0, otherPaint: 0, paintAreaPx: 0,
    FireAnimationFrame: 0, TimerFire: 0, FunctionCall: 0, EventDispatch: 0, scriptMs: 0 };
  for (const r of recs) { if (r.type in c) c[r.type]++; if (/^(FireAnimationFrame|TimerFire|FunctionCall|EventDispatch|EvaluateScript)$/.test(r.type) && !r.inScript) { c.scriptMs += r.dur; c.scriptTop = (c.scriptTop || 0) + 1; } if (r.type === 'Paint') { const q = QB(r.data?.clip); c[sizeClass(q, g) + 'Paint']++; if (q) c.paintAreaPx += Math.round(q.w * q.h); } }
  c.scriptMs = Math.round(c.scriptMs * 10) / 10;
  return c;
}
async function layers(c) {
  await c.send('LayerTree.enable');
  try {
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const dn = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: DIGITSEL })).nodeIds);
    const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
    const D = L.filter((l) => dn.has(l.nodeId));
    const hn = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: HEROSEL })).nodeIds);
    // why WebKit composites the first non-hero digit layer (panel clock), if any: LayerTree.reasonsForCompositingLayer
    const pl = D.find((l) => !hn.has(l.nodeId));
    const panelReasons = pl ? await c.send('LayerTree.reasonsForCompositingLayer', { layerId: pl.layerId }).then((x) => Object.keys(x.compositingReasons || {}).filter((k) => x.compositingReasons[k]).join(',')).catch((e) => 'error ' + (e.message || JSON.stringify(e))) : null;
    // strip-rw: is the cell wrapper (.cdwrap) composited? (it must not be: a wrapper layer at -m*c would bring back the
    // large cancelling offsets in the layer tree)
    const wn = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: '.cdwrap.svelte-1quva9c' })).nodeIds);
    const WL = L.filter((l) => wn.has(l.nodeId));
    const wrap = { nodes: wn.size, layers: WL.length, reasons: WL[0] ? await c.send('LayerTree.reasonsForCompositingLayer', { layerId: WL[0].layerId }).then((x) => Object.keys(x.compositingReasons || {}).filter((k) => x.compositingReasons[k]).join(',')).catch((e) => 'error ' + (e.message || JSON.stringify(e))) : null };
    const scene = await c.evaluate(`document.querySelector('[data-start-selling-scene]')?.dataset.startSellingScene ?? null`);
    return { t: Date.now(), scene, panelReasons, layers: L.length, digitNodes: dn.size, digitLayers: D.length, memory: L.reduce((a, l) => a + (l.memory || 0), 0), digitMemory: D.reduce((a, l) => a + (l.memory || 0), 0),
      digitBounds: D.slice(0, 3).map((l) => [l.bounds?.width, l.bounds?.height]), paint: Object.fromEntries(L.map((l) => [l.layerId, l.paintCount || 0])), digitIds: D.map((l) => l.layerId), heroIds: D.filter((l) => hn.has(l.nodeId)).map((l) => l.layerId),
      // hero digit layers by composited size: count, how many hold a backing store, MB, bytes per device px (4 = 8-bit RGBA; the
      // protocol names no backing format, so this ratio is the only hint)
      heroBySize: (() => { const H = D.filter((l) => hn.has(l.nodeId)); const dpr = 3; const g = {};
        for (const l of H) { const b = l.compositedBounds || l.bounds || {}; const k = `${Math.round(b.width)}x${Math.round(b.height)}`; const e = (g[k] ||= { n: 0, backed: 0, memory: 0, px: 0 });
          e.n++; if (l.memory > 0) { e.backed++; e.memory += l.memory; e.px += b.width * b.height * dpr * dpr; } }
        return Object.fromEntries(Object.entries(g).map(([k, e]) => [k, { n: e.n, backed: e.backed, MB: MB(e.memory), bytesPerDevPx: e.px ? Math.round((e.memory / e.px) * 100) / 100 : null }])); })(),
      heroMemoryMB: MB(D.filter((l) => hn.has(l.nodeId)).reduce((a, l) => a + (l.memory || 0), 0)), heroBacked: D.filter((l) => hn.has(l.nodeId) && l.memory > 0).length, wrap };
  } finally { await c.send('LayerTree.disable').catch(() => {}); }
}
const MB = (x) => Math.round(x / 1e4) / 100;
const ltDelta = (a, b) => ({ layers: [a.layers, b.layers], digitNodes: [a.digitNodes, b.digitNodes], digitLayers: [a.digitLayers, b.digitLayers], memoryMB: [MB(a.memory), MB(b.memory)], digitMemoryMB: [MB(a.digitMemory), MB(b.digitMemory)], digitBounds: b.digitBounds,
  digitPaints: b.digitIds.reduce((s, id) => s + Math.max(0, (b.paint[id] || 0) - (a.paint[id] || 0)), 0), digitPaintedLayers: b.digitIds.filter((id) => (b.paint[id] || 0) > (a.paint[id] || 0)).length,
  heroLayers: b.heroIds.length, heroPaints: b.heroIds.reduce((s, id) => s + Math.max(0, (b.paint[id] || 0) - (a.paint[id] || 0)), 0), heroPaintsPerLayer: b.heroIds.map((id) => (b.paint[id] || 0) - (a.paint[id] || 0)).join(' ') });
const snapL = (l) => ({ scene: l.scene, panelReasons: l.panelReasons, wrap: l.wrap, layers: l.layers, digitNodes: l.digitNodes, digitLayers: l.digitLayers, memoryMB: MB(l.memory), digitMemoryMB: MB(l.digitMemory), digitBounds: l.digitBounds });

async function sequence(c) {
  const ev = (e) => c.evaluate(e);
  const poll = async (expr, tmo = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < tmo) { const v = await ev(expr); if (v) return v; await sleep(200); } throw new Error('timeout ' + expr); };
  await ev(INSTALL);
  const res = { hero: await ev(`__cs.geom('.hero-copy [role=timer]')`) };
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.send('Page.disable'); await c.send('Page.enable');
  await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  // 1. top
  await ev("(scrollTo({ top: 0, behavior: 'instant' }), 0)"); await sleep(2000);
  const a0 = await layers(c);
  const k0 = await ev('__cs.ticks'); const tw = Date.now(); while ((await ev('__cs.ticks')) === k0 && Date.now() - tw < 2500) await sleep(40); await sleep(650);
  recs = []; const kw = await ev('__cs.ticks');
  await c.send('Timeline.start', { maxCallStackDepth: 1 }); await sleep(WIN); await c.send('Timeline.stop');
  const ticks = (await ev('__cs.ticks')) - kw; await sleep(1200);
  const a1 = await layers(c);
  const ft = flatten(recs);
  // the same LayerTree window with Timeline off (Timeline start/stop could itself repaint)
  await sleep(WIN); const a2 = await layers(c);
  // probe artefact check: two censuses 100 ms apart (no roll can land in between unless a tick does)
  await sleep(100); const a3 = await layers(c);
  res.top = { ticks, frames: ft.frames.length, ...counts(ft.recs, res.hero), lt: ltDelta(a0, a1), ltNoTimeline: ltDelta(a1, a2), ltBackToBack: { ms: a3.t - a2.t, ...ltDelta(a2, a3) },
    clockPaintClips: ft.recs.filter((r) => r.type === 'Paint' && sizeClass(QB(r.data?.clip), res.hero) !== 'other').map((r) => QB(r.data.clip)),
    biggestPaints: ft.recs.filter((r) => r.type === 'Paint').map((r) => QB(r.data?.clip)).filter(Boolean).sort((x, y) => y.w * y.h - x.w * x.h).slice(0, 5) };
  res.top.heroBySize = [a0.heroBySize, a1.heroBySize]; res.top.heroMemoryMB = [a0.heroMemoryMB, a1.heroMemoryMB]; res.top.heroBacked = [a0.heroBacked, a1.heroBacked]; res.top.wrap = [a0.wrap, a1.wrap];
  console.log('top', JSON.stringify({ ...res.top, lt: { ...res.top.lt } }));
  // 1b. scroll out of the hero and back in (F-142: a composited layer that left its clip / the viewport may drop its backing
  // and repaint on re-entry). Timeline over: 1 s at y 0, scroll to 3 viewports down, 2.5 s there, back to y 0, 2.5 s.
  if (PHASES.includes('scroll')) {
    const before = await layers(c);
    recs = []; const kw2 = await ev('__cs.ticks');
    await c.send('Timeline.start', { maxCallStackDepth: 1 });
    await ev(`(console.timeStamp('cdmark top'), 0)`); await sleep(1000);
    await ev(`(console.timeStamp('cdmark out'), scrollTo({ top: innerHeight * 3, behavior: 'instant' }), 0)`); await sleep(1000);
    const outRect = await ev(`JSON.stringify(document.querySelector('.hero-copy [role=timer]').getBoundingClientRect())`);
    const mid = await layers(c); await sleep(1500);
    await ev(`(console.timeStamp('cdmark in'), scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(2500);
    await c.send('Timeline.stop');
    const after = await layers(c);
    const fs = flatten(recs);
    const marks = Object.fromEntries(fs.recs.filter((r) => r.type === 'TimeStamp' && /^cdmark /.test(r.data?.message || '')).map((r) => [r.data.message.slice(7), r.start]));
    const seg = (a, b) => counts(fs.recs.filter((r) => r.start >= a && r.start < b), res.hero);
    res.scroll = { ticks: (await ev('__cs.ticks')) - kw2, outRect: JSON.parse(outRect), marks: Object.keys(marks),
      atTop: marks.top != null ? seg(marks.top, marks.out) : null, away: marks.out != null ? seg(marks.out, marks.in) : null,
      reentry1s: marks.in != null ? seg(marks.in, marks.in + 1000) : null, after1s: marks.in != null ? seg(marks.in + 1000, Infinity) : null,
      all: counts(fs.recs, res.hero),
      heroBacked: [before.heroBacked, mid.heroBacked, after.heroBacked], heroMemoryMB: [before.heroMemoryMB, mid.heroMemoryMB, after.heroMemoryMB],
      heroPaintsLT: ltDelta(before, after).heroPaints, digitPaintsLT: ltDelta(before, after).digitPaints };
    console.log('scroll', JSON.stringify(res.scroll));
  }
  if (!PHASES.includes('morph')) { await c.send('Timeline.disable').catch(() => {}); return res; }
  // 2. morph
  await ev("(scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 0)"); await sleep(3000);
  res.morphPaused = { ...snapL(await layers(c)), el: await ev(ELPROBE) };
  await ev(`(window.__fwMorphDrive({ hold: 2000, cycles: 1 }), 0)`); await sleep(800 + 300 + 1200);
  const panel = await ev(`__cs.geom('.start-selling-morph-panel [role=timer]')`); res.panel = panel;
  const h0 = await layers(c); await sleep(600); const h1 = await layers(c);
  res.morphHold = { ...snapL(h0), paintsIn600ms: ltDelta(h0, h1).digitPaints, el: await ev(ELPROBE) };
  await poll('window.__fwMD', 20000); await sleep(1500);
  res.morphAfter = snapL(await layers(c));
  console.log('morph layers paused', JSON.stringify(res.morphPaused), 'hold', JSON.stringify(res.morphHold), 'after', JSON.stringify(res.morphAfter));
  recs = [];
  await c.send('Timeline.start', { maxCallStackDepth: 1 });
  await ev(`(console.timeStamp('cdcal ' + performance.now()), window.__fwMorphDrive({ hold: 2000, cycles: 2 }), 0)`);
  await poll('window.__fwMD', 30000);
  await c.send('Timeline.stop');
  const md = JSON.parse(await ev('window.__fwMD'));
  const fm = flatten(recs);
  const cal = fm.recs.find((r) => r.type === 'TimeStamp' && /^cdcal /.test(r.data?.message || ''));
  if (!cal) { res.morph = { error: 'no calibration TimeStamp', frames: fm.frames.length }; return res; }
  const off = cal.start - Number(cal.data.message.split(' ')[1]); // timeline ms = page ms + off
  // tween starts from the driver's frames [t, dt, y, m]
  const F = md.frames; const starts = [];
  for (let i = 1; i < F.length; i++) { if (F[i - 1][3] <= 0.001 && F[i][3] > 0.001) starts.push(['fwd', F[i - 1][0]]); if (F[i - 1][3] >= 0.999 && F[i][3] < 0.999) starts.push(['rev', F[i - 1][0]]); }
  const holds = []; { let s = null; for (const f of F) { if (f[3] >= 0.999 && s === null) s = f[0]; if (f[3] < 0.999 && s !== null) { holds.push([s, f[0]]); s = null; } } if (s !== null) holds.push([s, F.at(-1)[0]]); }
  const clockPaint = (r) => { if (r.type !== 'Paint') return false; const q = QB(r.data?.clip); const k = sizeClass(q, panel); return k === 'digit' || k === 'strip'; };
  const byFrame = new Map(); for (const r of fm.recs) if (r.frame >= 0 && clockPaint(r)) byFrame.set(r.frame, (byFrame.get(r.frame) || 0) + 1);
  const share = (a, b) => { const idx = fm.frames.map((f, i) => [f, i]).filter(([f]) => f.start >= a + off && f.start < b + off).map(([, i]) => i); return { frames: idx.length, withClockPaint: idx.filter((i) => byFrame.has(i)).length, clockPaints: idx.reduce((s, i) => s + (byFrame.get(i) || 0), 0) }; };
  const inWin = (a, b) => fm.recs.filter((r) => r.start >= a + off && r.start < b + off);
  res.morph = { driver: { all: md.all, moving: md.moving, atOne: md.atOne }, frames: fm.frames.length,
    tweens: starts.map(([k, t]) => ({ kind: k, ...share(t, t + 450), ...counts(inWin(t, t + 450), panel) })),
    holds: holds.map(([a, b]) => ({ ms: Math.round(b - a), ...share(a + 100, b), ...counts(inWin(a + 100, b), panel) })),
    clockPaintClips: fm.recs.filter(clockPaint).slice(0, 12).map((r) => QB(r.data.clip)),
    // per rendering frame in each window: [ms from window start, frame dur ms, Layout records, clock paints, clock paint rects w x h]
    tweenFrames: starts.map(([k, t]) => ({ kind: k, f: perFrame(t, t + 450) })),
    holdFrames: holds.map(([a, b]) => perFrame(a + 100, b)) };
  function perFrame(a, b) {
    return fm.frames.map((f, i) => [f, i]).filter(([f]) => f.start >= a + off && f.start < b + off).map(([f, i]) => {
      const rs = fm.recs.filter((r) => r.frame === i);
      return [Math.round(f.start - off - a), Math.round(f.dur * 10) / 10, rs.filter((r) => r.type === 'Layout').length, rs.filter(clockPaint).length,
        rs.filter(clockPaint).map((r) => { const q = QB(r.data.clip); return `${Math.round(q.w)}x${Math.round(q.h)}`; }).join(' ')];
    });
  }
  console.log('morph tweens', JSON.stringify(res.morph.tweens.map((t) => [t.kind, t.frames, t.withClockPaint, t.digitPaint, t.stripPaint, t.Paint])), 'holds', JSON.stringify(res.morph.holds.map((h) => [h.ms, h.frames, h.withClockPaint, h.digitPaint, h.stripPaint, h.Paint])));
  await c.send('Timeline.disable').catch(() => {});
  return res;
}

const BASE = resolveTree('site-pretty');
const res = { tool: 'cd-strip sim', note: 'Simulator: counts only (F-084)', startedAt: new Date().toISOString(), order: ARMS, arms: {} };
for (const arm of ARMS) {
  const dir = join(SNAP, arm); const want = JSON.parse(readFileSync(join(SNAP, 'hashes.json'), 'utf8'))[arm];
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (js !== want.js || css !== want.css) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(3000);
    console.log(`== ${arm}`);
    try { res.arms[arm] = { served: { js: js.slice(0, 12), css: css.slice(0, 12) }, ...(await sequence(c)) }; } catch (e) { res.arms[arm] = { error: String(e.stack || e) }; console.error(arm, e.message); }
    c.close();
  } finally { p.kill(); }
}
const f = join(OUT, `sim-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f);
