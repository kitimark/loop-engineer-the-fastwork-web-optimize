// carousel-leaver P-090 scorer: the five tier numbers of simquiet.mjs's quiet-rest crops (tier.mjs's metric, unchanged,
// on scrc-quiet / nat-quiet files instead of nat-<t>).
// node tierq.mjs <simquiet dir> <ref arm> <arm,arm,...> <aa arm> [scrc|nat, default scrc]
//   max    largest channel difference (0-255)
//   n8     pixels with any channel difference > 8; aa = the same for the A/A pair (ref~aa)
//   share  max(0, n8 - aa) / the viewport's device px (vw x vh x dpr^2, from geo2), in %
//   faces  n8 CSS px^2 per face (n8 / dpr^2); face k = floor((x - carLeft) / 24), 0..3
//   edge   share of n8 pixels within 1.5 CSS px of a face circle (centre carLeft + 24k + 16, carTop + 16, radius 16);
//          "edge" if >= 50 %, else "fill"
//   motion "static" (quiet rest)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngPixels } from './png.mjs';

const [dir, ref, armsArg, aa, kind = 'scrc'] = process.argv.slice(2);
const res = JSON.parse(readFileSync(join(dir, 'simquiet.json'), 'utf8'));
const px = (arm) => pngPixels(readFileSync(join(dir, `${kind}-quiet-${arm}.png`)));

function diff(a, b) {
  const A = px(a), B = px(b);
  if (A.w !== B.w || A.h !== B.h) throw new Error(`size differs: ${a} ${A.w}x${A.h} vs ${b} ${B.w}x${B.h}`);
  const out = []; let max = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const ia = (y * A.w + x) * A.bpp, ib = (y * B.w + x) * B.bpp; let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[ia + c] - B.px[ib + c]));
    if (d > max) max = d;
    if (d > 8) out.push([x, y]);
  }
  return { w: A.w, h: A.h, max, n8: out };
}

const g = res.arms[ref].geo2, rect = res.arms[ref].rect;
const daa = diff(aa, ref);
for (const arm of armsArg.split(',')) {
  const d = diff(arm, ref);
  const k = d.w / rect.width;
  const vp = g.vw * g.vh * k * k;
  const faces = [0, 0, 0, 0]; let edge = 0;
  for (const [x, y] of d.n8) {
    const cx = rect.x + (x + 0.5) / k, cy = rect.y + (y + 0.5) / k;
    faces[Math.max(0, Math.min(3, Math.floor((cx - g.carLeft) / 24)))]++;
    let near = false;
    for (let j = 0; j < 4; j++) if (Math.abs(Math.hypot(cx - (g.carLeft + 24 * j + 16), cy - (g.carTop + 16)) - 16) <= 1.5) near = true;
    if (near) edge++;
  }
  const n = d.n8.length;
  const share = (Math.max(0, n - daa.n8.length) / vp) * 100;
  console.log(`${kind} ${arm}~${ref}: max ${d.max} | n8 ${n} (aa ${ref}~${aa} ${daa.n8.length}, max ${daa.max}) | share ${share.toFixed(4)} % | CSS px2 per face ${faces.map((f) => (f / (k * k)).toFixed(1)).join('/')} | ${n ? (edge / n >= 0.5 ? 'edge' : 'fill') + ` (${Math.round((edge / Math.max(1, n)) * 100)} % edge)` : '-'} | static`);
}
