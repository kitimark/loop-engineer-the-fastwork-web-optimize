// g0-gpu: crop of two shots side by side plus their per-pixel difference x gain (for looking at a pixel gate's
// clusters). node fixes/g0-gpu/gates/diffpng.mjs <a.png> <b.png> <out.png> <x css> <y css> <w css> <h css> [gain 8] [dpr 3]
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const [a, b, out, x0, y0, w, h, gain = 8, dpr = 3] = process.argv.slice(2);
const A = pngPixels(readFileSync(a)), B = pngPixels(readFileSync(b)); const d = delta(A, B);
const X0 = Math.round(+x0 * dpr), Y0 = Math.round(+y0 * dpr), W = Math.round(+w * dpr), H = Math.round(+h * dpr);
const OW = W * 3, row = OW * 3 + 1, raw = Buffer.alloc(row * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = (Y0 + y) * A.w + X0 + x, o = y * row + 1;
  for (let c = 0; c < 3; c++) { raw[o + x * 3 + c] = A.px[p * 4 + c]; raw[o + (W + x) * 3 + c] = B.px[p * 4 + c]; raw[o + (2 * W + x) * 3 + c] = Math.min(255, d[p] * +gain); }
}
function crc32(buf) { let crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { let c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
const chunk = (t, dd) => { const l = Buffer.alloc(4); l.writeUInt32BE(dd.length); const td = Buffer.concat([Buffer.from(t), dd]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, cr]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(OW, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
