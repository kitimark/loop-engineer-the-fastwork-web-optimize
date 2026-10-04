#!/usr/bin/env node
// PR-018: find "returns": the page leaves the extra screen (p < -0.15) and later, with no finger down, scrolls back to
// the open end (p >= 0.98). Prints each with its lowest p and the time from the lowest point to open.
//   node fixes/morph-scroll/finger-returns.mjs <capture.json>...
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8')), fr = r.frames, tc = r.touches;
  const lvh = Math.max(...fr.map((x) => x[3]));
  const pOf = (x) => (x[2] - (r.docH - x[3] - lvh)) / lvh;
  const downs = []; let s = null;
  for (const t of tc) { if (t[1] === 's' && s == null) s = t[0]; if ((t[1] === 'e' || t[1] === 'c') && t[2] === 0 && s != null) { downs.push([s, t[0]]); s = null; } }
  const fingerIn = (a, b) => downs.some(([x, y]) => x <= b && y >= a);
  let n = 0, out = 0, low = null;
  for (const x of fr) {
    const p = pOf(x);
    if (p < -0.15) { if (!low || p < low.p) low = { t: x[0], p }; continue; }
    if (low && p >= 0.98) {
      if (!fingerIn(low.t, x[0])) { n++; console.log(`  ${r.label}: left to p ${low.p.toFixed(2)}, back at open ${x[0] - low.t} ms later, no finger down`); }
      low = null;
    }
    if (low && p > -0.15 && p < 0.98 && fingerIn(low.t, x[0])) low = null;
  }
  for (let i = 1; i < fr.length; i++) if (pOf(fr[i]) < -0.15 && pOf(fr[i - 1]) >= -0.15) out++;
  console.log(`${r.label}: left the extra screen ${out} times; returned to open with no finger ${n}`);
}
