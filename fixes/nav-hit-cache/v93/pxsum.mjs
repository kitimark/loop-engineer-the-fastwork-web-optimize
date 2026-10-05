#!/usr/bin/env node
// Compact record of px-chrome / px-sim runs (scores and served hashes; no screenshots, no hit grids), for the README.
//   node fixes/nav-hit-cache/v93/pxsum.mjs <out json> <label>=<px dir> ...
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [out, ...runs] = process.argv.slice(2);
const res = {};
for (const r of runs) {
  const [label, dir] = r.split('=');
  const j = JSON.parse(readFileSync(join(dir, 'px.json'), 'utf8'));
  const sc = (x) => x && { maxLevel: x.maxLevel, beyondCssPx2: x.beyondCssPx2, flatShare: x.flatShare, clusters: (x.clusters || []).map((c) => ({ cssPx2: c.cssPx2, maxLevel: c.maxLevel, bboxCss: c.bboxCss, under: c.under })) };
  res[label] = { tool: j.tool, dirs: j.dirs, startedAt: j.startedAt, endedAt: j.endedAt, ys: j.ys,
    loads: j.loads.map((l) => ({ arm: l.arm, build: l.build, served: l.served, errors: l.errors.length, void: l.void })),
    stops: j.stops.map((s) => ({ y: s.y, void: s.void, AV: sc(s.AV), A2V2: sc(s.A2V2), consistent: sc(s.consistent), AA: s.AA, VV: s.VV })) };
}
writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
console.log('wrote', out);
