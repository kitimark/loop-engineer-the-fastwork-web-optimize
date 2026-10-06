#!/usr/bin/env node
// v10 nolift region check (int-v8): reads an em-px.mjs px.json (A = v10 before nolift, V = v10 with nolift) and checks that
// every stop's consistent difference (A~V beyond A~A2 and A2~V2 beyond V~V2) lies inside the earn button's region: the
// union of the button's rects in the A and V loads at that stop (STATE.earn), grown by 28 CSS px (the 16 px scoring grid,
// plus the 10 px blur and the 8 px rise nolift removes). Pixels only, nothing timed.
//   node fixes/v10/nlregion.mjs <px.json> [--identical] [--top <css px>]   # --identical: no stop may differ at all (the Try-it check)
// --top: where the page starts in the shot. Chrome shots are the viewport (0, the default); em-px's Simulator shots are the
// whole screen and its scorer uses 0, so the button's viewport rects are moved down by the status bar first: 59 css px on the
// fw-sim 15 Pro Max, measured from the nolift pixels themselves (fixes/v10/simtop.mjs: top and bottom edges both 58.3-59.3).
// With --top, a cluster wholly above the page top (bboxCss bottom <= top) is the Simulator's status bar, not the page: it is
// listed as "status bar" and not judged. Its clock changes minute by minute, so loads from split sessions (px-split.sh,
// em-px --arms) differ there on identical bytes (nolift g4c, 2026-10-06: 47 px at every stop, loads 11:41Z-12:18Z).
// exit 0 pass, 1 fail, 2 usage
import { readFileSync } from 'node:fs';
const f = process.argv[2];
if (!f) { console.error('usage: nlregion.mjs <px.json> [--identical]'); process.exit(2); }
const IDENT = process.argv.includes('--identical');
const TOP = process.argv.includes('--top') ? Number(process.argv[process.argv.indexOf('--top') + 1]) : 0;
if (!Number.isFinite(TOP)) { console.error('--top <css px>'); process.exit(2); }
const R = JSON.parse(readFileSync(f, 'utf8'));
const G = 28;
const rectOf = (arm, k) => R.loads.find((l) => l.arm === arm)?.stops.find((s) => s.k === k)?.state?.earn || null;
let bad = 0, diffStops = 0;
for (const s of R.stops) {
  if (s.void) { console.log(`${s.k}: VOID ${s.void}`); bad++; continue; }
  const c = { ...s.consistent }; let n = c.beyondAA; let sb = '';
  if (TOP && n) {
    const bar = c.clusters.filter((x) => x.bboxCss[3] <= TOP);
    if (bar.length) {
      const bpx = bar.reduce((a, x) => a + x.px, 0);
      sb = ` [status bar, not judged: ${bpx} px ${JSON.stringify(bar.map((x) => x.bboxCss))}]`;
      c.clusters = c.clusters.filter((x) => x.bboxCss[3] > TOP); n = Math.max(0, n - bpx);
      if (!c.clusters.length && c.clusters.length + bar.length < 8) n = 0;
    }
  }
  if (!n) { console.log(`${s.k.padEnd(7)} identical in the page (consistent 0 px)${sb}`); continue; }
  diffStops++;
  if (IDENT) { console.log(`${s.k.padEnd(7)} DIFFERS: ${n} px, clusters ${JSON.stringify(c.clusters.map((x) => x.bboxCss))}${sb}`); bad++; continue; }
  const rs = ['A', 'V', 'A2', 'V2'].map((a) => rectOf(a, s.k)).filter(Boolean);
  if (!rs.length) { console.log(`${s.k.padEnd(7)} ${n} px but no earn rect: FAIL`); bad++; continue; }
  const u = [Math.min(...rs.map((r) => r[0])) - G, Math.min(...rs.map((r) => r[1])) - G + TOP, Math.max(...rs.map((r) => r[2])) + G, Math.max(...rs.map((r) => r[3])) + G + TOP];
  const out = c.clusters.filter((x) => x.bboxCss[0] < u[0] || x.bboxCss[1] < u[1] || x.bboxCss[2] > u[2] || x.bboxCss[3] > u[3]);
  const more = s.consistent.clusters.length >= 8; // pxlib keeps the 8 largest clusters only
  const ok = !out.length && !more;
  if (!ok) bad++;
  console.log(`${s.k.padEnd(7)} ${n} px in ${c.clusters.length} clusters, button region ${JSON.stringify(u)}: ${ok ? 'inside' : `OUTSIDE ${JSON.stringify(out.map((x) => [x.bboxCss, x.under]))}${more ? ' (8+ clusters: not all listed)' : ''}`}${sb}`);
}
if (TOP) console.log(`(button rects moved down ${TOP} css px: page top in the shot)`);
console.log(bad ? `NLREGION FAIL: ${bad} stops` : IDENT ? `NLREGION PASS: all ${R.stops.length} stops identical` : `NLREGION PASS: ${diffStops} of ${R.stops.length} stops differ, all inside the button region`);
process.exit(bad ? 1 : 0);
