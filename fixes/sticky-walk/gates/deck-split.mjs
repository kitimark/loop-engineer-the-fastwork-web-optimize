#!/usr/bin/env node
// sticky-walk deck look ruling (lead 2026-10-09, P-172 note): PR-010 fill / edge split of the Simulator deck differences,
// offline over deck-sim.mjs shot sets (no Simulator). Per step (A, V, A2, V2 = <arm>-<step>.png in one run dir):
// consistent pixels = over 8 levels in all four cross pairs (A~V, A~V2, A2~V, A2~V2) while neither A/A pair (A~A2, V~V2)
// is over 8 there (pxlib's rule); the status bar (screen y < 60 css px) is excluded. Each consistent pixel is FILL when
// the 3x3 luma range of A around it is <= 2 (pxlib's "flat"), else EDGE. Reported: fill n / max level, edge n / max
// level (min over the four cross pairs, the consistent level), css px2 and % of the screen; and, in the step's
// difference bbox, the A/A (A~A2, V~V2) max levels, to show where the A/A pairs differ too.
// PR-010 T2: fill max <= 64, edge max <= 128, consistent area <= 0.5 % of the screen.
//   node fixes/sticky-walk/gates/deck-split.mjs <run dir> [<run dir> ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pngPixels, delta } from '../../v9-best/gates/pxlib.mjs';

const DPR = 3, BAR = 60 * DPR;
const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('usage: deck-split.mjs <run dir> ...'); process.exit(1); }
let worst = { fill: 0, edge: 0, pct: 0 };
for (const dir of dirs) {
  const steps = [...new Set(readdirSync(dir).filter((f) => /^A-.*\.png$/.test(f)).map((f) => f.slice(2, -4)))];
  for (const st of steps) {
    const f = (a) => join(dir, `${a}-${st}.png`);
    if (!['A', 'V', 'A2', 'V2'].every((a) => existsSync(f(a)))) continue;
    const P = Object.fromEntries(['A', 'V', 'A2', 'V2'].map((a) => [a, pngPixels(readFileSync(f(a)))]));
    const dAV = delta(P.A, P.V), dAV2 = delta(P.A, P.V2), dA2V = delta(P.A2, P.V), dA2V2 = delta(P.A2, P.V2), dAA = delta(P.A, P.A2), dVV = delta(P.V, P.V2);
    const X = P.A, n = X.w * X.h;
    let fn = 0, fm = 0, en = 0, em = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let p = 0; p < n; p++) {
      const y = Math.floor(p / X.w); if (y < BAR) continue;
      const lv = Math.min(dAV[p], dAV2[p], dA2V[p], dA2V2[p]);
      if (lv <= 8 || Math.max(dAA[p], dVV[p]) > 8) continue;
      const x = p % X.w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      let lo = 255, hi = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(X.h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(X.w - 1, x + 1); xx++) {
        const i = (yy * X.w + xx) * X.bpp; const l = (X.px[i] + X.px[i + 1] + X.px[i + 2]) / 3; if (l < lo) lo = l; if (l > hi) hi = l; }
      if (hi - lo <= 2) { fn++; if (lv > fm) fm = lv; } else { en++; if (lv > em) em = lv; }
    }
    const tot = fn + en; if (!tot) { console.log(`${dir.split('/').pop()} ${st.padEnd(4)} consistent 0`); continue; }
    let aaM = 0, vvM = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = y * X.w + x; if (dAA[p] > aaM) aaM = dAA[p]; if (dVV[p] > vvM) vvM = dVV[p]; }
    const css = Math.round(tot / DPR / DPR), pct = +(100 * tot / n).toFixed(3);
    const t2 = fm <= 64 && em <= 128 && pct <= 0.5;
    worst = { fill: Math.max(worst.fill, fm), edge: Math.max(worst.edge, em), pct: Math.max(worst.pct, pct) };
    console.log(`${dir.split('/').pop()} ${st.padEnd(4)} consistent ${css} css px2 (${pct} %) | fill ${Math.round(fn / 9)} css px2 max ${fm} | edge ${Math.round(en / 9)} css px2 max ${em} | bbox css [${Math.round(x0 / 3)},${Math.round(y0 / 3)},${Math.round(x1 / 3)},${Math.round(y1 / 3)}] A/A max there A~A2 ${aaM} V~V2 ${vvM} | ${t2 ? 'T2' : 'BEYOND T2'}`);
  }
}
console.log(`WORST fill max ${worst.fill} (limit 64), edge max ${worst.edge} (limit 128), area ${worst.pct} % (limit 0.5)`);
