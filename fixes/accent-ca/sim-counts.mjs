#!/usr/bin/env node
// accent-ca: WebKit (iOS Simulator, Mobile Safari) COUNTS, LAYER CENSUS and frozen-frame PIXELS for the hero accent
// word. No timing (Simulator times never count, F-084). Adapted from fixes/cd-roll-ca/sim-counts.mjs and simpx.mjs
// (screenshot, marker calibration, LayerTree read: fix-cd-strip's originals, used with credit).
// Arms: hashed snapshot copies in out/accent-ca/snap/<arm>; the first arm runs again second (true A/A).
// Modes (argv[3], comma list):
//   counts : at y 0 a WIN ms Timeline window that starts at a draw-out (default 9150 = 3 cycles): RenderingFrame,
//            RecalculateStyles, Layout, Paint, accent-sized Paint (clip within 1.6 x the accent paint box), frames with
//            a recalc / an accent paint, split by phase (idle / draw) from console.timeStamp marks at each class change;
//            plus LayerTree.layerTreeDidChange events in the window (a layer made or dropped, F-213).
//   census : LayerTree of the accent subtree and its row at mid-boil, mid-draw, and with the hero live (y 100):
//            layers, backed, MB, paintCount, reasons.
//   pixels : HE's timers held (acc-lib SHIM), the TARGETS shot paused and running at 1e-6 (simctl screenshot, crop by
//            a magenta marker calibration); every later arm compared with the first and its A/A.
//   rm     : reduced motion via Page.overrideUserPreference + reload: 3 shots 700 ms apart + computed styles.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner accent-ca -- \
//     node tools/sim.mjs session --functional --owner accent-ca -- node fixes/accent-ca/sim-counts.mjs C,E1,WC counts,census
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, sleep, serveArm, heRange, SHIM, HELP, png, crop, tol, summary, shootPlan, TARGETS } from './acc-lib.mjs';
const { openTab } = await import(join(WT, 'tools/lib/wip.mjs'));

const ARMS = (process.argv[2] || 'C,E1').split(',');
const MODES = new Set((process.argv[3] || 'counts,census').split(','));
const WIN = Number(process.env.ACC_WIN || 9150);
const UDID = process.env.FW_SIM_UDID;
if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const OUT = join(WT, 'out/accent-ca'); const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = join(OUT, 'sim-shots', STAMP); mkdirSync(DIR, { recursive: true });
const order = [ARMS[0], ARMS[0], ...ARMS.slice(1)];
const labels = order.map((a, i) => (i === 1 ? a + '-again' : a));

let shotN = 0;
function screenshot(tag) {
  const f = join(DIR, `${String(++shotN).padStart(4, '0')}-${tag.replace(/[^\w.-]+/g, '_')}.png`);
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: ['ignore', 'ignore', 'pipe'] });
  return png(readFileSync(f));
}
const MARK = 40;
async function calibrate(ev, tag) {
  await ev(`(() => { const d = document.createElement('div'); d.id = '__accmark'; d.style.cssText = 'position:fixed;left:${MARK}px;top:${MARK}px;width:${MARK}px;height:${MARK}px;background:#ff00ff;z-index:2147483647;pointer-events:none'; document.body.appendChild(d); return 0; })()`);
  await sleep(300);
  const img = screenshot('cal-' + tag);
  await ev(`(document.getElementById('__accmark')?.remove(), 0)`); await sleep(200);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * img.bpp; if (img.px[i] > 200 && img.px[i + 1] < 90 && img.px[i + 2] > 200) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  if (x1 < 0) throw new Error('marker not found in ' + tag);
  const s = (x1 - x0 + 1) / MARK;
  return { ox: x0 - MARK * s, oy: y0 - MARK * s, s, screen: [img.w, img.h] };
}
const MARKS = `(() => { const e = document.querySelector('em.script-accent'); let last = '';
  const ph = () => (e.classList.contains('is-idle') ? 'idle' : e.classList.contains('is-drawing-out') ? 'out' : e.classList.contains('is-drawing-in') ? 'in' : '?');
  new MutationObserver(() => { const p = ph(); if (p !== last) { last = p; console.timeStamp('acc:' + p); } }).observe(e, { attributes: true, attributeFilter: ['class'] });
  last = ph(); return last; })()`;
async function waitPhase(ev, ph, ms = 6000) { const t = Date.now(); let prev = (await ev('window.__ax.st()')).phase;
  while (Date.now() - t < ms) { const p = (await ev('window.__ax.st()')).phase; if (p === ph && prev !== ph) return true; prev = p; await sleep(30); } return false; }
