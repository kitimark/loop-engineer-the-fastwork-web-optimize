#!/usr/bin/env node
// Open-0 attribution (P-160, descriptive; no device, no measurement): for every counted run's open-0 frames (finger-down,
// m from <= 0 to > 0, as p160-read), the Timeline records overlapping the frame's gap, clipped, summed by type at every
// nesting level (so nested Layout inside FunctionCall counts in both), plus Layout's parent (inside a FunctionCall or at
// the top = the rendering step). Per arm: medians over all open-0 frames, and the frames split at dt > 34 ms.
// Uses the runs' own Timeline captures (tl-<run>.json), as fixes/end-morph-p1/phone/o1-attr.mjs (credited).
//   node fixes/compositor-morph/phone-c3/open0-attr.mjs out/cmp160/runs
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..', '..');
const tlr = JSON.parse; // eslint quiet
const dir = process.argv[2];
if (!dir) { console.log('usage: node fixes/compositor-morph/phone-c3/open0-attr.mjs <runs folder>'); process.exit(2); }
const mAt = (seg, i) => { const r = seg.frames[i]; const docH = seg.docH1 ?? seg.docH ?? 0; return (r[2] - (docH - 2 * r[3])) / r[3]; };
function downIntervals(seg) {
  const iv = []; let s = null;
  for (const r of seg.touches ?? []) { if (r[1] === 's' && s === null) s = r[0]; else if ((r[1] === 'e' || r[1] === 'c') && s !== null) { iv.push([s, r[0]]); s = null; } }
  if (s !== null) iv.push([s, Infinity]);
  return iv;
}
// flatten with the parent type kept (p129-read's flatten has no parent)
function flat(recs, off) {
  const out = [];
  const walk = (r, parent) => { const a = r.startTime * 1000 - off, b = (r.endTime ?? r.startTime) * 1000 - off; out.push({ type: r.type, a, b, parent, data: r.data || {} }); for (const c of r.children || []) walk(c, r.type); };
  for (const r of recs || []) walk(r, null);
  return out;
}
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => Math.round(x * 10) / 10;
const rows = { C: [], V: [] };
for (const arm of ['C', 'V']) for (let k = 1; k <= 5; k++) {
  const nm = `E${arm}${k}`, gf = join(dir, `g-${nm}.json`), tf = join(dir, `tl-${nm}.json`);
  if (!existsSync(gf) || !existsSync(tf)) continue;
  const g = tlr(readFileSync(gf, 'utf8')), tl = tlr(readFileSync(tf, 'utf8'));
  const seg = g.run.segments[0], fr = seg.frames, iv = downIntervals(seg), F = flat(tl.recs, tl.offsetMs);
  for (let i = 1; i < fr.length; i++) {
    if (fr[i][2] === fr[i - 1][2] || !(mAt(seg, i - 1) <= 0 && mAt(seg, i) > 0) || !iv.some(([a, b]) => fr[i][0] >= a && fr[i][0] <= b)) continue;
    const hi = fr[i][0], lo = hi - fr[i][1], by = {};
    for (const r of F) {
      if (r.b <= lo || r.a >= hi) continue;
      const d = Math.min(r.b, hi) - Math.max(r.a, lo);
      const key = r.type === 'Layout' || r.type === 'RecalculateStyles' ? `${r.type}${r.parent ? ' in ' + r.parent : ' (top)'}` : r.type;
      by[key] = (by[key] || 0) + d; by[r.type + ' (all)'] = (by[r.type + ' (all)'] || 0) + d;
    }
    rows[arm].push({ run: nm, dt: fr[i][1], by });
  }
}
const keys = [...new Set(Object.values(rows).flat().flatMap((r) => Object.keys(r.by)))].sort();
for (const [lab, f] of [['all open-0 frames', () => true], ['open-0 frames > 34 ms', (r) => r.dt > 34], ['open-0 frames <= 34 ms', (r) => r.dt <= 34]]) {
  const C = rows.C.filter(f), V = rows.V.filter(f);
  console.log(`== ${lab}: C n ${C.length} (dt median ${med(C.map((r) => r.dt))}), V n ${V.length} (dt median ${med(V.map((r) => r.dt))}); medians in ms`);
  for (const k of keys) { const c = med(C.map((r) => r.by[k] || 0)), v = med(V.map((r) => r.by[k] || 0)); if ((c ?? 0) >= 0.3 || (v ?? 0) >= 0.3) console.log(`  ${k.padEnd(40)} C ${r1(c ?? 0)}  V ${r1(v ?? 0)}`); }
}
