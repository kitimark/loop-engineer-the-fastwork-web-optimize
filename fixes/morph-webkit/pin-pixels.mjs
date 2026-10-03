// Pin pixel compare for the F-165 attribution pair (fix-nav-morph): Simulator screenshots at the pin from
// pinhold-sim.mjs (two per arm, 1 s apart). Prints, per pair of PNGs, the share of differing pixels (any channel
// differs by more than --tol, default 8) and the bounding boxes of the differing regions (8-connected after a 4 px
// grid), so a countdown-phase change can be told apart from a visual change elsewhere.
//   node fixes/morph-webkit/pin-pixels.mjs <a.png> <b.png> [<c.png> <d.png> ...] [--tol 8]
// Pairs are taken in order (a,b), (c,d), ... No pixel data is written anywhere (counts and boxes only).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decodePng(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ': not a PNG');
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || il !== 0 || ![2, 6].includes(ct)) throw new Error(`${file}: unsupported PNG (bit depth ${bd}, color type ${ct}, interlace ${il})`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, up = y ? out[row - stride + x] : 0, c = y && x >= bpp ? out[row - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[row + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

const args = process.argv.slice(2);
const ti = args.indexOf('--tol'); const tol = ti >= 0 ? +args[ti + 1] : 8;
const files = args.filter((a, i) => !a.startsWith('--') && (ti < 0 || i !== ti + 1));
const G = 4;
for (let i = 0; i + 1 < files.length; i += 2) {
  const A = decodePng(files[i]), B = decodePng(files[i + 1]);
  const name = `${files[i].split('/').pop()} vs ${files[i + 1].split('/').pop()}`;
  if (A.w !== B.w || A.h !== B.h) { console.log(`${name}: size ${A.w}x${A.h} vs ${B.w}x${B.h}`); continue; }
  const gw = Math.ceil(A.w / G), gh = Math.ceil(A.h / G), grid = new Uint8Array(gw * gh); let n = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const ia = (y * A.w + x) * A.bpp, ib = (y * B.w + x) * B.bpp;
    if (Math.abs(A.px[ia] - B.px[ib]) > tol || Math.abs(A.px[ia + 1] - B.px[ib + 1]) > tol || Math.abs(A.px[ia + 2] - B.px[ib + 2]) > tol) { n++; grid[((y / G) | 0) * gw + ((x / G) | 0)] = 1; }
  }
  const seen = new Uint8Array(gw * gh), boxes = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cells = 0; const st = [s]; seen[s] = 1;
    while (st.length) {
      const q = st.pop(), qx = q % gw, qy = (q / gw) | 0; cells++;
      x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const r = ny * gw + nx; if (grid[r] && !seen[r]) { seen[r] = 1; st.push(r); }
      }
    }
    boxes.push({ x: x0 * G, y: y0 * G, w: (x1 - x0 + 1) * G, h: (y1 - y0 + 1) * G, cells });
  }
  boxes.sort((a, b) => b.cells - a.cells);
  console.log(`${name}: ${A.w}x${A.h}, differing ${n} px (${(100 * n / (A.w * A.h)).toFixed(3)} %), regions ${boxes.length}: ${boxes.slice(0, 8).map((b) => `${b.w}x${b.h}@${b.x},${b.y}`).join(' ')}`);
}
