#!/usr/bin/env node
// nav-fade: frozen-frame parity of motion.mjs --passes parity shots (PR-010 tolerance numbers, research/pixel-tolerance):
// X (control) vs Y (arm) per scenario and time, with the A-against-A pair X vs X2 (two loads of the control) as the
// noise mask. Per frame: largest shade (all pixels), pixels beyond A/A (> 8 levels where X vs X2 is <= 8), their share of
// the screen, CSS px area (device px / dpr^2), fill or edge (flat 3x3 neighbourhood in X), and the bounding box.
//   node fixes/nav-fade/probe/parity.mjs <out dir with png/> <X> <Y> <X2> [--dpr 3] [--region x0,y0,x1,y1 (device px; counts only there; T2 share stays of the screen, PR-010)]
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
const [dir, X, Y, X2] = process.argv.slice(2);
const RG = process.argv.includes('--region') ? process.argv[process.argv.indexOf('--region') + 1].split(',').map(Number) : null;
const dpr = +(process.argv.includes('--dpr') ? process.argv[process.argv.indexOf('--dpr') + 1] : 3);
function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
const J = JSON.parse(readFileSync(join(dir, 'motion.json'), 'utf8'));
const runOf = (n) => J.runs.find((r) => r.arm === n && r.pass === 'parity');
const rx = runOf(X), ry = runOf(Y), r2 = runOf(X2);
const tot = { frames: 0, worst: null };
for (const sc of Object.keys(rx.scen)) {
  const fr = rx.scen[sc].frames || [];
  console.log(`== ${sc}: ${X} vs ${Y} (A/A ${X} vs ${X2})`);
  for (const f of fr) {
    const fy = ry?.scen[sc]?.frames.find((q) => q.t === f.t), f2 = r2?.scen[sc]?.frames.find((q) => q.t === f.t);
    if (!fy || !f2 || !existsSync(f.png) || !existsSync(fy.png) || !existsSync(f2.png)) { console.log(`   t ${f.t}: missing`); continue; }
    const A = pngPixels(readFileSync(f.png)), B = pngPixels(readFileSync(fy.png)), C = pngPixels(readFileSync(f2.png));
    if (A.w !== B.w || A.h !== B.h || A.w !== C.w || A.h !== C.h) { console.log(`   t ${f.t}: size mismatch`); continue; }
    const W = A.w, H = A.h, bp = A.bpp;
    const d3 = (P, Q, i) => Math.max(Math.abs(P.px[i] - Q.px[i]), Math.abs(P.px[i + 1] - Q.px[i + 1]), Math.abs(P.px[i + 2] - Q.px[i + 2]));
    const flat = (a, b) => { for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const u = Math.min(W - 1, Math.max(0, a + dx)), v = Math.min(H - 1, Math.max(0, b + dy)); const k = (v * W + u) * bp + c; lo = Math.min(lo, A.px[k]); hi = Math.max(hi, A.px[k]); } if (hi - lo > 2) return false; } return true; };
    let max = 0, aaMax = 0, aaN = 0, beyond = 0, fl = 0, maxF = 0, maxE = 0; const bb = [1e9, 1e9, -1, -1];
    for (let p = 0, i = 0; p < W * H; p++, i += bp) {
      if (RG) { const a0 = p % W, b0 = (p / W) | 0; if (a0 < RG[0] || b0 < RG[1] || a0 > RG[2] || b0 > RG[3]) continue; }
      const d = d3(A, B, i), aa = d3(A, C, i); if (d > max) max = d; if (aa > aaMax) aaMax = aa; if (aa > 8) aaN++;
      if (d > 8 && aa <= 8) { beyond++; const a = p % W, b = (p / W) | 0; if (flat(a, b)) { fl++; maxF = Math.max(maxF, d); } else maxE = Math.max(maxE, d);
        bb[0] = Math.min(bb[0], a); bb[1] = Math.min(bb[1], b); bb[2] = Math.max(bb[2], a); bb[3] = Math.max(bb[3], b); }
    }
    const area = RG ? (Math.min(W - 1, RG[2]) - RG[0] + 1) * (Math.min(H - 1, RG[3]) - RG[1] + 1) : W * H; const rshare = (100 * beyond) / area; const share = (100 * beyond) / (W * H) /* PR-010: share of the screen */, css = beyond / (dpr * dpr);
    const t2 = maxF <= 64 && maxE <= 128 && share <= 0.5 && css <= 2000;
    tot.frames++; if (!tot.worst || beyond > tot.worst.beyond) tot.worst = { sc, t: f.t, beyond, share, css, maxF, maxE, max };
    console.log(`   t ${String(f.t).padStart(4)} op ${(+f.op).toFixed(2)}/${(+fy.op).toFixed(2)}: max ${max} (A/A max ${aaMax}, ${aaN} px) beyond ${beyond} px = ${share.toFixed(3)} % of screen${RG ? ` (${rshare.toFixed(2)} % of region)` : ''} = ${css.toFixed(0)} css px2; fill max ${maxF} edge max ${maxE}${beyond ? ` bbox ${bb.join(',')}` : ''}${beyond ? (t2 ? ' T2-ok' : ' OVER-T2') : ' T0/T1'}`);
  }
}
console.log('worst', JSON.stringify(tot.worst), 'frames', tot.frames);