const QB = (q) => (q && q.length >= 8 ? { w: Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h: Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]) } : null);

async function counts(c, ev) {
  const recs = []; let ltc = 0, live = true;
  c.on((m) => { if (!live) return; if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); if (m.method === 'LayerTree.layerTreeDidChange') ltc++; });
  await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  await c.send('LayerTree.enable');
  const pb = await ev('window.__ax.paintBox()'); const g = { w: pb.w * pb.dpr, h: pb.h * pb.dpr };
  await ev(MARKS);
  if (!(await waitPhase(ev, 'out'))) return { error: 'no draw-out within 6 s' };
  recs.length = 0; ltc = 0;
  await c.send('Timeline.start', { maxCallStackDepth: 1 });
  await sleep(WIN);
  await c.send('Timeline.stop'); await sleep(400);
  const lt = ltc;
  await c.send('Timeline.disable').catch(() => {}); await c.send('LayerTree.disable').catch(() => {});
  // flatten; phase marks
  const flat = []; const walk = (r, top) => { flat.push([r, top]); for (const ch of r.children || []) walk(ch, top); };
  for (const r of recs) walk(r, r);
  let marks = flat.filter(([r]) => r.type === 'TimeStamp' && /^acc:/.test(r.data?.message || '')).map(([r]) => [r.startTime, r.data.message.slice(4)]).sort((a, b) => a[0] - b[0]);
  // fallback (console.timeStamp marks were not seen on the Simulator, 12:30Z run): HE's own timers mark each phase start,
  // TimerInstall timeout 1250/2200 = idle starts, 900 = a draw starts (JS 3834-3958)
  let markSrc = 'timeStamp';
  if (!marks.length) { markSrc = 'TimerInstall'; marks = flat.filter(([r]) => r.type === 'TimerInstall' && [900, 1250, 2200].includes(r.data?.timeout)).map(([r]) => [r.startTime, r.data.timeout === 900 ? 'draw' : 'idle']).sort((a, b) => a[0] - b[0]); }
  const types = {}; for (const [r] of flat) types[r.type] = (types[r.type] || 0) + 1;
  const phaseAt = (t) => { let p = 'out'; for (const [s, q] of marks) if (s <= t) p = q; return p === 'idle' ? 'idle' : 'draw'; };
  const isAcc = (r) => { const q = QB(r.data?.clip); return !!q && q.w <= 1.6 * g.w && q.h <= 1.6 * g.h && q.w > 0.2 * g.w; };
  const c0 = () => ({ RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, accentPaint: 0, Composite: 0, FireAnimationFrame: 0, framesWithRecalc: 0, framesWithLayout: 0, framesWithAccentPaint: 0 });
  const C = { all: c0(), idle: c0(), draw: c0() };
  const frames = recs.filter((r) => r.type === 'RenderingFrame');
  const fwalk = (r, F, P) => { for (const K of [C.all, C[P]]) { if (r.type in K) K[r.type]++; if (r.type === 'Paint' && isAcc(r)) K.accentPaint++; }
    if (r.type === 'RecalculateStyles') F.recalc = true; if (r.type === 'Layout') F.layout = true; if (r.type === 'Paint' && isAcc(r)) F.ap = true; for (const ch of r.children || []) fwalk(ch, F, P); };
  for (const r of recs) { const P = phaseAt(r.startTime); const F = {}; fwalk(r, F, P);
    if (r.type === 'RenderingFrame') for (const K of [C.all, C[P]]) { K.framesWithRecalc += F.recalc ? 1 : 0; K.framesWithLayout += F.layout ? 1 : 0; K.framesWithAccentPaint += F.ap ? 1 : 0; } }
  // phase durations (s) from the marks
  const t0 = frames.length ? frames[0].startTime : 0, t1 = frames.length ? frames[frames.length - 1].startTime : 0;
  const dur = { idle: 0, draw: 0 }; { let prev = t0, p = 'draw'; for (const [t, q] of [...marks.filter(([t]) => t >= t0 && t <= t1), [t1, null]]) { dur[p] += t - prev; prev = t; if (q) p = q === 'idle' ? 'idle' : 'draw'; } }
  const perS = (P) => Object.fromEntries(['RenderingFrame', 'RecalculateStyles', 'Layout', 'Paint', 'accentPaint', 'framesWithRecalc'].map((k) => [k, dur[P] ? +(C[P][k] / dur[P]).toFixed(1) : null]));
  live = false;
  return { windowMs: WIN, markSrc, recordTypes: types, phaseS: { idle: +dur.idle.toFixed(2), draw: +dur.draw.toFixed(2) }, marks: marks.map((m) => m[1]).join(','), paintBoxDev: g, layerTreeDidChange: lt, counts: C, perSecond: { idle: perS('idle'), draw: perS('draw') }, records: recs.length };
}

