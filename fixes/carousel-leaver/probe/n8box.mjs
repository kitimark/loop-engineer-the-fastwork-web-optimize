// carousel-leaver, post hoc: where are the n8 pixels of a crop pair? Prints the n8 bounding box (device px), the
// n8 count per 3-device-px column band (1 CSS px), and writes <out>.png: the crop pair side by side, n8 pixels red.
// node n8box.mjs a.png b.png [out.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
function dec(buf) {
  let o = 8, w, h, bpp; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), st = w * bpp, px = Buffer.alloc(h * st);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)];
    for (let x = 0; x < st; x++) { const a = x >= bpp ? px[y * st + x - bpp] : 0, b = y ? px[(y - 1) * st + x] : 0, c = x >= bpp && y ? px[(y - 1) * st + x - bpp] : 0;
      let v = raw[y * (st + 1) + 1 + x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * st + x] = v & 255; } }
  return { w, h, bpp, px };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return (b) => { let c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
function enc(w, h, px) {
  const chunk = (type, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(CRC(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1)); for (let y = 0; y < h; y++) px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const [fa, fb, out] = process.argv.slice(2);
const A = dec(readFileSync(fa)), B = dec(readFileSync(fb));
const W = A.w * 3, O = Buffer.alloc(W * A.h * 3); const box = [1e9, 1e9, -1, -1]; const cols = {}; let n8 = 0;
for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
  const i = (y * A.w + x) * A.bpp; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
  for (let c = 0; c < 3; c++) { O[(y * W + x) * 3 + c] = A.px[i + c]; O[(y * W + A.w + x) * 3 + c] = B.px[i + c]; O[(y * W + 2 * A.w + x) * 3 + c] = d > 8 ? [255, 0, 0][c] : 255 - Math.min(255, d * 20); }
  if (d > 8) { n8++; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); const k = Math.floor(x / 3); cols[k] = (cols[k] || 0) + 1; }
}
if (out) writeFileSync(out, enc(W, A.h, O));
console.log(JSON.stringify({ n8, box: n8 ? box : null, cssCols: Object.keys(cols).length ? `${Math.min(...Object.keys(cols).map(Number))}-${Math.max(...Object.keys(cols).map(Number))}` : null }));
