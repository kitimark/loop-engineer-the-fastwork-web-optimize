#!/usr/bin/env node
// v10 (int-v8): where the page starts in a Simulator screenshot. em-px's Simulator shots are the whole screen (status
// bar included) and its scorer uses top = 0, so cluster boxes are in screen CSS px while STATE.earn is in viewport px.
// This reads the A and V shots of the given stops (the nolift pair: the earn button rises in A only), finds the exact
// pixel box where A and V differ by > 8 levels while A and A2 do not, and compares it with the button's rects:
//   top edge offset    = diff top    - (min rect top    - pad)
//   bottom edge offset = diff bottom - (max rect bottom + pad)
// pad = 0 and 10 (the 10 px blur nolift also removes) are both printed. Pixels only, nothing run.
//   node fixes/v10/simtop.mjs <px dir> <stop> [<stop> ...]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const { pngPixels } = await import(new URL('../v9-best/gates/pxlib.mjs', import.meta.url));
const [dir, ...stops] = process.argv.slice(2);
if (!dir || !stops.length) { console.error('usage: simtop.mjs <px dir> <stop>...'); process.exit(2); }
const R = JSON.parse(readFileSync(join(dir, 'px.json'), 'utf8'));
const rect = (arm, k) => R.loads.find((l) => l.arm === arm)?.stops.find((s) => s.k === k)?.state?.earn;
for (const k of stops) {
  const img = (a) => pngPixels(readFileSync(join(dir, `${a}-${k}.png`)));
  const A = img('A'), V = img('V'), A2 = img('A2');
  const dpr = A.w / 430;
  const d = (X, Y, i) => Math.max(Math.abs(X.px[i] - Y.px[i]), Math.abs(X.px[i + 1] - Y.px[i + 1]), Math.abs(X.px[i + 2] - Y.px[i + 2]));
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.bpp;
    if (d(A, V, i) > 8 && d(A, A2, i) <= 8) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (!n) { console.log(`${k}: no A~V pixels beyond A~A2`); continue; }
  const box = [x0, y0, x1 + 1, y1 + 1].map((v) => +(v / dpr).toFixed(1));
  const rs = ['A', 'V'].map((a) => rect(a, k)).filter(Boolean);
  const top = Math.min(...rs.map((r) => r[1])), bot = Math.max(...rs.map((r) => r[3]));
  const f = (pad) => `top ${(box[1] - (top - pad)).toFixed(1)}, bottom ${(box[3] - (bot + pad)).toFixed(1)}`;
  console.log(`${k}: ${n} px beyond A/A, screen box css ${JSON.stringify(box)}; button rects A ${JSON.stringify(rect('A', k))} V ${JSON.stringify(rect('V', k))}; offset pad 0: ${f(0)}; pad 10: ${f(10)}`);
}
