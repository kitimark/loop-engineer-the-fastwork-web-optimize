// carousel-leaver P-087: PNG helpers shared by pord.mjs and simcrop.mjs (the same decoder, encoder and pair metric as
// clp.mjs, which stays unchanged as registered for P-086). cmp: per pair, pixels with any channel difference > 8 (n8),
// > 0 (any), the max difference, the bounding box of differing pixels and a blank flag (red range < 16).
import { readFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
export function pngPixels(buf) {
  let o = 8, w, h, bpp; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; if (d[8] !== 8 || (d[9] !== 6 && d[9] !== 2) || d[12]) throw new Error(`png: unsupported depth ${d[8]} type ${d[9]} interlace ${d[12]}`); } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return (b) => { let c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
export function pngEncode(w, h, bpp, px) {
  const chunk = (type, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(CRC(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = bpp === 4 ? 6 : 2;
  const raw = Buffer.alloc(h * (w * bpp + 1)); for (let y = 0; y < h; y++) px.copy(raw, y * (w * bpp + 1) + 1, y * w * bpp, (y + 1) * w * bpp);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// crop a decoded image to [x0, y0, x1, y1) device px; throws VOID when the crop leaves the image
export function crop(P, x0, y0, x1, y1, what) {
  if (x0 < 0 || y0 < 0 || x1 > P.w || y1 > P.h) throw new Error(`VOID: ${what} crop ${[x0, y0, x1, y1]} outside the ${P.w}x${P.h} capture (carousel not in view)`);
  const w = x1 - x0, h = y1 - y0, out = Buffer.alloc(w * h * P.bpp);
  for (let y = 0; y < h; y++) P.px.copy(out, y * w * P.bpp, ((y0 + y) * P.w + x0) * P.bpp, ((y0 + y) * P.w + x1) * P.bpp);
  let lo = 255, hi = 0; for (let i = 0; i < out.length; i += P.bpp) { lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  return { w, h, bpp: P.bpp, px: out, blank: hi - lo < 16 };
}
export function cmp(fa, fb) {
  const A = pngPixels(readFileSync(fa)), B = pngPixels(readFileSync(fb)); if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let any = 0, n8 = 0, max = 0, lo = 255, hi = 0; const box = [1e9, 1e9, -1, -1];
  for (let i = 0, j = 0, p = 0; i < A.px.length; i += A.bpp, j += B.bpp, p++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[j + c]));
    lo = Math.min(lo, A.px[i]); hi = Math.max(hi, A.px[i]);
    if (d > 0) { any++; if (d > 8) n8++; if (d > max) max = d; const y = Math.floor(p / A.w), x = p % A.w; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); } }
  return { w: A.w, h: A.h, any, n8, max, box: any ? box : null, blank: hi - lo < 16 };
}
