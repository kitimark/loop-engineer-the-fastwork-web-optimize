#!/usr/bin/env node
// accent-ca: Chrome COUNTS and frozen-frame PIXELS for the hero accent word (no timing). Per arm (a hashed snapshot
// copy in out/accent-ca/snap/<arm>), at y 0:
//  1. counts: a WIN ms trace window (default 9150 = 3 accent cycles) that starts at a draw-out; UpdateLayoutTree (+
//     elements), Layout, Paint (+ the painted node, DOM.describeNode), BeginMainThreadFrame, and per accent Web
//     Animation instance its compositeFailed (blink.animations 'Animation' async events, split at each begin). Main
//     frames, recalcs and paints are split by phase (idle / draw) from console.timeStamp marks the page writes at each
//     class change of the accent.
//     --freeze 1: first pause every animation that is not on the accent or its row (CSS animation-play-state, new
//     Element.animate() calls, SMIL), as cd-roll-ca comp-check --pause-others 2.
//  2. pixels (--pixels 1): HE's timers held (acc-lib SHIM), the plan TARGETS shot paused and running at 1e-6.
//  3. --rm 1: reduced motion instead: three shots 700 ms apart + computed styles of the accent subtree.
// Order: arms as given, the first arm again second (true A/A). Every later arm is compared with the first (X) and the
// A/A (X2) frame by frame: the five numbers of research/pixel-tolerance §1.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner accent-ca -- \
//     node fixes/accent-ca/chrome-counts.mjs --arms C,E1,WC,WP [--pixels 1] [--freeze 1] [--desktop 1] [--rm 1]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, CDP, gotoAndSettle, tempProfileDir } from '../../tools/lib/cdp.mjs';
import { WT, sleep, serveArm, heRange, SHIM, HELP, png, crop, tol, summary, shootPlan, TARGETS } from './acc-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = arg('--arms', 'C,E1').split(',');
const WIN = Number(arg('--win', '9150'));
const PIX = arg('--pixels', '0') === '1', FREEZE = arg('--freeze', '0') === '1', DESK = arg('--desktop', '0') === '1', RM = arg('--rm', '0') === '1';
const COUNTS = arg('--counts', RM ? '0' : '1') === '1';
// --save 1: keep every shot as a PNG in out/accent-ca/chrome-shots/<stamp>/<label>__<key>.png (proposal pictures);
// --targets 'word|phase,...' replaces the shot plan's TARGETS
const SAVE = arg('--save', '0') === '1';
const TGT = arg('--targets', '') ? arg('--targets', '').split(',').map((x) => x.split('|')) : TARGETS;
let lastBuf = null;
const VW = DESK ? 1440 : 430, VH = DESK ? 900 : 932, DPR = DESK ? 2 : 3;
const OUT = join(WT, 'out/accent-ca'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const order = [ARMS[0], ARMS[0], ...ARMS.slice(1)];
const labels = order.map((a, i) => (i === 1 ? a + '-again' : a));

const FREEZE_JS = `(() => { const e = document.querySelector('em.script-accent'); e.parentElement.setAttribute('data-acc-row', '');
  const st = document.createElement('style'); st.textContent = '*:not(.script-accent, .script-accent *, [data-acc-row] > *) { animation-play-state: paused !important; }'; document.head.append(st);
  const keep = (t) => t && (t.closest?.('.script-accent') || t.parentElement === e.parentElement);
  const orig = Element.prototype.animate; Element.prototype.animate = function (...a) { const an = orig.apply(this, a); if (!keep(this)) an.pause(); return an; };
  let n = 0; for (const a of document.getAnimations()) { if (keep(a.effect && a.effect.target)) continue; a.pause(); n++; }
  let s = 0; for (const svg of document.querySelectorAll('svg')) if (svg.querySelector('animate, animateTransform, animateMotion, set')) { svg.pauseAnimations(); s++; }
  return { animations: n, smil: s }; })()`;
// console.timeStamp at every accent class change (lands in the trace as TimeStamp with data.message)
const MARKS = `(() => { const e = document.querySelector('em.script-accent'); let last = '';
  const ph = () => (e.classList.contains('is-idle') ? 'idle' : e.classList.contains('is-drawing-out') ? 'out' : e.classList.contains('is-drawing-in') ? 'in' : '?');
  new MutationObserver(() => { const p = ph(); if (p !== last) { last = p; console.timeStamp('acc:' + p); } }).observe(e, { attributes: true, attributeFilter: ['class'] });
  last = ph(); return last; })()`;
const WAIT_OUT = `new Promise((res) => { const e = document.querySelector('em.script-accent'); if (!e) return res(false);
  const mo = new MutationObserver(() => { if (e.classList.contains('is-drawing-out')) { mo.disconnect(); res(true); } }); mo.observe(e, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { mo.disconnect(); res(false); }, 6000); })`;

async function counts(page) {
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  if (!(await page.eval(WAIT_OUT))) return { error: 'no draw-out within 6 s' };
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 200 * 1024,
    includedCategories: ['devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline.frame', '__metadata'] }, transferMode: 'ReportEvents' });
  await sleep(WIN);
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  off();
  // renderer main thread: the thread with the most UpdateLayoutTree
  const byTid = {}; for (const e of events) if (e.name === 'UpdateLayoutTree') byTid[e.tid] = (byTid[e.tid] || 0) + 1;
  const main = +Object.entries(byTid).sort((a, b) => b[1] - a[1])[0]?.[0];
  const M = events.filter((e) => e.tid === main);
  const marks = events.filter((e) => e.name === 'TimeStamp' && /^acc:/.test(e.args?.data?.message || '')).map((e) => [e.ts, e.args.data.message.slice(4)]).sort((a, b) => a[0] - b[0]);
  const TS = M.filter((e) => e.ph !== 'M' && e.ts > 0).map((e) => e.ts); const t0 = Math.min(...TS), tEnd = Math.max(...TS);
  const phaseAt = (ts) => { let p = 'out'; for (const [t, q] of marks) if (t <= ts) p = q; return p === 'idle' ? 'idle' : 'draw'; };
  const ms = { idle: 0, draw: 0 }; { let prev = t0, p = 'draw'; for (const [t, q] of [...marks, [tEnd, null]]) { ms[p] += (t - prev) / 1e3; prev = t; if (q) p = q === 'idle' ? 'idle' : 'draw'; } }
  const split = (name, filter = () => true) => { const r = { idle: 0, draw: 0 }; for (const e of events) if (e.ts >= t0 && e.ts <= tEnd) if (e.name === name && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'R' || e.ph === 'n') && filter(e)) r[phaseAt(e.ts)]++; return r; };
  const perS = (r) => ({ idle: ms.idle ? +((r.idle * 1000) / ms.idle).toFixed(1) : null, draw: ms.draw ? +((r.draw * 1000) / ms.draw).toFixed(1) : null });
  const cnt = (n) => M.filter((e) => e.name === n && e.ph !== 'E').length;
  // painted nodes
  const paintIds = {}; for (const e of M) if (e.name === 'Paint') { const id = e.args?.data?.nodeId; paintIds[id ?? 'none'] = (paintIds[id ?? 'none'] || 0) + 1; }
  const painted = [];
  for (const [id, n] of Object.entries(paintIds).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    let d = null; if (id !== 'none') try { const r = await page.send('DOM.describeNode', { backendNodeId: +id }); const at = r.node.attributes || []; const ci = at.indexOf('class'); d = r.node.localName + (ci >= 0 ? '.' + at[ci + 1].split(' ').slice(0, 2).join('.') : ''); } catch { d = '(gone)'; }
    painted.push([d || 'none', n]);
  }
  // accent + row Web Animation instances
  const inst = []; const open = new Map();
  for (const e of events.filter((x) => x.name === 'Animation').sort((a, b) => a.ts - b.ts)) {
    const id = e.id2?.local || e.id; const d = e.args?.data || {};
    if (e.ph === 'b') { const r = { node: d.nodeName || null, name: d.name ?? null, cf: [] }; open.set(id, r); inst.push(r); }
    const r = open.get(id); if (!r) continue;
    if (d.nodeName && !r.node) r.node = d.nodeName; if (d.name && !r.name) r.name = d.name;
    if (d.compositeFailed !== undefined) r.cf.push(d.compositeFailed);
    if (e.ph === 'e') open.delete(id);
  }
  res.animKeys ||= [...new Set(events.filter((x) => x.name === 'Animation').flatMap((x) => Object.keys(x.args?.data || {})))];
  const acc = inst.filter((r) => /accent|paint|idle-frame|fw-acc|svelte-1fn2go6/.test((r.node || '') + ' ' + (r.name || '')));
  const groups = {}; for (const r of acc) { const k = `${r.name || '-'} @ ${String(r.node || '?').slice(0, 60)}`; const g = (groups[k] ||= { n: 0, composited: 0, failed: 0, none: 0, cf: new Set() }); g.n++;
    if (!r.cf.length) g.none++; else if (r.cf.every((x) => x === 0)) g.composited++; else { g.failed++; r.cf.filter(Boolean).forEach((x) => g.cf.add(x)); } }
  for (const g of Object.values(groups)) g.cf = [...g.cf];
  const ult = M.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  return { windowMs: WIN, phaseMs: { idle: Math.round(ms.idle), draw: Math.round(ms.draw) }, marks: marks.map((m) => m[1]).join(','),
    counts: { updateLayoutTree: cnt('UpdateLayoutTree'), styleElements: ult.reduce((n, e) => n + (e.args?.elementCount || e.args?.data?.elementCount || 0), 0), layout: cnt('Layout'), prePaint: cnt('PrePaint'), paint: cnt('Paint'),
      beginMainThreadFrame: events.filter((e) => e.name === 'BeginMainThreadFrame').length, fireAnimationFrame: cnt('FireAnimationFrame'), timerFire: cnt('TimerFire') },
    perSecond: { mainFrames: perS(split('BeginMainThreadFrame', () => true)), recalc: perS(split('UpdateLayoutTree')), paint: perS(split('Paint')), layout: perS(split('Layout')) },
    painted, accentAnimations: groups, otherAnimationInstances: inst.length - acc.length };
}