async function layers(c) {
  try {
    await c.send('LayerTree.enable');
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const sel = async (s) => (await c.send('DOM.querySelectorAll', { nodeId: root, selector: s })).nodeIds;
    const name = new Map();
    for (const [s, n] of [['em.script-accent', 'em'], ['em.script-accent .frame', 'frame'], ['em.script-accent .paint', 'paint'], ['em.script-accent svg', 'svg'], ['em.script-accent path', 'path'], ['[data-acc-row] > *:not(em)', 'row-sibling']]) for (const id of await sel(s)) if (!name.has(id)) name.set(id, n);
    const L = ((await c.send('LayerTree.layersForNode', { nodeId: root })).layers || []).filter((l) => name.has(l.nodeId));
    const per = {}; for (const l of L) { const k = name.get(l.nodeId); const p = (per[k] ||= { n: 0, backed: 0, bytes: 0, paints: 0, reasons: new Set() }); p.n++; if (l.memory > 0) p.backed++; p.bytes += l.memory || 0; p.paints += l.paintCount || 0;
      try { const r = (await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId })).compositingReasons || {}; Object.keys(r).filter((x) => r[x]).forEach((x) => p.reasons.add(x)); } catch {} }
    for (const p of Object.values(per)) { p.MB = +(p.bytes / 1048576).toFixed(3); delete p.bytes; p.reasons = [...p.reasons].sort().join(','); }
    return { layers: L.length, backed: L.filter((l) => l.memory > 0).length, MB: +(L.reduce((a, l) => a + (l.memory || 0), 0) / 1048576).toFixed(3), per };
  } catch (e) { return { error: String(e.message || e) }; } finally { await c.send('LayerTree.disable').catch(() => {}); }
}
async function census(c, ev) {
  await ev(`(document.querySelector('em.script-accent').parentElement.setAttribute('data-acc-row', ''), 0)`);
  const r = {};
  if (await waitPhase(ev, 'out')) { await sleep(300); r.midDrawOut = { st: await ev('window.__ax.st()'), ...(await layers(c)) }; }
  if (await waitPhase(ev, 'in')) { await sleep(300); r.midDrawIn = { st: await ev('window.__ax.st()'), ...(await layers(c)) }; }
  if (await waitPhase(ev, 'idle')) { await sleep(300); r.midBoil = { st: await ev('window.__ax.st()'), ...(await layers(c)) }; }
  for (const y of [100, 300]) { await ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(700);
    r[`y${y}`] = { st: await ev('window.__ax.st()'), heroCls: await ev(`(document.querySelector('.hero-copy')?.className || '').toString().split(' ').filter((x) => /^he-/.test(x)).join(' ')`), ...(await layers(c)) }; }
  await ev(`(scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(700);
  return r;
}

const res = { tool: 'fixes/accent-ca/sim-counts.mjs', startedAt: new Date().toISOString(), order: labels, modes: [...MODES], win: WIN, dir: DIR, arms: {}, compare: {} };
const ref = {}, aa = {}; const cmp = {};
for (let i = 0; i < order.length; i++) {
  const arm = order[i], label = labels[i];
  const s = await serveArm(arm, OUT);
  const row = (res.arms[label] = { served: s.served });
  try {
    if (!s.ok) { console.error(`VOID ${label}: serves ${s.served.js} / ${s.served.css}`); process.exitCode = 3; row.void = true; continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', s.url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    try {
      for (let j = 0; j < 40 && (await ev('document.readyState')) !== 'complete'; j++) await sleep(500);
      await sleep(3000);
      await ev('(window.scrollTo(0, 0), 0)'); await sleep(1500);
      await ev(HELP); row.accents = await ev('window.__ax.count()');
      if (MODES.has('counts')) { row.counts = await counts(c, ev); console.log(label, 'counts', JSON.stringify({ lt: row.counts.layerTreeDidChange, phaseS: row.counts.phaseS, all: row.counts.counts?.all, perSecond: row.counts.perSecond })); }
      if (MODES.has('census')) { row.census = await census(c, ev); console.log(label, 'census', JSON.stringify(Object.fromEntries(Object.entries(row.census).map(([k, v]) => [k, { ph: v.st?.phase, layers: v.layers, backed: v.backed, MB: v.MB, per: v.per, he: v.heroCls }])))); }
      const shots = {}; const keep = (k, cr) => { if (i === 0) ref[k] = cr; else if (i === 1) aa[k] = cr; shots[k] = cr; };
      if (MODES.has('pixels')) {
        const cal = await calibrate(ev, label); row.cal = cal;
        const shoot = async (box) => { const img = screenshot(label); const r = { x: Math.round(cal.ox + box.x * cal.s), y: Math.round(cal.oy + box.y * cal.s), w: Math.round(box.w * cal.s), h: Math.round(box.h * cal.s) }; return crop(img, r); };
        await ev(SHIM(heRange(arm))); await ev('(window.__acc.hold = true, 0)');
        for (let j = 0; j < 160 && !(await ev('window.__acc.heldReady()')); j++) await sleep(25);
        // ACC_TARGETS=k1,k2 (label|phase): a subset of TARGETS, to fit a session
        const TG = process.env.ACC_TARGETS ? TARGETS.filter((t) => process.env.ACC_TARGETS.split(',').includes(t.join('|'))) : TARGETS;
        row.plan = await shootPlan(ev, shoot, TG, keep, { settle: Number(process.env.ACC_SETTLE || 200), log: (m) => console.log(label, m) });
        row.plan.hits = await ev('window.__acc.hits');
        for (const k of Object.keys(row.plan.meta)) row.plan.meta[k].perT = row.plan.meta[k].perT.map((x) => x.join(':')).join(' ');
        cmp[label] = Object.keys(ref).map((k) => ({ key: k, ...tol(ref[k], shots[k], i >= 2 ? aa[k] || null : null, cal.screen[0] * cal.screen[1], cal.s) }));
      }
      if (MODES.has('rm')) {
        try { await c.send('Page.overrideUserPreference', { name: 'PrefersReducedMotion', value: 'Reduce' }); row.rmOverride = 'ok'; } catch (e) { row.rmOverride = String(e.message || JSON.stringify(e)); }
        await ev('(location.reload(), 0)'); await sleep(1500);
        for (let j = 0; j < 40 && (await ev('document.readyState').catch(() => '')) !== 'complete'; j++) await sleep(500);
        await sleep(3000); await ev(HELP).catch(() => {});
        row.rmMatches = await ev(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
        row.rmStyles = await ev('window.__ax.styles()'); row.rmAnims = await ev('document.getAnimations().length');
        const cal = await calibrate(ev, label + '-rm'); const box = await ev('window.__ax.box()');
        for (const k of [0, 1, 2]) { const img = screenshot(label + '-rm'); keep(`rm|${k}`, crop(img, { x: Math.round(cal.ox + box.x * cal.s), y: Math.round(cal.oy + box.y * cal.s), w: Math.round(box.w * cal.s), h: Math.round(box.h * cal.s) })); await sleep(700); }
        cmp[label] = Object.keys(ref).map((k) => ({ key: k, ...tol(ref[k], shots[k], i >= 2 ? aa[k] || null : null, cal.screen[0] * cal.screen[1], cal.s) }));
        await c.send('Page.overrideUserPreference', { name: 'PrefersReducedMotion' }).catch(() => {});
      }
    } finally { c.close(); }
  } finally { s.p.kill(); }
  writeFileSync(join(OUT, `sim-partial-${STAMP}.json`), JSON.stringify(res, null, 1));
}
for (const [label, rows] of Object.entries(cmp)) {
  const paused = rows.filter((r) => /paused$/.test(r.key)), running = rows.filter((r) => /running$/.test(r.key)), rm = rows.filter((r) => /^rm\|/.test(r.key));
  const k = `${labels[0]} vs ${label}`;
  res.compare[k] = { all: summary(rows), paused: paused.length ? summary(paused) : undefined, running: running.length ? summary(running) : undefined, rm: rm.length ? summary(rm) : undefined,
    worst: rows.filter((r) => r.diffPx || r.sizeMismatch).sort((a, b) => (b.beyondPx || 0) - (a.beyondPx || 0) || (b.maxLevel || 0) - (a.maxLevel || 0)).slice(0, 12) };
  console.log('PIX', k, JSON.stringify(res.compare[k].all), 'worst', JSON.stringify(res.compare[k].worst.slice(0, 4).map((r) => [r.key, r.maxLevel, r.beyondPx, r.beyondCssPx2, r.bboxCss])));
}
for (const l of labels.slice(1)) if (res.arms[l]?.rmStyles) { res.arms[l].rmStylesSameAsFirst = JSON.stringify(res.arms[l].rmStyles) === JSON.stringify(res.arms[labels[0]].rmStyles); console.log('RM', l, 'matches', res.arms[l].rmMatches, 'styles same', res.arms[l].rmStylesSameAsFirst, 'anims', res.arms[l].rmAnims); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-${[...MODES].join('-')}-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
