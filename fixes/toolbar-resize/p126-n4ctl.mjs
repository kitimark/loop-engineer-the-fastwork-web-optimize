#!/usr/bin/env node
// ops control for P-126 N4 (mgmt-ops-10, result read R1; copied here so the citation lasts, imports made relative):
// do same-value fwWC writes, and value changes shifted by +-25 ms, also find a record within 2 ms?
//   node fixes/toolbar-resize/p126-n4ctl.mjs out/toolbar-resize/sim125
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stackKey } from './read-inval126.mjs';
const dir = process.argv[2];
if (!dir) { console.error('usage: p126-n4ctl.mjs <folder>'); process.exit(1); }
const C = ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5'];
const res = {};
const add = (lab, hit, key) => { res[lab] ||= { n: 0, hit: 0, keys: {} }; res[lab].n++; if (hit) { res[lab].hit++; res[lab].keys[key] = (res[lab].keys[key] || 0) + 1; } };
for (const n of C) {
  const tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8')), recs = [];
  const walk = (r) => { if (r.type === 'ScheduleStyleRecalculation' || r.type === 'InvalidateLayout') recs.push([r.startTime * 1000 - (tl.offsetMs || 0), stackKey(r.stackTrace)]); for (const c of r.children || []) walk(c); };
  for (const r of tl.recs || []) walk(r);
  const g = JSON.parse(readFileSync(join(dir, `g-${n}.json`), 'utf8'));
  const inj = g.run.inject.map((x) => x.value).find((v) => v && v.wr), last = {};
  const near = (t) => recs.filter(([rt]) => Math.abs(rt - t) <= 2).sort((a, b) => Math.abs(a[0] - t) - Math.abs(b[0] - t))[0];
  for (const [t, k, v, where] of inj.wr) {
    if (k !== 0) continue;
    const id = JSON.stringify(where), same = last[id] === v; last[id] = v;
    const lab = same ? 'sameValue' : 'valueChange';
    let m = near(t); add(lab, !!m, m && m[1]);
    for (const d of [-25, 25]) { m = near(t + d); add(`${lab}${d > 0 ? '+' : ''}${d}ms`, !!m, m && m[1]); }
  }
}
for (const [k, v] of Object.entries(res)) console.log(k, `${v.hit}/${v.n}`, JSON.stringify(v.keys));
