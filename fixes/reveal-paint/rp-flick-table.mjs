#!/usr/bin/env node
// reveal-paint: the g0.0l vs g0.0m Simulator flick table from rp-sim.mjs records (RP_DRIVE flick). Per record: the flip
// frame (rel 0: paint rects, paint area kpx2, paint ms, composite ms), the 10 frames before it and the 10 after it
// (paint area and paint ms summed, the largest composite), layer memory before the flick (C0b) and after (C1). Per arm:
// medians. A record without a flip is listed as void. Counts and areas are the verdict; Simulator ms are descriptive.
//   node fixes/reveal-paint/rp-flick-table.mjs out/reveal-paint/s{6,7,8,9,10}/*.json
import { readFileSync } from 'node:fs';
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const rows = [];
for (const f of process.argv.slice(2).filter((a) => a.endsWith('.json') && !/serve-/.test(a))) {
  const r = JSON.parse(readFileSync(f, 'utf8')); if (r.tool && !/rp-sim/.test(r.tool)) continue;
  const id = f.split('/').slice(-2).join('/');
  const fr = r.frames?.rows;
  if (!r.flips?.length || !Array.isArray(fr)) { rows.push({ id, arm: r.arm, void: 'no flip in the window' }); continue; }
  const z = fr.find((x) => x.rel === 0) || {};
  const sum = (lo, hi, k) => fr.filter((x) => x.rel >= lo && x.rel <= hi).reduce((s, x) => s + (x[k] || 0), 0);
  const mx = (lo, hi, k) => Math.max(0, ...fr.filter((x) => x.rel >= lo && x.rel <= hi).map((x) => x[k] || 0));
  rows.push({ id, arm: r.arm, flipY: r.flips[0][2], p0: z.paints, a0: Math.round((z.area || 0) / 1000), pm0: r1(z.paintMs), c0: r1(z.compMs),
    aPre: Math.round(sum(-10, -1, 'area') / 1000), pmPre: r1(sum(-10, -1, 'paintMs')), cPre: r1(mx(-10, -1, 'compMs')),
    aPost: Math.round(sum(1, 10, 'area') / 1000), pmPost: r1(sum(1, 10, 'paintMs')), cPost: r1(mx(1, 10, 'compMs')),
    mem0: r1((r.layers?.mem0 || 0) / 1e6), mem1: r1((r.layers?.mem1 || 0) / 1e6) });
}
const K = ['p0', 'a0', 'pm0', 'c0', 'aPre', 'pmPre', 'cPre', 'aPost', 'pmPost', 'cPost', 'mem0', 'mem1'];
console.log(['record', 'arm', 'flipY', 'flip rects', 'flip kpx2', 'flip paint ms', 'flip comp ms', '-10..-1 kpx2', 'paint ms', 'max comp', '+1..+10 kpx2', 'paint ms', 'max comp', 'MB before', 'MB after'].join(' | '));
for (const x of rows) console.log(x.void ? `${x.id} | ${x.arm} | VOID: ${x.void}` : [x.id, x.arm, x.flipY, ...K.map((k) => x[k])].join(' | '));
for (const arm of [...new Set(rows.map((x) => x.arm))]) {
  const R = rows.filter((x) => x.arm === arm && !x.void);
  console.log(`median ${arm} (n ${R.length}) | ${K.map((k) => `${k} ${med(R.map((x) => x[k]))}`).join('  ')}`);
}
