#!/usr/bin/env node
// Per spot, every pair of loads of one or more px-chrome runs: max level and pixels > 8 inside the spot box (CSS px,
// DPR 3). Shows whether a spot's difference follows the arm (bytes / behaviour) or the load (phase).
//   node fixes/nav-hit-cache/v93/spotpairs.mjs <px dir>[,<px dir>...]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pngPixels } from '../../v9-best/gates/pxlib.mjs';
const SPOTS = { 2120: [64, 0, 176, 16], 6278: [224, 608, 320, 656] };
const dirs = process.argv[2].split(',');
for (const [y, [x0, y0, x1, y1]] of Object.entries(SPOTS)) {
  const shots = [];
  for (const [di, d] of dirs.entries()) {
    const px = JSON.parse(readFileSync(join(d, 'px.json'), 'utf8'));
    for (const l of px.loads) { const f = join(d, `${l.arm}-y${y}.png`); if (existsSync(f)) shots.push({ tag: `r${di}.${l.arm}:${l.build}`, p: pngPixels(readFileSync(f)) }); }
  }
  console.log(`\ny ${y} box css ${x0},${y0}-${x1},${y1}`);
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) {
    const A = shots[i].p, B = shots[j].p; let m = 0, o = 0;
    for (let yy = y0 * 3; yy < y1 * 3; yy++) for (let xx = x0 * 3; xx < x1 * 3; xx++) {
      const a = (yy * A.w + xx) * A.bpp, b = (yy * B.w + xx) * B.bpp; let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[a + c] - B.px[b + c]));
      if (d > m) m = d; if (d > 8) o++;
    }
    console.log(`  ${shots[i].tag.padEnd(10)} ~ ${shots[j].tag.padEnd(10)} max ${String(m).padStart(3)} over8 ${o}`);
  }
}
