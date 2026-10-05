#!/usr/bin/env node
// toolbar-resize P-126 addendum D1 (DESCRIPTIVE, written after the result; decides nothing).
// The P-125 captures were taken with Timeline.start { maxCallStackDepth: 1 } (tools/lib/wip.mjs TIMELINE_START), so a
// stack holds only its innermost frame. read-inval126.mjs skips "[native code]" frames, so a script call into a DOM
// function (setAttribute, toggle, ...) keys as `native` together with records that have no stackTrace at all. This
// splits the frozen `native` key by shape, in heavy and control frames (records in each frame's own interval), and
// gives the stack shape of the nearest record within 2 ms of each fwWC write (C runs).
// Rule 5b per bucket (ops, addendum read): the frozen rate and presence rules (rateRule, coincidence from
// score-p125.mjs) applied DESCRIPTIVELY to two depth-aware buckets of the `native` key: dom-call (one "[native code]"
// frame: a script called a DOM function, caller cut by the depth-1 capture) and no-stack (no stackTrace).
//   node fixes/toolbar-resize/p126-depth.mjs out/toolbar-resize/sim125 [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRun, stackKey } from './read-inval126.mjs';
import { coincidence, rateRule } from './score-p125.mjs';

const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null, dir = args[0];
if (!dir) { console.error('usage: p126-depth.mjs <folder> [--json out.json]'); process.exit(1); }
const sets = { C: ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5'], R: ['wpx-H1', 'wpx-H2', 'wc1-H1', 'wc1-H2'] };
const shape = (st) => { const f = st?.callFrames?.[0]; return !f ? 'no-stack' : f.url === '[native code]' ? `native-code:${f.functionName}` : f.url ? 'page-or-ext' : `empty-url:${f.functionName}`; };
const res = { depth: {}, sets: {} };
for (const [lab, names] of Object.entries(sets)) {
  const acc = { heavy: {}, ctrl: {}, Fh: 0, Fc: 0, writes: {}, fH: [], fC: [] };
  const bucket = (k) => (k === 'no-stack' ? 'no-stack' : k.startsWith('native-code:') ? 'dom-call' : 'other');
  for (const n of names) {
    const R = loadRun(dir, n), fr = R.frames;
    const tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8')), recs = [];
    const walk = (r) => {
      if (r.type === 'ScheduleStyleRecalculation' || r.type === 'InvalidateLayout') {
        recs.push({ t: r.startTime * 1000 - (tl.offsetMs || 0), st: r.stackTrace });
        const d = r.stackTrace?.callFrames ? `frames:${r.stackTrace.callFrames.length}` : 'no-stack';
        res.depth[d] = (res.depth[d] || 0) + 1;
      }
      for (const c of r.children || []) walk(c);
    };
    for (const r of tl.recs || []) walk(r);
    const fb = fr.map(() => ({}));
    for (const rec of recs) {
      if (stackKey(rec.st) !== 'native') continue;
      const i = fr.findIndex((q) => rec.t > q.t - q.dt && rec.t <= q.t); if (i < 0) continue;
      const k = shape(rec.st), b = bucket(k);
      fb[i][b] = (fb[i][b] || 0) + 1;
      if (fr[i].heavy) acc.heavy[k] = (acc.heavy[k] || 0) + 1;
      if (fr[i].ctrl) acc.ctrl[k] = (acc.ctrl[k] || 0) + 1;
    }
    fr.forEach((q, i) => { if (q.heavy) acc.fH.push(fb[i]); if (q.ctrl) acc.fC.push(fb[i]); });
    acc.Fh += fr.filter((q) => q.heavy).length; acc.Fc += fr.filter((q) => q.ctrl).length;
    if (lab !== 'C') continue;
    const g = JSON.parse(readFileSync(join(dir, `g-${n}.json`), 'utf8'));
    const inj = g.run.inject.map((x) => x.value).find((v) => v && v.wr), last = {};
    for (const [t, k, v, where] of inj.wr) {
      if (k !== 0) continue;
      const id = JSON.stringify(where), kind = last[id] === v ? 'sameValue' : 'valueChange'; last[id] = v;
      const within = recs.filter((r) => Math.abs(r.t - t) <= 2).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t));
      const w = (acc.writes[kind] ||= { n: 0, nearest: {}, setAttributeWithin2ms: 0 });
      w.n++;
      const s = within.length ? shape(within[0].st) : 'none';
      w.nearest[s] = (w.nearest[s] || 0) + 1;
      if (within.some((r) => r.st?.callFrames?.[0]?.functionName === 'setAttribute')) w.setAttributeWithin2ms++;
    }
  }
  const per = (o, F) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { n: v, perFrame: Math.round((v / F) * 100) / 100 }]));
  const rule5b = {};
  for (const b of ['dom-call', 'no-stack']) {
    const sum = (a) => a.reduce((m, x) => m + (x[b] || 0), 0), has = (a) => a.filter((x) => x[b]).length;
    rule5b[b] = { rate: rateRule(sum(acc.fH), acc.fH.length, sum(acc.fC), acc.fC.length, names.length), presence: coincidence(acc.fH.length, has(acc.fH), acc.fC.length ? has(acc.fC) / acc.fC.length : 0, names.length) };
  }
  res.sets[lab] = { heavyFrames: acc.Fh, controlFrames: acc.Fc, rule5b, heavy: per(acc.heavy, acc.Fh), control: per(acc.ctrl, acc.Fc), ...(lab === 'C' ? { fwWCWrites: acc.writes } : {}) };
}
console.log(JSON.stringify(res, null, 1));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(res, null, 1) + '\n');
