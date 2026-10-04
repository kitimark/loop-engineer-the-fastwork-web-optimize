// T2 five numbers for a pixels.mjs dir (C8 = A, V9 = B, C8-again = A2), per shot and summed by group.
// node fivenum.mjs <dir> <frameW> <frameH> <dpr> [json-out]
// beyond A/A: channel diff(B,A) > 8 where diff(A2,A) <= 8 (research/pixel-tolerance/README.md line 26).
// edge vs fill: a pixel is fill when A's 3x3 neighbourhood spans <= 8 levels in every channel, else edge.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
function png(buf) {
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
const [D, FW, FH, DPR, OUT] = process.argv.slice(2);
const frame = +FW * +FH * +DPR * +DPR;
const d3 = (p, q, i, bpp) => Math.max(Math.abs(p.px[i] - q.px[i]), Math.abs(p.px[i + 1] - q.px[i + 1]), Math.abs(p.px[i + 2] - q.px[i + 2]));
const rows = [];
for (const f of readdirSync(D).filter((f) => /^C8-hero-.*\.png$/.test(f))) {
  const tag = f.replace(/^C8-hero-/, '').replace(/\.png$/, '');
  let A, B, A2; try { A = png(readFileSync(join(D, f))); B = png(readFileSync(join(D, 'V9-hero-' + tag + '.png'))); A2 = png(readFileSync(join(D, 'C8-again-hero-' + tag + '.png'))); } catch { continue; }
  let maxAll = 0, maxAA = 0, beyond = 0, edgeMax = 0, fillMax = 0, fillOver64 = 0, edgeOver128 = 0, maxBeyond = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.bpp;
    const d = d3(B, A, i), da = d3(A2, A, i);
    if (da > maxAA) maxAA = da;
    if (!d) continue;
    if (d > maxAll) maxAll = d;
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let yy = Math.max(0, y - 1); yy <= Math.min(A.h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(A.w - 1, x + 1); xx++) {
      const j = (yy * A.w + xx) * A.bpp; for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], A.px[j + c]); hi[c] = Math.max(hi[c], A.px[j + c]); } }
    const fill = hi.every((h, c) => h - lo[c] <= 8);
    if (fill) { fillMax = Math.max(fillMax, d); if (d > 64) fillOver64++; } else { edgeMax = Math.max(edgeMax, d); if (d > 128) edgeOver128++; }
    if (d > 8 && da <= 8) { beyond++; if (d > maxBeyond) maxBeyond = d; }
  }
  const [hz, sc, fr] = tag.split('-');
  rows.push({ tag, hz: +hz, scen: +sc, frame: +fr.slice(1), maxAll, maxAA, maxBeyond, edgeMax, fillMax, fillOver64, edgeOver128, beyond, sharePct: +(100 * beyond / frame).toFixed(4), areaCss: +(beyond / (+DPR * +DPR)).toFixed(1) });
}
const sum = (rs) => ({ shots: rs.length, differ: rs.filter((r) => r.maxAll).length, beyondShots: rs.filter((r) => r.beyond).length,
  maxShade: Math.max(0, ...rs.map((r) => r.maxAll)), maxShadeBeyond: Math.max(0, ...rs.map((r) => r.maxBeyond)), maxAA: Math.max(0, ...rs.map((r) => r.maxAA)),
  edgeMax: Math.max(0, ...rs.map((r) => r.edgeMax)), fillMax: Math.max(0, ...rs.map((r) => r.fillMax)),
  shotsFillOver64: rs.filter((r) => r.fillOver64).length, shotsEdgeOver128: rs.filter((r) => r.edgeOver128).length,
  maxSharePct: Math.max(0, ...rs.map((r) => r.sharePct)), maxAreaCss: Math.max(0, ...rs.map((r) => r.areaCss)),
  rest: rs.filter((r) => r.frame === 0).map((r) => [r.tag, r.maxAll]).filter((x) => x[1]) });
const out = { dir: D, frameDevicePx: frame, dpr: +DPR, all: sum(rows), hz60: sum(rows.filter((r) => r.hz === 60)), hz120: sum(rows.filter((r) => r.hz === 120)), rows };
console.log(JSON.stringify({ all: out.all, hz60: out.hz60, hz120: out.hz120 }, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));
