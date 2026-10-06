#!/usr/bin/env node
// v10 (int-v8): at em-px's "post" stop the page content under the nav sits a few device px higher or lower from load
// to load. This finds, for two loads' post shots, the vertical shift (device px, -8..8) that best aligns a band of
// the shot (default: screen device rows 300-560, columns 220-1080, the platform card under the nav), by the mean
// absolute channel difference. Pixels only, nothing run.
//   node fixes/v10/postshift.mjs <px dir> <arm X> <arm Y> [y0 y1 x0 x1]
import { readFileSync } from 'node:fs';
const { pngPixels } = await import(new URL('../v9-best/gates/pxlib.mjs', import.meta.url));
const [dir, a, b, y0 = 300, y1 = 560, x0 = 220, x1 = 1080] = process.argv.slice(2);
if (!dir || !a || !b) { console.error('usage: postshift.mjs <px dir> <arm X> <arm Y> [y0 y1 x0 x1]'); process.exit(2); }
const A = pngPixels(readFileSync(`${dir}/${a}-post.png`)), B = pngPixels(readFileSync(`${dir}/${b}-post.png`));
const out = [];
for (let s = -8; s <= 8; s++) {
  let sum = 0, n = 0;
  for (let y = +y0; y < +y1; y++) for (let x = +x0; x < +x1; x++) {
    const i = (y * A.w + x) * A.bpp, j = ((y + s) * B.w + x) * B.bpp;
    for (let c = 0; c < 3; c++) sum += Math.abs(A.px[i + c] - B.px[j + c]); n += 3;
  }
  out.push([s, +(sum / n).toFixed(3)]);
}
out.sort((p, q) => p[1] - q[1]);
console.log(`${a} vs ${b}: best shift ${out[0][0]} device px (mean diff ${out[0][1]}; at 0: ${out.find((p) => p[0] === 0)[1]})`);
