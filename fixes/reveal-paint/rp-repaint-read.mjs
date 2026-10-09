#!/usr/bin/env node
// reveal-paint: read rp-repaint.mjs records: per phase, the Timeline paints given to #people elements (count, area in
// CSS px^2), the #people mutations, and per layer the paint-count deltas between censuses (with owners). Counts only.
//   node fixes/reveal-paint/rp-repaint-read.mjs out/reveal-paint/r1/L.json [more.json]
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`== ${r.arm} served ${r.served?.js}/${r.served?.css} restY ${r.restY}${r.errors.length ? ' ERR ' + r.errors.join('; ') : ''}`);
  console.log(`   running animations in #people at rest: ${JSON.stringify(r.anims)}`);
  for (const [ph, v] of Object.entries(r.phases)) {
    console.log(`-- ${ph} (${v.ms} ms): paints ${v.paints}, layouts ${v.layouts}, img loads ${v.imgLoads}${v.repeats != null ? `, repeats ${v.repeats} ${JSON.stringify(v.repBy)}, rotated quads ${v.rotated}` : ''}`);
    for (const [k, x] of Object.entries(v.by).sort((a, b) => b[1].n - a[1].n)) if (k !== 'other') console.log(`     ${String(x.n).padStart(3)} paints ${String(x.area).padStart(8)} px2  ${k}`);
    console.log(`     outside #people: ${v.by.other?.n || 0} paints`);
    const mu = Object.entries(v.muts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (mu.length) console.log(`     mutations in #people: ${mu.map(([k, n]) => `${k} x${n}`).join(', ')}`);
  }
  console.log('-- layer paint deltas between censuses (start->rest->slow->top->fast; each segment includes one census):');
  for (const [id, d] of Object.entries(r.layerPaints)) {
    const o = r.owners[id] || {};
    if (!o.path || !/people|start-selling-future|profile/.test((o.path || '') + ' ' + (o.sel || ''))) continue;
    console.log(`     ${String(o.sel).slice(0, 50).padEnd(50)} ${JSON.stringify(d)}  wc ${o.style?.['will-change'] || '-'} fwwc ${o.data?.fwWc ?? '-'}`);
  }
}
