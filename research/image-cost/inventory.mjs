// image-cost: turn a simprobe census (WebKit, Simulator, 430x775 CSS px, DPR 3) into the per-image inventory.
// Usage: node research/image-cost/inventory.mjs out/image-cost/sim/census-<stamp>.json [--json out.json]
// File sizes come from the frozen baseline mirror (site/); intrinsic sizes from the decoded <img> (naturalWidth/Height).
// Ratios: r3 = natural / needed at DPR 3, r2 = natural / needed at DPR 2, on the axis that needs the most pixels
// (object-fit aware: cover = max of the two axis scales, contain = min). Decoded bytes = w x h x 4 (RGBA).
import { readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTree } from '../../tools/lib/paths.mjs';
const SITE = resolveTree('site');
const r = JSON.parse(readFileSync(process.argv[2], 'utf8')).census;
const jsonOut = process.argv.indexOf('--json') > 0 ? process.argv[process.argv.indexOf('--json') + 1] : null;
const by = new Map();
const path = (u) => { try { return new URL(u).pathname; } catch { return u; } };
for (const x of r.imgs) {
  const p = path(x.src || ''); if (!p) continue;
  let a = by.get(p);
  if (!a) by.set(p, a = { p, inst: 0, seenInst: 0, nat: x.nat, box: [0, 0], sbox: [0, 0], fit: new Set(), loading: new Set(), decoding: new Set(), where: new Set(), inView: false, anim: new Set(), moving: new Set(), opMin: 1, picture: false, firstY: null, maxScale: 1 });
  a.inst++; a.picture ||= !!x.source; a.loading.add(String(x.loading)); a.decoding.add(String(x.decoding));
  if (x.unseen) { a.where.add(x.where); continue; }
  a.seenInst++; a.nat = x.nat; a.fit.add(x.fit); a.where.add(x.where); a.maxScale = Math.max(a.maxScale, x.maxScale || 1);
  if (x.maxScaledBox[0] * x.maxScaledBox[1] > a.sbox[0] * a.sbox[1]) a.sbox = x.maxScaledBox;
  if (x.maxBox[0] * x.maxBox[1] > a.box[0] * a.box[1]) a.box = x.maxBox;
  if (x.inViewY.length) { a.inView = true; a.firstY = Math.min(a.firstY ?? 1e9, x.inViewY[0]); }
  x.animProps.forEach((q) => a.anim.add(q)); x.movingAncestors.forEach((q) => a.moving.add(q)); a.opMin = Math.min(a.opMin, x.opacityMin);
}
const out = [];
for (const a of by.values()) {
  const f = join(SITE, a.p); let bytes = null;
  if (existsSync(f)) bytes = statSync(f).size;
  const fmt = a.p.split('.').pop();
  const [nw, nh] = a.nat; const [bw, bh] = a.sbox;
  let s = null;
  if (nw && nh && bw && bh) { const fit = [...a.fit][0]; const sx = bw / nw, sy = bh / nh; s = fit === 'contain' ? Math.min(sx, sy) : fit === 'none' ? 1 : Math.max(sx, sy); }
  const r3 = s ? 1 / (s * 3) : null, r2 = s ? 1 / (s * 2) : null;
  const dec = (k) => (s ? Math.min(1, s * k) ** 2 * nw * nh * 4 / 1048576 : null);
  out.push({ p: a.p, fmt, bytes, nat: a.nat, box: a.box, sbox: a.sbox, maxScale: +a.maxScale.toFixed(3), fit: [...a.fit].join('/'), r3: r3 && +r3.toFixed(2), r2: r2 && +r2.toFixed(2),
    decMB: nw ? +(nw * nh * 4 / 1048576).toFixed(2) : 0, dec3MB: s ? +dec(3).toFixed(2) : null, dec2MB: s ? +dec(2).toFixed(2) : null,
    large: nw * nh * 4 > 500 * 1024, inst: a.inst, seenInst: a.seenInst, inView: a.inView, firstY: a.firstY, loading: [...a.loading].join('/'), decoding: [...a.decoding].join('/'), picture: a.picture,
    anim: [...a.anim].join(','), moving: [...a.moving].join(','), opMin: +a.opMin.toFixed(2), where: [...a.where].slice(0, 2).join(' | ') });
}
out.sort((x, y) => ((y.decMB - (y.dec2MB ?? y.decMB)) - (x.decMB - (x.dec2MB ?? x.decMB))));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ from: process.argv[2], docH: r.docH, vh: r.vh, vw: r.vw, dpr: r.dpr, steps: r.steps, bgs: r.bgs, images: out }, null, 1));
console.log(`docH ${r.docH} vh ${r.vh} vw ${r.vw} dpr ${r.dpr} steps ${r.steps}; <img> ${r.imgs.length}, unique URLs ${out.length}; CSS url() images ${r.bgs.length}`);
console.log('path | fmt | bytes | natural | box (CSS, scaled) | fit | r3 | r2 | decMB | dec3MB | dec2MB | large | inst/seen | inView@y | loading | decoding | picture | anim | moving | opMin | where');
for (const x of out) console.log([x.p.replace('/selling/', ''), x.fmt, x.bytes, x.nat.join('x'), x.sbox.join('x'), x.fit, x.r3, x.r2, x.decMB, x.dec3MB, x.dec2MB, x.large ? 'L' : 's', x.inst + '/' + x.seenInst, x.inView ? 'V' + x.firstY : '-', x.loading, x.decoding, x.picture ? 'pic' : '', x.anim, x.moving, x.opMin, x.where].join(' | '));
for (const b of r.bgs) console.log('bg', b.prop, b.url.replace(/^https?:\/\/[^/]+/, ''), b.box.join('x'), b.size, b.where);
