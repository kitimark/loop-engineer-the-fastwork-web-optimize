#!/usr/bin/env node
// reveal-paint: read rp-sim.mjs records. Per record: arm, drive / step, the flip, the flip frame (paint records with
// their clip boxes, Composite, Layout, style), and the layers that painted between census C0b and C1 (owner, paint
// count delta, memory before -> after). Counts only; Simulator ms are descriptive.
//   node fixes/reveal-paint/rp-read.mjs out/reveal-paint/s4/*.json [--all-layers] [--json]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2).filter((a) => a.endsWith('.json') && !basename(a).startsWith('serve-'));
const ALL = process.argv.includes('--all-layers'), JS = process.argv.includes('--json');
const box = (q) => { if (!Array.isArray(q) || q.length < 8) return null; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
  const x = Math.min(...xs), y = Math.min(...ys); return [Math.round(x), Math.round(y), Math.round(Math.max(...xs) - x), Math.round(Math.max(...ys) - y)]; };
const area = (b) => (b ? b[2] * b[3] : 0);
// layers outside #people that paint anyway while the page scrolls (nav, hero, countdown cells): listed apart
const OTHER = /top-nav|language-switch|hero|span\.cell|^span$|he-bob|scroll-cue|pain-sticky|orbit-card|script-accent/;
const out = [];
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const o = { file: basename(f), arm: r.arm, step: r.step || null, y: [r.y0, r.y1], flips: r.flips, pre: r.pre?.card, errors: r.errors };
  // the flip frame from the raw records: from the flip to the end of the first Composite after it
  if (r.raw && r.marks?.flip != null) {
    const comp = r.raw.filter((x) => x.type === 'Composite' && x.start >= 0).sort((a, b) => a.start - b.start)[0];
    const hi = comp ? comp.end : 50;
    const inF = r.raw.filter((x) => x.start >= 0 && x.start < hi);
    const paints = inF.filter((x) => x.type === 'Paint').map((x) => ({ box: box(x.data?.clip), ms: Math.round((x.end - x.start) * 10) / 10 }));
    o.flipFrame = { compMs: comp ? Math.round((comp.end - comp.start) * 10) / 10 : null, paints: paints.length, paintArea: paints.reduce((s, p) => s + area(p.box), 0), paintMs: Math.round(paints.reduce((s, p) => s + p.ms, 0) * 10) / 10,
      layouts: inF.filter((x) => x.type === 'Layout').length, styles: inF.filter((x) => x.type === 'RecalculateStyles').length, list: paints };
  } else o.flipFrame = r.frames?.error || null;
  const own = r.layers?.owners || {};
  const rows = (r.layers?.changed || []).map((l) => ({ id: l.id, sel: (own[l.id]?.sel || '?').slice(0, 48), d: l.d - l.art, isNew: l.isNew, mb0: Math.round(l.mem0 / 1e4) / 100, mb1: Math.round(l.mem / 1e4) / 100, b: l.b }));
  o.people = rows.filter((x) => !OTHER.test(x.sel) && (x.d > 0 || x.mb0 !== x.mb1 || x.isNew));
  o.other = rows.filter((x) => OTHER.test(x.sel) && x.d > 0).reduce((s, x) => s + x.d, 0);
  o.mem = [Math.round((r.layers?.mem0 || 0) / 1e5) / 10, Math.round((r.layers?.mem1 || 0) / 1e5) / 10];
  o.idle = r.idle;
  o.rows = (r.frames?.rows || []).filter((x) => x.rel === 0 || x.area > 50000 || x.paintMs >= 0.5).map((x) => `${x.rel}:${x.paints}p/${Math.round(x.area / 1000)}k/${x.paintMs}ms/c${x.compMs}`);
  out.push(o);
}
if (JS) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
for (const o of out) {
  console.log(`== ${o.file} ${o.arm} step ${JSON.stringify(o.step)} y ${o.y} flips ${JSON.stringify(o.flips)} card ${o.pre?.vis}/${o.pre?.op}/${o.pre?.wc} mem ${o.mem[0]} -> ${o.mem[1]} MB${o.errors?.length ? ' ERR ' + o.errors : ''}`);
  if (o.rows.length) console.log(`   frames around the flip (rel:paints/area kpx2/paint ms/composite ms, only area > 50k or paint >= 0.5 ms): ${o.rows.join('  ')}`);
  if (o.idle) console.log(`   idle 3 s at the start: paints ${o.idle.paints} area ${o.idle.area} layouts ${o.idle.layouts} styles ${o.idle.styles}`);
  if (o.flipFrame && typeof o.flipFrame === 'object') {
    const F = o.flipFrame;
    console.log(`   flip frame: paints ${F.paints} area ${F.paintArea} (paint ms ${F.paintMs}) composite ms ${F.compMs} layouts ${F.layouts} styles ${F.styles}`);
    for (const p of F.list) console.log(`     paint ${JSON.stringify(p.box)} ${p.ms} ms`);
  } else console.log(`   flip frame: ${JSON.stringify(o.flipFrame)}`);
  console.log(`   #people-side layers that painted or changed (C0b -> C1), other layers' paints ${o.other}:`);
  for (const x of o.people) console.log(`     ${x.sel} d ${x.d}${x.isNew ? ' NEW' : ''} ${x.mb0} -> ${x.mb1} MB ${JSON.stringify(x.b)}`);
}
