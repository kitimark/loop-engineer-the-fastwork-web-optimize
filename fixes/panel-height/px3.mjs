#!/usr/bin/env node
// panel-height: 3-load pixel scorer (A, V, A2 shots of em-p1-px.mjs or ph-sim.mjs), per stop: device px > 8 levels in
// A~V and in A~A2, and A~V beyond the A/A mask (A~V > 8 where A~A2 <= 8), with its max level and bounding box (css px,
// DPR 3). Decoder: fixes/v9-best/gates/pxlib.mjs (int-v8).
//   node fixes/panel-height/px3.mjs <dir with A-<stop>.png, V-<stop>.png, A2-<stop>.png>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const { pngPixels, delta } = await import(new URL('../v9-best/gates/pxlib.mjs', import.meta.url));
//   node fixes/panel-height/px3.mjs --files <A.png> <V.png> <A2.png> [label]   (one explicit triple; rows = css px)
const TOPI = process.argv.indexOf('--top'); const TOP = TOPI > 0 ? Number(process.argv.splice(TOPI, 2)[1]) : 0; // css px rows to skip (Simulator status bar: 59)
const FILES = process.argv[2] === '--files' ? process.argv.slice(3, 6) : null;
const D = FILES ? null : process.argv[2];
const stops = FILES ? [process.argv[6] || 'files'] : [...new Set(readdirSync(D).filter((f) => /^A-.*\.png$/.test(f)).map((f) => f.slice(2, -4)))];
for (const s of stops) {
  const f = (a) => { try { return pngPixels(readFileSync(FILES ? FILES[{ A: 0, V: 1, A2: 2 }[a]] : join(D, `${a}-${s}.png`))); } catch { return null; } };
  const A = f('A'), V = f('V'), A2 = f('A2');
  if (!A || !V || !A2) { console.log(s.padEnd(8), 'missing', !A ? 'A' : '', !V ? 'V' : '', !A2 ? 'A2' : ''); continue; }
  const av = delta(A, V), aa = delta(A, A2);
  let o = 0, oa = 0, beyond = 0, mx = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = TOP * 3 * A.w; i < av.length; i++) {
    if (av[i] > 8) o++; if (aa[i] > 8) oa++;
    if (av[i] > 8 && aa[i] <= 8) { beyond++; if (av[i] > mx) mx = av[i]; const x = i % A.w, y = (i / A.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const bb = beyond ? `box css [${(x0 / 3) | 0},${(y0 / 3) | 0}]-[${Math.ceil(x1 / 3)},${Math.ceil(y1 / 3)}]` : '';
  console.log(s.padEnd(8), `A~V >8: ${o} dev px | A~A2 >8: ${oa} | A~V beyond A/A: ${beyond} dev px = ${(beyond / 9).toFixed(0)} css px (max ${mx}) ${bb}`);
}
