#!/usr/bin/env node
// v10 effect cross-check (int-v8): two em-px.mjs px.json files, X = (main 1b2eecc66011 -> v10 pre-nolift) and Y =
// (v9-final 647c9ef2b1e2 -> the measured build 4da641f828bb). The stack (F1+U2+P1) must do the same thing on both bases:
// per stop, whether it differs (consistent > 0) and the consistent amount and cluster boxes, side by side. A stop
// "matches" when both are 0, or both > 0 with amounts within 2x (noise) and the same largest-cluster box. Pixels only.
//   node fixes/v10/effectcmp.mjs <X px.json> <Y px.json>
import { readFileSync } from 'node:fs';
const [fx, fy] = process.argv.slice(2);
if (!fx || !fy) { console.error('usage: effectcmp.mjs <X px.json> <Y px.json>'); process.exit(2); }
const X = JSON.parse(readFileSync(fx, 'utf8')), Y = JSON.parse(readFileSync(fy, 'utf8'));
let mis = 0;
for (const sx of X.stops) {
  const sy = Y.stops.find((s) => s.k === sx.k);
  if (!sy || sx.void || sy.void) { console.log(`${sx.k}: VOID`); mis++; continue; }
  const a = sx.consistent.beyondAA, b = sy.consistent.beyondAA;
  const ba = sx.consistent.clusters[0]?.bboxCss, bb = sy.consistent.clusters[0]?.bboxCss;
  const same = (!a && !b) || (a && b && Math.max(a, b) <= 2 * Math.min(a, b) && JSON.stringify(ba) === JSON.stringify(bb));
  if (!same) mis++;
  console.log(`${sx.k.padEnd(7)} rev7d base ${String(a).padStart(7)} px ${JSON.stringify(ba || null).padEnd(20)} v9-final base ${String(b).padStart(7)} px ${JSON.stringify(bb || null).padEnd(20)} ${same ? 'match' : 'DIFFERENT'}`);
}
console.log(mis ? `EFFECT ${mis} stops differ` : `EFFECT MATCH: all ${X.stops.length} stops`);
