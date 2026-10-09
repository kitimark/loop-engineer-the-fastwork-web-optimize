#!/usr/bin/env node
// reveal-paint: from an rp-repaint.mjs record, one phase (default fast) as a timeline: the #people mutations (carousel
// left out) and, per 50 ms bucket, the paints whose box falls on the deck (shells, their images, the record), the card or
// the title (the fixed nav and the viewport-sized fixed layers are left out). Counts only.
//   node fixes/reveal-paint/rp-waves.mjs out/reveal-paint/r2/L.json [fast|slow|rest]
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ph = process.argv[3] || 'fast';
const mk = Object.fromEntries(r.marks.map((m) => [m[1], m[0]]));
const muts = r.mut.filter((m) => m[0] >= mk[ph] && m[0] < mk[ph + ':end'] && !/avatar|st5|is-carousel/.test(m[1] + m[3]))
  .map((m) => [Math.round(m[0] - mk[ph]), `${m[1].slice(0, 40)} ${m[2]}=${String(m[3]).slice(-30)}`]);
console.log(`== ${r.arm} ${ph}: mutations ${JSON.stringify(muts)}`);
const B = {};
for (const x of r.phases[ph].raw) {
  const [t, ms, box, rot, el] = x;
  if (!/@shell|cover|record|shell #|future-card|title/.test(el) && !(rot && el === 'other')) continue;
  if (box && box[2] === 430 && box[3] >= 775 && box[3] <= 776) continue; // viewport-sized fixed layers
  if (box && box[3] === 52) continue; // the fixed nav
  const k = Math.floor(t / 50) * 50; const b = (B[k] ||= { n: 0, area: 0, ms: 0, els: new Set() });
  b.n++; b.area += box ? box[2] * box[3] : 0; b.ms += ms; b.els.add(el.replace(/ avatar\.jpg|\.jpg/g, '').slice(0, 34) + (rot ? '(rot)' : ''));
}
for (const [k, v] of Object.entries(B)) console.log(`${String(k).padStart(5)} n ${String(v.n).padStart(3)} area ${String(v.area).padStart(8)} ms ${v.ms.toFixed(2)}  ${[...v.els].join(', ')}`);