async function shootFn(page) {
  return async (box) => { const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
    lastBuf = Buffer.from(r.data, 'base64'); const img = png(lastBuf); return crop(img, { x: 0, y: 0, w: img.w, h: img.h }); };
}

const res = { tool: 'fixes/accent-ca/chrome-counts.mjs', startedAt: new Date().toISOString(), viewport: [VW, VH, DPR], win: WIN, freeze: FREEZE, rm: RM, order: labels, arms: {}, compare: {} };
const ref = {}, aa = {}; // shots of the first arm and of its A/A run
const cmp = {}; // label -> rows
const profileDir = tempProfileDir(join(OUT, 'chrome'), 'accent-ca-counts');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: `${VW},${VH}`, args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
res.browser = chrome.browser;
try {
  for (let i = 0; i < order.length; i++) {
    const arm = order[i], label = labels[i];
    const s = await serveArm(arm, OUT);
    const row = (res.arms[label] = { served: s.served });
    try {
      if (!s.ok) { console.error(`VOID ${label}: serves ${s.served.js} / ${s.served.css}`); process.exitCode = 3; row.void = true; continue; }
      const page = await cdp.newIsolatedPage();
      try {
        await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: !DESK });
        if (!DESK) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        if (RM) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await page.send('Network.enable');
        await gotoAndSettle(page, s.url, { quietMs: 2000, maxMs: 45000 });
        await page.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`); await sleep(2500);
        await page.eval(HELP);
        row.accents = await page.eval('window.__ax.count()');
        if (FREEZE) row.frozen = await page.eval(FREEZE_JS);
        const shots = {};
        const shotDir = join(OUT, 'chrome-shots', STAMP); if (SAVE) mkdirSync(shotDir, { recursive: true });
        const keep = (k, c) => { if (SAVE && lastBuf) writeFileSync(join(shotDir, `${label}__${k.replace(/[|]/g, '_')}.png`), lastBuf); if (i === 0) ref[k] = c; else if (i === 1) aa[k] = c; shots[k] = c; };
        if (RM) {
          const shoot = await shootFn(page); const box = await page.eval('window.__ax.box()');
          row.rmStyles = await page.eval('window.__ax.styles()'); row.rmAnims = await page.eval('document.getAnimations().length');
          for (const k of [0, 1, 2]) { keep(`rm|${k}`, await shoot(box)); await sleep(700); }
        } else {
          if (COUNTS) { await page.eval(MARKS); row.counts = await counts(page); console.log(label, 'counts', JSON.stringify({ ...row.counts.counts, perSecond: row.counts.perSecond, painted: row.counts.painted.slice(0, 4), phaseMs: row.counts.phaseMs })); console.log(label, 'accentAnimations', JSON.stringify(row.counts.accentAnimations)); }
          if (PIX) {
            await page.eval(SHIM(heRange(arm)));
            await page.eval('(window.__acc.hold = true, 0)');
            for (let j = 0; j < 160 && !(await page.eval('window.__acc.heldReady()')); j++) await sleep(25);
            const shoot = await shootFn(page);
            row.plan = await shootPlan((e) => page.eval(e), shoot, TGT, keep, { log: (m) => console.log(label, m) });
            row.plan.hits = await page.eval('window.__acc.hits');
          }
        }
        if (i >= 2) {
          const rows = Object.keys(ref).map((k) => ({ key: k, ...tol(ref[k], shots[k], aa[k] || null, VW * VH * DPR * DPR, DPR) }));
          cmp[label] = rows;
        } else if (i === 1) {
          cmp[label] = Object.keys(ref).map((k) => ({ key: k, ...tol(ref[k], shots[k], null, VW * VH * DPR * DPR, DPR) }));
        }
      } finally { await page.close(); }
    } finally { s.p.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
for (const [label, rows] of Object.entries(cmp)) {
  const paused = rows.filter((r) => /paused$/.test(r.key)), running = rows.filter((r) => /running$/.test(r.key)), rm = rows.filter((r) => /^rm\|/.test(r.key));
  res.compare[`${labels[0]} vs ${label}`] = { all: summary(rows), paused: summary(paused), running: summary(running), rm: rm.length ? summary(rm) : undefined,
    worst: rows.filter((r) => r.diffPx || r.sizeMismatch).sort((a, b) => (b.beyondPx || 0) - (a.beyondPx || 0) || (b.maxLevel || 0) - (a.maxLevel || 0)).slice(0, 12) };
  console.log('PIX', `${labels[0]} vs ${label}`, JSON.stringify(res.compare[`${labels[0]} vs ${label}`].all), 'worst', JSON.stringify(res.compare[`${labels[0]} vs ${label}`].worst.slice(0, 4).map((r) => [r.key, r.maxLevel, r.beyondPx, r.beyondCssPx2, r.bboxCss])));
}
if (RM) { const base = res.arms[labels[0]].rmStyles; for (const l of labels.slice(1)) { const st = res.arms[l].rmStyles; if (st) res.arms[l].rmStylesSameAsFirst = JSON.stringify(st) === JSON.stringify(base); console.log('RM', l, 'styles same as', labels[0], res.arms[l].rmStylesSameAsFirst, 'anims', res.arms[l].rmAnims); } }
res.endedAt = new Date().toISOString();
const f = join(OUT, `chrome-${DESK ? 'd1440' : 'p430'}${RM ? '-rm' : ''}${FREEZE ? '-freeze' : ''}-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
