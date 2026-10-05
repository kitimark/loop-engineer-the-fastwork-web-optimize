#!/usr/bin/env node
// toolbar-resize P-126 DESCRIPTIVE extras (written after the frozen read; nothing here decides a call).
//   node fixes/toolbar-resize/p126-desc.mjs out/toolbar-resize/sim125 [--json out.json]
// 1. N2 (ops): inval:native per-frame counts, heavy vs control (quantiles, control variance/mean), and per-run rate
//    ratios, to show how much the pooled Clopper-Pearson bound leans on Poisson counts.
// 2. Heavy Layout root boxes, and the root boxes of rest-frame Layouts at each innerHeight (does the view root's box
//    follow innerHeight?).
// 3. Stack-key census over every invalidation record of every run (all frames).
// 4. fwWC's logged data-fw-wc writes in the C runs (P-125 inject `wr`): value changes vs same-value writes, and the
//    nearest ScheduleStyleRecalculation / InvalidateLayout record within 2 ms of each value change and its stack key
//    (can the instrument see a known script write?).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRun, stackKey, quadBox } from './read-inval126.mjs';

const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
const dir = args[0];
if (!dir) { console.error('usage: p126-desc.mjs <folder> [--json out.json]'); process.exit(1); }
const C = ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5'], R = ['wpx-H1', 'wpx-H2', 'wc1-H1', 'wc1-H2'];
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const r2 = (x) => Math.round(x * 100) / 100;
const box = (b) => (b ? `${Math.round(b.x1 - b.x0)}x${Math.round(b.y1 - b.y0)}@${Math.round(b.x0)},${Math.round(b.y0)}` : 'none');
const out = { perRun: {}, native: {}, heavyRootBoxes: {}, restRootBoxesByIh: {}, census: {}, fwWCWrites: null };
const runs = Object.fromEntries([...C, ...R].map((n) => [n, loadRun(dir, n)]));
for (const [lab, set] of [['C', C], ['R', R]]) {
  const hc = [], cc = [], boxes = {};
  for (const n of set) {
    const h = runs[n].frames.filter((f) => f.heavy), c = runs[n].frames.filter((f) => f.ctrl);
    const cnt = (f) => f.cnt.get('inval:native') || 0;
    const s = h.reduce((m, f) => m + cnt(f), 0), r = c.reduce((m, f) => m + cnt(f), 0);
    out.perRun[n] = { H: h.length, ctrl: c.length, s, r, RR: h.length && r ? r2((s / h.length) / (r / c.length)) : null };
    for (const f of h) { hc.push(cnt(f)); const k = box(quadBox(f.L.data.root)); boxes[k] = (boxes[k] || 0) + 1; }
    for (const f of c) cc.push(cnt(f));
  }
  const cm = mean(cc);
  out.native[lab] = {
    heavy: { n: hc.length, min: Math.min(...hc), p25: q(hc, 0.25), median: q(hc, 0.5), p75: q(hc, 0.75), max: Math.max(...hc), mean: r2(mean(hc)) },
    control: { n: cc.length, median: q(cc, 0.5), p90: q(cc, 0.9), p99: q(cc, 0.99), max: Math.max(...cc), mean: r2(cm), varToMean: r2((mean(cc.map((x) => x * x)) - cm * cm) / cm) },
    controlAtOrAboveHeavyMedian: Math.round((cc.filter((x) => x >= q(hc, 0.5)).length / cc.length) * 1000) / 1000,
    heavyAboveControlP99: r2(hc.filter((x) => x > q(cc, 0.99)).length / hc.length),
  };
  out.heavyRootBoxes[lab] = boxes;
}
for (const n of [...C, ...R]) for (const f of runs[n].frames) {
  if (f.moving || !f.L) continue;
  const k = box(quadBox(f.L.data.root)).split('@')[0], ih = `ih${f.ih}`;
  out.restRootBoxesByIh[ih] ||= {}; out.restRootBoxesByIh[ih][k] = (out.restRootBoxesByIh[ih][k] || 0) + 1;
}
const w = { total: 0, valueChanges: 0, sameValue: 0, changesWithRecordWithin2ms: 0, nearestKey: {}, lagMs: null };
const lags = [];
for (const n of [...C, ...R]) {
  const tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8')), recs = [];
  const walk = (r) => { if (r.type === 'ScheduleStyleRecalculation' || r.type === 'InvalidateLayout') { const k = stackKey(r.stackTrace); out.census[k] = (out.census[k] || 0) + 1; recs.push([r.startTime * 1000 - (tl.offsetMs || 0), k]); } for (const c of r.children || []) walk(c); };
  for (const r of tl.recs || []) walk(r);
  if (!C.includes(n)) continue;
  const g = JSON.parse(readFileSync(join(dir, `g-${n}.json`), 'utf8'));
  const inj = g.run.inject.map((x) => x.value).find((v) => v && v.wr), last = {};
  for (const [t, k, v, where] of inj.wr) {
    if (k !== 0) continue;
    w.total++;
    const id = JSON.stringify(where);
    if (last[id] === v) { w.sameValue++; continue; }
    last[id] = v; w.valueChanges++;
    const near = recs.filter(([rt]) => Math.abs(rt - t) <= 2).sort((a, b) => Math.abs(a[0] - t) - Math.abs(b[0] - t));
    if (!near.length) continue;
    w.changesWithRecordWithin2ms++;
    w.nearestKey[near[0][1]] = (w.nearestKey[near[0][1]] || 0) + 1;
    lags.push(t - near[0][0]);
  }
}
if (lags.length) w.lagMs = { p10: r2(q(lags, 0.1)), median: r2(q(lags, 0.5)), p90: r2(q(lags, 0.9)) };
out.fwWCWrites = w;
console.log(JSON.stringify(out, null, 1));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n');
