#!/usr/bin/env node
// v10 nolift region check (int-v8): reads an em-px.mjs px.json (A = v10 before nolift, V = v10 with nolift) and checks that
// every stop's consistent difference (A~V beyond A~A2 and A2~V2 beyond V~V2) lies inside the earn button's region: the
// union of the button's rects in the A and V loads at that stop (STATE.earn), grown by 28 CSS px (the 16 px scoring grid,
// plus the 10 px blur and the 8 px rise nolift removes). Pixels only, nothing timed.
//   node fixes/v10/nlregion.mjs <px.json> [--identical]   # --identical: no stop may differ at all (the Try-it check)
// exit 0 pass, 1 fail, 2 usage
import { readFileSync } from 'node:fs';
const f = process.argv[2];
if (!f) { console.error('usage: nlregion.mjs <px.json> [--identical]'); process.exit(2); }
const IDENT = process.argv.includes('--identical');
const R = JSON.parse(readFileSync(f, 'utf8'));
const G = 28;
const rectOf = (arm, k) => R.loads.find((l) => l.arm === arm)?.stops.find((s) => s.k === k)?.state?.earn || null;
let bad = 0, diffStops = 0;
for (const s of R.stops) {
  if (s.void) { console.log(`${s.k}: VOID ${s.void}`); bad++; continue; }
  const c = s.consistent; const n = c.beyondAA;
  if (!n) { console.log(`${s.k.padEnd(7)} identical (consistent 0 px)`); continue; }
  diffStops++;
  if (IDENT) { console.log(`${s.k.padEnd(7)} DIFFERS: ${n} px, clusters ${JSON.stringify(c.clusters.map((x) => x.bboxCss))}`); bad++; continue; }
  const rs = ['A', 'V', 'A2', 'V2'].map((a) => rectOf(a, s.k)).filter(Boolean);
  if (!rs.length) { console.log(`${s.k.padEnd(7)} ${n} px but no earn rect: FAIL`); bad++; continue; }
  const u = [Math.min(...rs.map((r) => r[0])) - G, Math.min(...rs.map((r) => r[1])) - G, Math.max(...rs.map((r) => r[2])) + G, Math.max(...rs.map((r) => r[3])) + G];
  const out = c.clusters.filter((x) => x.bboxCss[0] < u[0] || x.bboxCss[1] < u[1] || x.bboxCss[2] > u[2] || x.bboxCss[3] > u[3]);
  const more = c.clusters.length >= 8; // pxlib keeps the 8 largest clusters only
  const ok = !out.length && !more;
  if (!ok) bad++;
  console.log(`${s.k.padEnd(7)} ${n} px in ${c.clusters.length} clusters, button region ${JSON.stringify(u)}: ${ok ? 'inside' : `OUTSIDE ${JSON.stringify(out.map((x) => [x.bboxCss, x.under]))}${more ? ' (8+ clusters: not all listed)' : ''}`}`);
}
console.log(bad ? `NLREGION FAIL: ${bad} stops` : IDENT ? `NLREGION PASS: all ${R.stops.length} stops identical` : `NLREGION PASS: ${diffStops} of ${R.stops.length} stops differ, all inside the button region`);
process.exit(bad ? 1 : 0);
