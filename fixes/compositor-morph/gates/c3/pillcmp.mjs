// Compare the nav pill band of two Simulator shots (rows y0..y1 in shot px, full width): counts of px with max channel
// delta > 24 / 64 / 128, max level, and a stacked crop PNG (A, B, |A-B| x4) for viewing.
//   node out/cm/pillcmp.mjs <a.png> <b.png> <y0> <y1> <out.png>
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const [a, b, y0s, y1s, out, x0s, x1s] = process.argv.slice(2); const X0 = +(x0s || 0), X1 = +(x1s || 1e9);
const A = pngPixels(readFileSync(a)), B = pngPixels(readFileSync(b)), y0 = +y0s, y1 = +y1s, W = A.w, H = y1 - y0;
let n = 0, c24 = 0, c64 = 0, c128 = 0, mx = 0;
const img = Buffer.alloc(W * H * 3 * 3);
for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * A.bpp; let d = 0;
  for (let c = 0; c < 3; c++) {
    const dc = Math.abs(A.px[i + c] - B.px[i + c]); d = Math.max(d, dc);
    img[((y - y0) * W + x) * 3 + c] = A.px[i + c];
    img[((y - y0 + H) * W + x) * 3 + c] = B.px[i + c];
    img[((y - y0 + 2 * H) * W + x) * 3 + c] = Math.min(255, dc * 4);
  }
  if (x < X0 || x >= X1) continue; n++; if (d > 24) c24++; if (d > 64) c64++; if (d > 128) c128++; if (d > mx) mx = d;
}
console.log(`band ${W}x${H}: >24 ${c24} (${(100 * c24 / n).toFixed(2)} %), >64 ${c64} (${(100 * c64 / n).toFixed(2)} %), >128 ${c128} (${(100 * c128 / n).toFixed(2)} %), max ${mx}`);
if (out) {
  const raw = Buffer.alloc((W * 3 + 1) * H * 3);
  for (let y = 0; y < H * 3; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const crc = (buf) => { let c = ~0; for (const v of buf) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H * 3, 4); ih[8] = 8; ih[9] = 2;
  writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
