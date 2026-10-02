// countdown-faces X1: WebKit Timeline segment card, base vs PoC (ticket in README "X1 phone segment card").
// One sequence per page load, the same on the Simulator and on the phone:
//   top (clock visible, rolling) -> heroExit (y where div.hero's --exit-opacity first reads 0, + 8 px) -> pastHero
//   (both clocks hidden) -> resume (the window starts at pastHero, 300 ms later an instant jump back to y 0).
// Each window is tick-aligned: it starts 650 ms after a seconds tick (data-value of the hero clock's last number) and
// lasts 4 s, so it holds exactly 4 ticks and their rolls. Timeline is on only inside the windows (Page.disable ->
// Page.enable -> Timeline.start, F-047), maxCallStackDepth 1.
// Per window: record counts (RenderingFrame, RecalculateStyles, Layout, Paint, Composite, FireAnimationFrame, countdown
// rAF), Paint records with a digit-sized clip (a face repaint), Layout records with a view-sized root, exclusive ms per
// segment (Script / Style / Layout / Paint+Composite / Other) and rAF dt counts (> 34 / > 50 with the +-4 ms twins).
// Simulator ms never count (F-084); on the Simulator only the counts are read.
// Options:
//   --lt            LayerTree census before and after each window (layers, face layers, memory, paintCount deltas).
//                   Never in a timed phone run (protocol v2 §5.5): Simulator, or the phone's uncounted attribution run.
//   --resume-check  after the windows: hide the clock 8 s at pastHero, jump to y 0, and read the hero clock's painted
//                   digits in a ResizeObserver callback of every rendering update (after rAF callbacks and layout,
//                   before paint): does the first update at y 0 show the live value (same-update resume on WebKit)?
// Usage:
//   Simulator (inside a FUNCTIONAL session, shared lane, weight simulator):
//     node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner countdown-faces -- \
//       node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/x1.mjs sim base,poc
//   Phone (the runner, inside its lease; a served origin per arm, plain-http twin, host `lan`):
//     node fixes/countdown-faces/x1.mjs phone --url http://lan:<twin>/ --arm C|V --build base|poc --label X1-<n><arm> \
//       [--run n] [--warmup] [--lt] [--resume-check] [--no-park]
//   Score: node fixes/countdown-faces/x1.mjs score <x1 run json>...
// Every scroll is behavior 'instant': the page sets html { scroll-behavior: smooth } (CSS 11738), so a bare
// scrollTo(0, y) animates (fixed after Simulator session 1, which it voided). The sequence first visits pastHero
// once so the panel clock is mounted in both arms.
// Output: out/countdown-faces/x1/<label>.json (phone) or x1-sim-<stamp>.json. Served-hash check: a wrong
// nodes/2.DyWL8TcE.js hash makes the run VOID (exit 3).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { resolveLanUrl } from '../../tools/lib/lan.mjs';
const { openTab, sleep, parkSafari } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const HASH = {
  base: '4606120cf3925f872ebb1a7a5e7731ad74d4d190781ee7952cf4440ed18acff5',
  poc: '638b8e03e81ce0f9732b346eeb5aa4e3d804158a7609d1cd918b6f5f222401ad',
  css: '27776f3d4138b19a36de24af304abefce02feec53dcf83c52c155085c9e82f5c',
};
const WIN = 4000;
const OUT = join(WT, 'out/countdown-faces/x1');
const argv = process.argv.slice(2);
const MODE = argv[0];
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------- page side ----------
const INSTALL = `(() => {
  if (window.__x1) return 'had';
  const timers = [...document.querySelectorAll('[role=timer]')];
  const hero = timers[0];
  const nums = [...hero.querySelectorAll('.number')];
  const X = window.__x1 = { ticks: 0, lastTick: 0, raf: null, hero };
  const mo = new MutationObserver(() => { X.ticks++; X.lastTick = performance.now(); });
  mo.observe(nums[nums.length - 1], { attributes: true, attributeFilter: ['data-value'] });
  X.rafOn = () => { const s = X.raf = []; const f = (t) => { if (X.raf !== s) return; s.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); return 0; };
  X.rafOff = () => { const s = X.raf || []; X.raf = null; return s; };
  X.geom = () => { const d = hero.querySelector('.digit').getBoundingClientRect(); return { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, dw: d.width, dh: d.height, ua: navigator.userAgent }; };
  X.exitEl = () => document.querySelector('[style*="--exit-opacity"]');
  X.exitOpacity = () => { const e = X.exitEl(); return e ? e.style.getPropertyValue('--exit-opacity') : null; };
  X.census = () => timers.concat([...document.querySelectorAll('[role=timer]')].filter((t) => !timers.includes(t))).map((t) => { const r = t.getBoundingClientRect(); return { inViewport: r.bottom > 0 && r.top < innerHeight, faces: t.querySelectorAll('.face.svelte-1quva9c').length }; });
  X.painted = () => nums.map((n) => ({ v: n.dataset.value, d: [...n.querySelectorAll('.digit')].map((dg) => {
    const h = dg.querySelector('.spacer').offsetHeight || 1; let best = null;
    for (const f of dg.querySelectorAll('.face')) { const m = getComputedStyle(f).transform; const ty = m && m !== 'none' ? Number(m.slice(7, -1).split(',')[5]) : 0; const off = ty / h; if (!best || Math.abs(off) < Math.abs(best.off)) best = { t: f.textContent, off: Math.round(off * 1000) / 1000 }; }
    return best; }) }));
  return 'ok';
})()`;
const FRAMES2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))))`;
const YS = `(() => { const vh = innerHeight, t = document.querySelector('.hero-track'); const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh;
  const tt = t ? t.getBoundingClientRect().top + scrollY : 0; const th = t ? t.getBoundingClientRect().height : 2 * vh;
  return { vh, exitGuess: Math.round(tt + Math.max(1, th - vh)), pastHero: Math.round(tb + 1.2 * vh) }; })()`;
const RESUME = (yHide, hideMs) => `(async () => {
  const X = window.__x1; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;opacity:0';
  document.body.append(el);
  scrollTo({ top: ${yHide}, behavior: 'instant' }); await wait(${hideMs});
  const out = []; let n = 0, jumped = false;
  const timer = X.hero; // A1b: the hero clock found at install (its .number nodes are the ones painted() reads); a document-order query found the nav panel's clock
  // amendment A1 (lead 10-02): the clock's rendered visibility per update. op = product of the computed opacity of the
  // timer and every ancestor (parentElement chain); a value that does not parse as a number (e.g. '' on a
  // display:contents wrapper) is skipped and counted in opSkip, never read as 0 (the 9a6f3f9ed143 field did Number('')).
  // zeroAt names the first element whose computed opacity is 0. cv = checkVisibility({opacityProperty, visibilityProperty})
  // where the engine has it (auxiliary only).
  const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].join('.') : '');
  const vis = () => { let o = 1, skip = 0, zeroAt = null; for (let e = timer; e; e = e.parentElement) { const raw = getComputedStyle(e).opacity; const v = parseFloat(raw);
    if (!Number.isFinite(v)) { skip++; continue; } if (v === 0 && !zeroAt) zeroAt = desc(e); o *= v; }
    let cv = null; try { if (typeof timer.checkVisibility === 'function') cv = timer.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch (err) { cv = 'err'; }
    return { op: Math.round(o * 10000) / 10000, opSkip: skip, zeroAt, cv }; };
  const chain = () => { const a = []; for (let e = timer; e; e = e.parentElement) { const cs = getComputedStyle(e); a.push([desc(e), cs.opacity, cs.display, cs.visibility]); } return a; };
  X.chainHidden = chain();
  const ro = new ResizeObserver(() => { out.push({ t: performance.now(), y: scrollY, jumped, eo: X.exitOpacity(), ...vis(), p: X.painted() }); });
  await new Promise((done) => { const loop = () => { ro.unobserve(el); ro.observe(el); if (++n === 4) setTimeout(() => { jumped = true; scrollTo({ top: 0, behavior: 'instant' }); }, 0); if (n < 24) requestAnimationFrame(loop); else done(); }; requestAnimationFrame(loop); });
  ro.disconnect(); el.remove(); await wait(1500); X.chainEnd = chain(); X.visEnd = vis(); return out;
})()`;

// ---------- Timeline summary ----------
const QW = (q) => (q && q.length >= 8 ? { w: Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h: Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]) } : null);
const SEG = (t) => (t === 'RecalculateStyles' ? 'style' : t === 'Layout' ? 'layout' : t === 'Paint' || t === 'Composite' ? 'paintComposite'
  : /^(FunctionCall|EvaluateScript|FireAnimationFrame|TimerFire|EventDispatch|ObserverCallback|ProbeSample|ConsoleProfile)$/.test(t) ? 'script' : 'other');
function summarize(records, range, g, raf) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, Composite: 0, FireAnimationFrame: 0, countdownRaf: 0, digitPaint: 0, viewLayout: 0 };
  const seg = { script: 0, style: 0, layout: 0, paintComposite: 0, other: 0 };
  const isCd = (r) => r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(r.data?.scriptName || '') && r.data.scriptLine >= range[0] && r.data.scriptLine <= range[1];
  const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
  const frames = [];
  const walk = (r, fr) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'FireAnimationFrame' && (r.children || []).some(isCd)) c.countdownRaf++;
    if (r.type === 'Paint') { const q = QW(r.data?.clip); if (q && q.w <= 1.5 * g.dw && q.h <= 1.5 * g.dh) c.digitPaint++; }
    if (r.type === 'Layout') { const q = QW(r.data?.root); if (q && q.w >= 0.9 * g.vw && q.h >= 0.9 * g.vh) c.viewLayout++; }
    const ex = Math.max(0, ms(r) - (r.children || []).reduce((a, ch) => a + ms(ch), 0));
    seg[SEG(r.type)] += ex; if (fr) fr[SEG(r.type)] += ex;
    for (const ch of r.children || []) walk(ch, fr);
  };
  for (const r of records) {
    const fr = r.type === 'RenderingFrame' ? { start: r.startTime * 1000, dur: ms(r), script: 0, style: 0, layout: 0, paintComposite: 0, other: 0 } : null;
    walk(r, fr); if (fr) frames.push(fr);
  }
  frames.sort((a, b) => a.start - b.start);
  frames.forEach((f, i) => { if (frames[i + 1]) f.gapMinusFrame = frames[i + 1].start - f.start - f.dur; });
  for (const k in seg) seg[k] = Math.round(seg[k] * 10) / 10;
  const dts = raf.slice(1).map((t, i) => t - raf[i]);
  const over = (x) => dts.filter((d) => d > x).length;
  return { counts: c, segMs: seg, rafFrames: dts.length, dt: { gt34: over(34), gt30: over(30), gt38: over(38), gt50: over(50), gt46: over(46), gt54: over(54), max: dts.length ? Math.max(...dts) : null },
    frames: frames.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 10) / 10]))) };
}

// ---------- LayerTree ----------
async function layers(c) {
  await c.send('LayerTree.enable');
  try {
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const faces = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: '.face.svelte-1quva9c' })).nodeIds);
    const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
    const F = L.filter((l) => faces.has(l.nodeId));
    return { t: Date.now(), layers: L.length, faceNodes: faces.size, faceLayers: F.length, memory: L.reduce((a, l) => a + (l.memory || 0), 0), faceMemory: F.reduce((a, l) => a + (l.memory || 0), 0),
      paint: Object.fromEntries(L.map((l) => [l.layerId, l.paintCount || 0])), facePaintIds: F.map((l) => l.layerId) };
  } finally { await c.send('LayerTree.disable').catch(() => {}); }
}
const ltDelta = (a, b) => a && b && ({ ms: b.t - a.t, layers: [a.layers, b.layers], faceLayers: [a.faceLayers, b.faceLayers], faceNodes: [a.faceNodes, b.faceNodes], memoryMB: [a.memory, b.memory].map((x) => Math.round(x / 1e5) / 10),
  faceMemoryMB: [a.faceMemory, b.faceMemory].map((x) => Math.round(x / 1e5) / 10),
  facePaints: b.facePaintIds.reduce((s, id) => s + Math.max(0, (b.paint[id] || 0) - (a.paint[id] || 0)), 0),
  facePaintedLayers: b.facePaintIds.filter((id) => (b.paint[id] || 0) > (a.paint[id] || 0)).length,
  otherPaints: Object.keys(b.paint).filter((id) => !b.facePaintIds.includes(Number(id)) && !b.facePaintIds.includes(id)).reduce((s, id) => s + Math.max(0, (b.paint[id] || 0) - (a.paint[id] || 0)), 0) });

// ---------- the sequence ----------
async function sequence(c, range, { lt, resumeCheck }) {
  const ev = (e) => c.evaluate(e);
  const evAsync = async (e, key, tmo = 60000) => {
    await ev(`window.${key} = undefined; Promise.resolve(${e}).then((v) => { window.${key} = JSON.stringify({ ok: v }); }, (x) => { window.${key} = JSON.stringify({ err: String(x && x.stack || x) }); }); 0`);
    const t0 = Date.now();
    while (Date.now() - t0 < tmo) { await sleep(150); const v = await ev(`window.${key} || null`); if (v) { const o = JSON.parse(v); if (o.err) throw new Error(o.err); return o.ok; } }
    throw new Error(`${key} timed out`);
  };
  if ((await ev(INSTALL)) === 'had') console.error('x1: recorder already installed (no reload?)');
  const g = await ev('__x1.geom()');
  const ys = await ev(YS);
  // prime: visit pastHero once, so the panel clock is mounted in both arms before the top window (session-1 confound)
  await ev(`(scrollTo({ top: ${ys.pastHero}, behavior: 'instant' }), 0)`); await sleep(2500);
  await ev(`(scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(1500);
  // heroExit: the first y where --exit-opacity reads 0 (analytic guess from .hero-track, then verified; else searched)
  const opAt = async (y) => { await ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await evAsync(FRAMES2, '__x1f'); const v = await ev('__x1.exitOpacity()'); return v === null || v === '' ? NaN : Number(v); };
  const exitOpacityAtVh = await opAt(ys.vh);
  let yExit = ys.exitGuess;
  if (!((await opAt(yExit)) === 0 && (await opAt(yExit - 8)) > 0)) {
    let lo = 0, hi = Math.round(4 * ys.vh);
    while (hi - lo > 2) { const m = Math.round((lo + hi) / 2); if ((await opAt(m)) === 0) hi = m; else lo = m; }
    yExit = hi;
  }
  const pos = { top: 0, heroExit: yExit + 8, pastHero: ys.pastHero };
  await ev("(scrollTo({ top: 0, behavior: 'instant' }), 0)"); await sleep(3000);
  const res = { geom: g, exitOpacityAtVh, yExit, exitOpacityAtHeroExit: await (async () => { await ev(`(scrollTo({ top: ${pos.heroExit}, behavior: 'instant' }), 0)`); await evAsync(FRAMES2, '__x1f'); const v = await ev('__x1.exitOpacity()'); await ev("(scrollTo({ top: 0, behavior: 'instant' }), 0)"); await sleep(2000); return v; })(), positions: {} };
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.send('Page.disable'); await c.send('Page.enable');
  await c.send('Timeline.enable');
  await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  const windows = [['top', 0, null], ['heroExit', pos.heroExit, null], ['pastHero', pos.pastHero, null], ['resume', pos.pastHero, 0]];
  for (const [name, y, jumpTo] of windows) {
    if (name !== 'resume') { await ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(2000); }
    const lt0 = lt ? await layers(c) : null;
    const census = await ev('__x1.census()');
    const yAtStart = await ev('scrollY');
    const k0 = await ev('__x1.ticks');
    const tw = Date.now();
    while ((await ev('__x1.ticks')) === k0 && Date.now() - tw < 2500) await sleep(40);
    await sleep(650);
    recs = [];
    await ev('__x1.rafOn()');
    const kWin0 = await ev('__x1.ticks');
    await c.send('Timeline.start', { maxCallStackDepth: 1 });
    if (jumpTo !== null) { await sleep(300); await ev(`(scrollTo({ top: ${jumpTo}, behavior: 'instant' }), 0)`); await sleep(WIN - 300); } else await sleep(WIN);
    await c.send('Timeline.stop');
    const ticksInWindow = (await ev('__x1.ticks')) - kWin0;
    const raf = await ev('__x1.rafOff()');
    await sleep(1500);
    const lt1 = lt ? await layers(c) : null;
    res.positions[name] = { y, yAtStart, jumpTo, ticksInWindow, census, tickWaitMs: Date.now() - tw, records: recs.length, ...summarize(recs, range, g, raf), lt: lt ? ltDelta(lt0, lt1) : undefined };
    const s = res.positions[name];
    console.log(name, 'ticks', ticksInWindow, JSON.stringify(s.counts), 'segMs', JSON.stringify(s.segMs), lt ? `faceLayers ${s.lt.faceLayers} facePaints ${s.lt.facePaints}` : '');
  }
  await c.send('Timeline.disable').catch(() => {});
  if (resumeCheck) {
    const recsR = await evAsync(RESUME(pos.pastHero, 8000), '__x1r', 60000);
    const first = recsR.find((r) => r.jumped && r.y === 0);
    const before = recsR.filter((r) => !r.jumped).pop();
    const judge = (r) => r && r.p.every((n) => n.d.every((d, i) => d && (d.t === String(n.v)[i] || Math.abs(d.off) >= 0.02)));
    const after = recsR.filter((r) => r.jumped && r.y === 0);
    const firstVisible = after.find((r) => r.op > 0) || null;
    // op: the hero clock's rendered opacity (product of computed opacity up the tree) in that rendering update (A1)
    const chainHidden = await ev('__x1.chainHidden'), chainEnd = await ev('__x1.chainEnd'), visEnd = await ev('__x1.visEnd');
    res.resumeCheck = { frames: recsR, firstAtTop: first || null, liveAtFirstFrame: judge(first), liveWhileHidden: judge(before),
      firstVisible, liveAtFirstVisible: judge(firstVisible), staleVisibleUpdates: after.filter((r) => r.op > 0 && !judge(r)).length,
      updatesAtTopBeforeVisible: after.indexOf(firstVisible),
      staleUpdates: after.filter((r) => !judge(r)).map((r) => ({ t: r.t, eo: r.eo, op: r.op, opSkip: r.opSkip, zeroAt: r.zeroAt, cv: r.cv })),
      instrumentOk: !!(visEnd && visEnd.op > 0 && chainEnd.some((e) => /^div\.hero(\.|$)/.test(e[0]))), visEnd, chainHidden, chainEnd };
    console.log('resume-check A1: instrument ok (op > 0 at rest at top):', res.resumeCheck.instrumentOk, JSON.stringify(res.resumeCheck.visEnd), '| stale updates:', JSON.stringify(res.resumeCheck.staleUpdates));
    console.log('resume-check: first visible update', res.resumeCheck.updatesAtTopBeforeVisible, 'live', res.resumeCheck.liveAtFirstVisible, 'stale visible updates', res.resumeCheck.staleVisibleUpdates);
    console.log('resume-check: live at the first frame at y 0:', res.resumeCheck.liveAtFirstFrame, '| live while hidden:', res.resumeCheck.liveWhileHidden);
  }
  return res;
}

