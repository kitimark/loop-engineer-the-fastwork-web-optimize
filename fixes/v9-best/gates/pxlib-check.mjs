#!/usr/bin/env node
// Self-check for pxlib.mjs's PNG decoder and scorer (int-v8, 2026-10-06; F-314: an RGBA shot against an RGB shot was compared
// as misaligned bytes). Builds one synthetic image, encodes it as RGB and as RGBA PNGs (every row filter 0-4, so the
// filters' bpp offsets are exercised at both 3 and 4 bytes per pixel), and checks:
//   1. both decode to the exact source pixels, as RGBA (bpp 4);
//   2. delta(RGB, RGBA) and delta(RGBA, RGB) are 0 everywhere, also with non-opaque pixels (alpha is not compared);
//   3. scoreStop on A = RGB, V = RGBA, A2 = RGBA, V2 = RGB of the same image scores 0 everywhere (A~V, A2~V2, consistent, A/A);
//   4. a real 24x24 change in V is still found (A~V beyond A/A > 0) when the formats are mixed;
//   5. a palette PNG and a size mismatch are refused with an error.
// Pixels only, nothing run. Writes its PNGs to <dir> (default out/pxlib-check, gitignored).
//   node fixes/v9-best/gates/pxlib-check.mjs [dir]      exit 0 all pass, 1 a check failed
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { pngPixels, delta, scoreStop } from './pxlib.mjs';

const dir = process.argv[2] || 'out/pxlib-check';
mkdirSync(dir, { recursive: true });
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
/** rgba: Buffer w*h*4; colourType 2 (RGB, alpha dropped) or 6 (RGBA); row y uses filter y % 5 */
function encode(rgba, w, h, colourType, bitDepth = 8) {
  const bpp = colourType === 6 ? 4 : 3, stride = w * bpp, src = Buffer.alloc(h * stride);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < bpp; c++) src[p * bpp + c] = rgba[p * 4 + c];
  const out = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { const f = y % 5; out[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) { const v = src[y * stride + x], a = x >= bpp ? src[y * stride + x - bpp] : 0, b = y ? src[(y - 1) * stride + x] : 0, c = x >= bpp && y ? src[(y - 1) * stride + x - bpp] : 0;
      let pr = 0; if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * (stride + 1) + 1 + x] = (v - pr) & 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = bitDepth; ihdr[9] = colourType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out)), chunk('IEND', Buffer.alloc(0))]);
}
const W = 97, H = 61; // odd sizes; 2 css px cells at dpr 3 and more
const img = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
  img[i] = (x * 7 + y * 3) & 255; img[i + 1] = (x * x + y * 11) & 255; img[i + 2] = ((x ^ y) * 5) & 255; img[i + 3] = 255; }
const imgA = Buffer.from(img); for (const [x, y] of [[0, 0], [1, 0], [0, 1], [W - 1, H - 1], [W - 2, H - 1]]) imgA[(y * W + x) * 4 + 3] = 128; // Chrome-like corner pixels
const changed = Buffer.from(imgA); for (let y = 20; y < 44; y++) for (let x = 30; x < 54; x++) { const i = (y * W + x) * 4; changed[i] = 255 - changed[i]; }

let fail = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) fail++; };
const f = (name, buf) => { const p = join(dir, name); writeFileSync(p, buf); return p; };
const rgbF = f('rgb.png', encode(img, W, H, 2)), rgbaF = f('rgba.png', encode(imgA, W, H, 6)), chgF = f('rgba-changed.png', encode(changed, W, H, 6));
const R = pngPixels(encode(img, W, H, 2)), A = pngPixels(encode(imgA, W, H, 6));
ok(R.bpp === 4 && R.srcBpp === 3 && A.bpp === 4 && A.srcBpp === 4, 'RGB and RGBA files both decode to bpp 4 (srcBpp 3 / 4)');
ok(R.px.equals(img), 'RGB file decodes to the exact source pixels, alpha 255 (row filters 0-4)');
ok(A.px.equals(imgA), 'RGBA file decodes to the exact source pixels (row filters 0-4)');
ok(delta(R, A).every((v) => v === 0) && delta(A, R).every((v) => v === 0), 'delta RGB~RGBA and RGBA~RGB of the same image: 0 everywhere');
const s = scoreStop({ A: rgbF, V: rgbaF, A2: rgbaF, V2: rgbF }, { V: [], V2: [] }, 3);
ok(s.AV.anyPx === 0 && s.A2V2.anyPx === 0 && s.consistent.anyPx === 0 && s.AA.maxLevel === 0 && s.VV.maxLevel === 0, `scoreStop A=RGB V=RGBA A2=RGBA V2=RGB, same image: all 0 (AV ${s.AV.anyPx}, A2V2 ${s.A2V2.anyPx}, consistent ${s.consistent.anyPx}, A/A ${s.AA.maxLevel}, V/V ${s.VV.maxLevel})`);
const s2 = scoreStop({ A: rgbF, V: chgF, A2: rgbaF, V2: chgF }, { V: [], V2: [] }, 3);
ok(s2.AV.beyondAA === 24 * 24 - [...Array(24 * 24).keys()].filter((k) => { const x = 30 + (k % 24), y = 20 + Math.floor(k / 24); return Math.abs(255 - 2 * img[(y * W + x) * 4]) <= 8; }).length && s2.consistent.beyondAA === s2.AV.beyondAA,
  `a real 24x24 change in V is found with mixed formats (A~V beyond A/A ${s2.AV.beyondAA} px, consistent ${s2.consistent.beyondAA})`);
let threw = '';
try { pngPixels(encode(img, W, H, 3)); } catch (e) { threw = e.message; }
ok(/colour type 3/.test(threw), `a palette PNG is refused (${threw || 'no error'})`);
threw = '';
try { delta(R, pngPixels(encode(img.subarray(0, W * (H - 1) * 4), W, H - 1, 2))); } catch (e) { threw = e.message; }
ok(/sizes differ/.test(threw), `a size mismatch is refused (${threw || 'no error'})`);
console.log(fail ? `PXLIB-CHECK FAIL: ${fail}` : 'PXLIB-CHECK PASS');
process.exit(fail ? 1 : 0);