function cdRangeOf(text) {
  const lines = text.split('\n');
  return [lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1, lines.findIndex((l) => l.startsWith('var lD = h('))];
}
async function served(base) {
  const js = Buffer.from(await (await fetch(new URL(NODE, base))).arrayBuffer());
  const css = Buffer.from(await (await fetch(new URL(CSS, base))).arrayBuffer());
  return { js: sha(js), css: sha(css), range: cdRangeOf(js.toString('utf8')) };
}

if (MODE === 'sim') {
  const ARMS = (argv[1] || 'base,poc').split(',');
  mkdirSync(OUT, { recursive: true });
  const BASE = resolveTree('site-pretty');
  const SNAP = { poc: join(WT, 'out/countdown-faces/snap-x1/poc') };
  const res = { tool: 'x1', mode: 'sim', note: 'Simulator: counts only, ms never count (F-084)', windowMs: WIN, startedAt: new Date().toISOString(), order: ARMS, arms: {} };
  for (const arm of ARMS) {
    const st = join(OUT, `serve-sim-${arm}.json`); rmSync(st, { force: true });
    const ov = arm === 'base' ? [] : ['--overlay', SNAP[arm]];
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    try {
      let s = null;
      for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error(`${arm} server did not start`);
      const url = `http://localhost:${s.port}/`;
      const h = await served(url);
      if (h.js !== HASH[arm] || h.css !== HASH.css) { console.error(`VOID: ${arm} serves js ${h.js.slice(0, 12)} css ${h.css.slice(0, 12)}`); process.exitCode = 3; continue; }
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
      const c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(3000);
      console.log(`== ${arm}`);
      res.arms[arm] = { served: h, ...(await sequence(c, h.range, { lt: true, resumeCheck: true })) };
      c.close();
    } finally { p.kill(); }
  }
  const f = join(OUT, `x1-sim-${res.startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1));
  console.log('wrote', f);
} else if (MODE === 'phone') {
  const url = opt('url'), arm = opt('arm'), build = opt('build'), label = opt('label');
  if (!url || !/^[CV]$/.test(arm || '') || !HASH[build] || !label) { console.error('usage: x1.mjs phone --url http://lan:<twin>/ --arm C|V --build base|poc --label X1-<n><arm> [--run n] [--warmup] [--lt] [--resume-check] [--no-park]'); process.exit(2); }
  const real = resolveLanUrl(url);
  mkdirSync(OUT, { recursive: true });
  const { batteryInfo } = await import(join(WT, 'tools/lib/iphone-run.mjs'));
  const h = await served(real);
  if (h.js !== HASH[build] || h.css !== HASH.css) { console.error(`VOID: ${build} serves js ${h.js.slice(0, 12)} css ${h.css.slice(0, 12)}`); process.exit(3); }
  const res = { tool: 'x1', mode: 'phone', url, arm, build, label, run: opt('run'), warmup: flag('warmup'), lt: flag('lt'), startedAt: new Date().toISOString(), served: h, batteryStart: batteryInfo() };
  const host = new URL(real).host;
  // The runner opens the arm's URL with `iphone.mjs open` just before; a page older than 20 s is reloaded here.
  let c = await openTab(host);
  if ((await c.evaluate('performance.now()')) > 20000) { await c.evaluate(`setTimeout(() => location.reload(), 100); 'ok'`); c.close(); await sleep(2500); c = await openTab(host); }
  for (let i = 0; i < 60 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
  await sleep(8000);
  Object.assign(res, await sequence(c, h.range, { lt: flag('lt'), resumeCheck: flag('resume-check') }));
  c.close();
  res.batteryEnd = batteryInfo();
  if (!flag('no-park')) await parkSafari().catch((e) => console.error('park:', e.message));
  const f = join(OUT, `${label}.json`);
  writeFileSync(f, JSON.stringify(res, null, 1));
  console.log('wrote', f);
} else if (MODE === 'score') {
  const runs = argv.slice(1).filter((f) => !f.startsWith('--')).map((f) => ({ f: basename(f), ...JSON.parse(readFileSync(f, 'utf8')) }));
  const rows = [];
  for (const r of runs) {
    if (r.warmup) continue;
    const arms = r.mode === 'sim' ? Object.entries(r.arms).map(([a, v]) => [a === 'base' ? 'C' : 'V', v]) : [[r.arm, r]];
    for (const [arm, v] of arms) for (const [pos, p] of Object.entries(v.positions || {})) {
      const s = p.segMs;
      rows.push({ file: r.f, mode: r.mode, arm, pos, ...p.counts, styleMs: s.style, layoutMs: s.layout, paintCompMs: s.paintComposite, scriptMs: s.script,
        lpcMs: Math.round((s.layout + s.paintComposite) * 10) / 10, slpMs: Math.round((s.style + s.layout + s.paintComposite) * 10) / 10,
        gt34: p.dt.gt34, gt50: p.dt.gt50, faceLayers: p.lt?.faceLayers?.[0], facePaints: p.lt?.facePaints, faceMemMB: p.lt?.faceMemoryMB?.[0] });
    }
  }
  const keys = ['RecalculateStyles', 'Layout', 'viewLayout', 'Paint', 'digitPaint', 'Composite', 'countdownRaf', 'styleMs', 'layoutMs', 'paintCompMs', 'lpcMs', 'slpMs', 'gt34', 'gt50', 'faceLayers', 'facePaints', 'faceMemMB'];
  const out = {};
  for (const pos of ['top', 'heroExit', 'pastHero', 'resume']) for (const arm of ['C', 'V']) {
    const R = rows.filter((x) => x.pos === pos && x.arm === arm); if (!R.length) continue;
    out[`${pos}/${arm}`] = Object.fromEntries(keys.map((k) => { const v = R.map((x) => x[k]).filter((x) => x != null).sort((a, b) => a - b); return [k, v.length ? { med: v[Math.floor((v.length - 1) / 2)] , min: v[0], max: v[v.length - 1], n: v.length } : null]; }));
  }
  // separated = every V run beyond every C run by >= 4 ms for ms sums (phone minShift, protocol §5.3; README stage-2 scoring)
  const sep = (pos, k) => { const a = out[`${pos}/C`]?.[k], b = out[`${pos}/V`]?.[k]; if (!a || !b) return null; const g = /Ms$/.test(k) ? 4 : 0; return b.min - a.max >= Math.max(g, 1e-9) ? 'V above' : a.min - b.max >= Math.max(g, 1e-9) ? 'V below' : 'not separated'; };
  const verdict = {
    a_top_lpc: sep('top', 'lpcMs'), b_pastHero_slp: sep('pastHero', 'slpMs'), heroExit_slp: sep('heroExit', 'slpMs'), resume_lpc: sep('resume', 'lpcMs'),
    note: 'ranges over runs; separation = every V run beyond every C run. Simulator rows: read counts only.',
  };
  for (const [k, v] of Object.entries(out)) console.log(k, Object.entries(v).filter(([, x]) => x).map(([n, x]) => `${n} ${x.med} [${x.min}-${x.max}]`).join(' · '));
  console.log(JSON.stringify(verdict));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `x1-score-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ rows, out, verdict }, null, 1));
} else {
  console.error('usage: x1.mjs sim [base,poc] | phone --url … --arm C|V --build base|poc --label … | score <files>'); process.exit(2);
}
